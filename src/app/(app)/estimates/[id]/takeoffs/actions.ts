"use server";
import { denied } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { recalcEstimate } from "@/lib/estimates";
import { getTaxRates, logActivity } from "@/lib/settings";
import { defaultTaxable, taxableDefaults } from "@/lib/tax-defaults";
import { NEW_CATEGORY } from "./types";
import { computeMeasurement, isValidShape, parsePoints, SHAPES, type Pt, type Shape, type Unit } from "@/lib/geometry";
import { evaluateManual, isTakeoffUnit, moveInList, shapeUnitCheck, TAKEOFF_UNITS } from "@/lib/takeoffs";
import { allocateCode, changeTakeoffUnit, deleteShapesOf, ensureTakeoffs, getTakeoff, refreshTakeoffValues, reserveCode, shapeCount } from "./takeoff-db";

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
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
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
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
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
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
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
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const p = await getPlan(planId);
  if (!p) return fail("Plan not found");
  await db.delete(schema.measurements).where(eq(schema.measurements.planId, planId));
  await db.delete(schema.plans).where(eq(schema.plans.id, planId));
  await refreshTakeoffValues(p.estimateId);
  await recalcEstimate(p.estimateId);
  await logActivity("estimate", p.estimateId, "plan_deleted", `Plan "${p.label}" deleted`);
  refresh(p.estimateId);
  return ok(null);
}

/** Sets (or clears with null) the plan scale in mm per px, then re-evaluates its measurements. */
export async function setPlanScale(planId: string, mmPerPx: number | null, sourceDpi?: number | null): Promise<ActionResult<null>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
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
  await refreshTakeoffValues(p.estimateId);
  await recalcEstimate(p.estimateId);
  refresh(p.estimateId);
  return ok(null);
}

// ---- Shapes (measurements) -------------------------------------------------------------

const point = z.tuple([z.number().finite(), z.number().finite()]);
const colourField = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #2563eb");
const shapeProps = z.object({
  pitchDegrees: z.number().min(0, "Pitch must be 0–89°").max(89, "Pitch must be 0–89°").default(0),
  depthMm: z.number().min(0, "Depth cannot be negative").max(100000).default(0),
  heightMm: z.number().min(0, "Height cannot be negative").max(100000).default(0),
  isNegative: z.boolean().default(false),
});
const createInput = shapeProps.extend({
  planId: z.string().min(1),
  shape: z.enum(SHAPES as [Shape, ...Shape[]]),
  points: z.array(point).min(1).max(5000),
  /** Add the shape to this takeoff; omitted/null creates a new takeoff. */
  takeoffId: z.string().min(1).nullable().optional(),
  /** Description and colour for a new takeoff. */
  description: z.string().trim().max(200).default(""),
  colour: colourField.default("#2563eb"),
});

export type ShapeProps = z.input<typeof shapeProps>;

/** Recomputes takeoff values and the estimate totals after any takeoff/shape change. */
async function settle(estimateId: string) {
  await refreshTakeoffValues(estimateId);
  await recalcEstimate(estimateId);
  refresh(estimateId);
}

async function nextTakeoffSort(estimateId: string) {
  const [{ s }] = await db.select({ s: max(schema.takeoffs.sortOrder) }).from(schema.takeoffs).where(eq(schema.takeoffs.estimateId, estimateId));
  return (s ?? -1) + 1;
}

/** Draws a shape on a plan, adding it to the chosen takeoff or to a new one. */
export async function createMeasurement(input: z.input<typeof createInput>): Promise<ActionResult<{ id: string; takeoffId: string; code: string; created: boolean }>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;
  const pts = d.points as Pt[];
  if (!isValidShape(d.shape, pts)) return fail("Not enough points for this shape");
  const p = await getPlan(d.planId);
  if (!p) return fail("Plan not found");
  await ensureTakeoffs(p.estimateId);
  const r = computeMeasurement({ ...d, points: pts, scale: planScale(p) });

  let t: typeof schema.takeoffs.$inferSelect | undefined;
  let created = false;
  if (d.takeoffId) {
    t = await getTakeoff(d.takeoffId);
    if (!t || t.estimateId !== p.estimateId) return fail("Takeoff not found");
    const check = shapeUnitCheck(t, r.unit, await shapeCount(t.id));
    if (!check.ok) return fail(check.error);
    if (check.adoptUnit) await changeTakeoffUnit(t, r.unit);
  } else {
    const code = await allocateCode(p.estimateId);
    [t] = await db
      .insert(schema.takeoffs)
      .values({ estimateId: p.estimateId, code, description: d.description, unit: r.unit, colour: d.colour, sortOrder: await nextTakeoffSort(p.estimateId) })
      .returning();
    created = true;
  }
  const [row] = await db
    .insert(schema.measurements)
    .values({
      estimateId: p.estimateId,
      planId: p.id,
      takeoffId: t.id,
      code: t.code,
      description: "",
      shape: d.shape,
      points: JSON.stringify(pts.map(([x, y]) => [round1(x), round1(y)])),
      colour: t.colour,
      unit: r.unit,
      pitchDegrees: d.pitchDegrees,
      depthMm: d.depthMm,
      heightMm: d.heightMm,
      isNegative: d.isNegative,
      value: r.value,
    })
    .returning({ id: schema.measurements.id });
  await settle(p.estimateId);
  return ok({ id: row.id, takeoffId: t.id, code: t.code, created });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Edits a shape's pitch / depth / height / deduction. Its unit must stay the takeoff's unit. */
