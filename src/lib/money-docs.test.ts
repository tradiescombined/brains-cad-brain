import { describe, it, expect } from "vitest";
import {
  round2, poLineTotal, poTotals, poNextStatuses, canBillPo, parsePoLines, cleanPoLines, groupBudgetPicksBySupplier, dominantCostType,
  variationTotals, parseVariationLines, cleanVariationLines, contractDeltaForVariation,
  invoiceTotals, parseInvoiceLines, cleanInvoiceLines, exTax, percentOfContractExTax, progressClaim, statusFromPayments, balanceDue,
  daysOverdue, isOverdue, isOutstanding, ageingBucket, ageing, contractSummary,
} from "./money-docs";

describe("rounding", () => {
  it("rounds half away from zero to cents", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(NaN)).toBe(0);
  });
});

describe("purchase orders", () => {
  it("line and document totals with expense tax", () => {
    expect(poLineTotal({ quantity: 3, unitCost: 6.4 })).toBe(19.2);
    expect(poTotals([{ quantity: 3, unitCost: 6.4 }, { quantity: 2.5, unitCost: 18.5 }], 0.1)).toEqual({ subtotal: 65.45, tax: 6.55, total: 72 });
    expect(poTotals([], 0.1)).toEqual({ subtotal: 0, tax: 0, total: 0 });
    expect(poTotals([{ quantity: 10, unitCost: 10 }], 0)).toEqual({ subtotal: 100, tax: 0, total: 100 });
  });
  it("status workflow", () => {
    expect(poNextStatuses("Draft")).toEqual(["Sent", "Cancelled"]);
    expect(poNextStatuses("Billed")).toEqual([]);
    expect(poNextStatuses("Cancelled")).toEqual(["Draft"]);
    expect(canBillPo("Draft")).toBe(false);
    expect(canBillPo("Delivered")).toBe(true);
    expect(canBillPo("Billed")).toBe(false);
  });
  it("parses and cleans lines defensively", () => {
    expect(parsePoLines("not json")).toEqual([]);
    const l = parsePoLines('[{"description":" Studs ","quantity":"4","unitCost":"2.5"}, 5]');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ description: "Studs", quantity: 4, unitCost: 2.5, uom: "", costType: "Material" });
    expect(cleanPoLines([...l, { description: "  ", itemCode: "", quantity: 1, uom: "", unitCost: 1 }])).toHaveLength(1);
  });
  it("groups budget picks into one PO per supplier", () => {
    const g = groupBudgetPicksBySupplier([
      { budgetLineId: "a", supplierId: "s1", description: "Frame", uom: "lm", quantity: 10, unitCost: 6, costType: "Material" },
      { budgetLineId: "b", supplierId: "s2", description: "Sparky", uom: "hr", quantity: 4, unitCost: 90, costType: "Subcontractor" },
      { budgetLineId: "c", supplierId: "s1", description: "Nails", uom: null, quantity: 1, unitCost: 89, costType: "Material" },
      { budgetLineId: "d", supplierId: "", description: "Misc", uom: "ea", quantity: 1, unitCost: 5, costType: "Other" },
    ]);
    expect([...g.keys()]).toEqual(["s1", "s2", null]);
    expect(g.get("s1")!.map((l) => l.budgetLineId)).toEqual(["a", "c"]);
    expect(g.get("s1")![1].uom).toBe("");
  });
  it("dominant cost type by value", () => {
    expect(dominantCostType([{ costType: "Material", quantity: 1, unitCost: 10 }, { costType: "Labour", quantity: 1, unitCost: 50 }])).toBe("Labour");
    expect(dominantCostType([])).toBe("Material");
  });
});

describe("variations", () => {
  it("cost, markup, tax, total", () => {
    const t = variationTotals([{ quantity: 2, unitCost: 450 }, { quantity: 8, unitCost: 75 }], 20, 0.1);
    expect(t).toEqual({ cost: 1500, markup: 300, subtotal: 1800, tax: 180, total: 1980 });
    expect(variationTotals([], 20, 0.1).total).toBe(0);
    expect(variationTotals([{ quantity: 1, unitCost: -200 }], 10, 0.1)).toEqual({ cost: -200, markup: -20, subtotal: -220, tax: -22, total: -242 });
  });
  it("contract delta stays consistent through approve / un-approve", () => {
    expect(contractDeltaForVariation("Sent", "Approved", 1980)).toBe(1980);
    expect(contractDeltaForVariation("Approved", "Sent", 1980)).toBe(-1980);
    expect(contractDeltaForVariation("Approved", "Rejected", 1980)).toBe(-1980);
    expect(contractDeltaForVariation("Draft", "Sent", 1980)).toBe(0);
    expect(contractDeltaForVariation("Approved", "Approved", 1980)).toBe(0);
  });
  it("parses lines with unknown cost types", () => {
    const l = parseVariationLines('[{"description":"Extra door","quantity":1,"unitCost":72,"costType":"Bogus"}]');
    expect(l[0].costType).toBe("Material");
    expect(cleanVariationLines([{ description: "", quantity: 1, uom: "", unitCost: 1, costType: "Material" }])).toEqual([]);
  });
});

