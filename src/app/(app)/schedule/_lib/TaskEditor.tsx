/**
 * Schedule task editor shared by the job schedule (/jobs/[id]/schedule) and the estimate schedule
 * (/estimates/[id]/schedule): add/edit task form fields, the task table with reorder/edit/delete,
 * Gantt rows and the zoom switch. Server components; the owning page supplies its own actions and
 * the hidden owner field (jobId / estimateId) the actions read.
 */
import Link from "next/link";
import { Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx, date } from "@/lib/format";
import { taskFinish, taskStart, type ScheduleSummary } from "@/lib/scheduling";
import { ConfirmSubmit, ModalForm, type FormAction } from "./client";
import { btn } from "./bits";
import { TASK_COLOURS } from "./constants";
import type { GanttRow, Zoom } from "./Gantt";

export interface EditableTask {
  id: string;
  name: string;
  startDate: string;
  durationDays: number;
  deps: string[];
  assigneeContactId: string | null;
  colour: string | null;
  notes: string | null;
  /** Job tasks only (estimate tasks have no progress). */
  progress?: number;
}

type Option = { value: string; label: string };
type Owner = { name: string; value: string };

export function TaskFields({
  owner,
  task: t,
  tasks,
  contacts,
  defaultStart,
  withProgress,
}: {
  owner: Owner;
  task?: EditableTask;
  tasks: EditableTask[];
  contacts: Option[];
  defaultStart: string;
  withProgress: boolean;
}) {
  const num = new Map(tasks.map((x, i) => [x.id, i + 1]));
  const others = tasks.filter((o) => o.id !== t?.id);
  return (
    <>
      <input type="hidden" name={owner.name} value={owner.value} />
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Task name"><Input name="name" defaultValue={t?.name} required placeholder="e.g. Frame inspection" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" hint="Weekends roll to Monday"><Input type="date" name="startDate" required defaultValue={t ? t.startDate : defaultStart} /></Field>
        <Field label="Duration (working days)"><Input type="number" name="durationDays" min={1} max={2000} required defaultValue={t?.durationDays ?? 1} /></Field>
        {withProgress && <Field label="Progress %"><Input type="number" name="progress" min={0} max={100} defaultValue={t?.progress ?? 0} /></Field>}
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
        {others.length === 0 ? (
          <p className="text-xs text-ink-400">No other tasks yet.</p>
        ) : (
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-ink-200 p-2">
            {others.map((o) => (
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
}

/** Gantt rows for a task list (numbered labels, assignee sub-line, critical / overdue flags). */
export function taskGanttRows(tasks: EditableTask[], sum: ScheduleSummary, contactName: Map<string, string>, withProgress: boolean): GanttRow[] {
  return tasks.map((t, i) => {
    const progress = withProgress ? (t.progress ?? 0) : 0;
    return {
      kind: "task" as const,
      id: t.id,
      label: <>{i + 1}. {t.name}</>,
      sub: t.assigneeContactId ? contactName.get(t.assigneeContactId) : undefined,
      start: taskStart(t),
      finish: taskFinish(t),
      colour: t.colour,
      progress,
      critical: sum.critical.has(t.id) && progress < 100,
      overdue: withProgress && sum.overdue.has(t.id),
      title: `${t.name}: ${date(taskStart(t))} – ${date(taskFinish(t))} (${t.durationDays} working day${t.durationDays === 1 ? "" : "s"})`,
    };
  });
}

export function GanttLegend({ withOverdue }: { withOverdue: boolean }) {
  return (
    <p className="text-xs text-ink-500">
      <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded ring-2 ring-amber-400" /> Critical path</span>
      {withOverdue && <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-4 rounded ring-2 ring-red-500" /> Overdue</span>}
      <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-red-500" /> Today</span>
    </p>
  );
}

export function ZoomSwitch({ href, zoom }: { href: string; zoom: Zoom }) {
  return (
    <div className="inline-flex rounded-lg bg-ink-100 p-1 text-sm" role="group" aria-label="Zoom">
      {(["day", "week", "month"] as Zoom[]).map((z) => (
        <Link key={z} href={`${href}?zoom=${z}`} className={cx("rounded-md px-3 py-1 font-medium capitalize", z === zoom ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800")}>
          {z}
        </Link>
      ))}
    </div>
  );
}

export function TaskTable({
  tasks,
  sum,
  contacts,
  owner,
  defaultStart,
  withProgress,
  saveAction,
  moveAction,
  deleteAction,
  canEdit = true,
}: {
  tasks: EditableTask[];
  sum: ScheduleSummary;
  contacts: Option[];
  owner: Owner;
  defaultStart: string;
  withProgress: boolean;
  saveAction: FormAction;
  moveAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  canEdit?: boolean;
}) {
  const num = new Map(tasks.map((t, i) => [t.id, i + 1]));
  const contactName = new Map(contacts.map((c) => [c.value, c.label]));
  return (
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
              {withProgress && <th className="px-3 py-2 text-right">Done</th>}
              {canEdit && <th className="no-print px-3 py-2" />}
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
                    {withProgress && sum.overdue.has(t.id) && <Badge tone="red">Overdue</Badge>}
                    {sum.conflicts.has(t.id) && <Badge tone="amber">Starts too early</Badge>}
                  </div>
                  {t.notes && <div className="mt-0.5 line-clamp-1 text-xs text-ink-500">{t.notes}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2" data-col="start">{date(taskStart(t))}</td>
                <td className="whitespace-nowrap px-3 py-2" data-col="finish">{date(taskFinish(t))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.durationDays}</td>
                <td className="px-3 py-2 text-xs text-ink-600" data-col="after">{t.deps.map((d) => num.get(d)).filter(Boolean).join(", ") || "—"}</td>
                <td className="hidden px-3 py-2 md:table-cell">{(t.assigneeContactId && contactName.get(t.assigneeContactId)) || <span className="text-ink-400">—</span>}</td>
                {withProgress && <td className="px-3 py-2 text-right tabular-nums">{t.progress ?? 0}%</td>}
                {canEdit && (
                  <td className="no-print px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <form action={moveAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button disabled={i === 0} className="rounded px-1.5 py-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label={`Move ${t.name} up`}>↑</button>
                      </form>
                      <form action={moveAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button disabled={i === tasks.length - 1} className="rounded px-1.5 py-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label={`Move ${t.name} down`}>↓</button>
                      </form>
                      <ModalForm title={`Edit task ${i + 1}`} action={saveAction} trigger="Edit" triggerClassName={btn("ghost", "px-2 py-1")}>
                        <TaskFields owner={owner} task={t} tasks={tasks} contacts={contacts} defaultStart={defaultStart} withProgress={withProgress} />
                      </ModalForm>
                      <form action={deleteAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmSubmit confirmText="Delete?" className="px-2 py-1">Delete</ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
