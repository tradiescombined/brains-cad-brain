/**
 * Pure tree operations for estimate costing rows (no DB, no React).
 *
 * Tree shape (max depth 3):  category (root)  >  item  >  sub-item (recipe component)
 *
 * Every op returns a NEW array; rows that are not touched keep their identity so
 * `diffRows(prev, next)` produces a minimal patch for the server.
 * Sibling sortOrder values are re-normalised to 1..n after every structural change.
 */

export interface TreeRow {
  id: string;
  parentId: string | null;
  kind: "category" | "item";
  sortOrder: number;
}

export type Dir = -1 | 1;

/** Sorted children of `parentId` (null = categories). */
export function childrenOf<T extends TreeRow>(rows: readonly T[], parentId: string | null): T[] {
  return rows.filter((r) => (r.parentId ?? null) === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function byId<T extends TreeRow>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

/** 0 = category, 1 = item, 2 = sub-item. Returns -1 if not found. */
export function depthOf(rows: readonly TreeRow[], id: string): number {
  const m = byId(rows);
  let cur = m.get(id);
  if (!cur) return -1;
  let d = 0;
  while (cur && cur.parentId) {
    cur = m.get(cur.parentId);
    d++;
    if (d > 10) break;
  }
  return d;
}

/** The root category that contains `id` (or the row itself if it is a category). */
export function categoryOf(rows: readonly TreeRow[], id: string): string | null {
  const m = byId(rows);
  let cur = m.get(id);
  let guard = 0;
  while (cur && cur.parentId && guard++ < 10) cur = m.get(cur.parentId);
  return cur ? cur.id : null;
}

/** `id` and all its descendants. */
export function subtreeIds(rows: readonly TreeRow[], id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.includes(cur)) continue;
    out.push(cur);
    for (const r of rows) if (r.parentId === cur) stack.push(r.id);
  }
  return out;
}

/** Re-number siblings of each given parent to 1..n (keeping order); untouched rows keep identity. */
export function normalize<T extends TreeRow>(rows: readonly T[], parents: (string | null)[]): T[] {
  const updates = new Map<string, number>();
  for (const p of new Set(parents)) {
    childrenOf(rows, p).forEach((r, i) => {
      if (r.sortOrder !== i + 1) updates.set(r.id, i + 1);
    });
  }
  if (!updates.size) return rows.slice();
  return rows.map((r) => (updates.has(r.id) ? { ...r, sortOrder: updates.get(r.id)! } : r));
}

/** Place `row` among the children of `parentId` at `index` (0-based; past the end = append). */
export function insertAt<T extends TreeRow>(rows: readonly T[], row: T, parentId: string | null, index: number): T[] {
  const sibs = childrenOf(rows, parentId).filter((s) => s.id !== row.id);
  const i = Math.max(0, Math.min(index, sibs.length));
  const ordered = [...sibs.slice(0, i), row, ...sibs.slice(i)];
  const pos = new Map(ordered.map((r, k) => [r.id, k + 1]));
  const out: T[] = [];
  for (const r of rows) {
    if (r.id === row.id) continue;
    const p = pos.get(r.id);
    out.push(p !== undefined && r.sortOrder !== p ? { ...r, sortOrder: p } : r);
  }
  out.push({ ...row, parentId, sortOrder: pos.get(row.id)! });
  return out;
}

/** Insert `row` as the next sibling of `afterId`. */
export function insertAfter<T extends TreeRow>(rows: readonly T[], row: T, afterId: string): T[] {
  const after = rows.find((r) => r.id === afterId);
  if (!after) return insertAt(rows, row, row.parentId, Number.MAX_SAFE_INTEGER);
  const sibs = childrenOf(rows, after.parentId);
  return insertAt(rows, row, after.parentId, sibs.findIndex((s) => s.id === afterId) + 1);
}