export async function updateMeasurement(id: string, input: ShapeProps): Promise<ActionResult<{ value: number; unit: string }>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = shapeProps.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const [m] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, id));
  if (!m) return fail("Shape not found");
  const p = await getPlan(m.planId);
  const r = computeMeasurement({ ...parsed.data, shape: m.shape as Shape, points: parsePoints(m.points), scale: p ? planScale(p) : null });
  const t = m.takeoffId ? await getTakeoff(m.takeoffId) : undefined;
  if (t && r.unit !== t.unit) {
    const check = shapeUnitCheck({ ...t, manualExpr: null }, r.unit, await shapeCount(t.id, [m.id]));
    if (!check.ok) return fail(check.error);
    if (t.manualExpr == null) await changeTakeoffUnit(t, r.unit);
  }
  await db.update(schema.measurements).set({ ...parsed.data, value: r.value, unit: r.unit }).where(eq(schema.measurements.id, id));
  await settle(m.estimateId);
  return ok({ value: r.value, unit: r.unit });
}

/** Deletes one shape. Its takeoff stays (its value drops by the shape's value). */
export async function deleteMeasurement(id: string): Promise<ActionResult<null>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const [m] = await db.select().from(schema.measurements).where(eq(schema.measurements.id, id));
  if (!m) return fail("Shape not found");
  await db.delete(schema.measurements).where(eq(schema.measurements.id, id));
  await settle(m.estimateId);
  return ok(null);
}

// ---- Takeoffs ----------------------------------------------------------------------------

const unitField = z.enum(TAKEOFF_UNITS as [Unit, ...Unit[]], { message: "Choose a unit: m, m2, m3 or ea" });
const manualInput = z.object({
  description: z.string().trim().max(200).default(""),
  unit: unitField,
  expr: z.string().trim().min(1, "Enter a value or calculation").max(500),
  colour: colourField.default("#2563eb"),
});

/** Creates a takeoff entered with the calculator (no drawing). */
export async function createManualTakeoff(estimateId: string, input: z.input<typeof manualInput>): Promise<ActionResult<{ id: string; code: string }>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = manualInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;
  const ev = evaluateManual(d.expr);
  if (ev.error) return fail(`Calculation: ${ev.error}`);
  if (!(await getEstimate(estimateId))) return fail("Estimate not found");
  await ensureTakeoffs(estimateId);
  const code = await allocateCode(estimateId);
  const [t] = await db
    .insert(schema.takeoffs)
    .values({ estimateId, code, description: d.description, unit: d.unit, colour: d.colour, manualExpr: d.expr, value: ev.value, sortOrder: await nextTakeoffSort(estimateId) })
    .returning({ id: schema.takeoffs.id, code: schema.takeoffs.code });
  await settle(estimateId);
  return ok(t);
}

const takeoffPatch = z.object({
  description: z.string().trim().max(200).optional(),
  colour: colourField.optional(),
  hidden: z.boolean().optional(),
});

/** Renames, recolours or hides/shows a takeoff. */
export async function updateTakeoff(id: string, input: z.input<typeof takeoffPatch>): Promise<ActionResult<null>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = takeoffPatch.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const t = await getTakeoff(id);
  if (!t) return fail("Takeoff not found");
  if (!Object.keys(parsed.data).length) return ok(null);
  await db.update(schema.takeoffs).set(parsed.data).where(eq(schema.takeoffs.id, id));
  if (parsed.data.colour) await db.update(schema.measurements).set({ colour: parsed.data.colour }).where(eq(schema.measurements.takeoffId, id));
  refresh(t.estimateId);
  return ok(null);
}

