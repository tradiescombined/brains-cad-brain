import { describe, it, expect } from "vitest";
import { filterEstimates, parseSort, sortRows, statusPatch, isIsoDate, isEmail, nextTemplateNumber, str, matchesSearch, type ListRow } from "./logic";

const row = (o: Partial<ListRow>): ListRow => ({
  id: o.number ?? "x", number: "Q1", name: "Job", status: "Draft", buildingType: null, clientName: null, datePrepared: "2026-01-01", createdAt: "2026-01-01T00:00:00Z", quoteTotal: 0, ...o,
});

const rows = [
  row({ number: "Q1002", name: "Deck rebuild", status: "Sent", clientName: "Ana Ng", buildingType: "Deck", datePrepared: "2026-03-01", quoteTotal: 18000 }),
  row({ number: "Q999", name: "Bathroom", status: "Draft", clientName: "Bo Li", buildingType: "Bathroom", datePrepared: "2026-01-10", quoteTotal: 9000 }),
  row({ number: "Q1010", name: "Kitchen refit", status: "Accepted", clientName: "Ana Ng", buildingType: "Kitchen", datePrepared: "2026-02-15", quoteTotal: 30500.5 }),
  row({ number: "Q1003", name: "Fence", status: "Draft", clientName: null, datePrepared: null, createdAt: "2026-04-01T00:00:00Z", quoteTotal: 2500 }),
];
const statuses = ["Draft", "In Progress", "Sent", "Accepted"];

describe("filterEstimates", () => {
  it("counts by status after search and totals the listed rows", () => {
    const r = filterEstimates(rows, { statuses });
    expect(r.allCount).toBe(4);
    expect(r.counts).toEqual([{ name: "Draft", count: 2 }, { name: "In Progress", count: 0 }, { name: "Sent", count: 1 }, { name: "Accepted", count: 1 }]);
    expect(r.total).toBeCloseTo(60000.5);
  });

  it("filters by status and search together", () => {
    const r = filterEstimates(rows, { statuses, q: "ana", status: "Sent" });
    expect(r.rows.map((x) => x.number)).toEqual(["Q1002"]);
    expect(r.counts.find((c) => c.name === "Accepted")!.count).toBe(1);
    expect(r.allCount).toBe(2);
    expect(r.total).toBe(18000);
  });

  it("ignores unknown statuses", () => {
    expect(filterEstimates(rows, { statuses, status: "Bogus" }).rows).toHaveLength(4);
  });

  it("keeps a status that only exists on rows (legacy value)", () => {
    const r = filterEstimates([...rows, row({ number: "Q5", status: "Legacy" })], { statuses, status: "Legacy" });
    expect(r.rows.map((x) => x.number)).toEqual(["Q5"]);
  });

  it("sorts by date desc by default, falling back to created date", () => {
    const r = filterEstimates(rows, { statuses });
    expect(r.rows.map((x) => x.number)).toEqual(["Q1003", "Q1002", "Q1010", "Q999"]);
  });
});

describe("sorting", () => {
  it("sorts numbers naturally", () => {
    expect(sortRows(rows, "number", "asc").map((r) => r.number)).toEqual(["Q999", "Q1002", "Q1003", "Q1010"]);
  });
  it("sorts totals numerically", () => {
    expect(sortRows(rows, "total", "desc").map((r) => r.quoteTotal)).toEqual([30500.5, 18000, 9000, 2500]);
  });
  it("parses sort params with sensible defaults", () => {
    expect(parseSort(undefined, undefined)).toEqual({ key: "date", dir: "desc" });
    expect(parseSort("name", undefined)).toEqual({ key: "name", dir: "asc" });
    expect(parseSort("hack", "sideways")).toEqual({ key: "date", dir: "desc" });
    expect(parseSort("total", "asc")).toEqual({ key: "total", dir: "asc" });
  });
});

describe("search", () => {
  it("matches every term across fields", () => {
    expect(matchesSearch(rows[0], "deck ana")).toBe(true);
    expect(matchesSearch(rows[0], "deck bo")).toBe(false);
    expect(matchesSearch(rows[0], "q1002")).toBe(true);
    expect(matchesSearch(rows[0], "   ")).toBe(true);
  });
});

describe("statusPatch", () => {
  const now = new Date("2026-05-05T00:00:00Z");
  it("stamps acceptedAt when entering the accepted status", () => {
    expect(statusPatch("Accepted", "Accepted", null, now)).toEqual({ status: "Accepted", acceptedAt: now.toISOString() });
  });
  it("keeps an existing acceptance date", () => {
    expect(statusPatch("Accepted", "Accepted", "2026-01-01T00:00:00Z", now).acceptedAt).toBe("2026-01-01T00:00:00Z");
  });
  it("clears acceptedAt when moving away", () => {
    expect(statusPatch("Sent", "Accepted", "2026-01-01", now)).toEqual({ status: "Sent", acceptedAt: null });
  });
  it("works without an accepted status configured", () => {
    expect(statusPatch("Accepted", null, null, now).acceptedAt).toBeNull();
  });
});

describe("validators", () => {
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("28/02/2026")).toBe(false);
  });
  it("validates emails", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });
  it("allocates template numbers", () => {
    expect(nextTemplateNumber([])).toBe("TPL1");
    expect(nextTemplateNumber(["TPL2", "Q1000", "TPL10"])).toBe("TPL11");
  });
  it("reads trimmed form strings", () => {
    const fd = new FormData();
    fd.set("a", "  hi  ");
    fd.set("b", "   ");
    expect(str(fd, "a")).toBe("hi");
    expect(str(fd, "b")).toBeNull();
    expect(str(fd, "c")).toBeNull();
    expect(str(fd, "a", 1)).toBe("h");
  });
});
