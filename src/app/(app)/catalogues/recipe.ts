/**
 * Pure recipe (assembly) maths shared by the client editor and server actions.
 * A recipe's unit cost = Σ (component quantity per 1 unit × component unit cost).
 */
import { tryEvaluate } from "@/lib/expr";

export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const roundQty = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * Validate and evaluate a "quantity per unit" formula. Only numbers, arithmetic, the
 * functions supported by @/lib/expr and the parent quantity reference [Q] are allowed
 * (catalogue recipes have no takeoff measurements). [Q] is evaluated as 1 here.
 */
export function evalRecipeQty(expr: string | null | undefined): { value: number; error?: string } {
  const src = String(expr ?? "").trim();
  if (!src) return { value: 0, error: "Quantity is required" };
  const refs = [...src.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim().toUpperCase());
  const bad = refs.find((r) => r !== "Q");
  if (bad !== undefined) return { value: 0, error: `Only [Q] can be referenced in a recipe (found [${bad}])` };
  const r = tryEvaluate(src, { parentQuantity: 1 });
  if (r.error) return r;
  if (r.value < 0) return { value: r.value, error: "Quantity cannot be negative" };
  return { value: roundQty(r.value) };
}

export interface RecipeLineInput {
  quantityExpr: string;
  unitCost: number;
}

export function recipeTotals<T extends RecipeLineInput>(lines: T[]) {
  let total = 0;
  let errors = 0;
  const rows = lines.map((l) => {
    const q = evalRecipeQty(l.quantityExpr);
    const cost = Number(l.unitCost) || 0;
    const extended = q.error ? 0 : roundMoney(q.value * cost);
    if (q.error) errors++;
    total += q.error ? 0 : q.value * cost;
    return { ...l, quantity: q.value, error: q.error, extended };
  });
  return { rows, unitCost: roundMoney(total), errors };
}

/** Apply a percentage change to a price (e.g. +5 → ×1.05). Never below zero. */
export function adjustByPercent(cost: number, percent: number): number {
  return Math.max(0, roundMoney((Number(cost) || 0) * (1 + percent / 100)));
}

/**
 * Would adding `componentId` as a component of `recipeId` create a cycle?
 * `childrenOf(id)` returns the component item ids used by recipe `id`.
 */
export function createsCycle(recipeId: string, componentId: string, childrenOf: (id: string) => string[]): boolean {
  if (recipeId === componentId) return true;
  const seen = new Set<string>();
  const stack = [componentId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === recipeId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...childrenOf(cur));
  }
  return false;
}
