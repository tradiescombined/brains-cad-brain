import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./_shared";

/** Single-row business profile + global preferences. */
export const businessSettings = sqliteTable("business_settings", {
  id: id(),
  businessName: text("business_name").notNull().default("My Building Co"),
  tradingName: text("trading_name"),
  businessNumber: text("business_number"), // ABN / tax number
  licenceNumber: text("licence_number"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  cityTown: text("city_town"),
  state: text("state"),
  postcode: text("postcode"),
  country: text("country").notNull().default("Australia"),
  currency: text("currency").notNull().default("AUD"),
  logoDataUrl: text("logo_data_url"),
  brandColour: text("brand_colour").notNull().default("#0f766e"),
  defaultMarkupPercent: real("default_markup_percent").notNull().default(20),
  defaultTaxRateId: text("default_tax_rate_id"),
  quoteValidDays: integer("quote_valid_days").notNull().default(30),
  defaultInvoiceDueDays: integer("default_invoice_due_days").notNull().default(14),
  estimateNumberPrefix: text("estimate_number_prefix").notNull().default("Q"),
  nextEstimateNumber: integer("next_estimate_number").notNull().default(1000),
  jobNumberPrefix: text("job_number_prefix").notNull().default("J"),
  nextJobNumber: integer("next_job_number").notNull().default(1000),
  invoiceNumberPrefix: text("invoice_number_prefix").notNull().default("INV"),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1000),
  orderNumberPrefix: text("order_number_prefix").notNull().default("PO"),
  nextOrderNumber: integer("next_order_number").notNull().default(1000),
  variationNumberPrefix: text("variation_number_prefix").notNull().default("V"),
  nextVariationNumber: integer("next_variation_number").notNull().default(1),
  bankDetails: text("bank_details"),
  showDashboardQuickStart: integer("show_dashboard_quick_start", { mode: "boolean" }).notNull().default(true),
  showDashboardEstimateSummary: integer("show_dashboard_estimate_summary", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const users = sqliteTable("users", {
  id: id(),
  firstName: text("first_name").notNull(),
  surname: text("surname"),
  email: text("email").notNull(),
  mobile: text("mobile"),
  role: text("role", { enum: ["Owner", "Admin", "Estimator", "Project Manager", "Site Supervisor", "Read Only"] })
    .notNull()
    .default("Estimator"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

/** Tax rates e.g. GST 10% on income / GST free. */
export const taxRates = sqliteTable("tax_rates", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  rate: real("rate").notNull(), // 0.1 = 10%
  appliesTo: text("applies_to", { enum: ["income", "expense"] }).notNull().default("income"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/**
 * Generic lookup lists managed in Settings > Setup.
 * kind: estimate_status | building_type | unit_measure | contact_type |
 *       contact_group | client_source | client_type | lead_status | job_status | document_folder
 */
export const lookups = sqliteTable("lookups", {
  id: id(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  /** for estimate_status: marks the "accepted" status; for unit measures: abbreviation stored in name */
  flag: integer("flag", { mode: "boolean" }).notNull().default(false),
  colour: text("colour"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/** Notes attached to any record (estimate, job, client, lead, contact...). */
export const notes = sqliteTable("notes", {
  id: id(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  body: text("body").notNull(),
  author: text("author"),
  ...timestamps,
});

/** Uploaded files attached to any record. Stored as data URLs in DB for local-first simplicity. */
export const documents = sqliteTable("documents", {
  id: id(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  folder: text("folder").notNull().default("Unassigned"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  dataUrl: text("data_url"),
  ...timestamps,
});

/** Reminders / to-dos, optionally linked to a record. */
export const reminders = sqliteTable("reminders", {
  id: id(),
  title: text("title").notNull(),
  details: text("details"),
  dueDate: text("due_date"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  assignedTo: text("assigned_to"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  ...timestamps,
});

/** Activity feed / audit log. */
export const activity = sqliteTable("activity", {
  id: id(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamps.createdAt,
});
