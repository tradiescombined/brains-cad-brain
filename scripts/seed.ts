/**
 * Seeds lookups, tax rates, a starter catalogue, sample client/supplier and one sample estimate.
 * Run: npm run db:seed   (idempotent: skips if settings already exist unless --force)
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema";
import { calculate, parseMarkupLines } from "../src/lib/calc";

const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
const db = drizzle(client, { schema });
const force = process.argv.includes("--force");

async function main() {
  const existing = await db.select().from(schema.businessSettings).limit(1);
  if (existing.length && !force) {
    console.log("Already seeded (use --force to wipe and reseed).");
    return;
  }
  if (force) {
    for (const t of Object.values(schema)) {
      // @ts-expect-error drizzle table check
      if (t && typeof t === "object" && t[Symbol.for("drizzle:IsDrizzleTable")]) await db.delete(t);
    }
  }

  // Every cost type defaults to GST on both sides (Settings > Tax rates can change this per cost type).
  const ALL_COST_TYPES = JSON.stringify(["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"]);
  const [gst] = await db
    .insert(schema.taxRates)
    .values([
      { code: "GST", name: "GST on income (10%)", rate: 0.1, appliesTo: "income", isDefault: true, defaultCostTypes: ALL_COST_TYPES },
      { code: "FRE", name: "GST free income", rate: 0, appliesTo: "income" },
      { code: "GST-EX", name: "GST on expenses (10%)", rate: 0.1, appliesTo: "expense", isDefault: true, defaultCostTypes: ALL_COST_TYPES },
      { code: "FRE-EX", name: "GST free expenses", rate: 0, appliesTo: "expense" },
    ])
    .returning();

  await db.insert(schema.businessSettings).values({ businessName: "My Building Co", defaultTaxRateId: gst.id, taxProfileName: "GST (Australia)", taxProfileCode: "GST" });
  await db.insert(schema.users).values({ firstName: "Owner", email: "owner@example.com", role: "Owner" });

  const L = (kind: string, names: string[], flagName?: string) =>
    names.map((name, i) => ({ kind, name, sortOrder: i + 1, isSystem: true, flag: name === flagName }));
  await db.insert(schema.lookups).values([
    ...L("estimate_status", ["Draft", "In Progress", "Sent", "Accepted", "Rejected", "On Hold", "Not sent", "Final", "Awaiting approval"], "Accepted"),
    ...L("building_type", ["Single storey", "Double storey", "Renovation & extension", "Kitchen", "Bathroom", "Deck", "Fence", "Landscaping", "Roofing", "Painting", "Electrical", "Plumbing", "Light commercial", "Custom",
      "Kitchen renovation", "Bathroom renovation", "Commercial", "Shop / retail", "Residential repairs & maintenance", "Commercial repairs & maintenance",
      "Granny flat", "Shed", "Joinery", "Insurance work", "Office fitout", "Fitout", "Duplex", "Design only", "Apartment"]),
    ...L("unit_measure", ["ea", "m", "lm", "m2", "m3", "hr", "day", "kg", "t", "L", "item", "sheet", "box", "set", "allow",
      "$", "allowance", "bag", "roll", "pair", "length", "per 100", "per 1000", "per job", "hour", "week", "month", "each", "lot", "pt"]),
    ...L("contact_type", ["Supplier", "Subcontractor", "Consultant", "Council", "Other", "Builder", "Carpenter", "Electrician", "Plumber", "Tiler", "Plasterer", "Painter", "Roofer", "Concreter"]),
    ...L("contact_group", ["Carpentry", "Concreting", "Electrical", "Plumbing", "Plastering", "Painting", "Roofing", "Tiling", "Landscaping", "Contractors", "Employees", "Suppliers"]),
    ...L("client_source", ["Referral", "Website", "Google", "Facebook", "Instagram", "Repeat client", "Signage", "Other", "Word of mouth", "Builder referral", "Trade show"]),
    ...L("client_type", ["Homeowner", "Developer", "Builder", "Commercial", "Government", "Lead", "Investor", "Strata / body corporate"]),
    ...L("document_folder", ["Unassigned", "Plans", "Contracts", "Photos", "Permits", "Invoices"]),
  ]);

  // Starter catalogue (original content)
  const [cat] = await db.insert(schema.catalogues).values({ name: "My Price List", shortCode: "MPL", description: "Your own rates and materials" }).returning();
  const cats = await db
    .insert(schema.catalogueCategories)
    .values(["Framing", "Lining", "Doors & hardware", "Labour", "Concrete"].map((name, i) => ({ catalogueId: cat.id, name, sortOrder: i })))
    .returning();
  const c = Object.fromEntries(cats.map((x) => [x.name, x.id]));
  await db.insert(schema.catalogueItems).values([
    { catalogueId: cat.id, categoryId: c.Framing, itemCode: "FR-9045", description: "90x45 MGP10 pine framing", uom: "lm", unitCost: 6.4 },
    { catalogueId: cat.id, categoryId: c.Framing, itemCode: "FR-9035", description: "90x35 MGP10 pine framing", uom: "lm", unitCost: 4.95 },
    { catalogueId: cat.id, categoryId: c.Framing, itemCode: "FR-NAIL", description: "Framing nails (box 2500)", uom: "box", unitCost: 89 },
    { catalogueId: cat.id, categoryId: c.Lining, itemCode: "LN-PB10", description: "10mm plasterboard 2400x1200", uom: "sheet", unitCost: 18.5 },
    { catalogueId: cat.id, categoryId: c.Lining, itemCode: "LN-FC45", description: "4.5mm fibre cement sheet", uom: "m2", unitCost: 11.2 },
    { catalogueId: cat.id, categoryId: c["Doors & hardware"], itemCode: "DR-HC820", description: "Hollow core door 2040x820", uom: "ea", unitCost: 72 },
    { catalogueId: cat.id, categoryId: c["Doors & hardware"], itemCode: "DR-LEVER", description: "Passage lever set", uom: "ea", unitCost: 38 },
    { catalogueId: cat.id, categoryId: c.Labour, itemCode: "LB-CARP", description: "Carpenter", costType: "Labour", uom: "hr", unitCost: 75 },
    { catalogueId: cat.id, categoryId: c.Labour, itemCode: "LB-APPR", description: "Apprentice carpenter", costType: "Labour", uom: "hr", unitCost: 42 },
    { catalogueId: cat.id, categoryId: c.Concrete, itemCode: "CN-32MPA", description: "32MPa concrete delivered", uom: "m3", unitCost: 285 },
  ]);

  const [client1] = await db
    .insert(schema.clients)
    .values({ name: "(sample) Jordan Lee", email: "jordan@example.com", mobile: "0400 000 000", address: "12 Sample St", cityTown: "Brisbane", state: "QLD", postcode: "4000", source: "Referral", isSample: true })
    .returning();
  await db.insert(schema.contacts).values([
    { name: "(sample) Timber Yard Co", businessName: "Timber Yard Co", contactType: "Supplier", groups: '["Carpentry"]', email: "orders@example.com" },
    { name: "(sample) Spark Electrical", businessName: "Spark Electrical", contactType: "Subcontractor", groups: '["Electrical"]', trade: "Electrician" },
  ]);
  await db.insert(schema.leads).values({ number: "L1000", title: "(sample) Deck & pergola", contactName: "Sam Rivers", stage: "Site visit", estimatedValue: 28000, source: "Website", buildingType: "Deck" });

  // Sample estimate
  const markupLines = JSON.stringify([{ name: "Markup", percent: 18 }, { name: "Contingency", percent: 2 }]);
  const [est] = await db
    .insert(schema.estimates)
    .values({
      number: "Q1000", name: "[SAMPLE] Bathroom renovation", status: "Draft", buildingType: "Bathroom", clientId: client1.id,
      clientName: client1.name, clientEmail: client1.email, siteAddress: "12 Sample St", siteCityTown: "Brisbane", siteState: "QLD", sitePostcode: "4000",
      datePrepared: new Date().toISOString().slice(0, 10), markupLines, taxRateId: gst.id, isSample: true,
    })
    .returning();
  const rows: (typeof schema.estimateItems.$inferInsert)[] = [];
  const add = (r: Omit<typeof schema.estimateItems.$inferInsert, "estimateId">) => {
    const id = crypto.randomUUID();
    rows.push({ id, estimateId: est.id, ...r });
    return id;
  };
  const demo = add({ kind: "category", description: "Demolition", sortOrder: 1 });
  add({ parentId: demo, description: "Strip out existing bathroom", costType: "Labour", uom: "hr", quantity: 16, quantityExpr: "16", unitCost: 75, sortOrder: 1 });
  add({ parentId: demo, description: "Skip bin 6m3", costType: "Equipment", uom: "ea", quantity: 1, quantityExpr: "1", unitCost: 480, sortOrder: 2 });
  const wp = add({ kind: "category", description: "Waterproofing & tiling", sortOrder: 2 });
  const tiling = add({ parentId: wp, description: "Floor tiling (supply & lay)", uom: "m2", quantity: 6.5, quantityExpr: "6.5", unitCost: 0, sortOrder: 1 });
  add({ parentId: tiling, description: "Floor tile 600x600", uom: "m2", quantityExpr: "1*[W10]", quantity: 1.1, unitCost: 55, sortOrder: 1 });
  add({ parentId: tiling, description: "Adhesive & grout", uom: "m2", quantityExpr: "1", quantity: 1, unitCost: 9.5, sortOrder: 2 });
  add({ parentId: tiling, description: "Tiler", costType: "Subcontractor", uom: "m2", quantityExpr: "1", quantity: 1, unitCost: 65, sortOrder: 3 });
  add({ parentId: wp, description: "Waterproofing membrane (licensed)", costType: "Subcontractor", uom: "item", quantityExpr: "1", quantity: 1, unitCost: 950, sortOrder: 2 });
  const fx = add({ kind: "category", description: "Fixtures", sortOrder: 3 });
  add({ parentId: fx, description: "Vanity, toilet & tapware allowance", allowanceType: "PC", uom: "allow", quantityExpr: "1", quantity: 1, unitCost: 3500, sortOrder: 1 });
  add({ parentId: fx, description: "Plumber fit-off", costType: "Subcontractor", uom: "hr", quantityExpr: "8", quantity: 8, unitCost: 110, sortOrder: 2 });
  add({ parentId: fx, description: "Electrical (exhaust fan, lights)", allowanceType: "PS", costType: "Subcontractor", uom: "allow", quantityExpr: "1", quantity: 1, unitCost: 1200, sortOrder: 3 });
  await db.insert(schema.estimateItems).values(rows);

  const r = calculate({
    items: rows.map((x) => ({ id: x.id!, parentId: x.parentId ?? null, kind: x.kind ?? "item", sortOrder: x.sortOrder ?? 0, quantityExpr: x.quantityExpr, quantity: x.quantity, unitCost: x.unitCost ?? 0, allowanceType: x.allowanceType ?? "none", costType: x.costType ?? "Material" })),
    markupLines: parseMarkupLines(markupLines),
    taxRate: 0.1,
    pcpsRedistribution: "within_category",
  });
  const { eq } = await import("drizzle-orm");
  for (const x of rows) {
    const ri = r.items[x.id!];
    await db.update(schema.estimateItems).set({ total: ri.total, totalIncMarkup: ri.totalIncMarkup, quantity: x.kind === "category" ? 0 : ri.quantity }).where(eq(schema.estimateItems.id, x.id!));
  }
  await db.update(schema.estimates).set({ costTotal: r.costTotal, markupTotal: r.markupTotal, taxTotal: r.taxTotal, quoteTotal: r.quoteTotal }).where(eq(schema.estimates.id, est.id));
  await db.update(schema.businessSettings).set({ nextEstimateNumber: 1001 });
  console.log("Seeded. Sample estimate total:", r.quoteTotal);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