describe("invoices", () => {
  it("taxable per line", () => {
    expect(invoiceTotals([{ amount: 1000, taxable: true }, { amount: 250, taxable: false }], 0.1)).toEqual({ subtotal: 1250, tax: 100, total: 1350 });
  });
  it("converts inc-tax contract shares to ex-tax lines", () => {
    expect(exTax(11000, 0.1)).toBe(10000);
    expect(percentOfContractExTax(100000, 10, 0.1)).toBe(9090.91);
    const t = invoiceTotals([{ amount: percentOfContractExTax(100000, 10, 0.1), taxable: true }], 0.1);
    expect(t.total).toBeCloseTo(10000, 1);
  });
  it("progress claim = (cumulative % − previously claimed %) × contract", () => {
    expect(progressClaim({ contractValue: 100000, previouslyClaimed: 10000, cumulativePercent: 35 })).toEqual({ previousPercent: 10, cumulativePercent: 35, thisPercent: 25, amount: 25000 });
    // cannot go negative or above 100%
    expect(progressClaim({ contractValue: 100000, previouslyClaimed: 50000, cumulativePercent: 40 }).amount).toBe(0);
    expect(progressClaim({ contractValue: 100000, previouslyClaimed: 0, cumulativePercent: 140 }).cumulativePercent).toBe(100);
    expect(progressClaim({ contractValue: 0, previouslyClaimed: 0, cumulativePercent: 50 }).amount).toBe(0);
  });
  it("status follows payments", () => {
    expect(statusFromPayments("Sent", 1100, 0)).toBe("Sent");
    expect(statusFromPayments("Sent", 1100, 100)).toBe("Part paid");
    expect(statusFromPayments("Part paid", 1100, 1100)).toBe("Paid");
    expect(statusFromPayments("Paid", 1100, 0)).toBe("Sent");
    expect(statusFromPayments("Draft", 1100, 0)).toBe("Draft");
    expect(statusFromPayments("Draft", 1100, 50)).toBe("Part paid");
    expect(statusFromPayments("Void", 1100, 1100)).toBe("Void");
    expect(balanceDue(1100, 99.99)).toBe(1000.01);
  });
  it("parses lines; taxable defaults true", () => {
    expect(parseInvoiceLines('[{"description":"Deposit","amount":"500"}]')).toEqual([{ description: "Deposit", amount: 500, taxable: true, variationId: null }]);
    expect(cleanInvoiceLines([{ description: "", amount: 0, taxable: true }, { description: "", amount: 5, taxable: false }])).toEqual([{ description: "Item", amount: 5, taxable: false }]);
  });
});

describe("overdue & ageing", () => {
  const today = "2026-11-18";
  it("days overdue", () => {
    expect(daysOverdue("2026-11-17", today)).toBe(1);
    expect(daysOverdue("2026-11-18", today)).toBe(0);
    expect(daysOverdue("2026-12-01", today)).toBe(0);
    expect(daysOverdue(null, today)).toBe(0);
    expect(daysOverdue("2026-08-10", today)).toBe(100);
  });
  it("buckets", () => {
    expect(ageingBucket(0)).toBe("Current");
    expect(ageingBucket(1)).toBe("1–30 days");
    expect(ageingBucket(30)).toBe("1–30 days");
    expect(ageingBucket(31)).toBe("31–60 days");
    expect(ageingBucket(61)).toBe("61–90 days");
    expect(ageingBucket(90)).toBe("61–90 days");
    expect(ageingBucket(91)).toBe("90+ days");
  });
  it("only sent / part paid invoices with a balance count", () => {
    const inv = (status: string, total: number, amountPaid: number, dueDate: string | null) => ({ status, total, amountPaid, dueDate });
    expect(isOutstanding(inv("Draft", 100, 0, null))).toBe(false);
    expect(isOutstanding(inv("Paid", 100, 100, null))).toBe(false);
    expect(isOverdue(inv("Sent", 100, 0, "2026-11-01"), today)).toBe(true);
    expect(isOverdue(inv("Sent", 100, 100, "2026-11-01"), today)).toBe(false);
    const a = ageing(
      [
        inv("Sent", 1000, 0, "2026-12-01"), // current
        inv("Part paid", 1000, 400, "2026-11-08"), // 10 days → 600
        inv("Sent", 500, 0, "2026-09-30"), // 49 days
        inv("Sent", 200, 0, "2026-08-01"), // 109 days
        inv("Void", 999, 0, "2026-01-01"),
        inv("Draft", 999, 0, "2026-01-01"),
      ],
      today,
    );
    expect(a.buckets).toEqual({ Current: 1000, "1–30 days": 600, "31–60 days": 500, "61–90 days": 0, "90+ days": 200 });
    expect(a.outstanding).toBe(2300);
    expect(a.overdue).toBe(1300);
    expect(a.count).toBe(4);
  });
});

describe("contract summary", () => {
  it("includes approved variations and ignores void invoices", () => {
    const s = contractSummary({
      contractValue: 101980,
      approvedVariations: 1980,
      invoices: [
        { kind: "Deposit", status: "Paid", total: 10000, amountPaid: 10000 },
        { kind: "Progress claim", status: "Sent", total: 25000, amountPaid: 0 },
        { kind: "Variation", status: "Draft", total: 1980, amountPaid: 0 },
        { kind: "Progress claim", status: "Void", total: 5000, amountPaid: 0 },
      ],
    });
    expect(s.base).toBe(100000);
    expect(s.invoiced).toBe(36980);
    expect(s.contractClaims).toBe(35000);
    expect(s.paid).toBe(10000);
    expect(s.remaining).toBe(65000);
    expect(s.claimedPercent).toBeCloseTo(36.26, 2);
  });
});
