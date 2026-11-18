import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { EmptyState, LinkButton, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { listSuppliers, queryOrders, supplierLabel } from "../../../orders/_shared/data";
import { OrdersTable } from "../../../orders/_shared/OrdersTable";
import { NewOrderButton } from "../../../orders/_shared/NewOrderButton";

export const metadata = { title: "Job orders" };

export default async function JobOrdersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const [rows, suppliers, budget] = await Promise.all([
    queryOrders({ jobId: id }),
    listSuppliers(),
    db.select({ id: schema.jobBudgetLines.id, budget: schema.jobBudgetLines.budget }).from(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.jobId, id)),
  ]);
  const supOpts = suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) }));
  const live = rows.filter((r) => r.status !== "Cancelled");
  const committed = live.reduce((s, r) => s + r.total, 0);
  const billed = live.filter((r) => r.status === "Billed").reduce((s, r) => s + r.total, 0);
  const actions = (
    <div className="flex flex-wrap gap-2">
      <LinkButton variant="secondary" href={`/jobs/${id}/orders/from-budget`}>Create orders from budget</LinkButton>
      <NewOrderButton jobs={[]} suppliers={supOpts} jobId={id} />
    </div>
  );
  return (
    <div className="space-y-4">
      {created && (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Created {created} draft order{created === "1" ? "" : "s"} from the budget. Review each one, then mark it sent.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Orders" value={live.length} />
          <Stat label="Committed inc tax" value={money(committed)} />
          <Stat label="Billed" value={money(billed)} />
        </div>
      </div>
      <div className="flex justify-end">{actions}</div>
      {rows.length ? (
        <OrdersTable rows={rows} showJob={false} />
      ) : (
        <EmptyState
          title="No orders for this job"
          body={budget.length ? "Turn budget lines into supplier orders in a couple of clicks, or start a blank order." : "Start a blank order to send to a supplier or trade."}
          action={actions}
        />
      )}
    </div>
  );
}
