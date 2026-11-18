import "server-only";
import { db, schema } from "@/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { recalcEstimate } from "@/lib/estimates";
import { getLookups, nextNumber } from "@/lib/settings";
import {
  buildSnapshot,
  chunk,
  copyEstimateGraph,
  parseSnapshot,
  restorePlan,
  type EstimateGraph,
  type EstimateRow,
} from "@/lib/estimate-copy";
import { nextTemplateNumber } from "./logic";

type Insert = typeof schema.estimates.$inferInsert;

/** The status flagged as "accepted" in lookups (falls back to a status named Accepted). */
export async function acceptedStatusName(): Promise<string | null> {
  const st = await getLookups("estimate_status");
  return st.find((s) => s.flag)?.name ?? st.find((s) => s.name.toLowerCase() === "accepted")?.name ?? null;
}

export async function firstStatusName(): Promise<string> {
  const st = await getLookups("estimate_status");
  return st[0]?.name ?? "Draft";
}

export async function allocateTemplateNumber(): Promise<string> {
  const rows = await db.select({ number: schema.estimates.number }).from(schema.estimates).where(eq(schema.estimates.isTemplate, true));
  return nextTemplateNumber(rows.map((r) => r.number));
}

async function loadGraph(estimateId: string): Promise<EstimateGraph> {
  const items = await db.select().from(schema.estimateItems).where(eq(schema.estimateItems.estimateId, estimateId)).orderBy(asc(schema.estimateItems.sortOrder));
  const specifications = await db.select().from(schema.specifications).where(eq(schema.specifications.estimateId, estimateId)).orderBy(asc(schema.specifications.sortOrder));
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.estimateId, estimateId)).orderBy(asc(schema.plans.sortOrder));
  const measurements = await db.select().from(schema.measurements).where(eq(schema.measurements.estimateId, estimateId));
  const [qo] = await db.select().from(schema.quoteOptions).where(eq(schema.quoteOptions.estimateId, estimateId));
  const specItemDetails = await db.select().from(schema.specItemDetails).where(eq(schema.specItemDetails.estimateId, estimateId));
  return { items, specifications, plans, measurements, quoteOptions: qo ?? null, specItemDetails };
}

/** Deep-copies items (tree), specifications, quote options, plans and measurements from one estimate to another. */
export async function copyEstimateContent(sourceId: string, targetId: string) {
  const g = copyEstimateGraph(await loadGraph(sourceId), targetId);
  await db.transaction(async (tx) => {
    for (const c of chunk(g.plans, 10)) await tx.insert(schema.plans).values(c);
    for (const c of chunk(g.measurements)) await tx.insert(schema.measurements).values(c);
    for (const c of chunk(g.items)) await tx.insert(schema.estimateItems).values(c);
    for (const c of chunk(g.specifications)) await tx.insert(schema.specifications).values(c);
    for (const c of chunk(g.specItemDetails, 5)) await tx.insert(schema.specItemDetails).values(c);
    if (g.quoteOptions) await tx.insert(schema.quoteOptions).values(g.quoteOptions);
  });
  await recalcEstimate(targetId);
}

/**
 * Creates a new estimate from an existing one (fields + all content).
 * Workflow fields (job link, sent/accepted dates, archive, sample flag) are reset.
 */
export async function cloneEstimate(sourceId: string, overrides: Partial<Insert>): Promise<string | null> {
  const [src] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, sourceId));
  if (!src) return null;
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _id; void _c; void _u;
  const isTemplate = overrides.isTemplate ?? false;
  const number = overrides.number ?? (isTemplate ? await allocateTemplateNumber() : await nextNumber("Estimate"));
  const [row] = await db
    .insert(schema.estimates)
    .values({
      ...rest,
      status: await firstStatusName(),
      jobId: null,
      acceptedAt: null,
      sentAt: null,
      archived: false,
      isSample: false,
      isTemplate,
      ...overrides,
      number,
    })
    .returning({ id: schema.estimates.id });
  await copyEstimateContent(sourceId, row.id);
  return row.id;
}

