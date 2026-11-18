"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { recalcEstimate } from "@/lib/estimates";
import { logActivity } from "@/lib/settings";
import { NEW_CATEGORY } from "./types";
import { computeMeasurement, isValidShape, nextMeasurementCode, parsePoints, SHAPES, type Pt, type Shape } from "@/lib/geometry";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

function refresh(estimateId: string) {
  revalidatePath(`/estimates/${estimateId}`, "layout");
}

async function getEstimate(estimateId: string) {
  const [e] = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(eq(schema.estimates.id, estimateId));
  return e;
}

async function getPlan(planId: string) {
  const [p] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
  return p;
}

function planScale(p: { scaleX: number | null; scaleY: number | null }) {
  return p.scaleX && p.scaleY ? { x: p.scaleX, y: p.scaleY } : null;
}

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Invalid input";
}

// ---- Plans ---------------------------------------------------------------------------

const planInput = z.object({
  label: z.string().trim().min(1, "Plan name is required").max(120),
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Only PNG, JPG or PDF plans are supported"),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  sourceDpi: z.number().positive().max(2400).nullable().optional(),
});

export async function addPlan(estimateId: string, input: z.input<typeof planInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = planInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (parsed.data.dataUrl.length * 0.75 > MAX_IMAGE_BYTES) return fail("Image is larger than 20 MB");
  if (!(await getEstimate(estimateId))) return fail("Estimate not found");
  const [{ m }] = await db.select({ m: max(schema.plans.sortOrder) }).from(schema.plans).where(eq(schema.plans.estimateId, estimateId));
  const [row] = await db
    .insert(schema.plans)
    .values({
      estimateId,
      label: parsed.data.label,
      imageDataUrl: parsed.data.dataUrl,
      imageWidth: parsed.data.width,
      imageHeight: parsed.data.height,
      sourceDpi: parsed.data.sourceDpi ?? null,
      sortOrder: (m ?? -1) + 1,
    })
    .returning({ id: schema.plans.id });
  await logActivity("estimate", estimateId, "plan_added", `Plan "${parsed.data.label}" uploaded`);
  refresh(estimateId);
  return ok(row);
}

export async function renamePlan(planId: string, label: string): Promise<ActionResult<null>> {
  const name = String(label ?? "").trim();
  if (!name) return fail("Plan name is required");
  if (name.length > 120) return fail("Plan name is too long");
  const p = await getPlan(planId);
  if (!p) return fail("Plan not found");
  await db.update(schema.plans).set({ label: name }).where(eq(schema.plans.id, planId));
  refresh(p.estimateId);
  return ok(null);
}

