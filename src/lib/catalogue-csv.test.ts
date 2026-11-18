import { describe, it, expect } from "vitest";
import { parseCsv, toCsv, detectMapping, normaliseCostType, parseMoney, splitCategoryPath, mapRows, planImport, catalogueToCsv } from "./catalogue-csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""",3\r\n\r\n"multi\nline",,\n');
    expect(rows).toEqual([["a", "b", "c"], ["x, y", 'he said "hi"', "3"], ["multi\nline", "", ""]]);
  });
  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("round-trips through toCsv", () => {
    const data = [["Code", "Desc"], ["A1", 'Pine "MGP10", 90x45'], ["B2", "line\nbreak"]];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });
  it("guards formula injection but keeps negative numbers", () => {
    expect(toCsv([["=SUM(A1)", "-5", -3]])).toBe("'=SUM(A1),-5,-3\r\n");
  });
});

describe("detectMapping", () => {
  it("maps common header names", () => {
    const m = detectMapping(["SKU", "Product Name", "Type", "Unit", "Price ex GST", "Group", "Notes"]);
    expect(m).toEqual({ code: 0, description: 1, costType: 2, uom: 3, unitCost: 4, category: 5, details: 6 });
  });
  it("does not let 'type' steal 'cost type' and leaves unknowns unmapped", () => {
    const m = detectMapping(["Item Code", "Description", "Cost Type", "Whatever"]);
    expect(m.costType).toBe(2);
    expect(m.unitCost).toBe(-1);
  });
});

describe("value parsing", () => {
  it("normalises cost types", () => {
    expect(normaliseCostType("labor")).toBe("Labour");
    expect(normaliseCostType("Sub-contractor")).toBe("Subcontractor");
    expect(normaliseCostType("Plant")).toBe("Equipment");
    expect(normaliseCostType("MATERIAL")).toBe("Material");
    expect(normaliseCostType("banana")).toBeNull();
    expect(normaliseCostType("")).toBeNull();
  });
  it("parses money", () => {
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney(" 6.4 ")).toBe(6.4);
    expect(parseMoney("(12.00)")).toBe(-12);
    expect(parseMoney("AUD 10")).toBe(10);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("splits category paths to two levels", () => {
    expect(splitCategoryPath("Framing > Walls")).toEqual(["Framing", "Walls"]);
    expect(splitCategoryPath("A / B / C")).toEqual(["A", "B / C"]);
    expect(splitCategoryPath("  ")).toEqual([]);
  });
});

describe("mapRows + planImport", () => {
  const rows = parseCsv(`Code,Description,Type,UOM,Cost,Category
A1,Thing one,Labour,hr,$75,Labour
,Missing code item,,,,
A2,,Material,ea,3,
A3,Bad price,Material,ea,abc,
A1,Duplicate,Material,ea,1,
B9,Existing,weird,m,2.5,Framing > Walls`);
  const m = detectMapping(rows[0]);
  const { rows: ok, skipped } = mapRows(rows, m, true);
  it("validates rows with reasons", () => {
    expect(ok.map((r) => r.description)).toEqual(["Thing one", "Missing code item", "Duplicate", "Existing"]);
    expect(skipped).toEqual([
      { line: 4, reason: "Missing description" },
      { line: 5, reason: 'Unit cost "abc" is not a number' },
    ]);
    expect(ok[1]).toMatchObject({ code: null, costType: null, uom: null, unitCost: null, category: null });
    expect(ok[3].warnings[0]).toMatch(/Unknown cost type/);
    expect(ok[3].category).toEqual(["Framing", "Walls"]);
  });
  it("plans inserts, updates by code (case-insensitive) and duplicate skips", () => {
    const plan = planImport(ok, new Map([["b9", "item-b9"]]), skipped);
    expect(plan.inserts.map((r) => r.line)).toEqual([2, 3]);
    expect(plan.updates).toEqual([{ row: ok[3], id: "item-b9" }]);
    expect(plan.skipped.map((s) => s.line)).toEqual([4, 5, 6]);
    expect(plan.skipped[2].reason).toMatch(/Duplicate code "A1"/);
  });
});

describe("catalogueToCsv", () => {
  it("exports headers and category paths, re-importable", () => {
    const csv = catalogueToCsv(
      [{ itemCode: "X", description: "Pine, 90x45", costType: "Material", uom: "lm", unitCost: 6.4, categoryId: "c", details: null, isRecipe: false }],
      (id) => (id ? "Framing > Walls" : ""),
    );
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(["X", "Pine, 90x45", "Material", "lm", "6.4", "Framing > Walls", "", "No"]);
    const back = mapRows(rows, detectMapping(rows[0]), true);
    expect(back.rows[0]).toMatchObject({ code: "X", unitCost: 6.4, category: ["Framing", "Walls"] });
  });
});
