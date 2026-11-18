import Link from "next/link";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { cx, money, todayIso } from "@/lib/format";
import { ageing, AGEING_BUCKETS, INVOICE_KINDS, INVOICE_STATUSES, isOverdue } from "@/lib/money-docs";
import { listJobs, queryInvoices } from "../orders/_shared/data";
import { InvoicesTable } from "./_shared/InvoicesTable";

export const metadata = { title: "Invoices" };

const selCls = "rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; job?: string; kind?: string; show?: string }> }) {
  const sp = await searchParams;
  const today = todayIso();
  const [all, jobs] = await Promise.all([queryInvoices(), listJobs()]);
  let rows = all;
  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.job) rows = rows.filter((r) => r.jobId === sp.job);
  if (sp.kind) rows = rows.filter((r) => r.kind === sp.kind);
  if (sp.show === "overdue") rows = rows.filter((r) => isOverdue(r, today));
  if (sp.show === "outstanding") rows = rows.filter((r) => (r.status === "Sent" || r.status === "Part paid") && r.total - r.amountPaid > 0.004);
  const filtered = !!(sp.status || sp.job || sp.kind || sp.show);
  const a = ageing(all, today);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Client invoices, progress claims and money owed to you" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Outstanding" value={money(a.outstanding)} sub={`${a.count} invoice${a.count === 1 ? "" : "s"} awaiting payment`} />
        <Stat label="Overdue" value={<span className={a.overdue > 0 ? "text-amber-700" : ""}>{money(a.overdue)}</span>} sub={<Link href="/invoices?show=overdue" className="text-brand-700 hover:underline">View overdue</Link>} />
        <Stat label="Received" value={money(all.filter((r) => r.status !== "Void").reduce((s, r) => s + r.amountPaid, 0))} sub="All time" />
      </div>

      <section className="mb-6 rounded-lg border border-ink-200 bg-white p-4" aria-label="Aged receivables">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">Aged receivables (days overdue)</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {AGEING_BUCKETS.map((b, i) => {
            const v = a.buckets[b];
            const share = a.outstanding > 0 ? (v / a.outstanding) * 100 : 0;
            return (
              <div key={b} className="rounded-md bg-ink-50 p-3" data-testid={`ageing-${i}`}>
                <div className="text-xs text-ink-500">{b}</div>
                <div className={cx("mt-0.5 text-lg font-semibold tabular-nums", i >= 3 && v > 0 && "text-red-700", i > 0 && i < 3 && v > 0 && "text-amber-700")}>{money(v)}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200">
                  <div className={cx("h-full rounded-full", i === 0 ? "bg-brand-500" : i < 3 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Filter invoices">
        <label className="text-xs font-medium text-ink-600"><span className="mb-1 block">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className={selCls}>
            <option value="">All statuses</option>
            {INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-600"><span className="mb-1 block">Type</span>
          <select name="kind" defaultValue={sp.kind ?? ""} className={selCls}>
            <option value="">All types</option>
            {INVOICE_KINDS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-600"><span className="mb-1 block">Job</span>
          <select name="job" defaultValue={sp.job ?? ""} className={selCls}>
            <option value="">All jobs</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.number} · {j.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-600"><span className="mb-1 block">Show</span>
          <select name="show" defaultValue={sp.show ?? ""} className={selCls}>
            <option value="">Everything</option>
            <option value="outstanding">Outstanding</option>
            <option value="overdue">Overdue only</option>
          </select>
        </label>
        <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50">Apply</button>
        {filtered && <Link href="/invoices" className="px-2 py-1.5 text-sm text-ink-500 hover:text-brand-700">Clear</Link>}
      </form>

      {rows.length ? (
        <InvoicesTable rows={rows} today={today} />
      ) : filtered ? (
        <EmptyState title="No invoices match these filters" />
      ) : (
        <EmptyState title="No invoices yet" body="Invoices are raised from a job: deposits, progress claims, variations and final claims." action={<Link href="/jobs" className="text-sm font-medium text-brand-700 hover:underline">Go to jobs →</Link>} />
      )}
    </div>
  );
}
