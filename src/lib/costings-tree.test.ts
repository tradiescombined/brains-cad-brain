import { describe, it, expect } from "vitest";
import {
  type TreeRow, childrenOf, depthOf, categoryOf, subtreeIds, insertAt, insertAfter, removeSubtrees, moveRow, canMove,
  canIndent, indentRow, canOutdent, outdentRow, duplicateSubtree, moveToCategory, displayOrder, visibleOrder,
  validateTree, diffRows, isEmptyPatch, catalogueToRows, insertToken, qtyText, normCostType,
} from "./costings-tree";

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
const seq = () => { let n = 0; return () => `n${++n}`; };

describe("basics", () => {
  it("orders, depths and subtrees", () => {
    const rows = base();
    expect(displayOrder(rows)).toEqual(["A", "a1", "a2", "a2x", "a2y", "a3", "B", "b1", "C"]);
    expect(depthOf(rows, "A")).toBe(0);
    expect(depthOf(rows, "a2")).toBe(1);
    expect(depthOf(rows, "a2y")).toBe(2);
    expect(depthOf(rows, "zz")).toBe(-1);
    expect(categoryOf(rows, "a2x")).toBe("A");
    expect(subtreeIds(rows, "a2").sort()).toEqual(["a2", "a2x", "a2y"]);
    expect(validateTree(rows)).toBeNull();
  });
  it("visibleOrder hides collapsed descendants", () => {
    expect(visibleOrder(base(), new Set(["a2", "B"]))).toEqual(["A", "a1", "a2", "a3", "B", "C"]);
    expect(visibleOrder(base(), new Set(["A"]))).toEqual(["A", "B", "b1", "C"]);
  });
});

describe("insert / remove", () => {
  it("inserts at an index and renumbers siblings", () => {
    const rows = insertAt(base(), it_("new", "x", 0), "A", 1);
    expect(ids(rows, "A")).toEqual(["a1", "new", "a2", "a3"]);
    expect(childrenOf(rows, "A").map((r) => r.sortOrder)).toEqual([1, 2, 3, 4]);
    expect(rows.find((r) => r.id === "new")!.parentId).toBe("A");
  });
  it("inserts after a sibling (including sub-items)", () => {
    expect(ids(insertAfter(base(), it_("n", "a2", 0), "a2x"), "a2")).toEqual(["a2x", "n", "a2y"]);
    expect(ids(insertAfter(base(), it_("n", "A", 0), "a3"), "A")).toEqual(["a1", "a2", "a3", "n"]);
  });
  it("keeps identity of untouched rows", () => {
    const b = base();
    const rows = insertAt(b, it_("n", "B", 0), "B", 99);
    expect(rows.find((r) => r.id === "a1")).toBe(b.find((r) => r.id === "a1"));
  });
  it("removes whole subtrees and renumbers", () => {
    const rows = removeSubtrees(base(), ["a2"]);
    expect(rows.map((r) => r.id)).not.toContain("a2x");
    expect(childrenOf(rows, "A").map((r) => [r.id, r.sortOrder])).toEqual([["a1", 1], ["a3", 2]]);
    expect(removeSubtrees(base(), ["A"]).map((r) => r.id)).toEqual(["B", "b1", "C"]);
  });
});

describe("move", () => {
  it("swaps siblings", () => {
    expect(ids(moveRow(base(), "a3", -1)!, "A")).toEqual(["a1", "a3", "a2"]);
    expect(ids(moveRow(base(), "a1", 1)!, "A")).toEqual(["a2", "a1", "a3"]);
    expect(ids(moveRow(base(), "a2y", -1)!, "a2")).toEqual(["a2y", "a2x"]);
    expect(ids(moveRow(base(), "B", -1)!, null)).toEqual(["B", "A", "C"]);
  });
  it("hops items between categories at the edges", () => {
    const down = moveRow(base(), "a3", 1)!;
    expect(ids(down, "A")).toEqual(["a1", "a2"]);
    expect(ids(down, "B")).toEqual(["a3", "b1"]);
    const up = moveRow(base(), "b1", -1)!;
    expect(ids(up, "A")).toEqual(["a1", "a2", "a3", "b1"]);
    expect(ids(up, "B")).toEqual([]);
    // moving the subtree keeps its children attached
    const p = moveRow(moveRow(base(), "a3", -1)!, "a2", 1)!;
    expect(ids(p, "B")[0]).toBe("a2");
    expect(ids(p, "a2")).toEqual(["a2x", "a2y"]);
  });
  it("refuses impossible moves", () => {
    expect(canMove(base(), "A", -1)).toBe(false);
    expect(canMove(base(), "C", 1)).toBe(false);
    expect(canMove(base(), "a1", -1)).toBe(false); // first category, no previous
    expect(canMove(base(), "a2x", -1)).toBe(false); // sub-items stay in their parent
    expect(moveRow(base(), "missing", 1)).toBeNull();
  });
});

