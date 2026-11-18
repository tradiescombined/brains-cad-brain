import "server-only";
/** Server-side catalogue helpers shared by the catalogue pages, actions and export route. */
import { db, schema } from "@/db";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getLookups } from "@/lib/settings";
import { recipeTotals } from "./recipe";

const { catalogues: C, catalogueCategories: K, catalogueItems: I, catalogueRecipeLines: L } = schema;

export type Catalogue = typeof C.$inferSelect;
export type CatalogueCategory = typeof K.$inferSelect;
export type CatalogueItem = typeof I.$inferSelect;
export type RecipeLine = typeof L.$inferSelect;

export async function getCatalogue(id: string) {
  const [c] = await db.select().from(C).where(eq(C.id, id));
  return c ?? null;
}

export async function getCategories(catalogueId: string) {
  return db.select().from(K).where(eq(K.catalogueId, catalogueId)).orderBy(asc(K.sortOrder), asc(K.name));
}

/** Categories as a display-ordered flat list: each parent followed by its children. */
export function orderTree(cats: CatalogueCategory[]) {
  const tops = cats.filter((c) => !c.parentId || !cats.some((p) => p.id === c.parentId));
  const out: (CatalogueCategory & { depth: number })[] = [];
  for (const t of tops) {
    out.push({ ...t, depth: 0 });
    for (const ch of cats.filter((c) => c.parentId === t.id)) out.push({ ...ch, depth: 1 });
  }
  return out;
}

/** "Parent > Child" label for a category id. */
export function categoryPathFn(cats: CatalogueCategory[]) {
  const byId = new Map(cats.map((c) => [c.id, c]));
  return (id: string | null) => {
    if (!id) return "";
    const c = byId.get(id);
    if (!c) return "";
    const p = c.parentId ? byId.get(c.parentId) : undefined;
    return p ? `${p.name} > ${c.name}` : c.name;
  };
}

export async function getUnitMeasures() {
  return (await getLookups("unit_measure")).map((l) => l.name);
}

export async function supplierOptions() {
  const rows = await db
    .select({ id: schema.contacts.id, name: schema.contacts.name, businessName: schema.contacts.businessName, contactType: schema.contacts.contactType })
    .from(schema.contacts)
    .where(eq(schema.contacts.archived, false))
    .orderBy(asc(schema.contacts.name));
  return rows.map((r) => ({ value: r.id, label: (r.businessName || r.name) + (r.contactType ? ` (${r.contactType})` : "") }));
}

export async function itemCounts() {
  const rows = await db.select({ catalogueId: I.catalogueId, n: count() }).from(I).where(eq(I.archived, false)).groupBy(I.catalogueId);
  return new Map(rows.map((r) => [r.catalogueId, r.n]));
}

/** Recalculate a recipe item's unit cost from its lines and save it. Returns the new cost. */
export async function recomputeRecipe(recipeId: string): Promise<number> {
  const lines = await db.select().from(L).where(eq(L.recipeItemId, recipeId));
  const { unitCost } = recipeTotals(lines);
  await db.update(I).set({ unitCost }).where(and(eq(I.id, recipeId), eq(I.isRecipe, true)));
  return unitCost;
}

/**
 * After component prices change, refresh the unit cost on every recipe line linked to them,
 * recalculate those recipes, and continue up the chain (recipes used inside other recipes).
 */
export async function cascadeComponentCosts(changedIds: string[], depth = 0): Promise<void> {
  if (!changedIds.length || depth > 6) return;
  const comps = await db.select({ id: I.id, unitCost: I.unitCost }).from(I).where(inArray(I.id, changedIds));
  const lines = await db.select().from(L).where(inArray(L.componentItemId, changedIds));
  if (!lines.length) return;
  const cost = new Map(comps.map((c) => [c.id, c.unitCost]));
  for (const l of lines) {
    const c = cost.get(l.componentItemId!);
    if (c !== undefined && c !== l.unitCost) await db.update(L).set({ unitCost: c }).where(eq(L.id, l.id));
  }
  const recipes = [...new Set(lines.map((l) => l.recipeItemId))];
  for (const r of recipes) await recomputeRecipe(r);
  await cascadeComponentCosts(recipes, depth + 1);
}

