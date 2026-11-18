/**
 * Quote document model (serialisable) + pure view logic that applies the print options.
 * Built on the server by ./data.ts, rendered by <QuoteDocument>.
 */
import type { SpecNode } from "./spec-tree";
import type { SpecItemInput } from "./spec-costings";

export type AllowanceKind = "none" | "PC" | "PS";
export type AllowancePrint = "hide" | "show_total" | "show_items";

export interface QuoteLine {
  id: string;
  number: string;
  description: string;
  quantity: number;
  uom: string | null;
  /** Sell price ex tax after PC/PS redistribution (calc displaySell). */
  sell: number;
  allowanceType: AllowanceKind;
  hidden: boolean;
}

export interface QuoteCategory {
  id: string;
  number: string;
  name: string;
  hidden: boolean;
  sell: number;
  sellIncTax: number;
  items: QuoteLine[];
}

export interface QuoteBusiness {
  name: string;
  legalName: string | null;
  abn: string | null;
  licence: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string;
  logoDataUrl: string | null;
  brandColour: string;
}

export interface QuoteModel {
  business: QuoteBusiness;
  estimate: {
    id: string;
    number: string;
    name: string;
    status: string;
    clientName: string | null;
    clientEmail: string | null;
    clientPhone: string | null;
    clientAddress: string;
    siteAddress: string;
  };
  issueDate: string; // YYYY-MM-DD
  taxLabel: string;
  categories: QuoteCategory[];
  totals: {
    costTotal: number;
    markupTotal: number;
    markupBreakdown: { name: string; percent: number; amount: number }[];
    subtotalExTax: number;
    taxTotal: number;
    roundingAdjustment: number;
    quoteTotal: number;
  };
  specIntro: string | null;
  specs: SpecNode[];
  /** Spec-flagged costing items in costing order (with category, detail text and image). */
  specItems: SpecItemInput[];
  acceptance: { name: string; signedAt: string } | null;
  /** Estimate schedule summary (tasks in order, working-day dates). */
  schedule?: QuoteScheduleTask[];
}

export interface QuoteScheduleTask {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD
  finish: string; // YYYY-MM-DD
  durationDays: number;
}

/** The print/letter options (subset of the quote_options row the document needs). */
export interface QuoteOptionValues {
  title: string;
  validDays: number;
  coverLetter: string | null;
  termsAndConditions: string | null;
  printBusinessInfo: boolean;
  printLogo: boolean;
  printCategories: boolean;
  printCategoryTotals: boolean;
  categoryTotalsIncludeTax: boolean;
  printItems: boolean;
  printQuantities: boolean;
  printUnitMeasures: boolean;
  printItemTotals: boolean;
  printZeroDollarItems: boolean;
  printSpecifications: boolean;
  printSpecificationNumbers: boolean;
  printInitialsArea: boolean;
  printSchedule: boolean;
  showMarkup: boolean;
  pcPrintOption: string;
  psPrintOption: string;
}

export const BOOLEAN_OPTIONS = [
  "printBusinessInfo", "printLogo", "printCategories", "printCategoryTotals", "categoryTotalsIncludeTax", "printItems",
  "printQuantities", "printUnitMeasures", "printItemTotals", "printZeroDollarItems", "printSpecifications",
  "printSpecificationNumbers", "printInitialsArea", "printSchedule", "showMarkup",
] as const satisfies readonly (keyof QuoteOptionValues)[];

export const ALLOWANCE_PRINT_OPTIONS: { value: AllowancePrint; label: string }[] = [
  { value: "hide", label: "Hide" },
  { value: "show_total", label: "Show total only" },
  { value: "show_items", label: "Show each allowance" },
];

export function asAllowancePrint(v: string | null | undefined): AllowancePrint {
  return v === "hide" || v === "show_items" ? v : "show_total";
}

export interface ScopeSection {
  id: string;
  number: string;
  name: string;
  /** Category total to print, or null when category totals are off. */
  total: number | null;
  items: QuoteLine[];
}

export interface AllowanceGroup {
  kind: "PC" | "PS";
  label: string;
  mode: AllowancePrint;
  total: number;
  items: QuoteLine[];
}

export interface QuoteView {
  /** Categories (when printCategories) or a single unnamed section with all items. */
  sections: ScopeSection[];
  showCategories: boolean;
  showItems: boolean;
  allowances: AllowanceGroup[];
  hasScope: boolean;
}

/** Applies print options to the model's scope. Pure; unit tested. */
export function buildQuoteView(model: QuoteModel, o: QuoteOptionValues): QuoteView {
  const visibleCats = model.categories.filter((c) => !c.hidden);
  const keepItem = (it: QuoteLine) => !it.hidden && it.allowanceType === "none" && (o.printZeroDollarItems || Math.abs(it.sell) >= 0.005);
  const showItems = o.printItems;
  const showCategories = o.printCategories;

  let sections: ScopeSection[] = [];
  if (showCategories) {
    sections = visibleCats.map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      total: o.printCategoryTotals ? (o.categoryTotalsIncludeTax ? c.sellIncTax : c.sell) : null,
      items: showItems ? c.items.filter(keepItem) : [],
    }));
  } else if (showItems) {
    const items = visibleCats.flatMap((c) => c.items.filter(keepItem));
    if (items.length) sections = [{ id: "all", number: "", name: "", total: null, items }];
  }

  const allowances: AllowanceGroup[] = [];
  for (const kind of ["PC", "PS"] as const) {
    const mode = asAllowancePrint(kind === "PC" ? o.pcPrintOption : o.psPrintOption);
    const items = model.categories.flatMap((c) => c.items.filter((i) => i.allowanceType === kind && !i.hidden));
    if (mode === "hide" || !items.length) continue;
    allowances.push({
      kind,
      label: kind === "PC" ? "Prime cost (PC) allowances" : "Provisional sum (PS) allowances",
      mode,
      total: Math.round(items.reduce((s, i) => s + i.sell, 0) * 100) / 100,
      items: mode === "show_items" ? items : [],
    });
  }

  return { sections, showCategories, showItems, allowances, hasScope: sections.length > 0 || allowances.length > 0 };
}
