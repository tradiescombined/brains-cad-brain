"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDefaultTaxRate, getSettings, logActivity, nextNumber } from "@/lib/settings";
import { addDays, todayIso } from "@/lib/format";
import {
  cleanInvoiceLines, exTax, invoiceTotals, parseInvoiceLines, percentOfContractExTax, progressClaim, round2, statusFromPayments,
  INVOICE_KINDS, PAYMENT_METHODS, type InvoiceKind, type InvoiceLine,
} from "@/lib/money-docs";
import { getJobContract } from "../orders/_shared/data";
import type { FormState } from "../orders/actions";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const pct = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

function revalidateInvoice(id: string, jobId: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath(`/jobs/${jobId}/invoices`);
  revalidatePath(`/jobs/${jobId}`, "layout");
}

async function getInvoice(id: string) {
  const [i] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  return i;
}

/** Re-derives amountPaid + status from the payments table. */
async function syncPayments(invoiceId: string) {
  const inv = await getInvoice(invoiceId);
  if (!inv) return;
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, invoiceId));
  const paid = round2(pays.reduce((a, p) => a + p.amount, 0));
  const status = statusFromPayments(inv.status, inv.total, paid);
  await db.update(schema.invoices).set({ amountPaid: paid, status }).where(eq(schema.invoices.id, invoiceId));
}

export async function createInvoice(_: FormState, f: FormData): Promise<FormState> {
  const jobId = s(f, "jobId");
  const kind = s(f, "kind") as InvoiceKind;
  if (!INVOICE_KINDS.includes(kind)) return { error: "Choose an invoice type." };
  const c = await getJobContract(jobId);
  if (!c) return { error: "Job not found." };
  const issueDate = s(f, "issueDate") || todayIso();
  if (!isDate(issueDate)) return { error: "Issue date is not valid." };
  const tax = await getDefaultTaxRate();
  const { summary } = c;
  let lines: InvoiceLine[] = [];
  let claimPercent: number | null = null;

  if (kind === "Deposit") {
    const p = pct(s(f, "percent"));
    if (!(p > 0 && p <= 100)) return { error: "Deposit must be between 0 and 100% of the contract." };
    if (summary.base <= 0) return { error: "This job has no contract value to take a deposit against." };
    claimPercent = p;
    lines = [{ description: `Deposit — ${p}% of contract price`, amount: percentOfContractExTax(summary.base, p, tax.rate), taxable: true }];
  } else if (kind === "Progress claim") {
    if (s(f, "mode") === "lines") {
      lines = [{ description: "Progress claim", amount: 0, taxable: true }];
    } else {
      const p = pct(s(f, "cumulativePercent"));
      if (!(p > 0 && p <= 100)) return { error: "Enter the cumulative % complete (1–100)." };
      if (summary.base <= 0) return { error: "This job has no contract value to claim against." };
      const pc = progressClaim({ contractValue: summary.base, previouslyClaimed: summary.contractClaims, cumulativePercent: p });
      if (pc.amount <= 0) return { error: `Already claimed ${pc.previousPercent}% — the cumulative % must be higher than that.` };
      claimPercent = pc.cumulativePercent;
      lines = [{ description: `Progress claim — ${pc.cumulativePercent}% complete (this claim ${pc.thisPercent}%, previously claimed ${pc.previousPercent}%)`, amount: exTax(pc.amount, tax.rate), taxable: true }];
    }
  } else if (kind === "Variation") {
    const ids = f.getAll("variationId").map(String);
    const picked = c.variations.filter((v) => ids.includes(v.id) && v.status === "Approved" && !c.invoicedVariationIds.has(v.id));
    if (!picked.length) return { error: "Pick at least one approved variation that hasn't been invoiced." };
    lines = picked.map((v) => ({ description: `Variation ${v.number} — ${v.title}`, amount: round2(v.total - v.taxTotal), taxable: v.taxTotal !== 0, variationId: v.id }));
  } else if (kind === "Final") {
    if (summary.remaining <= 0) return { error: "Nothing left to invoice on this contract." };
    lines = [{ description: "Final claim — balance of contract", amount: exTax(summary.remaining, tax.rate), taxable: true }];
  } else {
    lines = [{ description: "", amount: 0, taxable: true }];
  }

  const settings = await getSettings();
  const [client] = c.job.clientId ? await db.select().from(schema.clients).where(eq(schema.clients.id, c.job.clientId)) : [];
  const dueDays = client?.defaultInvoiceDays ?? settings.defaultInvoiceDueDays;
  const t = invoiceTotals(lines, tax.rate);
  const number = await nextNumber("Invoice");
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      jobId, number, kind, status: "Draft", issueDate, dueDate: addDays(issueDate, dueDays),
      lines: JSON.stringify(lines), claimPercent, subtotal: t.subtotal, taxTotal: t.tax, total: t.total,
    })
    .returning();
  await logActivity("job", jobId, "invoice_created", `${kind} invoice ${number} created`);
  revalidateInvoice(inv.id, jobId);
  redirect(`/invoices/${inv.id}`);
}

