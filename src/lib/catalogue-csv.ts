/**
 * Catalogue CSV helpers (pure, client + server safe).
 *
 * - parseCsv / toCsv: RFC 4180-ish parsing and writing (quotes, CRLF, BOM, ; or tab delimiters).
 * - detectMapping: guess which CSV column feeds which catalogue field from the header names.
 * - mapRows + planImport: turn CSV rows into validated import rows, then decide insert / update / skip
 *   against existing item codes.
 */

export const COST_TYPES = ["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"] as const;
export type CostType = (typeof COST_TYPES)[number];

export type ImportField = "code" | "description" | "costType" | "uom" | "unitCost" | "category" | "details";

export const IMPORT_FIELDS: { key: ImportField; label: string; required?: boolean; aliases: string[] }[] = [
  { key: "code", label: "Item code", aliases: ["code", "item code", "itemcode", "sku", "product code", "part number", "part no", "item no", "item number", "ref", "reference"] },
  { key: "description", label: "Description", required: true, aliases: ["description", "desc", "item", "item description", "name", "item name", "product", "product name", "title"] },
  { key: "costType", label: "Cost type", aliases: ["cost type", "costtype", "type", "item type", "cost category"] },
  { key: "uom", label: "Unit of measure", aliases: ["uom", "unit", "units", "unit of measure", "measure", "um", "u/m"] },
  { key: "unitCost", label: "Unit cost", aliases: ["unit cost", "unitcost", "cost", "price", "unit price", "rate", "cost price", "buy price", "ex gst", "cost ex gst", "price ex gst"] },
  { key: "category", label: "Category", aliases: ["category", "group", "section", "folder", "category name"] },
  { key: "details", label: "Details / notes", aliases: ["details", "notes", "note", "long description", "specification", "spec", "comments"] },
];

export type Mapping = Record<ImportField, number>; // column index, -1 = not mapped

/* ------------------------------------------------------------------ parsing */

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => {
    let n = 0, q = false;
    for (const ch of firstLine) {
      if (ch === '"') q = !q;
      else if (!q && ch === d) n++;
    }
    return [d, n] as const;
  });
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Parse CSV text into rows of cells. Blank lines are dropped. */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const pushRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell.trim() === "") { cell = ""; inQuotes = true; i++; continue; }
    if (ch === d) { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\r") { if (text[i + 1] === "\n") i++; pushRow(); i++; continue; }
    if (ch === "\n") { pushRow(); i++; continue; }
    cell += ch; i++;
  }
  if (cell !== "" || row.length) pushRow();
  return rows;
}

/** Serialise rows to CSV. Text cells that look like spreadsheet formulas are prefixed with '. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          if (v == null) return "";
          if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
          if (typeof v === "boolean") return v ? "Yes" : "No";
          let s = String(v);
          if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
          return /[",\r\n;]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ mapping */

const norm = (s: string) => s.toLowerCase().replace(/[_\-.()$]/g, " ").replace(/\s+/g, " ").trim();

/** Guess the column for each field from header names (exact alias first, then contains). */
export function detectMapping(headers: string[]): Mapping {
  const h = headers.map(norm);
  const used = new Set<number>();
  const m = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, -1])) as Mapping;
  // pass 1: exact alias matches
  for (const f of IMPORT_FIELDS) {
    const idx = h.findIndex((x, i) => !used.has(i) && f.aliases.includes(x));
    if (idx >= 0) { m[f.key] = idx; used.add(idx); }
  }
  // pass 2: header contains an alias (longest alias first to avoid "type" stealing "cost type")
  for (const f of IMPORT_FIELDS) {
    if (m[f.key] >= 0) continue;
    const aliases = [...f.aliases].filter((a) => a.length > 2).sort((a, b) => b.length - a.length);
    const idx = h.findIndex((x, i) => !used.has(i) && aliases.some((a) => x.includes(a)));
    if (idx >= 0) { m[f.key] = idx; used.add(idx); }
  }
  return m;
}

/** Normalise free-text cost types ("labor", "Sub-contractor", "plant") to our enum, or null if unknown. */
export function normaliseCostType(s: string | null | undefined): CostType | null {
  const v = (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!v) return null;
  if (/^(mat|materials?|supply|supplies|product)$/.test(v)) return "Material";
  if (/^(matlab|materiallabour|materialandlabour|materialslabour|materialsandlabour|materiallabor|materialandlabor|supplyandinstall|supplyinstall|supplyfix|supplyandfix)$/.test(v)) return "MatLab";
  if (/^(lab|labour|labor|lbr|wages?|trade)$/.test(v)) return "Labour";
  if (/^(equip|equipment|plant|hire|plantandequipment|machinery|tools?)$/.test(v)) return "Equipment";
  if (/^(sub|subs|subcontractor|subcontract|subcontractors|subbie|contractor)$/.test(v)) return "Subcontractor";
  if (/^(other|misc|miscellaneous|sundry|sundries|allowance)$/.test(v)) return "Other";
  return null;
}

