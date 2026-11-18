import { describe, it, expect } from "vitest";
import {
  remapTree,
  copyEstimateGraph,
  buildSnapshot,
  parseSnapshot,
  restorePlan,
  chunk,
  type ItemRow,
  type SpecRow,
  type PlanRow,
  type MeasurementRow,
  type TakeoffRow,
  type QuoteOptionsRow,
  type EstimateRow,
  type TaskRow,
  remapTasks,
} from "./estimate-copy";

function seqGen(prefix = "n") {
  let i = 0;
  return () => `${prefix}${++i}`;
}

const ts = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

function item(id: string, parentId: string | null, extra: Partial<ItemRow> = {}): ItemRow {
  return {
    id, estimateId: "src", parentId, kind: parentId ? "item" : "category", sortOrder: 0, description: id, itemCode: null,
    costType: "Material", allowanceType: "none", uom: null, quantityExpr: null, quantity: 1, unitCost: 10, markupPercent: null,
    taxable: true, supplierId: null, catalogueItemId: null, measurementId: null, notes: null, showInSpecification: false,
    hiddenOnQuote: false, status: "Incomplete", total: 10, totalIncMarkup: 12, ...extra,
  };
}
function spec(id: string, parentId: string | null): SpecRow {
  return { id, estimateId: "src", parentId, sortOrder: 0, heading: `H ${id}`, body: null, categoryItemId: null, ...ts };
}
function plan(id: string): PlanRow {
  return { id, estimateId: "src", label: id, description: null, sortOrder: 0, imageDataUrl: "data:x", imageWidth: 10, imageHeight: 10, scaleX: 1, scaleY: 1, scaleUnit: "mm", sourceDpi: null, ...ts };
}
function meas(id: string, planId: string, takeoffId: string | null = null): MeasurementRow {
  return { id, estimateId: "src", planId, takeoffId, code: id.toUpperCase(), description: id, shape: "line", points: "[]", colour: "#000", unit: "m", pitchDegrees: 0, depthMm: 0, heightMm: 0, isNegative: false, value: 5, ...ts };
}

function takeoff(id: string, code: string, extra: Partial<TakeoffRow> = {}): TakeoffRow {
  return { id, estimateId: "src", code, description: `T ${code}`, unit: "m", colour: "#123456", sortOrder: 0, hidden: false, manualExpr: null, value: 0, ...ts, ...extra };
}

function task(id: string, deps: string[] = [], extra: Partial<TaskRow> = {}): TaskRow {
  return { id, estimateId: "src", name: `T ${id}`, startDate: "2026-11-16", durationDays: 2, dependsOn: JSON.stringify(deps), assigneeContactId: null, colour: null, notes: null, sortOrder: 0, ...ts, ...extra };
}

describe("remapTree", () => {
  it("gives new ids and preserves parent/child links", () => {
    const rows = [item("c1", null), item("i1", "c1"), item("s1", "i1"), item("s2", "i1"), item("c2", null), item("i2", "c2")];
    const { rows: out, idMap } = remapTree(rows, seqGen());
    expect(out.map((r) => r.id)).toEqual(["n1", "n2", "n3", "n4", "n5", "n6"]);
    expect(out.find((r) => r.description === "i1")!.parentId).toBe(idMap.get("c1"));
    expect(out.find((r) => r.description === "s2")!.parentId).toBe(idMap.get("i1"));
    expect(out.find((r) => r.description === "c2")!.parentId).toBeNull();
    // no old ids leak through
    for (const r of out) expect(["c1", "i1", "s1", "s2", "c2", "i2"]).not.toContain(r.parentId);
  });

  it("handles children listed before their parent and orphans", () => {
    const { rows: out, idMap } = remapTree([item("child", "parent"), item("parent", null), item("orphan", "missing")], seqGen());
    expect(out[0].parentId).toBe(idMap.get("parent"));
    expect(out[2].parentId).toBeNull();
  });

  it("does not mutate the input", () => {
    const rows = [item("a", null), item("b", "a")];
    remapTree(rows, seqGen());
    expect(rows[1].parentId).toBe("a");
    expect(rows[0].id).toBe("a");
  });
});

