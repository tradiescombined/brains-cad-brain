import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { referencedMeasurements } from "@/lib/expr";
import { parsePoints, type Shape } from "@/lib/geometry";
import { shapesByTakeoff } from "@/lib/takeoffs";
import { ensureTakeoffs } from "./takeoff-db";
import { TakeoffWorkspace } from "./TakeoffWorkspace";
import type { CategoryOption, MeasurementView, PlanView, TakeoffView } from "./types";

export const metadata = { title: "Plans & takeoffs" };

export default async function TakeoffsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plan?: string }> }) {
  const { id } = await params;
  const { plan: planParam } = await searchParams;
  const [est] = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) notFound();
  await ensureTakeoffs(id);

  const planRows = await db
    .select({
      id: schema.plans.id,
      label: schema.plans.label,
      width: schema.plans.imageWidth,
      height: schema.plans.imageHeight,
      scaleX: schema.plans.scaleX,
      sourceDpi: schema.plans.sourceDpi,
      updatedAt: schema.plans.updatedAt,
    })
    .from(schema.plans)
    .where(eq(schema.plans.estimateId, id))
    .orderBy(asc(schema.plans.sortOrder), asc(schema.plans.createdAt));

  const takeoffRows = await db
    .select()
    .from(schema.takeoffs)
    .where(eq(schema.takeoffs.estimateId, id))
    .orderBy(asc(schema.takeoffs.sortOrder), asc(schema.takeoffs.createdAt));

  const measurementRows = await db
    .select()
    .from(schema.measurements)
    .where(eq(schema.measurements.estimateId, id))
    .orderBy(asc(schema.measurements.createdAt));

  const items = await db
    .select({ id: schema.estimateItems.id, kind: schema.estimateItems.kind, parentId: schema.estimateItems.parentId, description: schema.estimateItems.description, quantityExpr: schema.estimateItems.quantityExpr, sortOrder: schema.estimateItems.sortOrder })
    .from(schema.estimateItems)
    .where(and(eq(schema.estimateItems.estimateId, id)))
    .orderBy(asc(schema.estimateItems.sortOrder));

  const usage = new Map<string, number>();
  for (const it of items) {
    for (const code of new Set(referencedMeasurements(it.quantityExpr).map((c) => c.toUpperCase()))) usage.set(code, (usage.get(code) ?? 0) + 1);
  }

  const counts = new Map<string, number>();
  for (const m of measurementRows) counts.set(m.planId, (counts.get(m.planId) ?? 0) + 1);

  const plans: PlanView[] = planRows.map((p) => ({
    id: p.id,
    label: p.label,
    width: p.width ?? 1000,
    height: p.height ?? 1000,
    src: `/estimates/${id}/takeoffs/image/${p.id}?v=${encodeURIComponent(p.updatedAt)}`,
    scale: p.scaleX ?? null,
    sourceDpi: p.sourceDpi ?? null,
    measurementCount: counts.get(p.id) ?? 0,
  }));

  const { grouped } = shapesByTakeoff(takeoffRows, measurementRows);
  const takeoffs: TakeoffView[] = takeoffRows.map((t) => ({
    id: t.id,
    code: t.code,
    description: t.description,
    unit: t.unit,
    colour: t.colour,
    hidden: t.hidden,
    manualExpr: t.manualExpr,
    value: t.value,
    shapeCount: grouped.get(t.id)?.length ?? 0,
    usedBy: usage.get(t.code.toUpperCase()) ?? 0,
  }));
  const colourOf = new Map(takeoffRows.map((t) => [t.id, t.colour]));

  const measurements: MeasurementView[] = measurementRows
    .filter((m) => m.takeoffId && colourOf.has(m.takeoffId))
    .map((m) => ({
      id: m.id,
      planId: m.planId,
      takeoffId: m.takeoffId!,
      code: m.code,
      shape: m.shape as Shape,
      points: parsePoints(m.points),
      colour: colourOf.get(m.takeoffId!) ?? m.colour,
      unit: m.unit,
      pitchDegrees: m.pitchDegrees,
      depthMm: m.depthMm,
      heightMm: m.heightMm,
      isNegative: m.isNegative,
      value: m.value,
    }));

  const categories: CategoryOption[] = items
    .filter((i) => i.kind === "category" && !i.parentId)
    .map((c, idx) => ({ id: c.id, label: `${idx + 1}. ${c.description || "Untitled category"}` }));

  return <TakeoffWorkspace estimateId={id} plans={plans} takeoffs={takeoffs} measurements={measurements} categories={categories} initialPlanId={planParam} />;
}