export async function saveInvoice(_: FormState, f: FormData): Promise<FormState> {
  const inv = await getInvoice(s(f, "id"));
  if (!inv) return { error: "Invoice not found." };
  if (inv.status === "Void") return { error: "Void invoices can't be edited." };
  const issueDate = s(f, "issueDate");
  const dueDate = s(f, "dueDate");
  if (!isDate(issueDate)) return { error: "Issue date is required." };
  if (dueDate && !isDate(dueDate)) return { error: "Due date is not valid." };
  if (dueDate && dueDate < issueDate) return { error: "Due date can't be before the issue date." };
  const lines = cleanInvoiceLines(parseInvoiceLines(s(f, "lines")));
  if (!lines.length) return { error: "Add at least one line with an amount." };
  const tax = await getDefaultTaxRate();
  const t = invoiceTotals(lines, tax.rate);
  if (t.total < inv.amountPaid - 0.004) return { error: `Total can't be less than the ${inv.amountPaid.toFixed(2)} already paid.` };
  await db
    .update(schema.invoices)
    .set({ issueDate, dueDate: dueDate || null, notes: s(f, "notes") || null, lines: JSON.stringify(lines), subtotal: t.subtotal, taxTotal: t.tax, total: t.total })
    .where(eq(schema.invoices.id, inv.id));
  await syncPayments(inv.id);
  revalidateInvoice(inv.id, inv.jobId);
  return { ok: true, message: "Invoice saved" };
}

export async function setInvoiceStatus(f: FormData) {
  const inv = await getInvoice(s(f, "id"));
  const action = s(f, "action");
  if (!inv) return;
  if (action === "send" && inv.status === "Draft") {
    await db.update(schema.invoices).set({ status: "Sent" }).where(eq(schema.invoices.id, inv.id));
    await syncPayments(inv.id);
  } else if (action === "draft" && inv.status === "Sent" && inv.amountPaid === 0) {
    await db.update(schema.invoices).set({ status: "Draft" }).where(eq(schema.invoices.id, inv.id));
  } else if (action === "void" && inv.status !== "Void") {
    await db.update(schema.invoices).set({ status: "Void" }).where(eq(schema.invoices.id, inv.id));
  } else if (action === "unvoid" && inv.status === "Void") {
    await db.update(schema.invoices).set({ status: "Sent" }).where(eq(schema.invoices.id, inv.id));
    await syncPayments(inv.id);
  } else return;
  await logActivity("job", inv.jobId, "invoice_status", `Invoice ${inv.number}: ${action}`);
  revalidateInvoice(inv.id, inv.jobId);
}

export async function addPayment(_: FormState, f: FormData): Promise<FormState> {
  const inv = await getInvoice(s(f, "invoiceId"));
  if (!inv) return { error: "Invoice not found." };
  if (inv.status === "Void") return { error: "Can't record payments on a void invoice." };
  const date = s(f, "date");
  if (!isDate(date)) return { error: "Payment date is required." };
  const amount = round2(parseFloat(s(f, "amount")));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a payment amount greater than zero." };
  const balance = round2(inv.total - inv.amountPaid);
  if (amount > balance + 0.004) return { error: `Payment is more than the balance due (${balance.toFixed(2)}).` };
  const method = (PAYMENT_METHODS as readonly string[]).includes(s(f, "method")) ? s(f, "method") : "Other";
  await db.insert(schema.payments).values({ invoiceId: inv.id, date, amount, method, reference: s(f, "reference") || null });
  await syncPayments(inv.id);
  await logActivity("job", inv.jobId, "payment", `Payment of ${amount.toFixed(2)} recorded on ${inv.number}`);
  revalidateInvoice(inv.id, inv.jobId);
  return { ok: true, message: "Payment recorded" };
}

export async function deletePayment(f: FormData) {
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, s(f, "id")));
  if (!p) return;
  await db.delete(schema.payments).where(eq(schema.payments.id, p.id));
  await syncPayments(p.invoiceId);
  const inv = await getInvoice(p.invoiceId);
  if (inv) revalidateInvoice(inv.id, inv.jobId);
}

export async function deleteInvoice(f: FormData) {
  const inv = await getInvoice(s(f, "id"));
  if (!inv) redirect("/invoices");
  await db.delete(schema.payments).where(eq(schema.payments.invoiceId, inv.id));
  await db.delete(schema.invoices).where(eq(schema.invoices.id, inv.id));
  await logActivity("job", inv.jobId, "invoice_deleted", `Invoice ${inv.number} deleted`);
  revalidateInvoice(inv.id, inv.jobId);
  redirect(`/jobs/${inv.jobId}/invoices`);
}