describe("copyEstimateGraph", () => {
  const qo = {
    id: "qo1", estimateId: "src", title: "Quote", validDays: 30, coverLetter: "Hi", termsAndConditions: null, shareToken: "tok",
    acceptanceSignatureName: "Pat", acceptanceSignedAt: "2026-01-02", ...ts,
  } as unknown as QuoteOptionsRow;

  const graph = {
    items: [item("c1", null), item("i1", "c1", { measurementId: "m1", quantityExpr: "[M1]*[W10]" }), item("s1", "i1"), item("i2", "c1", { measurementId: "gone" })],
    specifications: [spec("h1", null), spec("h2", "h1")],
    plans: [plan("p1")],
    takeoffs: [],
    measurements: [meas("m1", "p1"), meas("m9", "nope")],
    quoteOptions: qo,
    tasks: [task("t1"), task("t2", ["t1"]), task("t3", ["t1", "t2", "gone"], { assigneeContactId: "c9", notes: "N" })],
  };

  it("re-points every row at the target estimate with fresh ids", () => {
    const out = copyEstimateGraph(graph, "dst", seqGen());
    for (const list of [out.items, out.specifications, out.plans, out.measurements]) {
      for (const r of list) {
        expect(r.estimateId).toBe("dst");
        expect(["c1", "i1", "s1", "i2", "h1", "h2", "p1", "m1", "m9"]).not.toContain(r.id);
      }
    }
    expect(out.items).toHaveLength(4);
    expect(out.specifications).toHaveLength(2);
  });

  it("preserves item and specification trees", () => {
    const out = copyEstimateGraph(graph, "dst", seqGen());
    const byDesc = Object.fromEntries(out.items.map((i) => [i.description, i]));
    expect(byDesc.i1.parentId).toBe(byDesc.c1.id);
    expect(byDesc.s1.parentId).toBe(byDesc.i1.id);
    expect(byDesc.c1.parentId).toBeNull();
    const [h1, h2] = out.specifications;
    expect(h2.parentId).toBe(h1.id);
  });

  it("links measurements to the copied plan and items to the copied measurement", () => {
    const out = copyEstimateGraph(graph, "dst", seqGen());
    expect(out.plans).toHaveLength(1);
    expect(out.measurements).toHaveLength(1); // m9's plan is not part of the estimate
    expect(out.measurements[0].planId).toBe(out.plans[0].id);
    expect(out.measurements[0].code).toBe("M1");
    const i1 = out.items.find((i) => i.description === "i1")!;
    expect(i1.measurementId).toBe(out.measurements[0].id);
    expect(i1.quantityExpr).toBe("[M1]*[W10]");
    expect(out.items.find((i) => i.description === "i2")!.measurementId).toBeNull();
  });

  it("copies quote options without share token, signature or timestamps", () => {
    const out = copyEstimateGraph(graph, "dst", seqGen());
    expect(out.quoteOptions).toMatchObject({ estimateId: "dst", title: "Quote", coverLetter: "Hi", shareToken: null, acceptanceSignatureName: null, acceptanceSignedAt: null });
    expect(out.quoteOptions!.id).not.toBe("qo1");
    expect(out.quoteOptions).not.toHaveProperty("createdAt");
    expect(out.plans[0]).not.toHaveProperty("updatedAt");
  });

  it("copies schedule tasks with fresh ids and remapped dependencies", () => {
    const out = copyEstimateGraph(graph, "dst", seqGen());
    expect(out.tasks).toHaveLength(3);
    const byName = Object.fromEntries(out.tasks.map((t) => [t.name, t]));
    for (const t of out.tasks) {
      expect(t.estimateId).toBe("dst");
      expect(["t1", "t2", "t3"]).not.toContain(t.id);
      expect(t).not.toHaveProperty("createdAt");
    }
    expect(JSON.parse(byName["T t2"].dependsOn)).toEqual([byName["T t1"].id]);
    // link to a task outside the estimate is dropped
    expect(JSON.parse(byName["T t3"].dependsOn)).toEqual([byName["T t1"].id, byName["T t2"].id]);
    expect(byName["T t3"]).toMatchObject({ assigneeContactId: "c9", notes: "N", startDate: "2026-11-16", durationDays: 2 });
    // source untouched
    expect(graph.tasks[1].dependsOn).toBe('["t1"]');
  });

  it("works for an empty estimate", () => {
    const out = copyEstimateGraph({ items: [], specifications: [], plans: [], takeoffs: [], measurements: [], quoteOptions: null, tasks: [] }, "dst");
    expect(out).toEqual({ items: [], specifications: [], plans: [], takeoffs: [], measurements: [], quoteOptions: null, tasks: [], specItemDetails: [] });
  });

  it("re-links category sections and per-item spec details to the copied items", () => {
    const out = copyEstimateGraph(
      {
        ...graph,
        specifications: [{ ...spec("h1", null), categoryItemId: "c1" }, { ...spec("h3", null), categoryItemId: "gone" }],
        specItemDetails: [
          { id: "d1", estimateId: "src", estimateItemId: "i1", body: "Detail", imageDataUrl: null, ...ts },
          { id: "d2", estimateId: "src", estimateItemId: "deleted", body: "Orphan", imageDataUrl: null, ...ts },
        ],
      },
      "dst",
      seqGen(),
    );
    const byDesc = Object.fromEntries(out.items.map((i) => [i.description, i]));
    expect(out.specifications.map((s) => s.categoryItemId)).toEqual([byDesc.c1.id, null]);
    expect(out.specItemDetails).toHaveLength(1);
    expect(out.specItemDetails[0]).toMatchObject({ estimateId: "dst", estimateItemId: byDesc.i1.id, body: "Detail" });
    expect(out.specItemDetails[0].id).not.toBe("d1");
  });

  describe("takeoffs", () => {
    const tGraph = {
      items: [
        item("c1", null),
        item("i1", "c1", { measurementId: "t1", quantityExpr: "[M1]" }),
        item("i2", "c1", { measurementId: "t2", quantityExpr: "[M2]*2" }),
        item("i3", "c1", { measurementId: "legacy", quantityExpr: "[M3]" }),
      ],
      specifications: [],
      plans: [plan("p1"), plan("p2")],
      takeoffs: [
        takeoff("t1", "M1", { value: 12, sortOrder: 0, hidden: true, colour: "#dc2626" }),
        takeoff("t2", "M2", { manualExpr: "2*3", value: 6, unit: "ea", sortOrder: 1 }),
      ],
      measurements: [
        meas("s1", "p1", "t1"),
        meas("s2", "p2", "t1"),
        { ...meas("s3", "p1", "t1"), isNegative: true, value: -3 },
        { ...meas("legacy", "p2"), code: "M3" },
        meas("s9", "p1", "deleted-takeoff"),
      ],
      quoteOptions: null,
      tasks: [],
    };

    it("copies takeoffs with fresh ids, same codes and settings", () => {
      const out = copyEstimateGraph(tGraph, "dst", seqGen());
      expect(out.takeoffs).toHaveLength(2);
      const [a, b] = out.takeoffs;
      expect([a.id, b.id]).not.toContain("t1");
      expect(a).toMatchObject({ estimateId: "dst", code: "M1", hidden: true, colour: "#dc2626", value: 12, manualExpr: null });
      expect(b).toMatchObject({ estimateId: "dst", code: "M2", manualExpr: "2*3", unit: "ea", sortOrder: 1 });
      expect(a).not.toHaveProperty("createdAt");
    });

    it("remaps shapes onto the copied takeoffs and plans (across plans, deductions kept)", () => {
      const out = copyEstimateGraph(tGraph, "dst", seqGen());
      const t1 = out.takeoffs.find((t) => t.code === "M1")!;
      const shapes = out.measurements.filter((m) => m.takeoffId === t1.id);
      expect(shapes).toHaveLength(3);
      expect(new Set(shapes.map((s) => s.planId))).toEqual(new Set(out.plans.map((p) => p.id)));
      expect(shapes.find((s) => s.isNegative)!.value).toBe(-3);
      // legacy shape keeps a null takeoffId; shape of a missing takeoff is dropped
      expect(out.measurements).toHaveLength(4);
      expect(out.measurements.find((m) => m.code === "M3")!.takeoffId).toBeNull();
      for (const m of out.measurements) expect(["t1", "t2"]).not.toContain(m.takeoffId);
    });

    it("re-links costing items to the copied takeoff (or legacy shape)", () => {
      const out = copyEstimateGraph(tGraph, "dst", seqGen());
      const byDesc = Object.fromEntries(out.items.map((i) => [i.description, i]));
      expect(byDesc.i1.measurementId).toBe(out.takeoffs.find((t) => t.code === "M1")!.id);
      expect(byDesc.i2.measurementId).toBe(out.takeoffs.find((t) => t.code === "M2")!.id);
      expect(byDesc.i3.measurementId).toBe(out.measurements.find((m) => m.code === "M3")!.id);
      expect(byDesc.i2.quantityExpr).toBe("[M2]*2");
    });
  });
});

