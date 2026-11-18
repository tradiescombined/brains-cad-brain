import { describe, expect, it } from "vitest";
import { dialCodeForCountry, joinPhone, splitPhone, telHref } from "./phone";

describe("phone numbers with dialling codes", () => {
  it("keeps local numbers as typed", () => {
    expect(splitPhone("0412 345 678")).toEqual({ dial: "+61", national: "0412 345 678" });
    expect(joinPhone("+61", "0412 345 678")).toBe("0412 345 678");
    expect(joinPhone("+61", "  ")).toBe("");
  });

  it("stores other countries with their code", () => {
    expect(joinPhone("+64", "021 123 4567")).toBe("+64 21 123 4567");
    expect(splitPhone("+64 21 123 4567")).toEqual({ dial: "+64", national: "21 123 4567" });
    expect(splitPhone("+852 9123 4567")).toEqual({ dial: "+852", national: "9123 4567" });
    expect(splitPhone("+1 (555) 010-0000").dial).toBe("+1");
  });

  it("respects a different home country", () => {
    expect(joinPhone("+61", "0412 345 678", "+64")).toBe("+61 412 345 678");
    expect(splitPhone("021 555", "+64")).toEqual({ dial: "+64", national: "021 555" });
  });

  it("keeps numbers already in international form", () => {
    expect(joinPhone("+61", "+44 20 7946 0000")).toBe("+44 20 7946 0000");
  });

  it("maps the business country to its dialling code", () => {
    expect(dialCodeForCountry("Australia")).toBe("+61");
    expect(dialCodeForCountry("new zealand")).toBe("+64");
    expect(dialCodeForCountry("Canada")).toBe("+1");
    expect(dialCodeForCountry("")).toBe("+61");
    expect(dialCodeForCountry("Atlantis")).toBe("+61");
  });

  it("builds tel links", () => {
    expect(telHref("0412 345 678")).toBe("tel:+61412345678");
    expect(telHref("+64 21 123 4567")).toBe("tel:+64211234567");
    expect(telHref("")).toBe("");
  });
});
