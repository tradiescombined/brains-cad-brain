import "server-only";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { calcLoaded, loadEstimate } from "@/lib/estimates";
import { getSettings } from "@/lib/settings";
import { joinAddress, quoteIssueDate } from "@/lib/merge-fields";
import { todayIso } from "@/lib/format";
import { fromRows } from "./spec-tree";
import { normaliseDuration, taskFinish, taskStart } from "@/lib/scheduling";
import { DEFAULT_COVER_LETTER, DEFAULT_TERMS, DEFAULT_QUOTE_TITLE } from "./defaults";
import type { QuoteCategory, QuoteModel, QuoteOptionValues, QuoteLine, AllowanceKind } from "./model";

export type QuoteOptionsRow = typeof schema.quoteOptions.$inferSelect;

/** Returns the estimate's quote options, creating the row with defaults on first use. */
export async function getOrCreateQuoteOptions(estimateId: string): Promise<QuoteOptionsRow> {
  const [row] = await db.select().from(schema.quoteOptions).where(eq(schema.quoteOptions.estimateId, estimateId));
  if (row) return row;
  const s = await getSettings();
  await db
    .insert(schema.quoteOptions)
    .values({
      estimateId,
      title: DEFAULT_QUOTE_TITLE,
      validDays: s.quoteValidDays ?? 30,
      coverLetter: s.defaultCoverLetter || DEFAULT_COVER_LETTER,
      termsAndConditions: s.defaultTermsAndConditions || DEFAULT_TERMS,
    })
    .onConflictDoNothing();
  const [created] = await db.select().from(schema.quoteOptions).where(eq(schema.quoteOptions.estimateId, estimateId));
  return created;
}

export function toOptionValues(r: QuoteOptionsRow): QuoteOptionValues {
  return {
    title: r.title, validDays: r.validDays, coverLetter: r.coverLetter, termsAndConditions: r.termsAndConditions,
    printBusinessInfo: r.printBusinessInfo, printLogo: r.printLogo, printCategories: r.printCategories,
    printCategoryTotals: r.printCategoryTotals, categoryTotalsIncludeTax: r.categoryTotalsIncludeTax, printItems: r.printItems,
    printQuantities: r.printQuantities, printUnitMeasures: r.printUnitMeasures, printItemTotals: r.printItemTotals,
    printZeroDollarItems: r.printZeroDollarItems, printSpecifications: r.printSpecifications,
    printSpecificationNumbers: r.printSpecificationNumbers, printInitialsArea: r.printInitialsArea, printSchedule: r.printSchedule, showMarkup: r.showMarkup,
    pcPrintOption: r.pcPrintOption, psPrintOption: r.psPrintOption,
  };
}

export async function loadSpecRows(estimateId: string) {
  return db
    .select()
    .from(schema.specifications)
    .where(eq(schema.specifications.estimateId, estimateId))
    .orderBy(asc(schema.specifications.sortOrder));
}

