"use server";
import { denied } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/settings";
import { COST_TYPES, mapRows, parseCsv, planImport, type Mapping } from "@/lib/catalogue-csv";
import { adjustByPercent, createsCycle, evalRecipeQty, recipeTotals } from "../recipe";
import { searchCatalogueItems } from "../search";
import { cascadeComponentCosts, deleteItemsHard, getCatalogue, getCategories, recomputeRecipe } from "../server";

const { catalogueCategories: K, catalogueItems: I, catalogueRecipeLines: L } = schema;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const path = (catalogueId: string) => `/catalogues/${catalogueId}`;
function refresh(catalogueId: string) {
  revalidatePath(path(catalogueId));
  revalidatePath("/catalogues");
}

/* ------------------------------------------------------------------ categories */

export async function addCategory(catalogueId: string, name: string, parentId: string | null): Promise<Result<{ id: string }>> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const n = name.trim();
  if (!n) return fail("Category name is required");
  if (n.length > 80) return fail("Keep category names under 80 characters");
  if (!(await getCatalogue(catalogueId))) return fail("Catalogue not found");
  if (parentId) {
    const [p] = await db.select().from(K).where(and(eq(K.id, parentId), eq(K.catalogueId, catalogueId)));
    if (!p) return fail("Parent category not found");
    if (p.parentId) return fail("Categories can only be nested one level");
  }
  const [{ m }] = await db.select({ m: max(K.sortOrder) }).from(K).where(eq(K.catalogueId, catalogueId));
  const [row] = await db.insert(K).values({ catalogueId, name: n, parentId, sortOrder: (m ?? -1) + 1 }).returning();
  refresh(catalogueId);
  return { ok: true, id: row.id };
}

export async function renameCategory(id: string, name: string): Promise<Result> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const n = name.trim();
  if (!n) return fail("Category name is required");
  const [c] = await db.update(K).set({ name: n.slice(0, 80) }).where(eq(K.id, id)).returning();
  if (!c) return fail("Category not found");
  refresh(c.catalogueId);
  return { ok: true };
}

/** Move a category up/down among its siblings. */
export async function moveCategory(id: string, dir: -1 | 1): Promise<Result> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const [c] = await db.select().from(K).where(eq(K.id, id));
  if (!c) return fail("Category not found");
  const sibs = (await getCategories(c.catalogueId)).filter((s) => (s.parentId ?? null) === (c.parentId ?? null));
  const i = sibs.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return { ok: true };
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  for (let k = 0; k < sibs.length; k++) if (sibs[k].sortOrder !== k) await db.update(K).set({ sortOrder: k }).where(eq(K.id, sibs[k].id));
  refresh(c.catalogueId);
  return { ok: true };
}

/** Nest under another top-level category (parentId) or make top level (null). One level only. */
export async function setCategoryParent(id: string, parentId: string | null): Promise<Result> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const cats = await db.select().from(K).where(eq(K.id, id));
  const c = cats[0];
  if (!c) return fail("Category not found");
  const all = await getCategories(c.catalogueId);
  if (parentId) {
    if (parentId === id) return fail("A category cannot contain itself");
    const p = all.find((x) => x.id === parentId);
    if (!p) return fail("Parent category not found");
    if (p.parentId) return fail("Categories can only be nested one level");
    if (all.some((x) => x.parentId === id)) return fail("This category has sub-categories, so it can't be nested");
  }
  const sibs = all.filter((x) => (x.parentId ?? null) === parentId && x.id !== id);
  const sortOrder = sibs.length ? Math.max(...sibs.map((s) => s.sortOrder)) + 1 : 0;
  await db.update(K).set({ parentId, sortOrder }).where(eq(K.id, id));
  refresh(c.catalogueId);
  return { ok: true };
}

