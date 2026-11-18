import { describe, expect, it } from "vitest";
import { applyMapping, detectDelimiter, exportFileName, guessMapping, normaliseHeader, parseCsv, parseDateLoose, parseIntLoose, splitList, toCsv } from "./csv";
import { CLIENT_FIELDS } from "./fields";

describe("parseCsv", () => {
  it("parses simple rows and drops blank lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n4,5,6\n")).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
  });
  it("handles quotes, escaped quotes, embedded commas and newlines", () => {
    const text = 'name,notes\r\n"Smith, Jo","said ""hi""\nthen left"\r\nBob,plain';
    expect(parseCsv(text)).toEqual([["name", "notes"], ["Smith, Jo", 'said "hi"\nthen left'], ["Bob", "plain"]]);
  });
  it("strips BOM and handles CR-only endings and trailing empty field", () => {
    expect(parseCsv("﻿a,b\r1,\r")).toEqual([["a", "b"], ["1", ""]]);
  });
  it("auto-detects tab-separated paste from a spreadsheet", () => {
    expect(detectDelimiter("Name\tEmail\nA\ta@x.com")).toBe("\t");
    expect(parseCsv("Name\tEmail\nA, B\ta@x.com")).toEqual([["Name", "Email"], ["A, B", "a@x.com"]]);
  });
  it("detects semicolons and defaults to comma", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("single")).toBe(",");
  });
});

describe("toCsv", () => {
  it("escapes only when needed and round-trips through parseCsv", () => {
    const rows = [["Name", "Notes", "Days", "Flag"], ['Lee, "JJ"', "line1\nline2", 14, true], ["", null, undefined, false]];
    const csv = toCsv(rows);
    expect(csv.startsWith('Name,Notes,Days,Flag\r\n"Lee, ""JJ""","line1\nline2",14,Yes\r\n')).toBe(true);
    expect(parseCsv(csv)).toEqual([["Name", "Notes", "Days", "Flag"], ['Lee, "JJ"', "line1\nline2", "14", "Yes"], ["", "", "", "No"]]);
  });
  it("quotes leading/trailing spaces", () => {
    expect(toCsv([[" x"]])).toBe('" x"\r\n');
  });
});

describe("mapping", () => {
  it("normalises headers", () => {
    expect(normaliseHeader(" E-mail Address ")).toBe("emailaddress");
  });
  it("guesses fields from keys, labels and aliases, each used once", () => {
    const m = guessMapping(["Client Name", "E-mail", "Suburb", "Company", "Whatever", "Name", "Post Code"], CLIENT_FIELDS);
    expect(m).toEqual(["name", "email", "cityTown", "businessName", "", "", "postcode"]);
  });
  it("applies mapping, trims, skips empty rows, joins duplicate targets", () => {
    const rows = [["Jo ", "a@x.com", "skip"], ["", "", "x"], ["Sam", "", ""]];
    expect(applyMapping(rows, ["name", "email", ""])).toEqual([{ name: "Jo", email: "a@x.com" }, { name: "Sam" }]);
    expect(applyMapping([["12", "Main St"]], ["address", "address"])).toEqual([{ address: "12 Main St" }]);
  });
});

describe("value parsers", () => {
  it("splitList", () => {
    expect(splitList("Carpentry; Roofing | Carpentry")).toEqual(["Carpentry", "Roofing"]);
    expect(splitList("")).toEqual([]);
  });
  it("parseDateLoose accepts ISO and Australian formats and rejects impossible dates", () => {
    expect(parseDateLoose("2026-03-05")).toBe("2026-03-05");
    expect(parseDateLoose("2026-3-5T10:00:00Z")).toBe("2026-03-05");
    expect(parseDateLoose("31/12/2026")).toBe("2026-12-31");
    expect(parseDateLoose("1-7-27")).toBe("2027-07-01");
    expect(parseDateLoose("31/02/2026")).toBeNull();
    expect(parseDateLoose("next week")).toBeNull();
    expect(parseDateLoose("")).toBeNull();
  });
  it("parseIntLoose", () => {
    expect(parseIntLoose(" 14 ")).toBe(14);
    expect(parseIntLoose("30 days")).toBe(30);
    expect(parseIntLoose("")).toBeNull();
    expect(parseIntLoose("abc")).toBeNaN();
  });
  it("exportFileName", () => {
    expect(exportFileName("clients", "2026-11-18")).toBe("clients-2026-11-18.csv");
  });
});
