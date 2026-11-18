/**
 * Server-side loaders shared by the jobs module (list, overview, tabs, /schedule).
 * Kept here (module 9 owns schedule/**) so every jobs page reads finance the same way.
 */
import "server-only";
import { db, schema } from "@/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { computeFinance, type JobFinance } from "@/lib/job-finance";
import { getDefaultTaxRate } from "@/lib/settings";
import { parseDependsOn } from "@/lib/scheduling";

export type Job = typeof schema.jobs.$inferSelect;
export type JobTask = typeof schema.jobTasks.$inferSelect;
export type BudgetLine = typeof schema.jobBudgetLines.$inferSelect;
export type ActualCost = typeof schema.actualCosts.$inferSelect;

export async function getJob(id: string) {
  const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return j ?? null;
}

/** Tax rate that applies to a job's contract: its estimate's tax profile, else the default. */
async function jobTaxRate(job: Job): Promise<number> {
  if (job.estimateId) {
    const [e] = await db.select({ taxRateId: schema.estimates.taxRateId }).from(schema.estimates).where(eq(schema.estimates.id, job.estimateId));
    if (e?.taxRateId) {
      const [t] = await db.select().from(schema.taxRates).where(eq(schema.taxRates.id, e.taxRateId));
      if (t) return t.rate;
    }
  }
  return (await getDefaultTaxRate()).rate;
}

export async function loadJobFinance(job: Job): Promise<JobFinance> {
  const [budgetLines, actualCosts, timesheets, variations, invoices, taxRate] = await Promise.all([
    db.select().from(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.jobId, job.id)),
    db.select().from(schema.actualCosts).where(eq(schema.actualCosts.jobId, job.id)),
    db.select().from(schema.timesheets).where(eq(schema.timesheets.jobId, job.id)),
    db.select().from(schema.variations).where(eq(schema.variations.jobId, job.id)),
    db.select().from(schema.invoices).where(eq(schema.invoices.jobId, job.id)),
    jobTaxRate(job),
  ]);
  return computeFinance({ contractValue: job.contractValue, taxRate, budgetLines, actualCosts, timesheets, variations, invoices });
}

/** Finance for many jobs at once (jobs list). */
export async function loadFinanceForJobs(jobs: Job[]): Promise<Map<string, JobFinance>> {
  const out = new Map<string, JobFinance>();
  if (jobs.length === 0) return out;
  const ids = jobs.map((j) => j.id);
  const [budgetLines, actualCosts, timesheets, variations, invoices, estimates, rates, def] = await Promise.all([
    db.select().from(schema.jobBudgetLines).where(inArray(schema.jobBudgetLines.jobId, ids)),
    db.select().from(schema.actualCosts).where(inArray(schema.actualCosts.jobId, ids)),
    db.select().from(schema.timesheets).where(inArray(schema.timesheets.jobId, ids)),
    db.select().from(schema.variations).where(inArray(schema.variations.jobId, ids)),
    db.select().from(schema.invoices).where(inArray(schema.invoices.jobId, ids)),
    db.select({ id: schema.estimates.id, taxRateId: schema.estimates.taxRateId }).from(schema.estimates),
    db.select().from(schema.taxRates),
    getDefaultTaxRate(),
  ]);
  const estRate = new Map(estimates.map((e) => [e.id, rates.find((r) => r.id === e.taxRateId)?.rate]));
  const group = <T extends { jobId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.jobId, [...(m.get(r.jobId) ?? []), r]);
    return m;
  };
  const [bl, ac, ts, va, inv] = [group(budgetLines), group(actualCosts), group(timesheets), group(variations), group(invoices)];
  for (const j of jobs) {
    out.set(
      j.id,
      computeFinance({
        contractValue: j.contractValue,
        taxRate: (j.estimateId ? estRate.get(j.estimateId) : undefined) ?? def.rate,
        budgetLines: bl.get(j.id) ?? [],
        actualCosts: ac.get(j.id) ?? [],
        timesheets: ts.get(j.id) ?? [],
        variations: va.get(j.id) ?? [],
        invoices: inv.get(j.id) ?? [],
      }),
    );
  }
  return out;
}

/** Display name for a job's client: linked client, else the estimate's client snapshot. */
export async function clientNames(jobs: Job[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients);
  const estIds = jobs.map((j) => j.estimateId).filter((x): x is string => !!x);
  const ests = estIds.length
    ? await db.select({ id: schema.estimates.id, clientName: schema.estimates.clientName }).from(schema.estimates).where(inArray(schema.estimates.id, estIds))
    : [];
  const cMap = new Map(clients.map((c) => [c.id, c.name]));
  const eMap = new Map(ests.map((e) => [e.id, e.clientName]));
  for (const j of jobs) {
    const n = (j.clientId && cMap.get(j.clientId)) || (j.estimateId && eMap.get(j.estimateId)) || "";
    if (n) out.set(j.id, n);
  }
  return out;
}

export async function loadTasks(jobId: string) {
  const rows = await db.select().from(schema.jobTasks).where(eq(schema.jobTasks.jobId, jobId)).orderBy(asc(schema.jobTasks.sortOrder), asc(schema.jobTasks.startDate));
  return rows.map((r) => ({ ...r, deps: parseDependsOn(r.dependsOn) }));
}

/** Suppliers / subcontractors / any active contact, for assignee and supplier pickers. */
export async function contactOptions() {
  const rows = await db
    .select({ id: schema.contacts.id, name: schema.contacts.name, businessName: schema.contacts.businessName, contactType: schema.contacts.contactType })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.archived, false)))
    .orderBy(asc(schema.contacts.name));
  return rows.map((c) => ({ value: c.id, label: c.businessName || c.name, type: c.contactType ?? "" }));
}

export * from "./constants";