/** Removes an estimate and everything that belongs to it. */
export async function deleteEstimateCascade(id: string) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.estimateItems).where(eq(schema.estimateItems.estimateId, id));
    await tx.delete(schema.specifications).where(eq(schema.specifications.estimateId, id));
    await tx.delete(schema.specItemDetails).where(eq(schema.specItemDetails.estimateId, id));
    await tx.delete(schema.quoteOptions).where(eq(schema.quoteOptions.estimateId, id));
    await tx.delete(schema.measurements).where(eq(schema.measurements.estimateId, id));
    await tx.delete(schema.plans).where(eq(schema.plans.estimateId, id));
    await tx.delete(schema.estimateVersions).where(eq(schema.estimateVersions.estimateId, id));
    await tx.delete(schema.notes).where(and(eq(schema.notes.entityType, "estimate"), eq(schema.notes.entityId, id)));
    await tx.delete(schema.documents).where(and(eq(schema.documents.entityType, "estimate"), eq(schema.documents.entityId, id)));
    await tx.delete(schema.estimates).where(eq(schema.estimates.id, id));
  });
}

/* ------------------------------------------------------------------ versions */

export async function captureVersion(estimateId: string, label: string) {
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId));
  if (!est) return null;
  const items = await db.select().from(schema.estimateItems).where(eq(schema.estimateItems.estimateId, estimateId)).orderBy(asc(schema.estimateItems.sortOrder));
  const specs = await db.select().from(schema.specifications).where(eq(schema.specifications.estimateId, estimateId)).orderBy(asc(schema.specifications.sortOrder));
  const snap = buildSnapshot(est, items, specs);
  const [v] = await db
    .insert(schema.estimateVersions)
    .values({ estimateId, label, snapshot: JSON.stringify(snap), quoteTotal: est.quoteTotal })
    .returning();
  return v;
}

export async function listVersions(estimateId: string) {
  const rows = await db
    .select({ id: schema.estimateVersions.id, label: schema.estimateVersions.label, quoteTotal: schema.estimateVersions.quoteTotal, createdAt: schema.estimateVersions.createdAt, snapshot: schema.estimateVersions.snapshot })
    .from(schema.estimateVersions)
    .where(eq(schema.estimateVersions.estimateId, estimateId))
    .orderBy(desc(schema.estimateVersions.createdAt));
  return rows.map(({ snapshot, ...r }) => {
    const s = parseSnapshot(snapshot);
    return { ...r, itemCount: s?.items.filter((i) => i.kind === "item").length ?? 0, specCount: s?.specifications.length ?? 0, valid: !!s };
  });
}

export type RestoreResult = { ok: true; label: string } | { ok: false; error: string };

/** Replaces items/specs (and pricing settings) with the snapshot, after auto-capturing the current state. */
export async function restoreVersion(versionId: string): Promise<RestoreResult> {
  const [v] = await db.select().from(schema.estimateVersions).where(eq(schema.estimateVersions.id, versionId));
  if (!v) return { ok: false, error: "That version no longer exists." };
  const snap = parseSnapshot(v.snapshot);
  if (!snap) return { ok: false, error: "This version's snapshot is damaged and cannot be restored." };
  await captureVersion(v.estimateId, `Auto-saved before restoring "${v.label}"`);
  const plan = restorePlan(snap, v.estimateId);
  await db.transaction(async (tx) => {
    await tx.delete(schema.estimateItems).where(eq(schema.estimateItems.estimateId, v.estimateId));
    await tx.delete(schema.specifications).where(eq(schema.specifications.estimateId, v.estimateId));
    for (const c of chunk(plan.items)) await tx.insert(schema.estimateItems).values(c);
    for (const c of chunk(plan.specifications)) await tx.insert(schema.specifications).values(c);
    if (Object.keys(plan.estimatePatch).length) {
      await tx.update(schema.estimates).set(plan.estimatePatch as Partial<EstimateRow>).where(eq(schema.estimates.id, v.estimateId));
    }
  });
  await recalcEstimate(v.estimateId);
  return { ok: true, label: v.label };
}
