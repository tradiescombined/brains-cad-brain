/**
 * Merge fields for quote letters (cover letter, T&Cs).
 * Tokens look like [ClientName]. Unknown tokens are left untouched so typos stay visible.
 * Pure module: safe on server and client.
 */

export const MERGE_FIELDS = [
  { key: "ClientName", label: "Client name" },
  { key: "EstimateName", label: "Estimate name" },
  { key: "EstimateNumber", label: "Quote number" },
  { key: "QuoteTotal", label: "Quote total (inc tax)" },
  { key: "ValidUntil", label: "Valid until date" },
  { key: "BusinessName", label: "Your business name" },
  { key: "SiteAddress", label: "Site address" },
] as const;

export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];
export type MergeValues = Partial<Record<MergeFieldKey, string>>;

const KEYS = new Map<string, MergeFieldKey>(MERGE_FIELDS.map((f) => [f.key.toLowerCase(), f.key]));

/** Replaces [Field] tokens (case-insensitive) with values. Missing values become "". */
export function applyMergeFields(text: string | null | undefined, values: MergeValues): string {
  if (!text) return "";
  return text.replace(/\[([A-Za-z]+)\]/g, (whole, name: string) => {
    const key = KEYS.get(name.toLowerCase());
    if (!key) return whole;
    return values[key] ?? "";
  });
}

/** Lists tokens in the text that are not recognised merge fields. */
export function unknownMergeFields(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/\[([A-Za-z]+)\]/g)) if (!KEYS.has(m[1].toLowerCase())) out.add(m[1]);
  return [...out];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-18" (or full ISO) -> "18 Nov 2026" without timezone drift. */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

/** Adds whole days to a YYYY-MM-DD date using UTC maths (no DST / timezone shift). */
export function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + Math.round(days) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Joins address parts, skipping blanks: "12 Sample St, Brisbane QLD 4000". */
export function joinAddress(street?: string | null, city?: string | null, state?: string | null, postcode?: string | null): string {
  const tail = [city, state, postcode].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return [street?.trim(), tail].filter(Boolean).join(", ");
}

/** Issue date of a quote: date sent, else date prepared, else the fallback (today). */
export function quoteIssueDate(sentAt: string | null | undefined, datePrepared: string | null | undefined, today: string): string {
  return (sentAt || datePrepared || today).slice(0, 10);
}
