import { describe, it, expect } from "vitest";
import {
  distance, polylineLength, polygonArea, rectangleArea, rectCorners, ellipseFromCorners, ellipseArea,
  pxToM, pxAreaToM2, baseQuantity, measurementUnit, pitchFactor, applyAdjustments, computeMeasurement,
  snapOrthogonal, calibrateScale, parseRatio, ratioToScale, scaleToRatio, nextMeasurementCode,
  formatQuantity, unitLabel, centroid, totalsByDescription, fitView, zoomAt, screenToImage, imageToScreen,
  parsePoints, isValidShape, shapeKind, minPoints, maxPoints, round3, outline, clampZoom, MAX_ZOOM, MIN_ZOOM,
  type Pt,
} from "./geometry";

const S10 = { x: 10, y: 10 }; // 10 mm per px

describe("basic geometry", () => {
  it("distance and polyline length", () => {
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(distance([0, 0], [3, 4], { x: 2, y: 1 })).toBeCloseTo(Math.hypot(6, 4));
    expect(polylineLength([[0, 0], [3, 4], [3, 10]])).toBe(11);
    expect(polylineLength([[0, 0], [10, 0], [10, 10]], true)).toBeCloseTo(20 + Math.SQRT2 * 10);
    expect(polylineLength([[0, 0]])).toBe(0);
    expect(polylineLength([])).toBe(0);
  });

  it("shoelace area is orientation independent", () => {
    const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([...sq].reverse())).toBe(100);
    // L-shape: 10x10 minus 5x5 corner
    expect(polygonArea([[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]])).toBe(75);
    expect(polygonArea([[0, 0], [1, 1]])).toBe(0);
    // triangle
    expect(polygonArea([[0, 0], [4, 0], [0, 3]])).toBe(6);
  });

  it("rectangles and ellipses from corners", () => {
    expect(rectangleArea([10, 10], [0, 5])).toBe(50);
    expect(rectCorners([0, 0], [2, 3])).toEqual([[0, 0], [2, 0], [2, 3], [0, 3]]);
    expect(outline("rectangle", [[0, 0], [2, 3]])).toHaveLength(4);
    expect(outline("polygon", [[0, 0], [2, 3], [1, 1]])).toHaveLength(3);
    expect(ellipseFromCorners([0, 0], [20, 10])).toEqual({ cx: 10, cy: 5, rx: 10, ry: 5 });
    expect(ellipseArea(10, 5)).toBeCloseTo(Math.PI * 50);
    expect(ellipseArea(-10, 5)).toBeCloseTo(Math.PI * 50);
  });

  it("centroid", () => {
    expect(centroid([[0, 0], [10, 0], [10, 10], [0, 10]])).toEqual([5, 5]);
    expect(centroid([])).toEqual([0, 0]);
  });
});

describe("unit conversion", () => {
  it("px to metres and square metres", () => {
    expect(pxToM(100, 10)).toBe(1);
    expect(pxAreaToM2(100 * 100, S10)).toBe(1);
    expect(pxAreaToM2(100, { x: 20, y: 5 })).toBeCloseTo(0.01);
  });

  it("baseQuantity per shape", () => {
    expect(baseQuantity("line", [[0, 0], [300, 400]], S10)).toBeCloseTo(5);
    expect(baseQuantity("polyline", [[0, 0], [100, 0], [100, 100]], S10)).toBeCloseTo(2);
    expect(baseQuantity("rectangle", [[0, 0], [200, 300]], S10)).toBeCloseTo(6);
    expect(baseQuantity("polygon", [[0, 0], [200, 0], [200, 300], [0, 300]], S10)).toBeCloseTo(6);
    expect(baseQuantity("ellipse", [[0, 0], [200, 100]], S10)).toBeCloseTo(Math.PI * 1 * 0.5);
    expect(baseQuantity("point", [[1, 1], [2, 2], [3, 3]], null)).toBe(3);
  });

  it("returns 0 for scaled shapes without a scale", () => {
    expect(baseQuantity("line", [[0, 0], [10, 0]], null)).toBe(0);
    expect(baseQuantity("polygon", [[0, 0], [10, 0], [10, 10]], { x: 0, y: 0 })).toBe(0);
  });

  it("handles anisotropic scale", () => {
    expect(baseQuantity("line", [[0, 0], [100, 0]], { x: 10, y: 20 })).toBeCloseTo(1);
    expect(baseQuantity("line", [[0, 0], [0, 100]], { x: 10, y: 20 })).toBeCloseTo(2);
  });
});

