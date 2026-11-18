import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { COST_TYPES } from "@/lib/catalogue-csv";
import { cx, num } from "@/lib/format";
import { CatalogueHeader } from "./CatalogueHeader";
import { CategorySidebar } from "./CategorySidebar";
import { ItemGrid } from "./ItemGrid";
import { GridToolbar } from "./GridToolbar";
import { categoryCounts, getCatalogue, getCategories, getUnitMeasures, orderTree } from "../server";

const PAGE_SIZE = 100;
const SORTS = { code: schema.catalogueItems.itemCode, description: schema.catalogueItems.description, type: schema.catalogueItems.costType, uom: schema.catalogueItems.uom, cost: schema.catalogueItems.unitCost, updated: schema.catalogueItems.updatedAt } as const;
type SortKey = keyof typeof SORTS;

type SP = { q?: string; type?: string; cat?: string; sort?: string; dir?: string; page?: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCatalogue(id);
  return { title: c ? `${c.name} · Catalogues` : "Catalogue" };
}

export default async function CataloguePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const catalogue = await getCatalogue(id);
  if (!catalogue) notFound();
  const I = schema.catalogueItems;

  const [cats, counts, uoms] = await Promise.all([getCategories(id), categoryCounts(id), getUnitMeasures()]);
  const tree = orderTree(cats);
  const cat = sp.cat && (sp.cat === "none" || cats.some((c) => c.id === sp.cat)) ? sp.cat : "all";
  const type = (COST_TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : "";
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : "description";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const q = (sp.q ?? "").trim();

  const where: SQL[] = [eq(I.catalogueId, id), eq(I.archived, false)];
  if (cat === "none") where.push(isNull(I.categoryId));
  else if (cat !== "all") where.push(inArray(I.categoryId, [cat, ...cats.filter((c) => c.parentId === cat).map((c) => c.id)]));
  if (type) where.push(eq(I.costType, type as (typeof COST_TYPES)[number]));
  for (const w of q.split(/\s+/).filter(Boolean).slice(0, 8)) {
    const pat = `%${w.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    where.push(or(sql`${I.description} like ${pat} escape '\\'`, sql`coalesce(${I.itemCode}, '') like ${pat} escape '\\'`)!);
  }
  const [{ total }] = await db.select({ total: count() }).from(I).where(and(...where));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(sp.page ?? "1", 10) || 1));
  const col = SORTS[sort];
  const items = await db
    .select()
    .from(I)
    .where(and(...where))
    .orderBy(dir === "desc" ? desc(col) : asc(col), asc(I.description), asc(I.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const base = `/catalogues/${id}`;
  const qs = (over: Partial<SP>) => {
    const u = new URLSearchParams();
    const merged = { q, type, cat: cat === "all" ? "" : cat, sort: sort === "description" ? "" : sort, dir: dir === "asc" ? "" : dir, page: page > 1 ? String(page) : "", ...over };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };
  const sortHrefs = Object.fromEntries(
    (Object.keys(SORTS) as SortKey[]).map((k) => [k, qs({ sort: k === "description" && !(sort === k && dir === "asc") ? "" : k, dir: sort === k && dir === "asc" ? "desc" : "", page: "" })]),
  ) as Record<SortKey, string>;

  const catName = cat === "all" ? "All items" : cat === "none" ? "Uncategorised" : cats.find((c) => c.id === cat)?.name ?? "";

  return (
    <div>
      <CatalogueHeader catalogue={catalogue} itemCount={counts.all} />
      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <CategorySidebar
          catalogueId={id}
          tree={tree.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, depth: c.depth }))}
          counts={counts.byCategory}
          allCount={counts.all}
          active={cat}
          hrefFor={Object.fromEntries([["all", qs({ cat: "", page: "" })], ["none", qs({ cat: "none", page: "" })], ...cats.map((c) => [c.id, qs({ cat: c.id, page: "" })])])}
        />
        <div className="min-w-0 space-y-3">
          <GridToolbar q={q} type={type} title={catName} total={total} />
          <ItemGrid
            key={`${cat}|${type}|${q}|${sort}|${dir}|${page}`}
            catalogueId={id}
            items={items.map((i) => ({ id: i.id, itemCode: i.itemCode, description: i.description, costType: i.costType, uom: i.uom, unitCost: i.unitCost, isRecipe: i.isRecipe, categoryId: i.categoryId, imageUrl: i.imageUrl, hasDetails: !!i.details, updatedAt: i.updatedAt }))}
            categories={tree.map((c) => ({ id: c.id, name: c.name, depth: c.depth }))}
            uoms={uoms}
            defaultCategoryId={cat !== "all" && cat !== "none" ? cat : null}
            sort={sort}
            dir={dir}
            sortHrefs={sortHrefs}
            filtered={!!q || !!type}
            emptyCatalogue={counts.all === 0}
          />
          {pages > 1 && (
            <nav className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Pagination">
              <span className="text-ink-500 tabular-nums">
                {num((page - 1) * PAGE_SIZE + 1, 0)}–{num(Math.min(total, page * PAGE_SIZE), 0)} of {num(total, 0)}
              </span>
              <div className="flex items-center gap-1">
                <PageLink href={qs({ page: page > 2 ? String(page - 1) : "" })} disabled={page <= 1}>← Prev</PageLink>
                <span className="px-2 text-ink-500">Page {page} of {pages}</span>
                <PageLink href={qs({ page: String(page + 1) })} disabled={page >= pages}>Next →</PageLink>
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-md border border-ink-200 px-3 py-1.5 text-ink-300">{children}</span>;
  return (
    <Link href={href} className={cx("rounded-md border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:bg-ink-50")}>
      {children}
    </Link>
  );
}