/** Remove the given rows and all their descendants. */
export function removeSubtrees<T extends TreeRow>(rows: readonly T[], ids: string[]): T[] {
  const kill = new Set<string>();
  for (const id of ids) for (const s of subtreeIds(rows, id)) kill.add(s);
  const parents = rows.filter((r) => kill.has(r.id)).map((r) => r.parentId ?? null);
  return normalize(rows.filter((r) => !kill.has(r.id)), parents);
}

/** Whether `moveRow` would do anything. */
export function canMove(rows: readonly TreeRow[], id: string, dir: Dir): boolean {
  return moveRow(rows, id, dir) !== null;
}

/**
 * Move a row one place up/down among its siblings. A top-level item at the edge of
 * its category hops into the neighbouring category (end of previous / start of next).
 * Returns null when the move is not possible.
 */
export function moveRow<T extends TreeRow>(rows: readonly T[], id: string, dir: Dir): T[] | null {
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const sibs = childrenOf(rows, row.parentId ?? null);
  const i = sibs.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j >= 0 && j < sibs.length) {
    return insertAt(rows, row, row.parentId ?? null, j);
  }
  // Hop to neighbouring category (items directly under a category only)
  if (row.kind === "item" && row.parentId && depthOf(rows, id) === 1) {
    const cats = childrenOf(rows, null);
    const ci = cats.findIndex((c) => c.id === row.parentId);
    const target = cats[ci + dir];
    if (!target || target.kind !== "category") return null;
    const moved = insertAt(rows, row, target.id, dir === -1 ? Number.MAX_SAFE_INTEGER : 0);
    return normalize(moved, [row.parentId]);
  }
  return null;
}

/** Item (depth 1, no children) whose previous sibling is an item → can become that item's sub-item. */
export function canIndent(rows: readonly TreeRow[], id: string): boolean {
  const row = rows.find((r) => r.id === id);
  if (!row || row.kind !== "item" || depthOf(rows, id) !== 1) return false;
  if (rows.some((r) => r.parentId === id)) return false;
  const sibs = childrenOf(rows, row.parentId);
  const prev = sibs[sibs.findIndex((s) => s.id === id) - 1];
  return !!prev && prev.kind === "item";
}

/** Make an item the last sub-item of the item above it. */
export function indentRow<T extends TreeRow>(rows: readonly T[], id: string): T[] | null {
  if (!canIndent(rows, id)) return null;
  const row = rows.find((r) => r.id === id)!;
  const sibs = childrenOf(rows, row.parentId);
  const prev = sibs[sibs.findIndex((s) => s.id === id) - 1];
  const moved = insertAt(rows, row, prev.id, Number.MAX_SAFE_INTEGER);
  return normalize(moved, [row.parentId]);
}

export function canOutdent(rows: readonly TreeRow[], id: string): boolean {
  return depthOf(rows, id) === 2;
}

/** Turn a sub-item into an item placed directly after its former parent. */
export function outdentRow<T extends TreeRow>(rows: readonly T[], id: string): T[] | null {
  if (!canOutdent(rows, id)) return null;
  const row = rows.find((r) => r.id === id)!;
  const parent = rows.find((r) => r.id === row.parentId)!;
  const detached = normalize(rows.filter((r) => r.id !== id), [parent.id]);
  return insertAfter(detached, { ...row, parentId: parent.parentId }, parent.id);
}

/**
 * Copy `id` and its descendants with fresh ids (parent links remapped); the copy is
 * placed directly after the original. `genId` lets tests make ids deterministic.
 */
export function duplicateSubtree<T extends TreeRow>(
  rows: readonly T[],
  id: string,
  genId: () => string = () => crypto.randomUUID(),
): { rows: T[]; newId: string; idMap: Record<string, string> } | null {
  const root = rows.find((r) => r.id === id);
  if (!root) return null;
  const ids = subtreeIds(rows, id);
  const idMap: Record<string, string> = {};
  for (const x of ids) idMap[x] = genId();
  const copies = rows
    .filter((r) => ids.includes(r.id) && r.id !== id)
    .map((r) => ({ ...r, id: idMap[r.id], parentId: r.parentId ? idMap[r.parentId] ?? r.parentId : null }));
  const rootCopy = { ...root, id: idMap[id] };
  const withRoot = insertAfter(rows, rootCopy, id);
  return { rows: [...withRoot, ...copies], newId: idMap[id], idMap };
}

