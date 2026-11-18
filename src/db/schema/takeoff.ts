import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./_shared";

/** A plan page (image) attached to an estimate, with its drawing scale. */
export const plans = sqliteTable("plans", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  imageDataUrl: text("image_data_url"),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  /** Real-world millimetres per image pixel, horizontally and vertically. */
  scaleX: real("scale_x"),
  scaleY: real("scale_y"),
  scaleUnit: text("scale_unit").notNull().default("mm"),
  /** Pixel density the page was rendered at (PDF pages: 72 × render scale). Used for 1:N ratio scales. */
  sourceDpi: real("source_dpi"),
  ...timestamps,
});

/**
 * A takeoff: one named quantity (e.g. "M1 External walls 42.5 m") referenced from costing
 * formulas by its code. Its value is either a manual expression (`manualExpr`, no drawing) or the
 * sum of its shapes (`measurements.takeoffId`), drawn on any plans; negative shapes deduct.
 * `value` caches the evaluated result in `unit`.
 */
export const takeoffs = sqliteTable("takeoffs", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull().default(""),
  /** m, m2, m3, ea */
  unit: text("unit").notNull(),
  colour: text("colour").notNull().default("#2563eb"),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Hidden takeoffs keep counting in costings; only their shapes are hidden on the plans. */
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  /** Calculator entry (e.g. "12.5*2+3"). When set, the value ignores any drawn shapes. */
  manualExpr: text("manual_expr"),
  value: real("value").notNull().default(0),
  ...timestamps,
});

/**
 * A shape drawn on a plan, belonging to a takeoff (`takeoffId`).
 * Rows created before takeoffs existed have no takeoffId; they are attached lazily by code.
 * shape: line (length), polyline (length), polygon/rectangle/ellipse (area), point (count).
 * code is the short reference used in costing formulas, e.g. "M1".
 */
export const measurements = sqliteTable("measurements", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  planId: text("plan_id").notNull(),
  /** Owning takeoff (null only on legacy rows not yet migrated). */
  takeoffId: text("takeoff_id"),
  /** Code of the owning takeoff (kept in step; legacy rows: their own code). */
  code: text("code").notNull(),
  description: text("description").notNull(),
  shape: text("shape", { enum: ["line", "polyline", "polygon", "rectangle", "ellipse", "point"] }).notNull(),
  /** JSON array of [x,y] in image pixel coords */
  points: text("points").notNull().default("[]"),
  colour: text("colour").notNull().default("#2563eb"),
  /** m, m2, m3, ea */
  unit: text("unit").notNull(),
  /** Roof pitch in degrees applied to areas/lengths. */
  pitchDegrees: real("pitch_degrees").notNull().default(0),
  /** Depth in mm; turns an area into a volume (m3). */
  depthMm: real("depth_mm").notNull().default(0),
  /** Wall height in mm; turns a length into a wall area (m2). */
  heightMm: real("height_mm").notNull().default(0),
  isNegative: integer("is_negative", { mode: "boolean" }).notNull().default(false),
  /** Evaluated result in `unit`. */
  value: real("value").notNull().default(0),
  ...timestamps,
});

/** Per-estimate measurement code counter so deleted codes (e.g. "M3") are never handed out again. */
export const takeoffCounters = sqliteTable("takeoff_counters", {
  estimateId: text("estimate_id").primaryKey(),
  nextMeasurementNumber: integer("next_measurement_number").notNull().default(1),
});

export type Plan = typeof plans.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Takeoff = typeof takeoffs.$inferSelect;
