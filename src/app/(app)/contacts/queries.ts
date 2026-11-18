import "server-only";
import { db, schema } from "@/db";
import { count, eq } from "drizzle-orm";

/** Records that reference a supplier/trade contact (deleting would orphan them). */
export async function contactReferences(id: string) {
  const [[po], [ac], [ei], [cat]] = await Promise.all([
    db.select({ n: count() }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.supplierId, id)),
    db.select({ n: count() }).from(schema.actualCosts).where(eq(schema.actualCosts.supplierId, id)),
    db.select({ n: count() }).from(schema.estimateItems).where(eq(schema.estimateItems.supplierId, id)),
    db.select({ n: count() }).from(schema.catalogues).where(eq(schema.catalogues.supplierId, id)),
  ]);
  return { orders: po.n, costs: ac.n, estimateItems: ei.n, catalogues: cat.n };
}

export function describeContactRefs(r: Awaited<ReturnType<typeof contactReferences>>): string | null {
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  const parts = [
    r.orders && plural(r.orders, "purchase order"),
    r.costs && plural(r.costs, "job cost"),
    r.estimateItems && plural(r.estimateItems, "estimate item"),
    r.catalogues && plural(r.catalogues, "catalogue"),
  ].filter(Boolean);
  return parts.length ? `This contact can't be deleted because it's used by ${parts.join(", ")}.` : null;
}