/**
 * Move rows (and their subtrees) to the end of category `categoryId` as top-level items.
 * Categories in `ids` and rows whose ancestor is also selected are ignored.
 */
export function moveToCategory<T extends TreeRow>(rows: readonly T[], ids: string[], categoryId: string): T[] {
  const cat = rows.find((r) => r.id === categoryId && r.kind === "category");
  if (!cat) return rows.slice();
  const sel = new Set(ids);
  const m = byId(rows);
  const hasSelectedAncestor = (r: TreeRow) => {
    let p = r.parentId ? m.get(r.parentId) : undefined;
    while (p) {
      if (sel.has(p.id)) return true;
      p = p.parentId ? m.get(p.parentId) : undefined;
    }
    return false;
  };
  // keep display order of moved rows
  const order = displayOrder(rows);
  const moving = order.map((x) => m.get(x)!).filter((r) => sel.has(r.id) && r.kind === "item" && !hasSelectedAncestor(r));
  let out = rows.slice();
  const oldParents: (string | null)[] = [];
  for (const r of moving) {
    if (r.parentId === categoryId) continue; // already there — leave in place
    oldParents.push(r.parentId);
    // a sub-item that moves keeps no children (sub-items never have any)
    out = insertAt(out, r, categoryId, Number.MAX_SAFE_INTEGER);
  }
  return normalize(out, oldParents);
}

