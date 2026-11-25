import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "../settings/_components/ConfirmSubmit";
import { cx } from "@/lib/format";
import { clearDoneReminders } from "./actions";
import { groupReminders, localIso } from "./group";
import { listEntityOptions, resolveEntityLabels } from "./entities.server";
import { ReminderEditor } from "./ReminderEditor";
import { ReminderRow } from "./ReminderRow";
import { ENTITY_TYPES } from "./entities";

export const metadata = { title: "Reminders · TC Quoting Estimate" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = localIso();
  const [rows, options, users] = await Promise.all([
    db.select().from(schema.reminders).orderBy(asc(schema.reminders.dueDate)),
    listEntityOptions(),
    db.select({ firstName: schema.users.firstName, surname: schema.users.surname }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.firstName)),
  ]);
  const userNames = users.map((u) => [u.firstName, u.surname].filter(Boolean).join(" "));
  const labels = await resolveEntityLabels(rows);
  const g = groupReminders(rows, today);
  const editor = { options, users: userNames };

  // Deep link: /reminders?new=1&entityType=estimate&entityId=… opens a prefilled editor.
  const presetType = ENTITY_TYPES.some((t) => t.value === sp.entityType) ? sp.entityType! : null;
  const preset = sp.new ? { entityType: presetType, entityId: presetType ? sp.entityId ?? null : null, title: sp.title ?? "" } : undefined;

  const groups = [
    { key: "overdue", title: "Overdue", rows: g.overdue, tone: "text-red-600" },
    { key: "today", title: "Today", rows: g.today, tone: "text-amber-700" },
    { key: "upcoming", title: "Upcoming", rows: g.upcoming, tone: "text-ink-500" },
  ] as const;
  const openCount = g.overdue.length + g.today.length + g.upcoming.length;

  return (
    <div>
      <PageHeader
        title="Reminders"
        subtitle={rows.length ? `${openCount} open · ${g.overdue.length} overdue · ${g.done.length} done` : "Keep track of follow-ups, site visits and paperwork."}
        actions={<ReminderEditor options={options} users={userNames} today={today} triggerLabel="+ New reminder" reminder={preset} defaultOpen={!!preset} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No reminders yet"
          body="Add a reminder to follow up a quote, chase a supplier or book an inspection. Link it to an estimate, job or client to jump straight there."
          action={<ReminderEditor options={options} users={userNames} today={today} triggerLabel="Add your first reminder" />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {groups.map((grp) => (
              <Card
                key={grp.key}
                title={
                  <span className={cx("flex items-center gap-2", grp.tone)}>
                    {grp.title}
                    <span className="rounded-full bg-ink-100 px-1.5 text-[11px] font-semibold text-ink-600">{grp.rows.length}</span>
                  </span>
                }
              >
                {grp.rows.length === 0 ? (
                  <p className="text-sm text-ink-400">{grp.key === "overdue" ? "Nothing overdue — nice work." : grp.key === "today" ? "Nothing due today." : "Nothing scheduled."}</p>
                ) : (
                  <ul className="-my-2.5 divide-y divide-ink-100" aria-label={`${grp.title} reminders`}>
                    {grp.rows.map((r) => (
                      <ReminderRow key={r.id} r={r} today={today} editor={editor} linkLabel={labels.get(`${r.entityType}:${r.entityId}`)} />
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
          <div>
            <Card
              title={
                <span className="flex items-center gap-2">
                  Done
                  <span className="rounded-full bg-ink-100 px-1.5 text-[11px] font-semibold text-ink-600">{g.done.length}</span>
                </span>
              }
              actions={
                g.done.length > 0 && (
                  <form action={clearDoneReminders}>
                    <ConfirmSubmit confirmText="Delete all done?" className="px-2! py-0.5! text-xs!">Clear</ConfirmSubmit>
                  </form>
                )
              }
            >
              {g.done.length === 0 ? (
                <p className="text-sm text-ink-400">Completed reminders show here.</p>
              ) : (
                <ul className="-my-2.5 divide-y divide-ink-100" aria-label="Done reminders">
                  {g.done.map((r) => (
                    <ReminderRow key={r.id} r={r} today={today} editor={editor} compact linkLabel={labels.get(`${r.entityType}:${r.entityId}`)} />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