describe("indent / outdent", () => {
  it("indents an item under the item above", () => {
    expect(canIndent(base(), "a1")).toBe(false); // no item above
    expect(canIndent(base(), "a2")).toBe(false); // has children
    expect(canIndent(base(), "a3")).toBe(true);
    const rows = indentRow(base(), "a3")!;
    expect(ids(rows, "a2")).toEqual(["a2x", "a2y", "a3"]);
    expect(ids(rows, "A")).toEqual(["a1", "a2"]);
    expect(validateTree(rows)).toBeNull();
    expect(canIndent(rows, "a3")).toBe(false); // already a sub-item (max depth)
    expect(canIndent(base(), "A")).toBe(false);
  });
  it("outdents a sub-item to directly after its parent", () => {
    expect(canOutdent(base(), "a2")).toBe(false);
    expect(canOutdent(base(), "a2x")).toBe(true);
    const rows = outdentRow(base(), "a2x")!;
    expect(ids(rows, "A")).toEqual(["a1", "a2", "a2x", "a3"]);
    expect(childrenOf(rows, "a2").map((r) => [r.id, r.sortOrder])).toEqual([["a2y", 1]]);
    expect(outdentRow(base(), "a1")).toBeNull();
  });
});

describe("duplicate", () => {
  it("copies a subtree with remapped ids right after the original", () => {
    const res = duplicateSubtree(base(), "a2", seq())!;
    expect(res.newId).toBe("n1");
    expect(ids(res.rows, "A")).toEqual(["a1", "a2", "n1", "a3"]);
    const kids = childrenOf(res.rows, "n1");
    expect(kids.map((k) => k.description)).toEqual(["a2x", "a2y"]);
    expect(kids.every((k) => k.id !== "a2x" && k.id !== "a2y")).toBe(true);
    expect(ids(res.rows, "a2")).toEqual(["a2x", "a2y"]); // original untouched
    expect(validateTree(res.rows)).toBeNull();
    expect(Object.keys(res.idMap).sort()).toEqual(["a2", "a2x", "a2y"]);
  });
  it("duplicates a whole category", () => {
    const res = duplicateSubtree(base(), "A", seq())!;
    expect(ids(res.rows, null)).toEqual(["A", "n1", "B", "C"]);
    expect(subtreeIds(res.rows, "n1")).toHaveLength(6);
    expect(validateTree(res.rows)).toBeNull();
  });
});

describe("moveToCategory", () => {
  it("appends selected items (with subtrees) to the target, ignoring categories and nested selections", () => {
    const rows = moveToCategory(base(), ["a2", "a2x", "a1", "B"], "C");
    expect(ids(rows, "C")).toEqual(["a1", "a2"]);
    expect(ids(rows, "a2")).toEqual(["a2x", "a2y"]);
    expect(childrenOf(rows, "A").map((r) => [r.id, r.sortOrder])).toEqual([["a3", 1]]);
    expect(validateTree(rows)).toBeNull();
  });
  it("promotes a selected sub-item to an item", () => {
    const rows = moveToCategory(base(), ["a2y"], "B");
    expect(ids(rows, "B")).toEqual(["b1", "a2y"]);
    expect(ids(rows, "a2")).toEqual(["a2x"]);
  });
  it("ignores an unknown or non-category target", () => {
    expect(ids(moveToCategory(base(), ["a1"], "a2"), "A")).toEqual(["a1", "a2", "a3"]);
  });
});

