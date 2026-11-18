import Link from "next/link";
import { and, asc, count, desc, eq, gt, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, LinkButton, PageHeader, statusTone } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { cx, date, money } from "@/lib/format";
import { estimateKpis, invoiceKpis, pipelineByStage, quickStartSteps, statusBreakdown, timeAgo, MIN_CLOSED_FOR_WIN_RATE } from "./metrics";
import { addDaysIso, localIso } from "../reminders/group";
import { entityHref } from "../reminders/entities";
import { resolveEntityLabels } from "../reminders/entities.server";
import { ReminderRow } from "../reminders/ReminderRow";

export const metadata = { title: "Dashboard · Brains Cad Brain" };

export default async function DashboardPage() {
  const today = localIso();
  const weekAhead = addDaysIso(today, 7);
  const settings = await getSettings();

  const [estimates, statusRows, jobs, invoices, leads, reminders, activity, [{ n: planCount }], [{ n: catCount }]] = await Promise.all([
    db
      .select({
        id: schema.estimates.id, number: schema.estimates.number, name: schema.estimates.name, status: schema.estimates.status,
        clientName: schema.estimates.clientName, quoteTotal: schema.estimates.quoteTotal, archived: schema.estimates.archived,
        isTemplate: schema.estimates.isTemplate, isSample: schema.estimates.isSample, sentAt: schema.estimates.sentAt, updatedAt: schema.estimates.updatedAt,
      })
      .from(schema.estimates)
      .orderBy(desc(schema.estimates.updatedAt)),
    db.select({ name: schema.lookups.name, flag: schema.lookups.flag, active: schema.lookups.active }).from(schema.lookups).where(eq(schema.lookups.kind, "estimate_status")).orderBy(asc(schema.lookups.sortOrder)),
    db.select({ status: schema.jobs.status, archived: schema.jobs.archived }).from(schema.jobs),
    db.select({ status: schema.invoices.status, total: schema.invoices.total, amountPaid: schema.invoices.amountPaid, dueDate: schema.invoices.dueDate }).from(schema.invoices),
    db.select({ stage: schema.leads.stage, estimatedValue: schema.leads.estimatedValue, archived: schema.leads.archived }).from(schema.leads),
    db
      .select()
      .from(schema.reminders)
      .where(and(eq(schema.reminders.done, false), isNotNull(schema.reminders.dueDate), lte(schema.reminders.dueDate, weekAhead)))
      .orderBy(asc(schema.reminders.dueDate))
      .limit(8),
    db.select().from(schema.activity).orderBy(desc(schema.activity.createdAt)).limit(12),
    db.select({ n: count() }).from(schema.plans),
    // Catalogue items added after initial setup (the starter price list doesn't count).
    db.select({ n: count() }).from(schema.catalogueItems).where(gt(schema.catalogueItems.createdAt, new Date(Date.parse(settings.createdAt) + 60_000).toISOString())),
  ]);

  const real = estimates.filter((e) => !e.isTemplate && !e.archived);
  const k = estimateKpis(real, statusRows);
  const inv = invoiceKpis(invoices, today);
  const activeJobs = jobs.filter((j) => !j.archived && j.status !== "Completed" && j.status !== "Cancelled");
  const inProgress = activeJobs.filter((j) => j.status === "In progress").length;
  const pipeline = pipelineByStage(leads);
  const openLeads = pipeline.filter((p) => p.stage !== "Won" && p.stage !== "Lost");
  const pipelineValue = openLeads.reduce((a, p) => a + p.value, 0);
  const breakdown = statusBreakdown(real, statusRows.filter((s) => s.active).map((s) => s.name));
  const recent = real.slice(0, 8);
  const latestEstimate = real.find((e) => !e.isSample) ?? real[0];
  const steps = quickStartSteps(
    {
      estimates: real.filter((e) => !e.isSample).length,
      plans: planCount,
      catalogueItems: catCount,
      sentQuotes: real.filter((e) => e.sentAt || /sent|accepted/i.test(e.status)).length,
      jobs: jobs.length,
    },
    { latestEstimateId: latestEstimate?.id },
  );
  const stepsDone = steps.filter((s) => s.done).length;
  const labels = await resolveEntityLabels([...reminders, ...activity]);
  const overdueReminders = reminders.filter((r) => r.dueDate! < today).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${settings.businessName} · ${new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <>
            <LinkButton href="/reminders?new=1" variant="secondary">+ Reminder</LinkButton>
            <LinkButton href="/estimates/new">+ New estimate</LinkButton>
          </>
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open estimates" href="/estimates" value={k.openCount} sub={<>{money(k.openValue, { cents: false })} in play</>} testId="kpi-open" />
        <Kpi
          label="Win rate"
          href="/estimates"
          testId="kpi-winrate"
          value={k.winRate === null ? "—" : `${Math.round(k.winRate * 100)}%`}
          sub={
            k.winRate === null ? (
              <>Close {k.closesNeeded} more estimate{k.closesNeeded === 1 ? "" : "s"} to unlock (needs {MIN_CLOSED_FOR_WIN_RATE} won or lost)</>
            ) : (
              <>{k.accepted} won · {k.rejected} lost</>
            )
          }
        />
        <Kpi label="Active jobs" href="/jobs" value={activeJobs.length} sub={<>{inProgress} in progress</>} testId="kpi-jobs" />
        <Kpi
          label="Invoices outstanding"
          href="/invoices"
          testId="kpi-invoices"
          value={money(inv.outstanding, { cents: false })}
          sub={
            inv.overdue > 0 ? (
              <span className="font-medium text-red-600">{money(inv.overdue, { cents: false })} overdue ({inv.overdueCount})</span>
            ) : inv.outstandingCount ? (
              <>{inv.outstandingCount} unpaid · none overdue</>
            ) : (
              <>Nothing owed right now</>
            )
          }
        />
      </section>

      {settings.showDashboardQuickStart && (
        <Card
          title={`Getting started · ${stepsDone} of ${steps.length}`}
          actions={<Link href="/settings/display" className="text-xs text-ink-500 hover:text-brand-700">Hide this</Link>}
        >
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(stepsDone / steps.length) * 100}%` }} />
          </div>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Quick start checklist">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  data-done={s.done}
                  className={cx(
                    "flex h-full gap-2.5 rounded-md border p-3 transition-colors",
                    s.done ? "border-brand-100 bg-brand-50/60" : "border-ink-200 hover:border-brand-300 hover:bg-ink-50",
                  )}
                >
                  <span
                    className={cx(
                      "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                      s.done ? "bg-brand-600 text-white" : "border border-ink-300 text-ink-500",
                    )}
                    aria-label={s.done ? "Done" : "To do"}
                  >
                    {s.done ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cx("block text-sm font-medium", s.done ? "text-ink-500 line-through decoration-ink-300" : "text-ink-900")}>{s.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-500">{s.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Recent estimates" pad={false} actions={<Link href="/estimates" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>}>
            {recent.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-ink-800">No estimates yet</p>
                <p className="mt-1 text-sm text-ink-500">Your latest quotes will appear here.</p>
                <LinkButton href="/estimates/new" className="mt-3">Create an estimate</LinkButton>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" aria-label="Recent estimates">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-500">
                      <th className="px-4 py-2 font-semibold">Estimate</th>
                      <th className="hidden px-3 py-2 font-semibold sm:table-cell">Client</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-4 py-2 text-right font-semibold">Total</th>
                      <th className="hidden px-4 py-2 text-right font-semibold md:table-cell">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((e) => (
                      <tr key={e.id} className="border-t border-ink-100 hover:bg-ink-50">
                        <td className="px-4 py-2">
                          <Link href={`/estimates/${e.id}`} className="block max-w-[11rem] truncate font-medium sm:max-w-[16rem] xl:max-w-[22rem] text-ink-900 hover:text-brand-700">
                            <span className="mr-1.5 font-normal text-ink-400 tabular-nums">{e.number}</span>
                            {e.name}
                          </Link>
                        </td>
                        <td className="hidden max-w-[12rem] truncate px-3 py-2 text-ink-600 sm:table-cell">{e.clientName || <span className="text-ink-300">—</span>}</td>
                        <td className="px-3 py-2"><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                        <td className="px-4 py-2 text-right tabular-nums text-ink-900">{money(e.quoteTotal)}</td>
                        <td className="hidden whitespace-nowrap px-4 py-2 text-right text-xs text-ink-500 md:table-cell">{timeAgo(e.updatedAt) ?? date(e.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {settings.showDashboardEstimateSummary && (
            <Card title="Estimate summary" actions={<span className="text-xs text-ink-500 tabular-nums">{real.length} estimate{real.length === 1 ? "" : "s"} · {money(real.reduce((a, e) => a + (e.quoteTotal || 0), 0), { cents: false })}</span>}>
              {real.length === 0 ? (
                <p className="text-sm text-ink-400">Status totals appear once you have estimates.</p>
              ) : (
                <>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                    {breakdown.filter((b) => b.count).map((b, i) => (
                      <div key={b.status} className={cx("h-full", SEG[i % SEG.length])} style={{ width: `${b.share * 100}%` }} title={`${b.status}: ${b.count}`} />
                    ))}
                  </div>
                  <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3" aria-label="Estimates by status">
                    {breakdown.map((b) => {
                      const i = breakdown.filter((x) => x.count).indexOf(b);
                      return (
                        <li key={b.status} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2 text-ink-700">
                            <span className={cx("size-2 shrink-0 rounded-full", i >= 0 ? SEG[i % SEG.length] : "bg-ink-200")} />
                            <span className="truncate">{b.status}</span>
                          </span>
                          <span className="whitespace-nowrap tabular-nums text-ink-900">
                            {b.count} <span className="text-xs text-ink-400">· {money(b.value, { cents: false })}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Card>
          )}

          <Card title="Recent activity">
            {activity.length === 0 ? (
              <p className="text-sm text-ink-400">Changes across estimates, jobs and invoices will be logged here.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-ink-200 pl-4" aria-label="Activity feed">
                {activity.map((a) => {
                  const href = entityHref(a.entityType, a.entityId);
                  const label = labels.get(`${a.entityType}:${a.entityId}`);
                  return (
                    <li key={a.id} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" aria-hidden />
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-ink-800">
                          {a.summary}
                          {href && label && (
                            <>
                              {" · "}
                              <Link href={href} className="text-brand-700 hover:underline">{label}</Link>
                            </>
                          )}
                        </span>
                        <time dateTime={a.createdAt} className="text-xs text-ink-400">{timeAgo(a.createdAt) ?? date(a.createdAt)}</time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card
            title={
              <span className="flex items-center gap-2">
                Reminders
                {overdueReminders > 0 && <span className="rounded-full bg-red-50 px-1.5 text-[11px] font-semibold normal-case tracking-normal text-red-700">{overdueReminders} overdue</span>}
              </span>
            }
            actions={<Link href="/reminders" className="text-xs font-medium text-brand-700 hover:underline">All reminders</Link>}
          >
            {reminders.length === 0 ? (
              <div className="text-sm text-ink-400">
                Nothing due this week.{" "}
                <Link href="/reminders?new=1" className="text-brand-700 hover:underline">Add a reminder</Link>
              </div>
            ) : (
              <ul className="-my-2.5 divide-y divide-ink-100" aria-label="Upcoming reminders">
                {reminders.map((r) => (
                  <ReminderRow key={r.id} r={r} today={today} compact linkLabel={labels.get(`${r.entityType}:${r.entityId}`)} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Leads pipeline" actions={<Link href="/leads" className="text-xs font-medium text-brand-700 hover:underline">Open leads</Link>}>
            {leads.filter((l) => !l.archived).length === 0 ? (
              <div className="text-sm text-ink-400">
                No leads yet. <Link href="/leads" className="text-brand-700 hover:underline">Add your first lead</Link>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-xs text-ink-500">{plural(openLeads.reduce((a, p) => a + p.count, 0), "open lead")}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink-900">{money(pipelineValue, { cents: false })}</span>
                </div>
                <ul className="space-y-2" aria-label="Pipeline by stage">
                  {pipeline.map((p) => (
                    <li key={p.stage} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink-700">{p.stage}</span>
                        <span className="tabular-nums text-ink-900">
                          <span className="text-xs text-ink-400">{p.count} · </span>
                          {money(p.value, { cents: false })}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                        <div
                          className={cx("h-full rounded-full", p.stage === "Won" ? "bg-emerald-500" : p.stage === "Lost" ? "bg-red-300" : "bg-brand-500")}
                          style={{ width: `${Math.max(p.count ? 3 : 0, p.share * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const SEG = ["bg-brand-500", "bg-sky-500", "bg-amber-400", "bg-emerald-500", "bg-red-400", "bg-violet-400", "bg-ink-400"];

function Kpi({ label, value, sub, href, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href: string; testId: string }) {
  return (
    <Link href={href} data-testid={testId} className="group rounded-lg border border-ink-200 bg-white p-4 shadow-xs transition-colors hover:border-brand-300">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500 group-hover:text-brand-700">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-ink-500">{sub}</div>}
    </Link>
  );
}

