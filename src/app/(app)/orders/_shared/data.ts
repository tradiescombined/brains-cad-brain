/** Server-side reads shared by the orders, variations and invoices screens (module 10). */
import "server-only";
import { db, schema } from "@/db";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDefaultTaxRate } from "@/lib/settings";
import { parseInvoiceLines, contractSummary } from "@/lib/money-docs";

/** Default tax rate for purchases (appliesTo "expense", isDefault), falling back to any expense rate. */
export async function getExpenseTaxRate() {
  const all = await db.select().from(schema.taxRates);
  return (
    all.find((t) => t.isDefault && t.appliesTo === "expense") ??
    all.find((t) => t.appliesTo === "expense" && t.active) ?? { id: "", code: "NONE", name: "No tax", rate: 0 }
  );
}

export async function getIncomeTaxRate() {
  return getDefaultTaxRate();
}

export async function listSuppliers() {
  return db
    .select({ id: schema.contacts.id, name: schema.contacts.name, businessName: schema.contacts.businessName, contactType: schema.contacts.contactType })
    .from(schema.contacts)
    .where(eq(schema.contacts.archived, false))
    .orderBy(asc(schema.contacts.name));
}

export async function listJobs() {
  return db
    .select({ id: schema.jobs.id, number: schema.jobs.number, name: schema.jobs.name })
    .from(schema.jobs)
    .where(eq(schema.jobs.archived, false))
    .orderBy(asc(schema.jobs.number));
}

export const supplierLabel = (s: { name: string; businessName: string | null }) => s.businessName && s.businessName !== s.name ? `${s.name} (${s.businessName})` : s.name;

export function jobSite(j: { siteAddress: string | null; siteCityTown: string | null; siteState: string | null; sitePostcode: string | null }) {
  return [j.siteAddress, [j.siteCityTown, j.siteState, j.sitePostcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** Contract position for a job, incl. approved variations and invoiced to date. */
export async function getJobContract(jobId: string, opts: { excludeInvoiceId?: string } = {}) {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) return null;
  const vars = await db.select().from(schema.variations).where(eq(schema.variations.jobId, jobId));
  const approvedVariations = vars.filter((v) => v.status === "Approved").reduce((s, v) => s + v.total, 0);
  const invWhere = opts.excludeInvoiceId ? and(eq(schema.invoices.jobId, jobId), ne(schema.invoices.id, opts.excludeInvoiceId)) : eq(schema.invoices.jobId, jobId);
  const invs = await db.select().from(schema.invoices).where(invWhere);
  const summary = contractSummary({ contractValue: job.contractValue, approvedVariations, invoices: invs });
  // Variation ids already on a non-void invoice
  const invoicedVariationIds = new Set<string>();
  for (const i of invs) if (i.status !== "Void") for (const l of parseInvoiceLines(i.lines)) if (l.variationId) invoicedVariationIds.add(l.variationId);
  return { job, variations: vars, invoices: invs, summary, invoicedVariationIds };
}

/** Purchase orders with job + supplier names, optionally filtered. Newest first. */
export async function queryOrders(f: { jobId?: string; status?: string; supplierId?: string } = {}) {
  const conds = [];
  if (f.jobId) conds.push(eq(schema.purchaseOrders.jobId, f.jobId));
  if (f.status) conds.push(eq(schema.purchaseOrders.status, f.status as "Draft"));
  if (f.supplierId) conds.push(eq(schema.purchaseOrders.supplierId, f.supplierId));
  const rows = await db
    .select({
      id: schema.purchaseOrders.id, number: schema.purchaseOrders.number, status: schema.purchaseOrders.status,
      orderDate: schema.purchaseOrders.orderDate, deliveryDate: schema.purchaseOrders.deliveryDate, total: schema.purchaseOrders.total,
      lines: schema.purchaseOrders.lines, jobId: schema.purchaseOrders.jobId, jobNumber: schema.jobs.number, jobName: schema.jobs.name,
      supplierName: schema.contacts.name, supplierBusiness: schema.contacts.businessName, createdAt: schema.purchaseOrders.createdAt,
    })
    .from(schema.purchaseOrders)
    .leftJoin(schema.jobs, eq(schema.jobs.id, schema.purchaseOrders.jobId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.purchaseOrders.supplierId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.purchaseOrders.orderDate), desc(schema.purchaseOrders.createdAt));
  return rows.map((r) => ({ ...r, supplierName: r.supplierName ? r.supplierBusiness || r.supplierName : null }));
}

/** Invoices with job + client names, optionally filtered by job / status. Newest first. */
export async function queryInvoices(f: { jobId?: string; status?: string } = {}) {
  const conds = [];
  if (f.jobId) conds.push(eq(schema.invoices.jobId, f.jobId));
  if (f.status) conds.push(eq(schema.invoices.status, f.status as "Draft"));
  const rows = await db
    .select({
      id: schema.invoices.id, number: schema.invoices.number, kind: schema.invoices.kind, status: schema.invoices.status,
      issueDate: schema.invoices.issueDate, dueDate: schema.invoices.dueDate, total: schema.invoices.total, amountPaid: schema.invoices.amountPaid,
      jobId: schema.invoices.jobId, jobNumber: schema.jobs.number, jobName: schema.jobs.name, clientName: schema.clients.name,
      clientBusiness: schema.clients.businessName,
    })
    .from(schema.invoices)
    .leftJoin(schema.jobs, eq(schema.jobs.id, schema.invoices.jobId))
    .leftJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.number));
  return rows.map((r) => ({ ...r, clientName: r.clientBusiness || r.clientName }));
}

export async function getClientsById(ids: (string | null)[]) {
  const clean = [...new Set(ids.filter((x): x is string => !!x))];
  if (!clean.length) return new Map<string, typeof schema.clients.$inferSelect>();
  const rows = await db.select().from(schema.clients).where(inArray(schema.clients.id, clean));
  return new Map(rows.map((r) => [r.id, r]));
}
