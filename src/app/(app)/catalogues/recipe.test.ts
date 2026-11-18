import { describe, it, expect } from "vitest";
import { evalRecipeQty, recipeTotals, adjustByPercent, createsCycle } from "./recipe";

describe("evalRecipeQty", () => {
  it("evaluates numbers, maths, functions and [Q]", () => {
    expect(evalRecipeQty("2.5").value).toBe(2.5);
    expect(evalRecipeQty("1/0.6").value).toBe(1.667);
    expect(evalRecipeQty("ceil(2.1)").value).toBe(3);
    expect(evalRecipeQty("[Q]*2").value).toBe(2);
  });
  it("rejects measurements, wastage refs, blanks, negatives and bad syntax", () => {
    expect(evalRecipeQty("[M1]*2").error).toMatch(/Only \[Q\]/);
    expect(evalRecipeQty("[W10]").error).toMatch(/Only \[Q\]/);
    expect(evalRecipeQty("").error).toBeTruthy();
    expect(evalRecipeQty("-1").error).toMatch(/negative/);
    expect(evalRecipeQty("2*").error).toBeTruthy();
  });
});

describe("recipeTotals", () => {
  it("sums qty × cost and ignores invalid lines", () => {
    const t = recipeTotals([
      { quantityExpr: "2", unitCost: 6.4 },
      { quantityExpr: "0.5", unitCost: 75 },
      { quantityExpr: "[M1]", unitCost: 100 },
    ]);
    expect(t.unitCost).toBe(50.3);
    expect(t.errors).toBe(1);
    expect(t.rows.map((r) => r.extended)).toEqual([12.8, 37.5, 0]);
  });
  it("is zero for no lines", () => {
    expect(recipeTotals([]).unitCost).toBe(0);
  });
});

describe("adjustByPercent", () => {
  it("applies and rounds", () => {
    expect(adjustByPercent(100, 5)).toBe(105);
    expect(adjustByPercent(6.4, 2.5)).toBe(6.56);
    expect(adjustByPercent(10, -10)).toBe(9);
    expect(adjustByPercent(10, -150)).toBe(0);
  });
});

describe("createsCycle", () => {
  const g: Record<string, string[]> = { A: ["B"], B: ["C"], C: [] };
  const kids = (id: string) => g[id] ?? [];
  it("detects self and indirect cycles", () => {
    expect(createsCycle("A", "A", kids)).toBe(true);
    expect(createsCycle("C", "A", kids)).toBe(true);
    expect(createsCycle("A", "C", kids)).toBe(false);
  });
});