/** Delete a category. Its items become uncategorised; sub-categories move up to the top level. */
export async function deleteCategory(id: string): Promise<Result> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const [c] = await db.select().from(K).where(eq(K.id, id));
  if (!c) return fail("Category not found");
  await db.update(I).set({ categoryId: null }).where(eq(I.categoryId, id));
  await db.update(K).set({ parentId: null }).where(eq(K.parentId, id));
  await db.delete(K).where(eq(K.id, id));
  refresh(c.catalogueId);
  return { ok: true };
}

/* ------------------------------------------------------------------ items */

const ItemPatch = z
  .object({
    itemCode: z.string().trim().max(60).transform((v) => v || null),
    description: z.string().trim().min(1, "Description is required").max(500),
    costType: z.enum(COST_TYPES),
    uom: z.string().trim().min(1, "Unit is required").max(20),
    unitCost: z.coerce.number({ message: "Unit cost must be a number" }).finite().min(0, "Unit cost cannot be negative").max(1e9),
    categoryId: z.string().nullable(),
    details: z.string().max(5000).transform((v) => v.trim() || null),
    imageUrl: z
      .string()
      .trim()
      .transform((v) => v || null)
      .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v) || /^data:image\//.test(v), "Image URL must start with http:// or https://"),
  })
  .partial();
export type ItemPatchInput = z.input<typeof ItemPatch>;

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Invalid value";
}

async function checkCategory(catalogueId: string, categoryId: string | null | undefined) {
  if (!categoryId) return true;
  const [k] = await db.select({ id: K.id }).from(K).where(and(eq(K.id, categoryId), eq(K.catalogueId, catalogueId)));
  return !!k;
}

export async function createItem(catalogueId: string, input: ItemPatchInput): Promise<Result<{ id: string }>> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const p = ItemPatch.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error));
  if (!p.data.description) return fail("Description is required");
  if (!(await getCatalogue(catalogueId))) return fail("Catalogue not found");
  if (!(await checkCategory(catalogueId, p.data.categoryId))) return fail("Category not found");
  const [row] = await db
    .insert(I)
    .values({ catalogueId, description: p.data.description, itemCode: p.data.itemCode ?? null, costType: p.data.costType ?? "Material", uom: p.data.uom || "ea", unitCost: p.data.unitCost ?? 0, categoryId: p.data.categoryId ?? null })
    .returning();
  refresh(catalogueId);
  return { ok: true, id: row.id };
}

export async function updateItem(id: string, input: ItemPatchInput): Promise<Result> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const p = ItemPatch.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error));
  const [item] = await db.select().from(I).where(eq(I.id, id));
  if (!item) return fail("Item not found");
  if (p.data.categoryId !== undefined && !(await checkCategory(item.catalogueId, p.data.categoryId))) return fail("Category not found");
  const patch = { ...p.data };
  if (item.isRecipe) delete patch.unitCost; // recipe cost is derived from its components
  if (Object.keys(patch).length) await db.update(I).set(patch).where(eq(I.id, id));
  if (patch.unitCost !== undefined && patch.unitCost !== item.unitCost) await cascadeComponentCosts([id]);
  refresh(item.catalogueId);
  return { ok: true };
}

export async function getItemDetail(id: string) {
  const denial = await denied("costs.view");
  if (denial) return null;
  const [item] = await db.select().from(I).where(eq(I.id, id));
  if (!item) return null;
  const lines = await db.select().from(L).where(eq(L.recipeItemId, id)).orderBy(asc(L.sortOrder));
  const compIds = lines.map((l) => l.componentItemId).filter((x): x is string => !!x);
  const comps = compIds.length
    ? await db.select({ id: I.id, itemCode: I.itemCode, unitCost: I.unitCost, catalogueName: schema.catalogues.name }).from(I).innerJoin(schema.catalogues, eq(schema.catalogues.id, I.catalogueId)).where(inArray(I.id, compIds))
    : [];
  const byId = new Map(comps.map((c) => [c.id, c]));
  const usedIn = await db
    .select({ id: I.id, description: I.description })
    .from(L)
    .innerJoin(I, eq(I.id, L.recipeItemId))
    .where(eq(L.componentItemId, id));
  return {
    item,
    usedIn,
    lines: lines.map((l) => ({ ...l, componentCode: l.componentItemId ? byId.get(l.componentItemId)?.itemCode ?? null : null, componentCatalogue: l.componentItemId ? byId.get(l.componentItemId)?.catalogueName ?? null : null, componentMissing: !!l.componentItemId && !byId.has(l.componentItemId) })),
  };
}
export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItemDetail>>>;

