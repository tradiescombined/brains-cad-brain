import { describe, it, expect } from "vitest";
import { calculate, type CalcItem } from "./calc";
import { evaluate, referencedMeasurements } from "./expr";

describe("expr", () => {
  it("evaluates arithmetic, measurements and wastage", () => {
    expect(evaluate("1/.45")).toBeCloseTo(2.2222, 4);
    expect(evaluate("([M1])*[W10]", { measurements: { M1: 75.79 } })).toBeCloseTo(83.369, 3);
    expect(evaluate("[M2]", { measurements: { M2: 90.64 } })).toBe(90.64);
    expect(evaluate("roundup(7.2, 0.6)")).toBeCloseTo(7.2);
    expect(evaluate("ceil(2.1)*3")).toBe(9);
    expect(evaluate("2^3+-1")).toBe(7);
    expect(evaluate("")).toBe(0);
  });
  it("rejects bad input", () => {
    expect(() => evaluate("[M9]")).toThrow();
    expect(() => evaluate("alert(1)")).toThrow();
    expect(() => evaluate("2+")).toThrow();
    expect(() => evaluate("1/0")).toThrow();
  });
  it("lists referenced measurements", () => {
    expect(referencedMeasurements("([M1]+[M:Roof])*[W10]*[Q]")).toEqual(["M1", "Roof"]);
  });
});

const cat = (id: string, sortOrder: number): CalcItem => ({ id, parentId: null, kind: "category", sortOrder, unitCost: 0 });
const item = (id: string, parentId: string, sortOrder: number, qty: number | string, unitCost: number, extra: Partial<CalcItem> = {}): CalcItem => ({
  id, parentId, kind: "item", sortOrder, unitCost,
  ...(typeof qty === "string" ? { quantityExpr: qty } : { quantity: qty }), ...extra,
});

describe("calculate", () => {
  it("matches reference totals: markup 18+2, GST 10%", () => {
    const r = calculate({
      items: [cat("c1", 1), item("i1", "c1", 1, 1, 38171.1)],
      markupLines: [{ name: "Markup", percent: 18 }, { name: "Contingency", percent: 2 }],
      taxRate: 0.1,
    });
    expect(r.costTotal).toBe(38171.1);
    expect(r.markupTotal).toBe(7634.22);
    expect(r.taxTotal).toBe(4580.53);
    expect(r.quoteTotal).toBe(50385.85);
    expect(r.markupBreakdown.map((m) => m.amount)).toEqual([6870.8, 763.42]);
  });

  it("rolls up recipe children and numbers rows", () => {
    // Bearers and joists 99.704 lm; component Joist 1/.45 per lm @ 19 → reference total 4209.30
    const r = calculate({
      items: [
        cat("c3", 3),
        item("p", "c3", 7, 99.704, 0),
        item("k1", "p", 2, "1/.45", 19),
        item("k0", "p", 1, 1, 17.79),
      ],
      markupLines: [], taxRate: 0,
    });
    expect(r.items.k1.number).toBe("1.1.2");
    expect(r.items.k1.total).toBeCloseTo(4209.3, 1);
    expect(r.items.p.unitCost).toBeCloseTo(17.79 + 19 / 0.45, 2);
    expect(r.costTotal).toBeCloseTo(r.items.p.total, 1);
    expect(r.items.c3.total).toBeCloseTo(r.items.p.total, 2);
  });

  it("uses measurements, item markup overrides, non-taxable items, cost types", () => {
    const r = calculate({
      items: [
        cat("c", 1),
        item("a", "c", 1, "[M1]*[W10]", 10, { costType: "Material" }),
        item("b", "c", 2, 2, 50, { costType: "Labour", markupPercent: 0, taxable: false }),
      ],
      markupLines: [{ name: "Markup", percent: 10 }],
      taxRate: 0.1,
      measurements: { M1: 10 },
    });
    expect(r.items.a.quantity).toBeCloseTo(11);
    expect(r.costTotal).toBe(210);
    expect(r.markupTotal).toBe(11);
    expect(r.taxTotal).toBe(12.1);
    expect(r.byCostType).toEqual({ Material: 110, Labour: 100 });
  });

  it("reports formula errors without crashing", () => {
    const r = calculate({ items: [cat("c", 1), item("a", "c", 1, "[M7]", 5)], markupLines: [], taxRate: 0 });
    expect(r.errors[0].id).toBe("a");
    expect(r.costTotal).toBe(0);
  });

  it("redistributes PC/PS markup within category without changing total", () => {
    const base = {
      items: [cat("c", 1), item("n", "c", 1, 1, 1000), item("pc", "c", 2, 1, 500, { allowanceType: "PC" })],
      markupLines: [{ name: "Markup", percent: 20 }], taxRate: 0,
    };
    const none = calculate(base);
    const red = calculate({ ...base, pcpsRedistribution: "within_category" });
    expect(red.quoteTotal).toBe(none.quoteTotal);
    expect(red.items.pc.displaySell).toBe(500);
    expect(red.items.n.displaySell).toBe(1300);
  });

  it("rounds quote total up", () => {
    const r = calculate({ items: [cat("c", 1), item("a", "c", 1, 1, 1234.56)], markupLines: [], taxRate: 0, rounding: "hundred" });
    expect(r.quoteTotal).toBe(1300);
    expect(r.roundingAdjustment).toBe(65.44);
  });
});
