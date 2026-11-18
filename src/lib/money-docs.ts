/**
 * Pure maths + rules for purchase orders, variations and invoices (module 10).
 * No DB access here so it can be unit tested and used from client components.
 *
 * Conventions:
 * - Tax rates are fractions (0.1 = 10%).
 * - Money is rounded to cents at line and document level.
 * - jobs.contractValue is GST-inclusive (quote total + approved variation totals), so
 *   claims expressed as "% of contract" are inc-tax amounts and are converted back to
 *   ex-tax line amounts before tax is applied.
 */

export const round2 = (n: number) => {
  const v = Number(n) || 0;
  const r = Math.round(Math.abs(v) * 100 * (1 + Number.EPSILON)) / 100;
  return v < 0 ? -r : r;
};
const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

// ---------------------------------------------------------------- Purchase orders

export const PO_STATUSES = ["Draft", "Sent", "Confirmed", "Delivered", "Billed", "Cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export type PoLine = {
  description: string;
  itemCode: string;
  quantity: number;
  uom: string;
  unitCost: number;
  costType?: string;
  budgetLineId?: string | null;
};

export function poLineTotal(l: Pick<PoLine, "quantity" | "unitCost">): number {
  return round2(num(l.quantity) * num(l.unitCost));
}

export function poTotals(lines: Pick<PoLine, "quantity" | "unitCost">[], taxRate: number) {
  const subtotal = round2(lines.reduce((s, l) => s + poLineTotal(l), 0));
  const tax = round2(subtotal * num(taxRate));
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/** Manual status changes allowed from the PO editor. "Billed" is only reached via Record bill. */
export function poNextStatuses(s: PoStatus): PoStatus[] {
  switch (s) {
    case "Draft": return ["Sent", "Cancelled"];
    case "Sent": return ["Confirmed", "Delivered", "Draft", "Cancelled"];
    case "Confirmed": return ["Delivered", "Sent", "Cancelled"];
    case "Delivered": return ["Confirmed", "Cancelled"];
    case "Cancelled": return ["Draft"];
    case "Billed": return [];
  }
}

export function canBillPo(s: PoStatus) {
  return s === "Sent" || s === "Confirmed" || s === "Delivered";
}

export function parsePoLines(json: string | null | undefined): PoLine[] {
  return parseArr(json).map((r) => ({
    description: str(r.description),
    itemCode: str(r.itemCode),
    quantity: num(r.quantity),
    uom: str(r.uom),
    unitCost: num(r.unitCost),
    costType: str(r.costType) || "Material",
    budgetLineId: r.budgetLineId ? String(r.budgetLineId) : null,
  }));
}

/** Drops empty rows and normalises numbers. A row is kept if it has a description. */
export function cleanPoLines(lines: PoLine[]): PoLine[] {
  return lines
    .filter((l) => str(l.description))
    .map((l) => ({ ...l, description: str(l.description), quantity: round3(num(l.quantity)), unitCost: round2(num(l.unitCost)) }));
}

export type BudgetPick = { budgetLineId: string; supplierId: string | null; description: string; uom: string | null; quantity: number; unitCost: number; costType: string };

/** Groups picked budget lines by supplier → one draft PO's lines per supplier (null = unassigned). */
export function groupBudgetPicksBySupplier(picks: BudgetPick[]): Map<string | null, PoLine[]> {
  const out = new Map<string | null, PoLine[]>();
  for (const p of picks) {
    const k = p.supplierId || null;
    const arr = out.get(k) ?? [];
    arr.push({ description: p.description, itemCode: "", quantity: num(p.quantity), uom: p.uom ?? "", unitCost: num(p.unitCost), costType: p.costType, budgetLineId: p.budgetLineId });
    out.set(k, arr);
  }
  return out;
}

/** Picks a single cost type for an actual-cost row created from a PO (most common, ties → first). */
export function dominantCostType(lines: Pick<PoLine, "costType" | "quantity" | "unitCost">[]): string {
  const tally = new Map<string, number>();
  for (const l of lines) {
    const k = l.costType || "Material";
    tally.set(k, (tally.get(k) ?? 0) + Math.abs(poLineTotal(l)) + 1e-9);
  }
  let best = "Material", bestV = -1;
  for (const [k, v] of tally) if (v > bestV) { best = k; bestV = v; }
  return best;
}

// ---------------------------------------------------------------- Variations

export const VARIATION_STATUSES = ["Draft", "Sent", "Approved", "Rejected"] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];
export const COST_TYPES = ["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"] as const;

