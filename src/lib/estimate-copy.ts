/**
 * Pure deep-copy + snapshot helpers for estimates (no DB access).
 *
 * Used when creating an estimate from a template, duplicating an estimate, saving as a
 * template, and capturing / restoring estimate versions. The DB orchestration lives in
 * `src/app/(app)/estimates/_components/estimate-db.ts`.
 */
import type { estimates, estimateItems, specifications, quoteOptions, estimateTasks, specItemDetails } from "../db/schema/estimates";
import { parseDependsOn, remapTaskIds } from "./scheduling";
import type { plans, measurements } from "../db/schema/takeoff";

export type EstimateRow = typeof estimates.$inferSelect;
export type ItemRow = typeof estimateItems.$inferSelect;
export type SpecRow = typeof specifications.$inferSelect;
export type QuoteOptionsRow = typeof quoteOptions.$inferSelect;
export type TaskRow = typeof estimateTasks.$inferSelect;
export type SpecItemDetailRow = typeof specItemDetails.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;
export type MeasurementRow = typeof measurements.$inferSelect;

export type IdGen = () => string;
const uuid: IdGen = () => crypto.randomUUID();

/** Drops created/updated timestamps so the DB defaults apply to the new row. */
function stripTimestamps<T extends object>(row: T): Omit<T, "createdAt" | "updatedAt"> {
  const copy = { ...row } as Record<string, unknown>;
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy as Omit<T, "createdAt" | "updatedAt">;
}

/**
 * Gives every row in a parent/child tree a fresh id and rewrites parentId to the new ids.
 * A parentId that points outside the set becomes null (row is promoted to the root).
 */
export function remapTree<T extends { id: string; parentId: string | null }>(rows: T[], gen: IdGen = uuid) {
  const idMap = new Map<string, string>();
  for (const r of rows) idMap.set(r.id, gen());
  const out = rows.map((r) => ({
    ...r,
    id: idMap.get(r.id)!,
    parentId: r.parentId ? idMap.get(r.parentId) ?? null : null,
  }));
  return { rows: out, idMap };
}

export interface EstimateGraph {
  items: ItemRow[];
  specifications: SpecRow[];
  plans: PlanRow[];
  measurements: MeasurementRow[];
  quoteOptions: QuoteOptionsRow | null;
  /** Estimate schedule tasks. */
  tasks: TaskRow[];
  /** Per-item specification detail/images (optional for older callers). */
  specItemDetails?: SpecItemDetailRow[];
}

export interface CopiedGraph {
  items: Omit<ItemRow, never>[];
  specifications: Omit<SpecRow, "createdAt" | "updatedAt">[];
  plans: Omit<PlanRow, "createdAt" | "updatedAt">[];
  measurements: Omit<MeasurementRow, "createdAt" | "updatedAt">[];
  quoteOptions: Omit<QuoteOptionsRow, "createdAt" | "updatedAt"> | null;
  specItemDetails: Omit<SpecItemDetailRow, "createdAt" | "updatedAt">[];
  tasks: Omit<TaskRow, "createdAt" | "updatedAt">[];
}

/** Fresh ids for schedule tasks with `dependsOn` (JSON) rewritten to the new ids. */
export function remapTasks<T extends { id: string; dependsOn: string }>(rows: T[], gen: IdGen = uuid): T[] {
  const parsed = rows.map((r) => ({ ...r, dependsOn: parseDependsOn(r.dependsOn) }));
  return remapTaskIds(parsed, gen).tasks.map((t) => ({ ...t, dependsOn: JSON.stringify(t.dependsOn) }) as unknown as T);
}

/**
 * Builds insertable copies of an estimate's content for `targetEstimateId`.
 * - items & specifications keep their tree shape via id remapping
 * - measurements are re-pointed at the copied plans; items' measurementId follows
 * - quote options are copied without the share token or any client acceptance
 * - schedule tasks get fresh ids; dependency links are remapped to the copied tasks
 */