/** Depth-first ids in display order. */
export function displayOrder(rows: readonly TreeRow[]): string[] {
  const kids = new Map<string | null, TreeRow[]>();
  for (const r of rows) {
    const k = r.parentId ?? null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k)!.push(r);
  }
  for (const l of kids.values()) l.sort((a, b) => a.sortOrder - b.sortOrder);
  const out: string[] = [];
  const walk = (p: string | null, depth: number) => {
    if (depth > 5) return;
    for (const r of kids.get(p) ?? []) {
      out.push(r.id);
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Display order with descendants of collapsed rows hidden. */
export function visibleOrder(rows: readonly TreeRow[], collapsed: ReadonlySet<string>): string[] {
  const m = byId(rows);
  return displayOrder(rows).filter((id) => {
    let p = m.get(id)?.parentId;
    while (p) {
      if (collapsed.has(p)) return false;
      p = m.get(p)?.parentId ?? null;
    }
    return true;
  });
}

/** Returns an error message if the tree breaks the category > item > sub-item rules. */
export function validateTree(rows: readonly TreeRow[]): string | null {
  const m = new Map<string, TreeRow>();
  for (const r of rows) {
    if (m.has(r.id)) return `Duplicate row id ${r.id}`;
    m.set(r.id, r);
  }
  for (const r of rows) {
    if (r.kind === "category") {
      if (r.parentId) return "Categories must be at the top level";
      continue;
    }
    if (!r.parentId) return "Items must belong to a category";
    const p = m.get(r.parentId);
    if (!p) return "Row refers to a missing parent";
    if (p.kind === "item") {
      const gp = p.parentId ? m.get(p.parentId) : undefined;
      if (!gp || gp.kind !== "category") return "Sub-items cannot have their own sub-items";
    }
  }
  return null;
}

/** Field-level diff between two row arrays → patch for the server. */
export interface RowPatch<T> {
  upserts: (Partial<T> & { id: string })[];
  deletes: string[];
}

export function diffRows<T extends TreeRow>(prev: readonly T[], next: readonly T[], fields: readonly (keyof T)[]): RowPatch<T> {
  const pm = byId(prev);
  const nm = byId(next);
  const upserts: (Partial<T> & { id: string })[] = [];
  for (const n of next) {
    const p = pm.get(n.id);
    if (!p) {
      const full: Partial<T> & { id: string } = { id: n.id } as Partial<T> & { id: string };
      for (const f of fields) (full as Record<string, unknown>)[f as string] = n[f];
      upserts.push(full);
      continue;
    }
    if (p === n) continue;
    const ch: Record<string, unknown> = {};
    let any = false;
    for (const f of fields) {
      if (p[f] !== n[f]) {
        ch[f as string] = n[f];
        any = true;
      }
    }
    if (any) upserts.push({ ...(ch as Partial<T>), id: n.id });
  }
  const deletes = prev.filter((p) => !nm.has(p.id)).map((p) => p.id);
  return { upserts, deletes };
}

export function isEmptyPatch(p: RowPatch<unknown>): boolean {
  return p.upserts.length === 0 && p.deletes.length === 0;
}

// ---------------------------------------------------------------------------
// Catalogue → costing rows
// ---------------------------------------------------------------------------

export interface CatalogueItemLike {
  id: string;
  itemCode: string | null;
  description: string;
  costType: string;
  uom: string;
  unitCost: number;
  isRecipe: boolean;
}
export interface RecipeLineLike {
  recipeItemId: string;
  componentItemId: string | null;
  description: string;
  costType: string;
  uom: string | null;
  quantityExpr: string;
  unitCost: number;
  sortOrder: number;
}
export interface NewCostingRow extends TreeRow {
  description: string;
  itemCode: string | null;
  costType: string;
  uom: string | null;
  quantityExpr: string;
  unitCost: number;
  catalogueItemId: string | null;
}

const COST_TYPES = ["Material", "Labour", "Equipment", "Subcontractor", "Other"];
export const normCostType = (c: string | null | undefined) => (COST_TYPES.includes(String(c)) ? String(c) : "Other");

/** Format a quantity for storage in quantityExpr ("12.5", never "1e-7"). */
export function qtyText(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Build rows for catalogue picks appended to `categoryId` (after `startOrder`).
 * Recipe items become a parent item with one sub-item per recipe line
 * (line quantityExpr is per 1 unit of the parent, which calc scales).
 */
export function catalogueToRows(
  picks: { item: CatalogueItemLike; quantity: number; lines?: RecipeLineLike[] }[],
  categoryId: string,
  startOrder: number,
  genId: () => string = () => crypto.randomUUID(),
): NewCostingRow[] {
  const out: NewCostingRow[] = [];
  picks.forEach((p, i) => {
    const pid = genId();
    const lines = p.item.isRecipe ? [...(p.lines ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) : [];
    out.push({
      id: pid,
      parentId: categoryId,
      kind: "item",
      sortOrder: startOrder + i + 1,
      description: p.item.description,
      itemCode: p.item.itemCode,
      costType: normCostType(p.item.costType),
      uom: p.item.uom,
      quantityExpr: qtyText(p.quantity),
      unitCost: lines.length ? 0 : p.item.unitCost,
      catalogueItemId: p.item.id,
    });
    lines.forEach((l, k) => {
      out.push({
        id: genId(),
        parentId: pid,
        kind: "item",
        sortOrder: k + 1,
        description: l.description,
        itemCode: null,
        costType: normCostType(l.costType),
        uom: l.uom,
        quantityExpr: l.quantityExpr || "1",
        unitCost: l.unitCost,
        catalogueItemId: l.componentItemId,
      });
    });
  });
  return out;
}

/** Insert `token` into `text` replacing the selection [start,end). Returns new text and caret. */
export function insertToken(text: string, token: string, start?: number | null, end?: number | null): { text: string; caret: number } {
  const s = start == null ? text.length : Math.max(0, Math.min(start, text.length));
  const e = end == null ? s : Math.max(s, Math.min(end, text.length));
  const before = text.slice(0, s);
  const after = text.slice(e);
  // implicit multiply when appending a token straight after a number/ref, e.g. "2" + [M1] → "2*[M1]"
  const needsOp = /[0-9\])]\s*$/.test(before) && !/^\s*[*+\-/^)]/.test(after) && !/^[*]/.test(token);
  const ins = (needsOp ? "*" : "") + token;
  return { text: before + ins + after, caret: before.length + ins.length };
}