export async function deleteItems(ids: string[]): Promise<Result<{ count: number }>> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  if (!ids.length) return { ok: true, count: 0 };
  const rows = await db.select({ id: I.id, catalogueId: I.catalogueId }).from(I).where(inArray(I.id, ids));
  await deleteItemsHard(rows.map((r) => r.id));
  for (const c of new Set(rows.map((r) => r.catalogueId))) refresh(c);
  return { ok: true, count: rows.length };
}

export async function bulkMoveCategory(catalogueId: string, ids: string[], categoryId: string | null): Promise<Result> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  if (!(await checkCategory(catalogueId, categoryId))) return fail("Category not found");
  await db.update(I).set({ categoryId }).where(and(inArray(I.id, ids), eq(I.catalogueId, catalogueId)));
  refresh(catalogueId);
  return { ok: true };
}

export async function bulkCostType(catalogueId: string, ids: string[], costType: string): Promise<Result> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const p = z.enum(COST_TYPES).safeParse(costType);
  if (!p.success) return fail("Pick a cost type");
  await db.update(I).set({ costType: p.data }).where(and(inArray(I.id, ids), eq(I.catalogueId, catalogueId)));
  refresh(catalogueId);
  return { ok: true };
}

/**
 * Adjust prices by a percentage. Plain items are changed directly; for recipe items the
 * percentage is applied to their free-text component lines (linked lines follow their component).
 */
export async function bulkAdjustPrice(catalogueId: string, ids: string[], percent: number): Promise<Result<{ count: number }>> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  if (!Number.isFinite(percent) || percent <= -100 || percent > 1000) return fail("Enter a percentage between -99.99 and 1000");
  if (percent === 0) return fail("Enter a non-zero percentage");
  const items = await db.select().from(I).where(and(inArray(I.id, ids), eq(I.catalogueId, catalogueId)));
  const changed: string[] = [];
  for (const it of items) {
    if (it.isRecipe) {
      const lines = await db.select().from(L).where(and(eq(L.recipeItemId, it.id), isNull(L.componentItemId)));
      for (const l of lines) await db.update(L).set({ unitCost: adjustByPercent(l.unitCost, percent) }).where(eq(L.id, l.id));
      await recomputeRecipe(it.id);
    } else {
      await db.update(I).set({ unitCost: adjustByPercent(it.unitCost, percent) }).where(eq(I.id, it.id));
    }
    changed.push(it.id);
  }
  await cascadeComponentCosts(changed);
  await logActivity("catalogue", catalogueId, "updated", `Adjusted ${changed.length} prices by ${percent > 0 ? "+" : ""}${percent}%`);
  refresh(catalogueId);
  return { ok: true, count: changed.length };
}

/* ------------------------------------------------------------------ recipes */

export type RecipeLineInput = {
  componentItemId: string | null;
  description: string;
  costType: string;
  uom: string | null;
  quantityExpr: string;
  unitCost: number;
};

