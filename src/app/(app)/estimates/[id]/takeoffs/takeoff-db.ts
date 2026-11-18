import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextMeasurementCode } from "@/lib/geometry";
import { planLegacyMigration, shapesByTakeoff, takeoffValue } from "@/lib/takeoffs";

/**
 * Lazy, idempotent migration: attaches shapes saved before takeoffs existed (no takeoffId) to a
 * takeoff with the same code, creating one per code when missing. Costing items linked to such a
 * shape are re-linked to its takeoff. Codes never change, so formulas keep resolving.
 * Cheap no-op once an estimate has no legacy shapes.
 */
export async function ensureTakeoffs(estimateId: string): Promise<void> {
  const legacy = await db
    .select({ id: schema.measurements.id })
    .from(schema.measurements)
    .where(and(eq(schema.measurements.estimateId, estimateId), isNull(schema.measurements.takeoffId)))
    .limit(1);
  if (!legacy.length) return;
  await db.transaction(
    async (tx) => {
      const tos = await tx
        .select({ id: schema.takeoffs.id, code: schema.takeoffs.code, sortOrder: schema.takeoffs.sortOrder })
        .from(schema.takeoffs)
        .where(eq(schema.takeoffs.estimateId, estimateId));
      const shapes = await tx
        .select()
        .from(schema.measurements)
        .where(and(eq(schema.measurements.estimateId, estimateId), isNull(schema.measurements.takeoffId)));
      const plan = planLegacyMigration(tos, shapes);
      for (const t of plan.create) await tx.insert(schema.takeoffs).values({ ...t, estimateId });
      for (const a of plan.attach) {
        await tx.update(schema.measurements).set({ takeoffId: a.takeoffId, code: a.code }).where(eq(schema.measurements.id, a.measurementId));
        await tx
          .update(schema.estimateItems)
          .set({ measurementId: a.takeoffId })
          .where(and(eq(schema.estimateItems.estimateId, estimateId), eq(schema.estimateItems.measurementId, a.measurementId)));
      }
    },
    { behavior: "immediate" },
  );
  await refreshTakeoffValues(estimateId);
}

/** Recomputes and stores every takeoff's cached value (manual result or Σ shapes). */
export async function refreshTakeoffValues(estimateId: string): Promise<void> {
  const tos = await db.select().from(schema.takeoffs).where(eq(schema.takeoffs.estimateId, estimateId));
  if (!tos.length) return;
  const shapes = await db.select().from(schema.measurements).where(eq(schema.measurements.estimateId, estimateId));
  const { grouped } = shapesByTakeoff(tos, shapes);
  for (const t of tos) {
    const v = takeoffValue(t, grouped.get(t.id) ?? []);
    if (v !== t.value) await db.update(schema.takeoffs).set({ value: v }).where(eq(schema.takeoffs.id, t.id));
  }
}

/** Next unused code "M{n}" (takeoff_counters keeps deleted codes from being handed out again). */
export async function allocateCode(estimateId: string): Promise<string> {
  const codes = [
    ...(await db.select({ code: schema.takeoffs.code }).from(schema.takeoffs).where(eq(schema.takeoffs.estimateId, estimateId))),
    ...(await db.select({ code: schema.measurements.code }).from(schema.measurements).where(eq(schema.measurements.estimateId, estimateId))),
  ].map((r) => r.code);
  const [ctr] = await db.select().from(schema.takeoffCounters).where(eq(schema.takeoffCounters.estimateId, estimateId));
  const { code, next } = nextMeasurementCode(codes, ctr?.nextMeasurementNumber ?? 1);
  if (ctr) await db.update(schema.takeoffCounters).set({ nextMeasurementNumber: next }).where(eq(schema.takeoffCounters.estimateId, estimateId));
  else await db.insert(schema.takeoffCounters).values({ estimateId, nextMeasurementNumber: next });
  return code;
}

/** Changes a takeoff's unit and keeps linked costing items' unit in step (when it still matched). */
export async function changeTakeoffUnit(t: { id: string; unit: string }, unit: string): Promise<void> {
  if (unit === t.unit) return;
  await db.update(schema.takeoffs).set({ unit }).where(eq(schema.takeoffs.id, t.id));
  await db
    .update(schema.estimateItems)
    .set({ uom: unit })
    .where(and(eq(schema.estimateItems.measurementId, t.id), eq(schema.estimateItems.uom, t.unit)));
}

export async function getTakeoff(id: string) {
  const [t] = await db.select().from(schema.takeoffs).where(eq(schema.takeoffs.id, id));
  return t;
}

export async function shapeCount(takeoffId: string, exceptIds: string[] = []): Promise<number> {
  const rows = await db.select({ id: schema.measurements.id }).from(schema.measurements).where(eq(schema.measurements.takeoffId, takeoffId));
  return rows.filter((r) => !exceptIds.includes(r.id)).length;
}

/** Moves the code counter past `code`, so deleting the highest code does not free it for reuse. */
export async function reserveCode(estimateId: string, code: string): Promise<void> {
  const n = /^M(\d+)$/i.exec(code.trim());
  if (!n) return;
  const want = parseInt(n[1], 10) + 1;
  const [ctr] = await db.select().from(schema.takeoffCounters).where(eq(schema.takeoffCounters.estimateId, estimateId));
  if (!ctr) await db.insert(schema.takeoffCounters).values({ estimateId, nextMeasurementNumber: want });
  else if (ctr.nextMeasurementNumber < want) await db.update(schema.takeoffCounters).set({ nextMeasurementNumber: want }).where(eq(schema.takeoffCounters.estimateId, estimateId));
}

export async function deleteShapesOf(takeoffIds: string[]): Promise<void> {
  if (takeoffIds.length) await db.delete(schema.measurements).where(inArray(schema.measurements.takeoffId, takeoffIds));
}
