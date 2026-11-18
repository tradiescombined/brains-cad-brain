import { describe, it, expect } from "vitest";
import { type TreeRow, childrenOf, validateTree, catalogueToRows } from "./costings-tree";
import { applyRowMove, dropPosition, insertPlan, resolveCatalogueDrop, resolveRowMove } from "./costings-dnd";

type R = TreeRow & { description: string };
const cat = (id: string, sortOrder: number): R => ({ id, parentId: null, kind: "category", sortOrder, description: id });
const it_ = (id: string, parentId: string, sortOrder: number): R => ({ id, parentId, kind: "item", sortOrder, description: id });

// A: a1, a2(a2x, a2y), a3   B: b1   C: (empty)
const base = (): R[] => [
  cat("A", 1), it_("a1", "A", 1), it_("a2", "A", 2), it_("a2x", "a2", 1), it_("a2y", "a2", 2), it_("a3", "A", 3),
  cat("B", 2), it_("b1", "B", 1),
  cat("C", 3),
];
const ids = (rows: TreeRow[], p: string | null) => childrenOf(rows, p).map((r) => r.id);
const move = (drag: string, target: string, pos: "before" | "after" | "inside") => {
  const rows = base();
  const dest = resolveRowMove(rows, drag, target, pos);
  if (!dest) return null;
  const out = applyRowMove(rows, drag, dest);
  expect(validateTree(out)).toBeNull();
  return out;
};

describe("dropPosition", () => {
  it("categories: top quarter before, rest inside", () => {
    expect(dropPosition(base(), "a1", "B", 0.1)).toBe("before");
    expect(dropPosition(base(), "a1", "B", 0.6)).toBe("inside");
    expect(dropPosition(base(), null, "B", 0.9)).toBe("inside");
  });
  it("dragging a category uses halves", () => {
    expect(dropPosition(base(), "A", "B", 0.4)).toBe("before");
    expect(dropPosition(base(), "A", "b1", 0.6)).toBe("after");
  });
  it("items offer a middle 'inside' zone only when the dragged row can nest", () => {
    expect(dropPosition(base(), "a1", "a3", 0.5)).toBe("inside");
    expect(dropPosition(base(), "a1", "a3", 0.1)).toBe("before");
    expect(dropPosition(base(), "a1", "a3", 0.9)).toBe("after");
    expect(dropPosition(base(), "a2", "a3", 0.5)).toBe("after"); // a2 has sub-items
    expect(dropPosition(base(), null, "a3", 0.4)).toBe("before"); // catalogue drag: halves
    expect(dropPosition(base(), "a1", "a2x", 0.5)).toBe("after"); // sub-item target: halves
  });
  it("clamps silly fractions", () => {
    expect(dropPosition(base(), "a1", "a3", -3)).toBe("before");
    expect(dropPosition(base(), "a1", "a3", NaN)).toBe("inside");
  });
});

