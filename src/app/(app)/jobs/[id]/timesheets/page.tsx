import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { Card, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { date, money, num, todayIso } from "@/lib/format";
import { timesheetCost, timesheetTotals } from "@/lib/job-finance";
import { addCalendarDays, weekStart } from "@/lib/scheduling";
import { deleteTimesheet, saveTimesheet } from "../../actions";
import { getJob } from "../../../schedule/_lib/job-data";
import { ModalForm, ConfirmSubmit } from "../../../schedule/_lib/client";
import { btn } from "../../../schedule/_lib/bits";
import { Mini } from "../../../schedule/_lib/bits";

type Entry = typeof schema.timesheets.$inferSelect;

export default async function JobTimesheetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const rows = await db.select().from(schema.timesheets).where(eq(schema.timesheets.jobId, id)).orderBy(desc(schema.timesheets.date), desc(schema.timesheets.createdAt));
  const totals = timesheetTotals(rows, weekStart);
  const workers = [...new Set(rows.map((r) => r.worker))];

  const fields = (e?: Entry) => (
    <>
      <input type="hidden" name="jobId" value={id} />
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Worker" className="col-span-2"><Input name="worker" required defaultValue={e?.worker} list="ts-workers" placeholder="Name" /></Field>
        <Field label="Date"><Input type="date" name="date" required defaultValue={e?.date ?? todayIso()} /></Field>
        <Field label="Hours"><Input type="number" name="hours" step="0.25" min="0.25" max="24" required defaultValue={e ? String(e.hours) : "8"} /></Field>
        <Field label="Hourly rate (ex tax)" className="col-span-2"><Input name="rate" inputMode="decimal" defaultValue={e ? String(e.rate) : ""} placeholder="0.00" /></Field>
        <Field label="Notes" className="col-span-2"><Textarea name="notes" rows={2} defaultValue={e?.notes ?? ""} /></Field>
      </div>
      <div className="flex justify-end border-t border-ink-100 pt-3"><SubmitButton>{e ? "Save entry" : "Add entry"}</SubmitButton></div>
    </>
  );

  return (
    <div className="space-y-6">
      <datalist id="ts-workers">{workers.map((w) => <option key={w} value={w} />)}</datalist>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-xl">
          <Mini label="Hours" value={num(totals.hours)} />
          <Mini label="Labour cost" value={money(totals.cost)} />
          <Mini label="Workers" value={String(totals.byWorker.length)} />
        </div>
        <ModalForm title="Add timesheet entry" action={saveTimesheet} trigger="Add entry">{fields()}</ModalForm>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No time recorded" body="Log hours worked on this job. Labour cost (hours × rate) is included in the job's actual cost to date." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Entries" pad={false} className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="timesheet-table">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Worker</th>
                    <th className="px-3 py-2 text-right">Hours</th>
                    <th className="hidden px-3 py-2 text-right sm:table-cell">Rate</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-ink-100" data-entry={r.worker}>
                      <td className="whitespace-nowrap px-3 py-1.5">{date(r.date)}</td>
                      <td className="px-3 py-1.5">
                        <div className="text-ink-900">{r.worker}</div>
                        {r.notes && <div className="line-clamp-1 text-xs text-ink-500">{r.notes}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{num(r.hours)}</td>
                      <td className="hidden px-3 py-1.5 text-right tabular-nums sm:table-cell">{money(r.rate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(timesheetCost(r))}</td>
                      <td className="px-2 py-1">
                        <div className="flex justify-end gap-1">
                          <ModalForm title="Edit timesheet entry" action={saveTimesheet} trigger="Edit" triggerClassName={btn("ghost", "px-2 py-0.5 text-xs")}>{fields(r)}</ModalForm>
                          <form action={deleteTimesheet}>
                            <input type="hidden" name="id" value={r.id} />
                            <ConfirmSubmit confirmText="Delete?" className="px-2 py-0.5 text-xs">Delete</ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="space-y-6">
            <Card title="By worker" pad={false}>
              <table className="w-full text-sm" data-testid="by-worker">
                <tbody>
                  {totals.byWorker.map((w) => (
                    <tr key={w.worker} className="border-b border-ink-100 last:border-0">
                      <td className="px-4 py-2 font-medium">{w.worker}<div className="text-xs font-normal text-ink-500">{w.entries} entr{w.entries === 1 ? "y" : "ies"}</div></td>
                      <td className="px-4 py-2 text-right tabular-nums">{num(w.hours)} h</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(w.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="By week" pad={false}>
              <table className="w-full text-sm" data-testid="by-week">
                <tbody>
                  {totals.byWeek.map((w) => (
                    <tr key={w.week} className="border-b border-ink-100 last:border-0">
                      <td className="px-4 py-2">{date(w.week)} – {date(addCalendarDays(w.week, 6))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{num(w.hours)} h</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(w.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