export function copyEstimateGraph(src: EstimateGraph, targetEstimateId: string, gen: IdGen = uuid): CopiedGraph {
  const planMap = new Map<string, string>();
  const newPlans = src.plans.map((p) => {
    const id = gen();
    planMap.set(p.id, id);
    return { ...stripTimestamps(p), id, estimateId: targetEstimateId };
  });

  const measurementMap = new Map<string, string>();
  const newMeasurements = src.measurements
    .filter((m) => planMap.has(m.planId))
    .map((m) => {
      const id = gen();
      measurementMap.set(m.id, id);
      return { ...stripTimestamps(m), id, estimateId: targetEstimateId, planId: planMap.get(m.planId)! };
    });

  const { rows: remappedItems, idMap: itemMap } = remapTree(src.items, gen);
  const items = remappedItems.map((i) => ({
    ...i,
    estimateId: targetEstimateId,
    measurementId: i.measurementId ? measurementMap.get(i.measurementId) ?? null : null,
  }));

  // Linked sections follow their costing category to its new id.
  const specs = remapTree(src.specifications, gen).rows.map((s) => ({
    ...stripTimestamps(s),
    estimateId: targetEstimateId,
    categoryItemId: s.categoryItemId ? itemMap.get(s.categoryItemId) ?? null : null,
  }));

  const specItemDetails = (src.specItemDetails ?? [])
    .filter((d) => itemMap.has(d.estimateItemId))
    .map((d) => ({ ...stripTimestamps(d), id: gen(), estimateId: targetEstimateId, estimateItemId: itemMap.get(d.estimateItemId)! }));

  const qo = src.quoteOptions
    ? {
        ...stripTimestamps(src.quoteOptions),
        id: gen(),
        estimateId: targetEstimateId,
        shareToken: null,
        acceptanceSignatureName: null,
        acceptanceSignedAt: null,
      }
    : null;

  const tasks = remapTasks(src.tasks.map(stripTimestamps), gen).map((t) => ({ ...t, estimateId: targetEstimateId }));

  return { items, specifications: specs, plans: newPlans, measurements: newMeasurements, quoteOptions: qo, tasks, specItemDetails };
}

/* ----------------------------------------------------------------------------------------- */
/* Version snapshots                                                                          */
/* ----------------------------------------------------------------------------------------- */

export const SNAPSHOT_FORMAT = 1;

export interface EstimateSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  capturedAt: string;
  estimate: EstimateRow;
  items: ItemRow[];
  specifications: SpecRow[];
  /** Schedule tasks. Absent in snapshots taken before the estimate schedule existed. */
  tasks?: TaskRow[];
}

export function buildSnapshot(estimate: EstimateRow, items: ItemRow[], specs: SpecRow[], now = new Date(), tasks?: TaskRow[]): EstimateSnapshot {
  return { format: SNAPSHOT_FORMAT, capturedAt: now.toISOString(), estimate, items, specifications: specs, ...(tasks ? { tasks } : {}) };
}

/** Parses and sanity-checks a stored snapshot. Returns null when it is unusable. */
export function parseSnapshot(json: string | null | undefined): EstimateSnapshot | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== "object") return null;
    if (v.format !== SNAPSHOT_FORMAT) return null;
    if (!v.estimate || typeof v.estimate !== "object") return null;
    if (!Array.isArray(v.items) || !Array.isArray(v.specifications)) return null;
    for (const i of v.items) if (!i || typeof i.id !== "string" || typeof i.estimateId !== "string") return null;
    for (const s of v.specifications) if (!s || typeof s.id !== "string" || typeof s.heading !== "string") return null;
    if (v.tasks !== undefined) {
      if (!Array.isArray(v.tasks)) return null;
      for (const t of v.tasks) if (!t || typeof t.id !== "string" || typeof t.name !== "string" || typeof t.startDate !== "string") return null;
    }
    return v as EstimateSnapshot;
  } catch {
    return null;
  }
}

/** Fields of the estimate itself that a restore brings back (pricing settings that drive totals). */
export const RESTORED_ESTIMATE_FIELDS = ["markupLines", "taxRateId", "pcpsRedistribution", "rounding", "specificationIntro"] as const;

/**
 * Rows to write when restoring `snap` onto `estimateId`.
 * Item and specification ids are kept so links from other records (orders, budgets) still resolve.
 * `tasks` is null for snapshots without a schedule (the current schedule is then left alone).
 */
export function restorePlan(snap: EstimateSnapshot, estimateId: string) {
  const items = snap.items.map((i) => ({ ...i, estimateId }));
  const specifications = snap.specifications.map((s) => ({ ...stripTimestamps(s), estimateId }));
  const estimatePatch: Partial<EstimateRow> = {};
  for (const f of RESTORED_ESTIMATE_FIELDS) {
    if (f in snap.estimate) (estimatePatch as Record<string, unknown>)[f] = snap.estimate[f];
  }
  const tasks = snap.tasks ? snap.tasks.map((t) => ({ ...stripTimestamps(t), estimateId })) : null;
  return { items, specifications, estimatePatch, tasks };
}

/** Splits rows into chunks so large inserts stay within SQLite's bound-variable limit. */
export function chunk<T>(rows: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
