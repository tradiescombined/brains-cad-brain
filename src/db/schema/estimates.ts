import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { id, timestamps, archived } from "./_shared";

export const estimates = sqliteTable("estimates", {
  id: id(),
  number: text("number").notNull(), // e.g. Q1000
  name: text("name").notNull(),
  status: text("status").notNull().default("Draft"), // lookup estimate_status
  buildingType: text("building_type"),
  clientId: text("client_id"),
  leadId: text("lead_id"),
  jobId: text("job_id"),
  // Client snapshot (estimate can carry its own client details)
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  clientMobile: text("client_mobile"),
  clientPhone: text("client_phone"),
  clientAddress: text("client_address"),
  clientCityTown: text("client_city_town"),
  clientState: text("client_state"),
  clientPostcode: text("client_postcode"),
  source: text("source"),
  // Work location
  siteAddress: text("site_address"),
  siteCityTown: text("site_city_town"),
  siteState: text("site_state"),
  sitePostcode: text("site_postcode"),
  datePrepared: text("date_prepared"),
  /** JSON: [{ name: "Markup", percent: 18 }, { name: "Contingency", percent: 2 }] */
  markupLines: text("markup_lines").notNull().default('[{"name":"Markup","percent":20}]'),
  taxRateId: text("tax_rate_id"),
  /** Default redistribution of markup for PC/PS items: none | across_estimate | within_category */
  pcpsRedistribution: text("pcps_redistribution").notNull().default("within_category"),
  /** Round quote total: none | dollar | ten | hundred | thousand */
  rounding: text("rounding").notNull().default("none"),
  // Cached totals (recomputed by calc engine on every save)
  costTotal: real("cost_total").notNull().default(0),
  markupTotal: real("markup_total").notNull().default(0),
  taxTotal: real("tax_total").notNull().default(0),
  quoteTotal: real("quote_total").notNull().default(0),
  isTemplate: integer("is_template", { mode: "boolean" }).notNull().default(false),
  isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
  acceptedAt: text("accepted_at"),
  sentAt: text("sent_at"),
  specificationIntro: text("specification_intro"),
  ...archived,
  ...timestamps,
});

/**
 * Costing rows. Tree: category (kind=category, parentId=null) > item > sub-item (recipe component).
 * For an item that has children, its unit cost = sum(child.quantity * child.unitCost) and
 * child totals scale with parent quantity.
 */
export const estimateItems = sqliteTable("estimate_items", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  parentId: text("parent_id"),
  kind: text("kind", { enum: ["category", "item"] }).notNull().default("item"),
  sortOrder: integer("sort_order").notNull().default(0),
  description: text("description").notNull().default(""),
  itemCode: text("item_code"),
  costType: text("cost_type", { enum: ["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"] })
    .notNull()
    .default("Material"),
  /** Normal, Prime Cost (PC) or Provisional Sum (PS) */
  allowanceType: text("allowance_type", { enum: ["none", "PC", "PS"] }).notNull().default("none"),
  uom: text("uom"),
  /** Quantity formula, e.g. "[M1]*[W10]" or "12.5". quantity is the evaluated result. */
  quantityExpr: text("quantity_expr"),
  quantity: real("quantity").notNull().default(0),
  unitCost: real("unit_cost").notNull().default(0),
  /** Item-level markup % override (null = use estimate markup). */
  markupPercent: real("markup_percent"),
  taxable: integer("taxable", { mode: "boolean" }).notNull().default(true),
  supplierId: text("supplier_id"), // contacts.id
  catalogueItemId: text("catalogue_item_id"),
  measurementId: text("measurement_id"),
  notes: text("notes"),
  showInSpecification: integer("show_in_specification", { mode: "boolean" }).notNull().default(false),
  hiddenOnQuote: integer("hidden_on_quote", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["Incomplete", "Complete"] }).notNull().default("Incomplete"),
  // Cached computed values
  total: real("total").notNull().default(0),
  totalIncMarkup: real("total_inc_markup").notNull().default(0),
});

