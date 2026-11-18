import { describe, it, expect } from "vitest";
import { estimateKpis, invoiceKpis, pipelineByStage, statusBreakdown, classifyStatuses, timeAgo, quickStartSteps } from "./metrics";
import { groupReminders, dueLabel, daysBetween, addDaysIso } from "../reminders/group";
import { entityHref, entityTypeLabel } from "../reminders/entities";

const statuses = [
  { name: "Draft", flag: false },
  { name: "Sent", flag: false },
  { name: "Accepted", flag: true },
  { name: "Rejected", flag: false },
];

describe("estimateKpis", () => {
  it("counts open estimates and value, ignoring templates/archived", () => {
    const k = estimateKpis(
      [
        { status: "Draft", quoteTotal: 1000 },
        { status: "Sent", quoteTotal: 2500.5 },
        { status: "Accepted", quoteTotal: 9000 },
        { status: "Draft", quoteTotal: 5000, isTemplate: true },
        { status: "Sent", quoteTotal: 7000, archived: true },
      ],
      statuses,
    );
    expect(k.openCount).toBe(2);
    expect(k.openValue).toBe(3500.5);
    expect(k.accepted).toBe(1);
  });

  it("withholds win rate until 3 estimates are closed", () => {
    const k = estimateKpis([{ status: "Accepted", quoteTotal: 1 }, { status: "Rejected", quoteTotal: 1 }], statuses);
    expect(k.winRate).toBeNull();
    expect(k.closesNeeded).toBe(1);
  });

  it("computes the average win value once the win rate unlocks", () => {
    const locked = estimateKpis([{ status: "Accepted", quoteTotal: 1000 }], statuses);
    expect(locked.averageWinValue).toBeNull();
    const k = estimateKpis(
      [
        { status: "Accepted", quoteTotal: 10000 },
        { status: "Accepted", quoteTotal: 25000.5 },
        { status: "Rejected", quoteTotal: 99999 },
      ],
      statuses,
    );
    expect(k.averageWinValue).toBe(17500.25);
    const none = estimateKpis([{ status: "Rejected", quoteTotal: 1 }, { status: "Rejected", quoteTotal: 1 }, { status: "Rejected", quoteTotal: 1 }], statuses);
    expect(none.winRate).toBe(0);
    expect(none.averageWinValue).toBeNull();
  });

  it("computes win rate = accepted / (accepted + rejected)", () => {
    const k = estimateKpis(
      [
        { status: "Accepted", quoteTotal: 1 },
        { status: "accepted", quoteTotal: 1 },
        { status: "Rejected", quoteTotal: 1 },
        { status: "Draft", quoteTotal: 1 },
      ],
      statuses,
    );
    expect(k.closed).toBe(3);
    expect(k.winRate).toBeCloseTo(2 / 3);
    expect(k.closesNeeded).toBe(0);
  });

  it("uses the accepted flag even when renamed", () => {
    const c = classifyStatuses([{ name: "Won", flag: true }, { name: "Declined", flag: false }]);
    expect(c.isAccepted("Won")).toBe(true);
    expect(c.isAccepted("Accepted")).toBe(false);
    expect(c.isRejected("Declined")).toBe(true);
    expect(c.isRejected("Lost")).toBe(true);
  });

  it("falls back to 'Accepted' when no status is flagged", () => {
    const c = classifyStatuses([{ name: "Accepted", flag: false }]);
    expect(c.isAccepted("Accepted")).toBe(true);
  });
});

describe("invoiceKpis", () => {
  it("sums unpaid balances of issued invoices and flags overdue ones", () => {
    const k = invoiceKpis(
      [
        { status: "Sent", total: 1100, amountPaid: 0, dueDate: "2026-01-10" },
        { status: "Part paid", total: 2200, amountPaid: 200, dueDate: "2026-02-01" },
        { status: "Paid", total: 500, amountPaid: 500, dueDate: "2026-01-01" },
        { status: "Draft", total: 900, amountPaid: 0, dueDate: "2026-01-01" },
        { status: "Void", total: 900, amountPaid: 0, dueDate: "2026-01-01" },
        { status: "Sent", total: 300, amountPaid: 0, dueDate: null },
      ],
      "2026-01-20",
    );
    expect(k.outstanding).toBe(1100 + 2000 + 300);
    expect(k.outstandingCount).toBe(3);
    expect(k.overdue).toBe(1100);
    expect(k.overdueCount).toBe(1);
  });

  it("handles no invoices", () => {
    expect(invoiceKpis([], "2026-01-01")).toEqual({ outstanding: 0, outstandingCount: 0, overdue: 0, overdueCount: 0 });
  });
});