describe("adjustments", () => {
  it("units by shape and adjustments", () => {
    expect(measurementUnit("line")).toBe("m");
    expect(measurementUnit("polyline", { heightMm: 2400 })).toBe("m2");
    expect(measurementUnit("rectangle")).toBe("m2");
    expect(measurementUnit("polygon", { depthMm: 100 })).toBe("m3");
    expect(measurementUnit("ellipse", { heightMm: 2400 })).toBe("m2");
    expect(measurementUnit("point", { depthMm: 100 })).toBe("ea");
    expect(measurementUnit("line", { depthMm: 100 })).toBe("m");
  });

  it("pitch factor", () => {
    expect(pitchFactor(0)).toBe(1);
    expect(pitchFactor(60)).toBeCloseTo(2);
    expect(pitchFactor(-5)).toBe(1);
    expect(Number.isFinite(pitchFactor(90))).toBe(true);
    expect(pitchFactor(undefined)).toBe(1);
  });

  it("applies pitch, height, depth and negative", () => {
    expect(applyAdjustments(10, "area", { pitchDegrees: 60 })).toBeCloseTo(20);
    expect(applyAdjustments(10, "length", { heightMm: 2400 })).toBeCloseTo(24);
    expect(applyAdjustments(10, "area", { depthMm: 100 })).toBeCloseTo(1);
    expect(applyAdjustments(10, "area", { depthMm: 100, pitchDegrees: 60, isNegative: true })).toBeCloseTo(-2);
    expect(applyAdjustments(5, "count", { pitchDegrees: 60, isNegative: true })).toBe(-5);
    // depth is ignored for lengths, height ignored for areas
    expect(applyAdjustments(10, "length", { depthMm: 100 })).toBe(10);
    expect(applyAdjustments(10, "area", { heightMm: 2400 })).toBe(10);
  });

  it("computeMeasurement end to end", () => {
    // 10m x 6m slab, 100mm thick -> 6 m3
    const slab = computeMeasurement({ shape: "rectangle", points: [[0, 0], [1000, 600]], scale: S10, depthMm: 100 });
    expect(slab).toMatchObject({ value: 6, unit: "m3", needsScale: false });
    expect(slab.base).toBeCloseTo(60);
    // 12m wall run x 2.7m high -> 32.4 m2
    const wall = computeMeasurement({ shape: "polyline", points: [[0, 0], [800, 0], [800, 400]], scale: S10, heightMm: 2700 });
    expect(wall.value).toBe(32.4);
    expect(wall.unit).toBe("m2");
    // deducted window 1.2 x 1.5
    const win = computeMeasurement({ shape: "rectangle", points: [[0, 0], [120, 150]], scale: S10, isNegative: true });
    expect(win.value).toBe(-1.8);
    // counts need no scale
    const pts = computeMeasurement({ shape: "point", points: [[1, 1], [5, 5]], scale: null });
    expect(pts).toMatchObject({ value: 2, unit: "ea", needsScale: false });
    // unscaled length
    expect(computeMeasurement({ shape: "line", points: [[0, 0], [5, 0]], scale: null })).toMatchObject({ value: 0, needsScale: true });
    // rounding to 3 dp
    expect(computeMeasurement({ shape: "line", points: [[0, 0], [1, 0]], scale: { x: 1.23456, y: 1.23456 } }).value).toBe(0.001);
  });

  it("round3 normalises negative zero", () => {
    expect(Object.is(round3(-0.0001), 0)).toBe(true);
    expect(round3(1.23456)).toBe(1.235);
  });
});

describe("shape validation", () => {
  it("kinds and point limits", () => {
    expect(shapeKind("line")).toBe("length");
    expect(shapeKind("ellipse")).toBe("area");
    expect(shapeKind("point")).toBe("count");
    expect(minPoints("polygon")).toBe(3);
    expect(minPoints("point")).toBe(1);
    expect(maxPoints("line")).toBe(2);
    expect(maxPoints("polyline")).toBe(Infinity);
  });

  it("isValidShape", () => {
    expect(isValidShape("line", [[0, 0], [1, 1]])).toBe(true);
    expect(isValidShape("line", [[0, 0], [0, 0]])).toBe(false);
    expect(isValidShape("line", [[0, 0], [1, 1], [2, 2]])).toBe(false);
    expect(isValidShape("polygon", [[0, 0], [1, 1]])).toBe(false);
    expect(isValidShape("polygon", [[0, 0], [1, 1], [0, 2]])).toBe(true);
    expect(isValidShape("rectangle", [[0, 0], [5, 0]])).toBe(false);
    expect(isValidShape("ellipse", [[0, 0], [5, 5]])).toBe(true);
    expect(isValidShape("point", [])).toBe(false);
    expect(isValidShape("polyline", [[0, 0], [NaN, 1]])).toBe(false);
  });
});

