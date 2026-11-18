import { describe, it, expect } from "vitest";
import {
  evaluateManual,
  matchesTakeoff,
  moveInList,
  planLegacyMigration,
  shapeUnitCheck,
  takeoffSummaries,
  takeoffValue,
  takeoffValueMap,
  type ShapeLike,
  type TakeoffLike,
} from "./takeoffs";
import { calculate } from "./calc";
import { computeMeasurement } from "./geometry";

const T = (id: string, code: string, extra: Partial<TakeoffLike> = {}): TakeoffLike => ({ id, code, description: `T ${code}`, unit: "m", manualExpr: null, ...extra });
const S = (id: string, takeoffId: string | null, value: number, extra: Partial<ShapeLike> = {}): ShapeLike => ({ id, takeoffId, code: "?", description: "", unit: "m", value, ...extra });

describe("evaluateManual", () => {
  it("evaluates calculator expressions and rounds to 3 dp", () => {
    expect(evaluateManual("12.5*2 + 3")).toEqual({ value: 28 });
    expect(evaluateManual("10/3").value).toBe(3.333);
    expect(evaluateManual("ceil(7.2)").value).toBe(8);
    expect(evaluateManual("=2^3").value).toBe(8);
    expect(evaluateManual("").value).toBe(0);
  });
  it("reports errors instead of throwing", () => {
    expect(evaluateManual("2*(3").error).toBeTruthy();
    expect(evaluateManual("[M1]*2").error).toMatch(/Unknown measurement/);
    expect(evaluateManual("4/0")).toMatchObject({ value: 0, error: "Divide by zero" });
  });
});

describe("takeoffValue", () => {
  it("sums shapes across plans; negative (deduction) shapes subtract", () => {
    expect(takeoffValue(T("t", "M1"), [S("a", "t", 10.25), S("b", "t", 4.5), S("c", "t", -2.1)])).toBe(12.65);
  });
  it("is 0 with no shapes", () => {
    expect(takeoffValue(T("t", "M1"), [])).toBe(0);
  });
  it("uses the manual expression when set, ignoring shapes", () => {
    expect(takeoffValue(T("t", "M1", { manualExpr: "3*4" }), [S("a", "t", 99)])).toBe(12);
    expect(takeoffValue(T("t", "M1", { manualExpr: "bad(" }), [S("a", "t", 99)])).toBe(0);
  });
  it("matches computeMeasurement deductions", () => {
    const scale = { x: 10, y: 10 };
    const wall = computeMeasurement({ shape: "line", points: [[0, 0], [500, 0]], scale }); // 5 m
    const wall2 = computeMeasurement({ shape: "polyline", points: [[0, 0], [0, 300], [200, 300]], scale }); // 5 m
    const door = computeMeasurement({ shape: "line", points: [[0, 0], [90, 0]], scale, isNegative: true }); // -0.9 m
    expect(takeoffValue(T("t", "M1"), [wall, wall2, door].map((r, i) => S(String(i), "t", r.value)))).toBe(9.1);
  });
});

describe("takeoffValueMap / takeoffSummaries", () => {
  const takeoffs = [T("t1", "M1"), T("t2", "M2", { manualExpr: "5+5", unit: "ea" }), T("t3", "M10", { unit: "m2" })];
  const shapes = [
    S("a", "t1", 3),
    S("b", "t1", 4),
    S("c", "t3", 20),
    S("d", "t3", -5),
    S("legacy1", null, 2, { code: "M1" }), // legacy shape with an existing takeoff's code joins it
    S("legacy2", null, 7, { code: "M4", description: "Old", unit: "m2" }),
    S("legacy3", null, 1, { code: "m4" }),
    S("ghost", "deleted", 100),
  ];

  it("builds the { code: value } map formulas resolve against", () => {
    expect(takeoffValueMap(takeoffs, shapes)).toEqual({ M1: 9, M2: 10, M4: 8, M10: 15 });
  });

  it("lists one row per code, sorted by code number", () => {
    const rows = takeoffSummaries(takeoffs, shapes);
    expect(rows.map((r) => r.code)).toEqual(["M1", "M2", "M4", "M10"]);
    expect(rows.find((r) => r.code === "M4")).toMatchObject({ description: "Old", unit: "m2", value: 8 });
  });

  it("feeds costing formulas: a multi-shape takeoff drives the item quantity", () => {
    const r = calculate({
      items: [
        { id: "c", parentId: null, kind: "category", sortOrder: 0, quantityExpr: null, quantity: 0, unitCost: 0, allowanceType: "none", costType: "Material", markupPercent: null, taxable: true },
        { id: "i", parentId: "c", kind: "item", sortOrder: 0, quantityExpr: "[M1]*2 + [M10]", quantity: 0, unitCost: 10, allowanceType: "none", costType: "Material", markupPercent: null, taxable: true },
      ],
      markupLines: [],
      taxRate: 0,
      measurements: takeoffValueMap(takeoffs, shapes),
      pcpsRedistribution: "within_category",
      rounding: "none",
    });
    expect(r.items.i.quantity).toBe(33);
    expect(r.items.i.total).toBe(330);
  });
});