describe("validateTree", () => {
  it("catches structural errors", () => {
    expect(validateTree([it_("x", "nope", 1)])).toMatch(/missing parent/);
    expect(validateTree([{ ...it_("x", "A", 1), parentId: null }])).toMatch(/category/);
    expect(validateTree([cat("A", 1), { ...cat("B", 1), parentId: "A" }])).toMatch(/top level/);
    expect(validateTree([...base(), it_("deep", "a2x", 1)])).toMatch(/Sub-items/);
    expect(validateTree([cat("A", 1), cat("A", 2)])).toMatch(/Duplicate/);
  });
});

describe("diffRows", () => {
  it("produces a minimal patch", () => {
    const prev = base();
    const next = moveRow(prev, "a3", -1)!.map((r) => (r.id === "b1" ? { ...r, description: "changed" } : r));
    const withNew = insertAt(next, it_("z", "C", 0), "C", 0);
    const p = diffRows(prev, removeSubtrees(withNew, ["a1"]), ["parentId", "sortOrder", "description", "kind"]);
    const by = Object.fromEntries(p.upserts.map((u) => [u.id, u]));
    expect(by.b1).toEqual({ id: "b1", description: "changed" });
    expect(by.z).toEqual({ id: "z", parentId: "C", sortOrder: 1, description: "z", kind: "item" });
    expect(by.a3).toEqual({ id: "a3", sortOrder: 1 });
    expect(by.a2).toBeUndefined(); // ends back at position 2
    expect(p.deletes).toEqual(["a1"]);
    expect(isEmptyPatch(diffRows(prev, prev, ["description"]))).toBe(true);
  });
});

describe("catalogueToRows", () => {
  it("builds plain items and recipe parents with sub-items", () => {
    const rows = catalogueToRows(
      [
        { item: { id: "c1", itemCode: "FR-1", description: "Pine", costType: "Material", uom: "lm", unitCost: 6.4, isRecipe: false }, quantity: 12.5 },
        {
          item: { id: "c2", itemCode: "WL-1", description: "Wall assembly", costType: "Material", uom: "m2", unitCost: 99, isRecipe: true },
          quantity: 10,
          lines: [
            { recipeItemId: "c2", componentItemId: "c9", description: "Plasterboard", costType: "Material", uom: "sheet", quantityExpr: "0.35", unitCost: 18.5, sortOrder: 2 },
            { recipeItemId: "c2", componentItemId: null, description: "Fixer", costType: "Labour", uom: "hr", quantityExpr: "0.5", unitCost: 75, sortOrder: 1 },
          ],
        },
      ],
      "CAT",
      3,
      seq(),
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ id: "n1", parentId: "CAT", sortOrder: 4, quantityExpr: "12.5", unitCost: 6.4, catalogueItemId: "c1", itemCode: "FR-1" });
    expect(rows[1]).toMatchObject({ id: "n2", parentId: "CAT", sortOrder: 5, unitCost: 0, quantityExpr: "10", catalogueItemId: "c2" });
    expect(rows[2]).toMatchObject({ parentId: "n2", description: "Fixer", sortOrder: 1, costType: "Labour", quantityExpr: "0.5" });
    expect(rows[3]).toMatchObject({ parentId: "n2", description: "Plasterboard", sortOrder: 2, catalogueItemId: "c9" });
    expect(validateTree([{ id: "CAT", parentId: null, kind: "category", sortOrder: 1 }, ...rows])).toBeNull();
  });
  it("normalises unknown cost types and quantities", () => {
    expect(normCostType("Plant")).toBe("Other");
    expect(normCostType("Labour")).toBe("Labour");
    expect(qtyText(1 / 3)).toBe("0.333");
    expect(qtyText(NaN)).toBe("0");
  });
});

describe("insertToken", () => {
  it("inserts at the caret, adding * after a number", () => {
    expect(insertToken("", "[M1]")).toEqual({ text: "[M1]", caret: 4 });
    expect(insertToken("2", "[M1]")).toEqual({ text: "2*[M1]", caret: 6 });
    expect(insertToken("[M1]*", "[W10]")).toEqual({ text: "[M1]*[W10]", caret: 10 });
    expect(insertToken("[M1]+3", "[M2]", 5, 6)).toEqual({ text: "[M1]+[M2]", caret: 9 });
    expect(insertToken("(2)", "[M1]", 0, 0)).toEqual({ text: "[M1](2)", caret: 4 });
  });
});