export async function movePlan(planId: string, direction: "up" | "down"): Promise<ActionResult<null>> {
  const p = await getPlan(planId);
  if (!p) return fail("Plan not found");
  const list = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(eq(schema.plans.estimateId, p.estimateId))
    .orderBy(asc(schema.plans.sortOrder), asc(schema.plans.createdAt));
  const i = list.findIndex((x) => x.id === planId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return ok(null);
  [list[i], list[j]] = [list[j], list[i]];
  for (let k = 0; k < list.length; k++) await db.update(schema.plans).set({ sortOrder: k }).where(eq(schema.plans.id, list[k].id));
  refresh(p.estimateId);
  return ok(null);
}

export async function deletePlan(planId: string): Promise<ActionResult<null>> {
  const p = await getPlan(planId);
  if (!p) return fail("Plan not found");
  await db.delete(schema.measurements).where(eq(schema.measurements.planId, planId));
  await db.delete(schema.plans).where(eq(schema.plans.id, planId));
  await recalcEstimate(p.estimateId);
  await logActivity("estimate", p.estimateId, "plan_deleted", `Plan "${p.label}" deleted`);
  refresh(p.estimateId);
  return ok(null);
}

/** Sets (or clears with null) the plan scale in mm per px, then re-evaluates its measurements. */
export async function setPlanScale(planId: string, mmPerPx: number | null, sourceDpi?: number | null): Promise<ActionResult<null>> {
  if (mmPerPx !== null && !(Number.isFinite(mmPerPx) && mmPerPx > 0 && mmPerPx < 1e6)) return fail("Scale must be a positive number");
  const p = await getPlan(planId);
  if (!p) return fail("Plan not found");
  const patch: Partial<typeof schema.plans.$inferInsert> = { scaleX: mmPerPx, scaleY: mmPerPx, scaleUnit: "mm" };
  if (sourceDpi !== undefined && sourceDpi !== null && sourceDpi > 0) patch.sourceDpi = sourceDpi;
  await db.update(schema.plans).set(patch).where(eq(schema.plans.id, planId));
  const scale = mmPerPx ? { x: mmPerPx, y: mmPerPx } : null;
  const ms = await db.select().from(schema.measurements).where(eq(schema.measurements.planId, planId));
  for (const m of ms) {
    const r = computeMeasurement({ ...m, shape: m.shape as Shape, points: parsePoints(m.points), scale });
    if (r.value !== m.value || r.unit !== m.unit) {
      await db.update(schema.measurements).set({ value: r.value, unit: r.unit }).where(eq(schema.measurements.id, m.id));
    }
  }
  await recalcEstimate(p.estimateId);
  refresh(p.estimateId);
  return ok(null);
}

// ---- Measurements ----------------------------------------------------------------------

const point = z.tuple([z.number().finite(), z.number().finite()]);
const props = z.object({
  description: z.string().trim().max(200).default(""),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #2563eb").default("#2563eb"),
  pitchDegrees: z.number().min(0, "Pitch must be 0–89°").max(89, "Pitch must be 0–89°").default(0),
  depthMm: z.number().min(0, "Depth cannot be negative").max(100000).default(0),
  heightMm: z.number().min(0, "Height cannot be negative").max(100000).default(0),
  isNegative: z.boolean().default(false),
});
const createInput = props.extend({
  planId: z.string().min(1),
  shape: z.enum(SHAPES as [Shape, ...Shape[]]),
  points: z.array(point).min(1).max(5000),
});

export type MeasurementProps = z.input<typeof props>;

async function allocateCode(estimateId: string): Promise<string> {
  const existing = await db.select({ code: schema.measurements.code }).from(schema.measurements).where(eq(schema.measurements.estimateId, estimateId));
  const [ctr] = await db.select().from(schema.takeoffCounters).where(eq(schema.takeoffCounters.estimateId, estimateId));
  const { code, next } = nextMeasurementCode(existing.map((e) => e.code), ctr?.nextMeasurementNumber ?? 1);
  if (ctr) await db.update(schema.takeoffCounters).set({ nextMeasurementNumber: next }).where(eq(schema.takeoffCounters.estimateId, estimateId));
  else await db.insert(schema.takeoffCounters).values({ estimateId, nextMeasurementNumber: next });
  return code;
}

export async function createMeasurement(input: z.input<typeof createInput>): Promise<ActionResult<{ id: string; code: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;
  const pts = d.points as Pt[];
  if (!isValidShape(d.shape, pts)) return fail("Not enough points for this shape");
  const p = await getPlan(d.planId);
  if (!p) return fail("Plan not found");
  const code = await allocateCode(p.estimateId);
  const r = computeMeasurement({ ...d, points: pts, scale: planScale(p) });
  const [row] = await db
    .insert(schema.measurements)
    .values({
      estimateId: p.estimateId,
      planId: p.id,
      code,
      description: d.description,
      shape: d.shape,
      points: JSON.stringify(pts.map(([x, y]) => [round1(x), round1(y)])),
      colour: d.colour,
      unit: r.unit,
      pitchDegrees: d.pitchDegrees,
      depthMm: d.depthMm,
      heightMm: d.heightMm,
      isNegative: d.isNegative,
      value: r.value,
    })
    .returning({ id: schema.measurements.id, code: schema.measurements.code });
  await recalcEstimate(p.estimateId);
  refresh(p.estimateId);
  return ok(row);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export async function updateMeasurement(id: string, input: MeasurementProps): Promise<ActionResult<{ value: number; unit: string }>> {
  const parsed = props.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const [m] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, id));
  if (!m) return fail("Measurement not found");
  const p = await getPlan(m.planId);
  const r = computeMeasurement({ ...parsed.data, shape: m.shape as Shape, points: parsePoints(m.points), scale: p ? planScale(p) : null });
  await db.update(schema.measurements).set({ ...parsed.data, value: r.value, unit: r.unit }).where(eq(schema.measurements.id, id));
  // Keep linked costing items' unit in step with the measurement.
  if (r.unit !== m.unit) {
    await db
      .update(schema.estimateItems)
      .set({ uom: r.unit })
      .where(and(eq(schema.estimateItems.measurementId, id), eq(schema.estimateItems.uom, m.unit)));
  }
  await recalcEstimate(m.estimateId);
  refresh(m.estimateId);
  return ok({ value: r.value, unit: r.unit });
}

