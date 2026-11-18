/** Pure helpers for the estimates module (list filtering/sorting, status rules, form parsing). */

export interface ListRow {
  id: string;
  number: string;
  name: string;
  status: string;
  buildingType: string | null;
  clientName: string | null;
  datePrepared: string | null;
  createdAt: string;
  quoteTotal: number;
}

export const SORT_KEYS = ["number", "name", "buildingType", "status", "client", "date", "total"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export function parseSort(key: string | undefined, dir: string | undefined): { key: SortKey; dir: SortDir } {
  const k = (SORT_KEYS as readonly string[]).includes(key ?? "") ? (key as SortKey) : "date";
  const d: SortDir = dir === "asc" || dir === "desc" ? dir : k === "date" || k === "total" || k === "number" ? "desc" : "asc";
  return { key: k, dir: d };
}

/** Case-insensitive search across number, name, client, building type and status. */
export function matchesSearch(r: ListRow, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [r.number, r.name, r.clientName, r.buildingType, r.status].filter(Boolean).join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}

const collator = new Intl.Collator("en-AU", { numeric: true, sensitivity: "base" });

export function sortRows(rows: ListRow[], key: SortKey, dir: SortDir): ListRow[] {
  const val = (r: ListRow): string | number => {
    switch (key) {
      case "number": return r.number;
      case "name": return r.name;
      case "buildingType": return r.buildingType ?? "";
      case "status": return r.status;
      case "client": return r.clientName ?? "";
      case "date": return r.datePrepared || r.createdAt.slice(0, 10);
      case "total": return r.quoteTotal;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = val(a), vb = val(b);
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
    return c !== 0 ? c * sign : collator.compare(b.number, a.number);
  });
}

/** Applies search then status; returns status counts computed after search (before status filter). */
export function filterEstimates(rows: ListRow[], opts: { q?: string; status?: string; statuses: string[]; sort?: string; dir?: string }) {
  const searched = rows.filter((r) => matchesSearch(r, opts.q ?? ""));
  const counts = new Map<string, number>();
  for (const s of opts.statuses) counts.set(s, 0);
  for (const r of searched) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const status = opts.status && counts.has(opts.status) ? opts.status : "";
  const filtered = status ? searched.filter((r) => r.status === status) : searched;
  const { key, dir } = parseSort(opts.sort, opts.dir);
  const sorted = sortRows(filtered, key, dir);
  const total = sorted.reduce((s, r) => s + (Number(r.quoteTotal) || 0), 0);
  return {
    rows: sorted,
    total,
    status,
    sort: key,
    dir,
    allCount: searched.length,
    counts: [...counts].map(([name, count]) => ({ name, count })),
  };
}

/**
 * Fields to write when an estimate's status changes.
 * Entering the accepted status stamps acceptedAt (keeping an earlier stamp); leaving it clears it.
 */
export function statusPatch(next: string, acceptedStatus: string | null, currentAcceptedAt: string | null, now = new Date()) {
  if (acceptedStatus && next === acceptedStatus) return { status: next, acceptedAt: currentAcceptedAt ?? now.toISOString() };
  return { status: next, acceptedAt: null };
}

export const PCPS_OPTIONS = [
  { value: "none", label: "None", hint: "PC and PS items carry their own markup on the quote." },
  { value: "across_estimate", label: "Across estimate", hint: "Their markup is spread over all other items." },
  { value: "within_category", label: "Within category", hint: "Their markup is spread over the other items in the same category." },
] as const;

export const ROUNDING_OPTIONS = [
  { value: "none", label: "No rounding" },
  { value: "dollar", label: "Round up to nearest $1" },
  { value: "ten", label: "Round up to nearest $10" },
  { value: "hundred", label: "Round up to nearest $100" },
  { value: "thousand", label: "Round up to nearest $1,000" },
] as const;

export const isPcps = (v: string) => PCPS_OPTIONS.some((o) => o.value === v);
export const isRounding = (v: string) => ROUNDING_OPTIONS.some((o) => o.value === v);

/** Trimmed string from a form field, or null when empty. */
export function str(fd: FormData, key: string, max = 500): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t ? t : null;
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Next template number ("TPL1", "TPL2", …) given the existing template numbers. */
export function nextTemplateNumber(existing: string[]): string {
  let max = 0;
  for (const n of existing) {
    const m = /^TPL(\d+)$/.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TPL${max + 1}`;
}

export type FormState =
  | { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string>; at?: number }
  | undefined;

/** Echoes submitted text fields back so a form can re-fill itself after a validation error. */
export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}
