import { describe, it, expect } from "vitest";
import { applyMergeFields, unknownMergeFields, formatIsoDate, addDaysIso, joinAddress, quoteIssueDate } from "./merge-fields";

describe("merge fields", () => {
  const values = { ClientName: "Jordan Lee", QuoteTotal: "$1,234.50", ValidUntil: "18 Dec 2026", BusinessName: "Acme Builds" };

  it("replaces known tokens", () => {
    expect(applyMergeFields("Dear [ClientName], total [QuoteTotal].", values)).toBe("Dear Jordan Lee, total $1,234.50.");
  });
  it("is case-insensitive and replaces repeats", () => {
    expect(applyMergeFields("[clientname] / [CLIENTNAME]", values)).toBe("Jordan Lee / Jordan Lee");
  });
  it("leaves unknown tokens and blanks missing values", () => {
    expect(applyMergeFields("[Foo] [SiteAddress]!", values)).toBe("[Foo] !");
  });
  it("handles empty input", () => {
    expect(applyMergeFields(null, values)).toBe("");
    expect(applyMergeFields("", values)).toBe("");
  });
  it("reports unknown tokens once", () => {
    expect(unknownMergeFields("[Foo] [ClientName] [Foo] [Bar]")).toEqual(["Foo", "Bar"]);
  });
});

describe("dates & address", () => {
  it("formats ISO dates without timezone drift", () => {
    expect(formatIsoDate("2026-01-05")).toBe("5 Jan 2026");
    expect(formatIsoDate("2026-11-18T23:59:00.000Z")).toBe("18 Nov 2026");
    expect(formatIsoDate("")).toBe("");
  });
  it("adds days across month and year ends", () => {
    expect(addDaysIso("2026-12-20", 30)).toBe("2027-01-19");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysIso("2026-11-18", 0)).toBe("2026-11-18");
  });
  it("joins address parts", () => {
    expect(joinAddress("12 Sample St", "Brisbane", "QLD", "4000")).toBe("12 Sample St, Brisbane QLD 4000");
    expect(joinAddress(null, "Brisbane", "", null)).toBe("Brisbane");
    expect(joinAddress("", "", "", "")).toBe("");
  });
  it("picks the issue date", () => {
    expect(quoteIssueDate("2026-10-01T03:00:00Z", "2026-09-01", "2026-11-18")).toBe("2026-10-01");
    expect(quoteIssueDate(null, "2026-09-01", "2026-11-18")).toBe("2026-09-01");
    expect(quoteIssueDate(null, null, "2026-11-18")).toBe("2026-11-18");
  });
});
