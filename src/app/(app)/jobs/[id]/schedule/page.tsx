import { notFound } from "next/navigation";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { date, todayIso } from "@/lib/format";
import { nextWorkingDay, snapToWorkingDay, summarise } from "@/lib/scheduling";
import { deleteTask, moveTask, saveTask, shiftSchedule } from "../../actions";
import { contactOptions, getJob, loadTasks } from "../../../schedule/_lib/job-data";
import { ModalForm, PrintButton } from "../../../schedule/_lib/client";
import { btn } from "../../../schedule/_lib/bits";
import { Gantt, type Zoom } from "../../../schedule/_lib/Gantt";
import { Mini } from "../../../schedule/_lib/bits";
import { GanttLegend, TaskFields, TaskTable, taskGanttRows, ZoomSwitch } from "../../../schedule/_lib/TaskEditor";

export default async function JobSchedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ zoom?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const zoom: Zoom = sp.zoom === "week" || sp.zoom === "month" ? sp.zoom : "day";
  const job = await getJob(id);
  if (!job) notFound();
  const [tasks, contacts] = await Promise.all([loadTasks(id), contactOptions()]);
  const today = todayIso();
  const sum = summarise(tasks.map((t) => ({ ...t, dependsOn: t.deps })), today);
  const contactName = new Map(contacts.map((c) => [c.value, c.label]));
  const defaultStart = sum.finish ? nextWorkingDay(sum.finish) : snapToWorkingDay(job.startDate || today);
  const owner = { name: "jobId", value: id };

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ModalForm title="Add task" action={saveTask} trigger="Add task">
            <TaskFields owner={owner} tasks={tasks} contacts={contacts} defaultStart={defaultStart} withProgress />
          </ModalForm>
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
        <ZoomSwitch href={`/jobs/${id}/schedule`} zoom={zoom} />
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

      <Gantt zoom={zoom} today={today} emptyText="No tasks yet. Add your first task to start the schedule." rows={taskGanttRows(tasks, sum, contactName, true)} />
      {tasks.length > 0 && <GanttLegend withOverdue />}

      {tasks.length > 0 && (
        <TaskTable
          tasks={tasks}
          sum={sum}
          contacts={contacts}
          owner={owner}
          defaultStart={defaultStart}
          withProgress
          saveAction={saveTask}
          moveAction={moveTask}
          deleteAction={deleteTask}
        />
      )}
    </div>
  );
}
