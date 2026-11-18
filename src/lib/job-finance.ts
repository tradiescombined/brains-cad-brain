/**
 * Job financials (pure, no DB): budget vs actual, margin, invoicing and work-in-progress.
 *
 * Conventions
 * - `contractValue` on the job is the REVISED contract (inc tax): the accepted quote total
 *   plus approved variations. Approving a variation adds its total to jobs.contractValue
 *   (orders/variations module); original contract = contractValue - approved variations.
 * - Budget and actual costs are ex tax. Revenue for margin is converted to ex tax.
 * - Actual cost to date = Σ actual cost amounts (ex tax) + Σ timesheet hours × rate.
 * - Invoiced = Σ non-void invoice totals (inc tax); paid = Σ amount paid on those invoices.
 * - Forecast cost = Σ per budget line max(budget, actual)
 *   + max(approved variation cost, unallocated actuals + timesheet labour).
 *   (Spend not linked to a budget line is assumed to draw down variation budget first.)
 */

export interface FinBudgetLine { id: string; category: string; budget: number }
export interface FinActualCost { budgetLineId: string | null; amount: number }
export interface FinTimesheet { hours: number; rate: number }
export interface FinVariation { status: string; total: number; taxTotal?: number; costTotal?: number }
export interface FinInvoice { status: string; total: number; subtotal?: number; amountPaid: number }

export interface FinanceInput {
  contractValue: number;
  /** Tax rate used to convert the original contract to ex tax (0.1 = 10%). */
  taxRate: number;
  budgetLines: FinBudgetLine[];
  actualCosts: FinActualCost[];
  timesheets: FinTimesheet[];
  variations: FinVariation[];
  invoices: FinInvoice[];
}

export interface CategoryRow {
  category: string;
  budget: number;
  actual: number;
  variance: number; // budget - actual (negative = over budget)
  percentUsed: number; // actual / budget × 100 (Infinity-safe)
  over: boolean;
}

