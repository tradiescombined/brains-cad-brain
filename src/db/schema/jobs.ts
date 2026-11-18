import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { id, timestamps, archived } from "./_shared";

/** A job created from an accepted estimate (or from scratch). */
export const jobs = sqliteTable("jobs", {
  id: id(),
  number: text("number").notNull(),
  name: text("name").notNull(),
  estimateId: text("estimate_id"),
  clientId: text("client_id"),
  status: text("status", { enum: ["Not started", "In progress", "On hold", "Completed", "Cancelled"] })
    .notNull()
    .default("Not started"),
  siteAddress: text("site_address"),
  siteCityTown: text("site_city_town"),
  siteState: text("site_state"),
  sitePostcode: text("site_postcode"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  projectManager: text("project_manager"),
  /** Contract value = accepted quote total at job creation, plus approved variations. */
  contractValue: real("contract_value").notNull().default(0),
  description: text("description"),
  ...archived,
  ...timestamps,
});

/** Budget lines copied from the estimate costings at job creation (cost tracking baseline). */
export const jobBudgetLines = sqliteTable("job_budget_lines", {
  id: id(),
  jobId: text("job_id").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  costType: text("cost_type").notNull().default("Material"),
  uom: text("uom"),
  quantity: real("quantity").notNull().default(0),
  unitCost: real("unit_cost").notNull().default(0),
  budget: real("budget").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Schedule tasks (Gantt). */
export const jobTasks = sqliteTable("job_tasks", {
  id: id(),
  jobId: text("job_id").notNull(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  durationDays: integer("duration_days").notNull().default(1),
  /** JSON array of predecessor task ids (finish-to-start). */
  dependsOn: text("depends_on").notNull().default("[]"),
  assigneeContactId: text("assignee_contact_id"),
  progress: integer("progress").notNull().default(0), // 0-100
  colour: text("colour"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/** Change orders. */
export const variations = sqliteTable("variations", {
  id: id(),
  jobId: text("job_id").notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["Draft", "Sent", "Approved", "Rejected"] }).notNull().default("Draft"),
  /** JSON array of {description, quantity, uom, unitCost, costType} */
  lines: text("lines").notNull().default("[]"),
  markupPercent: real("markup_percent").notNull().default(20),
  costTotal: real("cost_total").notNull().default(0),
  taxTotal: real("tax_total").notNull().default(0),
  total: real("total").notNull().default(0), // inc markup & tax
  approvedAt: text("approved_at"),
  ...timestamps,
});

/** Client invoices / progress claims. */
export const invoices = sqliteTable("invoices", {
  id: id(),
  jobId: text("job_id").notNull(),
  number: text("number").notNull(),
  kind: text("kind", { enum: ["Deposit", "Progress claim", "Variation", "Final", "Other"] }).notNull().default("Progress claim"),
  status: text("status", { enum: ["Draft", "Sent", "Part paid", "Paid", "Void"] }).notNull().default("Draft"),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date"),
  /** JSON array of {description, amount (ex tax), taxable} */
  lines: text("lines").notNull().default("[]"),
  /** Claim as % of contract (for progress claims) */
  claimPercent: real("claim_percent"),
  subtotal: real("subtotal").notNull().default(0),
  taxTotal: real("tax_total").notNull().default(0),
  total: real("total").notNull().default(0),
  amountPaid: real("amount_paid").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
});

/** Payments received against client invoices. Invoice amountPaid + status are derived from these. */
export const payments = sqliteTable("payments", {
  id: id(),
  invoiceId: text("invoice_id").notNull(),
  date: text("date").notNull(),
  amount: real("amount").notNull().default(0),
  method: text("method").notNull().default("Bank transfer"),
  reference: text("reference"),
  notes: text("notes"),
  ...timestamps,
});

/** Purchase orders / material orders to suppliers & subcontractors. */
export const purchaseOrders = sqliteTable("purchase_orders", {
  id: id(),
  jobId: text("job_id"),
  number: text("number").notNull(),
  supplierId: text("supplier_id"),
  status: text("status", { enum: ["Draft", "Sent", "Confirmed", "Delivered", "Billed", "Cancelled"] }).notNull().default("Draft"),
  orderDate: text("order_date").notNull(),
  deliveryDate: text("delivery_date"),
  deliveryAddress: text("delivery_address"),
  deliveryInstructions: text("delivery_instructions"),
  /** JSON array of {description, itemCode, quantity, uom, unitCost} */
  lines: text("lines").notNull().default("[]"),
  subtotal: real("subtotal").notNull().default(0),
  taxTotal: real("tax_total").notNull().default(0),
  total: real("total").notNull().default(0),
  ...timestamps,
});

/** Actual costs (supplier bills, receipts, labour) recorded against a job. */
export const actualCosts = sqliteTable("actual_costs", {
  id: id(),
  jobId: text("job_id").notNull(),
  budgetLineId: text("budget_line_id"),
  purchaseOrderId: text("purchase_order_id"),
  supplierId: text("supplier_id"),
  date: text("date").notNull(),
  reference: text("reference"),
  description: text("description").notNull(),
  costType: text("cost_type").notNull().default("Material"),
  amount: real("amount").notNull().default(0), // ex tax
  tax: real("tax").notNull().default(0),
  ...timestamps,
});

/** Timesheet entries. */
export const timesheets = sqliteTable("timesheets", {
  id: id(),
  jobId: text("job_id").notNull(),
  worker: text("worker").notNull(),
  date: text("date").notNull(),
  hours: real("hours").notNull().default(0),
  rate: real("rate").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
});

/** Client selections (fixtures/finishes the client picks). */
export const selections = sqliteTable("selections", {
  id: id(),
  jobId: text("job_id"),
  estimateId: text("estimate_id"),
  category: text("category").notNull(),
  name: text("name").notNull(),
  options: text("options").notNull().default("[]"), // JSON [{name, price, imageUrl}]
  chosenOption: text("chosen_option"),
  allowance: real("allowance"),
  dueDate: text("due_date"),
  status: text("status", { enum: ["Pending", "Selected", "Approved"] }).notNull().default("Pending"),
  ...archived,
  ...timestamps,
});
