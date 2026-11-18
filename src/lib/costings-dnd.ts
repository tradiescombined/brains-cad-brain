/**
 * Pure drag-and-drop resolution for the costings grid (no DOM, no React).
 *
 * Two kinds of drag land on a grid row:
 *  - a grid row being reordered (`dragId` = that row), and
 *  - a catalogue item from the side panel (`dragId` = null).
 *
 * `dropPosition` turns the pointer's vertical position inside the target row into a zone,
 * `resolveRowMove` / `resolveCatalogueDrop` turn (target, zone) into a destination that respects
 * the category > item > sub-item depth rules, and `applyRowMove` / `insertPlan` produce the rows.
 */
import { childrenOf, depthOf, insertAt, normalize, subtreeIds, type TreeRow } from "./costings-tree";

export type DropPos = "before" | "after" | "inside";
export interface RowDest { parentId: string | null; index: number }
export interface CatalogueDest { categoryId: string; index: number }

const hasKids = (rows: readonly TreeRow[], id: string) => rows.some((r) => r.parentId === id);
const sibsWithout = (rows: readonly TreeRow[], parentId: string | null, without: string | null) =>
  childrenOf(rows, parentId).filter((r) => r.id !== without);

/**
 * Zone under the pointer. `frac` = (pointerY - rowTop) / rowHeight, clamped to 0..1.
 * Categories: top quarter = before, rest = inside (append). Items that can take the dragged row as a
 * sub-item: top 30% before, bottom 30% after, middle inside. Everything else: halves.
 */
export function dropPosition(rows: readonly TreeRow[], dragId: string | null, targetId: string, frac: number): DropPos {
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0.5));
  const target = rows.find((r) => r.id === targetId);
  const drag = dragId ? rows.find((r) => r.id === dragId) : null;
  if (!target) return f < 0.5 ? "before" : "after";
  if (drag?.kind === "category") return f < 0.5 ? "before" : "after";
  if (target.kind === "category") return f < 0.25 ? "before" : "inside";
  const canNest = !!drag && drag.id !== target.id && depthOf(rows, target.id) === 1 && !hasKids(rows, drag.id);
  if (canNest) return f < 0.3 ? "before" : f > 0.7 ? "after" : "inside";
  return f < 0.5 ? "before" : "after";
}

/**
 * Where a dragged grid row should go when dropped at (target, pos), or null when the drop is not
 * allowed (onto itself / its own subtree, or it would break the depth rules).
 * `index` is 0-based among the destination's children, not counting the dragged row.
 */
export function resolveRowMove(rows: readonly TreeRow[], dragId: string, targetId: string, pos: DropPos): RowDest | null {
  const drag = rows.find((r) => r.id === dragId);
  const target = rows.find((r) => r.id === targetId);
  if (!drag || !target) return null;
  if (subtreeIds(rows, dragId).includes(targetId)) return null;

  if (drag.kind === "category") {
    // categories only reorder among categories; any row stands in for its category
    let cat: TreeRow | undefined = target;
    for (let g = 0; cat && cat.parentId && g < 10; g++) {
      const pid: string = cat.parentId;
      cat = rows.find((r) => r.id === pid);
    }
    if (!cat || cat.id === dragId) return null;
    const cats = sibsWithout(rows, null, dragId);
    const ci = cats.findIndex((c) => c.id === cat!.id);
    const before = target.kind === "category" && pos === "before";
    return { parentId: null, index: before ? ci : ci + 1 };
  }

  const nested = hasKids(rows, dragId);
  if (target.kind === "category") {
    if (pos === "before") {
      const cats = childrenOf(rows, null).filter((c) => c.kind === "category");
      const prev = cats[cats.findIndex((c) => c.id === target.id) - 1];
      return prev ? { parentId: prev.id, index: sibsWithout(rows, prev.id, dragId).length } : { parentId: target.id, index: 0 };
    }
    if (pos === "after") return { parentId: target.id, index: 0 };
    return { parentId: target.id, index: sibsWithout(rows, target.id, dragId).length };
  }

  const tDepth = depthOf(rows, targetId);
  if (tDepth === 1) {
    if (pos === "inside") {
      if (nested) return null;
      return { parentId: target.id, index: sibsWithout(rows, target.id, dragId).length };
    }
    const sibs = sibsWithout(rows, target.parentId, dragId);
    const ti = sibs.findIndex((s) => s.id === targetId);
    return { parentId: target.parentId, index: pos === "before" ? ti : ti + 1 };
  }
  if (tDepth === 2) {
    if (nested) return null; // an item with sub-items cannot become a sub-item
    const sibs = sibsWithout(rows, target.parentId, dragId);
    const ti = sibs.findIndex((s) => s.id === targetId);
    return { parentId: target.parentId, index: pos === "after" || pos === "inside" ? ti + 1 : ti };
  }
  return null;
}

/** Move `dragId` (with its subtree) to `dest`; old siblings are re-numbered. */
export function applyRowMove<T extends TreeRow>(rows: readonly T[], dragId: string, dest: RowDest): T[] {
  const drag = rows.find((r) => r.id === dragId);
  if (!drag) return rows.slice();
  const moved = insertAt(rows, drag, dest.parentId, dest.index);
  return normalize(moved, [drag.parentId ?? null]);
}

/**
 * Where a catalogue item dropped at (target, pos) is inserted: always as a top-level item of a
 * category (recipes bring their own sub-items, so they can never land at sub-item depth).
 */
export function resolveCatalogueDrop(rows: readonly TreeRow[], targetId: string, pos: DropPos): CatalogueDest | null {
  const target = rows.find((r) => r.id === targetId);
  if (!target) return null;
  if (target.kind === "category") {
    if (pos === "before") {
      const cats = childrenOf(rows, null).filter((c) => c.kind === "category");
      const prev = cats[cats.findIndex((c) => c.id === target.id) - 1];
      return prev ? { categoryId: prev.id, index: childrenOf(rows, prev.id).length } : { categoryId: target.id, index: 0 };
    }
    if (pos === "after") return { categoryId: target.id, index: 0 };
    return { categoryId: target.id, index: childrenOf(rows, target.id).length };
  }
  const depth = depthOf(rows, targetId);
  // a sub-item stands in for its parent item: insert after that item
  const anchor = depth === 2 ? rows.find((r) => r.id === target.parentId) : target;
  if (!anchor || !anchor.parentId) return null;
  const sibs = childrenOf(rows, anchor.parentId);
  const ai = sibs.findIndex((s) => s.id === anchor.id);
  return { categoryId: anchor.parentId, index: depth === 1 && pos === "before" ? ai : ai + 1 };
}

/**
 * Make room for `count` new rows at `index` among `siblings` (already sorted).
 * Returns the `startOrder` to pass to `catalogueToRows` (new rows get startOrder+1..startOrder+count)
 * and the sibling sortOrder updates needed (only rows whose sortOrder changes).
 */
export function insertPlan(siblings: readonly { id: string; sortOrder: number }[], index: number | null | undefined, count: number) {
  const n = siblings.length;
  const at = index == null || !Number.isFinite(index) ? n : Math.max(0, Math.min(Math.trunc(index), n));
  const updates: { id: string; sortOrder: number }[] = [];
  siblings.forEach((s, i) => {
    const want = i < at ? i + 1 : i + 1 + count;
    if (s.sortOrder !== want) updates.push({ id: s.id, sortOrder: want });
  });
  return { startOrder: at, updates };
}