/**
 * Sets the takeoff's manual calculation (value + unit), or clears it with `expr: null` so the
 * value is the sum of its drawn shapes again.
 */
export async function setTakeoffManual(id: string, expr: string | null, unit?: string): Promise<ActionResult<{ value: number }>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const t = await getTakeoff(id);
  if (!t) return fail("Takeoff not found");
  if (expr === null) {
    await db.update(schema.takeoffs).set({ manualExpr: null }).where(eq(schema.takeoffs.id, id));
    const [first] = await db.select({ unit: schema.measurements.unit }).from(schema.measurements).where(eq(schema.measurements.takeoffId, id)).limit(1);
    if (first) await changeTakeoffUnit(t, first.unit);
  } else {
    const src = String(expr).trim();
    if (!src) return fail("Enter a value or calculation");
    if (src.length > 500) return fail("Calculation is too long");
    const ev = evaluateManual(src);
    if (ev.error) return fail(`Calculation: ${ev.error}`);
    const u = unit ?? t.unit;
    if (!isTakeoffUnit(u)) return fail("Choose a unit: m, m2, m3 or ea");
    await db.update(schema.takeoffs).set({ manualExpr: src }).where(eq(schema.takeoffs.id, id));
    await changeTakeoffUnit(t, u);
  }
  await settle(t.estimateId);
  const after = await getTakeoff(id);
  return ok({ value: after?.value ?? 0 });
}

export async function moveTakeoff(id: string, direction: "up" | "down"): Promise<ActionResult<null>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const t = await getTakeoff(id);
  if (!t) return fail("Takeoff not found");
  const list = await db
    .select({ id: schema.takeoffs.id, sortOrder: schema.takeoffs.sortOrder })
    .from(schema.takeoffs)
    .where(eq(schema.takeoffs.estimateId, t.estimateId))
    .orderBy(asc(schema.takeoffs.sortOrder), asc(schema.takeoffs.createdAt));
  const ids = moveInList(list.map((x) => x.id), id, direction);
  for (let k = 0; k < ids.length; k++) {
    if (list[k].id !== ids[k] || list[k].sortOrder !== k) await db.update(schema.takeoffs).set({ sortOrder: k }).where(eq(schema.takeoffs.id, ids[k]));
  }
  refresh(t.estimateId);
  return ok(null);
}

/** Deletes a takeoff and all its shapes. Its code is never handed out again. */
export async function deleteTakeoff(id: string): Promise<ActionResult<null>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const t = await getTakeoff(id);
  if (!t) return fail("Takeoff not found");
  await reserveCode(t.estimateId, t.code);
  await deleteShapesOf([id]);
  await db.delete(schema.takeoffs).where(eq(schema.takeoffs.id, id));
  await settle(t.estimateId);
  await logActivity("estimate", t.estimateId, "takeoff_deleted", `Takeoff ${t.code}${t.description ? ` "${t.description}"` : ""} deleted`);
  return ok(null);
}

// ---- Link to costings ------------------------------------------------------------------

/** Adds a costing item whose quantity is `[Mx]` under the chosen category (or a new "Takeoff items" one). */
export async function createCostingItem(
  takeoffId: string,
  categoryId: string,
  description?: string,
): Promise<ActionResult<{ itemId: string; categoryId: string }>> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const t = await getTakeoff(takeoffId);
  if (!t) return fail("Takeoff not found");
  const estimateId = t.estimateId;
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
  const desc = (description ?? "").trim() || t.description.trim() || `Takeoff ${t.code}`;
  const [item] = await db
    .insert(schema.estimateItems)
    .values({
      estimateId,
      parentId: catId,
      kind: "item",
      description: desc.slice(0, 200),
      uom: t.unit,
      quantityExpr: `[${t.code}]`,
      quantity: t.value,
      measurementId: t.id,
      sortOrder: (s ?? -1) + 1,
      taxable: defaultTaxable(taxableDefaults(await getTaxRates()), "Material"),
    })
    .returning({ id: schema.estimateItems.id });
  await recalcEstimate(estimateId);
  await logActivity("estimate", estimateId, "takeoff_linked", `Costing item "${desc}" created from ${t.code}`);
  refresh(estimateId);
  return ok({ itemId: item.id, categoryId: catId });
}