export type VariationLine = { description: string; quantity: number; uom: string; unitCost: number; costType: string };

export function variationTotals(lines: Pick<VariationLine, "quantity" | "unitCost">[], markupPercent: number, taxRate: number) {
  const cost = round2(lines.reduce((s, l) => s + poLineTotal(l), 0));
  const markup = round2(cost * num(markupPercent) / 100);
  const subtotal = round2(cost + markup);
  const tax = round2(subtotal * num(taxRate));
  return { cost, markup, subtotal, tax, total: round2(subtotal + tax) };
}

export function parseVariationLines(json: string | null | undefined): VariationLine[] {
  return parseArr(json).map((r) => ({
    description: str(r.description),
    quantity: num(r.quantity),
    uom: str(r.uom),
    unitCost: num(r.unitCost),
    costType: (COST_TYPES as readonly string[]).includes(str(r.costType)) ? str(r.costType) : "Material",
  }));
}

export function cleanVariationLines(lines: VariationLine[]): VariationLine[] {
  return lines
    .filter((l) => str(l.description))
    .map((l) => ({ ...l, description: str(l.description), quantity: round3(num(l.quantity)), unitCost: round2(num(l.unitCost)) }));
}

/**
 * Contract value change when a variation moves between statuses.
 * Entering Approved adds its total; leaving Approved subtracts it.
 */
export function contractDeltaForVariation(from: VariationStatus, to: VariationStatus, total: number): number {
  if (from === to) return 0;
  if (to === "Approved") return round2(total);
  if (from === "Approved") return round2(-total);
  return 0;
}

// ---------------------------------------------------------------- Invoices

