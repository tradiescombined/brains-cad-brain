import { describe, expect, it } from "vitest";
import { clientDisplayName, formToObject, normaliseAbn, parseClientType, safeReturnTo, validateClient, validateClientContact, withParam } from "./fields";
import { matchesQuery, parseGroups, parseSort, qs, sortRows, withCurrent } from "./list";

describe("validateClient", () => {
  it("requires a name", () => {
    const r = validateClient({ name: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeTruthy();
  });
  it("cleans a person and drops business fields", () => {
    const r = validateClient({ name: " Jo Bloggs ", clientType: "Person", businessName: "Ignored", businessNumber: "x", email: " JO@Example.com ", state: "qld", defaultInvoiceDays: "14" });
    expect(r).toEqual({
      ok: true,
      data: expect.objectContaining({ name: "Jo Bloggs", clientType: "Person", businessName: null, businessNumber: null, email: "jo@example.com", state: "QLD", defaultInvoiceDays: 14, mobile: null }),
    });
  });
  it("validates business clients: business name required, ABN 11 digits, normalised", () => {
    const bad = validateClient({ name: "Kim", clientType: "Business", businessNumber: "123" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.businessName).toBeTruthy();
      expect(bad.errors.businessNumber).toBeTruthy();
    }
    const good = validateClient({ name: "Kim", clientType: "Business", businessName: "Kim Homes", businessNumber: "51824753556" });
    expect(good.ok && good.data.businessNumber).toBe("51 824 753 556");
  });
  it("infers Business and uses business name as name when name missing (CSV)", () => {
    const r = validateClient({ businessName: "Acme Pty Ltd" });
    expect(r.ok && r.data).toMatchObject({ name: "Acme Pty Ltd", clientType: "Business", businessName: "Acme Pty Ltd" });
  });
  it("rejects bad email, postcode and invoice days", () => {
    const r = validateClient({ name: "A", email: "nope", postcode: "!!", defaultInvoiceDays: "400" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["defaultInvoiceDays", "email", "postcode"]);
  });
});

describe("client helpers", () => {
  it("parseClientType", () => {
    expect(parseClientType("company", null)).toBe("Business");
    expect(parseClientType("individual", "X")).toBe("Person");
    expect(parseClientType(null, "X")).toBe("Business");
    expect(parseClientType("", null)).toBe("Person");
  });
  it("normaliseAbn", () => {
    expect(normaliseAbn("51 824 753 556")).toBe("51 824 753 556");
    expect(normaliseAbn("5182475355")).toBeNull();
  });
  it("clientDisplayName", () => {
    expect(clientDisplayName({ name: "Kim", clientType: "Business", businessName: "Kim Homes" })).toBe("Kim Homes");
    expect(clientDisplayName({ name: "Kim", clientType: "Person", businessName: "Kim Homes" })).toBe("Kim");
  });
  it("validateClientContact", () => {
    expect(validateClientContact({ name: "" }).ok).toBe(false);
    expect(validateClientContact({ name: "Pat", isPrimary: "on", email: "P@X.CO" })).toEqual({ ok: true, data: { name: "Pat", role: null, email: "p@x.co", mobile: null, phone: null, isPrimary: true } });
  });
  it("formToObject keeps multi values and skips action keys", () => {
    const fd = new FormData();
    fd.append("groups", "A");
    fd.append("groups", "B");
    fd.append("name", "x");
    fd.append("$ACTION_ID_1", "");
    expect(formToObject(fd)).toEqual({ groups: ["A", "B"], name: "x" });
  });
  it("safeReturnTo only allows relative paths", () => {
    expect(safeReturnTo("/estimates/new?x=1")).toBe("/estimates/new?x=1");
    expect(safeReturnTo("//evil.com")).toBe("/clients");
    expect(safeReturnTo("https://evil.com")).toBe("/clients");
    expect(safeReturnTo(undefined, "/x")).toBe("/x");
  });
  it("withParam adds or replaces a query param", () => {
    expect(withParam("/estimates/new", "clientId", "abc")).toBe("/estimates/new?clientId=abc");
    expect(withParam("/e?clientId=old&a=1#top", "clientId", "new")).toBe("/e?clientId=new&a=1#top");
  });
});

describe("list helpers", () => {
  it("matchesQuery requires all terms", () => {
    expect(matchesQuery(["Jordan Lee", "Brisbane", null], "lee bris")).toBe(true);
    expect(matchesQuery(["Jordan Lee"], "lee sydney")).toBe(false);
    expect(matchesQuery(["x"], "  ")).toBe(true);
  });
  it("sortRows sorts strings/numbers, blanks last in both directions, stable", () => {
    const rows = [{ n: "b", v: 2 }, { n: "", v: 10 }, { n: "A", v: 1 }, { n: "c", v: null }];
    expect(sortRows(rows, (r) => r.n).map((r) => r.n)).toEqual(["A", "b", "c", ""]);
    expect(sortRows(rows, (r) => r.n, "desc").map((r) => r.n)).toEqual(["c", "b", "A", ""]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([10, 2, 1, null]);
  });
  it("parseSort falls back for unknown keys", () => {
    expect(parseSort("email", "desc", ["name", "email"] as const, "name")).toEqual({ sort: "email", dir: "desc" });
    expect(parseSort("drop table", "x", ["name"] as const, "name")).toEqual({ sort: "name", dir: "asc" });
  });
  it("qs drops empty params", () => {
    expect(qs({ q: "jo", archived: "", sort: undefined, dir: "desc" })).toBe("?q=jo&dir=desc");
    expect(qs({})).toBe("");
  });
  it("parseGroups is defensive", () => {
    expect(parseGroups('["Carpentry"," Roofing ",3,""]')).toEqual(["Carpentry", "Roofing"]);
    expect(parseGroups("not json")).toEqual([]);
    expect(parseGroups(null)).toEqual([]);
  });
  it("withCurrent keeps inactive current value", () => {
    expect(withCurrent(["A"], "B")).toEqual(["A", "B"]);
    expect(withCurrent(["A"], "A")).toEqual(["A"]);
  });
});
