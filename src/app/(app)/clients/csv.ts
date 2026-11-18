/**
 * Shared CSV helpers for client and supplier/trade import + export.
 * Pure functions only (safe in client and server code).
 */

export type CsvCell = string | number | boolean | null | undefined;

/** A target field the user can map a CSV column onto. */
export type CsvField = { key: string; label: string; required?: boolean; aliases?: string[] };

/** Picks "," or tab (pasted from a spreadsheet) or ";" based on the first line. */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, "").split(/\r\n|\n|\r/, 1)[0] ?? "";
  const count = (d: string) => firstLine.split(d).length - 1;
  const candidates = [",", "\t", ";"].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ",";
}

/**
 * RFC 4180-style parser: quoted fields, doubled quotes, embedded delimiters and newlines,
 * CRLF / LF / CR line endings, leading BOM. Fully blank lines are dropped.
 */
export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushRow = () => {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
    field = "";
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      inQuotes = true;
      field = "";
      i++;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r" || ch === "\n") {
      pushRow();
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length) pushRow();
  return rows;
}

function escapeCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialises rows to CSV text (CRLF line endings, as spreadsheets expect). */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

/** Lower-cases and strips non-alphanumerics: "E-mail Address" → "emailaddress". */
export function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Best-guess mapping of each CSV column to a field key ("" = skip). Each field is used at most once. */
export function guessMapping(headers: string[], fields: CsvField[]): string[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const n = normaliseHeader(h);
    if (!n) return "";
    const hit = fields.find(
      (f) => !used.has(f.key) && [f.key, f.label, ...(f.aliases ?? [])].some((a) => normaliseHeader(a) === n),
    );
    if (!hit) return "";
    used.add(hit.key);
    return hit.key;
  });
}

/** Converts data rows into records keyed by mapped field. Unmapped columns are ignored. */
export function applyMapping(rows: string[][], mapping: string[]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const rec: Record<string, string> = {};
    mapping.forEach((key, idx) => {
      if (!key) return;
      const v = (r[idx] ?? "").trim();
      if (v) rec[key] = rec[key] ? `${rec[key]} ${v}` : v;
    });
    if (Object.keys(rec).length) out.push(rec);
  }
  return out;
}

/** Splits a multi-value cell ("Carpentry; Roofing" or "a|b") into trimmed, de-duplicated values. */
export function splitList(v: string | null | undefined): string[] {
  if (!v) return [];
  const parts = v.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

/**
 * Accepts ISO (2026-03-31), Australian (31/03/2026, 31-3-26) dates. Returns YYYY-MM-DD or null.
 */
export function parseDateLoose(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (mt) {
    [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else if ((mt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
    if (y < 100) y += 2000;
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Parses a whole number, tolerating "30 days" / " 14 ". Returns null if blank, NaN if invalid. */
export function parseIntLoose(v: string | null | undefined): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = /^(-?\d+)(?:\s*[a-z ]*)?$/i.exec(s);
  return m ? Number(m[1]) : NaN;
}

/** Safe filename stamp for exports, e.g. clients-2026-11-18.csv */
export function exportFileName(kind: string, today = new Date().toISOString().slice(0, 10)): string {
  return `${kind}-${today}.csv`;
}
