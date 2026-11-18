import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx, date, todayIso } from "@/lib/format";
import { nextWorkingDay, snapToWorkingDay, summarise, taskFinish, taskStart } from "@/lib/scheduling";
import { deleteTask, moveTask, saveTask, shiftSchedule } from "../../actions";
import { contactOptions, getJob, loadTasks, TASK_COLOURS } from "../../../schedule/_lib/job-data";
import { ModalForm, PrintButton, ConfirmSubmit } from "../../../schedule/_lib/client";
import { btn } from "../../../schedule/_lib/bits";
import { Gantt, type Zoom } from "../../../schedule/_lib/Gantt";
import { Mini } from "../../../schedule/_lib/bits";

type Task = Awaited<ReturnType<typeof loadTasks>>[number];

export default async function JobSchedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ zoom?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const zoom: Zoom = sp.zoom === "week" || sp.zoom === "month" ? sp.zoom : "day";
  const job = await getJob(id);
  if (!job) notFound();
  const [tasks, contacts] = await Promise.all([loadTasks(id), contactOptions()]);
  const today = todayIso();
  const sum = summarise(tasks.map((t) => ({ ...t, dependsOn: t.deps })), today);
  const num = new Map(tasks.map((t, i) => [t.id, i + 1]));
  const contactName = new Map(contacts.map((c) => [c.value, c.label]));
  const defaultStart = sum.finish ? nextWorkingDay(sum.finish) : snapToWorkingDay(job.startDate || today);

  const fields = (t?: Task) => (
    <>
      <input type="hidden" name="jobId" value={id} />
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Task name"><Input name="name" defaultValue={t?.name} required placeholder="e.g. Frame inspection" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" hint="Weekends roll to Monday"><Input type="date" name="startDate" required defaultValue={t ? t.startDate : defaultStart} /></Field>
        <Field label="Duration (working days)"><Input type="number" name="durationDays" min={1} max={2000} required defaultValue={t?.durationDays ?? 1} /></Field>
        <Field label="Progress %"><Input type="number" name="progress" min={0} max={100} defaultValue={t?.progress ?? 0} /></Field>
        <Field label="Assignee"><Select name="assigneeContactId" defaultValue={t?.assigneeContactId ?? ""} options={contacts} placeholder="— Unassigned —" /></Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-600">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {TASK_COLOURS.map((c) => (
            <label key={c.value} className="cursor-pointer" title={c.label}>
              <input type="radio" name="colour" value={c.value} defaultChecked={(t?.colour ?? TASK_COLOURS[0].value) === c.value} className="peer sr-only" aria-label={c.label} />
              <span className="block size-6 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink-800 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500" style={{ background: c.value }} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-600">Predecessors (must finish before this starts)</legend>
        {tasks.filter((o) => o.id !== t?.id).length === 0 ? (
          <p className="text-xs text-ink-400">No other tasks yet.</p>
        ) : (
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-ink-200 p-2">
            {tasks
              .filter((o) => o.id !== t?.id)
              .map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="dependsOn" value={o.id} defaultChecked={t?.deps.includes(o.id)} className="size-4 accent-brand-600" />
                  <span className="w-6 text-right text-xs tabular-nums text-ink-400">{num.get(o.id)}</span>
                  <span className="truncate">{o.name}</span>
                </label>
              ))}
          </div>
        )}
      </fieldset>
      <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={t?.notes ?? ""} /></Field>
      <div className="flex justify-end gap-2 border-t border-ink-100 pt-3"><SubmitButton>{t ? "Save task" : "Add task"}</SubmitButton></div>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ModalForm title="Add task" action={saveTask} trigger="Add task">{fields()}</ModalForm>
          {tasks.length > 0 && (
            <ModalForm title="Shift whole schedule" action={shiftSchedule} trigger="Shift schedule" triggerClassName={btn("secondary")}>
              <input type="hidden" name="jobId" value={id} />
              <p className="text-sm text-ink-600">Move every task by a number of working days. Use a negative number to bring the schedule forward. Links between tasks are kept.</p>
              <Field label="Working days"><Input type="number" name="days" required step={1} placeholder="e.g. 5 or -2" /></Field>
              <div className="flex justify-end border-t border-ink-100 pt-3"><SubmitButton>Shift tasks</SubmitButton></div>
            </ModalForm>
          )}
          <PrintButton label="Print schedule" />
        </div>
        <div className="inline-flex rounded-lg bg-ink-100 p-1 text-sm" role="group" aria-label="Zoom">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <Link key={z} href={`/jobs/${id}/schedule?zoom=${z}`} className={cx("rounded-md px-3 py-1 font-medium capitalize", z === zoom ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800")}>
              {z}
            </Link>
          ))}
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">{job.number} · {job.name} — Schedule</h1>
        <p className="text-sm">{job.siteAddress} · printed {date(today)}</p>
      </div>

      {tasks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Start" value={date(sum.start)} />
          <Mini label="Finish" value={date(sum.finish)} sub={job.endDate && sum.finish && sum.finish > job.endDate ? `Later than target ${date(job.endDate)}` : undefined} warn={!!(job.endDate && sum.finish && sum.finish > job.endDate)} />
          <Mini label="Working days" value={String(sum.workingDays)} sub={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`} />
          <Mini label="Complete" value={`${sum.percentComplete}%`} sub={sum.overdue.size ? `${sum.overdue.size} overdue` : "On track"} warn={sum.overdue.size > 0} />
        </div>
      )}

      <Gantt
        zoom={zoom}
        today={today}
        emptyText="No tasks yet. Add your first task to start the schedule."
        rows={tasks.map((t) => ({
          kind: "task" as const,
          id: t.id,
          label: <>{num.get(t.id)}. {t.name}</>,
          sub: t.assigneeContactId ? contactName.get(t.assigneeContactId) : undefined,
          start: taskStart(t),
          finish: taskFinish(t),
          colour: t.colour,
          progress: t.progress,
          critical: sum.critical.has(t.id) && t.progress < 100,
          overdue: sum.overdue.has(t.id),
          title: `${t.name}: ${date(taskStart(t))} – ${date(taskFinish(t))} (${t.durationDays} working day${t.durationDays === 1 ? "" : "s"})`,
        }))}
      />
      {tasks.length > 0 && (
        <p className="text-xs text-ink-500">
          <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded ring-2 ring-amber-400" /> Critical path</span>
          <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded ring-2 ring-red-500" /> Overdue</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-red-500" /> Today</span>
        </p>
      )}

      {tasks.length > 0 && (
        <Card title="Tasks" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="task-table">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Start</th>
                  <th className="px-3 py-2">Finish</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2">After</th>
                  <th className="hidden px-3 py-2 md:table-cell">Assignee</th>
                  <th className="px-3 py-2 text-right">Done</th>
                  <th className="no-print px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.id} className="border-b border-ink-100" data-task={t.name}>
                    <td className="px-3 py-2 tabular-nums text-ink-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.colour || "#0a8077" }} />
                        <span className="font-medium text-ink-900">{t.name}</span>
                        {sum.overdue.has(t.id) && <Badge tone="red">Overdue</Badge>}
                        {sum.conflicts.has(t.id) && <Badge tone="amber">Starts too early</Badge>}
                      </div>
                      {t.notes && <div className="mt-0.5 line-clamp-1 text-xs text-ink-500">{t.notes}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" data-col="start">{date(taskStart(t))}</td>
                    <td className="whitespace-nowrap px-3 py-2" data-col="finish">{date(taskFinish(t))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.durationDays}</td>
                    <td className="px-3 py-2 text-xs text-ink-600">{t.deps.map((d) => num.get(d)).filter(Boolean).join(", ") || "—"}</td>
                    <td className="hidden px-3 py-2 md:table-cell">{(t.assigneeContactId && contactName.get(t.assigneeContactId)) || <span className="text-ink-400">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.progress}%</td>
                    <td className="no-print px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <form action={moveTask}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="dir" value="up" />
                          <button disabled={i === 0} className="rounded px-1.5 py-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label={`Move ${t.name} up`}>↑</button>
                        </form>
                        <form action={moveTask}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="dir" value="down" />
                          <button disabled={i === tasks.length - 1} className="rounded px-1.5 py-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label={`Move ${t.name} down`}>↓</button>
                        </form>
                        <ModalForm title={`Edit task ${i + 1}`} action={saveTask} trigger="Edit" triggerClassName={btn("ghost", "px-2 py-1")}>{fields(t)}</ModalForm>
                        <form action={deleteTask}>
                          <input type="hidden" name="id" value={t.id} />
                          <ConfirmSubmit confirmText="Delete?" className="px-2 py-1">Delete</ConfirmSubmit>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
