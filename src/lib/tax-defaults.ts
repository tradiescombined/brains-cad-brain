/**
 * Tax defaults per cost type (pure, client + server safe).
 *
 * Each tax rate can be the default for one or more cost types (stored as a JSON array on the rate).
 * A new costing item is taxable when the active *income* rate set for its cost type charges tax
 * (rate > 0). Cost types with no rate assigned fall back to taxable, the long-standing behaviour.
 */

export const TAX_COST_TYPES = ["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"] as const;

export type RateLike = { id: string; rate: number; appliesTo: string; active: boolean; defaultCostTypes?: string | null };

export function parseCostTypes(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? [...new Set(v.map(String).filter((t) => (TAX_COST_TYPES as readonly string[]).includes(t)))] : [];
  } catch {
    return [];
  }
}

/** The active rate of `appliesTo` that is the default for `costType`, if any (first match wins). */
export function rateForCostType<T extends RateLike>(rates: T[], costType: string, appliesTo: "income" | "expense" = "income"): T | undefined {
  return rates.find((r) => r.active && r.appliesTo === appliesTo && parseCostTypes(r.defaultCostTypes).includes(costType));
}

/** Default taxable flag for each cost type, from the income rates. */
export function taxableDefaults(rates: RateLike[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of TAX_COST_TYPES) {
    const r = rateForCostType(rates, t, "income");
    out[t] = r ? r.rate > 0 : true;
  }
  return out;
}

export function defaultTaxable(defaults: Record<string, boolean> | undefined, costType: string | null | undefined): boolean {
  if (!defaults) return true;
  const v = defaults[String(costType ?? "Material")];
  return v === undefined ? true : v;
}

/**
 * Build the new defaultCostTypes value for every rate from a {costType: rateId} choice per side.
 * Returns rateId → JSON array. Rates not chosen for any cost type get "[]".
 */
export function assignCostTypes(rateIds: string[], choice: Record<string, string | null | undefined>): Record<string, string> {
  const map: Record<string, string[]> = Object.fromEntries(rateIds.map((id) => [id, []]));
  for (const t of TAX_COST_TYPES) {
    const id = choice[t];
    if (id && map[id]) map[id].push(t);
  }
  return Object.fromEntries(Object.entries(map).map(([id, list]) => [id, JSON.stringify(list)]));
}
