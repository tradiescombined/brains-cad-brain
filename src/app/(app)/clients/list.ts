/** Pure list helpers (search + sort) shared by /clients and /contacts. */

export type SortDir = "asc" | "desc";

/** True when every whitespace-separated term in `q` appears in at least one of the values. */
export function matchesQuery(values: (string | number | null | undefined)[], q: string | null | undefined): boolean {
  const terms = (q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = values.filter((v) => v !== null && v !== undefined).join(" \u0001 ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}

/** Stable sort; blanks always last; numbers numerically; strings case-insensitively. */
export function sortRows<T>(rows: T[], get: (r: T) => string | number | null | undefined, dir: SortDir = "asc"): T[] {
  const mul = dir === "desc" ? -1 : 1;
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const ab = a.v === null || a.v === undefined || a.v === "";
      const bb = b.v === null || b.v === undefined || b.v === "";
      if (ab || bb) return ab === bb ? a.i - b.i : ab ? 1 : -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), "en-AU", { sensitivity: "base", numeric: true });
      return c === 0 ? a.i - b.i : c * mul;
    })
    .map((x) => x.r);
}

/** Reads ?sort=&dir= against an allow-list. */
export function parseSort<K extends string>(sort: string | undefined, dir: string | undefined, allowed: readonly K[], fallback: K): { sort: K; dir: SortDir } {
  const s = (allowed as readonly string[]).includes(sort ?? "") ? (sort as K) : fallback;
  return { sort: s, dir: dir === "desc" ? "desc" : "asc" };
}

/** Builds a query string from params, dropping empty values. */
export function qs(params: Record<string, string | undefined | null | false>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Parses the contacts.groups JSON column defensively. */
export function parseGroups(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
  } catch {
    return [];
  }
}

/** Options list from lookups, keeping a current value that is no longer an active lookup. */
export function withCurrent(options: string[], current: string | null | undefined): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}
