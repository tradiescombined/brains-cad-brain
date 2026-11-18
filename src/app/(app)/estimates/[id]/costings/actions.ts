"use server";
import { denied } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { recalcEstimate } from "@/lib/estimates";
import { catalogueToRows, subtreeIds, validateTree, childrenOf } from "@/lib/costings-tree";
import { insertPlan } from "@/lib/costings-dnd";
import { searchCatalogueItems } from "@/app/(app)/catalogues/search";
import type { EstimateItem } from "@/db/schema";
import type { MarkupLine } from "@/lib/calc";
import { getTaxRates } from "@/lib/settings";
import { defaultTaxable, taxableDefaults } from "@/lib/tax-defaults";

export type ActionResult = { ok: true; items: EstimateItem[] } | { ok: false; error: string };

const COST_TYPES = ["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"] as const;
const finite = z.number().refine((n) => Number.isFinite(n), "Must be a number");
const optText = (max: number) => z.string().max(max).nullable();

const rowFields = z.object({
  parentId: z.string().max(64).nullable(),
  kind: z.enum(["category", "item"]),
  sortOrder: z.number().int(),
  description: z.string().max(500),
  itemCode: optText(64),
  costType: z.enum(COST_TYPES),
  allowanceType: z.enum(["none", "PC", "PS"]),
  uom: optText(32),
  quantityExpr: optText(500),
  unitCost: finite.refine((n) => Math.abs(n) < 1e10, "Unit cost is too large"),
  markupPercent: finite.refine((n) => n >= -100 && n <= 1000, "Markup must be between -100% and 1000%").nullable(),
  taxable: z.boolean(),
  supplierId: optText(64),
  catalogueItemId: optText(64),
  measurementId: optText(64),
  notes: optText(5000),
  showInSpecification: z.boolean(),
  hiddenOnQuote: z.boolean(),
  status: z.enum(["Incomplete", "Complete"]),
});
const upsertSchema = rowFields.partial().extend({ id: z.string().min(1).max(64) });
const patchSchema = z.object({
  upserts: z.array(upsertSchema).max(5000),
  deletes: z.array(z.string().max(64)).max(5000),
});
export type CostingsPatch = z.input<typeof patchSchema>;

async function loadItems(estimateId: string) {
  return db
    .select()
    .from(schema.estimateItems)
    .where(eq(schema.estimateItems.estimateId, estimateId))
    .orderBy(asc(schema.estimateItems.sortOrder));
}

async function finish(estimateId: string): Promise<ActionResult> {
  await recalcEstimate(estimateId);
  revalidatePath(`/estimates/${estimateId}`, "layout");
  return { ok: true, items: await loadItems(estimateId) };
}

async function estimateExists(estimateId: string) {
  const [e] = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(eq(schema.estimates.id, estimateId));
  return !!e;
}

