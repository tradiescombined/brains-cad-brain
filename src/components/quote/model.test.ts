import { describe, it, expect } from "vitest";
import { buildQuoteView, type QuoteModel, type QuoteOptionValues, type QuoteLine } from "./model";

const line = (id: string, sell: number, extra: Partial<QuoteLine> = {}): QuoteLine => ({
  id, number: id, description: id, quantity: 1, uom: "ea", sell, allowanceType: "none", hidden: false, ...extra,
});

const model = {
  categories: [
    { id: "c1", number: "1", name: "Demo", hidden: false, sell: 100, sellIncTax: 110, items: [line("1.1", 60), line("1.2", 0), line("1.3", 40, { hidden: true })] },
    { id: "c2", number: "2", name: "Fixtures", hidden: false, sell: 500, sellIncTax: 550, items: [line("2.1", 300, { allowanceType: "PC" }), line("2.2", 100), line("2.3", 100, { allowanceType: "PS" })] },
    { id: "c3", number: "3", name: "Secret", hidden: true, sell: 50, sellIncTax: 55, items: [line("3.1", 50)] },
  ],
} as unknown as QuoteModel;

const base: QuoteOptionValues = {
  title: "Quotation", validDays: 30, coverLetter: "", termsAndConditions: "",
  printBusinessInfo: true, printLogo: true, printCategories: true, printCategoryTotals: false, categoryTotalsIncludeTax: true,
  printItems: false, printQuantities: true, printUnitMeasures: true, printItemTotals: false, printZeroDollarItems: true,
  printSpecifications: true, printSpecificationNumbers: true, printInitialsArea: false, showMarkup: false,
  pcPrintOption: "show_total", psPrintOption: "show_total",
};

describe("buildQuoteView", () => {
  it("lists visible categories without items by default", () => {
    const v = buildQuoteView(model, base);
    expect(v.sections.map((s) => s.name)).toEqual(["Demo", "Fixtures"]);
    expect(v.sections.every((s) => s.items.length === 0 && s.total === null)).toBe(true);
  });
  it("prints category totals ex or inc tax", () => {
    expect(buildQuoteView(model, { ...base, printCategoryTotals: true }).sections[0].total).toBe(110);
    expect(buildQuoteView(model, { ...base, printCategoryTotals: true, categoryTotalsIncludeTax: false }).sections[1].total).toBe(500);
  });
  it("prints items, skipping hidden and allowance rows", () => {
    const v = buildQuoteView(model, { ...base, printItems: true });
    expect(v.sections[0].items.map((i) => i.id)).toEqual(["1.1", "1.2"]);
    expect(v.sections[1].items.map((i) => i.id)).toEqual(["2.2"]);
  });
  it("drops zero-dollar items when asked", () => {
    const v = buildQuoteView(model, { ...base, printItems: true, printZeroDollarItems: false });
    expect(v.sections[0].items.map((i) => i.id)).toEqual(["1.1"]);
  });
  it("flattens items when categories are off", () => {
    const v = buildQuoteView(model, { ...base, printItems: true, printCategories: false });
    expect(v.sections).toHaveLength(1);
    expect(v.sections[0].items.map((i) => i.id)).toEqual(["1.1", "1.2", "2.2"]);
    expect(buildQuoteView(model, { ...base, printCategories: false, pcPrintOption: "hide", psPrintOption: "hide" }).hasScope).toBe(false);
  });
  it("applies PC / PS print options", () => {
    let v = buildQuoteView(model, base);
    expect(v.allowances.map((a) => [a.kind, a.total, a.items.length])).toEqual([["PC", 300, 0], ["PS", 100, 0]]);
    v = buildQuoteView(model, { ...base, pcPrintOption: "show_items", psPrintOption: "hide" });
    expect(v.allowances).toHaveLength(1);
    expect(v.allowances[0].items.map((i) => i.id)).toEqual(["2.1"]);
  });
});
