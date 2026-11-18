/**
 * Estimate calculation engine (pure, no DB).
 *
 * Tree: categories (kind=category, no parent) contain items; an item may contain
 * sub-items (recipe components). For an item with children:
 *   unitCost = Σ(child.quantity × child.unitCost)   (cost per 1 unit of parent)
 *   child extended total = parent.quantity × child.quantity × child.unitCost
 *
 * Estimate totals:
 *   costTotal   = Σ leaf extended totals
 *   markupTotal = Σ itemTotal × markup%   (item markup override, else Σ estimate markup lines)
 *   taxTotal    = Σ taxable (itemTotal + itemMarkup) × taxRate
 *   quoteTotal  = costTotal + markupTotal + taxTotal (+ rounding adjustment)
 *
 * Verified against reference: cost 38,171.10 @ 20% markup, 10% GST -> 50,385.85.
 */
import { tryEvaluate } from "./expr";

export type CostType = "Material" | "Labour" | "Equipment" | "Subcontractor" | "Other";
export type AllowanceType = "none" | "PC" | "PS";
export type Redistribution = "none" | "across_estimate" | "within_category";
export type Rounding = "none" | "dollar" | "ten" | "hundred" | "thousand";

export interface CalcItem {
  id: string;
  parentId: string | null;
  kind: "category" | "item";
  sortOrder: number;
  description?: string;
  costType?: CostType | string;
  allowanceType?: AllowanceType | string;
  quantityExpr?: string | null;
  quantity?: number;
  unitCost: number;
  markupPercent?: number | null;
  taxable?: boolean;
}

export interface MarkupLine { name: string; percent: number }

export interface CalcInput {
  items: CalcItem[];
  markupLines: MarkupLine[];
  taxRate: number; // 0.1
  measurements?: Record<string, number>;
  pcpsRedistribution?: Redistribution;
  rounding?: Rounding;
}

export interface ItemResult {
  id: string;
  number: string; // "3.7.2"
  depth: number;
  quantity: number; // evaluated own quantity
  effectiveQuantity: number; // quantity × ancestors' quantities (for sub-items)
  unitCost: number; // for parents: rolled-up
  total: number; // extended cost (ex markup, ex tax)
  markupPercent: number;
  markup: number;
  totalIncMarkup: number;
  tax: number;
  /** Sell price shown on quote after PC/PS markup redistribution (ex tax). */
  displaySell: number;
  hasChildren: boolean;
  error?: string;
}

export interface CalcResult {
  items: Record<string, ItemResult>;
  order: string[]; // depth-first display order
  costTotal: number;
  markupTotal: number;
  markupBreakdown: { name: string; percent: number; amount: number }[];
  subtotalExTax: number;
  taxTotal: number;
  roundingAdjustment: number;
  quoteTotal: number;
  byCostType: Record<string, number>;
  categoryTotals: Record<string, { cost: number; sell: number; sellIncTax: number }>;
  errors: { id: string; message: string }[];
}

export const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function totalMarkupPercent(lines: MarkupLine[]): number {
  return lines.reduce((s, l) => s + (Number(l.percent) || 0), 0);
}

export function parseMarkupLines(json: string | null | undefined): MarkupLine[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((l) => ({ name: String(l.name ?? "Markup"), percent: Number(l.percent) || 0 })) : [];
  } catch {
    return [];
  }
}

function roundUpTo(n: number, mode: Rounding): number {
  const step = { none: 0, dollar: 1, ten: 10, hundred: 100, thousand: 1000 }[mode] ?? 0;
  if (!step) return n;
  return Math.ceil(r2(n) / step - 1e-9) * step;
}

