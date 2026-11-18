import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { catalogueToCsv } from "@/lib/catalogue-csv";
import { categoryPathFn, getCatalogue, getCategories, orderTree } from "@/app/(app)/catalogues/server";

/** CSV export of a catalogue's items, ordered by category then description. Re-importable. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await getCatalogue(id);
  if (!c) return new Response("Catalogue not found", { status: 404 });
  const cats = await getCategories(id);
  const order = new Map(orderTree(cats).map((k, i) => [k.id, i]));
  const items = await db
    .select()
    .from(schema.catalogueItems)
    .where(and(eq(schema.catalogueItems.catalogueId, id), eq(schema.catalogueItems.archived, false)))
    .orderBy(asc(schema.catalogueItems.description));
  items.sort((a, b) => (a.categoryId ? order.get(a.categoryId) ?? 1e9 : -1) - (b.categoryId ? order.get(b.categoryId) ?? 1e9 : -1));
  const csv = catalogueToCsv(items, categoryPathFn(cats));
  const fileName = `${(c.shortCode || c.name).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "catalogue"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
