/**
 * Demo business: a small Brisbane residential builder, so the app looks alive on first open.
 * Additive on top of scripts/seed.ts (which must run first). All people and businesses are
 * fictional and marked "(demo)"; emails use example.com, phones use reserved fictional ranges.
 *
 * Run: npm run db:demo   (= reset + base seed + this script). Skips if already applied.
 *
 * Maths goes through the app's own pure code paths: estimate totals via calculate() from
 * src/lib/calc, takeoff values via computeMeasurement() from src/lib/geometry, schedule dates via
 * src/lib/scheduling, PO/variation/invoice totals via src/lib/money-docs, recipe unit costs via
 * the catalogue recipe helper. Check with: npx tsx --conditions=react-server scripts/check-demo.ts
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import * as schema from "../src/db/schema";
import { calculate, parseMarkupLines, type Redistribution, type Rounding } from "../src/lib/calc";
import { computeMeasurement, type Pt, type Shape } from "../src/lib/geometry";
import { addCalendarDays, calendarDaysBetween, isWorkingDay, nextWorkingDay, snapToWorkingDay, taskFinish, workingDaysInclusive } from "../src/lib/scheduling";
import { catalogueToRows } from "../src/lib/costings-tree";
import {
  dominantCostType, exTax, invoiceTotals, percentOfContractExTax, poTotals, progressClaim, statusFromPayments, variationTotals,
  type InvoiceLine, type PoLine, type VariationLine,
} from "../src/lib/money-docs";
import { recipeTotals } from "../src/app/(app)/catalogues/recipe";
import { drawExtensionPlan } from "./demo-plan-png";

const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
const db = drizzle(client, { schema });

type CostType = "Material" | "Labour" | "Equipment" | "Subcontractor" | "Other";
type ItemInsert = typeof schema.estimateItems.$inferInsert;

// ------------------------------------------------------------------ dates
const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
/** ISO date n calendar days from today (negative = past). */
const D = (n: number) => addCalendarDays(TODAY, n);
/** ISO timestamp n days from now at a given local hour (for createdAt / activity). */
const T = (n: number, hour = 9, min = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
const stamps = (n: number, hour = 9) => ({ createdAt: T(n, hour), updatedAt: T(n, hour) });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TAX = 0.1;

async function main() {
  const [settings] = await db.select().from(schema.businessSettings).limit(1);
  if (!settings) throw new Error("Run the base seed first (npm run db:reset).");
  if (settings.businessName.includes("(Demo)")) {
    console.log("Demo data already applied.");
    return;
  }
  const gst = (await db.select().from(schema.taxRates)).find((t) => t.code === "GST");
  if (!gst) throw new Error("GST tax rate missing — base seed not applied?");

  // ================================================================ business settings & users
  await db.update(schema.businessSettings).set({
    businessName: "Ridgeline Building Co (Demo)",
    tradingName: "Ridgeline Building",
    businessNumber: "80 987 654 321",
    licenceNumber: "QBCC 1299999",
    email: "office@ridgelinebuilding.example.com",
    phone: "(07) 5550 1234",
    website: "www.ridgelinebuilding.example.com",
    address: "Unit 3, 27 Corella Street",
    cityTown: "Newmarket",
    state: "QLD",
    postcode: "4051",
    brandColour: "#0e7490",
    defaultMarkupPercent: 18,
    quoteValidDays: 30,
    defaultInvoiceDueDays: 7,
    bankDetails: "Account name: Ridgeline Building Co (Demo)\nBSB: 000-000\nAccount: 0000 0000\n(demo details — not a real account)",
    showDashboardQuickStart: false,
  }).where(eq(schema.businessSettings.id, settings.id));

  const [owner] = await db.select().from(schema.users).limit(1);
  if (owner) await db.update(schema.users).set({ firstName: "Sam", surname: "Ridley (demo)", email: "sam@ridgelinebuilding.example.com", mobile: "0491 570 006" }).where(eq(schema.users.id, owner.id));
  await db.insert(schema.users).values([
    { firstName: "Kate", surname: "Ng (demo)", email: "kate@ridgelinebuilding.example.com", mobile: "0491 570 156", role: "Estimator" },
    { firstName: "Jono", surname: "Pearce (demo)", email: "jono@ridgelinebuilding.example.com", mobile: "0491 570 157", role: "Site Supervisor" },
  ]);
  const PM = "Jono Pearce";

  // ================================================================ clients
  const clientRows = await db.insert(schema.clients).values([
    { name: "Priya & Tom Whitfield (demo)", email: "whitfield.family@example.com", mobile: "0491 570 158", address: "42 Jubilee Terrace", cityTown: "Ashgrove", state: "QLD", postcode: "4060", source: "Referral", category: "Homeowner", ...stamps(-75) },
    { name: "Helen Marchetti (demo)", email: "helen.marchetti@example.com", mobile: "0491 570 159", address: "8 Latrobe Lane", cityTown: "Paddington", state: "QLD", postcode: "4064", source: "Website", category: "Homeowner", ...stamps(-48) },
    { name: "Daniel & Mei Okafor (demo)", email: "okafor.home@example.com", mobile: "0491 570 110", address: "15 Wattlebird Crescent", cityTown: "Carindale", state: "QLD", postcode: "4152", source: "Google", category: "Homeowner", ...stamps(-14) },
    { name: "Graham Pettersen (demo)", email: "g.pettersen@example.com", mobile: "0491 570 313", phone: "(07) 5550 2187", address: "3 Mangrove Street", cityTown: "Wynnum", state: "QLD", postcode: "4178", source: "Repeat client", category: "Homeowner", ...stamps(-5) },
    { name: "Saltwater Living Pty Ltd (demo)", clientType: "Business", businessName: "Saltwater Living Pty Ltd (demo)", businessNumber: "78 246 813 579", email: "projects@saltwaterliving.example.com", phone: "(07) 5550 3300", address: "Level 2, 140 Samford Road", cityTown: "Mitchelton", state: "QLD", postcode: "4053", source: "Referral", category: "Developer", defaultInvoiceDays: 14, ...stamps(-44) },
    { name: "Rebecca Doyle (demo)", email: "bec.doyle@example.com", mobile: "0491 570 737", address: "27 Riverbend Parade", cityTown: "Bulimba", state: "QLD", postcode: "4171", source: "Instagram", category: "Homeowner", ...stamps(-8) },
    { name: "Aaron Fitzgerald (demo)", email: "aaron.fitz@example.com", mobile: "0491 571 266", address: "61 Lutwyche Avenue", cityTown: "Kedron", state: "QLD", postcode: "4031", source: "Facebook", category: "Homeowner", ...stamps(-9) },
    { name: "Corinne Nakamura (demo)", email: "corinne.n@example.com", mobile: "0491 571 491", address: "9 Ironbark Close", cityTown: "The Gap", state: "QLD", postcode: "4061", source: "Signage", category: "Homeowner", ...stamps(-4) },
  ]).returning();
  const [cWhitfield, cMarchetti, cOkafor, cPettersen, cSaltwater, cDoyle, cFitzgerald, cNakamura] = clientRows;
  await db.insert(schema.clientContacts).values([
    { clientId: cSaltwater.id, name: "Marcus Delaney (demo)", role: "Development manager", email: "marcus@saltwaterliving.example.com", mobile: "0491 571 804", isPrimary: true },
    { clientId: cSaltwater.id, name: "Ivy Tran (demo)", role: "Accounts", email: "accounts@saltwaterliving.example.com", phone: "(07) 5550 3301" },
    { clientId: cWhitfield.id, name: "Tom Whitfield (demo)", role: "Co-owner", mobile: "0491 572 549" },
  ]);

  // ================================================================ suppliers & subcontractors
  const contactRows = await db.insert(schema.contacts).values([
    { name: "Northgate Timber & Hardware (demo)", businessName: "Northgate Timber & Hardware (demo)", contactType: "Supplier", groups: '["Carpentry"]', email: "trade@northgatetimber.example.com", phone: "(07) 5550 4100", address: "220 Toombul Road", cityTown: "Northgate", state: "QLD", postcode: "4013", accountNumber: "RID-2231", paymentTermsDays: 30, rating: 5, notes: "Trade account. Free delivery over $1,500 north of the river." },
    { name: "Brisbane Ready-Mix Concrete (demo)", businessName: "Brisbane Ready-Mix Concrete (demo)", contactType: "Supplier", groups: '["Concreting"]', email: "dispatch@bnereadymix.example.com", phone: "(07) 5550 4200", cityTown: "Geebung", state: "QLD", postcode: "4034", paymentTermsDays: 30, rating: 4 },
    { name: "Riverside Roofing Supplies (demo)", businessName: "Riverside Roofing Supplies (demo)", contactType: "Supplier", groups: '["Roofing"]', email: "sales@riversideroofing.example.com", phone: "(07) 5550 4300", cityTown: "Eagle Farm", state: "QLD", postcode: "4009", accountNumber: "RR-0917", paymentTermsDays: 30, rating: 4 },
    { name: "Bright Spark Electrical (demo)", businessName: "Bright Spark Electrical (demo)", contactType: "Subcontractor", groups: '["Electrical"]', trade: "Electrician", email: "jobs@brightspark.example.com", mobile: "0491 572 665", businessNumber: "80 864 209 753", licenceNumber: "QLD EC 99001", insuranceExpiry: D(14), paymentTermsDays: 14, rating: 5, notes: "Public liability certificate expires soon — request renewal." },
    { name: "Clearflow Plumbing & Gas (demo)", businessName: "Clearflow Plumbing & Gas (demo)", contactType: "Subcontractor", groups: '["Plumbing"]', trade: "Plumber", email: "admin@clearflow.example.com", mobile: "0491 572 983", businessNumber: "78 135 792 468", licenceNumber: "QBCC 1288888", insuranceExpiry: D(210), paymentTermsDays: 14, rating: 4 },
    { name: "Smooth Finish Plastering (demo)", businessName: "Smooth Finish Plastering (demo)", contactType: "Subcontractor", groups: '["Plastering","Painting"]', trade: "Plasterer", email: "quotes@smoothfinish.example.com", mobile: "0491 573 770", insuranceExpiry: D(95), paymentTermsDays: 14, rating: 4 },
    { name: "Coastline Tiling (demo)", businessName: "Coastline Tiling (demo)", contactType: "Subcontractor", groups: '["Tiling"]', trade: "Tiler & waterproofer", email: "coastlinetiling@example.com", mobile: "0491 573 087", insuranceExpiry: D(300), paymentTermsDays: 7, rating: 5 },
  ]).returning();
  const [sTimber, sConcrete, sRoofing, sElec, sPlumb, sPlaster, sTiling] = contactRows;

  // ================================================================ catalogue (~60 items incl. 3 recipes)
  const [cat] = await db.insert(schema.catalogues).values({ name: "Ridgeline rates 2026 (demo)", shortCode: "RBC", description: "Our Brisbane residential rates and materials — ex GST", colour: "#0e7490", effectiveDate: D(-140) }).returning();
  const catNames = ["Site & preliminaries", "Framing", "Sheet goods & cladding", "Doors & hardware", "Concrete", "Roofing", "Decking", "Plumbing & electrical allowances", "Labour rates"];
  const cc = Object.fromEntries((await db.insert(schema.catalogueCategories).values(catNames.map((name, i) => ({ catalogueId: cat.id, name, sortOrder: i }))).returning()).map((x) => [x.name, x.id]));
  type CI = [category: string, code: string, description: string, uom: string, unitCost: number, costType?: CostType];
  const catItems: CI[] = [
    ["Site & preliminaries", "SP-FENCE", "Temporary site fencing hire (per month)", "item", 380, "Equipment"],
    ["Site & preliminaries", "SP-SKIP", "Skip bin 6m3 (exchange)", "ea", 520, "Equipment"],
    ["Site & preliminaries", "SP-CERT", "Building certifier & approvals allowance", "allow", 2850, "Other"],
    ["Site & preliminaries", "SP-CLEAN", "Builder's clean", "ea", 450, "Subcontractor"],
    ["Framing", "FR-9045", "90x45 MGP10 pine framing", "lm", 6.4],
    ["Framing", "FR-9035", "90x35 MGP10 pine framing", "lm", 4.95],
    ["Framing", "FR-H3-9045", "90x45 H3 treated pine", "lm", 7.9],
    ["Framing", "FR-H3-14045", "140x45 H3 treated pine", "lm", 14.5],
    ["Framing", "FR-LVL240", "240x45 LVL beam", "lm", 38],
    ["Framing", "FR-TRUSS", "Roof trusses supply (per m2 of roof)", "m2", 48],
    ["Framing", "FR-NAIL", "Framing nails 75mm (box 2500)", "box", 89],
    ["Framing", "FR-TIE", "Cyclone tie-down rods & hardware set", "set", 65],
    ["Sheet goods & cladding", "SG-PB10", "10mm plasterboard 2400x1200", "sheet", 18.5],
    ["Sheet goods & cladding", "SG-PB13", "13mm plasterboard 3000x1200", "sheet", 29.8],
    ["Sheet goods & cladding", "SG-WR10", "10mm wet area plasterboard 2400x1200", "sheet", 27.4],
    ["Sheet goods & cladding", "SG-FC6", "6mm fibre cement sheet 2400x1200", "sheet", 38.5],
    ["Sheet goods & cladding", "SG-PLY19", "19mm structural ply flooring 2400x1200", "sheet", 96],
    ["Sheet goods & cladding", "SG-WB180", "Fibre cement weatherboard 180mm", "lm", 8.6],
    ["Sheet goods & cladding", "SG-WRAP", "Vapour-permeable building wrap", "m2", 2.4],
    ["Doors & hardware", "DH-HC820", "Hollow core door 2040x820", "ea", 72],
    ["Doors & hardware", "DH-SC820", "Solid core entry door 2040x820", "ea", 285],
    ["Doors & hardware", "DH-JAMB", "Door jamb set, primed pine", "set", 95],
    ["Doors & hardware", "DH-LEVER", "Passage lever set", "ea", 38],
    ["Doors & hardware", "DH-PRIV", "Privacy lever set", "ea", 46],
    ["Doors & hardware", "DH-ENTRY", "Entrance lockset (keyed)", "ea", 165],
    ["Concrete", "CN-25MPA", "25MPa concrete delivered", "m3", 270],
    ["Concrete", "CN-32MPA", "32MPa concrete delivered", "m3", 285],
    ["Concrete", "CN-SL82", "SL82 reinforcing mesh 6.0x2.4", "sheet", 128],
    ["Concrete", "CN-POLY", "200um vapour barrier", "m2", 1.1],
    ["Concrete", "CN-FORM", "Edge formwork (supply & strip)", "lm", 18],
    ["Concrete", "CN-PUMP", "Concrete line pump hire", "item", 980, "Equipment"],
    ["Concrete", "CN-LAB", "Concreter (place & finish)", "hr", 85, "Labour"],
    ["Roofing", "RF-CORR", "Corrugated steel roof sheet 0.42 BMT", "m2", 34],
    ["Roofing", "RF-RIDGE", "Ridge & barge capping", "lm", 21],
    ["Roofing", "RF-GUTTER", "Quad gutter 115mm", "lm", 24],
    ["Roofing", "RF-DP", "Downpipe 90mm round (3m)", "ea", 46],
    ["Roofing", "RF-SARK", "Roof sarking, anti-glare foil", "m2", 4.2],
    ["Roofing", "RF-BATT", "R4.0 ceiling insulation batts", "m2", 11.8],
    ["Decking", "DK-SG140", "Spotted gum decking 140x19", "lm", 11.2],
    ["Decking", "DK-MER90", "Merbau decking 90x19", "lm", 7.4],
    ["Decking", "DK-SCREW", "Stainless decking screws (box 350)", "box", 62],
    ["Decking", "DK-STUMP", "Adjustable stirrup post & footing", "ea", 38],
    ["Decking", "DK-BAL", "Stainless wire balustrade (supply & install)", "lm", 245, "Subcontractor"],
    ["Plumbing & electrical allowances", "PE-GPO", "Double power point (supply & install)", "ea", 145, "Subcontractor"],
    ["Plumbing & electrical allowances", "PE-DL", "LED downlight (supply & install)", "ea", 95, "Subcontractor"],
    ["Plumbing & electrical allowances", "PE-EXH", "Ducted exhaust fan (supply & install)", "ea", 320, "Subcontractor"],
    ["Plumbing & electrical allowances", "PE-PLMB", "Plumbing point rough-in & fit-off", "ea", 380, "Subcontractor"],
    ["Plumbing & electrical allowances", "PE-HWS", "Hot water system allowance", "allow", 2400],
    ["Plumbing & electrical allowances", "PE-STORM", "Stormwater connection allowance", "allow", 1850, "Subcontractor"],
    ["Plumbing & electrical allowances", "PE-SWBD", "Switchboard upgrade allowance", "allow", 1650, "Subcontractor"],
    ["Labour rates", "LB-CARP", "Carpenter", "hr", 78, "Labour"],
    ["Labour rates", "LB-APPR", "Apprentice carpenter", "hr", 45, "Labour"],
    ["Labour rates", "LB-LAB", "General labourer", "hr", 55, "Labour"],
    ["Labour rates", "LB-SUP", "Site supervisor", "hr", 95, "Labour"],
    ["Labour rates", "LB-PAINT", "Painter (3-coat system)", "m2", 24, "Subcontractor"],
    ["Labour rates", "LB-PLAST", "Plasterer (supply, fix & set)", "m2", 42, "Subcontractor"],
    ["Labour rates", "LB-TILER", "Tiler (lay only)", "m2", 68, "Subcontractor"],
    ["Labour rates", "LB-WP", "Waterproofing membrane (licensed)", "m2", 58, "Subcontractor"],
  ];
  const insertedItems = await db.insert(schema.catalogueItems).values(
    catItems.map(([category, itemCode, description, uom, unitCost, costType]) => ({ catalogueId: cat.id, categoryId: cc[category], itemCode, description, uom, unitCost, costType: costType ?? "Material" })),
  ).returning();
  const byCode = new Map(insertedItems.map((i) => [i.itemCode!, i]));
  const C = (code: string) => {
    const it = byCode.get(code);
    if (!it) throw new Error(`Unknown catalogue code ${code}`);
    return it;
  };

  // Recipes (assemblies): component quantity is per 1 unit of the recipe.
  const recipeDefs: { category: string; code: string; description: string; uom: string; details: string; lines: [string, string][] }[] = [
    { category: "Framing", code: "RC-STUDWALL", description: "Stud wall 90mm, 2700 high @ 450 ctrs (per lm)", uom: "lm", details: "Studs, plates & noggins, tie-downs and carpenter labour per lineal metre of wall.",
      lines: [["FR-9045", "10.5"], ["FR-NAIL", "0.02"], ["FR-TIE", "0.25"], ["LB-CARP", "0.9"]] },
    { category: "Decking", code: "RC-DECK", description: "Spotted gum deck on H3 pine subframe (per m2)", uom: "m2", details: "140x19 decking, joists @ 450, bearers, stirrup posts, screws and labour.",
      lines: [["DK-SG140", "7.4"], ["FR-H3-9045", "2.3"], ["FR-H3-14045", "0.75"], ["DK-STUMP", "0.35"], ["DK-SCREW", "0.08"], ["LB-CARP", "1.2"]] },
    { category: "Concrete", code: "RC-SLAB", description: "Concrete slab 100mm on ground (per m2)", uom: "m2", details: "25MPa concrete incl. 5% waste, SL82 mesh, vapour barrier, edge forms and finishing.",
      lines: [["CN-25MPA", "0.105"], ["CN-SL82", "0.085"], ["CN-POLY", "1.1"], ["CN-FORM", "0.3"], ["CN-LAB", "0.35"]] },
  ];
  const recipeLinesByItem = new Map<string, (typeof schema.catalogueRecipeLines.$inferSelect)[]>();
  for (const rd of recipeDefs) {
    const comps = rd.lines.map(([code, q], i) => ({ comp: C(code), quantityExpr: q, unitCost: C(code).unitCost, sortOrder: i + 1 }));
    const { unitCost } = recipeTotals(comps);
    const [ri] = await db.insert(schema.catalogueItems).values({ catalogueId: cat.id, categoryId: cc[rd.category], itemCode: rd.code, description: rd.description, details: rd.details, uom: rd.uom, unitCost, isRecipe: true }).returning();
    const lines = await db.insert(schema.catalogueRecipeLines).values(
      comps.map((c) => ({ recipeItemId: ri.id, componentItemId: c.comp.id, description: c.comp.description, costType: c.comp.costType, uom: c.comp.uom, quantityExpr: c.quantityExpr, unitCost: c.unitCost, sortOrder: c.sortOrder })),
    ).returning();
    byCode.set(rd.code, ri);
    recipeLinesByItem.set(ri.id, lines);
  }

  // ================================================================ estimate builder
  type Sub = { d: string; q: string | number; cost: number; uom?: string; ct?: CostType };
  type Item = {
    d?: string; code?: string; q: string | number; cost?: number; uom?: string; ct?: CostType; allow?: "PC" | "PS";
    supplier?: string; subs?: Sub[]; notes?: string; spec?: boolean;
  };
  type Cat = { name: string; items: Item[] };
  type EstSpec = {
    number: string; name: string; status: string; buildingType: string; client?: typeof cWhitfield; leadId?: string;
    markup: { name: string; percent: number }[]; rounding?: Rounding; pcps?: Redistribution;
    created: number; sent?: number; accepted?: number; isTemplate?: boolean; cats: Cat[]; specIntro?: string;
  };

  async function buildEstimate(s: EstSpec, measurementsFor?: (estimateId: string) => Promise<Record<string, number>>) {
    const c = s.client;
    const markupLines = JSON.stringify(s.markup);
    const [est] = await db.insert(schema.estimates).values({
      number: s.number, name: s.name, status: s.status, buildingType: s.buildingType, leadId: s.leadId ?? null,
      ...(c && !s.isTemplate ? {
        clientId: c.id, clientName: c.name, clientEmail: c.email, clientMobile: c.mobile, clientPhone: c.phone,
        clientAddress: c.address, clientCityTown: c.cityTown, clientState: c.state, clientPostcode: c.postcode, source: c.source,
        siteAddress: c.address, siteCityTown: c.cityTown, siteState: c.state, sitePostcode: c.postcode,
      } : {}),
      datePrepared: D(s.created), markupLines, taxRateId: gst!.id, pcpsRedistribution: s.pcps ?? "within_category", rounding: s.rounding ?? "none",
      isTemplate: !!s.isTemplate, sentAt: s.sent != null ? T(s.sent, 15) : null, acceptedAt: s.accepted != null ? T(s.accepted, 19) : null,
      specificationIntro: s.specIntro ?? null, ...stamps(s.created),
    }).returning();
    const measurements = measurementsFor ? await measurementsFor(est.id) : {};

    const rows: ItemInsert[] = [];
    s.cats.forEach((ct, ci) => {
      const catId = crypto.randomUUID();
      rows.push({ id: catId, estimateId: est.id, kind: "category", description: ct.name, sortOrder: ci + 1 });
      ct.items.forEach((it, ii) => {
        const ci2 = it.code ? C(it.code) : undefined;
        if (ci2?.isRecipe) {
          // Expand the recipe exactly like "Add from catalogue" does, then put our quantity formula on the parent.
          const expanded = catalogueToRows([{ item: ci2, quantity: 1, lines: recipeLinesByItem.get(ci2.id) }], catId, ii);
          expanded[0].quantityExpr = String(it.q);
          for (const r of expanded) rows.push({ ...r, estimateId: est.id, costType: r.costType as CostType, supplierId: r.parentId === catId ? it.supplier ?? null : null, notes: r.parentId === catId ? it.notes ?? null : null, showInSpecification: r.parentId === catId && !!it.spec });
          return;
        }
        const id = crypto.randomUUID();
        rows.push({
          id, estimateId: est.id, parentId: catId, kind: "item", sortOrder: ii + 1,
          description: it.d ?? ci2!.description, itemCode: ci2?.itemCode ?? null, catalogueItemId: ci2?.id ?? null,
          costType: it.ct ?? (ci2?.costType as CostType) ?? "Material", allowanceType: it.allow ?? "none",
          uom: it.uom ?? ci2?.uom ?? "item", quantityExpr: String(it.q), unitCost: it.subs ? 0 : it.cost ?? ci2?.unitCost ?? 0,
          supplierId: it.supplier ?? null, notes: it.notes ?? null, showInSpecification: !!it.spec,
        });
        it.subs?.forEach((sb, si) => rows.push({
          id: crypto.randomUUID(), estimateId: est.id, parentId: id, kind: "item", sortOrder: si + 1, description: sb.d,
          costType: sb.ct ?? "Material", uom: sb.uom ?? it.uom ?? "ea", quantityExpr: String(sb.q), unitCost: sb.cost,
        }));
      });
    });
    await db.insert(schema.estimateItems).values(rows);

    // Same engine & inputs as recalcEstimate()/calcLoaded().
    const r = calculate({
      items: rows.map((x) => ({
        id: x.id!, parentId: x.parentId ?? null, kind: x.kind ?? "item", sortOrder: x.sortOrder ?? 0, quantityExpr: x.quantityExpr ?? null,
        quantity: x.quantity ?? 0, unitCost: x.unitCost ?? 0, allowanceType: x.allowanceType ?? "none", costType: x.costType ?? "Material",
        markupPercent: x.markupPercent ?? null, taxable: x.taxable ?? true,
      })),
      markupLines: parseMarkupLines(markupLines),
      taxRate: gst!.rate,
      measurements,
      pcpsRedistribution: (s.pcps ?? "within_category") as Redistribution,
      rounding: s.rounding ?? "none",
    });
    if (r.errors.length) throw new Error(`${s.number}: formula errors ${JSON.stringify(r.errors)}`);
    for (const x of rows) {
      const ri = r.items[x.id!];
      await db.update(schema.estimateItems).set({ total: ri.total, totalIncMarkup: ri.totalIncMarkup, quantity: x.kind === "category" ? 0 : ri.quantity }).where(eq(schema.estimateItems.id, x.id!));
    }
    await db.update(schema.estimates).set({ costTotal: r.costTotal, markupTotal: r.markupTotal, taxTotal: r.taxTotal, quoteTotal: r.quoteTotal, updatedAt: T(s.accepted ?? s.sent ?? s.created, 16) }).where(eq(schema.estimates.id, est.id));
    return { est: { ...est, costTotal: r.costTotal, quoteTotal: r.quoteTotal }, r, rows };
  }

  // ================================================================ leads
  const leadRows = await db.insert(schema.leads).values([
    { number: "L1001", title: "Pool fence & landscaping", clientId: null, contactName: "Shane Kowalski (demo)", email: "shane.k@example.com", phone: "0491 573 087", address: "12 Hamilton Place", cityTown: "Chermside", state: "QLD", postcode: "4032", stage: "New", source: "Website", buildingType: "Landscaping", estimatedValue: 18500, probability: 20, followUpDate: TODAY, assignedTo: "Kate Ng", description: "Glass pool fence (approx 22 lm) plus retaining wall and turf. Wants work done before Christmas.", ...stamps(-1, 20) },
    { number: "L1002", title: "Second-storey addition", clientId: cFitzgerald.id, contactName: cFitzgerald.name, email: cFitzgerald.email, phone: cFitzgerald.mobile, address: cFitzgerald.address, cityTown: cFitzgerald.cityTown, state: "QLD", postcode: cFitzgerald.postcode, stage: "Contacted", source: "Facebook", buildingType: "Double storey", estimatedValue: 420000, probability: 30, expectedStart: D(120), followUpDate: D(-3), assignedTo: "Sam Ridley", description: "Lift-and-build style addition to post-war cottage: 3 bed + bath upstairs. Has preliminary drawings from a draftsperson.", ...stamps(-9, 11) },
    { number: "L1003", title: "Laundry & mudroom renovation", clientId: cNakamura.id, contactName: cNakamura.name, email: cNakamura.email, phone: cNakamura.mobile, address: cNakamura.address, cityTown: cNakamura.cityTown, state: "QLD", postcode: cNakamura.postcode, stage: "Site visit", source: "Signage", buildingType: "Renovation & extension", estimatedValue: 32000, probability: 50, expectedStart: D(45), followUpDate: D(2), assignedTo: "Sam Ridley", description: "Convert under-house laundry into laundry + mudroom with built-in joinery. Site visit booked.", ...stamps(-4, 10) },
    { number: "L1004", title: "Deck & pergola", clientId: cDoyle.id, contactName: cDoyle.name, email: cDoyle.email, phone: cDoyle.mobile, address: cDoyle.address, cityTown: cDoyle.cityTown, state: "QLD", postcode: cDoyle.postcode, stage: "Quoting", source: "Instagram", buildingType: "Deck", estimatedValue: 22000, probability: 60, expectedStart: D(40), followUpDate: D(4), assignedTo: "Kate Ng", description: "28 m2 spotted gum deck with polycarbonate pergola off the kitchen.", ...stamps(-8, 14) },
    { number: "L1005", title: "Bathroom & ensuite refresh", clientId: cOkafor.id, contactName: cOkafor.name, email: cOkafor.email, phone: cOkafor.mobile, address: cOkafor.address, cityTown: cOkafor.cityTown, state: "QLD", postcode: cOkafor.postcode, stage: "Quote sent", source: "Google", buildingType: "Bathroom", estimatedValue: 35000, probability: 60, expectedStart: D(30), followUpDate: D(-2), assignedTo: "Kate Ng", description: "Full strip-out of main bathroom and ensuite. Wants frameless screens and floor-to-ceiling tiles.", ...stamps(-14, 9) },
    { number: "L1006", title: "Rear extension & deck", clientId: cWhitfield.id, contactName: cWhitfield.name, email: cWhitfield.email, phone: cWhitfield.mobile, address: cWhitfield.address, cityTown: cWhitfield.cityTown, state: "QLD", postcode: cWhitfield.postcode, stage: "Won", source: "Referral", buildingType: "Renovation & extension", estimatedValue: 95000, probability: 100, assignedTo: "Sam Ridley", description: "New bedroom + family room off the rear with a deck to the yard.", ...stamps(-75, 10) },
    { number: "L1007", title: "Kitchen renovation", clientId: cMarchetti.id, contactName: cMarchetti.name, email: cMarchetti.email, phone: cMarchetti.mobile, address: cMarchetti.address, cityTown: cMarchetti.cityTown, state: "QLD", postcode: cMarchetti.postcode, stage: "Won", source: "Website", buildingType: "Kitchen", estimatedValue: 45000, probability: 100, assignedTo: "Kate Ng", description: "Open up kitchen to dining, new cabinetry and stone benchtops.", ...stamps(-48, 13) },
    { number: "L1008", title: "Granny flat 60m2", clientId: cSaltwater.id, contactName: "Marcus Delaney (demo)", email: "marcus@saltwaterliving.example.com", phone: "0491 571 804", address: "33 Blackwood Street", cityTown: "Mitchelton", state: "QLD", postcode: "4053", stage: "Lost", source: "Referral", buildingType: "Single storey", estimatedValue: 160000, probability: 0, lostReason: "Client went with a modular builder on price", assignedTo: "Sam Ridley", ...stamps(-44, 15) },
    { number: "L1009", title: "Carport & driveway", clientId: cPettersen.id, contactName: cPettersen.name, email: cPettersen.email, phone: cPettersen.mobile, address: cPettersen.address, cityTown: cPettersen.cityTown, state: "QLD", postcode: cPettersen.postcode, stage: "Quoting", source: "Repeat client", buildingType: "Custom", estimatedValue: 24000, probability: 70, expectedStart: D(25), followUpDate: D(1), assignedTo: "Kate Ng", description: "Flat-roof double carport and exposed aggregate driveway. Did his deck in 2023.", ...stamps(-5, 16) },
  ]).returning();
  const lead = Object.fromEntries(leadRows.map((l) => [l.number!, l]));

  // ================================================================ estimates
  // Q1001 — has a plan with takeoff measurements; quantities reference them.
  let planId = "";
  const q1001 = await buildEstimate({
    number: "Q1001", name: "Rear extension & deck — Ashgrove", status: "Accepted", buildingType: "Renovation & extension", client: cWhitfield, leadId: lead.L1006.id,
    markup: [{ name: "Markup", percent: 18 }, { name: "Contingency", percent: 3 }], rounding: "hundred", created: -70, sent: -60, accepted: -52,
    specIntro: "This quotation covers a new 40 m2 bedroom and family room extension with a 21.6 m2 spotted gum deck, as shown on the plans dated last month.",
    cats: [
      { name: "Preliminaries", items: [
        { code: "SP-FENCE", d: "Site establishment & temporary fencing (3 months)", q: 3 },
        { code: "SP-SKIP", q: 3 },
        { code: "SP-CERT", d: "Building certification, approvals & home warranty", q: 1 },
        { code: "LB-SUP", d: "Site supervision", q: 40 },
      ] },
      { name: "Slab & footings", items: [
        { code: "RC-SLAB", q: "[M1]", supplier: sConcrete.id, spec: true },
        { d: "Edge beams & pad footings (excavate, steel, pour)", ct: "Subcontractor", uom: "item", q: 1, cost: 3800, supplier: sConcrete.id },
        { code: "CN-PUMP", q: 1 },
        { d: "Termite management system (part A & B)", ct: "Subcontractor", uom: "m2", q: "[M1]", cost: 18.5 },
      ] },
      { name: "Framing & roof", items: [
        { code: "RC-STUDWALL", q: "[M2]+[M3]", supplier: sTimber.id },
        { code: "FR-TRUSS", q: "[M1]*[W10]", supplier: sTimber.id },
        { code: "RF-CORR", q: "[M1]*1.15*[W5]", supplier: sRoofing.id },
        { code: "RF-GUTTER", q: "8.4*[W5]", supplier: sRoofing.id },
        { code: "SG-WB180", d: "Fibre cement weatherboard 180mm (155mm cover)", q: "ceil([M2]*2.7/0.155*[W10])", supplier: sTimber.id },
        { code: "LB-CARP", d: "Carpenter — roof, cladding & fix-out", q: 56 },
        { d: "Aluminium windows & 2.4m sliding door", allow: "PC", uom: "allow", q: 1, cost: 9800, notes: "Prime cost — final selection by client." },
      ] },
      { name: "Deck", items: [
        { code: "RC-DECK", q: "[M4]", supplier: sTimber.id, spec: true },
        { code: "DK-BAL", q: 9.6 },
        { d: "Deck stairs, 4 risers incl. handrail", ct: "Material", uom: "item", q: 1, cost: 1150 },
        { d: "Deck oil, 2 coats", ct: "Subcontractor", uom: "m2", q: "[M4]", cost: 18 },
      ] },
      { name: "Electrical & plumbing", items: [
        { d: "Electrical rough-in & fit-off", allow: "PS", ct: "Subcontractor", uom: "allow", q: 1, cost: 4200, supplier: sElec.id },
        { code: "PE-DL", q: "[M5]", supplier: sElec.id },
        { code: "PE-GPO", q: 6, supplier: sElec.id },
        { code: "PE-STORM", d: "Stormwater & downpipe connection", allow: "PS", q: 1, supplier: sPlumb.id },
      ] },
      { name: "Linings & finishes", items: [
        { code: "SG-PB10", d: "10mm plasterboard to walls", q: "ceil(([M2]+[M3]*2)*2.7/2.88*[W10])" },
        { code: "SG-PB13", d: "13mm plasterboard to ceilings", q: "ceil([M1]/3.6*[W10])" },
        { code: "LB-PLAST", q: "([M2]+[M3]*2)*2.7+[M1]", supplier: sPlaster.id },
        { d: "Internal door, hung complete", uom: "ea", q: 2, subs: [
          { d: "Hollow core door 2040x820", q: 1, cost: 72 },
          { d: "Door jamb set, primed pine", q: 1, cost: 95, uom: "set" },
          { d: "Privacy lever set", q: 1, cost: 46 },
          { d: "Carpenter — hang & fit", q: 2.5, cost: 78, uom: "hr", ct: "Labour" },
        ] },
        { code: "LB-PAINT", d: "Painting internal & external", q: "([M2]+[M3]*2)*2.7+[M1]+[M2]*2.7", supplier: sPlaster.id },
        { d: "Floor coverings (hybrid plank)", allow: "PC", uom: "m2", q: "[M1]", cost: 65 },
        { code: "SP-CLEAN", q: 1 },
      ] },
    ],
  }, async (estimateId) => {
    const plan = drawExtensionPlan();
    const dataUrl = `data:image/png;base64,${plan.png.toString("base64")}`;
    const [p] = await db.insert(schema.plans).values({ estimateId, label: "Ground floor — proposed", description: "Rear extension & deck, 1:100", sortOrder: 0, imageDataUrl: dataUrl, imageWidth: plan.width, imageHeight: plan.height, scaleX: plan.mmPerPx, scaleY: plan.mmPerPx, scaleUnit: "mm", ...stamps(-69) }).returning();
    planId = p.id;
    await db.insert(schema.documents).values({ entityType: "estimate", entityId: estimateId, folder: "Plans", fileName: "ground-floor-proposed.png", mimeType: "image/png", sizeBytes: plan.png.length, dataUrl, ...stamps(-69) });
    const scale = { x: plan.mmPerPx, y: plan.mmPerPx };
    const defs: { code: string; description: string; shape: Shape; points: Pt[]; colour: string }[] = [
      { code: "M1", description: "Extension slab / floor area", shape: "rectangle", points: [[150, 330], [990, 810]], colour: "#2563eb" },
      { code: "M2", description: "New external walls", shape: "polyline", points: [[150, 330], [150, 810], [990, 810], [990, 330]], colour: "#dc2626" },
      { code: "M3", description: "Internal wall", shape: "line", points: [[600, 330], [600, 810]], colour: "#9333ea" },
      { code: "M4", description: "Deck area", shape: "rectangle", points: [[990, 330], [1350, 930]], colour: "#b45309" },
      { code: "M5", description: "Downlights", shape: "point", points: [[280, 440], [470, 440], [280, 700], [470, 700], [700, 440], [880, 440], [700, 700], [880, 700]], colour: "#ca8a04" },
    ];
    const out: Record<string, number> = {};
    for (const m of defs) {
      const c = computeMeasurement({ shape: m.shape, points: m.points, scale });
      await db.insert(schema.measurements).values({ estimateId, planId: p.id, code: m.code, description: m.description, shape: m.shape, points: JSON.stringify(m.points), colour: m.colour, unit: c.unit, value: c.value, ...stamps(-69) });
      out[m.code] = c.value;
    }
    await db.insert(schema.takeoffCounters).values({ estimateId, nextMeasurementNumber: defs.length + 1 });
    return out;
  });
  void planId;

  const q1002 = await buildEstimate({
    number: "Q1002", name: "Kitchen renovation — Paddington", status: "Accepted", buildingType: "Kitchen", client: cMarchetti, leadId: lead.L1007.id,
    markup: [{ name: "Markup", percent: 20 }, { name: "Contingency", percent: 2 }], rounding: "dollar", created: -45, sent: -38, accepted: -30,
    cats: [
      { name: "Demolition & preparation", items: [
        { code: "LB-LAB", d: "Strip out existing kitchen", q: 14 },
        { code: "SP-SKIP", q: 1 },
        { d: "Floor protection & dust screens", uom: "item", q: 1, cost: 260 },
      ] },
      { name: "Carpentry", items: [
        { code: "LB-CARP", d: "Remove non-load-bearing wall & re-frame opening", q: 16 },
        { code: "FR-9035", d: "Bulkhead framing 90x35", q: "18*[W10]", supplier: sTimber.id },
        { code: "SG-PB10", d: "Re-sheet walls 10mm plasterboard", q: "ceil(4.2*2.7/2.88*[W10])", supplier: sTimber.id },
        { d: "Plasterer — patch, set & sand", ct: "Subcontractor", uom: "item", q: 1, cost: 950, supplier: sPlaster.id },
      ] },
      { name: "Cabinetry & benchtops", items: [
        { d: "Kitchen cabinetry, 2-pac, soft close", allow: "PC", uom: "allow", q: 1, cost: 16500, spec: true },
        { d: "Engineered stone benchtops 20mm", allow: "PC", uom: "allow", q: 1, cost: 6800, spec: true },
        { code: "LB-CARP", d: "Appliance installation", q: 6 },
      ] },
      { name: "Plumbing & electrical", items: [
        { code: "PE-PLMB", d: "Plumbing points — sink, dishwasher, fridge", q: 3, supplier: sPlumb.id },
        { code: "PE-EXH", d: "Rangehood ducting & exhaust", q: 1, supplier: sElec.id },
        { code: "PE-GPO", q: 6, supplier: sElec.id },
        { code: "PE-DL", q: 6, supplier: sElec.id },
        { d: "Dedicated induction cooktop circuit", allow: "PS", ct: "Subcontractor", uom: "allow", q: 1, cost: 1200, supplier: sElec.id },
      ] },
      { name: "Tiling & splashback", items: [
        { d: "Splashback tiling (supply & lay)", uom: "m2", q: "4.2*0.65", subs: [
          { d: "Gloss subway tile 300x75", q: "1*[W10]", cost: 55, uom: "m2" },
          { d: "Adhesive & grout", q: 1, cost: 9.5, uom: "m2" },
          { d: "Tiler", q: 1, cost: 68, uom: "m2", ct: "Subcontractor" },
        ] },
      ] },
      { name: "Painting & clean", items: [
        { code: "LB-PAINT", d: "Painting walls & ceiling", q: 46, supplier: sPlaster.id },
        { code: "SP-CLEAN", q: 1 },
      ] },
    ],
  });

  const q1003 = await buildEstimate({
    number: "Q1003", name: "Bathroom & ensuite refresh — Carindale", status: "Sent", buildingType: "Bathroom", client: cOkafor, leadId: lead.L1005.id,
    markup: [{ name: "Markup", percent: 18 }, { name: "Contingency", percent: 2 }], created: -12, sent: -6,
    cats: [
      { name: "Demolition", items: [
        { code: "LB-LAB", d: "Strip out main bathroom", q: 16 },
        { code: "LB-LAB", d: "Strip out ensuite", q: 10 },
        { code: "SP-SKIP", q: 1 },
      ] },
      { name: "Waterproofing & tiling", items: [
        { code: "LB-WP", d: "Waterproofing membrane to AS 3740", q: "6.2+3.8", supplier: sTiling.id },
        { d: "Floor tiling (supply & lay)", uom: "m2", q: "6.2+3.8", subs: [
          { d: "Porcelain floor tile 600x600", q: "1*[W10]", cost: 62, uom: "m2" },
          { d: "Adhesive & grout", q: 1, cost: 9.5, uom: "m2" },
          { d: "Tiler", q: 1, cost: 68, uom: "m2", ct: "Subcontractor" },
        ] },
        { d: "Wall tiling to ceiling (supply & lay)", uom: "m2", q: "18.5+12", subs: [
          { d: "Matt wall tile 600x300", q: "1*[W10]", cost: 48, uom: "m2" },
          { d: "Adhesive & grout", q: 1, cost: 9.5, uom: "m2" },
          { d: "Tiler", q: 1, cost: 68, uom: "m2", ct: "Subcontractor" },
        ] },
      ] },
      { name: "Fixtures & fittings", items: [
        { d: "Main bathroom fixtures — vanity, toilet, tapware, bath", allow: "PC", uom: "allow", q: 1, cost: 4800, spec: true },
        { d: "Ensuite fixtures — vanity, toilet, tapware", allow: "PC", uom: "allow", q: 1, cost: 3600, spec: true },
        { d: "Frameless shower screen", ct: "Subcontractor", uom: "ea", q: 2, cost: 1150 },
      ] },
      { name: "Plumbing & electrical", items: [
        { d: "Plumber — rough-in & fit-off", ct: "Subcontractor", uom: "hr", q: 28, cost: 110, supplier: sPlumb.id },
        { d: "Electrical — lights, heated towel rails", allow: "PS", ct: "Subcontractor", uom: "allow", q: 1, cost: 1400, supplier: sElec.id },
        { code: "PE-EXH", q: 2, supplier: sElec.id },
      ] },
      { name: "Carpentry & linings", items: [
        { code: "SG-WR10", q: 14 },
        { code: "LB-CARP", d: "Carpenter — framing repairs, niches & sheeting", q: 12 },
      ] },
    ],
  });

  const q1004 = await buildEstimate({
    number: "Q1004", name: "Carport & driveway — Wynnum", status: "Draft", buildingType: "Custom", client: cPettersen, leadId: lead.L1009.id,
    markup: [{ name: "Markup", percent: 20 }], created: -3,
    cats: [
      { name: "Concrete", items: [
        { code: "RC-SLAB", d: "Carport slab 100mm (per m2)", q: 36, supplier: sConcrete.id },
        { d: "Exposed aggregate driveway (supply & lay)", ct: "Subcontractor", uom: "m2", q: 42, cost: 115 },
      ] },
      { name: "Carport structure", items: [
        { d: "Steel post & beam kit, 6.0 x 6.0m flat roof", uom: "item", q: 1, cost: 5200 },
        { d: "Pad footings for posts", ct: "Subcontractor", uom: "ea", q: 4, cost: 165 },
        { code: "LB-CARP", d: "Erect carport frame & roof", q: 24 },
        { code: "RF-CORR", q: "6*6*[W5]", supplier: sRoofing.id },
        { code: "RF-GUTTER", q: 6, supplier: sRoofing.id },
        { code: "RF-DP", q: 2, supplier: sRoofing.id },
      ] },
      { name: "Electrical", items: [
        { d: "Carport lighting & weatherproof GPO", allow: "PS", ct: "Subcontractor", uom: "allow", q: 1, cost: 900, supplier: sElec.id },
      ] },
    ],
  });

  const q1005 = await buildEstimate({
    number: "Q1005", name: "Granny flat 60m2 — Mitchelton", status: "Rejected", buildingType: "Single storey", client: cSaltwater, leadId: lead.L1008.id,
    markup: [{ name: "Markup", percent: 16 }, { name: "Contingency", percent: 4 }], rounding: "thousand", created: -40, sent: -34,
    cats: [
      { name: "Preliminaries", items: [
        { code: "SP-CERT", q: 1 },
        { code: "LB-SUP", d: "Site supervision", q: 120 },
        { code: "SP-SKIP", q: 4 },
      ] },
      { name: "Slab & footings", items: [
        { code: "RC-SLAB", q: 62 },
        { d: "Footings & piers to engineer's design", ct: "Subcontractor", uom: "item", q: 1, cost: 6200 },
        { d: "Termite management system", ct: "Subcontractor", uom: "m2", q: 62, cost: 18.5 },
      ] },
      { name: "Frame & roof", items: [
        { code: "RC-STUDWALL", q: 58 },
        { code: "FR-TRUSS", q: "62*[W10]" },
        { code: "RF-CORR", q: "62*1.15*[W5]" },
        { d: "Windows & external doors", allow: "PC", uom: "allow", q: 1, cost: 12500 },
      ] },
      { name: "Services", items: [
        { d: "Electrical installation", allow: "PS", ct: "Subcontractor", uom: "allow", q: 1, cost: 9800 },
        { d: "Plumbing & drainage", allow: "PS", ct: "Subcontractor", uom: "allow", q: 1, cost: 14500 },
        { code: "PE-HWS", q: 1 },
      ] },
      { name: "Fit-out", items: [
        { d: "Kitchenette", allow: "PC", uom: "allow", q: 1, cost: 9500 },
        { d: "Bathroom fixtures", allow: "PC", uom: "allow", q: 1, cost: 7800 },
        { code: "LB-PLAST", q: 210 },
        { code: "LB-PAINT", q: 260 },
        { d: "Floor coverings", allow: "PC", uom: "m2", q: 60, cost: 65 },
      ] },
    ],
  });

  const q1006 = await buildEstimate({
    number: "Q1006", name: "Deck & pergola — Bulimba", status: "In Progress", buildingType: "Deck", client: cDoyle, leadId: lead.L1004.id,
    markup: [{ name: "Markup", percent: 18 }, { name: "Contingency", percent: 2 }], created: -5,
    cats: [
      { name: "Deck", items: [
        { code: "RC-DECK", q: 28, supplier: sTimber.id },
        { d: "Deck oil, 2 coats", ct: "Subcontractor", uom: "m2", q: 28, cost: 18 },
      ] },
      { name: "Pergola", items: [
        { code: "FR-H3-14045", d: "Pergola framing 140x45 H3", q: "42*[W10]", supplier: sTimber.id },
        { d: "Twinwall polycarbonate roofing", uom: "m2", q: "4*5*[W5]", cost: 52 },
        { code: "FR-TIE", q: 4 },
        { code: "LB-CARP", d: "Carpenter — pergola", q: 32 },
      ] },
      { name: "Balustrade & stairs", items: [
        { code: "DK-BAL", q: 12.5 },
        { d: "Deck stairs, 4 risers incl. handrail", uom: "item", q: 1, cost: 1150 },
      ] },
    ],
  });

  const tpl = await buildEstimate({
    number: "TPL1", name: "Standard spotted gum deck — 20 m2", status: "Draft", buildingType: "Deck", isTemplate: true,
    markup: [{ name: "Markup", percent: 18 }, { name: "Contingency", percent: 2 }], created: -120,
    cats: [
      { name: "Deck", items: [{ code: "RC-DECK", q: 20 }, { d: "Deck oil, 2 coats", ct: "Subcontractor", uom: "m2", q: 20, cost: 18 }] },
      { name: "Balustrade", items: [{ code: "DK-BAL", q: 10 }] },
      { name: "Stairs", items: [{ d: "Deck stairs, 4 risers incl. handrail", uom: "item", q: 1, cost: 1150 }] },
    ],
  });
  void q1004; void q1006; void tpl;

  // ---------------------------------------------------------------- specifications & quote options
  async function specs(estimateId: string, tree: { h: string; b?: string; kids?: { h: string; b: string }[] }[]) {
    for (const [i, s] of tree.entries()) {
      const [row] = await db.insert(schema.specifications).values({ estimateId, sortOrder: i + 1, heading: s.h, body: s.b ?? null }).returning();
      if (s.kids) await db.insert(schema.specifications).values(s.kids.map((k, j) => ({ estimateId, parentId: row.id, sortOrder: j + 1, heading: k.h, body: k.b })));
    }
  }
  await specs(q1001.est.id, [
    { h: "Preliminaries", b: "Building approval, private certification and QBCC home warranty insurance are included. Temporary fencing, site toilet and skip bins for the duration of works." },
    { h: "Structure", kids: [
      { h: "Slab", b: "100mm 25MPa slab on ground with SL82 mesh and edge beams to the engineer's design. Termite management system to AS 3660.1." },
      { h: "Framing", b: "90mm MGP10 pine wall frames at 450 centres, engineered roof trusses, tie-downs to N3 wind rating." },
    ] },
    { h: "Roof & external", b: "Corrugated steel roofing (colour to match existing), quad gutters, 180mm fibre cement weatherboards, aluminium windows and sliding door (PC allowance)." },
    { h: "Deck", b: "Spotted gum 140x19 decking on H3 treated pine subframe, oiled finish, stainless wire balustrade and 4-riser stair with handrail." },
    { h: "Internal finishes", b: "10mm plasterboard walls, 13mm ceilings, level 4 finish, 3-coat paint system, floor coverings (PC allowance)." },
    { h: "Exclusions", b: "Landscaping, window furnishings, relocation of services not shown on the plans, rock excavation." },
  ]);
  await specs(q1002.est.id, [
    { h: "Scope", b: "Remove existing kitchen and non-load-bearing wall to dining, new 2-pac cabinetry, stone benchtops, tiled splashback, new lighting and power." },
    { h: "Cabinetry & benchtops", b: "Allowances are prime cost items. The final price is adjusted to the client's selections plus our margin." },
    { h: "Exclusions", b: "Appliances (supplied by client), flooring, window furnishings." },
  ]);
  await specs(q1003.est.id, [
    { h: "Scope", b: "Full strip-out and renovation of the main bathroom and ensuite, floor-to-ceiling tiling, frameless shower screens." },
    { h: "Waterproofing", b: "Licensed waterproofer, membrane to AS 3740 with certificate issued on completion." },
    { h: "Exclusions", b: "Mould remediation, asbestos removal (if found, priced as a variation)." },
  ]);
  await db.insert(schema.quoteOptions).values([
    { estimateId: q1001.est.id, printCategoryTotals: true, shareToken: randomBytes(18).toString("base64url"), acceptanceSignatureName: "Priya Whitfield", acceptanceSignedAt: T(-52, 19) },
    { estimateId: q1002.est.id, printCategoryTotals: true, printItems: true, shareToken: randomBytes(18).toString("base64url"), acceptanceSignatureName: "Helen Marchetti", acceptanceSignedAt: T(-30, 19) },
    { estimateId: q1003.est.id, printCategoryTotals: true, validDays: 30, shareToken: randomBytes(18).toString("base64url") },
    { estimateId: q1005.est.id, printCategoryTotals: true, validDays: 21 },
  ]);
  await db.insert(schema.specificationTemplates).values({
    name: "Extension — standard inclusions (demo)",
    content: JSON.stringify([
      { heading: "Preliminaries", body: "Approvals, certification, home warranty insurance, site fencing and waste removal." },
      { heading: "Structure", body: "Slab on ground to engineer's design, MGP10 pine framing, engineered trusses.", children: [{ heading: "Termite protection", body: "Part A & B system to AS 3660.1." }] },
      { heading: "Exclusions", body: "Landscaping, window furnishings, rock excavation." },
    ]),
  });

  // ================================================================ jobs (like createJobFromEstimate)
  async function createJob(number: string, built: Awaited<ReturnType<typeof buildEstimate>>, clientId: string, start: string, description: string) {
    const e = built.est;
    const [job] = await db.insert(schema.jobs).values({
      number, name: e.name, estimateId: e.id, clientId, status: "In progress", siteAddress: e.siteAddress, siteCityTown: e.siteCityTown, siteState: e.siteState, sitePostcode: e.sitePostcode,
      startDate: start, contractValue: e.quoteTotal, projectManager: PM, description, ...stamps(calendarDaysBetween(TODAY, start) - 3),
    }).returning();
    const byId = new Map(built.rows.map((i) => [i.id!, i]));
    const rootOf = (id: string) => { let cur = byId.get(id)!; while (cur.parentId && byId.has(cur.parentId)) cur = byId.get(cur.parentId)!; return cur; };
    const lines: (typeof schema.jobBudgetLines.$inferInsert)[] = [];
    for (const id of built.r.order) {
      const it = byId.get(id); const ri = built.r.items[id];
      if (!it || !ri || it.kind === "category" || ri.hasChildren) continue;
      const root = rootOf(id);
      lines.push({ id: crypto.randomUUID(), jobId: job.id, category: root.kind === "category" ? root.description || "Uncategorised" : "General", description: it.description || "(no description)", costType: it.costType ?? "Material", uom: it.uom, quantity: ri.effectiveQuantity, unitCost: ri.unitCost, budget: ri.total, sortOrder: lines.length + 1 });
    }
    await db.insert(schema.jobBudgetLines).values(lines);
    await db.update(schema.estimates).set({ jobId: job.id, updatedAt: T(calendarDaysBetween(TODAY, start) - 3) }).where(eq(schema.estimates.id, e.id));
    return { job, lines };
  }

  /** Builds dependent tasks; start = day after the latest predecessor finishes. Progress follows today. */
  async function schedule(jobId: string, start: string, defs: { key: string; name: string; days: number; after?: string[]; who?: string; colour?: string }[]) {
    const placed = new Map<string, { id: string; startDate: string; durationDays: number }>();
    const rows: (typeof schema.jobTasks.$inferInsert)[] = [];
    defs.forEach((d, i) => {
      const preds = (d.after ?? []).map((k) => placed.get(k)!);
      const s = preds.length ? preds.map((p) => nextWorkingDay(taskFinish(p))).sort().at(-1)! : snapToWorkingDay(start);
      const t = { id: crypto.randomUUID(), startDate: s, durationDays: d.days };
      placed.set(d.key, t);
      const fin = taskFinish(t);
      const progress = fin < TODAY ? 100 : s > TODAY ? 0 : Math.min(90, Math.round(((workingDaysInclusive(s, TODAY) - 0.5) / d.days) * 100));
      rows.push({ id: t.id, jobId, name: d.name, startDate: s, durationDays: d.days, dependsOn: JSON.stringify(preds.map((p) => p.id)), assigneeContactId: d.who ?? null, progress, colour: d.colour ?? null, sortOrder: i + 1 });
    });
    await db.insert(schema.jobTasks).values(rows);
    const end = [...placed.values()].map(taskFinish).sort().at(-1)!;
    await db.update(schema.jobs).set({ startDate: snapToWorkingDay(start), endDate: end }).where(eq(schema.jobs.id, jobId));
  }

  // ---------------------------------------------------------------- J1000 — Ashgrove extension
  const j1Start = snapToWorkingDay(D(-35));
  const { job: j1, lines: j1Lines } = await createJob("J1000", q1001, cWhitfield.id, j1Start, "Rear extension (bedroom + family) and spotted gum deck. Access via side driveway; dog on site — keep side gate shut.");
  await schedule(j1.id, j1Start, [
    { key: "site", name: "Site establishment & set-out", days: 2 },
    { key: "foot", name: "Excavation & footings", days: 4, after: ["site"], who: sConcrete.id },
    { key: "slab", name: "Slab pour & cure", days: 5, after: ["foot"], who: sConcrete.id },
    { key: "frame", name: "Wall framing", days: 6, after: ["slab"] },
    { key: "roof", name: "Roof trusses & sheeting", days: 5, after: ["frame"], who: sRoofing.id },
    { key: "lock", name: "Windows, cladding & lock-up", days: 4, after: ["roof"] },
    { key: "rough", name: "Electrical & plumbing rough-in", days: 3, after: ["roof"], who: sElec.id },
    { key: "deck", name: "Deck subframe & decking", days: 6, after: ["slab"] },
    { key: "lining", name: "Plasterboard, set & sand", days: 6, after: ["lock", "rough"], who: sPlaster.id },
    { key: "paint", name: "Painting", days: 5, after: ["lining"], who: sPlaster.id },
    { key: "fitoff", name: "Fit-off, floor coverings & clean", days: 3, after: ["paint", "deck"], who: sElec.id },
    { key: "pc", name: "Practical completion & handover", days: 1, after: ["fitoff"], colour: "#16a34a" },
  ]);

  // ---------------------------------------------------------------- J1001 — Paddington kitchen
  const j2Start = snapToWorkingDay(D(-14));
  const { job: j2, lines: j2Lines } = await createJob("J1001", q1002, cMarchetti.id, j2Start, "Kitchen renovation. Client living on site — temporary kitchenette set up in laundry.");
  await schedule(j2.id, j2Start, [
    { key: "strip", name: "Strip-out & protection", days: 2 },
    { key: "rough", name: "Plumbing & electrical rough-in", days: 3, after: ["strip"], who: sPlumb.id },
    { key: "wall", name: "Wall framing & re-sheeting", days: 3, after: ["rough"] },
    { key: "cab", name: "Cabinet installation", days: 4, after: ["wall"] },
    { key: "tmpl", name: "Benchtop template", days: 1, after: ["cab"] },
    { key: "bench", name: "Benchtop fabrication & install", days: 7, after: ["tmpl"] },
    { key: "tile", name: "Splashback tiling", days: 2, after: ["bench"], who: sTiling.id },
    { key: "fit", name: "Plumbing & electrical fit-off", days: 2, after: ["bench"], who: sElec.id },
    { key: "paint", name: "Painting", days: 3, after: ["tile", "fit"], who: sPlaster.id },
    { key: "hand", name: "Handover", days: 1, after: ["paint"], colour: "#16a34a" },
  ]);

  const findLine = (lines: typeof j1Lines, desc: string, category?: string) => {
    const l = lines.find((x) => x.description === desc && (!category || x.category === category));
    if (!l) throw new Error(`Budget line not found: ${desc}`);
    return l;
  };

  // ---------------------------------------------------------------- purchase orders
  const poLine = (l: (typeof j1Lines)[number], supplierCode = ""): PoLine => ({ description: l.description, itemCode: supplierCode, quantity: Math.round(l.quantity! * 1000) / 1000, uom: l.uom ?? "", unitCost: l.unitCost!, costType: l.costType, budgetLineId: l.id! });
  const po1Lines = [poLine(findLine(j1Lines, "90x45 MGP10 pine framing"), "FR-9045"), poLine(findLine(j1Lines, "Framing nails 75mm (box 2500)"), "FR-NAIL"), poLine(findLine(j1Lines, "Cyclone tie-down rods & hardware set"), "FR-TIE"), poLine(findLine(j1Lines, "Roof trusses supply (per m2 of roof)"), "FR-TRUSS")];
  const po1 = poTotals(po1Lines, TAX);
  const po2Lines = [poLine(findLine(j1Lines, "Corrugated steel roof sheet 0.42 BMT"), "RF-CORR"), poLine(findLine(j1Lines, "Quad gutter 115mm"), "RF-GUTTER"), { description: "Downpipe 90mm round (3m)", itemCode: "RF-DP", quantity: 3, uom: "ea", unitCost: 46, costType: "Material", budgetLineId: null }];
  const po2 = poTotals(po2Lines, TAX);
  const [poA, poB] = await db.insert(schema.purchaseOrders).values([
    { jobId: j1.id, number: "PO1000", supplierId: sTimber.id, status: "Billed", orderDate: D(-22), deliveryDate: D(-18), deliveryAddress: `${j1.siteAddress}, ${j1.siteCityTown} QLD ${j1.sitePostcode}`, deliveryInstructions: "Drop on driveway, left side. Call Jono 30 min before.", lines: JSON.stringify(po1Lines), subtotal: po1.subtotal, taxTotal: po1.tax, total: po1.total, ...stamps(-22) },
    { jobId: j1.id, number: "PO1001", supplierId: sRoofing.id, status: "Sent", orderDate: D(-4), deliveryDate: D(3), deliveryAddress: `${j1.siteAddress}, ${j1.siteCityTown} QLD ${j1.sitePostcode}`, deliveryInstructions: "Colour: Monument-style dark grey to match existing. Crane truck required.", lines: JSON.stringify(po2Lines), subtotal: po2.subtotal, taxTotal: po2.tax, total: po2.total, ...stamps(-4) },
  ]).returning();
  void poB;

  // ---------------------------------------------------------------- actual costs (bill for PO1000 recorded the way recordBill does)
  const ac = (job: typeof j1, l: (typeof j1Lines)[number] | null, date: number, desc: string, amount: number, supplierId: string | null, ref: string, costType?: string) => ({
    jobId: job.id, budgetLineId: l?.id ?? null, supplierId, date: D(date), reference: ref, description: desc, costType: costType ?? l?.costType ?? "Material", amount: r2(amount), tax: r2(amount * TAX), ...stamps(date, 14),
  });
  const L1 = (d: string, c?: string) => findLine(j1Lines, d, c);
  const L2 = (d: string, c?: string) => findLine(j2Lines, d, c);
  await db.insert(schema.actualCosts).values([
    { jobId: j1.id, purchaseOrderId: poA.id, supplierId: sTimber.id, budgetLineId: null, date: D(-17), reference: "NTH-INV-55821", description: `PO1000 · ${sTimber.businessName} · ${po1Lines[0].description} +${po1Lines.length - 1} more`, costType: dominantCostType(po1Lines), amount: po1.subtotal, tax: po1.tax, ...stamps(-17, 14) },
    ac(j1, L1("Site establishment & temporary fencing (3 months)"), -34, "Fence hire — first two months", 760, null, "FH-10442"),
    ac(j1, L1("Skip bin 6m3 (exchange)", "Preliminaries"), -30, "Skip bin exchange x2", 1040, null, "SKP-2231"),
    ac(j1, L1("Building certification, approvals & home warranty"), -36, "Certifier & QBCC home warranty", 2910, null, "CERT-8812", "Other"),
    ac(j1, L1("Edge beams & pad footings (excavate, steel, pour)"), -27, "Footings — excavation, steel & pour", 3725, sConcrete.id, "BRM-30218"),
    ac(j1, L1("25MPa concrete delivered"), -24, "Slab concrete 4.4 m3", 1188, sConcrete.id, "BRM-30277"),
    ac(j1, L1("SL82 reinforcing mesh 6.0x2.4"), -26, "SL82 mesh x4 sheets", 512, sTimber.id, "NTH-INV-55410"),
    ac(j1, L1("Concrete line pump hire"), -24, "Line pump — slab pour", 980, null, "PMP-7781"),
    ac(j1, L1("Termite management system (part A & B)"), -25, "Termite system — part A & B", 746, null, "TRM-1102", "Subcontractor"),
    ac(j1, L1("Concreter (place & finish)"), -24, "Concreters — place & finish slab", 1275, sConcrete.id, "BRM-30279"),
    ac(j1, L1("Fibre cement weatherboard 180mm (155mm cover)"), -6, "Weatherboards & trims", 2870, sTimber.id, "NTH-INV-56102"),
  ]);
  await db.insert(schema.actualCosts).values([
    ac(j2, L2("Skip bin 6m3 (exchange)"), -13, "Skip bin", 520, null, "SKP-2288"),
    ac(j2, L2("Floor protection & dust screens"), -14, "Floor protection & zip walls", 284, null, "BNG-11902"),
    ac(j2, L2("Plumbing points — sink, dishwasher, fridge"), -9, "Rough-in plumbing", 1140, sPlumb.id, "CFP-4410", "Subcontractor"),
    ac(j2, L2("Bulkhead framing 90x35"), -8, "Framing timber", 102.4, sTimber.id, "NTH-INV-55990"),
    ac(j2, L2("Re-sheet walls 10mm plasterboard"), -7, "Plasterboard x5", 92.5, sTimber.id, "NTH-INV-56010"),
    ac(j2, L2("Kitchen cabinetry, 2-pac, soft close"), -3, "Cabinetry — 50% deposit to joiner", 8250, null, "JNR-0412", "Material"),
  ]);

  // ---------------------------------------------------------------- timesheets
  const ts: (typeof schema.timesheets.$inferInsert)[] = [];
  let day = D(-1);
  for (let i = 0; i < 9; i++) {
    while (!isWorkingDay(day)) day = addCalendarDays(day, -1);
    const n = calendarDaysBetween(TODAY, day);
    ts.push({ jobId: j1.id, worker: "Jono Pearce", date: day, hours: i % 4 === 0 ? 7.5 : 8, rate: 78, notes: i < 3 ? "Cladding & window install" : "Wall & roof framing", ...stamps(n, 17) });
    ts.push({ jobId: j1.id, worker: "Riley Burns (apprentice)", date: day, hours: 8, rate: 45, notes: null, ...stamps(n, 17) });
    day = addCalendarDays(day, -1);
  }
  for (const [n, h, note] of [[-12, 8, "Strip-out"], [-11, 6, "Strip-out & wall removal"], [-8, 8, "Re-frame opening, bulkhead"], [-7, 7.5, "Sheeting"], [-4, 8, "Cabinet install"], [-3, 8, "Cabinet install"]] as const) {
    const d = snapToWorkingDay(D(n));
    ts.push({ jobId: j2.id, worker: "Sam Ridley", date: d, hours: h, rate: 78, notes: note, ...stamps(n, 17) });
  }
  await db.insert(schema.timesheets).values(ts);

  // ---------------------------------------------------------------- selections
  await db.insert(schema.selections).values([
    { jobId: j2.id, category: "Benchtops", name: "Kitchen benchtop", options: JSON.stringify([{ name: "20mm engineered stone — Calacatta look", price: 6800 }, { name: "40mm mitred engineered stone", price: 8900 }, { name: "Laminate, square edge", price: 2600 }]), chosenOption: "40mm mitred engineered stone", allowance: 6800, dueDate: D(-6), status: "Approved", ...stamps(-20) },
    { jobId: j2.id, category: "Tiling", name: "Splashback tile", options: JSON.stringify([{ name: "Gloss white subway 300x75", price: 55 }, { name: "Handmade-look green 200x65", price: 96 }]), chosenOption: "Handmade-look green 200x65", allowance: 55, dueDate: D(2), status: "Selected", ...stamps(-10) },
    { jobId: j2.id, category: "Tapware", name: "Sink mixer & sink", options: JSON.stringify([{ name: "Brushed nickel pull-out mixer + undermount sink", price: 1150 }, { name: "Matte black gooseneck + double bowl", price: 980 }]), chosenOption: null, allowance: 1000, dueDate: D(5), status: "Pending", ...stamps(-10) },
    { jobId: j1.id, category: "Flooring", name: "Floor coverings — hybrid plank", options: JSON.stringify([{ name: "Natural oak look 9mm", price: 62 }, { name: "Spotted gum look 9mm", price: 68 }]), chosenOption: null, allowance: 65, dueDate: D(12), status: "Pending", ...stamps(-20) },
    { jobId: j1.id, category: "External", name: "Weatherboard paint colour", options: JSON.stringify([{ name: "Match existing (warm white)", price: 0 }, { name: "Contrast charcoal", price: 0 }]), chosenOption: "Match existing (warm white)", allowance: 0, dueDate: D(-5), status: "Selected", ...stamps(-15) },
  ]);

  // ---------------------------------------------------------------- variations (J1000)
  const v1Lines: VariationLine[] = [
    { description: "Additional LED downlights (supply & install)", quantity: 4, uom: "ea", unitCost: 95, costType: "Subcontractor" },
    { description: "Weatherproof double GPO to deck", quantity: 1, uom: "ea", unitCost: 210, costType: "Subcontractor" },
  ];
  const v2Lines: VariationLine[] = [
    { description: "Frameless glass balustrade (supply & install)", quantity: 9.6, uom: "lm", unitCost: 520, costType: "Subcontractor" },
    { description: "Credit — stainless wire balustrade", quantity: 9.6, uom: "lm", unitCost: -245, costType: "Subcontractor" },
  ];
  const v1 = variationTotals(v1Lines, 18, TAX);
  const v2 = variationTotals(v2Lines, 18, TAX);
  const [var1, var2] = await db.insert(schema.variations).values([
    { jobId: j1.id, number: "V1", title: "Extra downlights & deck power point", description: "Client requested 4 extra downlights in the family room and a weatherproof GPO on the deck.", status: "Approved", lines: JSON.stringify(v1Lines), markupPercent: 18, costTotal: v1.cost, taxTotal: v1.tax, total: v1.total, approvedAt: T(-10, 18), ...stamps(-12) },
    { jobId: j1.id, number: "V2", title: "Upgrade deck balustrade to frameless glass", description: "Replace the stainless wire balustrade with 12mm frameless glass.", status: "Sent", lines: JSON.stringify(v2Lines), markupPercent: 18, costTotal: v2.cost, taxTotal: v2.tax, total: v2.total, ...stamps(-3) },
  ]).returning();
  void var2;
  // Approving V1 adds its total to the contract (contractDeltaForVariation) — revised contract.
  await db.update(schema.jobs).set({ contractValue: r2(q1001.est.quoteTotal + v1.total) }).where(eq(schema.jobs.id, j1.id));

  // ---------------------------------------------------------------- invoices & payments
  const j1Base = q1001.est.quoteTotal; // original contract (revised minus approved variations)
  const j2Base = q1002.est.quoteTotal;
  type Inv = { jobId: string; number: string; kind: "Deposit" | "Progress claim" | "Variation"; issue: number; due: number; lines: InvoiceLine[]; claimPercent?: number; payments: { day: number; amount?: number; ref: string }[]; notes?: string };
  const depositLine = (base: number): InvoiceLine => ({ description: "Deposit — 10% of contract price", amount: percentOfContractExTax(base, 10, TAX), taxable: true });
  const claimLine = (base: number, prev: number, cumulative: number): InvoiceLine => {
    const pc = progressClaim({ contractValue: base, previouslyClaimed: prev, cumulativePercent: cumulative });
    return { description: `Progress claim — ${pc.cumulativePercent}% complete (this claim ${pc.thisPercent}%, previously claimed ${pc.previousPercent}%)`, amount: exTax(pc.amount, TAX), taxable: true };
  };
  const j1Dep = depositLine(j1Base);
  const j1DepTotal = invoiceTotals([j1Dep], TAX).total;
  const j2Dep = depositLine(j2Base);
  const j2DepTotal = invoiceTotals([j2Dep], TAX).total;
  const invs: Inv[] = [
    { jobId: j1.id, number: "INV1000", kind: "Deposit", issue: -51, due: -44, lines: [j1Dep], claimPercent: 10, payments: [{ day: -47, ref: "WHITFIELD DEP" }] },
    { jobId: j2.id, number: "INV1001", kind: "Deposit", issue: -29, due: -22, lines: [j2Dep], claimPercent: 10, payments: [{ day: -27, ref: "MARCHETTI KITCHEN" }] },
    { jobId: j2.id, number: "INV1002", kind: "Progress claim", issue: -16, due: -9, lines: [claimLine(j2Base, j2DepTotal, 30)], claimPercent: 30, payments: [], notes: "Stage: strip-out, rough-in and re-sheeting complete." },
    { jobId: j1.id, number: "INV1003", kind: "Progress claim", issue: -6, due: 1, lines: [claimLine(j1Base, j1DepTotal, 35)], claimPercent: 35, payments: [{ day: -2, amount: 15000, ref: "WHITFIELD PC1 PART" }], notes: "Stage: slab, frame and roof." },
    { jobId: j1.id, number: "INV1004", kind: "Variation", issue: -4, due: 3, lines: [{ description: `Variation V1 — ${var1.title}`, amount: r2(var1.total - var1.taxTotal), taxable: var1.taxTotal !== 0, variationId: var1.id }], payments: [] },
  ];
  for (const iv of invs) {
    const t = invoiceTotals(iv.lines, TAX);
    const pays = iv.payments.map((p) => ({ date: D(p.day), amount: p.amount ?? t.total, reference: p.ref }));
    const paid = r2(pays.reduce((s, p) => s + p.amount, 0));
    const [inv] = await db.insert(schema.invoices).values({
      jobId: iv.jobId, number: iv.number, kind: iv.kind, status: statusFromPayments("Sent", t.total, paid), issueDate: D(iv.issue), dueDate: D(iv.due),
      lines: JSON.stringify(iv.lines), claimPercent: iv.claimPercent ?? null, subtotal: t.subtotal, taxTotal: t.tax, total: t.total, amountPaid: paid, notes: iv.notes ?? null, ...stamps(iv.issue),
    }).returning();
    if (pays.length) await db.insert(schema.payments).values(pays.map((p) => ({ invoiceId: inv.id, date: p.date, amount: p.amount, method: "Bank transfer", reference: p.reference })));
  }

  // ================================================================ counters
  await db.update(schema.businessSettings).set({ nextEstimateNumber: 1007, nextJobNumber: 1002, nextInvoiceNumber: 1005, nextOrderNumber: 1002, nextVariationNumber: 3 }).where(eq(schema.businessSettings.id, settings.id));

  // ================================================================ notes, reminders, activity
  await db.insert(schema.notes).values([
    { entityType: "job", entityId: j1.id, body: "Slab poured — finish looks great. Certifier frame inspection booked once roof is on.", author: "Jono Pearce", ...stamps(-24, 15) },
    { entityType: "job", entityId: j1.id, body: "Client asked about glass balustrade — sent V2 for approval.", author: "Sam Ridley", ...stamps(-3, 12) },
    { entityType: "job", entityId: j2.id, body: "Benchtop templating booked with fabricator for next week. Client chose 40mm mitred edge (over allowance — difference to be claimed).", author: "Kate Ng", ...stamps(-6, 10) },
    { entityType: "lead", entityId: lead.L1002.id, body: "Left voicemail. Has draftsperson drawings — asked him to email PDFs.", author: "Sam Ridley", ...stamps(-6, 16) },
    { entityType: "client", entityId: cSaltwater.id, body: "Developer client — 3 more granny flats possible next year. Keep in touch.", author: "Sam Ridley", ...stamps(-18, 11) },
    { entityType: "estimate", entityId: q1003.est.id, body: "Clients comparing with one other quote. Mei prefers the matt tile option.", author: "Kate Ng", ...stamps(-4, 14) },
  ]);
  await db.insert(schema.reminders).values([
    { title: "Chase overdue progress claim INV1002 (Marchetti)", dueDate: D(-3), entityType: "job", entityId: j2.id, assignedTo: "Kate Ng", details: "Progress claim 30% is past due — call Helen before benchtop install.", ...stamps(-8) },
    { title: "Follow up Kedron second-storey enquiry", dueDate: D(-2), entityType: "lead", entityId: lead.L1002.id, assignedTo: "Sam Ridley", ...stamps(-9) },
    { title: "Confirm roofing delivery for PO1001", dueDate: TODAY, entityType: "job", entityId: j1.id, assignedTo: "Jono Pearce", details: "Crane truck needs side access — check neighbour's car is moved.", ...stamps(-4) },
    { title: "Call the Okafors about bathroom quote Q1003", dueDate: TODAY, entityType: "estimate", entityId: q1003.est.id, assignedTo: "Kate Ng", ...stamps(-6) },
    { title: "Site visit — The Gap laundry & mudroom", dueDate: D(2), entityType: "lead", entityId: lead.L1003.id, assignedTo: "Sam Ridley", details: "9:30am. Take moisture meter.", ...stamps(-4) },
    { title: "Request updated insurance certificate from Bright Spark", dueDate: D(7), entityType: "contact", entityId: sElec.id, assignedTo: "Kate Ng", ...stamps(-1) },
    { title: "Book plasterer for Ashgrove linings", dueDate: D(9), entityType: "job", entityId: j1.id, assignedTo: "Jono Pearce", ...stamps(-2) },
    { title: "Send deposit invoice — Paddington kitchen", dueDate: D(-29), done: true, entityType: "job", entityId: j2.id, assignedTo: "Kate Ng", ...stamps(-30) },
  ]);
  const act = (n: number, hour: number, entityType: string, entityId: string, action: string, summary: string) => ({ entityType, entityId, action, summary, createdAt: T(n, hour, (Math.abs(n) * 7 + hour * 13) % 60) });
  await db.insert(schema.activity).values([
    act(-75, 10, "lead", lead.L1006.id, "created", "Lead L1006 “Rear extension & deck” created"),
    act(-70, 11, "estimate", q1001.est.id, "created", "Estimate Q1001 created"),
    act(-69, 14, "estimate", q1001.est.id, "plan_added", "Plan \"Ground floor — proposed\" uploaded"),
    act(-60, 15, "estimate", q1001.est.id, "quote_sent", "Quote Q1001 marked as sent"),
    act(-52, 19, "estimate", q1001.est.id, "quote_accepted", "Quote Q1001 accepted online by Priya Whitfield"),
    act(-52, 19, "lead", lead.L1006.id, "won", "Lead L1006 won: quote Q1001 accepted"),
    act(-51, 9, "job", j1.id, "invoice_created", "Deposit invoice INV1000 created"),
    act(-48, 13, "lead", lead.L1007.id, "created", "Lead L1007 “Kitchen renovation” created"),
    act(-47, 10, "job", j1.id, "payment", "Payment received for INV1000"),
    act(-44, 15, "lead", lead.L1008.id, "created", "Lead L1008 “Granny flat 60m2” created"),
    act(-38, 15, "estimate", q1002.est.id, "quote_sent", "Quote Q1002 marked as sent"),
    act(-38, 9, "job", j1.id, "created", "Job J1000 created from estimate Q1001"),
    act(-34, 16, "estimate", q1005.est.id, "quote_sent", "Quote Q1005 marked as sent"),
    act(-30, 19, "estimate", q1002.est.id, "quote_accepted", "Quote Q1002 accepted online by Helen Marchetti"),
    act(-29, 9, "job", j2.id, "invoice_created", "Deposit invoice INV1001 created"),
    act(-22, 11, "job", j1.id, "order_created", "Purchase order PO1000 created"),
    act(-20, 10, "lead", lead.L1008.id, "lost", "Lead L1008 marked as lost: Client went with a modular builder on price"),
    act(-17, 14, "job", j1.id, "order_billed", "Bill recorded for PO1000"),
    act(-17, 8, "job", j2.id, "created", "Job J1001 created from estimate Q1002"),
    act(-16, 9, "job", j2.id, "invoice_created", "Progress claim invoice INV1002 created"),
    act(-14, 9, "lead", lead.L1005.id, "created", "Lead L1005 “Bathroom & ensuite refresh” created"),
    act(-10, 18, "job", j1.id, "variation_status", `Variation V1 approved (contract +${v1.total.toFixed(2)})`),
    act(-6, 15, "estimate", q1003.est.id, "quote_sent", "Quote Q1003 marked as sent"),
    act(-6, 15, "lead", lead.L1005.id, "stage", "Lead L1005 moved to Quote sent (Q1003)"),
    act(-6, 10, "job", j1.id, "invoice_created", "Progress claim invoice INV1003 created"),
    act(-5, 11, "estimate", q1006.est.id, "created", "Estimate Q1006 created"),
    act(-4, 9, "job", j1.id, "invoice_created", "Variation invoice INV1004 created"),
    act(-4, 12, "job", j1.id, "order_created", "Purchase order PO1001 created"),
    act(-3, 16, "estimate", q1004.est.id, "created", "Estimate Q1004 created"),
    act(-3, 12, "job", j1.id, "variation_created", "Variation V2 sent for approval"),
    act(-2, 11, "job", j1.id, "payment", "Part payment of $15,000.00 received for INV1003"),
    act(-1, 20, "lead", lead.L1001.id, "created", "Lead L1001 “Pool fence & landscaping” created"),
  ]);

  console.log("Demo business applied: Ridgeline Building Co (Demo)");
  for (const e of [q1001, q1002, q1003, q1004, q1005, q1006, tpl]) console.log(`  ${e.est.number.padEnd(6)} ${e.est.name.padEnd(42)} ${e.est.status.padEnd(12)} $${e.r.quoteTotal.toFixed(2)}`);
  console.log(`  J1000 contract (inc V1): $${r2(q1001.est.quoteTotal + v1.total).toFixed(2)}   J1001 contract: $${q1002.est.quoteTotal.toFixed(2)}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

