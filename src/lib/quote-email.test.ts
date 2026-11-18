import { describe, expect, it } from "vitest";
import { buildQuoteEmail, mailtoHref } from "./quote-email";

const base = {
  to: "jordan@example.com",
  clientName: "Jordan Lee",
  estimateName: "Bathroom renovation",
  number: "Q1000",
  quoteTotal: 12345.6,
  validUntil: "2026-12-18",
  quoteUrl: "http://localhost:3000/q/abc",
  businessName: "My Building Co",
};

describe("quote email", () => {
  it("summarises the quote with the online link", () => {
    const e = buildQuoteEmail(base);
    expect(e.to).toBe("jordan@example.com");
    expect(e.subject).toBe("Quote Q1000 – Bathroom renovation – My Building Co");
    expect(e.body).toContain("Hi Jordan,");
    expect(e.body).toContain("$12,345.60");
    expect(e.body).toContain("18 Dec 2026");
    expect(e.body).toContain("http://localhost:3000/q/abc");
  });

  it("handles missing client name, validity and link", () => {
    const e = buildQuoteEmail({ ...base, clientName: null, validUntil: null, quoteUrl: null, to: undefined });
    expect(e.body.startsWith("Hello,")).toBe(true);
    expect(e.body).not.toContain("Valid until");
    expect(e.body).not.toContain("online");
    expect(e.to).toBe("");
  });

  it("encodes a mailto link", () => {
    const href = mailtoHref(buildQuoteEmail(base));
    expect(href.startsWith("mailto:jordan@example.com?subject=Quote%20Q1000")).toBe(true);
    expect(href).toContain("%0D%0A");
    expect(decodeURIComponent(href.split("&body=")[1])).toContain("http://localhost:3000/q/abc");
  });
});
