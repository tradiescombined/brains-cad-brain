/**
 * Takeoff geometry (pure, no DB, no DOM).
 *
 * Coordinates are image pixels. A plan scale is "real millimetres per image pixel" (scaleX, scaleY).
 * Shapes:
 *   line / polyline       -> length (m)       ; with height  -> wall area (m2)
 *   rectangle / polygon / ellipse -> area (m2) ; with depth   -> volume (m3)
 *   point                 -> count (ea)
 * Pitch (degrees) divides lengths and areas by cos(pitch). Negative measurements are deductions.
 */

export type Pt = [number, number];
export type Shape = "line" | "polyline" | "polygon" | "rectangle" | "ellipse" | "point";
export type Unit = "m" | "m2" | "m3" | "ea";
export type Kind = "length" | "area" | "count";
export interface Scale { x: number; y: number }

export const SHAPES: Shape[] = ["line", "polyline", "rectangle", "polygon", "ellipse", "point"];

export function shapeKind(shape: Shape): Kind {
  if (shape === "line" || shape === "polyline") return "length";
  if (shape === "point") return "count";
  return "area";
}

/** Minimum number of clicked points for a shape to be valid. */
export function minPoints(shape: Shape): number {
  switch (shape) {
    case "point": return 1;
    case "polygon": return 3;
    default: return 2;
  }
}

/** Maximum points (line/rectangle/ellipse are two-click shapes). */
export function maxPoints(shape: Shape): number {
  return shape === "line" || shape === "rectangle" || shape === "ellipse" ? 2 : Infinity;
}

export function isValidShape(shape: Shape, pts: Pt[]): boolean {
  if (pts.length < minPoints(shape) || pts.length > maxPoints(shape)) return false;
  if (!pts.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return false;
  if (shape === "rectangle" || shape === "ellipse") {
    const [a, b] = pts;
    return a[0] !== b[0] && a[1] !== b[1];
  }
  if (shape === "line") return distance(pts[0], pts[1]) > 0;
  return true;
}

export function distance(a: Pt, b: Pt, s: Scale = { x: 1, y: 1 }): number {
  return Math.hypot((b[0] - a[0]) * s.x, (b[1] - a[1]) * s.y);
}

/** Sum of segment lengths. `closed` adds the closing segment. Scale optional (units per px). */
export function polylineLength(pts: Pt[], closed = false, s: Scale = { x: 1, y: 1 }): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += distance(pts[i - 1], pts[i], s);
  if (closed && pts.length > 2) t += distance(pts[pts.length - 1], pts[0], s);
  return t;
}

/** Absolute polygon area by the shoelace formula (px²). */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** The four corners of an axis-aligned rectangle given two opposite corners. */
export function rectCorners(a: Pt, b: Pt): Pt[] {
  return [a, [b[0], a[1]], b, [a[0], b[1]]];
}

export function rectangleArea(a: Pt, b: Pt): number {
  return Math.abs(b[0] - a[0]) * Math.abs(b[1] - a[1]);
}

/** Ellipse inscribed in the bounding box defined by two opposite corners. */
export function ellipseFromCorners(a: Pt, b: Pt): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: Math.abs(b[0] - a[0]) / 2, ry: Math.abs(b[1] - a[1]) / 2 };
}

export function ellipseArea(rx: number, ry: number): number {
  return Math.PI * Math.abs(rx) * Math.abs(ry);
}

/** Pixel length -> metres. */
export function pxToM(px: number, mmPerPx: number): number {
  return (px * mmPerPx) / 1000;
}

/** Pixel area -> square metres. */
export function pxAreaToM2(pxArea: number, s: Scale): number {
  return (pxArea * s.x * s.y) / 1_000_000;
}

/** Shape outline points used for drawing (rectangle expands to 4 corners). */
export function outline(shape: Shape, pts: Pt[]): Pt[] {
  if (shape === "rectangle" && pts.length === 2) return rectCorners(pts[0], pts[1]);
  return pts;
}