export function calculate(input: CalcInput): CalcResult {
  const { items, markupLines, taxRate } = input;
  const redistribution = input.pcpsRedistribution ?? "none";
  const estMarkup = totalMarkupPercent(markupLines);
  const children = new Map<string | null, CalcItem[]>();
  for (const it of items) {
    const k = it.parentId ?? null;
    if (!children.has(k)) children.set(k, []);
    children.get(k)!.push(it);
  }
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  const res: Record<string, ItemResult> = {};
  const order: string[] = [];
  const errors: CalcResult["errors"] = [];

  // Pass 1: evaluate quantities & roll-up unit costs (post-order), assign numbers (pre-order)
  function unitCostOf(it: CalcItem, parentQty: number): { qty: number; unit: number; err?: string } {
    const kids = children.get(it.id) ?? [];
    const ev = it.quantityExpr != null && it.quantityExpr !== "" && it.kind !== "category"
      ? tryEvaluate(it.quantityExpr, { measurements: input.measurements, parentQuantity: parentQty })
      : { value: it.kind === "category" ? 1 : Number(it.quantity) || 0 };
    const qty = r3(ev.value); // quantities are stored to 3 dp (matches reference)
    if (kids.length === 0 || it.kind === "category") return { qty, unit: Number(it.unitCost) || 0, err: ev.error };
    let unit = 0;
    for (const k of kids) {
      const r = unitCostOf(k, qty);
      unit += r.qty * r.unit;
    }
    return { qty, unit, err: ev.error };
  }

  function walk(it: CalcItem, prefix: string, idx: number, depth: number, ancestorQty: number, categoryId: string) {
    const number = prefix ? `${prefix}.${idx}` : String(idx);
    const kids = children.get(it.id) ?? [];
    const { qty, unit, err } = unitCostOf(it, ancestorQty);
    if (err) errors.push({ id: it.id, message: err });
    const isCat = it.kind === "category";
    const effQty = isCat ? 1 : qty * ancestorQty;
    const r: ItemResult = {
      id: it.id, number, depth, quantity: isCat ? 0 : qty, effectiveQuantity: effQty, unitCost: isCat ? 0 : unit,
      total: 0, markupPercent: 0, markup: 0, totalIncMarkup: 0, tax: 0, displaySell: 0, hasChildren: kids.length > 0, error: err,
    };
    res[it.id] = r;
    order.push(it.id);
    kids.forEach((k, i) => walk(k, number, i + 1, depth + 1, isCat ? 1 : effQty, isCat ? it.id : categoryId));
    if (isCat || kids.length > 0) {
      // aggregate from children
      for (const k of kids) {
        const kr = res[k.id];
        r.total += kr.total; r.markup += kr.markup; r.tax += kr.tax;
      }
      if (!isCat && kids.length > 0) {
        // parent item: use its own markup override if set, applied to its rolled-up total
        if (it.markupPercent != null) {
          r.markup = 0; r.tax = 0;
          for (const k of kids) { (res[k.id].markupPercent = it.markupPercent); }
          r.markup = r.total * (it.markupPercent / 100);
          const tx = it.taxable === false ? 0 : (r.total + r.markup) * taxRate;
          r.tax = tx;
        }
      }
      r.total = r.total; r.markupPercent = r.total ? (r.markup / r.total) * 100 : 0;
    } else {
      r.total = effQty * unit;
      r.markupPercent = it.markupPercent ?? estMarkup;
      r.markup = r.total * (r.markupPercent / 100);
      r.tax = it.taxable === false ? 0 : (r.total + r.markup) * taxRate;
    }
    r.totalIncMarkup = r.total + r.markup;
    r.displaySell = r.totalIncMarkup;
    void categoryId;
  }

  const roots = children.get(null) ?? [];
  roots.forEach((rt, i) => walk(rt, "", i + 1, 0, 1, rt.id));

  // Round per item for display stability
  for (const r of Object.values(res)) {
    r.total = r2(r.total); r.markup = r2(r.markup); r.tax = r2(r.tax);
    r.totalIncMarkup = r2(r.totalIncMarkup); r.displaySell = r2(r.displaySell); r.unitCost = r2(r.unitCost);
  }

  // Totals from roots (unrounded sums of rounded children would drift; recompute from leaves)
  const leaves = items.filter((it) => it.kind !== "category" && !(children.get(it.id)?.length));
  const byCostType: Record<string, number> = {};
  let cost = 0, markup = 0, tax = 0;
  for (const lf of leaves) {
    const r = res[lf.id];
    if (!r) continue;
    // markup/tax may have been overridden by a parent with markup override
    let mk = r.markup, tx = r.tax;
    const parent = lf.parentId ? items.find((x) => x.id === lf.parentId) : undefined;
    if (parent && parent.kind === "item" && parent.markupPercent != null) {
      mk = r.total * (parent.markupPercent / 100);
      tx = parent.taxable === false ? 0 : (r.total + mk) * taxRate;
    }
    cost += r.total; markup += mk; tax += tx;
    const ct = String(lf.costType ?? "Material");
    byCostType[ct] = r2((byCostType[ct] ?? 0) + r.total);
  }
  cost = r2(cost); markup = r2(markup); tax = r2(tax);

  // PC/PS redistribution: show PC/PS allowances at cost; move their markup into other items' display price.
  if (redistribution !== "none") {
    const isAllowance = (it: CalcItem) => it.allowanceType === "PC" || it.allowanceType === "PS";
    const catOf = (it: CalcItem): string => {
      let cur: CalcItem | undefined = it;
      while (cur && cur.parentId) cur = items.find((x) => x.id === cur!.parentId);
      return cur?.id ?? it.id;
    };
    const topItems = items.filter((it) => it.kind === "item" && (!it.parentId || items.find((p) => p.id === it.parentId)?.kind === "category"));
    const groups = new Map<string, CalcItem[]>();
    for (const it of topItems) {
      const g = redistribution === "across_estimate" ? "all" : catOf(it);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(it);
    }
    for (const list of groups.values()) {
      const allow = list.filter(isAllowance);
      const normal = list.filter((x) => !isAllowance(x));
      const pool = allow.reduce((s, a) => s + res[a.id].markup, 0);
      const base = normal.reduce((s, n) => s + res[n.id].totalIncMarkup, 0);
      if (!pool || !base) continue;
      for (const a of allow) res[a.id].displaySell = res[a.id].total;
      for (const n of normal) res[n.id].displaySell = r2(res[n.id].totalIncMarkup + pool * (res[n.id].totalIncMarkup / base));
    }
  }

  const markupPct = totalMarkupPercent(markupLines);
  const markupBreakdown = markupLines.map((l) => ({
    name: l.name,
    percent: l.percent,
    amount: markupPct ? r2(markup * (l.percent / markupPct)) : 0,
  }));

  const subtotalExTax = r2(cost + markup);
  const raw = r2(subtotalExTax + tax);
  const rounded = roundUpTo(raw, input.rounding ?? "none");
  const roundingAdjustment = r2(rounded - raw);

  const categoryTotals: CalcResult["categoryTotals"] = {};
  for (const rt of roots) {
    const r = res[rt.id];
    categoryTotals[rt.id] = { cost: r.total, sell: r.totalIncMarkup, sellIncTax: r2(r.totalIncMarkup + r.tax) };
  }

  return {
    items: res, order, costTotal: cost, markupTotal: markup, markupBreakdown, subtotalExTax,
    taxTotal: tax, roundingAdjustment, quoteTotal: r2(raw + roundingAdjustment), byCostType, categoryTotals, errors,
  };
}
