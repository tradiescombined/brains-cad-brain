/**
 * Takeoff quantities (pure, no DB, no DOM).
 *
 * A takeoff is one named quantity with a code ("M1") that costing formulas reference as `[M1]`.
 * Its value is either
 *   - manual: the result of a calculator expression (`manualExpr`, e.g. "12.5*2 + 3"), or
 *   - drawn:  the sum of its shapes' values, on any plans (negative shapes already carry a
 *             negative value, so they deduct).
 * Shapes saved before takeoffs existed have no `takeoffId`; they count towards the takeoff with
 * the same code, or stand alone under their own code until migrated (see `planLegacyMigration`).
 */
import { tryEvaluate } from "./expr";
import { round3, type Unit } from "./geometry";

export const TAKEOFF_UNITS: Unit[] = ["m", "m2", "m3", "ea"];

export function isTakeoffUnit(u: string): u is Unit {
  return (TAKEOFF_UNITS as string[]).includes(u);
}

export interface TakeoffLike {
  id: string;
  code: string;
  description: string;
  unit: string;
  manualExpr: string | null;
}

export interface ShapeLike {
  id: string;
  takeoffId: string | null;
  code: string;
  description: string;
  unit: string;
  value: number;
}

const key = (code: string) => code.trim().toUpperCase();

/** Evaluates a manual (calculator) expression. Empty input is 0. Rounded to 3 dp. */
export function evaluateManual(expr: string | null | undefined): { value: number; error?: string } {
  const r = tryEvaluate(expr ?? "", {});
  return r.error ? { value: 0, error: r.error } : { value: round3(r.value) };
}

/** Value of one takeoff: manual result, else Σ shape values (deductions are negative). */
export function takeoffValue(t: Pick<TakeoffLike, "manualExpr">, shapes: Pick<ShapeLike, "value">[]): number {
  if (t.manualExpr != null) return evaluateManual(t.manualExpr).value;
  let sum = 0;
  for (const s of shapes) sum += Number(s.value) || 0;
  return round3(sum);
}

/** Groups shapes by owning takeoff id. Legacy shapes (no takeoffId) join the takeoff with their code. */
export function shapesByTakeoff<S extends ShapeLike>(takeoffs: TakeoffLike[], shapes: S[]) {
  const byCode = new Map(takeoffs.map((t) => [key(t.code), t.id]));
  const ids = new Set(takeoffs.map((t) => t.id));
  const grouped = new Map<string, S[]>();
  const orphans: S[] = [];
  for (const s of shapes) {
    const tid = s.takeoffId && ids.has(s.takeoffId) ? s.takeoffId : !s.takeoffId ? byCode.get(key(s.code)) : undefined;
    if (tid) {
      const list = grouped.get(tid) ?? [];
      list.push(s);
      grouped.set(tid, list);
    } else if (!s.takeoffId) orphans.push(s);
  }
  return { grouped, orphans };
}

export interface TakeoffSummary {
  id: string;
  code: string;
  description: string;
  unit: string;
  value: number;
}

/**
 * One row per quantity code: every takeoff, plus legacy shapes not yet attached to a takeoff
 * (grouped by their code). Sorted by code number.
 */
export function takeoffSummaries(takeoffs: TakeoffLike[], shapes: ShapeLike[]): TakeoffSummary[] {
  const { grouped, orphans } = shapesByTakeoff(takeoffs, shapes);
  const out: TakeoffSummary[] = takeoffs.map((t) => ({
    id: t.id,
    code: t.code,
    description: t.description,
    unit: t.unit,
    value: takeoffValue(t, grouped.get(t.id) ?? []),
  }));
  const legacy = new Map<string, TakeoffSummary>();
  for (const s of orphans) {
    const k = key(s.code);
    const row = legacy.get(k) ?? { id: s.id, code: s.code, description: s.description, unit: s.unit, value: 0 };
    row.value = round3(row.value + (Number(s.value) || 0));
    legacy.set(k, row);
  }
  out.push(...legacy.values());
  return out.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** The `{ code: value }` map costing formulas resolve `[Mx]` against. */
export function takeoffValueMap(takeoffs: TakeoffLike[], shapes: ShapeLike[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of takeoffSummaries(takeoffs, shapes)) map[t.code] = t.value;
  return map;
}

/**
 * Whether a shape producing `shapeUnit` may be added to (or kept in) a takeoff.
 * A manual takeoff takes no shapes; an empty drawn takeoff adopts the shape's unit.
 */
export function shapeUnitCheck(
  takeoff: { code: string; unit: string; manualExpr: string | null },
  shapeUnit: string,
  otherShapeCount: number,
): { ok: true; adoptUnit: boolean } | { ok: false; error: string } {
  if (takeoff.manualExpr != null) return { ok: false, error: `${takeoff.code} is entered manually. Clear its manual value to draw shapes for it.` };
  if (shapeUnit === takeoff.unit) return { ok: true, adoptUnit: false };
  if (otherShapeCount === 0) return { ok: true, adoptUnit: true };
  return { ok: false, error: `${takeoff.code} is measured in ${UNIT_WORD[takeoff.unit] ?? takeoff.unit}; this shape gives ${UNIT_WORD[shapeUnit] ?? shapeUnit}.` };
}

const UNIT_WORD: Record<string, string> = { m: "metres (m)", m2: "square metres (m²)", m3: "cubic metres (m³)", ea: "counts (ea)" };

export interface LegacyMigration {
  /** New takeoffs to insert (one per legacy code without a takeoff). */
  create: { id: string; code: string; description: string; unit: string; colour: string; sortOrder: number }[];
  /** Shapes to attach: measurement id -> takeoff id (and the takeoff's code). */
  attach: { measurementId: string; takeoffId: string; code: string }[];
}

/**
 * Plans the idempotent migration of legacy shapes (no takeoffId) into takeoffs: a shape joins the
 * takeoff with its code, else a takeoff is created per code (description, unit and colour from the
 * code's first shape). Codes are preserved, so existing formulas keep resolving.
 */
export function planLegacyMigration(
  takeoffs: { id: string; code: string; sortOrder: number }[],
  shapes: { id: string; takeoffId: string | null; code: string; description: string; unit: string; colour: string; createdAt?: string }[],
  gen: () => string = () => crypto.randomUUID(),
): LegacyMigration {
  const byCode = new Map(takeoffs.map((t) => [key(t.code), { id: t.id, code: t.code }]));
  let sort = takeoffs.reduce((m, t) => Math.max(m, t.sortOrder), -1);
  const legacy = shapes
    .filter((s) => !s.takeoffId)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const out: LegacyMigration = { create: [], attach: [] };
  for (const s of legacy) {
    let t = byCode.get(key(s.code));
    if (!t) {
      t = { id: gen(), code: s.code.trim() };
      byCode.set(key(s.code), t);
      out.create.push({ id: t.id, code: t.code, description: s.description, unit: s.unit, colour: s.colour, sortOrder: ++sort });
    }
    out.attach.push({ measurementId: s.id, takeoffId: t.id, code: t.code });
  }
  return out;
}

/** Swaps an id with its neighbour in an ordered id list. Returns the same list when it cannot move. */
export function moveInList(ids: string[], id: string, direction: "up" | "down"): string[] {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Case-insensitive search over code and description. */
export function matchesTakeoff(t: { code: string; description: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return t.code.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
}
