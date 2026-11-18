import "server-only";
/**
 * Reusable catalogue item search (used by the catalogue recipe editor and by Estimate Costings'
 * "Add from catalogue"). Server-only; wrap it in a Server Action to call from the client.
 *
 *   const items = await searchCatalogueItems({ q: "pine 90", limit: 20 });
 *
 * - q: words matched (AND) against item code and description, case-insensitive. Empty = no filter.
 * - catalogueId: restrict to one catalogue. Without it, catalogues with status "Archived" are excluded.
 * - categoryId: restrict to a category (and its sub-categories). Use "none" for uncategorised.
 * - Recipe items include their component lines (ordered) in `recipeLines`.
 */
import { db, schema } from "@/db";
import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";

export type CatalogueSearchResult = {
  id: string;
  catalogueId: string;
  catalogueName: string;
  catalogueColour: string;
  categoryId: string | null;
  categoryName: string | null;
  itemCode: string | null;
  description: string;
  details: string | null;
  costType: "Material" | "Labour" | "MatLab" | "Equipment" | "Subcontractor" | "Other";
  uom: string;
  unitCost: number;
  isRecipe: boolean;
  imageUrl: string | null;
  recipeLines: {
    id: string;
    componentItemId: string | null;
    description: string;
    costType: string;
    uom: string | null;
    quantityExpr: string;
    unitCost: number;
    sortOrder: number;
  }[];
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export async function searchCatalogueItems(opts: { q?: string | null; catalogueId?: string | null; categoryId?: string | null; limit?: number }): Promise<CatalogueSearchResult[]> {
  const { catalogueItems: I, catalogues: C, catalogueCategories: K, catalogueRecipeLines: L } = schema;
  const limit = Math.max(1, Math.min(opts.limit ?? 25, 500));
  const where: SQL[] = [eq(I.archived, false)];
  if (opts.catalogueId) where.push(eq(I.catalogueId, opts.catalogueId));
  else where.push(ne(C.status, "Archived"));
  if (opts.categoryId === "none") where.push(isNull(I.categoryId));
  else if (opts.categoryId) {
    const kids = await db.select({ id: K.id }).from(K).where(eq(K.parentId, opts.categoryId));
    where.push(inArray(I.categoryId, [opts.categoryId, ...kids.map((k) => k.id)]));
  }
  const words = (opts.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const w of words) {
    const pat = `%${escapeLike(w)}%`;
    where.push(or(sql`${I.description} like ${pat} escape '\\'`, sql`coalesce(${I.itemCode}, '') like ${pat} escape '\\'`)!);
  }
  const first = words[0] ? `${escapeLike(words[0])}%` : null;
  const rows = await db
    .select({
      id: I.id, catalogueId: I.catalogueId, catalogueName: C.name, catalogueColour: C.colour, categoryId: I.categoryId, categoryName: K.name,
      itemCode: I.itemCode, description: I.description, details: I.details, costType: I.costType, uom: I.uom, unitCost: I.unitCost,
      isRecipe: I.isRecipe, imageUrl: I.imageUrl,
    })
    .from(I)
    .innerJoin(C, eq(C.id, I.catalogueId))
    .leftJoin(K, eq(K.id, I.categoryId))
    .where(and(...where))
    .orderBy(
      ...(first ? [sql`case when coalesce(${I.itemCode}, '') like ${first} escape '\\' then 0 when ${I.description} like ${first} escape '\\' then 1 else 2 end`] : []),
      asc(I.description),
    )
    .limit(limit);
  const recipeIds = rows.filter((r) => r.isRecipe).map((r) => r.id);
  const lines = recipeIds.length
    ? await db.select().from(L).where(inArray(L.recipeItemId, recipeIds)).orderBy(asc(L.sortOrder))
    : [];
  const byRecipe = new Map<string, CatalogueSearchResult["recipeLines"]>();
  for (const l of lines) {
    const arr = byRecipe.get(l.recipeItemId) ?? [];
    arr.push({ id: l.id, componentItemId: l.componentItemId, description: l.description, costType: l.costType, uom: l.uom, quantityExpr: l.quantityExpr, unitCost: l.unitCost, sortOrder: l.sortOrder });
    byRecipe.set(l.recipeItemId, arr);
  }
  return rows.map((r) => ({ ...r, recipeLines: byRecipe.get(r.id) ?? [] }));
}
