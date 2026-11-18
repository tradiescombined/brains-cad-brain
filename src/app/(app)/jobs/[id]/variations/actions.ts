"use server";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, getDefaultTaxRate, logActivity, nextNumber } from "@/lib/settings";
import {
  cleanVariationLines, contractDeltaForVariation, parseInvoiceLines, parseVariationLines, variationTotals,
  VARIATION_STATUSES, type VariationStatus,
} from "@/lib/money-docs";
import type { FormState } from "../../../orders/actions";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function revalidateVariation(jobId: string, id?: string) {
  revalidatePath(`/jobs/${jobId}`, "layout");
  revalidatePath(`/jobs/${jobId}/variations`);
  revalidatePath(`/jobs/${jobId}/invoices`);
  if (id) revalidatePath(`/jobs/${jobId}/variations/${id}`);
}

async function getVariation(id: string) {
  const [v] = await db.select().from(schema.variations).where(eq(schema.variations.id, id));
  return v;
}

/** True if a non-void invoice includes this variation. */
async function isInvoiced(jobId: string, variationId: string) {
  const invs = await db.select({ status: schema.invoices.status, lines: schema.invoices.lines }).from(schema.invoices).where(eq(schema.invoices.jobId, jobId));
  return invs.some((i) => i.status !== "Void" && parseInvoiceLines(i.lines).some((l) => l.variationId === variationId));
}

async function adjustContract(jobId: string, delta: number) {
  if (!delta) return;
  await db.update(schema.jobs).set({ contractValue: sql`round(${schema.jobs.contractValue} + ${delta}, 2)` }).where(eq(schema.jobs.id, jobId));
}

export async function createVariation(_: FormState, f: FormData): Promise<FormState> {
  const jobId = s(f, "jobId");
  const title = s(f, "title");
  if (!title) return { error: "Give the variation a short title." };
  const [job] = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) return { error: "Job not found." };
  const settings = await getSettings();
  const number = await nextNumber("Variation");
  const [v] = await db.insert(schema.variations).values({ jobId, number, title, markupPercent: settings.defaultMarkupPercent }).returning();
  await logActivity("job", jobId, "variation_created", `Variation ${number} "${title}" created`);
  revalidateVariation(jobId);
  redirect(`/jobs/${jobId}/variations/${v.id}`);
}

export async function saveVariation(_: FormState, f: FormData): Promise<FormState> {
  const v = await getVariation(s(f, "id"));
  if (!v) return { error: "Variation not found." };
  if (v.status === "Approved") return { error: "Approved variations are locked. Move it back to Sent to edit." };
  const title = s(f, "title");
  if (!title) return { error: "Title is required." };
  const markupPercent = parseFloat(s(f, "markupPercent") || "0");
  if (!Number.isFinite(markupPercent) || markupPercent < -100 || markupPercent > 1000) return { error: "Markup must be a percentage between -100 and 1000." };
  const lines = cleanVariationLines(parseVariationLines(s(f, "lines")));
  const tax = await getDefaultTaxRate();
  const t = variationTotals(lines, markupPercent, tax.rate);
  await db
    .update(schema.variations)
    .set({ title, description: s(f, "description") || null, markupPercent, lines: JSON.stringify(lines), costTotal: t.cost, taxTotal: t.tax, total: t.total })
    .where(eq(schema.variations.id, v.id));
  revalidateVariation(v.jobId, v.id);
  return { ok: true, message: "Variation saved" };
}

export async function setVariationStatus(_: FormState, f: FormData): Promise<FormState> {
  const v = await getVariation(s(f, "id"));
  const to = s(f, "status") as VariationStatus;
  if (!v || !VARIATION_STATUSES.includes(to)) return { error: "Invalid status." };
  if (v.status === to) return null;
  if (to === "Approved" && parseVariationLines(v.lines).length === 0) return { error: "Add at least one line before approving." };
  if (v.status === "Approved" && (await isInvoiced(v.jobId, v.id))) return { error: "This variation has been invoiced. Void that invoice before changing the approval." };
  const delta = contractDeltaForVariation(v.status, to, v.total);
  await db
    .update(schema.variations)
    .set({ status: to, approvedAt: to === "Approved" ? new Date().toISOString() : null })
    .where(eq(schema.variations.id, v.id));
  await adjustContract(v.jobId, delta);
  await logActivity("job", v.jobId, "variation_status", `Variation ${v.number} ${to.toLowerCase()}${delta ? ` (contract ${delta > 0 ? "+" : ""}${delta.toFixed(2)})` : ""}`);
  revalidateVariation(v.jobId, v.id);
  return { ok: true, message: `Marked ${to}` };
}

export async function deleteVariation(f: FormData) {
  const v = await getVariation(s(f, "id"));
  if (!v) return;
  if (v.status === "Approved") {
    if (await isInvoiced(v.jobId, v.id)) return;
    await adjustContract(v.jobId, -v.total);
  }
  await db.delete(schema.variations).where(eq(schema.variations.id, v.id));
  await logActivity("job", v.jobId, "variation_deleted", `Variation ${v.number} deleted`);
  revalidateVariation(v.jobId);
  redirect(`/jobs/${v.jobId}/variations`);
}