/** Snapshot of an estimate at a point in time (JSON blob of estimate + items). */
export const estimateVersions = sqliteTable("estimate_versions", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  label: text("label").notNull(),
  snapshot: text("snapshot").notNull(),
  quoteTotal: real("quote_total"),
  createdAt: timestamps.createdAt,
});

/** Specification sections/clauses shown in the quote. */
export const specifications = sqliteTable("specifications", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  parentId: text("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  heading: text("heading").notNull(),
  body: text("body"),
  /** Top-level section linked to a costing category (estimate_items.id, kind=category); null = custom section. */
  categoryItemId: text("category_item_id"),
  ...timestamps,
});

/**
 * Per costing item specification detail (extra text + optional image) shown under the item's
 * linked category section. Kept out of estimate_items so costings/calc payloads stay small.
 */
export const specItemDetails = sqliteTable("spec_item_details", {
  id: id(),
  estimateId: text("estimate_id").notNull(),
  estimateItemId: text("estimate_item_id").notNull().unique(),
  body: text("body"),
  /** data:image/(png|jpeg|gif|webp);base64,… (size limited by the action). */
  imageDataUrl: text("image_data_url"),
  ...timestamps,
});

/** Reusable specification library. */
export const specificationTemplates = sqliteTable("specification_templates", {
  id: id(),
  name: text("name").notNull(),
  /** JSON array of {heading, body, children?} */
  content: text("content").notNull().default("[]"),
  ...timestamps,
});

/** Quote letter options per estimate (what prints and the letter text). */
export const quoteOptions = sqliteTable("quote_options", {
  id: id(),
  estimateId: text("estimate_id").notNull().unique(),
  title: text("title").notNull().default("Quotation"),
  validDays: integer("valid_days").notNull().default(30),
  coverLetter: text("cover_letter"),
  termsAndConditions: text("terms_and_conditions"),
  printBusinessInfo: integer("print_business_info", { mode: "boolean" }).notNull().default(true),
  printLogo: integer("print_logo", { mode: "boolean" }).notNull().default(true),
  printCategories: integer("print_categories", { mode: "boolean" }).notNull().default(true),
  printCategoryTotals: integer("print_category_totals", { mode: "boolean" }).notNull().default(false),
  categoryTotalsIncludeTax: integer("category_totals_include_tax", { mode: "boolean" }).notNull().default(true),
  printItems: integer("print_items", { mode: "boolean" }).notNull().default(false),
  printQuantities: integer("print_quantities", { mode: "boolean" }).notNull().default(true),
  printUnitMeasures: integer("print_unit_measures", { mode: "boolean" }).notNull().default(true),
  printItemTotals: integer("print_item_totals", { mode: "boolean" }).notNull().default(false),
  printZeroDollarItems: integer("print_zero_dollar_items", { mode: "boolean" }).notNull().default(true),
  printSpecifications: integer("print_specifications", { mode: "boolean" }).notNull().default(true),
  printSpecificationNumbers: integer("print_specification_numbers", { mode: "boolean" }).notNull().default(true),
  printInitialsArea: integer("print_initials_area", { mode: "boolean" }).notNull().default(false),
  showMarkup: integer("show_markup", { mode: "boolean" }).notNull().default(false),
  /** How PC / PS allowances print: hide | show_total | show_items */
  pcPrintOption: text("pc_print_option").notNull().default("show_total"),
  psPrintOption: text("ps_print_option").notNull().default("show_total"),
  acceptanceSignatureName: text("acceptance_signature_name"),
  acceptanceSignedAt: text("acceptance_signed_at"),
  /** Public share token for the client-facing online quote. */
  shareToken: text("share_token"),
  ...timestamps,
});

export type Estimate = typeof estimates.$inferSelect;
export type EstimateItem = typeof estimateItems.$inferSelect;