describe("snapshots", () => {
  const est = { id: "e1", name: "House", markupLines: '[{"name":"Markup","percent":15}]', taxRateId: "gst", pcpsRedistribution: "none", rounding: "ten", specificationIntro: "Intro", quoteTotal: 100 } as EstimateRow;
  const items = [item("c1", null), item("i1", "c1")].map((i) => ({ ...i, estimateId: "e1" }));
  const specs = [spec("h1", null)].map((s) => ({ ...s, estimateId: "e1" }));

  it("round-trips through JSON", () => {
    const snap = buildSnapshot(est, items, specs, new Date("2026-03-04T05:06:07Z"));
    const parsed = parseSnapshot(JSON.stringify(snap));
    expect(parsed).not.toBeNull();
    expect(parsed!.capturedAt).toBe("2026-03-04T05:06:07.000Z");
    expect(parsed!.items).toHaveLength(2);
    expect(parsed!.estimate.name).toBe("House");
  });

  it("rejects malformed snapshots", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("not json")).toBeNull();
    expect(parseSnapshot("{}")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ format: 1, estimate: {}, items: "x", specifications: [] }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ format: 1, estimate: {}, items: [{ nope: 1 }], specifications: [] }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ format: 99, estimate: {}, items: [], specifications: [] }))).toBeNull();
  });

  it("plans a restore that keeps ids and brings back pricing settings only", () => {
    const snap = buildSnapshot(est, items, specs);
    const plan = restorePlan(snap, "e1");
    expect(plan.items.map((i) => i.id)).toEqual(["c1", "i1"]);
    expect(plan.items[1].parentId).toBe("c1");
    expect(plan.specifications[0]).not.toHaveProperty("createdAt");
    expect(plan.estimatePatch).toEqual({ markupLines: est.markupLines, taxRateId: "gst", pcpsRedistribution: "none", rounding: "ten", specificationIntro: "Intro" });
    expect(plan.estimatePatch).not.toHaveProperty("name");
  });
});

