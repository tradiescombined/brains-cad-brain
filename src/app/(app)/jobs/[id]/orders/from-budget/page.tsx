import Link from "next/link";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { EmptyState, LinkButton } from "@/components/ui";
import { parsePoLines } from "@/lib/money-docs";
import { listSuppliers, supplierLabel } from "../../../../orders/_shared/data";
import { BudgetPicker } from "./BudgetPicker";

export const metadata = { title: "Create orders from budget" };

export default async function FromBudgetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ group?: string }> }) {
  const { id } = await params;
  const { group } = await searchParams;
  const groupBy = group === "category" ? "category" : "costType";
  const [lines, suppliers, orders] = await Promise.all([
    db.select().from(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.jobId, id)).orderBy(asc(schema.jobBudgetLines.sortOrder)),
    listSuppliers(),
    db.select({ number: schema.purchaseOrders.number, status: schema.purchaseOrders.status, lines: schema.purchaseOrders.lines }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.jobId, id)),
  ]);
  // Which budget lines are already on a (non-cancelled) order
  const onOrder: Record<string, string[]> = {};
  for (const o of orders) {
    if (o.status === "Cancelled") continue;
    for (const l of parsePoLines(o.lines)) if (l.budgetLineId) (onOrder[l.budgetLineId] ??= []).push(o.number);
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/jobs/${id}/orders`} className="text-xs font-medium text-ink-500 hover:text-brand-700">← Orders</Link>
          <h2 className="text-lg font-semibold">Create orders from budget</h2>
          <p className="text-sm text-ink-500">Tick the lines to order and choose a supplier for each. One draft order is created per supplier.</p>
        </div>
        <div className="flex rounded-md border border-ink-200 bg-white p-0.5 text-sm">
          <Link href="?group=costType" className={groupBy === "costType" ? "rounded bg-brand-50 px-2.5 py-1 font-medium text-brand-800" : "px-2.5 py-1 text-ink-600"}>By cost type</Link>
          <Link href="?group=category" className={groupBy === "category" ? "rounded bg-brand-50 px-2.5 py-1 font-medium text-brand-800" : "px-2.5 py-1 text-ink-600"}>By category</Link>
        </div>
      </div>
      {lines.length ? (
        <BudgetPicker
          jobId={id}
          groupBy={groupBy}
          suppliers={suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) }))}
          lines={lines.map((l) => ({ id: l.id, category: l.category, description: l.description, costType: l.costType, uom: l.uom ?? "", quantity: l.quantity, unitCost: l.unitCost, budget: l.budget, onOrder: onOrder[l.id] ?? [] }))}
        />
      ) : (
        <EmptyState
          title="This job has no budget lines"
          body="Budget lines are copied from the estimate when a job is created. You can still raise a blank order."
          action={<LinkButton variant="secondary" href={`/jobs/${id}/orders`}>Back to orders</LinkButton>}
        />
      )}
    </div>
  );
}