/** Parse "$1,234.50", "1234.5", "(12.00)" → number. Returns null when not a number. */
export function parseMoney(s: string | null | undefined): number | null {
  if (s == null) return null;
  let v = String(s).trim();
  if (!v) return null;
  let neg = false;
  if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1); }
  v = v.replace(/^(aud|au\$|a\$|\$)/i, "").replace(/[$\s,]/g, "").replace(/(aud|ex|incgst|exgst)$/i, "");
  if (v.startsWith("-")) { neg = !neg; v = v.slice(1); }
  if (!/^\d*\.?\d+$/.test(v) && !/^\d+\.$/.test(v)) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 10000) / 10000;
}

/** "Framing > Walls" → ["Framing", "Walls"] (max two levels; deeper levels are folded into the child). */
export function splitCategoryPath(s: string | null | undefined): string[] {
  const parts = (s ?? "").split(/\s*(?:>|\/|\\)\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts;
  return [parts[0], parts.slice(1).join(" / ")];
}

export interface ImportRow {
  line: number; // 1-based line number in the file
  code: string | null;
  description: string;
  costType: CostType | null; // null = not supplied
  uom: string | null;
  unitCost: number | null; // null = not supplied
  category: string[] | null; // path, null = not supplied
  details: string | null;
  warnings: string[];
}

export interface SkippedRow { line: number; reason: string }

/** Convert raw rows to validated import rows. */
export function mapRows(rows: string[][], mapping: Mapping, hasHeader = true): { rows: ImportRow[]; skipped: SkippedRow[] } {
  const out: ImportRow[] = [];
  const skipped: SkippedRow[] = [];
  const get = (r: string[], k: ImportField) => (mapping[k] >= 0 ? (r[mapping[k]] ?? "").trim() : null);
  rows.forEach((r, i) => {
    if (hasHeader && i === 0) return;
    const line = i + 1;
    const description = get(r, "description") ?? "";
    if (!description) { skipped.push({ line, reason: "Missing description" }); return; }
    const warnings: string[] = [];
    const rawCost = get(r, "unitCost");
    let unitCost: number | null = null;
    if (rawCost) {
      unitCost = parseMoney(rawCost);
      if (unitCost === null) { skipped.push({ line, reason: `Unit cost "${rawCost}" is not a number` }); return; }
      if (unitCost < 0) { skipped.push({ line, reason: "Unit cost cannot be negative" }); return; }
    }
    const rawType = get(r, "costType");
    let costType: CostType | null = null;
    if (rawType) {
      costType = normaliseCostType(rawType);
      if (!costType) { warnings.push(`Unknown cost type "${rawType}", used Material`); costType = "Material"; }
    }
    const cat = get(r, "category");
    out.push({
      line,
      code: get(r, "code") || null,
      description: description.slice(0, 500),
      costType,
      uom: get(r, "uom") || null,
      unitCost,
      category: cat ? splitCategoryPath(cat) : null,
      details: get(r, "details") || null,
      warnings,
    });
  });
  return { rows: out, skipped };
}

export interface ImportPlan {
  inserts: ImportRow[];
  updates: { row: ImportRow; id: string }[];
  skipped: SkippedRow[];
}

/** Decide what happens to each row: match existing items by code (case-insensitive), else insert. */
export function planImport(rows: ImportRow[], existingByCode: Map<string, string>, skipped: SkippedRow[] = []): ImportPlan {
  const plan: ImportPlan = { inserts: [], updates: [], skipped: [...skipped] };
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = row.code?.toLowerCase();
    if (key) {
      const prev = seen.get(key);
      if (prev !== undefined) { plan.skipped.push({ line: row.line, reason: `Duplicate code "${row.code}" (already on line ${prev})` }); continue; }
      seen.set(key, row.line);
      const id = existingByCode.get(key);
      if (id) { plan.updates.push({ row, id }); continue; }
    }
    plan.inserts.push(row);
  }
  plan.skipped.sort((a, b) => a.line - b.line);
  return plan;
}

/* ------------------------------------------------------------------ export */

export const EXPORT_HEADERS = ["Item code", "Description", "Cost type", "UOM", "Unit cost", "Category", "Details", "Recipe"];

export function catalogueToCsv(
  items: { itemCode: string | null; description: string; costType: string; uom: string; unitCost: number; categoryId: string | null; details: string | null; isRecipe: boolean }[],
  categoryPath: (id: string | null) => string,
): string {
  return toCsv([
    EXPORT_HEADERS,
    ...items.map((i) => [i.itemCode, i.description, i.costType, i.uom, Math.round(i.unitCost * 10000) / 10000, categoryPath(i.categoryId), i.details, i.isRecipe]),
  ]);
}
