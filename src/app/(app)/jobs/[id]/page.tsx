import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { Badge, Card, Field, Input, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx, date, money, todayIso } from "@/lib/format";
import { summarise, taskFinish, taskStart } from "@/lib/scheduling";
import { archiveJob, updateJob } from "../actions";
import { getJob, loadJobFinance, loadTasks, JOB_STATUSES } from "../../schedule/_lib/job-data";
import { ActionForm, ConfirmSubmit } from "../../schedule/_lib/client";
import { ProgressBar, pctText, signTone } from "../../schedule/_lib/bits";
import { currentPermissions } from "@/lib/permissions";

export default async function JobOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const p = await currentPermissions();
  const [f, tasks, clients, contacts] = await Promise.all([
    loadJobFinance(job),
    loadTasks(id),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.archived, false)).orderBy(asc(schema.clients.name)),
    db.select({ id: schema.contacts.id, name: schema.contacts.name, businessName: schema.contacts.businessName }).from(schema.contacts),
  ]);
  const estimate = job.estimateId ? (await db.select({ id: schema.estimates.id, number: schema.estimates.number, name: schema.estimates.name }).from(schema.estimates).where(eq(schema.estimates.id, job.estimateId)))[0] : undefined;
  const today = todayIso();
  const sched = summarise(tasks.map((t) => ({ ...t, dependsOn: t.deps })), today);
  const contactName = new Map(contacts.map((c) => [c.id, c.businessName || c.name]));
  const upcoming = tasks
    .filter((t) => t.progress < 100)
    .sort((a, b) => taskStart(a).localeCompare(taskStart(b)))
    .slice(0, 6);

  // `money` = contract/invoice figures (invoices.view); `cost` = budget, actuals and margin (costs.view).
  const allCards: { label: string; value: string; sub?: string; tone?: string; need: "invoices.view" | "costs.view" }[] = [
    { need: "invoices.view", label: "Contract value", value: money(f.revisedContract), sub: f.approvedVariationCount ? `${money(f.originalContract)} + ${f.approvedVariationCount} approved variation${f.approvedVariationCount === 1 ? "" : "s"}` : "Inc tax · no approved variations" },
    { need: "costs.view", label: "Budget cost", value: money(f.revisedBudget), sub: f.variationCost ? `incl. ${money(f.variationCost)} variations` : "Ex tax" },
    { need: "costs.view", label: "Actual cost to date", value: money(f.actualToDate), sub: `${money(f.actualCosts)} costs + ${money(f.labourCost)} labour`, tone: f.actualToDate > f.revisedBudget && f.revisedBudget > 0 ? "text-red-700" : undefined },
    { need: "invoices.view", label: "Invoiced", value: money(f.invoiced), sub: `${pctText(f.invoicedPercent, 0)} of contract` },
    { need: "invoices.view", label: "Paid", value: money(f.paid) },
    { need: "invoices.view", label: "Outstanding", value: money(f.outstanding), tone: f.outstanding > 0 ? "text-amber-700" : undefined },
    { need: "costs.view", label: "Forecast margin", value: f.revisedContractExTax ? pctText(f.forecastMarginPercent) : "—", sub: `${money(f.forecastMargin)} on ${money(f.forecastCost)} forecast cost`, tone: f.forecastMargin < 0 ? "text-red-700" : "text-emerald-700" },
    { need: "costs.view", label: "Work in progress", value: money(f.wip), sub: f.wip >= 0 ? `Under-billed · ${pctText(f.percentComplete, 0)} complete by cost` : `Over-billed · ${pctText(f.percentComplete, 0)} complete by cost` },
  ];
  const cards = allCards.filter((c) => p[c.need]);

  return (
    <div className="space-y-6">
      {cards.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="finance-cards">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-ink-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{c.label}</div>
            <div className={cx("mt-1 text-xl font-semibold tabular-nums text-ink-900", c.tone)}>{c.value}</div>
            {c.sub && <div className="mt-0.5 truncate text-xs text-ink-500" title={c.sub}>{c.sub}</div>}
          </div>
        ))}
      </div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {p["costs.view"] && <Card title="Budget vs actual by category" pad={false} actions={<Link href={`/jobs/${id}/costs`} className="text-xs font-medium text-brand-700 hover:underline">Cost tracking →</Link>}>
            {f.byCategory.length === 0 ? (
              <p className="p-4 text-sm text-ink-500">No budget or costs yet. <Link className="text-brand-700 hover:underline" href={`/jobs/${id}/costs`}>Add budget lines or costs</Link>.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <Th>Category</Th>
                      <Th className="text-right">Budget</Th>
                      <Th className="text-right">Actual</Th>
                      <Th className="text-right">Variance</Th>
                      <Th className="w-40">Used</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.byCategory.map((r) => (
                      <tr key={r.category} className={r.over ? "bg-red-50/60" : undefined}>
                        <Td className="font-medium">{r.category}{r.over && <span className="ml-2"><Badge tone="red">Over budget</Badge></span>}</Td>
                        <Td className="text-right tabular-nums">{money(r.budget)}</Td>
                        <Td className="text-right tabular-nums">{money(r.actual)}</Td>
                        <Td className={cx("text-right tabular-nums", signTone(r.variance))}>{money(r.variance)}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={r.percentUsed} over={r.over} label={`${r.category} used`} />
                            <span className="w-10 text-right text-xs tabular-nums text-ink-600">{pctText(r.percentUsed, 0)}</span>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <Td>Total</Td>
                      <Td className="text-right tabular-nums">{money(f.revisedBudget)}</Td>
                      <Td className="text-right tabular-nums">{money(f.actualToDate)}</Td>
                      <Td className={cx("text-right tabular-nums", signTone(f.revisedBudget - f.actualToDate))}>{money(f.revisedBudget - f.actualToDate)}</Td>
                      <Td><ProgressBar value={f.revisedBudget ? (f.actualToDate / f.revisedBudget) * 100 : 0} over={f.actualToDate > f.revisedBudget} label="Total used" /></Td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>}

          <Card title="Job details">
            <ActionForm action={updateJob} successText="Job details saved." className="space-y-4">
              <input type="hidden" name="id" value={job.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Job name" className="sm:col-span-2"><Input name="name" defaultValue={job.name} required /></Field>
                <Field label="Status"><Select name="status" defaultValue={job.status} options={[...JOB_STATUSES]} /></Field>
                <Field label="Project manager"><Input name="projectManager" defaultValue={job.projectManager ?? ""} /></Field>
                <Field label="Start date"><Input type="date" name="startDate" defaultValue={job.startDate ?? ""} /></Field>
                <Field label="Finish date"><Input type="date" name="endDate" defaultValue={job.endDate ?? ""} /></Field>
                <Field label="Client"><Select name="clientId" defaultValue={job.clientId ?? ""} options={clients.map((c) => ({ value: c.id, label: c.name }))} placeholder="— No client —" /></Field>
                {p["invoices.view"] ? (
                  <Field label="Contract value (inc tax)" hint="Includes approved variations. Approving or withdrawing a variation updates this automatically.">
                    <Input name="contractValue" inputMode="decimal" defaultValue={String(job.contractValue)} />
                  </Field>
                ) : (
                  <input type="hidden" name="contractValue" value={String(job.contractValue)} />
                )}
                <Field label="Site address" className="sm:col-span-2"><Input name="siteAddress" defaultValue={job.siteAddress ?? ""} /></Field>
                <Field label="Suburb / town"><Input name="siteCityTown" defaultValue={job.siteCityTown ?? ""} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="State"><Input name="siteState" defaultValue={job.siteState ?? ""} /></Field>
                  <Field label="Postcode"><Input name="sitePostcode" defaultValue={job.sitePostcode ?? ""} /></Field>
                </div>
                <Field label="Description" className="sm:col-span-2"><Textarea name="description" rows={3} defaultValue={job.description ?? ""} /></Field>
              </div>
              <div className="flex items-center justify-between border-t border-ink-100 pt-4">
                <span className="text-xs text-ink-500">
                  {estimate ? <>From estimate <Link href={`/estimates/${estimate.id}`} className="text-brand-700 hover:underline">{estimate.number} · {estimate.name}</Link></> : "Blank job (no estimate)"}
                </span>
                {p["jobs.edit"] && <SubmitButton>Save details</SubmitButton>}
              </div>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Schedule" actions={<Link href={`/jobs/${id}/schedule`} className="text-xs font-medium text-brand-700 hover:underline">Open Gantt →</Link>}>
            {tasks.length === 0 ? (
              <p className="text-sm text-ink-500">No tasks scheduled. <Link href={`/jobs/${id}/schedule`} className="text-brand-700 hover:underline">Add the first task</Link>.</p>
            ) : (
              <>
                <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-xs text-ink-500">Starts</dt><dd>{date(sched.start)}</dd></div>
                  <div><dt className="text-xs text-ink-500">Finishes</dt><dd>{date(sched.finish)}</dd></div>
                  <div><dt className="text-xs text-ink-500">Working days</dt><dd className="tabular-nums">{sched.workingDays}</dd></div>
                  <div><dt className="text-xs text-ink-500">Complete</dt><dd className="tabular-nums">{sched.percentComplete}%</dd></div>
                </dl>
                <ProgressBar value={sched.percentComplete} label="Schedule complete" />
                <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Upcoming tasks</h3>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-ink-500">All tasks are complete.</p>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {upcoming.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 py-2 text-sm">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: t.colour || "#0a8077" }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-ink-900">{t.name}</div>
                          <div className="text-xs text-ink-500">
                            {date(taskStart(t))} – {date(taskFinish(t))}
                            {t.assigneeContactId && contactName.get(t.assigneeContactId) ? ` · ${contactName.get(t.assigneeContactId)}` : ""}
                          </div>
                        </div>
                        {sched.overdue.has(t.id) ? <Badge tone="red">Overdue</Badge> : sched.critical.has(t.id) ? <Badge tone="amber">Critical</Badge> : <span className="text-xs tabular-nums text-ink-500">{t.progress}%</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>

          {p["jobs.edit"] && <Card title="Danger zone">
            <p className="mb-3 text-sm text-ink-600">Archiving hides this job from lists and the schedule and frees its estimate to create a new job. Its records are kept.</p>
            <form action={archiveJob}>
              <input type="hidden" name="id" value={job.id} />
              <ConfirmSubmit confirmText="Yes, archive job">Archive job</ConfirmSubmit>
            </form>
          </Card>}
        </div>
      </div>
    </div>
  );
}
