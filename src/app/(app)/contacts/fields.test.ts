import { describe, expect, it } from "vitest";
import { insuranceLabel, insuranceStatus, stars, validateContact } from "./fields";

describe("validateContact", () => {
  it("requires name or business name and falls back to business name", () => {
    expect(validateContact({}).ok).toBe(false);
    const r = validateContact({ businessName: "Timber Co" });
    expect(r.ok && r.data.name).toBe("Timber Co");
  });
  it("normalises groups from form arrays and CSV strings", () => {
    const a = validateContact({ name: "A", groups: ["Roofing", "Roofing", " Tiling "] });
    expect(a.ok && a.data.groups).toEqual(["Roofing", "Tiling"]);
    const b = validateContact({ name: "A", groups: "Roofing; Tiling" });
    expect(b.ok && b.data.groups).toEqual(["Roofing", "Tiling"]);
  });
  it("parses rating, terms, insurance and website", () => {
    const r = validateContact({ name: "A", rating: "4/5", paymentTermsDays: "30 days", insuranceExpiry: "30/06/2027", website: "spark.com.au" });
    expect(r.ok && r.data).toMatchObject({ rating: 4, paymentTermsDays: 30, insuranceExpiry: "2027-06-30", website: "https://spark.com.au" });
    const none = validateContact({ name: "A", rating: "0" });
    expect(none.ok && none.data.rating).toBeNull();
  });
  it("reports invalid values", () => {
    const r = validateContact({ name: "A", rating: "9", paymentTermsDays: "-1", insuranceExpiry: "soon", email: "x@", website: "not a site", businessNumber: "12" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["businessNumber", "email", "insuranceExpiry", "paymentTermsDays", "rating", "website"]);
  });
});

describe("insuranceStatus", () => {
  const today = "2026-11-18";
  it("classifies none / expired / expiring / ok", () => {
    expect(insuranceStatus(null, today)).toEqual({ state: "none", days: null });
    expect(insuranceStatus("2026-11-17", today)).toEqual({ state: "expired", days: -1 });
    expect(insuranceStatus("2026-11-18", today)).toEqual({ state: "expiring", days: 0 });
    expect(insuranceStatus("2026-12-18", today)).toEqual({ state: "expiring", days: 30 });
    expect(insuranceStatus("2026-12-19", today)).toEqual({ state: "ok", days: 31 });
  });
  it("labels", () => {
    expect(insuranceLabel({ state: "expired", days: -5 })).toBe("Expired 5 days ago");
    expect(insuranceLabel({ state: "expired", days: -1 })).toBe("Expired yesterday");
    expect(insuranceLabel({ state: "expiring", days: 0 })).toBe("Expires today");
    expect(insuranceLabel({ state: "expiring", days: 12 })).toBe("Expires in 12 days");
    expect(insuranceLabel({ state: "none", days: null })).toBe("Not recorded");
  });
  it("stars", () => {
    expect(stars(3)).toBe("★★★☆☆");
    expect(stars(null)).toBe("☆☆☆☆☆");
    expect(stars(9)).toBe("★★★★★");
  });
});