/** Builds the serialisable document model for an estimate (numbers from the calc engine). */
export async function loadQuoteModel(estimateId: string, options?: QuoteOptionsRow): Promise<QuoteModel | null> {
  const l = await loadEstimate(estimateId);
  if (!l) return null;
  const r = calcLoaded(l);
  const s = await getSettings();
  const e = l.estimate;
  const opts = options ?? (await getOrCreateQuoteOptions(estimateId));

  const kids = new Map<string | null, typeof l.items>();
  for (const it of l.items) {
    const k = it.parentId ?? null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k)!.push(it);
  }
  for (const list of kids.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  const toLine = (it: (typeof l.items)[number]): QuoteLine => {
    const ri = r.items[it.id];
    return {
      id: it.id,
      number: ri?.number ?? "",
      description: it.description || "Untitled item",
      quantity: ri?.quantity ?? it.quantity,
      uom: it.uom,
      sell: ri?.displaySell ?? 0,
      allowanceType: (it.allowanceType as AllowanceKind) ?? "none",
      hidden: it.hiddenOnQuote,
    };
  };

  const categories: QuoteCategory[] = [];
  const looseItems: QuoteLine[] = [];
  for (const root of kids.get(null) ?? []) {
    if (root.kind === "category") {
      const t = r.categoryTotals[root.id];
      categories.push({
        id: root.id,
        number: r.items[root.id]?.number ?? "",
        name: root.description || "Untitled category",
        hidden: root.hiddenOnQuote,
        sell: t?.sell ?? 0,
        sellIncTax: t?.sellIncTax ?? 0,
        items: (kids.get(root.id) ?? []).map(toLine),
      });
    } else {
      looseItems.push(toLine(root));
    }
  }
  if (looseItems.length) {
    const sell = looseItems.reduce((s2, i) => s2 + (r.items[i.id]?.totalIncMarkup ?? 0), 0);
    const tax = looseItems.reduce((s2, i) => s2 + (r.items[i.id]?.tax ?? 0), 0);
    categories.push({ id: "_loose", number: "", name: "Other items", hidden: false, sell, sellIncTax: sell + tax, items: looseItems });
  }

  const specRows = await loadSpecRows(estimateId);
  const taskRows = await db
    .select()
    .from(schema.estimateTasks)
    .where(eq(schema.estimateTasks.estimateId, estimateId))
    .orderBy(asc(schema.estimateTasks.sortOrder), asc(schema.estimateTasks.startDate));
  const taxRow = l.taxRateRow;
  const pct = Math.round((taxRow?.rate ?? 0) * 10000) / 100;
  const taxLabel = taxRow ? `${/gst/i.test(taxRow.code) ? "GST" : taxRow.code} (${pct}%)` : "Tax";

  return {
    business: {
      name: s.tradingName || s.businessName,
      legalName: s.tradingName && s.tradingName !== s.businessName ? s.businessName : null,
      abn: s.businessNumber,
      licence: s.licenceNumber,
      email: s.email,
      phone: s.phone,
      website: s.website,
      address: joinAddress(s.address, s.cityTown, s.state, s.postcode),
      logoDataUrl: s.logoDataUrl,
      brandColour: /^#[0-9a-f]{3,8}$/i.test(s.brandColour ?? "") ? s.brandColour : "#0f766e",
    },
    estimate: {
      id: e.id,
      number: e.number,
      name: e.name,
      status: e.status,
      clientName: e.clientName,
      clientEmail: e.clientEmail,
      clientPhone: e.clientMobile || e.clientPhone,
      clientAddress: joinAddress(e.clientAddress, e.clientCityTown, e.clientState, e.clientPostcode),
      siteAddress: joinAddress(e.siteAddress, e.siteCityTown, e.siteState, e.sitePostcode),
    },
    issueDate: quoteIssueDate(e.sentAt, e.datePrepared, todayIso()),
    taxLabel,
    categories,
    totals: {
      costTotal: r.costTotal,
      markupTotal: r.markupTotal,
      markupBreakdown: r.markupBreakdown,
      subtotalExTax: r.subtotalExTax,
      taxTotal: r.taxTotal,
      roundingAdjustment: r.roundingAdjustment,
      quoteTotal: r.quoteTotal,
    },
    specIntro: e.specificationIntro,
    specs: fromRows(specRows),
    inclusions: l.items
      .filter((i) => i.kind === "item" && i.showInSpecification)
      .sort((a, b) => (r.order.indexOf(a.id) - r.order.indexOf(b.id)))
      .map((i) => ({ id: i.id, description: i.description || "Untitled item", quantity: r.items[i.id]?.quantity ?? i.quantity, uom: i.uom, notes: i.notes })),
    schedule: taskRows.map((t) => ({ id: t.id, name: t.name, start: taskStart(t), finish: taskFinish(t), durationDays: normaliseDuration(t.durationDays) })),
    acceptance: opts.acceptanceSignedAt && opts.acceptanceSignatureName ? { name: opts.acceptanceSignatureName, signedAt: opts.acceptanceSignedAt } : null,
  };
}

/** Finds the estimate + options for a public share token (null if revoked/unknown/archived). */
export async function findByShareToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [opts] = await db.select().from(schema.quoteOptions).where(eq(schema.quoteOptions.shareToken, token));
  if (!opts) return null;
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, opts.estimateId));
  if (!est || est.archived) return null;
  return { options: opts, estimate: est };
}
