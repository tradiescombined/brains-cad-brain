import { describe, it, expect } from "vitest";
import { computeFinance, budgetVsActual, parseOptions, selectionDifference, timesheetTotals, UNALLOCATED, TIMESHEETS, VARIATIONS, type FinanceInput } from "./job-finance";
import { weekStart } from "./scheduling";

const base: FinanceInput = {
  contractValue: 13200, // revised contract inc GST: original 11,000 + approved variation 2,200
  taxRate: 0.1,
  budgetLines: [
    { id: "l1", category: "Demolition", budget: 1000 },
    { id: "l2", category: "Demolition", budget: 500 },
    { id: "l3", category: "Tiling", budget: 4000 },
    { id: "l4", category: "Fixtures", budget: 2500 },
  ],
  actualCosts: [
    { budgetLineId: "l1", amount: 1200 }, // over by 200
    { budgetLineId: "l3", amount: 1500 },
    { budgetLineId: null, amount: 100 },
  ],
  timesheets: [{ hours: 10, rate: 50 }],
  variations: [
    { status: "Approved", total: 2200, taxTotal: 200, costTotal: 1500 },
    { status: "Draft", total: 9999, taxTotal: 0, costTotal: 9999 },
    { status: "Rejected", total: 500, taxTotal: 0, costTotal: 400 },
  ],
  invoices: [
    { status: "Paid", total: 3300, subtotal: 3000, amountPaid: 3300 },
    { status: "Sent", total: 2200, subtotal: 2000, amountPaid: 0 },
    { status: "Void", total: 5000, subtotal: 5000, amountPaid: 0 },
  ],
};

describe("computeFinance", () => {
  const f = computeFinance(base);
  it("adds only approved variations to the contract", () => {
    expect(f.originalContract).toBe(11000);
    expect(f.approvedVariations).toBe(2200);
    expect(f.approvedVariationCount).toBe(1);
    expect(f.revisedContract).toBe(13200);
    expect(f.revisedContractExTax).toBe(12000);
  });
  it("totals budget and actual cost including timesheets", () => {
    expect(f.budgetCost).toBe(8000);
    expect(f.revisedBudget).toBe(9500);
    expect(f.actualCosts).toBe(2800);
    expect(f.labourCost).toBe(500);
    expect(f.labourHours).toBe(10);
    expect(f.actualToDate).toBe(3300);
  });
  it("forecasts cost with overruns and variation budget", () => {
    // lines: max(1000,1200)+500+4000+2500 = 8200; + max(1500, 100+500) = 9700
    expect(f.forecastCost).toBe(9700);
    expect(f.forecastMargin).toBe(2300);
    expect(f.forecastMarginPercent).toBeCloseTo((2300 / 12000) * 100, 6);
    expect(f.budgetMargin).toBe(2500);
  });
  it("ignores void invoices and computes outstanding", () => {
    expect(f.invoiced).toBe(5500);
    expect(f.invoicedExTax).toBe(5000);
    expect(f.paid).toBe(3300);
    expect(f.outstanding).toBe(2200);
    expect(f.invoicedPercent).toBeCloseTo((5500 / 13200) * 100, 6);
  });
  it("computes WIP from cost-based percent complete", () => {
    expect(f.percentComplete).toBeCloseTo((3300 / 9700) * 100, 6);
    expect(f.earnedRevenue).toBe(Math.round(12000 * (3300 / 9700) * 100) / 100);
    expect(f.wip).toBe(Math.round((f.earnedRevenue - 5000) * 100) / 100);
  });
  it("handles an empty blank job", () => {
    const e = computeFinance({ contractValue: 0, taxRate: 0.1, budgetLines: [], actualCosts: [], timesheets: [], variations: [], invoices: [] });
    expect(e.forecastMarginPercent).toBe(0);
    expect(e.invoicedPercent).toBe(0);
    expect(e.percentComplete).toBe(0);
    expect(e.byCategory).toEqual([]);
  });
});

describe("budgetVsActual", () => {
  it("groups by category with special buckets and flags overruns", () => {
    const rows = budgetVsActual(base);
    const by = Object.fromEntries(rows.map((r) => [r.category, r]));
    expect(by.Demolition).toMatchObject({ budget: 1500, actual: 1200, variance: 300, over: false });
    expect(by.Tiling).toMatchObject({ budget: 4000, actual: 1500 });
    expect(by.Fixtures).toMatchObject({ budget: 2500, actual: 0, percentUsed: 0 });
    expect(by[UNALLOCATED]).toMatchObject({ budget: 0, actual: 100, over: true, percentUsed: 100 });
    expect(by[TIMESHEETS]).toMatchObject({ actual: 500, over: true });
    expect(by[VARIATIONS]).toMatchObject({ budget: 1500, actual: 0 });
  });
  it("flags a category over budget", () => {
    const rows = budgetVsActual({ ...base, actualCosts: [{ budgetLineId: "l4", amount: 2600 }], timesheets: [], variations: [] });
    const fx = rows.find((r) => r.category === "Fixtures")!;
    expect(fx.over).toBe(true);
    expect(fx.variance).toBe(-100);
    expect(fx.percentUsed).toBeCloseTo(104, 6);
  });
});

describe("selections", () => {
  it("parses options defensively", () => {
    expect(parseOptions('[{"name":" Matte ","price":"120.5"},{"name":""},{"price":3}]')).toEqual([{ name: "Matte", price: 120.5 }]);
    expect(parseOptions("garbage")).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
  });
  it("computes chosen vs allowance difference", () => {
    const options = [{ name: "Basic", price: 800 }, { name: "Premium", price: 1450 }];
    expect(selectionDifference({ options, chosenOption: "Premium", allowance: 1000 })).toMatchObject({ chosenPrice: 1450, difference: 450 });
    expect(selectionDifference({ options, chosenOption: "Basic", allowance: 1000 }).difference).toBe(-200);
    expect(selectionDifference({ options, chosenOption: null, allowance: 1000 }).difference).toBeNull();
    expect(selectionDifference({ options, chosenOption: "Basic", allowance: null }).difference).toBeNull();
  });
});

describe("timesheetTotals", () => {
  it("rolls up by worker and Monday-start week", () => {
    const t = timesheetTotals(
      [
        { worker: "Alex", date: "2026-11-16", hours: 8, rate: 60 },
        { worker: "Alex", date: "2026-11-22", hours: 4, rate: 60 }, // Sunday, same week
        { worker: "Bo", date: "2026-11-23", hours: 7.5, rate: 50 },
      ],
      weekStart,
    );
    expect(t.hours).toBe(19.5);
    expect(t.cost).toBe(1095);
    expect(t.byWorker).toEqual([
      { worker: "Alex", hours: 12, cost: 720, entries: 2 },
      { worker: "Bo", hours: 7.5, cost: 375, entries: 1 },
    ]);
    expect(t.byWeek.map((w) => w.week)).toEqual(["2026-11-23", "2026-11-16"]);
  });
});