describe("pipelineByStage", () => {
  it("returns every stage in order with counts, values and bar share", () => {
    const p = pipelineByStage([
      { stage: "New", estimatedValue: 10000 },
      { stage: "New", estimatedValue: 5000 },
      { stage: "Quoting", estimatedValue: 30000 },
      { stage: "Won", estimatedValue: null },
      { stage: "Quoting", estimatedValue: 99999, archived: true },
    ]);
    expect(p.map((r) => r.stage)).toEqual(["New", "Contacted", "Site visit", "Quoting", "Quote sent", "Won", "Lost"]);
    expect(p[0]).toMatchObject({ count: 2, value: 15000, share: 0.5 });
    expect(p[3]).toMatchObject({ count: 1, value: 30000, share: 1 });
    expect(p[5]).toMatchObject({ count: 1, value: 0, share: 0 });
  });

  it("is all zero when there are no leads", () => {
    expect(pipelineByStage([]).every((r) => r.count === 0 && r.share === 0)).toBe(true);
  });
});

describe("statusBreakdown", () => {
  it("groups by lookup order, appending unknown statuses", () => {
    const b = statusBreakdown([{ status: "Sent", quoteTotal: 10 }, { status: "Sent", quoteTotal: 5 }, { status: "Weird", quoteTotal: 1 }], ["Draft", "Sent"]);
    expect(b.map((r) => [r.status, r.count, r.value])).toEqual([["Draft", 0, 0], ["Sent", 2, 15], ["Weird", 1, 1]]);
    expect(b[1].share).toBeCloseTo(2 / 3);
  });
});

describe("reminders", () => {
  const rows = [
    { id: "1", title: "Call client", dueDate: "2026-03-01", done: false },
    { id: "2", title: "Order frames", dueDate: "2026-03-05", done: false },
    { id: "3", title: "No date", dueDate: null, done: false },
    { id: "4", title: "Site visit", dueDate: "2026-03-10", done: false },
    { id: "5", title: "Old thing", dueDate: "2026-02-01", done: true, updatedAt: "2026-02-02" },
    { id: "6", title: "Earlier", dueDate: "2026-02-20", done: false },
  ];
  it("groups into overdue / today / upcoming / done with sensible ordering", () => {
    const g = groupReminders(rows, "2026-03-05");
    expect(g.overdue.map((r) => r.id)).toEqual(["6", "1"]);
    expect(g.today.map((r) => r.id)).toEqual(["2"]);
    expect(g.upcoming.map((r) => r.id)).toEqual(["4", "3"]);
    expect(g.done.map((r) => r.id)).toEqual(["5"]);
  });
  it("describes due dates relative to today", () => {
    expect(dueLabel("2026-03-05", "2026-03-05")).toBe("Today");
    expect(dueLabel("2026-03-06", "2026-03-05")).toBe("Tomorrow");
    expect(dueLabel("2026-03-04", "2026-03-05")).toBe("Yesterday");
    expect(dueLabel("2026-03-01", "2026-03-05")).toBe("4 days overdue");
    expect(dueLabel("2026-03-12", "2026-03-05")).toBe("In 7 days");
    expect(dueLabel(null, "2026-03-05")).toBe("No due date");
  });
  it("counts days across month and DST boundaries", () => {
    expect(daysBetween("2026-03-30", "2026-04-02")).toBe(3);
    expect(daysBetween("2026-10-03", "2026-10-05")).toBe(2);
    expect(addDaysIso("2026-12-29", 7)).toBe("2027-01-05");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-05-10T12:00:00Z");
  it("formats recent times compactly", () => {
    expect(timeAgo("2026-05-10T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-05-10T11:15:00Z", now)).toBe("45m ago");
    expect(timeAgo("2026-05-10T07:00:00Z", now)).toBe("5h ago");
    expect(timeAgo("2026-05-08T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-04-01T12:00:00Z", now)).toBeNull();
    expect(timeAgo("garbage", now)).toBeNull();
  });
});

describe("quickStartSteps", () => {
  it("ticks steps from data and links to the latest estimate", () => {
    const s = quickStartSteps({ estimates: 1, plans: 0, catalogueItems: 2, sentQuotes: 0, jobs: 0 }, { latestEstimateId: "e1" });
    expect(s.filter((x) => x.done).map((x) => x.key)).toEqual(["estimate", "catalogue"]);
    expect(s.find((x) => x.key === "plan")!.href).toBe("/estimates/e1/takeoffs");
    expect(quickStartSteps({ estimates: 0, plans: 0, catalogueItems: 0, sentQuotes: 0, jobs: 0 })[3].href).toBe("/estimates");
  });
});

describe("entity links", () => {
  it("maps known record types to routes", () => {
    expect(entityHref("estimate", "abc")).toBe("/estimates/abc");
    expect(entityHref("contact", "x")).toBe("/contacts/x");
    expect(entityHref("mystery", "x")).toBeNull();
    expect(entityHref(null, "x")).toBeNull();
    expect(entityTypeLabel("lead")).toBe("Lead");
    expect(entityTypeLabel("order")).toBe("Order");
  });
});
