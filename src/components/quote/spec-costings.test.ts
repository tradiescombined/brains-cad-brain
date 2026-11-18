import { describe, it, expect } from "vitest";
import {
  buildSpecDocument, costingOutline, isValidSpecImage, matchCostingsOrder, normaliseLinks, searchSpec, specToMarkdown,
  syncWithCostings, type CostingRow, type SpecItemInput,
} from "./spec-costings";
import { fromRows, moveTopLevelTo, sanitizeTree, toRows, canIndent, type SpecNode } from "./spec-tree";

const row = (id: string, parentId: string | null, kind: "category" | "item", sortOrder: number, description = id): CostingRow => ({ id, parentId, kind, sortOrder, description });
const node = (id: string, categoryItemId: string | null = null, extra: Partial<SpecNode> = {}): SpecNode => ({ id, heading: id, body: "", children: [], categoryItemId, ...extra });
const item = (id: string, categoryId: string | null, extra: Partial<SpecItemInput> = {}): SpecItemInput => ({
  id, categoryId, description: id, quantity: 1, uom: "ea", notes: null, detail: null, imageDataUrl: null, ...extra,
});

describe("costingOutline", () => {
  const rows = [
    row("c2", null, "category", 1, "Framing"),
    row("c1", null, "category", 0, "Demolition"),
    row("i2", "c1", "item", 1),
    row("i1", "c1", "item", 0),
    row("s1", "i1", "item", 0),
    row("i3", "c2", "item", 0),
    row("loose", null, "item", 2),
  ];
  it("orders categories and rows depth-first by sortOrder", () => {
    const o = costingOutline(rows);
    expect(o.categories).toEqual([{ id: "c1", name: "Demolition" }, { id: "c2", name: "Framing" }]);
    expect(o.order).toEqual(["c1", "i1", "s1", "i2", "c2", "i3", "loose"]);
  });
  it("maps items (incl. sub-items) to their root category", () => {
    const o = costingOutline(rows);
    expect(o.categoryOf.get("s1")).toBe("c1");
    expect(o.categoryOf.get("i3")).toBe("c2");
    expect(o.categoryOf.get("loose")).toBeNull();
  });
});

describe("syncWithCostings", () => {
  const cats = [{ id: "c1", name: "Demolition" }, { id: "c2", name: "Framing" }, { id: "c3", name: "Roofing" }];
  let n = 0;
  const gen = () => `new${++n}`;
  it("adds one linked section per category with spec items, in costing order", () => {
    const { tree, added } = syncWithCostings([node("intro")], cats, new Set(["c3", "c1"]), gen);
    expect(added).toBe(2);
    expect(tree.map((s) => [s.heading, s.categoryItemId])).toEqual([["intro", null], ["Demolition", "c1"], ["Roofing", "c3"]]);
  });
  it("keeps existing linked sections and their text", () => {
    const existing = [node("a", "c1", { heading: "My demo", body: "Keep me" })];
    const { tree, added } = syncWithCostings(existing, cats, new Set(["c1", "c2"]), gen);
    expect(added).toBe(1);
    expect(tree[0]).toBe(existing[0]);
    expect(tree[1].categoryItemId).toBe("c2");
  });
  it("returns the same tree when nothing is missing", () => {
    const t = [node("a", "c1")];
    expect(syncWithCostings(t, cats, new Set(["c1"]), gen).tree).toBe(t);
  });
});

describe("matchCostingsOrder", () => {
  it("reorders linked sections into costing order, custom sections keep their slots", () => {
    const t = [node("x"), node("C", "c3"), node("y"), node("A", "c1"), node("B", "c2"), node("z")];
    expect(matchCostingsOrder(t, ["c1", "c2", "c3"]).map((s) => s.id)).toEqual(["x", "A", "y", "B", "C", "z"]);
  });
  it("leaves sections linked to unknown categories in place", () => {
    const t = [node("B", "c2"), node("gone", "deleted"), node("A", "c1")];
    expect(matchCostingsOrder(t, ["c1", "c2"]).map((s) => s.id)).toEqual(["A", "gone", "B"]);
  });
  it("returns the same array when already in order", () => {
    const t = [node("A", "c1"), node("x"), node("B", "c2")];
    expect(matchCostingsOrder(t, ["c1", "c2"])).toBe(t);
  });
});

describe("normaliseLinks", () => {
  it("drops unknown and duplicate links", () => {
    const t = normaliseLinks([node("a", "c1"), node("b", "c1"), node("c", "nope"), node("d")], new Set(["c1"]));
    expect(t.map((s) => s.categoryItemId ?? null)).toEqual(["c1", null, null, null]);
  });
});

