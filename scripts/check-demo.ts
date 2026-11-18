/**
 * Consistency check for the demo data (or any database): every cached number must equal what the
 * app's own code computes.
 *
 * Run (after npm run db:demo):  npx tsx --conditions=react-server scripts/check-demo.ts
 * (--conditions=react-server lets the "server-only" modules in src/lib load outside Next.)
 *
 * - estimate + item cached totals == recalcEstimate() output (src/lib/estimates)
 * - measurement values == computeMeasurement() (src/lib/geometry)
 * - job contract value == accepted quote total + approved variation totals
 * - PO / variation / invoice totals and invoice paid/status == src/lib/money-docs
 * - settings counters are ahead of every number already issued
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { recalcEstimate } from "@/lib/estimates";
import { computeMeasurement, type Pt, type Shape } from "@/lib/geometry";
import {
  invoiceTotals, parseInvoiceLines, parsePoLines, parseVariationLines, poTotals, round2, statusFromPayments, variationTotals,
} from "@/lib/money-docs";

const TAX = 0.1;
const problems: string[] = [];
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const expect = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

async function main() {
  // Estimates
  const ests = await db.select().from(schema.estimates);
  for (const e of ests) {
    const items = await db.select().from(schema.estimateItems).where(eq(schema.estimateItems.estimateId, e.id));
    const r = await recalcEstimate(e.id);
    if (!r) { problems.push(`${e.number}: recalc returned null`); continue; }
    expect(r.errors.length === 0, `${e.number}: formula errors ${JSON.stringify(r.errors)}`);
    for (const k of ["costTotal", "markupTotal", "taxTotal", "quoteTotal"] as const) expect(near(e[k], r[k]), `${e.number}: ${k} cached ${e[k]} != recalc ${r[k]}`);
    for (const it of items) {
      const ri = r.items[it.id];
      expect(!!ri, `${e.number}: item ${it.id} missing from calc`);
      if (!ri) continue;
      expect(near(it.total, ri.total) && near(it.totalIncMarkup, ri.totalIncMarkup) && near(it.quantity, it.kind === "category" ? 0 : ri.quantity), `${e.number}: item "${it.description}" cached ${it.quantity}/${it.total}/${it.totalIncMarkup} != ${ri.quantity}/${ri.total}/${ri.totalIncMarkup}`);
    }
    console.log(`  ${e.number.padEnd(6)} ${e.status.padEnd(12)} cost ${r.costTotal.toFixed(2).padStart(10)}  quote ${r.quoteTotal.toFixed(2).padStart(10)}  (${items.length} rows)  OK`);
  }

  // Measurements
  const plans = await db.select().from(schema.plans);
  for (const p of plans) {
    const ms = await db.select().from(schema.measurements).where(eq(schema.measurements.planId, p.id));
    for (const m of ms) {
      const c = computeMeasurement({ ...m, shape: m.shape as Shape, points: JSON.parse(m.points) as Pt[], scale: p.scaleX && p.scaleY ? { x: p.scaleX, y: p.scaleY } : null });
      expect(near(c.value, m.value) && c.unit === m.unit, `measurement ${m.code}: ${m.value}${m.unit} != ${c.value}${c.unit}`);
    }
    console.log(`  plan "${p.label}": ${ms.map((m) => `${m.code}=${m.value}${m.unit}`).join(", ")}`);
  }

  // Jobs, variations, POs, invoices
  const jobs = await db.select().from(schema.jobs);
  for (const j of jobs) {
    const vars = await db.select().from(schema.variations).where(eq(schema.variations.jobId, j.id));
    for (const v of vars) {
      const t = variationTotals(parseVariationLines(v.lines), v.markupPercent, TAX);
      expect(near(t.total, v.total) && near(t.tax, v.taxTotal) && near(t.cost, v.costTotal), `${j.number} ${v.number}: totals mismatch`);
    }
    const approved = round2(vars.filter((v) => v.status === "Approved").reduce((s, v) => s + v.total, 0));
    if (j.estimateId) {
      const [e] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, j.estimateId));
      expect(near(j.contractValue, round2(e.quoteTotal + approved)), `${j.number}: contract ${j.contractValue} != quote ${e.quoteTotal} + variations ${approved}`);
      const budget = await db.select().from(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.jobId, j.id));
      const sum = round2(budget.reduce((s, b) => s + b.budget, 0));
      expect(near(sum, e.costTotal), `${j.number}: budget ${sum} != estimate cost ${e.costTotal}`);
    }
    const invs = await db.select().from(schema.invoices).where(eq(schema.invoices.jobId, j.id));
    for (const i of invs) {
      const t = invoiceTotals(parseInvoiceLines(i.lines), TAX);
      const pays = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, i.id));
      const paid = round2(pays.reduce((s, p) => s + p.amount, 0));
      expect(near(t.total, i.total) && near(t.tax, i.taxTotal), `${i.number}: totals mismatch`);
      expect(near(paid, i.amountPaid), `${i.number}: amountPaid ${i.amountPaid} != payments ${paid}`);
      expect(statusFromPayments(i.status, i.total, paid) === i.status, `${i.number}: status ${i.status} inconsistent with payments`);
    }
    console.log(`  ${j.number} contract ${j.contractValue.toFixed(2)} (approved variations ${approved.toFixed(2)}), ${invs.length} invoices  OK`);
  }
  for (const po of await db.select().from(schema.purchaseOrders)) {
    const t = poTotals(parsePoLines(po.lines), TAX);
    expect(near(t.total, po.total) && near(t.subtotal, po.subtotal), `${po.number}: totals mismatch`);
    if (po.status === "Billed") {
      const ac = await db.select().from(schema.actualCosts).where(eq(schema.actualCosts.purchaseOrderId, po.id));
      expect(ac.length === 1, `${po.number}: billed but has ${ac.length} actual cost rows`);
    }
  }

  // Counters
  const [s] = await db.select().from(schema.businessSettings);
  const maxNum = (nums: string[], prefix: string) => Math.max(-1, ...nums.filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter(Number.isFinite));
  const est = ests.filter((e) => !e.isTemplate).map((e) => e.number);
  expect(s.nextEstimateNumber > maxNum(est, s.estimateNumberPrefix), "estimate counter behind");
  expect(s.nextJobNumber > maxNum(jobs.map((j) => j.number), s.jobNumberPrefix), "job counter behind");
  expect(s.nextInvoiceNumber > maxNum((await db.select().from(schema.invoices)).map((i) => i.number), s.invoiceNumberPrefix), "invoice counter behind");
  expect(s.nextOrderNumber > maxNum((await db.select().from(schema.purchaseOrders)).map((i) => i.number), s.orderNumberPrefix), "order counter behind");
  expect(s.nextVariationNumber > maxNum((await db.select().from(schema.variations)).map((i) => i.number), s.variationNumberPrefix), "variation counter behind");

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
  console.log("\nAll demo data consistent with the app's calculation code.");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