const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "input"}: ${i.message}` : "Invalid input";
};

/**
 * Apply a row patch (computed client-side by diffRows) to an estimate's costings.
 * Validates ownership and the category > item > sub-item structure before writing.
 */
export async function applyCostingsPatch(estimateId: string, patch: CostingsPatch): Promise<ActionResult> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!(await estimateExists(estimateId))) return { ok: false, error: "Estimate not found" };
  const { upserts, deletes } = parsed.data;

  const current = await loadItems(estimateId);
  const cur = new Map(current.map((r) => [r.id, r]));

  // ids that are new to this estimate must not belong to another estimate
  const newIds = upserts.filter((u) => !cur.has(u.id)).map((u) => u.id);
  if (newIds.length) {
    const clash = await db.select({ id: schema.estimateItems.id }).from(schema.estimateItems).where(inArray(schema.estimateItems.id, newIds));
    if (clash.length) return { ok: false, error: "Row id already in use" };
  }

  // Build the resulting tree in memory
  const next = new Map(cur);
  const inserts: (typeof schema.estimateItems.$inferInsert)[] = [];
  const updates: { id: string; set: Partial<typeof schema.estimateItems.$inferInsert> }[] = [];
  for (const u of upserts) {
    const { id, ...fields } = u;
    const set: Partial<typeof schema.estimateItems.$inferInsert> = { ...fields };
    if ("quantityExpr" in fields) {
      const q = fields.quantityExpr?.trim() ? fields.quantityExpr.trim() : null;
      set.quantityExpr = q;
      if (q === null) set.quantity = 0;
    }
    if (typeof set.description === "string") set.description = set.description.trim();
    const existing = cur.get(id);
    if (existing) {
      next.set(id, { ...existing, ...set } as EstimateItem);
      updates.push({ id, set });
    } else {
      if (!fields.kind) return { ok: false, error: "New rows need a kind" };
      const row = { id, estimateId, parentId: null, sortOrder: 0, ...set, kind: fields.kind } as typeof schema.estimateItems.$inferInsert;
      inserts.push(row);
      next.set(id, { ...row } as EstimateItem);
    }
  }
  const kill = new Set<string>();
  const all = [...next.values()];
  for (const d of deletes) if (next.has(d)) for (const s of subtreeIds(all, d)) kill.add(s);
  const result = all.filter((r) => !kill.has(r.id));
  const err = validateTree(result);
  if (err) return { ok: false, error: err };

  await db.transaction(async (tx) => {
    if (kill.size) await tx.delete(schema.estimateItems).where(and(eq(schema.estimateItems.estimateId, estimateId), inArray(schema.estimateItems.id, [...kill])));
    for (const row of inserts) if (!kill.has(row.id!)) await tx.insert(schema.estimateItems).values(row);
    for (const u of updates) {
      if (kill.has(u.id) || !Object.keys(u.set).length) continue;
      await tx.update(schema.estimateItems).set(u.set).where(and(eq(schema.estimateItems.id, u.id), eq(schema.estimateItems.estimateId, estimateId)));
    }
  });
  return finish(estimateId);
}

const markupSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Each markup line needs a name").max(60),
      percent: finite.refine((n) => n >= -100 && n <= 1000, "Markup must be between -100% and 1000%"),
    }),
  )
  .max(12, "Up to 12 markup lines");

export async function saveMarkupLines(estimateId: string, lines: MarkupLine[]): Promise<ActionResult> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = markupSchema.safeParse(lines);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid markup" };
  if (!(await estimateExists(estimateId))) return { ok: false, error: "Estimate not found" };
  await db.update(schema.estimates).set({ markupLines: JSON.stringify(parsed.data) }).where(eq(schema.estimates.id, estimateId));
  return finish(estimateId);
}

const roundingSchema = z.enum(["none", "dollar", "ten", "hundred", "thousand"]);

export async function setRounding(estimateId: string, rounding: string): Promise<ActionResult> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = roundingSchema.safeParse(rounding);
  if (!parsed.success) return { ok: false, error: "Unknown rounding option" };
  if (!(await estimateExists(estimateId))) return { ok: false, error: "Estimate not found" };
  await db.update(schema.estimates).set({ rounding: parsed.data }).where(eq(schema.estimates.id, estimateId));
  return finish(estimateId);
}

export type CatalogueHit = {
  id: string;
  catalogueId: string;
  categoryId: string | null;
  itemCode: string | null;
  description: string;
  costType: string;
  uom: string;
  unitCost: number;
  isRecipe: boolean;
  lineCount: number;
};

const searchSchema = z.object({
  q: z.string().max(100).default(""),
  catalogueId: z.string().max(64).default(""),
  categoryId: z.string().max(64).default(""),
});

/** Search catalogue items by description or code, optionally within a catalogue / category. */
export async function searchCatalogue(input: { q?: string; catalogueId?: string; categoryId?: string }): Promise<CatalogueHit[]> {
  const denial = await denied("estimates.edit");
  if (denial) return [];
  const p = searchSchema.parse(input);
  const conds = [eq(schema.catalogueItems.archived, false)];
  if (p.catalogueId) conds.push(eq(schema.catalogueItems.catalogueId, p.catalogueId));
  if (p.categoryId) conds.push(eq(schema.catalogueItems.categoryId, p.categoryId));
  const q = p.q.trim();
  if (q) {
    const pat = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(or(like(schema.catalogueItems.description, pat), like(schema.catalogueItems.itemCode, pat))!);
  }
  const rows = await db
    .select()
    .from(schema.catalogueItems)
    .where(and(...conds))
    .orderBy(asc(schema.catalogueItems.description))
    .limit(200);
  const recipeIds = rows.filter((r) => r.isRecipe).map((r) => r.id);
  const lines = recipeIds.length
    ? await db.select({ r: schema.catalogueRecipeLines.recipeItemId }).from(schema.catalogueRecipeLines).where(inArray(schema.catalogueRecipeLines.recipeItemId, recipeIds))
    : [];
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.r, (counts.get(l.r) ?? 0) + 1);
  return rows.map((r) => ({
    id: r.id, catalogueId: r.catalogueId, categoryId: r.categoryId, itemCode: r.itemCode, description: r.description,
    costType: r.costType, uom: r.uom, unitCost: r.unitCost, isRecipe: r.isRecipe, lineCount: counts.get(r.id) ?? 0,
  }));
}

const addSchema = z.object({
  categoryId: z.string().max(64),
  /** 0-based position among the category's items; omitted = append. */
  index: z.number().int().min(0).max(100000).optional(),
  picks: z
    .array(z.object({ id: z.string().min(1).max(64), quantity: finite.refine((n) => n >= 0 && n < 1e9, "Quantity must be 0 or more") }))
    .min(1, "Select at least one item")
    .max(200),
});

/**
 * Insert catalogue items into a category (at `index`, or appended); recipes expand into a parent
 * with sub-items. Shared by the "Add from catalogue" dialog and the docked catalogue panel
 * (quick-add "+" and drag-and-drop).
 */
export async function addCatalogueItems(
  estimateId: string,
  input: { categoryId: string; index?: number; picks: { id: string; quantity: number }[] },
): Promise<ActionResult> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid selection" };
  if (!(await estimateExists(estimateId))) return { ok: false, error: "Estimate not found" };
  const current = await loadItems(estimateId);
  let categoryId = parsed.data.categoryId;
  if (!categoryId) {
    const cats = childrenOf(current, null);
    categoryId = crypto.randomUUID();
    await db.insert(schema.estimateItems).values({ id: categoryId, estimateId, kind: "category", description: "General", sortOrder: cats.length + 1 });
  } else {
    const cat = current.find((r) => r.id === categoryId && r.kind === "category");
    if (!cat) return { ok: false, error: "Choose a category to add to" };
  }
  const ids = parsed.data.picks.map((p) => p.id);
  const items = await db.select().from(schema.catalogueItems).where(inArray(schema.catalogueItems.id, ids));
  const byId = new Map(items.map((i) => [i.id, i]));
  const recipeIds = items.filter((i) => i.isRecipe).map((i) => i.id);
  const lines = recipeIds.length
    ? await db.select().from(schema.catalogueRecipeLines).where(inArray(schema.catalogueRecipeLines.recipeItemId, recipeIds))
    : [];
  const picks = parsed.data.picks
    .filter((p) => byId.has(p.id))
    .map((p) => ({ item: byId.get(p.id)!, quantity: p.quantity, lines: lines.filter((l) => l.recipeItemId === p.id) }));
  if (!picks.length) return { ok: false, error: "Those catalogue items no longer exist" };
  const plan = insertPlan(childrenOf(current, categoryId), parsed.data.index ?? null, picks.length);
  const rows = catalogueToRows(picks, categoryId, plan.startOrder);
  const taxDefaults = taxableDefaults(await getTaxRates());
  await db.transaction(async (tx) => {
    for (const u of plan.updates) {
      await tx.update(schema.estimateItems).set({ sortOrder: u.sortOrder }).where(and(eq(schema.estimateItems.id, u.id), eq(schema.estimateItems.estimateId, estimateId)));
    }
    await tx.insert(schema.estimateItems).values(
      rows.map((r) => ({
        ...r,
        estimateId,
        costType: r.costType as (typeof COST_TYPES)[number],
        taxable: defaultTaxable(taxDefaults, r.costType),
      })),
    );
  });
  return finish(estimateId);
}

export type PanelItem = {
  id: string;
  catalogueId: string;
  catalogueName: string;
  categoryId: string | null;
  categoryName: string | null;
  itemCode: string | null;
  description: string;
  costType: string;
  uom: string;
  unitCost: number;
  isRecipe: boolean;
  lineCount: number;
};

const browseSchema = z.object({
  q: z.string().max(100).default(""),
  catalogueId: z.string().max(64).default(""),
  categoryId: z.string().max(64).default(""),
  recipesOnly: z.boolean().default(false),
});

/**
 * Catalogue panel browse/search (Catalogues and Recipes tabs) via the shared `searchCatalogueItems`.
 * Without a catalogue, archived catalogues are left out; `categoryId: "none"` = uncategorised items.
 */
export async function browseCatalogue(input: {
  q?: string;
  catalogueId?: string;
  categoryId?: string;
  recipesOnly?: boolean;
}): Promise<{ ok: true; items: PanelItem[] } | { ok: false; error: string }> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const parsed = browseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const p = parsed.data;
  const found = await searchCatalogueItems({
    q: p.q, catalogueId: p.catalogueId || null, categoryId: p.categoryId || null, limit: p.recipesOnly ? 500 : 200,
  });
  const items = (p.recipesOnly ? found.filter((r) => r.isRecipe) : found).slice(0, 200).map((r) => ({
    id: r.id, catalogueId: r.catalogueId, catalogueName: r.catalogueName, categoryId: r.categoryId, categoryName: r.categoryName,
    itemCode: r.itemCode, description: r.description, costType: r.costType, uom: r.uom, unitCost: r.unitCost, isRecipe: r.isRecipe,
    lineCount: r.recipeLines.length,
  }));
  return { ok: true, items };
}