describe("scale", () => {
  it("snap orthogonal", () => {
    expect(snapOrthogonal([0, 0], [10, 3])).toEqual([10, 0]);
    expect(snapOrthogonal([0, 0], [3, -10])).toEqual([0, -10]);
    expect(snapOrthogonal([5, 5], [10, 10])).toEqual([10, 5]);
  });

  it("two-point calibration", () => {
    expect(calibrateScale([0, 0], [300, 400], 5000, "mm")).toBe(10);
    expect(calibrateScale([0, 0], [300, 400], 5, "m")).toBe(10);
    expect(calibrateScale([0, 0], [0, 0], 5, "m")).toBeNull();
    expect(calibrateScale([0, 0], [1, 0], 0, "m")).toBeNull();
    expect(calibrateScale([0, 0], [1, 0], -3, "mm")).toBeNull();
  });

  it("ratio parsing and conversion", () => {
    expect(parseRatio("1:100")).toBe(100);
    expect(parseRatio(" 1 : 50 ")).toBe(50);
    expect(parseRatio("200")).toBe(200);
    expect(parseRatio("2:100")).toBe(50);
    expect(parseRatio("abc")).toBeNull();
    expect(parseRatio("1:0")).toBeNull();
    expect(parseRatio("")).toBeNull();
    // 1:100 at 254 dpi -> 0.1mm paper per px * 100 = 10 mm/px
    expect(ratioToScale(100, 254)).toBeCloseTo(10);
    expect(ratioToScale(100, 0)).toBeNull();
    expect(scaleToRatio(10, 254)).toBeCloseTo(100);
  });
});

describe("codes and formatting", () => {
  it("next measurement code never duplicates", () => {
    expect(nextMeasurementCode([])).toEqual({ code: "M1", next: 2 });
    expect(nextMeasurementCode(["M1", "M2", "M7"])).toEqual({ code: "M8", next: 9 });
    expect(nextMeasurementCode(["M1"], 5)).toEqual({ code: "M5", next: 6 });
    expect(nextMeasurementCode(["M9", "X3", "m10"], 2)).toEqual({ code: "M11", next: 12 });
    expect(nextMeasurementCode([], 0)).toEqual({ code: "M1", next: 2 });
  });

  it("formats quantities", () => {
    expect(unitLabel("m2")).toBe("m²");
    expect(unitLabel("m3")).toBe("m³");
    expect(unitLabel("xyz")).toBe("xyz");
    expect(formatQuantity(1234.5, "m2")).toBe("1,234.50 m²");
    expect(formatQuantity(3, "ea")).toBe("3 ea");
    expect(formatQuantity(1.2345, "m3")).toBe("1.235 m³");
  });

  it("totals by description", () => {
    const t = totalsByDescription([
      { description: "Wall", unit: "m", value: 10 },
      { description: "wall ", unit: "m", value: 5.5 },
      { description: "Wall", unit: "m2", value: 3 },
      { description: "Floor", unit: "m2", value: 20 },
      { description: "Floor", unit: "m2", value: -2.25 },
      { description: "", unit: "ea", value: 1 },
    ]);
    expect(t).toEqual([
      { description: "(no description)", unit: "ea", total: 1, count: 1 },
      { description: "Floor", unit: "m2", total: 17.75, count: 2 },
      { description: "Wall", unit: "m", total: 15.5, count: 2 },
      { description: "Wall", unit: "m2", total: 3, count: 1 },
    ]);
  });
});

describe("viewer transforms", () => {
  it("fits image in viewport", () => {
    const v = fitView(1000, 500, 548, 548, 24);
    expect(v.zoom).toBeCloseTo(0.5);
    expect(v.x).toBeCloseTo(24);
    expect(v.y).toBeCloseTo((548 - 250) / 2);
    expect(fitView(0, 10, 10, 10)).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it("zoom keeps the anchor point fixed", () => {
    const v = { zoom: 1, x: 10, y: 20 };
    const anchor = screenToImage(v, 200, 150);
    const z = zoomAt(v, 2, 200, 150);
    expect(z.zoom).toBe(2);
    const after = imageToScreen(z, anchor);
    expect(after[0]).toBeCloseTo(200);
    expect(after[1]).toBeCloseTo(150);
  });

  it("zoom clamps", () => {
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(zoomAt({ zoom: MAX_ZOOM, x: 0, y: 0 }, 2, 0, 0).zoom).toBe(MAX_ZOOM);
  });

  it("screen/image round trip", () => {
    const v = { zoom: 0.25, x: -40, y: 12 };
    const p = screenToImage(v, 100, 100);
    expect(imageToScreen(v, p)).toEqual([100, 100]);
  });
});

describe("parsePoints", () => {
  it("parses defensively", () => {
    expect(parsePoints("[[1,2],[3,4]]")).toEqual([[1, 2], [3, 4]]);
    expect(parsePoints("not json")).toEqual([]);
    expect(parsePoints('{"a":1}')).toEqual([]);
    expect(parsePoints('[[1,2],[3],["a",1]]')).toEqual([[1, 2]]);
    expect(parsePoints(null)).toEqual([]);
  });
});