export const INVOICE_KINDS = ["Deposit", "Progress claim", "Variation", "Final", "Other"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_STATUSES = ["Draft", "Sent", "Part paid", "Paid", "Void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAYMENT_METHODS = ["Bank transfer", "Card", "Cash", "Cheque", "Other"] as const;

export type InvoiceLine = { description: string; amount: number; taxable: boolean; variationId?: string | null };

export function invoiceTotals(lines: Pick<InvoiceLine, "amount" | "taxable">[], taxRate: number) {
  const subtotal = round2(lines.reduce((s, l) => s + num(l.amount), 0));
  const taxable = round2(lines.filter((l) => l.taxable).reduce((s, l) => s + num(l.amount), 0));
  const tax = round2(taxable * num(taxRate));
  return { subtotal, tax, total: round2(subtotal + tax) };
}

export function parseInvoiceLines(json: string | null | undefined): InvoiceLine[] {
  return parseArr(json).map((r) => ({
    description: str(r.description),
    amount: num(r.amount),
    taxable: r.taxable === undefined ? true : Boolean(r.taxable),
    variationId: r.variationId ? String(r.variationId) : null,
  }));
}

export function cleanInvoiceLines(lines: InvoiceLine[]): InvoiceLine[] {
  return lines.filter((l) => str(l.description) || num(l.amount) !== 0).map((l) => ({ ...l, description: str(l.description) || "Item", amount: round2(num(l.amount)) }));
}

/** Converts a GST-inclusive amount to the ex-tax line amount. */
export function exTax(incAmount: number, taxRate: number) {
  return round2(num(incAmount) / (1 + num(taxRate)));
}

/** A share of contract (inc tax) as an ex-tax line amount. percent is 0..100. */
export function percentOfContractExTax(contractValue: number, percent: number, taxRate: number) {
  return exTax(num(contractValue) * num(percent) / 100, taxRate);
}

/**
 * Progress claim by cumulative % complete.
 * previouslyClaimed: inc-tax total of earlier contract claims (deposit + progress claims).
 * Returns this claim's inc-tax amount and its % of the contract.
 */
export function progressClaim(opts: { contractValue: number; previouslyClaimed: number; cumulativePercent: number }) {
  const contract = num(opts.contractValue);
  const prevPct = contract > 0 ? (num(opts.previouslyClaimed) / contract) * 100 : 0;
  const cumulative = Math.min(100, Math.max(0, num(opts.cumulativePercent)));
  const thisPct = Math.max(0, cumulative - prevPct);
  const amount = round2((thisPct / 100) * contract);
  return { previousPercent: round2(prevPct), cumulativePercent: cumulative, thisPercent: round2(thisPct), amount };
}

/** Derives invoice status from payments. Draft and Void are kept unless payments push it to paid states. */
export function statusFromPayments(current: InvoiceStatus, total: number, paid: number): InvoiceStatus {
  if (current === "Void") return "Void";
  const t = round2(total), p = round2(paid);
  if (p > 0 && p >= t) return "Paid";
  if (p > 0) return "Part paid";
  return current === "Draft" ? "Draft" : "Sent";
}

export function balanceDue(total: number, paid: number) {
  return round2(num(total) - num(paid));
}

const DAY = 86400000;
const dayNum = (iso: string) => Math.floor(new Date(iso.slice(0, 10) + "T00:00:00Z").getTime() / DAY);

/** Whole days past due (0 if not yet due or no due date). */
export function daysOverdue(dueDate: string | null | undefined, today: string): number {
  if (!dueDate) return 0;
  return Math.max(0, dayNum(today) - dayNum(dueDate));
}

export function isOutstanding(inv: { status: string; total: number; amountPaid: number }) {
  return (inv.status === "Sent" || inv.status === "Part paid") && balanceDue(inv.total, inv.amountPaid) > 0.004;
}

export function isOverdue(inv: { status: string; total: number; amountPaid: number; dueDate: string | null }, today: string) {
  return isOutstanding(inv) && daysOverdue(inv.dueDate, today) > 0;
}

export const AGEING_BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function ageingBucket(days: number): AgeingBucket {
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

/** Sums outstanding balances into ageing buckets. */
export function ageing(invs: { status: string; total: number; amountPaid: number; dueDate: string | null }[], today: string) {
  const buckets = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<AgeingBucket, number>;
  let outstanding = 0, overdue = 0, count = 0;
  for (const i of invs) {
    if (!isOutstanding(i)) continue;
    const bal = balanceDue(i.total, i.amountPaid);
    const d = daysOverdue(i.dueDate, today);
    buckets[ageingBucket(d)] = round2(buckets[ageingBucket(d)] + bal);
    outstanding = round2(outstanding + bal);
    if (d > 0) overdue = round2(overdue + bal);
    count++;
  }
  return { buckets, outstanding, overdue, count };
}

/** Contract position of a job given its invoices and approved variation totals. */
export function contractSummary(opts: {
  contractValue: number;
  approvedVariations: number;
  invoices: { kind: string; status: string; total: number; amountPaid: number }[];
}) {
  const contract = round2(opts.contractValue);
  const variations = round2(opts.approvedVariations);
  const base = round2(contract - variations);
  const live = opts.invoices.filter((i) => i.status !== "Void");
  const invoiced = round2(live.reduce((s, i) => s + num(i.total), 0));
  const paid = round2(live.reduce((s, i) => s + num(i.amountPaid), 0));
  const contractClaims = round2(live.filter((i) => i.kind === "Deposit" || i.kind === "Progress claim").reduce((s, i) => s + num(i.total), 0));
  return {
    contract,
    base,
    variations,
    invoiced,
    paid,
    contractClaims,
    claimedPercent: contract > 0 ? round2((invoiced / contract) * 100) : 0,
    remaining: round2(contract - invoiced),
  };
}

// ---------------------------------------------------------------- helpers

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function parseArr(json: string | null | undefined): Record<string, unknown>[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
  } catch {
    return [];
  }
}
