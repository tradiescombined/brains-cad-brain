import Link from "next/link";
import { PageHeader, EmptyState, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { PO_STATUSES } from "@/lib/money-docs";
import { listJobs, listSuppliers, queryOrders, supplierLabel } from "./_shared/data";
import { OrdersTable } from "./_shared/OrdersTable";
import { NewOrderButton } from "./_shared/NewOrderButton";

export const metadata = { title: "Purchase orders" };

const selCls = "rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; supplier?: string; job?: string }> }) {
  const sp = await searchParams;
  const [rows, all, jobs, suppliers] = await Promise.all([
    queryOrders({ status: sp.status || undefined, supplierId: sp.supplier || undefined, jobId: sp.job || undefined }),
    queryOrders(),
    listJobs(),
    listSuppliers(),
  ]);
  const filtered = !!(sp.status || sp.supplier || sp.job);
  const open = all.filter((r) => ["Sent", "Confirmed"].includes(r.status));
  const awaitingBill = all.filter((r) => r.status === "Delivered");
  const drafts = all.filter((r) => r.status === "Draft");
  const jobOpts = jobs.map((j) => ({ value: j.id, label: `${j.number} · ${j.name}` }));
  const supOpts = suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) }));

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        subtitle="Material and subcontract orders across all jobs"
        actions={<NewOrderButton jobs={jobOpts} suppliers={supOpts} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Drafts" value={drafts.length} sub={money(drafts.reduce((s, r) => s + r.total, 0))} />
        <Stat label="On order" value={open.length} sub={money(open.reduce((s, r) => s + r.total, 0))} />
        <Stat label="Delivered, not billed" value={awaitingBill.length} sub={money(awaitingBill.reduce((s, r) => s + r.total, 0))} />
        <Stat label="All orders" value={all.length} sub={money(all.filter((r) => r.status !== "Cancelled").reduce((s, r) => s + r.total, 0))} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Filter orders">
        <label className="text-xs font-medium text-ink-600">
          <span className="mb-1 block">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className={selCls}>
            <option value="">All statuses</option>
            {PO_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-600">
          <span className="mb-1 block">Supplier</span>
          <select name="supplier" defaultValue={sp.supplier ?? ""} className={selCls}>
            <option value="">All suppliers</option>
            {supOpts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-600">
          <span className="mb-1 block">Job</span>
          <select name="job" defaultValue={sp.job ?? ""} className={selCls}>
            <option value="">All jobs</option>
            {jobOpts.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
          </select>
        </label>
        <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50">Apply</button>
        {filtered && <Link href="/orders" className="px-2 py-1.5 text-sm text-ink-500 hover:text-brand-700">Clear</Link>}
      </form>

      {rows.length ? (
        <OrdersTable rows={rows} />
      ) : filtered ? (
        <EmptyState title="No orders match these filters" body="Try a different status, supplier or job." />
      ) : (
        <EmptyState
          title="No purchase orders yet"
          body="Raise orders to your suppliers and trades from a job's budget, or start a blank order."
          action={<NewOrderButton jobs={jobOpts} suppliers={supOpts} />}
        />
      )}
    </div>
  );
}
