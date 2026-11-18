import { describe, it, expect } from "vitest";
import {
  businessSchema, userSchema, taxRateSchema, numberingSchema, quoteDefaultsSchema,
  isValidAbn, minSafeNext, moveInOrder, isDuplicateName, formToObject, lookupKindLabel, allLookupKinds, LOOKUP_KINDS,
} from "./validation";
import { issuesToFieldErrors } from "./_components/action-state";

const errs = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => (r.success ? {} : issuesToFieldErrors(r.error!.issues));

describe("business details", () => {
  const base = { businessName: "Acme Builds", country: "Australia", currency: "AUD", brandColour: "#0f766e" };
  it("accepts minimal details and blanks optional fields to null", () => {
    const r = businessSchema.safeParse({ ...base, email: "", tradingName: "  " });
    expect(r.success).toBe(true);
    expect(r.data!.email).toBeNull();
    expect(r.data!.tradingName).toBeNull();
  });
  it("requires a name and valid email/colour", () => {
    const e = errs(businessSchema.safeParse({ ...base, businessName: " ", email: "nope", brandColour: "teal" }));
    expect(Object.keys(e).sort()).toEqual(["brandColour", "businessName", "email"]);
  });
  it("validates ABN and postcode for Australia only", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true);
    expect(isValidAbn("51 824 753 557")).toBe(false);
    expect(isValidAbn("1234")).toBe(false);
    expect(errs(businessSchema.safeParse({ ...base, businessNumber: "12345678901", postcode: "40000" }))).toHaveProperty("businessNumber");
    expect(errs(businessSchema.safeParse({ ...base, postcode: "40000" }))).toHaveProperty("postcode");
    expect(businessSchema.safeParse({ ...base, country: "New Zealand", businessNumber: "9429041535134", postcode: "1010" }).success).toBe(true);
  });
});

describe("users", () => {
  it("requires first name + email, coerces active checkbox", () => {
    const r = userSchema.safeParse({ firstName: "Pat", email: "pat@example.com", role: "Admin", active: "on" });
    expect(r.success && r.data.active).toBe(true);
    const r2 = userSchema.safeParse({ firstName: "Pat", email: "pat@example.com", role: "Admin" });
    expect(r2.success && r2.data.active).toBe(false);
    expect(Object.keys(errs(userSchema.safeParse({ firstName: "", email: "x", role: "Boss" }))).sort()).toEqual(["email", "firstName", "role"]);
  });
});

describe("tax rates", () => {
  it("parses percent strings and uppercases code", () => {
    const r = taxRateSchema.safeParse({ code: "gst-15", name: "GST 15%", ratePercent: "15%", appliesTo: "income" });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ code: "GST-15", ratePercent: 15, isDefault: false });
  });
  it("rejects out-of-range or non-numeric rates", () => {
    expect(errs(taxRateSchema.safeParse({ code: "X", name: "X", ratePercent: "150", appliesTo: "income" }))).toHaveProperty("ratePercent");
    expect(errs(taxRateSchema.safeParse({ code: "X", name: "X", ratePercent: "abc", appliesTo: "income" }))).toHaveProperty("ratePercent");
    expect(errs(taxRateSchema.safeParse({ code: "a b", name: "X", ratePercent: "1", appliesTo: "income" }))).toHaveProperty("code");
  });
});

describe("numbering", () => {
  const ok = { estimateNumberPrefix: "Q", nextEstimateNumber: "1001", jobNumberPrefix: "J", nextJobNumber: "1", invoiceNumberPrefix: "INV-", nextInvoiceNumber: "50", orderNumberPrefix: "", nextOrderNumber: "0", variationNumberPrefix: "V", nextVariationNumber: "1" };
  it("accepts prefixes (incl. empty) and integer counters", () => {
    const r = numberingSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.data!.nextEstimateNumber).toBe(1001);
  });
  it("rejects spaces, decimals and negatives", () => {
    const e = errs(numberingSchema.safeParse({ ...ok, jobNumberPrefix: "J B", nextJobNumber: "1.5", nextInvoiceNumber: "-1" }));
    expect(Object.keys(e).sort()).toEqual(["jobNumberPrefix", "nextInvoiceNumber", "nextJobNumber"]);
  });
  it("computes the lowest collision-free counter", () => {
    expect(minSafeNext("Q", ["Q1000", "Q1004", "X9999", null, "Qabc"])).toBe(1005);
    expect(minSafeNext("INV-", [])).toBe(0);
    expect(minSafeNext("", ["12", "7"])).toBe(13);
  });
});

describe("quote defaults", () => {
  it("validates ranges", () => {
    const r = quoteDefaultsSchema.safeParse({ defaultMarkupPercent: "18.5", quoteValidDays: "30", defaultInvoiceDueDays: "0", defaultTaxRateId: "", bankDetails: "" });
    expect(r.success && r.data).toMatchObject({ defaultMarkupPercent: 18.5, quoteValidDays: 30, defaultInvoiceDueDays: 0, defaultTaxRateId: null, bankDetails: null });
    expect(Object.keys(errs(quoteDefaultsSchema.safeParse({ defaultMarkupPercent: "-1", quoteValidDays: "0", defaultInvoiceDueDays: "2.5" }))).sort()).toEqual(["defaultInvoiceDueDays", "defaultMarkupPercent", "quoteValidDays"]);
  });
});

describe("list helpers", () => {
  it("moves items up and down, no-op at ends", () => {
    expect(moveInOrder(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a"], "z", "up")).toEqual(["a"]);
  });
  it("detects duplicate names case-insensitively, excluding self", () => {
    const rows = [{ id: "1", name: "Draft" }, { id: "2", name: "Sent" }];
    expect(isDuplicateName(rows, " draft ")).toBe(true);
    expect(isDuplicateName(rows, "Draft", "1")).toBe(false);
    expect(isDuplicateName(rows, "Won")).toBe(false);
  });
  it("labels kinds", () => {
    expect(lookupKindLabel("estimate_status")).toBe("Estimate statuses");
    expect(lookupKindLabel("custom_kind")).toBe("Custom kind");
  });
  it("lists known kinds first then custom kinds from data", () => {
    const k = allLookupKinds(["estimate_status", "zeta_kind", "alpha_kind", "zeta_kind"]);
    expect(k.slice(0, LOOKUP_KINDS.length).map((x) => x.kind)).toEqual(LOOKUP_KINDS.map((x) => x.kind));
    expect(k.slice(LOOKUP_KINDS.length).map((x) => x.label)).toEqual(["Alpha kind", "Zeta kind"]);
  });
  it("converts FormData to strings", () => {
    const fd = new FormData();
    fd.set("a", "1");
    fd.set("f", new Blob(["x"]), "x.txt");
    expect(formToObject(fd)).toEqual({ a: "1" });
  });
});
