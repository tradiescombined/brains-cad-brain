import { currentPermissions } from "@/lib/permissions";
import { EmptyState, LinkButton } from "@/components/ui";
import { money, todayIso } from "@/lib/format";
import { getJobContract, queryInvoices } from "../../../orders/_shared/data";
import { InvoicesTable } from "../../../invoices/_shared/InvoicesTable";

export const metadata = { title: "Job invoices" };

export default async function JobInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const perm = await currentPermissions();
  const { id } = await params;
  const [c, rows] = await Promise.all([getJobContract(id), queryInvoices({ jobId: id })]);
  if (!c) return null;
  const s = c.summary;
  const pct = Math.min(100, Math.max(0, s.claimedPercent));
  const pendingVars = c.variations.filter((v) => v.status === "Approved" && !c.invoicedVariationIds.has(v.id));
  const newBtn = perm["invoices.edit"] && <LinkButton href={`/jobs/${id}/invoices/new`}>+ New invoice</LinkButton>;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink-200 bg-white p-4 shadow-xs" aria-label="Contract summary">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Original contract", money(s.base)],
            ["Approved variations", money(s.variations)],
            ["Contract value", money(s.contract)],
            ["Invoiced to date", money(s.invoiced)],
            ["Paid", money(s.paid)],
            ["Remaining to invoice", money(s.remaining)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{k}</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums" data-testid={`cs-${k.toLowerCase().replace(/\s+/g, "-")}`}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-ink-500">
            <span>Claimed to date</span>
            <span className="font-medium tabular-nums text-ink-800" data-testid="cs-claimed-pct">{s.claimedPercent.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {pendingVars.length > 0 && (
          <p className="mt-3 text-sm text-sky-800">
            {pendingVars.length} approved variation{pendingVars.length === 1 ? "" : "s"} ({money(pendingVars.reduce((a, v) => a + v.total, 0))}) not yet invoiced.{" "}
            <a href={`/jobs/${id}/invoices/new?kind=Variation`} className="font-medium underline">Invoice now</a>
          </p>
        )}
      </section>
      <div className="flex justify-end">{newBtn}</div>
      {rows.length ? (
        <InvoicesTable rows={rows} today={todayIso()} showJob={false} />
      ) : (
        <EmptyState title="No invoices for this job" body="Start with a deposit, then claim progress as work is completed." action={newBtn} />
      )}
    </div>
  );
}