/**
 * Raw quantity before adjustments: metres for lengths, m² for areas, count for points.
 * Returns 0 for lengths/areas when there is no scale.
 */
export function baseQuantity(shape: Shape, pts: Pt[], scale: Scale | null): number {
  const kind = shapeKind(shape);
  if (kind === "count") return pts.length;
  if (!scale || !(scale.x > 0) || !(scale.y > 0)) return 0;
  if (kind === "length") return polylineLength(pts, false, scale) / 1000;
  if (pts.length < 2) return 0;
  let pxArea = 0;
  if (shape === "rectangle") pxArea = rectangleArea(pts[0], pts[1]);
  else if (shape === "ellipse") {
    const e = ellipseFromCorners(pts[0], pts[1]);
    pxArea = ellipseArea(e.rx, e.ry);
  } else pxArea = polygonArea(pts);
  return pxAreaToM2(pxArea, scale);
}

export interface Adjustments {
  pitchDegrees?: number;
  depthMm?: number;
  heightMm?: number;
  isNegative?: boolean;
}

/** Unit a measurement resolves to, given its shape and adjustments. */
export function measurementUnit(shape: Shape, adj: Adjustments = {}): Unit {
  const kind = shapeKind(shape);
  if (kind === "count") return "ea";
  if (kind === "length") return (adj.heightMm ?? 0) > 0 ? "m2" : "m";
  return (adj.depthMm ?? 0) > 0 ? "m3" : "m2";
}

/** Slope factor 1/cos(pitch). Pitch is clamped to [0, 89.9]. */
export function pitchFactor(pitchDegrees: number | undefined): number {
  const p = Math.min(Math.max(Number(pitchDegrees) || 0, 0), 89.9);
  if (p === 0) return 1;
  return 1 / Math.cos((p * Math.PI) / 180);
}

/** Applies pitch, height/depth and negative to a base quantity of the given kind. */
export function applyAdjustments(base: number, kind: Kind, adj: Adjustments = {}): number {
  let v = base;
  if (kind !== "count") v *= pitchFactor(adj.pitchDegrees);
  if (kind === "length" && (adj.heightMm ?? 0) > 0) v *= (adj.heightMm as number) / 1000;
  if (kind === "area" && (adj.depthMm ?? 0) > 0) v *= (adj.depthMm as number) / 1000;
  if (adj.isNegative) v = -v;
  return v;
}

