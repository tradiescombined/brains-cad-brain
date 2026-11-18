import "server-only";
import { db, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import { calculate, parseMarkupLines, type CalcResult, type Redistribution, type Rounding } from "./calc";

/** Loads an estimate with its items, measurements and tax rate. */
export async function loadEstimate(estimateId: string) {
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId));
  if (!est) return null;
  const items = await db
    .select()
    .from(schema.estimateItems)
    .where(eq(schema.estimateItems.estimateId, estimateId))
    .orderBy(asc(schema.estimateItems.sortOrder));
  const ms = await db.select().from(schema.measurements).where(eq(schema.measurements.estimateId, estimateId));
  const tax = est.taxRateId
    ? (await db.select().from(schema.taxRates).where(eq(schema.taxRates.id, est.taxRateId)))[0]
    : undefined;
  return { estimate: est, items, measurements: ms, taxRate: tax?.rate ?? 0, taxRateRow: tax };
}

export type LoadedEstimate = NonNullable<Awaited<ReturnType<typeof loadEstimate>>>;

export function calcLoaded(l: LoadedEstimate): CalcResult {
  const measurements: Record<string, number> = {};
  for (const m of l.measurements) measurements[m.code] = m.value;
  return calculate({
    items: l.items.map((i) => ({ ...i, taxable: i.taxable })),
    markupLines: parseMarkupLines(l.estimate.markupLines),
    taxRate: l.taxRate,
    measurements,
    pcpsRedistribution: l.estimate.pcpsRedistribution as Redistribution,
    rounding: l.estimate.rounding as Rounding,
  });
}

/**
 * Recomputes every row and the estimate totals and writes cached values back.
 * Call after ANY change to items, measurements, markup, tax or rounding.
 */
export async function recalcEstimate(estimateId: string): Promise<CalcResult | null> {
  const l = await loadEstimate(estimateId);
  if (!l) return null;
  const r = calcLoaded(l);
  for (const it of l.items) {
    const ri = r.items[it.id];
    if (!ri) continue;
    if (ri.quantity !== it.quantity || ri.total !== it.total || ri.totalIncMarkup !== it.totalIncMarkup) {
      await db
        .update(schema.estimateItems)
        .set({ quantity: it.kind === "category" ? 0 : ri.quantity, total: ri.total, totalIncMarkup: ri.totalIncMarkup })
        .where(eq(schema.estimateItems.id, it.id));
    }
  }
  await db
    .update(schema.estimates)
    .set({ costTotal: r.costTotal, markupTotal: r.markupTotal, taxTotal: r.taxTotal, quoteTotal: r.quoteTotal })
    .where(eq(schema.estimates.id, estimateId));
  return r;
}
