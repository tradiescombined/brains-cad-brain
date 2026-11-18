import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Checkbox, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { currentPermissions } from "@/lib/permissions";
import { date, todayIso } from "@/lib/format";
import { nextWorkingDay, parseDependsOn, snapToWorkingDay, summarise } from "@/lib/scheduling";
import { contactOptions } from "../../../schedule/_lib/job-data";
import { ModalForm } from "../../../schedule/_lib/client";
import { btn, Mini } from "../../../schedule/_lib/bits";
import { Gantt, type Zoom } from "../../../schedule/_lib/Gantt";
import { GanttLegend, TaskFields, TaskTable, taskGanttRows, ZoomSwitch } from "../../../schedule/_lib/TaskEditor";
import { deleteEstimateTask, generateEstimateSchedule, moveEstimateTask, saveEstimateTask, setEstimateScheduleStart } from "./actions";

export const metadata = { title: "Schedule" };

export default async function EstimateSchedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ zoom?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const zoom: Zoom = sp.zoom === "week" || sp.zoom === "month" ? sp.zoom : "day";
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) notFound();
  const [rows, contacts, perm, [qo]] = await Promise.all([
    db.select().from(schema.estimateTasks).where(eq(schema.estimateTasks.estimateId, id)).orderBy(asc(schema.estimateTasks.sortOrder), asc(schema.estimateTasks.startDate)),
    contactOptions(),
    currentPermissions(),
    db.select({ printSchedule: schema.quoteOptions.printSchedule }).from(schema.quoteOptions).where(eq(schema.quoteOptions.estimateId, id)),
  ]);
  const canEdit = perm["estimates.edit"];
  const tasks = rows.map((r) => ({ ...r, deps: parseDependsOn(r.dependsOn) }));
  const today = todayIso();
  const sum = summarise(tasks.map((t) => ({ ...t, dependsOn: t.deps })), today);
  const contactName = new Map(contacts.map((c) => [c.value, c.label]));
  const defaultStart = sum.finish ? nextWorkingDay(sum.finish) : snapToWorkingDay(today);
  const owner = { name: "estimateId", value: id };
  const onQuote = !!qo?.printSchedule;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">
        Plan the build timeline at quote stage. Show it to the client on the quote (
        <Link href={`/estimates/${id}/quote`} className="font-medium text-brand-700 hover:underline">Quote → Schedule summary</Link>
        ), and it is copied into the job schedule when you create the job.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <ModalForm title="Add task" action={saveEstimateTask} trigger="Add task">
              <TaskFields owner={owner} tasks={tasks} contacts={contacts} defaultStart={defaultStart} withProgress={false} />
            </ModalForm>
            <ModalForm title="Generate from costing categories" action={generateEstimateSchedule} trigger="Generate from categories" triggerClassName={btn("secondary")}>
              <input type="hidden" name="estimateId" value={id} />
              <p className="text-sm text-ink-600">Creates one task per costing category, run back to back. Durations are a starting guess from each category&apos;s cost — adjust them afterwards.</p>
              <Field label="Start date" hint="Weekends roll to Monday"><Input type="date" name="startDate" required defaultValue={sum.start ?? snapToWorkingDay(today)} /></Field>
              {tasks.length > 0 && <Checkbox name="replace" label={`Replace the ${tasks.length} existing task${tasks.length === 1 ? "" : "s"}`} />}
              <div className="flex justify-end border-t border-ink-100 pt-3"><SubmitButton>Generate tasks</SubmitButton></div>
            </ModalForm>
            {tasks.length > 0 && (
              <ModalForm title="Set schedule start" action={setEstimateScheduleStart} trigger="Set start date" triggerClassName={btn("secondary")}>
                <input type="hidden" name="estimateId" value={id} />
                <p className="text-sm text-ink-600">Moves every task so the first one starts on this date. Durations, links and gaps between tasks are kept.</p>
                <Field label="First task starts" hint="Weekends roll to Monday"><Input type="date" name="startDate" required defaultValue={sum.start ?? ""} /></Field>
                <div className="flex justify-end border-t border-ink-100 pt-3"><SubmitButton>Move schedule</SubmitButton></div>
              </ModalForm>
            )}
          </div>
        ) : (
          <div />
        )}
        <ZoomSwitch href={`/estimates/${id}/schedule`} zoom={zoom} />
      </div>

      {tasks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="estimate-schedule-summary">
          <Mini label="Start" value={date(sum.start)} />
          <Mini label="Finish" value={date(sum.finish)} />
          <Mini label="Working days" value={String(sum.workingDays)} sub={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`} />
          <Mini label="On the quote" value={onQuote ? "Shown" : "Hidden"} sub={onQuote ? "Schedule summary prints" : "Turn on in Quote options"} />
        </div>
      )}

      <Gantt
        zoom={zoom}
        today={today}
        emptyText={canEdit ? "No tasks yet. Add a task, or generate one per costing category." : "No schedule has been planned for this estimate."}
        rows={taskGanttRows(tasks, sum, contactName, false)}
      />
      {tasks.length > 0 && <GanttLegend withOverdue={false} />}

      {tasks.length > 0 && (
        <TaskTable
          tasks={tasks}
          sum={sum}
          contacts={contacts}
          owner={owner}
          defaultStart={defaultStart}
          withProgress={false}
          saveAction={saveEstimateTask}
          moveAction={moveEstimateTask}
          deleteAction={deleteEstimateTask}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
