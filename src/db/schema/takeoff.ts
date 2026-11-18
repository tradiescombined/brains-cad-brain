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
 * A takeoff measurement drawn on a plan.
 * shape: line (length), polyline (length), polygon/rectangle/ellipse (area), point (count).
 * code is the short reference used in costing formulas, e.g. "M1".
 */
export const measurements = sqliteTable("measurements", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  planId: text("plan_id").notNull(),
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
