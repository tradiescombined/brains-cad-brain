/** Shared client/server types and constants for the takeoffs page (no server-only imports). */
import type { Pt, Shape } from "@/lib/geometry";

export const NEW_CATEGORY = "__new__";

export interface PlanView {
  id: string;
  label: string;
  width: number;
  height: number;
  /** URL of the plan image (served by ./image/[planId]). */
  src: string;
  scale: number | null;
  sourceDpi: number | null;
  measurementCount: number;
}

export interface MeasurementView {
  id: string;
  planId: string;
  code: string;
  description: string;
  shape: Shape;
  points: Pt[];
  colour: string;
  unit: string;
  pitchDegrees: number;
  depthMm: number;
  heightMm: number;
  isNegative: boolean;
  value: number;
  /** Number of costing items whose formula references this code. */
  usedBy: number;
}

export interface CategoryOption {
  id: string;
  label: string;
}

export type Tool = "select" | "pan" | "scale" | Shape;

export const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f", "#475569"];

export const SHAPE_LABEL: Record<Shape, string> = {
  line: "Line",
  polyline: "Polyline",
  rectangle: "Rectangle",
  polygon: "Polygon",
  ellipse: "Ellipse",
  point: "Count",
};