export async function deleteMeasurement(id: string): Promise<ActionResult<null>> {
  const [m] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, id));
  if (!m) return fail("Measurement not found");
  await db.delete(schema.measurements).where(eq(schema.measurements.id, id));
  await recalcEstimate(m.estimateId);
  refresh(m.estimateId);
  return ok(null);
}

// ---- Link to costings ------------------------------------------------------------------

/** Adds a costing item whose quantity is `[Mx]` under the chosen category (or a new "Takeoff items" one). */
export async function createCostingItem(
  measurementId: string,
  categoryId: string,
  description?: string,
): Promise<ActionResult<{ itemId: string; categoryId: string }>> {
  const [m] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, measurementId));
  if (!m) return fail("Measurement not found");
  const estimateId = m.estimateId;
  let catId = categoryId;
  if (!catId || catId === NEW_CATEGORY) {
    const [existing] = await db
      .select({ id: schema.estimateItems.id })
      .from(schema.estimateItems)
      .where(and(eq(schema.estimateItems.estimateId, estimateId), eq(schema.estimateItems.kind, "category"), eq(schema.estimateItems.description, "Takeoff items"), isNull(schema.estimateItems.parentId)));
    if (existing) catId = existing.id;
    else {
      const [{ s }] = await db
        .select({ s: max(schema.estimateItems.sortOrder) })
        .from(schema.estimateItems)
        .where(and(eq(schema.estimateItems.estimateId, estimateId), isNull(schema.estimateItems.parentId)));
      const [cat] = await db
        .insert(schema.estimateItems)
        .values({ estimateId, kind: "category", parentId: null, description: "Takeoff items", sortOrder: (s ?? -1) + 1 })
        .returning({ id: schema.estimateItems.id });
      catId = cat.id;
    }
  } else {
    const [cat] = await db
      .select({ id: schema.estimateItems.id })
      .from(schema.estimateItems)
      .where(and(eq(schema.estimateItems.id, catId), eq(schema.estimateItems.estimateId, estimateId), eq(schema.estimateItems.kind, "category")));
    if (!cat) return fail("Choose a costing category of this estimate");
  }
  const [{ s }] = await db.select({ s: max(schema.estimateItems.sortOrder) }).from(schema.estimateItems).where(eq(schema.estimateItems.parentId, catId));
  const desc = (description ?? "").trim() || m.description.trim() || `Measurement ${m.code}`;
  const [item] = await db
    .insert(schema.estimateItems)
    .values({
      estimateId,
      parentId: catId,
      kind: "item",
      description: desc.slice(0, 200),
      uom: m.unit,
      quantityExpr: `[${m.code}]`,
      quantity: m.value,
      measurementId: m.id,
      sortOrder: (s ?? -1) + 1,
    })
    .returning({ id: schema.estimateItems.id });
  await recalcEstimate(estimateId);
  await logActivity("estimate", estimateId, "takeoff_linked", `Costing item "${desc}" created from ${m.code}`);
  refresh(estimateId);
  return ok({ itemId: item.id, categoryId: catId });
}
