import { describe, it, expect } from "vitest";
import {
  nextLeadNumber,
  isFollowUpOverdue,
  weightedValue,
  stageTotals,
  pipelineSummary,
  initials,
  parseLeadForm,
  rawLeadValues,
  toFormValues,
  leadsHref,
  defaultMarkupLines,
  LEAD_STAGES,
} from "./lib";

describe("nextLeadNumber", () => {
  it("starts at L1000", () => {
    expect(nextLeadNumber([])).toBe("L1000");
    expect(nextLeadNumber([null, undefined, ""])).toBe("L1000");
  });
  it("uses max existing numeric suffix", () => {
    expect(nextLeadNumber(["L1000"])).toBe("L1001");
    expect(nextLeadNumber(["L1003", "L1000", "L1001"])).toBe("L1004");
    expect(nextLeadNumber(["L999", "L1200"])).toBe("L1201");
  });
  it("ignores non-matching numbers", () => {
    expect(nextLeadNumber(["Q5000", "L12A", "lead-7"])).toBe("L1000");
    expect(nextLeadNumber(["L5"])).toBe("L1000");
  });
});

describe("isFollowUpOverdue", () => {
  it("is overdue only when before today and open", () => {
    expect(isFollowUpOverdue("2026-01-01", "New", "2026-01-02")).toBe(true);
    expect(isFollowUpOverdue("2026-01-02", "New", "2026-01-02")).toBe(false);
    expect(isFollowUpOverdue("2026-01-03", "New", "2026-01-02")).toBe(false);
    expect(isFollowUpOverdue("2026-01-01", "Won", "2026-01-02")).toBe(false);
    expect(isFollowUpOverdue("2026-01-01", "Lost", "2026-01-02")).toBe(false);
    expect(isFollowUpOverdue(null, "New", "2026-01-02")).toBe(false);
  });
});

describe("totals", () => {
  const leads = [
    { stage: "New", estimatedValue: 10000, probability: 50, followUpDate: "2026-01-01" },
    { stage: "New", estimatedValue: null, probability: null, followUpDate: null },
    { stage: "Quoting", estimatedValue: 40000, probability: 25, followUpDate: "2027-01-01" },
    { stage: "Won", estimatedValue: 5000, probability: 100, followUpDate: "2020-01-01" },
    { stage: "Lost", estimatedValue: 7000, probability: 10, followUpDate: "2020-01-01" },
    { stage: "Lost", estimatedValue: 1000, probability: 10, followUpDate: null },
  ];
  it("weightedValue", () => {
    expect(weightedValue(10000, 50)).toBe(5000);
    expect(weightedValue(null, 50)).toBe(0);
    expect(weightedValue(100, null)).toBe(0);
  });
  it("stageTotals covers every stage in order", () => {
    const t = stageTotals(leads);
    expect(t.map((x) => x.stage)).toEqual([...LEAD_STAGES]);
    expect(t[0]).toEqual({ stage: "New", count: 2, value: 10000, weighted: 5000 });
    expect(t.find((x) => x.stage === "Quoting")!.weighted).toBe(10000);
    expect(t.find((x) => x.stage === "Site visit")!.count).toBe(0);
  });
  it("pipelineSummary", () => {
    const s = pipelineSummary(leads, "2026-06-01");
    expect(s).toEqual({ openCount: 3, openValue: 50000, weighted: 15000, overdue: 1, winRate: 33 });
    expect(pipelineSummary([], "2026-06-01").winRate).toBeNull();
  });
});

describe("initials", () => {
  it("handles names", () => {
    expect(initials("Sam Rivers")).toBe("SR");
    expect(initials("owner")).toBe("O");
    expect(initials("Mary Jane Watson")).toBe("MW");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
  });
});

describe("parseLeadForm", () => {
  const fd = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  it("parses a valid form, normalising blanks and numbers", () => {
    const r = parseLeadForm(rawLeadValues(fd({ title: "  Kitchen reno ", estimatedValue: "$45,000", probability: "33.6", email: "a@b.com", followUpDate: "2026-12-01", stage: "Contacted", lostReason: "ignored" })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.title).toBe("Kitchen reno");
    expect(r.data.estimatedValue).toBe(45000);
    expect(r.data.probability).toBe(34);
    expect(r.data.contactName).toBeNull();
    expect(r.data.followUpDate).toBe("2026-12-01");
    expect(r.data.stage).toBe("Contacted");
    expect(r.data.lostReason).toBeNull();
  });
  it("defaults stage to New", () => {
    const r = parseLeadForm(rawLeadValues(fd({ title: "x" })));
    expect(r.ok && r.data.stage).toBe("New");
  });
  it("keeps lost reason for Lost leads", () => {
    const r = parseLeadForm(rawLeadValues(fd({ title: "x", stage: "Lost", lostReason: "Price" })));
    expect(r.ok && r.data.lostReason).toBe("Price");
  });
  it("reports field errors", () => {
    const r = parseLeadForm(rawLeadValues(fd({ title: " ", email: "nope", probability: "150", estimatedValue: "abc", followUpDate: "2026-13-45", stage: "Bogus" })));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["email", "estimatedValue", "followUpDate", "probability", "stage", "title"]);
    expect(r.errors.title).toMatch(/title/i);
    expect(r.errors.probability).toMatch(/100/);
  });
  it("rejects negative value", () => {
    const r = parseLeadForm(rawLeadValues(fd({ title: "x", estimatedValue: "-5" })));
    expect(r.ok).toBe(false);
  });
});

describe("misc", () => {
  it("toFormValues stringifies", () => {
    const v = toFormValues({ title: "A", estimatedValue: 1200, probability: null });
    expect(v.title).toBe("A");
    expect(v.estimatedValue).toBe("1200");
    expect(v.probability).toBe("");
    expect(v.stage).toBe("New");
  });
  it("leadsHref drops empty params", () => {
    expect(leadsHref({})).toBe("/leads");
    expect(leadsHref({ view: "board", q: "", stage: "New" })).toBe("/leads?view=board&stage=New");
    expect(leadsHref({ q: "a b" })).toBe("/leads?q=a+b");
  });
  it("defaultMarkupLines", () => {
    expect(JSON.parse(defaultMarkupLines(18))).toEqual([{ name: "Markup", percent: 18 }]);
    expect(JSON.parse(defaultMarkupLines(null))).toEqual([{ name: "Markup", percent: 0 }]);
  });
});
