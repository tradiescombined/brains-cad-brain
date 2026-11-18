/**
 * Specifications organised by costing category (pure, no DB / React).
 *
 * - `costingOutline` derives category order and each item's category from the costings tree.
 * - `syncWithCostings` ensures one linked section per category that has spec-flagged items.
 * - `matchCostingsOrder` reorders linked sections to the costing order (custom sections stay put).
 * - `buildSpecDocument` produces the numbered document used by the quote, print page and export.
 */
import type { SpecNode } from "./spec-tree";

export interface CostingRow {
  id: string;
  parentId: string | null;
  kind: "category" | "item";
  sortOrder: number;
  description: string;
}

export interface CostingCategoryRef {
  id: string;
  name: string;
}

export interface CostingOutline {
  /** Root categories in costing order. */
  categories: CostingCategoryRef[];
  /** Every row id in depth-first costing order. */
  order: string[];
  /** item id -> root category id (null for loose items outside any category). */
  categoryOf: Map<string, string | null>;
}

export function costingOutline(rows: CostingRow[]): CostingOutline {
  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map<string | null, CostingRow[]>();
  for (const r of rows) {
    const k = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k)!.push(r);
  }
  for (const list of kids.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  const order: string[] = [];
  const categoryOf = new Map<string, string | null>();
  const categories: CostingCategoryRef[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, cat: string | null) => {
    for (const r of kids.get(parent) ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      order.push(r.id);
      const c = parent === null ? (r.kind === "category" ? r.id : null) : cat;
      if (parent === null && r.kind === "category") categories.push({ id: r.id, name: r.description.trim() || "Untitled category" });
      categoryOf.set(r.id, c);
      walk(r.id, c);
    }
  };
  walk(null, null);
  return { categories, order, categoryOf };
}

/**
 * Adds a linked section (heading = category name) for every category in `categories` that has a
 * spec-flagged item and no linked section yet. Existing sections and their text are untouched.
 * New sections are appended in costing order. Returns the same array when nothing changes.
 */
export function syncWithCostings(
  tree: SpecNode[],
  categories: CostingCategoryRef[],
  categoriesWithSpecItems: Set<string>,
  newId: () => string,
): { tree: SpecNode[]; added: number } {
  const linked = new Set(tree.map((n) => n.categoryItemId).filter((x): x is string => !!x));
  const add: SpecNode[] = categories
    .filter((c) => categoriesWithSpecItems.has(c.id) && !linked.has(c.id))
    .map((c) => ({ id: newId(), heading: c.name, body: "", children: [], categoryItemId: c.id }));
  return add.length ? { tree: [...tree, ...add], added: add.length } : { tree, added: 0 };
}

/**
 * Reorders sections linked to a known costing category into costing order. They are placed into
 * the positions linked sections already occupy, so custom (and stale-linked) sections keep their
 * exact positions and relative order.
 */
export function matchCostingsOrder(tree: SpecNode[], categoryOrder: string[]): SpecNode[] {
  const rank = new Map(categoryOrder.map((id, i) => [id, i]));
  const isLinked = (n: SpecNode) => !!n.categoryItemId && rank.has(n.categoryItemId);
  const linked = tree.filter(isLinked).sort((a, b) => rank.get(a.categoryItemId!)! - rank.get(b.categoryItemId!)!);
  let k = 0;
  const next = tree.map((n) => (isLinked(n) ? linked[k++] : n));
  return next.every((n, i) => n === tree[i]) ? tree : next;
}

/** Drops links to categories that no longer exist and duplicate links (first section keeps it). */
export function normaliseLinks(tree: SpecNode[], validCategoryIds: Set<string>): SpecNode[] {
  const used = new Set<string>();
  return tree.map((n) => {
    const c = n.categoryItemId;
    if (!c) return n.categoryItemId === undefined ? n : { ...n, categoryItemId: null };
    if (!validCategoryIds.has(c) || used.has(c)) return { ...n, categoryItemId: null };
    used.add(c);
    return n;
  });
}

/* ───────────────────────── Document ───────────────────────── */

export interface SpecItemInput {
  id: string;
  /** Root costing category id, null for loose items. */
  categoryId: string | null;
  description: string;
  quantity: number;
  uom: string | null;
  notes: string | null;
  detail: string | null;
  imageDataUrl: string | null;
}

export interface SpecDocItem extends SpecItemInput {
  number: string;
}

export interface SpecDocSection {
  id: string;
  number: string;
  heading: string;
  body: string;
  categoryItemId: string | null;
  clauses: { id: string; number: string; heading: string; body: string }[];
  items: SpecDocItem[];
}