/** Delete items and everything hanging off them (their recipe lines; links from other recipes become free text). */
export async function deleteItemsHard(ids: string[]) {
  if (!ids.length) return;
  const affected = await db.selectDistinct({ r: L.recipeItemId }).from(L).where(and(inArray(L.componentItemId, ids)));
  await db.delete(L).where(inArray(L.recipeItemId, ids));
  await db.update(L).set({ componentItemId: null }).where(inArray(L.componentItemId, ids));
  await db.delete(I).where(inArray(I.id, ids));
  for (const a of affected) if (!ids.includes(a.r)) await recomputeRecipe(a.r);
}

/** Deep copy of a catalogue: categories (with nesting), items and recipe lines. Returns the new id. */
export async function duplicateCatalogue(id: string): Promise<string | null> {
  const src = await getCatalogue(id);
  if (!src) return null;
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _id; void _c; void _u;
  const [copy] = await db.insert(C).values({ ...rest, name: `${src.name} (copy)`, status: src.status === "Archived" ? "Draft" : src.status }).returning();
  const cats = await getCategories(id);
  const catMap = new Map<string, string>();
  for (const c of cats) catMap.set(c.id, crypto.randomUUID());
  if (cats.length)
    await db.insert(K).values(cats.map((c) => ({ id: catMap.get(c.id)!, catalogueId: copy.id, parentId: c.parentId ? catMap.get(c.parentId) ?? null : null, name: c.name, sortOrder: c.sortOrder })));
  const items = await db.select().from(I).where(eq(I.catalogueId, id));
  const itemMap = new Map<string, string>();
  for (const it of items) itemMap.set(it.id, crypto.randomUUID());
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    await db.insert(I).values(
      chunk.map(({ id: oid, createdAt: _a, updatedAt: _b, ...it }) => {
        void _a; void _b;
        return { ...it, id: itemMap.get(oid)!, catalogueId: copy.id, categoryId: it.categoryId ? catMap.get(it.categoryId) ?? null : null };
      }),
    );
  }
  const recipeIds = items.filter((i) => i.isRecipe).map((i) => i.id);
  if (recipeIds.length) {
    const lines = await db.select().from(L).where(inArray(L.recipeItemId, recipeIds));
    for (let i = 0; i < lines.length; i += 200) {
      const chunk = lines.slice(i, i + 200);
      await db.insert(L).values(
        chunk.map(({ id: _x, ...l }) => {
          void _x;
          return { ...l, recipeItemId: itemMap.get(l.recipeItemId)!, componentItemId: l.componentItemId ? itemMap.get(l.componentItemId) ?? l.componentItemId : null };
        }),
      );
    }
  }
  return copy.id;
}

/** Delete a catalogue with its categories, items and recipe lines. */
export async function deleteCatalogueHard(id: string) {
  const ids = (await db.select({ id: I.id }).from(I).where(eq(I.catalogueId, id))).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) await deleteItemsHard(ids.slice(i, i + 500));
  await db.delete(K).where(eq(K.catalogueId, id));
  await db.delete(C).where(eq(C.id, id));
}

/** Item counts per category for the sidebar (plus all/uncategorised). */
export async function categoryCounts(catalogueId: string) {
  const rows = await db.select({ categoryId: I.categoryId, n: count() }).from(I).where(and(eq(I.catalogueId, catalogueId), eq(I.archived, false))).groupBy(I.categoryId);
  const m = new Map<string, number>();
  let all = 0;
  for (const r of rows) {
    all += r.n;
    m.set(r.categoryId ?? "none", r.n);
  }
  return { all, byCategory: Object.fromEntries(m) as Record<string, number> };
}