export function round3(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export interface MeasurementInput extends Adjustments {
  shape: Shape;
  points: Pt[];
  scale: Scale | null;
}

/** Final measurement value (rounded to 3 dp) and unit. `needsScale` is true when unscaled. */
export function computeMeasurement(m: MeasurementInput): { value: number; unit: Unit; base: number; needsScale: boolean } {
  const kind = shapeKind(m.shape);
  const needsScale = kind !== "count" && !(m.scale && m.scale.x > 0 && m.scale.y > 0);
  const base = baseQuantity(m.shape, m.points, m.scale);
  return { value: round3(applyAdjustments(base, kind, m)), unit: measurementUnit(m.shape, m), base, needsScale };
}

/** Snap `to` so the segment from `from` is horizontal or vertical (whichever is closer). */
export function snapOrthogonal(from: Pt, to: Pt): Pt {
  const dx = Math.abs(to[0] - from[0]);
  const dy = Math.abs(to[1] - from[1]);
  return dx >= dy ? [to[0], from[1]] : [from[0], to[1]];
}

/** Two-point calibration: mm per px from a drawn line and its real length. Null if invalid. */
export function calibrateScale(a: Pt, b: Pt, realLength: number, unit: "mm" | "m"): number | null {
  const px = distance(a, b);
  const mm = unit === "m" ? realLength * 1000 : realLength;
  if (!(px > 0) || !(mm > 0) || !Number.isFinite(mm)) return null;
  return mm / px;
}

/** Parses "1:100", "1 : 50", "100" -> 100. Null if invalid. */
export function parseRatio(s: string): number | null {
  const t = String(s ?? "").trim();
  const m = /^(?:(\d+(?:\.\d+)?)\s*:\s*)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const left = m[1] ? parseFloat(m[1]) : 1;
  const right = parseFloat(m[2]);
  if (!(left > 0) || !(right > 0)) return null;
  return right / left;
}

/** Drawing ratio (1:N) at a pixel density -> mm per px. One px is 25.4/dpi mm of paper. */
export function ratioToScale(ratio: number, dpi: number): number | null {
  if (!(ratio > 0) || !(dpi > 0)) return null;
  return (25.4 / dpi) * ratio;
}

/** Inverse of ratioToScale: mm per px at a dpi -> N in 1:N. */
export function scaleToRatio(mmPerPx: number, dpi: number): number {
  return mmPerPx / (25.4 / dpi);
}

/**
 * Next measurement code "M{n}". Takes the highest of the stored counter and
 * (largest existing M-number + 1) so codes are never duplicated.
 */
export function nextMeasurementCode(existing: string[], counter = 1): { code: string; next: number } {
  let max = 0;
  for (const c of existing) {
    const m = /^M(\d+)$/i.exec(c.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const n = Math.max(counter, max + 1, 1);
  return { code: `M${n}`, next: n + 1 };
}

const UNIT_LABEL: Record<string, string> = { m: "m", m2: "m²", m3: "m³", ea: "ea" };
export function unitLabel(u: string): string {
  return UNIT_LABEL[u] ?? u;
}

export function formatQuantity(value: number, unit: string): string {
  const dp = unit === "ea" ? 0 : unit === "m3" ? 3 : 2;
  return `${value.toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp })} ${unitLabel(unit)}`;
}

/** Centre of mass of the vertices (label anchor). */
export function centroid(pts: Pt[]): Pt {
  if (!pts.length) return [0, 0];
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

/** Totals grouped by description + unit (deductions reduce the total). */
export function totalsByDescription<T extends { description: string; unit: string; value: number }>(list: T[]) {
  const map = new Map<string, { description: string; unit: string; total: number; count: number }>();
  for (const m of list) {
    const d = m.description.trim() || "(no description)";
    const key = `${d.toLowerCase()}|${m.unit}`;
    const g = map.get(key) ?? { description: d, unit: m.unit, total: 0, count: 0 };
    g.total = round3(g.total + m.value);
    g.count++;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.description.localeCompare(b.description) || a.unit.localeCompare(b.unit));
}

// ---- Viewer transforms -------------------------------------------------------------

export interface View { zoom: number; x: number; y: number }
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 16;

/** Zoom/offset that fits an image inside a viewport with padding, centred. */
export function fitView(imgW: number, imgH: number, viewW: number, viewH: number, pad = 24): View {
  if (!(imgW > 0) || !(imgH > 0) || !(viewW > 0) || !(viewH > 0)) return { zoom: 1, x: 0, y: 0 };
  const zoom = clampZoom(Math.min((viewW - pad * 2) / imgW, (viewH - pad * 2) / imgH));
  return { zoom, x: (viewW - imgW * zoom) / 2, y: (viewH - imgH * zoom) / 2 };
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Zooms by `factor` keeping screen point (sx, sy) fixed. */
export function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
}

export function screenToImage(v: View, sx: number, sy: number): Pt {
  return [(sx - v.x) / v.zoom, (sy - v.y) / v.zoom];
}

export function imageToScreen(v: View, p: Pt): Pt {
  return [p[0] * v.zoom + v.x, p[1] * v.zoom + v.y];
}

/** Parses a stored points JSON string defensively. */
export function parsePoints(json: string | null | undefined): Pt[] {
  try {
    const v = JSON.parse(json ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.filter((p): p is Pt => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)));
  } catch {
    return [];
  }
}