export interface SpecDocument {
  sections: SpecDocSection[];
  /** Spec-flagged items whose category has no linked section (old data / not synced yet). */
  inclusions: { number: string; items: SpecDocItem[] } | null;
}

/**
 * Builds the numbered specification. `items` are the spec-flagged items in costing order.
 * Section n: clauses n.1…n.k, then linked items n.(k+1)…; leftover items form a final
 * "Inclusions" section so older estimates without linked sections still print their items.
 */
export function buildSpecDocument(specs: SpecNode[], items: SpecItemInput[]): SpecDocument {
  const linkedCats = new Set<string>();
  const sections: SpecDocSection[] = specs.map((s, i) => {
    const n = String(i + 1);
    const clauses = s.children.map((c, j) => ({ id: c.id, number: `${n}.${j + 1}`, heading: c.heading, body: c.body }));
    const cat = s.categoryItemId && !linkedCats.has(s.categoryItemId) ? s.categoryItemId : null;
    if (cat) linkedCats.add(cat);
    const mine = cat ? items.filter((it) => it.categoryId === cat) : [];
    return {
      id: s.id,
      number: n,
      heading: s.heading,
      body: s.body,
      categoryItemId: cat,
      clauses,
      items: mine.map((it, k) => ({ ...it, number: `${n}.${clauses.length + k + 1}` })),
    };
  });
  const rest = items.filter((it) => !it.categoryId || !linkedCats.has(it.categoryId));
  const num = String(sections.length + 1);
  return {
    sections,
    inclusions: rest.length ? { number: num, items: rest.map((it, k) => ({ ...it, number: `${num}.${k + 1}` })) } : null,
  };
}

/* ───────────────────────── Search ───────────────────────── */

export interface SpecSearchHit {
  sections: Set<string>;
  clauses: Set<string>;
  items: Set<string>;
}

/**
 * Case-insensitive search over headings, bodies, clause text and linked item description/detail.
 * A section matching by its own heading/body shows all of its clauses and items; otherwise only the
 * matching ones. Returns null for an empty query (no filtering).
 */
export function searchSpec(
  tree: SpecNode[],
  itemsByCategory: Map<string, { id: string; description: string; detail: string | null }[]>,
  query: string,
): SpecSearchHit | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const has = (...t: (string | null | undefined)[]) => t.some((x) => !!x && x.toLowerCase().includes(q));
  const hit: SpecSearchHit = { sections: new Set(), clauses: new Set(), items: new Set() };
  for (const s of tree) {
    const items = s.categoryItemId ? itemsByCategory.get(s.categoryItemId) ?? [] : [];
    const self = has(s.heading, s.body);
    const clauses = s.children.filter((c) => self || has(c.heading, c.body));
    const its = items.filter((it) => self || has(it.description, it.detail));
    if (self || clauses.length || its.length) {
      hit.sections.add(s.id);
      clauses.forEach((c) => hit.clauses.add(c.id));
      its.forEach((it) => hit.items.add(it.id));
    }
  }
  return hit;
}

/* ───────────────────────── Markdown export ───────────────────────── */

export function specToMarkdown(doc: SpecDocument, opts: { title: string; intro?: string | null; numbers?: boolean }): string {
  const numbers = opts.numbers ?? true;
  const pre = (n: string) => (numbers ? `${n} ` : "");
  const out: string[] = [`# ${opts.title}`, ""];
  if (opts.intro?.trim()) out.push(opts.intro.trim(), "");
  const item = (it: SpecDocItem) => {
    out.push(`### ${pre(it.number)}${it.description}`, "");
    const text = it.detail?.trim() || it.notes?.trim();
    if (text) out.push(text, "");
  };
  for (const s of doc.sections) {
    out.push(`## ${pre(s.number)}${s.heading}`, "");
    if (s.body.trim()) out.push(s.body.trim(), "");
    for (const c of s.clauses) {
      out.push(`### ${pre(c.number)}${c.heading}`, "");
      if (c.body.trim()) out.push(c.body.trim(), "");
    }
    s.items.forEach(item);
  }
  if (doc.inclusions) {
    out.push(`## ${pre(doc.inclusions.number)}Inclusions`, "");
    doc.inclusions.items.forEach(item);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/* ───────────────────────── Images ───────────────────────── */

/** Max stored image size (data URL length, ~1.5 MB of image bytes). */
export const SPEC_IMAGE_MAX_CHARS = 2_000_000;

export function isValidSpecImage(v: string): boolean {
  return v.length <= SPEC_IMAGE_MAX_CHARS && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(v);
}
