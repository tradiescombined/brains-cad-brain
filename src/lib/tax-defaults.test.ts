import { describe, expect, it } from "vitest";
import { assignCostTypes, defaultTaxable, parseCostTypes, rateForCostType, taxableDefaults } from "./tax-defaults";

const ALL = JSON.stringify(["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"]);

describe("tax defaults per cost type", () => {
  it("parses and filters unknown cost types", () => {
    expect(parseCostTypes('["Material","Bogus","Labour","Material"]')).toEqual(["Material", "Labour"]);
    expect(parseCostTypes("not json")).toEqual([]);
    expect(parseCostTypes(null)).toEqual([]);
  });

  it("uses the income rate assigned to each cost type", () => {
    const rates = [
      { id: "gst", rate: 0.1, appliesTo: "income", active: true, defaultCostTypes: JSON.stringify(["Material", "Labour", "MatLab", "Equipment"]) },
      { id: "fre", rate: 0, appliesTo: "income", active: true, defaultCostTypes: JSON.stringify(["Subcontractor"]) },
      { id: "gst-ex", rate: 0.1, appliesTo: "expense", active: true, defaultCostTypes: ALL },
    ];
    const d = taxableDefaults(rates);
    expect(d.Material).toBe(true);
    expect(d.MatLab).toBe(true);
    expect(d.Subcontractor).toBe(false);
    expect(d.Other).toBe(true); // unassigned → taxable fallback
    expect(rateForCostType(rates, "Labour", "expense")?.id).toBe("gst-ex");
  });

  it("ignores inactive rates and falls back to taxable", () => {
    const rates = [{ id: "fre", rate: 0, appliesTo: "income", active: false, defaultCostTypes: ALL }];
    expect(taxableDefaults(rates).Labour).toBe(true);
    expect(defaultTaxable(undefined, "Labour")).toBe(true);
    expect(defaultTaxable({ Labour: false }, "Labour")).toBe(false);
    expect(defaultTaxable({ Labour: false }, "Unknown")).toBe(true);
  });

  it("assigns cost types to the chosen rates", () => {
    const out = assignCostTypes(["a", "b"], { Material: "a", Labour: "b", MatLab: "a", Equipment: "", Subcontractor: "zzz" });
    expect(JSON.parse(out.a)).toEqual(["Material", "MatLab"]);
    expect(JSON.parse(out.b)).toEqual(["Labour"]);
  });
});
