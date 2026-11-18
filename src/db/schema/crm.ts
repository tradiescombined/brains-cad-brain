import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { id, timestamps, archived } from "./_shared";

/** Clients (customers) the builder quotes for. */
export const clients = sqliteTable("clients", {
  id: id(),
  name: text("name").notNull(),
  clientType: text("client_type", { enum: ["Person", "Business"] }).notNull().default("Person"),
  businessName: text("business_name"),
  businessNumber: text("business_number"),
  email: text("email"),
  mobile: text("mobile"),
  phone: text("phone"),
  address: text("address"),
  cityTown: text("city_town"),
  state: text("state"),
  postcode: text("postcode"),
  source: text("source"), // lookup client_source
  category: text("category"), // lookup client_type
  defaultInvoiceDays: integer("default_invoice_days"),
  isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
  ...archived,
  ...timestamps,
});

/** Additional people attached to a client. */
export const clientContacts = sqliteTable("client_contacts", {
  id: id(),
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  mobile: text("mobile"),
  phone: text("phone"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
});

/** Suppliers, subcontractors and other contacts. */
export const contacts = sqliteTable("contacts", {
  id: id(),
  name: text("name").notNull(),
  businessName: text("business_name"),
  contactType: text("contact_type"), // lookup contact_type e.g. Supplier, Subcontractor
  groups: text("groups"), // JSON array of contact_group names
  trade: text("trade"),
  email: text("email"),
  mobile: text("mobile"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  cityTown: text("city_town"),
  state: text("state"),
  postcode: text("postcode"),
  businessNumber: text("business_number"),
  /** Registered for GST: their bills/orders attract GST. */
  gstRegistered: integer("gst_registered", { mode: "boolean" }).notNull().default(true),
  accountNumber: text("account_number"),
  paymentTermsDays: integer("payment_terms_days"),
  insuranceExpiry: text("insurance_expiry"),
  licenceNumber: text("licence_number"),
  rating: integer("rating"),
  notes: text("notes"),
  ...archived,
  ...timestamps,
});

/** Sales pipeline leads. */
export const leads = sqliteTable("leads", {
  id: id(),
  number: text("number"),
  title: text("title").notNull(),
  clientId: text("client_id"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  cityTown: text("city_town"),
  state: text("state"),
  postcode: text("postcode"),
  stage: text("stage", { enum: ["New", "Contacted", "Site visit", "Quoting", "Quote sent", "Won", "Lost"] })
    .notNull()
    .default("New"),
  source: text("source"),
  buildingType: text("building_type"),
  estimatedValue: real("estimated_value"),
  probability: integer("probability"),
  expectedStart: text("expected_start"),
  followUpDate: text("follow_up_date"),
  assignedTo: text("assigned_to"),
  lostReason: text("lost_reason"),
  description: text("description"),
  ...archived,
  ...timestamps,
});
