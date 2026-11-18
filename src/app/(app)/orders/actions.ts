"use server";
import { denied, requirePermission } from "@/lib/permissions";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nextNumber, logActivity } from "@/lib/settings";
import { todayIso } from "@/lib/format";
import {
  canBillPo, cleanPoLines, dominantCostType, groupBudgetPicksBySupplier, parsePoLines, poNextStatuses, poTotals, round2,
  PO_STATUSES, type BudgetPick, type PoLine, type PoStatus,
} from "@/lib/money-docs";
import { getExpenseTaxRate, jobSite } from "./_shared/data";

export type FormState = { ok?: boolean; error?: string; message?: string } | null;

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function revalidateOrder(id: string, jobId: string | null) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  if (jobId) {
    revalidatePath(`/jobs/${jobId}/orders`);
    revalidatePath(`/jobs/${jobId}`, "layout");
  }
}

async function getOrder(id: string) {
  const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
  return po;
}

async function insertOrder(jobId: string, supplierId: string | null, lines: PoLine[]) {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) throw new Error("Job not found");
  const tax = await getExpenseTaxRate();
  const t = poTotals(lines, tax.rate);
  const number = await nextNumber("Order");
  const [po] = await db
    .insert(schema.purchaseOrders)
    .values({
      jobId, supplierId, number, status: "Draft", orderDate: todayIso(), deliveryAddress: jobSite(job) || null,
      lines: JSON.stringify(lines), subtotal: t.subtotal, taxTotal: t.tax, total: t.total,
    })
    .returning();
  await logActivity("job", jobId, "order_created", `Purchase order ${number} created`);
  return po;
}

/** Creates a blank draft PO for a job and opens the editor. */
export async function createOrder(_: FormState, f: FormData): Promise<FormState> {
  const denial = await denied("orders.edit");
  if (denial) return { error: denial };
  const jobId = s(f, "jobId");
  if (!jobId) return { error: "Choose a job for this order." };
  const supplierId = s(f, "supplierId") || null;
  const po = await insertOrder(jobId, supplierId, []);
  revalidateOrder(po.id, jobId);
  redirect(`/orders/${po.id}`);
}

export async function saveOrder(_: FormState, f: FormData): Promise<FormState> {
  const denial = await denied("orders.edit");
  if (denial) return { error: denial };
  const id = s(f, "id");
  const po = await getOrder(id);
  if (!po) return { error: "Order not found." };
  if (po.status === "Billed") return { error: "This order has been billed. Undo the bill to make changes." };
  const orderDate = s(f, "orderDate");
  const deliveryDate = s(f, "deliveryDate");
  if (!isDate(orderDate)) return { error: "Order date is required." };
  if (deliveryDate && !isDate(deliveryDate)) return { error: "Delivery date is not a valid date." };
  if (deliveryDate && deliveryDate < orderDate) return { error: "Delivery date can't be before the order date." };
  let raw: PoLine[];
  try {
    raw = parsePoLines(s(f, "lines"));
  } catch {
    return { error: "Couldn't read the order lines." };
  }
  const lines = cleanPoLines(raw);
  if (lines.some((l) => l.quantity < 0 || l.unitCost < 0)) return { error: "Quantities and unit costs can't be negative." };
  const tax = await getExpenseTaxRate();
  const t = poTotals(lines, tax.rate);
  await db
    .update(schema.purchaseOrders)
    .set({
      supplierId: s(f, "supplierId") || null,
      orderDate,
      deliveryDate: deliveryDate || null,
      deliveryAddress: s(f, "deliveryAddress") || null,
      deliveryInstructions: s(f, "deliveryInstructions") || null,
      lines: JSON.stringify(lines),
      subtotal: t.subtotal,
      taxTotal: t.tax,
      total: t.total,
    })
    .where(eq(schema.purchaseOrders.id, id));
  revalidateOrder(id, po.jobId);
  return { ok: true, message: `Saved · ${lines.length} line${lines.length === 1 ? "" : "s"}` };
}

export async function setOrderStatus(f: FormData) {
  await requirePermission("orders.edit");
  const id = s(f, "id");
  const to = s(f, "status") as PoStatus;
  const po = await getOrder(id);
  if (!po || !PO_STATUSES.includes(to)) return;
  if (!poNextStatuses(po.status).includes(to)) return;
  await db.update(schema.purchaseOrders).set({ status: to }).where(eq(schema.purchaseOrders.id, id));
  if (po.jobId) await logActivity("job", po.jobId, "order_status", `Purchase order ${po.number} marked ${to}`);
  revalidateOrder(id, po.jobId);
}