describe("shapeUnitCheck", () => {
  const t = { code: "M3", unit: "m2", manualExpr: null };
  it("accepts a shape with the takeoff's unit", () => {
    expect(shapeUnitCheck(t, "m2", 4)).toEqual({ ok: true, adoptUnit: false });
  });
  it("rejects a different unit when the takeoff already has shapes", () => {
    const r = shapeUnitCheck(t, "m", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/M3 is measured in square metres/);
  });
  it("lets an empty drawn takeoff adopt the shape's unit", () => {
    expect(shapeUnitCheck(t, "ea", 0)).toEqual({ ok: true, adoptUnit: true });
  });
  it("refuses shapes on a manual takeoff", () => {
    expect(shapeUnitCheck({ ...t, manualExpr: "12" }, "m2", 0).ok).toBe(false);
  });
});

describe("planLegacyMigration", () => {
  let n = 0;
  const gen = () => `new${++n}`;
  const legacy = (id: string, code: string, extra: object = {}) => ({ id, takeoffId: null, code, description: `d ${id}`, unit: "m", colour: "#111111", ...extra });

  it("creates one takeoff per legacy code and attaches every shape, preserving codes", () => {
    n = 0;
    const plan = planLegacyMigration(
      [{ id: "t5", code: "M5", sortOrder: 3 }],
      [legacy("a", "M2", { unit: "m2", colour: "#dc2626" }), legacy("b", "M1"), legacy("c", "M2"), legacy("d", "m5"), { ...legacy("e", "M9"), takeoffId: "t9" }],
      gen,
    );
    expect(plan.create).toEqual([
      { id: "new1", code: "M1", description: "d b", unit: "m", colour: "#111111", sortOrder: 4 },
      { id: "new2", code: "M2", description: "d a", unit: "m2", colour: "#dc2626", sortOrder: 5 },
    ]);
    expect(plan.attach).toEqual([
      { measurementId: "b", takeoffId: "new1", code: "M1" },
      { measurementId: "a", takeoffId: "new2", code: "M2" },
      { measurementId: "c", takeoffId: "new2", code: "M2" },
      { measurementId: "d", takeoffId: "t5", code: "M5" },
    ]);
  });

  it("is a no-op when nothing is legacy (idempotent)", () => {
    expect(planLegacyMigration([{ id: "t1", code: "M1", sortOrder: 0 }], [{ ...legacy("a", "M1"), takeoffId: "t1" }])).toEqual({ create: [], attach: [] });
  });
});

describe("list helpers", () => {
  it("moveInList swaps neighbours and ignores moves past the ends", () => {
    expect(moveInList(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveInList(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveInList(["a", "b"], "x", "up")).toEqual(["a", "b"]);
  });
  it("matchesTakeoff searches code and description, case-insensitively", () => {
    const t = { code: "M12", description: "Carpenter frame – labour" };
    expect(matchesTakeoff(t, "")).toBe(true);
    expect(matchesTakeoff(t, "m12")).toBe(true);
    expect(matchesTakeoff(t, "FRAME")).toBe(true);
    expect(matchesTakeoff(t, "roof")).toBe(false);
  });
});
