import Link from "next/link";
import { db, schema } from "@/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { EmptyState, LinkButton, PageHeader, Select } from "@/components/ui";
import { cx, date, todayIso } from "@/lib/format";
import { parseDependsOn, summarise, taskFinish, taskStart } from "@/lib/scheduling";
import { ACTIVE_STATUSES, contactOptions } from "./_lib/job-data";
import { Gantt, type GanttRow, type Zoom } from "./_lib/Gantt";
import { PrintButton } from "./_lib/client";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ job?: string; assignee?: string; zoom?: string }> }) {
  const sp = await searchParams;
  const zoom: Zoom = sp.zoom === "day" || sp.zoom === "month" ? sp.zoom : "week";
  const jobs = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.archived, false), inArray(schema.jobs.status, [...ACTIVE_STATUSES])))
    .orderBy(asc(schema.jobs.number));
  const jobIds = jobs.map((j) => j.id);
  const [tasks, contacts] = await Promise.all([
    jobIds.length ? db.select().from(schema.jobTasks).where(inArray(schema.jobTasks.jobId, jobIds)).orderBy(asc(schema.jobTasks.sortOrder)) : Promise.resolve([]),
    contactOptions(),
  ]);
  const today = todayIso();
  const contactName = new Map(contacts.map((c) => [c.value, c.label]));
  const usedAssignees = contacts.filter((c) => tasks.some((t) => t.assigneeContactId === c.value));

  const shownJobs = jobs.filter((j) => !sp.job || j.id === sp.job);
  const rows: GanttRow[] = [];
  let taskCount = 0;
  for (const j of shownJobs) {
    const all = tasks.filter((t) => t.jobId === j.id).map((t) => ({ ...t, dependsOn: parseDependsOn(t.dependsOn) }));
    const mine = all.filter((t) => !sp.assignee || (sp.assignee === "none" ? !t.assigneeContactId : t.assigneeContactId === sp.assignee));
    if (mine.length === 0) continue;
    const sum = summarise(all, today);
    rows.push({ kind: "group", id: `g-${j.id}`, label: `${j.number} · ${j.name}`, href: `/jobs/${j.id}/schedule`, sub: `${date(sum.start)} – ${date(sum.finish)} · ${sum.percentComplete}%` });
    for (const t of mine) {
      taskCount++;
      rows.push({
        kind: "task",
        id: t.id,
        label: t.name,
        sub: t.assigneeContactId ? contactName.get(t.assigneeContactId) : undefined,
        start: taskStart(t),
        finish: taskFinish(t),
        colour: t.colour,
        progress: t.progress,
        critical: sum.critical.has(t.id) && t.progress < 100,
        overdue: sum.overdue.has(t.id),
        title: `${j.number} ${t.name}: ${date(taskStart(t))} – ${date(taskFinish(t))}`,
      });
    }
  }
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { job: sp.job, assignee: sp.assignee, zoom, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/schedule?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle={`All active jobs · ${taskCount} task${taskCount === 1 ? "" : "s"} shown`}
        actions={
          <>
            <PrintButton />
            <LinkButton variant="secondary" href="/jobs">Jobs</LinkButton>
          </>
        }
      />
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="zoom" value={zoom} />
          <div className="w-full sm:w-60"><Select name="job" defaultValue={sp.job ?? ""} aria-label="Filter by job" placeholder="All active jobs" options={jobs.map((j) => ({ value: j.id, label: `${j.number} · ${j.name}` }))} /></div>
          <div className="w-full sm:w-52"><Select name="assignee" defaultValue={sp.assignee ?? ""} aria-label="Filter by assignee" placeholder="Anyone" options={[{ value: "none", label: "Unassigned" }, ...usedAssignees.map((c) => ({ value: c.value, label: c.label }))]} /></div>
          <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50">Apply</button>
          {(sp.job || sp.assignee) && <Link href={qs({ job: undefined, assignee: undefined })} className="text-sm text-ink-500 hover:text-brand-700">Clear</Link>}
        </form>
        <div className="inline-flex rounded-lg bg-ink-100 p-1 text-sm" role="group" aria-label="Zoom">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <Link key={z} href={qs({ zoom: z })} className={cx("rounded-md px-3 py-1 font-medium capitalize", z === zoom ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800")}>
              {z}
            </Link>
          ))}
        </div>
      </div>
      {jobs.length === 0 ? (
        <EmptyState title="No active jobs" body="Jobs that are not started, in progress or on hold appear here with their tasks." action={<LinkButton href="/jobs/new">Create a job</LinkButton>} />
      ) : (
        <Gantt rows={rows} today={today} zoom={zoom} emptyText={sp.job || sp.assignee ? "No tasks match these filters." : "None of your active jobs have scheduled tasks yet."} />
      )}
    </div>
  );
}