describe("buildSpecDocument", () => {
  it("numbers clauses then linked items within a section, leftovers become Inclusions", () => {
    const specs = [
      node("intro", null, { heading: "General", children: [node("cl1"), node("cl2")] }),
      node("demo", "c1", { heading: "Demolition", children: [node("cl3")] }),
    ];
    const doc = buildSpecDocument(specs, [item("i1", "c1"), item("i2", "c2"), item("i3", "c1"), item("loose", null)]);
    expect(doc.sections.map((s) => s.number)).toEqual(["1", "2"]);
    expect(doc.sections[0].clauses.map((c) => c.number)).toEqual(["1.1", "1.2"]);
    expect(doc.sections[0].items).toEqual([]);
    expect(doc.sections[1].clauses[0].number).toBe("2.1");
    expect(doc.sections[1].items.map((i) => [i.id, i.number])).toEqual([["i1", "2.2"], ["i3", "2.3"]]);
    expect(doc.inclusions?.number).toBe("3");
    expect(doc.inclusions?.items.map((i) => [i.id, i.number])).toEqual([["i2", "3.1"], ["loose", "3.2"]]);
  });
  it("old data (no linked sections) keeps all items under Inclusions", () => {
    const doc = buildSpecDocument([node("a")], [item("i1", "c1")]);
    expect(doc.sections[0].items).toEqual([]);
    expect(doc.inclusions?.items.map((i) => i.id)).toEqual(["i1"]);
  });
  it("no Inclusions section when every item is placed", () => {
    expect(buildSpecDocument([node("a", "c1")], [item("i1", "c1")]).inclusions).toBeNull();
  });
});

describe("searchSpec", () => {
  const tree = [
    node("s1", null, { heading: "Tiling", children: [node("cl1", null, { heading: "Wall tiles" })] }),
    node("s2", "c1", { heading: "Plumbing" }),
  ];
  const items = new Map([["c1", [{ id: "i1", description: "Basin mixer", detail: "Chrome finish" }, { id: "i2", description: "Toilet", detail: null }]]]);
  it("returns null for an empty query", () => expect(searchSpec(tree, items, "  ")).toBeNull());
  it("matches section headings with all children", () => {
    const h = searchSpec(tree, items, "plumb")!;
    expect([...h.sections]).toEqual(["s2"]);
    expect([...h.items]).toEqual(["i1", "i2"]);
  });
  it("matches item detail and clauses only", () => {
    const h = searchSpec(tree, items, "chrome")!;
    expect([...h.sections]).toEqual(["s2"]);
    expect([...h.items]).toEqual(["i1"]);
    const h2 = searchSpec(tree, items, "WALL")!;
    expect([...h2.sections]).toEqual(["s1"]);
    expect([...h2.clauses]).toEqual(["cl1"]);
  });
});

describe("specToMarkdown", () => {
  it("renders numbered headings, item detail (or notes) and inclusions", () => {
    const doc = buildSpecDocument([node("a", "c1", { heading: "Demolition", body: "Strip out." })], [
      item("i1", "c1", { description: "Skip bin", detail: "6m3 bin" }),
      item("i2", null, { description: "Clean", notes: "Final clean" }),
    ]);
    const md = specToMarkdown(doc, { title: "Specification", intro: "Intro text" });
    expect(md).toBe("# Specification\n\nIntro text\n\n## 1 Demolition\n\nStrip out.\n\n### 1.1 Skip bin\n\n6m3 bin\n\n## 2 Inclusions\n\n### 2.1 Clean\n\nFinal clean\n");
    expect(specToMarkdown(doc, { title: "S", numbers: false })).toContain("## Demolition");
  });
});

describe("spec tree links", () => {
  it("round-trips categoryItemId through rows and sanitising", () => {
    const t = [node("a", "c1", { children: [node("b")] }), node("c")];
    const rows = toRows(t);
    expect(rows.map((r) => r.categoryItemId)).toEqual(["c1", null, null]);
    expect(fromRows(rows)[0].categoryItemId).toBe("c1");
    expect(sanitizeTree(JSON.parse(JSON.stringify(t)))![0].categoryItemId).toBe("c1");
    // clauses never carry links
    expect(sanitizeTree([{ id: "a", heading: "A", children: [{ id: "b", heading: "B", categoryItemId: "c1" }] }])![0].children[0].categoryItemId).toBeUndefined();
  });
  it("linked sections cannot be indented", () => {
    expect(canIndent([node("a"), node("b", "c1")], "b")).toBe(false);
    expect(canIndent([node("a"), node("b")], "b")).toBe(true);
  });
  it("moveTopLevelTo moves a section (drag and drop)", () => {
    const t = [node("a"), node("b"), node("c")];
    expect(moveTopLevelTo(t, "a", 2).map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(moveTopLevelTo(t, "c", 0).map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(moveTopLevelTo(t, "b", 1)).toBe(t);
  });
});

describe("isValidSpecImage", () => {
  it("accepts small base64 images only", () => {
    expect(isValidSpecImage("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isValidSpecImage("data:text/html;base64,PGI+")).toBe(false);
    expect(isValidSpecImage("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isValidSpecImage("data:image/png;base64," + "A".repeat(2_000_000))).toBe(false);
  });
});
