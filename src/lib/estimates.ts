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

const LEAD_STAGE_ORDER = ["New", "Contacted", "Site visit", "Quoting", "Quote sent", "Won", "Lost"] as const;

/**
 * Keeps a linked lead's stage in step with its estimate:
 *  - estimate in the accepted-flag status  → lead "Won" (probability 100)
 *  - estimate sent (sentAt or status "Sent") → lead "Quote sent" if it was at an earlier stage
 * Never moves a lead backwards, and never auto-marks "Lost" (that needs a reason).
 * Call after any estimate status / sent change.
 */
export async function syncLeadWithEstimate(estimateId: string): Promise<void> {
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId));
  if (!est?.leadId) return;
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, est.leadId));
  if (!lead || lead.stage === "Won" || lead.stage === "Lost") return;
  const statuses = await db.select().from(schema.lookups).where(eq(schema.lookups.kind, "estimate_status"));
  const accepted = statuses.some((s) => s.flag && s.name === est.status);
  const rank = (s: string) => LEAD_STAGE_ORDER.indexOf(s as (typeof LEAD_STAGE_ORDER)[number]);
  if (accepted) {
    await db.update(schema.leads).set({ stage: "Won", probability: 100, lostReason: null }).where(eq(schema.leads.id, lead.id));
    await db.insert(schema.activity).values({ entityType: "lead", entityId: lead.id, action: "won", summary: `Lead ${lead.number ?? ""} won: quote ${est.number} accepted`.replace("  ", " ") });
  } else if ((est.sentAt || est.status.toLowerCase() === "sent") && rank(lead.stage) < rank("Quote sent")) {
    await db.update(schema.leads).set({ stage: "Quote sent" }).where(eq(schema.leads.id, lead.id));
    await db.insert(schema.activity).values({ entityType: "lead", entityId: lead.id, action: "stage", summary: `Lead ${lead.number ?? ""} moved to Quote sent (${est.number})`.replace("  ", " ") });
  }
}
