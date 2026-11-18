import { describe, it, expect } from "vitest";
import {
  fromRows, toRows, numberTree, moveNode, indentNode, outdentNode, canIndent, canOutdent, canMove,
  removeNode, addNode, updateNode, toTemplateContent, fromTemplateContent, sanitizeTree, countNodes, type SpecNode,
} from "./spec-tree";
import { parseMarkdown, parseInline, markdownToPlain } from "./md-parse";

const n = (id: string, children: SpecNode[] = []): SpecNode => ({ id, heading: id.toUpperCase(), body: "", children });
const ids = (t: SpecNode[]) => t.map((x) => (x.children.length ? `${x.id}(${x.children.map((c) => c.id).join(",")})` : x.id)).join(" ");

describe("spec tree", () => {
  const tree = [n("a", [n("a1"), n("a2")]), n("b"), n("c")];

  it("round-trips rows", () => {
    const rows = toRows(tree);
    expect(rows.find((r) => r.id === "a2")).toMatchObject({ parentId: "a", sortOrder: 1 });
    expect(ids(fromRows(rows))).toBe("a(a1,a2) b c");
  });
  it("sorts rows, promotes orphans and flattens deep rows", () => {
    const rows = [
      { id: "x", parentId: null, sortOrder: 2, heading: "X", body: null },
      { id: "y", parentId: null, sortOrder: 1, heading: "Y", body: null },
      { id: "y1", parentId: "y", sortOrder: 0, heading: "Y1", body: null },
      { id: "y11", parentId: "y1", sortOrder: 1, heading: "deep", body: null },
      { id: "o", parentId: "missing", sortOrder: 3, heading: "O", body: null },
    ];
    expect(ids(fromRows(rows))).toBe("y(y1,y11) x o");
  });
  it("numbers sections", () => {
    expect(numberTree(tree)).toEqual({ a: "1", a1: "1.1", a2: "1.2", b: "2", c: "3" });
    expect(countNodes(tree)).toBe(5);
  });
  it("moves within siblings only", () => {
    expect(ids(moveNode(tree, "b", -1))).toBe("b a(a1,a2) c");
    expect(ids(moveNode(tree, "a2", -1))).toBe("a(a2,a1) b c");
    expect(canMove(tree, "a1", -1)).toBe(false);
    expect(moveNode(tree, "c", 1)).toBe(tree);
  });
  it("indents a childless section under the one above", () => {
    expect(canIndent(tree, "a")).toBe(false);
    expect(ids(indentNode(tree, "b"))).toBe("a(a1,a2,b) c");
    const t2 = [n("p"), n("q", [n("q1")])];
    expect(canIndent(t2, "q")).toBe(false); // would create a 3rd level
  });
  it("outdents a clause after its parent", () => {
    expect(canOutdent(tree, "b")).toBe(false);
    expect(ids(outdentNode(tree, "a1"))).toBe("a(a2) a1 b c");
  });
  it("adds, updates and removes immutably", () => {
    const t = addNode(tree, "b", { id: "b1", heading: "B1", body: "" });
    expect(ids(t)).toBe("a(a1,a2) b(b1) c");
    expect(ids(tree)).toBe("a(a1,a2) b c");
    expect(updateNode(t, "b1", { heading: "New" })[1].children[0].heading).toBe("New");
    expect(ids(removeNode(t, "a"))).toBe("b(b1) c");
    expect(ids(removeNode(t, "a2"))).toBe("a(a1) b(b1) c");
  });
  it("converts to and from library JSON", () => {
    const json = toTemplateContent([{ ...n("a", [n("a1")]), body: "Body" }]);
    expect(JSON.parse(json)).toEqual([{ heading: "A", body: "Body", children: [{ heading: "A1", body: "" }] }]);
    let i = 0;
    const back = fromTemplateContent(json, () => `id${++i}`);
    expect(back).toEqual([{ id: "id1", heading: "A", body: "Body", children: [{ id: "id2", heading: "A1", body: "", children: [] }] }]);
    expect(fromTemplateContent("not json", () => "x")).toEqual([]);
    expect(fromTemplateContent('{"a":1}', () => "x")).toEqual([]);
    const deep = fromTemplateContent(JSON.stringify([{ heading: "A", children: [{ heading: "B", children: [{ heading: "C" }] }] }]), () => `k${++i}`);
    expect(deep[0].children.map((c) => c.heading)).toEqual(["B", "C"]);
  });
  it("sanitises posted trees", () => {
    expect(sanitizeTree([{ id: "a", heading: "  Hi ", body: "x", children: [{ id: "b", heading: "", children: [{ id: "c" }] }] }])).toEqual([
      { id: "a", heading: "Hi", body: "x", children: [{ id: "b", heading: "Untitled section", body: "", children: [] }] },
    ]);
    expect(sanitizeTree([{ id: "a" }, { id: "a" }])).toBeNull();
    expect(sanitizeTree("nope")).toBeNull();
    expect(sanitizeTree([{ heading: "no id" }])).toBeNull();
  });
});

describe("markdown subset", () => {
  it("parses bold", () => {
    expect(parseInline("a **b** c")).toEqual([{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }]);
    expect(parseInline("**unclosed")).toEqual([{ text: "**unclosed", bold: false }]);
  });
  it("parses paragraphs and lists", () => {
    const b = parseMarkdown("Line one\nline two\n\n- item 1\n* **item 2**\nAfter");
    expect(b).toHaveLength(3);
    expect(b[0]).toEqual({ type: "p", lines: [[{ text: "Line one", bold: false }], [{ text: "line two", bold: false }]] });
    expect(b[1].type).toBe("ul");
    expect(b[1].type === "ul" && b[1].items[1]).toEqual([{ text: "item 2", bold: true }]);
    expect(b[2].type).toBe("p");
    expect(parseMarkdown("")).toEqual([]);
  });
  it("produces plain text", () => {
    expect(markdownToPlain("**Hi** there\n\n- one\n- two")).toBe("Hi there one two");
  });
});