describe("snapshots with a schedule", () => {
  const est = { id: "e1", name: "House", markupLines: "[]", taxRateId: null, pcpsRedistribution: "none", rounding: "none", specificationIntro: null, quoteTotal: 1 } as unknown as EstimateRow;
  const tasks = [task("t1"), task("t2", ["t1"])].map((t) => ({ ...t, estimateId: "e1" }));

  it("captures and restores tasks keeping ids and links", () => {
    const snap = buildSnapshot(est, [], [], new Date(), tasks);
    const parsed = parseSnapshot(JSON.stringify(snap))!;
    expect(parsed.tasks).toHaveLength(2);
    const plan = restorePlan(parsed, "e1");
    expect(plan.tasks!.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(plan.tasks![1].dependsOn).toBe('["t1"]');
    expect(plan.tasks![0]).not.toHaveProperty("updatedAt");
  });

  it("leaves the schedule alone for older snapshots without tasks", () => {
    const snap = buildSnapshot(est, [], []);
    expect(snap).not.toHaveProperty("tasks");
    expect(restorePlan(parseSnapshot(JSON.stringify(snap))!, "e1").tasks).toBeNull();
  });

  it("rejects malformed task lists", () => {
    expect(parseSnapshot(JSON.stringify({ format: 1, estimate: {}, items: [], specifications: [], tasks: "x" }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ format: 1, estimate: {}, items: [], specifications: [], tasks: [{ id: "a" }] }))).toBeNull();
  });
});

describe("remapTasks", () => {
  it("remaps JSON dependsOn and drops self / dangling links", () => {
    const out = remapTasks([task("a", ["a"]), task("b", ["a", "zzz", "a"])], seqGen("x"));
    expect(out.map((t) => t.id)).toEqual(["x1", "x2"]);
    expect(out[0].dependsOn).toBe("[]");
    expect(out[1].dependsOn).toBe('["x1"]');
  });

  it("tolerates corrupt dependsOn JSON", () => {
    const out = remapTasks([task("a", [], { dependsOn: "not json" })], seqGen());
    expect(out[0].dependsOn).toBe("[]");
  });
});

describe("chunk", () => {
  it("splits evenly and keeps the remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