describe("resolveRowMove / applyRowMove", () => {
  it("reorders within a category", () => {
    const out = move("a3", "a1", "before")!;
    expect(ids(out, "A")).toEqual(["a3", "a1", "a2"]);
    expect(move("a1", "a3", "after")!.filter((r) => r.parentId === "A").map((r) => [r.id, r.sortOrder]).sort()).toEqual([["a1", 3], ["a2", 1], ["a3", 2]]);
  });
  it("moves between categories, keeping the subtree", () => {
    const out = move("a2", "b1", "after")!;
    expect(ids(out, "A")).toEqual(["a1", "a3"]);
    expect(ids(out, "B")).toEqual(["b1", "a2"]);
    expect(ids(out, "a2")).toEqual(["a2x", "a2y"]);
  });
  it("dropping onto a category appends; its top edge goes to the end of the previous category", () => {
    expect(ids(move("a1", "C", "inside")!, "C")).toEqual(["a1"]);
    expect(ids(move("b1", "B", "after")!, "B")).toEqual(["b1"]);
    expect(ids(move("b1", "B", "before")!, "A")).toEqual(["a1", "a2", "a3", "b1"]);
    expect(ids(move("a1", "A", "before")!, "A")).toEqual(["a1", "a2", "a3"]); // first category: start of it
  });
  it("nests an item into another item and un-nests a sub-item", () => {
    const out = move("a1", "a3", "inside")!;
    expect(ids(out, "a3")).toEqual(["a1"]);
    const out2 = move("a2x", "b1", "before")!;
    expect(ids(out2, "B")).toEqual(["a2x", "b1"]);
    expect(ids(out2, "a2")).toEqual(["a2y"]);
    expect(ids(move("b1", "a2y", "before")!, "a2")).toEqual(["a2x", "b1", "a2y"]);
  });
  it("rejects drops that break depth rules or target the own subtree", () => {
    const rows = base();
    expect(resolveRowMove(rows, "a2", "a3", "inside")).toBeNull(); // has sub-items
    expect(resolveRowMove(rows, "a2", "b1", "inside")).toBeNull();
    expect(resolveRowMove(rows, "a2", "a2x", "after")).toBeNull(); // own subtree
    expect(resolveRowMove(rows, "a2", "a2", "before")).toBeNull();
    expect(resolveRowMove(rows, "A", "a1", "after")).toBeNull(); // own subtree
    expect(resolveRowMove(rows, "zz", "a1", "after")).toBeNull();
  });
  it("reorders categories; an item target stands in for its category", () => {
    expect(ids(move("C", "A", "before")!, null)).toEqual(["C", "A", "B"]);
    expect(ids(move("A", "b1", "before")!, null)).toEqual(["B", "A", "C"]);
    expect(ids(move("A", "C", "after")!, null)).toEqual(["B", "C", "A"]);
  });
  it("a no-op drop leaves sort orders as they were", () => {
    const rows = base();
    const out = applyRowMove(rows, "a2", resolveRowMove(rows, "a2", "a1", "after")!);
    expect(out.map((r) => [r.id, r.parentId, r.sortOrder]).sort()).toEqual(rows.map((r) => [r.id, r.parentId, r.sortOrder]).sort());
  });
});

describe("resolveCatalogueDrop", () => {
  it("resolves categories, items and sub-items to a category + index", () => {
    const rows = base();
    expect(resolveCatalogueDrop(rows, "B", "inside")).toEqual({ categoryId: "B", index: 1 });
    expect(resolveCatalogueDrop(rows, "C", "inside")).toEqual({ categoryId: "C", index: 0 });
    expect(resolveCatalogueDrop(rows, "B", "after")).toEqual({ categoryId: "B", index: 0 });
    expect(resolveCatalogueDrop(rows, "B", "before")).toEqual({ categoryId: "A", index: 3 });
    expect(resolveCatalogueDrop(rows, "A", "before")).toEqual({ categoryId: "A", index: 0 });
    expect(resolveCatalogueDrop(rows, "a2", "before")).toEqual({ categoryId: "A", index: 1 });
    expect(resolveCatalogueDrop(rows, "a2", "after")).toEqual({ categoryId: "A", index: 2 });
    expect(resolveCatalogueDrop(rows, "a2x", "before")).toEqual({ categoryId: "A", index: 2 }); // after parent a2
    expect(resolveCatalogueDrop(rows, "nope", "before")).toBeNull();
  });
});

describe("insertPlan", () => {
  const sibs = [{ id: "x", sortOrder: 1 }, { id: "y", sortOrder: 2 }, { id: "z", sortOrder: 3 }];
  it("appends without touching normalised siblings", () => {
    expect(insertPlan(sibs, null, 2)).toEqual({ startOrder: 3, updates: [] });
    expect(insertPlan(sibs, 99, 1)).toEqual({ startOrder: 3, updates: [] });
  });
  it("opens a gap at the index", () => {
    expect(insertPlan(sibs, 1, 2)).toEqual({ startOrder: 1, updates: [{ id: "y", sortOrder: 4 }, { id: "z", sortOrder: 5 }] });
    expect(insertPlan(sibs, 0, 1).startOrder).toBe(0);
  });
  it("normalises gappy orders and composes with catalogueToRows", () => {
    const gappy = [{ id: "x", sortOrder: 5 }, { id: "y", sortOrder: 9 }];
    const plan = insertPlan(gappy, 1, 1);
    expect(plan).toEqual({ startOrder: 1, updates: [{ id: "x", sortOrder: 1 }, { id: "y", sortOrder: 3 }] });
    const n = catalogueToRows(
      [{ item: { id: "c", itemCode: null, description: "New", costType: "Material", uom: "ea", unitCost: 1, isRecipe: false }, quantity: 1 }],
      "CAT", plan.startOrder, () => "new",
    );
    expect(n[0].sortOrder).toBe(2);
  });
});