export async function saveRecipe(itemId: string, isRecipe: boolean, lines: RecipeLineInput[]): Promise<Result<{ unitCost: number }>> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  const [item] = await db.select().from(I).where(eq(I.id, itemId));
  if (!item) return fail("Item not found");
  if (!isRecipe) {
    await db.delete(L).where(eq(L.recipeItemId, itemId));
    if (item.isRecipe) await db.update(I).set({ isRecipe: false }).where(eq(I.id, itemId));
    refresh(item.catalogueId);
    return { ok: true, unitCost: item.unitCost };
  }
  if (lines.length > 200) return fail("A recipe can have at most 200 components");
  // validate
  const compIds = [...new Set(lines.map((l) => l.componentItemId).filter((x): x is string => !!x))];
  const comps = compIds.length ? await db.select().from(I).where(inArray(I.id, compIds)) : [];
  const compById = new Map(comps.map((c) => [c.id, c]));
  const allLines = await db.select({ r: L.recipeItemId, c: L.componentItemId }).from(L);
  const children = new Map<string, string[]>();
  for (const l of allLines) if (l.c && l.r !== itemId) children.set(l.r, [...(children.get(l.r) ?? []), l.c]);
  const clean: (typeof L.$inferInsert)[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const n = i + 1;
    const description = String(l.description ?? "").trim();
    if (!description) return fail(`Line ${n}: description is required`);
    const q = evalRecipeQty(l.quantityExpr);
    if (q.error) return fail(`Line ${n}: ${q.error}`);
    const costType = (COST_TYPES as readonly string[]).includes(l.costType) ? l.costType : "Material";
    let unitCost = Number(l.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) return fail(`Line ${n}: unit cost must be zero or more`);
    let componentItemId = l.componentItemId || null;
    if (componentItemId) {
      const comp = compById.get(componentItemId);
      if (!comp) componentItemId = null; // component was deleted, keep as free text
      else {
        if (createsCycle(itemId, componentItemId, (id) => children.get(id) ?? [])) return fail(`Line ${n}: "${comp.description}" already uses this recipe, so it can't be a component`);
        unitCost = comp.unitCost; // linked lines always follow the component's price
      }
    }
    clean.push({ recipeItemId: itemId, componentItemId, description: description.slice(0, 500), costType, uom: l.uom?.trim() || null, quantityExpr: String(l.quantityExpr).trim(), unitCost, sortOrder: i });
  }
  const { unitCost } = recipeTotals(clean.map((c) => ({ quantityExpr: c.quantityExpr!, unitCost: c.unitCost! })));
  await db.transaction(async (tx) => {
    await tx.delete(L).where(eq(L.recipeItemId, itemId));
    if (clean.length) await tx.insert(L).values(clean);
    await tx.update(I).set({ isRecipe: true, unitCost }).where(eq(I.id, itemId));
  });
  if (unitCost !== item.unitCost) await cascadeComponentCosts([itemId]);
  refresh(item.catalogueId);
  return { ok: true, unitCost };
}

/** Component search for the recipe editor (any catalogue). */
export async function searchComponents(q: string, excludeId?: string) {
  const denial = await denied("costs.view");
  if (denial) return [];
  const rows = await searchCatalogueItems({ q, limit: 20 });
  return rows
    .filter((r) => r.id !== excludeId)
    .map((r) => ({ id: r.id, itemCode: r.itemCode, description: r.description, costType: r.costType, uom: r.uom, unitCost: r.unitCost, isRecipe: r.isRecipe, catalogueName: r.catalogueName, catalogueColour: r.catalogueColour }));
}

/* ------------------------------------------------------------------ CSV import */

export type ImportReport = {
  added: number;
  updated: number;
  skipped: { line: number; reason: string }[];
  warnings: { line: number; reason: string }[];
  categoriesCreated: number;
};