export interface JobFinance {
  originalContract: number;
  approvedVariations: number;
  approvedVariationCount: number;
  revisedContract: number;
  revisedContractExTax: number;
  budgetCost: number;
  variationCost: number;
  revisedBudget: number;
  actualCosts: number;
  labourCost: number;
  labourHours: number;
  actualToDate: number;
  forecastCost: number;
  invoiced: number;
  invoicedExTax: number;
  invoicedPercent: number;
  paid: number;
  outstanding: number;
  budgetMargin: number;
  budgetMarginPercent: number;
  forecastMargin: number;
  forecastMarginPercent: number;
  /** Cost-based percent complete (actual / forecast). */
  percentComplete: number;
  earnedRevenue: number;
  /** Earned revenue - invoiced ex tax. Positive = under-billed, negative = over-billed. */
  wip: number;
  byCategory: CategoryRow[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);

export const UNALLOCATED = "Unallocated costs";
export const TIMESHEETS = "Labour (timesheets)";
export const VARIATIONS = "Approved variations";

export function isApproved(v: { status: string }) {
  return v.status === "Approved";
}
export function isCountedInvoice(i: { status: string }) {
  return i.status !== "Void";
}

export function timesheetCost(t: FinTimesheet) {
  return r2((Number(t.hours) || 0) * (Number(t.rate) || 0));
}

export function budgetVsActual(input: Pick<FinanceInput, "budgetLines" | "actualCosts" | "timesheets" | "variations">): CategoryRow[] {
  const lineCat = new Map(input.budgetLines.map((l) => [l.id, l.category || "General"]));
  const rows = new Map<string, { budget: number; actual: number }>();
  const get = (c: string) => {
    if (!rows.has(c)) rows.set(c, { budget: 0, actual: 0 });
    return rows.get(c)!;
  };
  for (const l of input.budgetLines) get(l.category || "General").budget += Number(l.budget) || 0;
  for (const a of input.actualCosts) {
    const c = (a.budgetLineId && lineCat.get(a.budgetLineId)) || UNALLOCATED;
    get(c).actual += Number(a.amount) || 0;
  }
  const varCost = sum(input.variations.filter(isApproved), (v) => v.costTotal ?? 0);
  if (varCost) get(VARIATIONS).budget += varCost;
  const labour = sum(input.timesheets, timesheetCost);
  if (labour) get(TIMESHEETS).actual += labour;
  return [...rows].map(([category, v]) => {
    const budget = r2(v.budget);
    const actual = r2(v.actual);
    return { category, budget, actual, variance: r2(budget - actual), percentUsed: budget ? (actual / budget) * 100 : actual ? 100 : 0, over: actual > budget + 0.005 };
  });
}

/** Per budget line actuals (ex tax). */
export function actualByLine(costs: FinActualCost[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of costs) if (c.budgetLineId) m.set(c.budgetLineId, r2((m.get(c.budgetLineId) ?? 0) + (Number(c.amount) || 0)));
  return m;
}

export function computeFinance(input: FinanceInput): JobFinance {
  const approved = input.variations.filter(isApproved);
  const approvedVariations = r2(sum(approved, (v) => v.total));
  const approvedVariationsExTax = r2(sum(approved, (v) => v.total - (v.taxTotal ?? 0)));
  const variationCost = r2(sum(approved, (v) => v.costTotal ?? 0));
  const revisedContract = r2(Number(input.contractValue) || 0);
  const originalContract = r2(revisedContract - approvedVariations);
  const revisedContractExTax = r2(originalContract / (1 + (Number(input.taxRate) || 0)) + approvedVariationsExTax);

  const budgetCost = r2(sum(input.budgetLines, (l) => l.budget));
  const revisedBudget = r2(budgetCost + variationCost);
  const actualCosts = r2(sum(input.actualCosts, (a) => a.amount));
  const labourCost = r2(sum(input.timesheets, timesheetCost));
  const labourHours = r2(sum(input.timesheets, (t) => t.hours));
  const actualToDate = r2(actualCosts + labourCost);

  // Forecast: lines can only overrun, never underrun until the job completes.
  const byLine = actualByLine(input.actualCosts);
  const knownLines = new Set(input.budgetLines.map((l) => l.id));
  let forecast = 0;
  for (const l of input.budgetLines) forecast += Math.max(Number(l.budget) || 0, byLine.get(l.id) ?? 0);
  const unallocated = sum(input.actualCosts.filter((a) => !a.budgetLineId || !knownLines.has(a.budgetLineId)), (a) => a.amount);
  // Labour and unallocated spend are assumed to draw down variation cost first.
  forecast += Math.max(variationCost, unallocated + labourCost);
  const forecastCost = r2(forecast);

  const counted = input.invoices.filter(isCountedInvoice);
  const invoiced = r2(sum(counted, (i) => i.total));
  const invoicedExTax = r2(sum(counted, (i) => i.subtotal ?? i.total));
  const paid = r2(sum(counted, (i) => i.amountPaid));

  const budgetMargin = r2(revisedContractExTax - revisedBudget);
  const forecastMargin = r2(revisedContractExTax - forecastCost);
  const percentComplete = forecastCost ? Math.min(100, (actualToDate / forecastCost) * 100) : 0;
  const earnedRevenue = r2((revisedContractExTax * percentComplete) / 100);

  return {
    originalContract,
    approvedVariations,
    approvedVariationCount: approved.length,
    revisedContract,
    revisedContractExTax,
    budgetCost,
    variationCost,
    revisedBudget,
    actualCosts,
    labourCost,
    labourHours,
    actualToDate,
    forecastCost,
    invoiced,
    invoicedExTax,
    invoicedPercent: pct(invoiced, revisedContract),
    paid,
    outstanding: r2(invoiced - paid),
    budgetMargin,
    budgetMarginPercent: pct(budgetMargin, revisedContractExTax),
    forecastMargin,
    forecastMarginPercent: pct(forecastMargin, revisedContractExTax),
    percentComplete,
    earnedRevenue,
    wip: r2(earnedRevenue - invoicedExTax),
    byCategory: budgetVsActual(input),
  };
}

/** Selection: chosen option price minus allowance (positive = client pays extra). */
export interface SelectionOption { name: string; price: number; imageUrl?: string }

export function parseOptions(json: string | null | undefined): SelectionOption[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((o) => o && typeof o.name === "string" && o.name.trim())
      .map((o) => ({ name: String(o.name).trim(), price: r2(Number(o.price) || 0), ...(o.imageUrl ? { imageUrl: String(o.imageUrl) } : {}) }));
  } catch {
    return [];
  }
}

export function selectionDifference(s: { options: SelectionOption[]; chosenOption: string | null; allowance: number | null }) {
  const chosen = s.options.find((o) => o.name === s.chosenOption) ?? null;
  const chosenPrice = chosen ? chosen.price : null;
  const difference = chosenPrice === null || s.allowance === null ? null : r2(chosenPrice - s.allowance);
  return { chosen, chosenPrice, difference };
}

/** Timesheet roll-ups. `weekOf` maps a date to its week key (e.g. Monday ISO date). */
export function timesheetTotals<T extends { worker: string; date: string; hours: number; rate: number }>(rows: T[], weekOf: (iso: string) => string) {
  const byWorker = new Map<string, { hours: number; cost: number; entries: number }>();
  const byWeek = new Map<string, { hours: number; cost: number; entries: number }>();
  const add = (m: typeof byWorker, k: string, r: T) => {
    const v = m.get(k) ?? { hours: 0, cost: 0, entries: 0 };
    v.hours = r2(v.hours + (Number(r.hours) || 0));
    v.cost = r2(v.cost + timesheetCost(r));
    v.entries++;
    m.set(k, v);
  };
  for (const r of rows) {
    add(byWorker, r.worker.trim() || "Unnamed", r);
    add(byWeek, weekOf(r.date), r);
  }
  const sortKeys = <V>(m: Map<string, V>, desc = false) => [...m].sort((a, b) => (desc ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])));
  return {
    byWorker: sortKeys(byWorker).map(([worker, v]) => ({ worker, ...v })),
    byWeek: sortKeys(byWeek, true).map(([week, v]) => ({ week, ...v })),
    hours: r2(sum(rows, (r) => r.hours)),
    cost: r2(sum(rows, timesheetCost)),
  };
}
