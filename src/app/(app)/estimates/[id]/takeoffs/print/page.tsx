import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatQuantity } from "@/lib/geometry";
import { date } from "@/lib/format";
import { shapesByTakeoff } from "@/lib/takeoffs";
import { ensureTakeoffs } from "../takeoff-db";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Print takeoffs" };

/**
 * Printable takeoff list. Covers the app/estimate chrome on screen with a full-viewport sheet;
 * in print the chrome is `no-print` and the sheet flows normally.
 */
export default async function TakeoffsPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [est] = await db
    .select({ id: schema.estimates.id, name: schema.estimates.name, number: schema.estimates.number, clientName: schema.estimates.clientName })
    .from(schema.estimates)
    .where(eq(schema.estimates.id, id));
  if (!est) notFound();
  await ensureTakeoffs(id);
  const takeoffs = await db
    .select()
    .from(schema.takeoffs)
    .where(eq(schema.takeoffs.estimateId, id))
    .orderBy(asc(schema.takeoffs.sortOrder), asc(schema.takeoffs.createdAt));
  const shapes = await db.select().from(schema.measurements).where(eq(schema.measurements.estimateId, id));
  const plans = await db.select({ id: schema.plans.id, label: schema.plans.label }).from(schema.plans).where(eq(schema.plans.estimateId, id)).orderBy(asc(schema.plans.sortOrder));
  const planLabel = new Map(plans.map((p) => [p.id, p.label]));
  const { grouped } = shapesByTakeoff(takeoffs, shapes);

  return (
    <div className="takeoff-print-sheet fixed inset-0 z-[60] overflow-y-auto bg-ink-200">
      <style>{`
@media print {
  .takeoff-print-sheet { position: static !important; overflow: visible !important; background: #fff !important; }
  main { padding: 0 !important; }
}`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-2">
        <Link href={`/estimates/${id}/takeoffs`} className="text-sm font-medium text-ink-600 hover:text-brand-700">← Back to takeoffs</Link>
        <PrintButton />
      </div>
      <div className="py-6 print:py-0">
        <article data-testid="takeoff-print" className="mx-auto max-w-4xl bg-white p-8 shadow-lg print:max-w-none print:p-0 print:shadow-none">
          <header className="mb-5 flex items-start justify-between gap-4 border-b border-ink-200 pb-4">
            <div>
              <h1 className="text-xl font-semibold text-ink-900">Takeoffs</h1>
              <p className="mt-0.5 text-sm text-ink-600">
                {est.name} · {est.number}
                {est.clientName ? ` · ${est.clientName}` : ""}
              </p>
            </div>
            <p className="text-xs text-ink-500">Printed {date(new Date().toISOString())}</p>
          </header>
          {takeoffs.length === 0 ? (
            <p className="text-sm text-ink-500">No takeoffs yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-ink-300 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="py-1.5 pr-2 font-semibold">#</th>
                  <th className="py-1.5 pr-2 font-semibold">Code</th>
                  <th className="py-1.5 pr-2 font-semibold">Description</th>
                  <th className="py-1.5 pr-2 font-semibold">Source</th>
                  <th className="py-1.5 text-right font-semibold">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {takeoffs.map((t, i) => {
                  const own = grouped.get(t.id) ?? [];
                  const onPlans = [...new Set(own.map((s) => planLabel.get(s.planId) ?? "Plan"))];
                  const deductions = own.filter((s) => s.isNegative).length;
                  return (
                    <tr key={t.id} data-testid={`print-${t.code}`} className="break-inside-avoid border-b border-ink-100 align-top">
                      <td className="py-1.5 pr-2 tabular-nums text-ink-500">{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-ink-800">
                          <span className="size-2.5 rounded-sm" style={{ background: t.colour, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
                          {t.code}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-ink-900">{t.description || <span className="italic text-ink-400">Untitled</span>}</td>
                      <td className="py-1.5 pr-2 text-xs text-ink-600">
                        {t.manualExpr != null ? (
                          <>Manual: <span className="font-mono">{t.manualExpr}</span></>
                        ) : own.length ? (
                          <>
                            {own.length} shape{own.length > 1 ? "s" : ""}
                            {deductions ? ` (${deductions} deduction${deductions > 1 ? "s" : ""})` : ""} on {onPlans.join(", ")}
                          </>
                        ) : (
                          "No shapes"
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right font-medium tabular-nums text-ink-900">{formatQuantity(t.value, t.unit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </article>
      </div>
    </div>
  );
}