export async function importCsv(catalogueId: string, csvText: string, mapping: Mapping, hasHeader: boolean): Promise<Result<{ report: ImportReport }>> {
  const denial = await denied("catalogues.edit");
  if (denial) return { ok: false, error: denial };
  if (!(await getCatalogue(catalogueId))) return fail("Catalogue not found");
  if (!csvText.trim()) return fail("The file is empty");
  if (mapping.description == null || mapping.description < 0) return fail("Map a column to Description");
  const parsed = parseCsv(csvText);
  if (parsed.length > 20000) return fail("Import up to 20,000 rows at a time");
  const { rows, skipped } = mapRows(parsed, mapping, hasHeader);
  const existing = await db.select({ id: I.id, code: I.itemCode, isRecipe: I.isRecipe }).from(I).where(eq(I.catalogueId, catalogueId));
  const byCode = new Map<string, string>();
  for (const e of existing) if (e.code) byCode.set(e.code.trim().toLowerCase(), e.id);
  const recipeIds = new Set(existing.filter((e) => e.isRecipe).map((e) => e.id));
  const plan = planImport(rows, byCode, skipped);

  // categories by path (case-insensitive)
  const cats = await getCategories(catalogueId);
  const key = (parent: string | null, name: string) => `${parent ?? ""}::${name.toLowerCase()}`;
  const catByKey = new Map(cats.map((c) => [key(c.parentId, c.name), c.id]));
  let nextSort = cats.length ? Math.max(...cats.map((c) => c.sortOrder)) + 1 : 0;
  let categoriesCreated = 0;
  const ensureCategory = async (pathParts: string[]): Promise<string | null> => {
    let parent: string | null = null;
    for (const name of pathParts.slice(0, 2)) {
      const k = key(parent, name);
      let id = catByKey.get(k);
      if (!id) {
        id = crypto.randomUUID();
        await db.insert(K).values({ id, catalogueId, parentId: parent, name: name.slice(0, 80), sortOrder: nextSort++ });
        catByKey.set(k, id);
        categoriesCreated++;
      }
      parent = id;
    }
    return parent;
  };

  // create any missing categories up front (outside the transaction)
  const catFor = new Map<string, string | null>();
  for (const r of [...plan.inserts, ...plan.updates.map((u) => u.row)]) {
    if (r.category?.length) {
      const k = r.category.join(" > ").toLowerCase();
      if (!catFor.has(k)) catFor.set(k, await ensureCategory(r.category));
    }
  }
  const categoryOf = (r: { category: string[] | null }) => (r.category?.length ? catFor.get(r.category.join(" > ").toLowerCase()) ?? null : null);

  const warnings: ImportReport["warnings"] = [];
  const priced: string[] = [];
  const inserts: (typeof I.$inferInsert)[] = plan.inserts.map((r) => {
    r.warnings.forEach((w) => warnings.push({ line: r.line, reason: w }));
    return {
      catalogueId, itemCode: r.code, description: r.description, costType: r.costType ?? "Material", uom: (r.uom || "ea").slice(0, 20),
      unitCost: r.unitCost ?? 0, details: r.details, categoryId: categoryOf(r),
    };
  });

  await db.transaction(async (tx) => {
    for (let i = 0; i < inserts.length; i += 200) await tx.insert(I).values(inserts.slice(i, i + 200));
    for (const { row: r, id } of plan.updates) {
      r.warnings.forEach((w) => warnings.push({ line: r.line, reason: w }));
      const patch: Partial<typeof I.$inferInsert> = { description: r.description };
      if (r.costType) patch.costType = r.costType;
      if (r.uom) patch.uom = r.uom.slice(0, 20);
      if (r.unitCost !== null) {
        if (recipeIds.has(id)) warnings.push({ line: r.line, reason: "Recipe item: unit cost comes from its components and was not changed" });
        else { patch.unitCost = r.unitCost; priced.push(id); }
      }
      if (r.details) patch.details = r.details;
      if (r.category?.length) patch.categoryId = categoryOf(r);
      await tx.update(I).set(patch).where(eq(I.id, id));
    }
  });
  if (priced.length) await cascadeComponentCosts(priced);
  const report: ImportReport = { added: inserts.length, updated: plan.updates.length, skipped: plan.skipped, warnings: warnings.sort((a, b) => a.line - b.line), categoriesCreated };
  await logActivity("catalogue", catalogueId, "imported", `Imported CSV: ${report.added} added, ${report.updated} updated, ${report.skipped.length} skipped`);
  refresh(catalogueId);
  return { ok: true, report };
}