/** Records the supplier bill as an actual cost on the job and marks the PO Billed. */
export async function recordBill(_: FormState, f: FormData): Promise<FormState> {
  const denial = await denied("orders.edit");
  if (denial) return { error: denial };
  const id = s(f, "id");
  const po = await getOrder(id);
  if (!po) return { error: "Order not found." };
  if (!po.jobId) return { error: "Link this order to a job before recording a bill." };
  if (!canBillPo(po.status)) return { error: `A ${po.status.toLowerCase()} order can't be billed.` };
  const date = s(f, "date");
  if (!isDate(date)) return { error: "Bill date is required." };
  const amount = round2(parseFloat(s(f, "amount")));
  const tax = round2(parseFloat(s(f, "tax") || "0"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the bill amount (ex tax)." };
  if (!Number.isFinite(tax) || tax < 0) return { error: "Tax can't be negative." };
  const lines = parsePoLines(po.lines);
  const budgetIds = [...new Set(lines.map((l) => l.budgetLineId).filter(Boolean))];
  const supplier = po.supplierId ? (await db.select().from(schema.contacts).where(eq(schema.contacts.id, po.supplierId)))[0] : undefined;
  await db.insert(schema.actualCosts).values({
    jobId: po.jobId,
    purchaseOrderId: po.id,
    supplierId: po.supplierId,
    budgetLineId: budgetIds.length === 1 ? budgetIds[0] : null,
    date,
    reference: s(f, "reference") || po.number,
    description: `${po.number}${supplier ? ` · ${supplier.businessName || supplier.name}` : ""}${lines[0] ? ` · ${lines[0].description}${lines.length > 1 ? ` +${lines.length - 1} more` : ""}` : ""}`,
    costType: dominantCostType(lines),
    amount,
    tax,
  });
  await db.update(schema.purchaseOrders).set({ status: "Billed" }).where(eq(schema.purchaseOrders.id, id));
  await logActivity("job", po.jobId, "order_billed", `Bill recorded for ${po.number}`);
  revalidateOrder(id, po.jobId);
  revalidatePath(`/jobs/${po.jobId}/costs`);
  return { ok: true, message: "Bill recorded" };
}

/** Reverses a recorded bill: removes the actual cost(s) and returns the PO to Delivered. */
export async function undoBill(f: FormData) {
  await requirePermission("orders.edit");
  const id = s(f, "id");
  const po = await getOrder(id);
  if (!po || po.status !== "Billed") return;
  await db.delete(schema.actualCosts).where(eq(schema.actualCosts.purchaseOrderId, id));
  await db.update(schema.purchaseOrders).set({ status: "Delivered" }).where(eq(schema.purchaseOrders.id, id));
  revalidateOrder(id, po.jobId);
  if (po.jobId) revalidatePath(`/jobs/${po.jobId}/costs`);
}

export async function deleteOrder(f: FormData) {
  await requirePermission("orders.edit");
  const id = s(f, "id");
  const po = await getOrder(id);
  if (!po) redirect("/orders");
  if (po.status === "Billed") return; // must undo bill first (keeps cost tracking consistent)
  await db.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
  if (po.jobId) await logActivity("job", po.jobId, "order_deleted", `Purchase order ${po.number} deleted`);
  revalidateOrder(id, po.jobId);
  const back = s(f, "returnTo");
  redirect(back.startsWith("/") ? back : "/orders");
}

/** Creates one draft PO per chosen supplier from ticked job budget lines. */
export async function createOrdersFromBudget(_: FormState, f: FormData): Promise<FormState> {
  const denial = await denied("orders.edit");
  if (denial) return { error: denial };
  const jobId = s(f, "jobId");
  const picked = f.getAll("pick").map(String).filter(Boolean);
  if (!picked.length) return { error: "Tick at least one budget line to order." };
  const rows = await db
    .select()
    .from(schema.jobBudgetLines)
    .where(and(eq(schema.jobBudgetLines.jobId, jobId), inArray(schema.jobBudgetLines.id, picked)));
  if (!rows.length) return { error: "Those budget lines no longer exist." };
  const picks: BudgetPick[] = rows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      budgetLineId: r.id,
      supplierId: s(f, `supplier_${r.id}`) || null,
      description: r.description,
      uom: r.uom,
      quantity: r.quantity,
      unitCost: r.unitCost,
      costType: r.costType,
    }));
  const groups = groupBudgetPicksBySupplier(picks);
  for (const [supplierId, lines] of groups) await insertOrder(jobId, supplierId, lines);
  revalidatePath("/orders");
  revalidatePath(`/jobs/${jobId}/orders`);
  redirect(`/jobs/${jobId}/orders?created=${groups.size}`);
}
