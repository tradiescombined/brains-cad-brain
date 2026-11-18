// Shared end-to-end helpers. Usage in e2e/<module>.e2e.mjs:
//   import { start, check, done } from "./helpers.mjs";
//   const { page, base } = await start();            // BASE_URL env, default http://localhost:3000
//   await page.goto(base + "/leads"); await check(page.getByRole("heading", { name: "Leads" }).isVisible(), "leads heading");
//   await done();
// Run one suite: BASE_URL=http://localhost:31xx node e2e/<module>.e2e.mjs
// Run them all (fresh temp DB, both orders): npm run e2e:all
//
// Suites share one database and must be order-independent: create your OWN uniquely named records
// (prefix with RUN), never mutate seed records (read them, or clone them with cloneEstimate), and
// clean up with the purge* helpers. No route stubs and no console-error filters.
import { chromium } from "playwright-core";
import { createClient } from "@libsql/client";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let browser, failures = 0, passes = 0;
const consoleErrors = [];

/** Unique per suite run; use it in every record name a suite creates. */
export const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** Track console errors + page errors of a page (start() does this for its page). */
export function watchConsole(page) {
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${m.text()} @ ${m.location()?.url ?? ""}`));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
}

export async function start() {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  watchConsole(page);
  page.on("dialog", (d) => d.dismiss());
  page.setDefaultTimeout(15000);
  return { page, browser, base: process.env.BASE_URL ?? "http://localhost:3000" };
}

export async function check(cond, label) {
  try {
    const ok = await cond;
    if (ok) { passes++; console.log("  ✓", label); }
    else { failures++; console.log("  ✗", label); }
  } catch (e) {
    failures++; console.log("  ✗", label, "-", String(e).split("\n")[0]);
  }
}

export async function done() {
  if (consoleErrors.length) { failures++; console.log("  ✗ browser console errors:\n   ", consoleErrors.slice(0, 10).join("\n    ")); }
  console.log(`\n${passes} passed, ${failures} failed`);
  await browser?.close();
  process.exit(failures ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------
// Database fixtures. DATABASE_URL must match the server's (npm run e2e:all sets both).
const _db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
// The server writes to the same SQLite file: wait for its locks instead of failing with SQLITE_BUSY.
await _db.execute("PRAGMA busy_timeout = 10000");
export const db = () => _db;
export const one = async (sql, args = []) => (await _db.execute({ sql, args })).rows[0];
export const all = async (sql, args = []) => (await _db.execute({ sql, args })).rows;
const run = (sql, args = []) => db().execute({ sql, args });

async function insertRow(table, row) {
  const cols = Object.keys(row);
  await run(`insert into ${table} (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`, cols.map((c) => row[c]));
}

/**
 * Deep-copy an estimate (row + costing items) into a new estimate the caller owns, so a suite can
 * mutate "the sample" without touching the seed record. Status/lead/job/sent/accepted are reset.
 */
export async function cloneEstimate(srcId, { name, number }) {
  const src = await one("select * from estimates where id = ?", [srcId]);
  if (!src) throw new Error(`cloneEstimate: estimate ${srcId} not found (run npm run db:reset)`);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await insertRow("estimates", {
    ...src, id, name, number: number ?? `E2E-${RUN}`, status: "Draft", lead_id: null, job_id: null,
    is_sample: 0, is_template: 0, archived: 0, accepted_at: null, sent_at: null, created_at: now, updated_at: now,
  });
  const items = await all("select * from estimate_items where estimate_id = ?", [srcId]);
  const map = new Map(items.map((i) => [i.id, crypto.randomUUID()]));
  for (const it of items) {
    await insertRow("estimate_items", { ...it, id: map.get(it.id), estimate_id: id, parent_id: it.parent_id ? map.get(it.parent_id) ?? null : null, measurement_id: null });
  }
  return id;
}

const ENTITY_TABLES = ["notes", "documents", "activity", "reminders"];
async function purgeEntity(id) {
  for (const t of ENTITY_TABLES) await run(`delete from ${t} where entity_id = ?`, [id]);
}

export async function purgeEstimate(id) {
  if (!id) return;
  for (const t of ["estimate_items", "estimate_versions", "specifications", "quote_options", "measurements", "takeoffs", "plans", "takeoff_counters", "selections"]) {
    await run(`delete from ${t} where estimate_id = ?`, [id]);
  }
  await run("update jobs set estimate_id = null where estimate_id = ?", [id]);
  await purgeEntity(id);
  await run("delete from estimates where id = ?", [id]);
}

export async function purgeJob(id) {
  if (!id) return;
  await run("delete from payments where invoice_id in (select id from invoices where job_id = ?)", [id]);
  for (const t of ["invoices", "variations", "purchase_orders", "actual_costs", "job_budget_lines", "job_tasks", "timesheets", "selections"]) {
    await run(`delete from ${t} where job_id = ?`, [id]);
  }
  await run("update estimates set job_id = null where job_id = ?", [id]);
  await purgeEntity(id);
  await run("delete from jobs where id = ?", [id]);
}

export async function purgeLead(id) {
  if (!id) return;
  await run("update estimates set lead_id = null where lead_id = ?", [id]);
  await purgeEntity(id);
  await run("delete from leads where id = ?", [id]);
}

export async function purgeClient(id) {
  if (!id) return;
  await run("delete from client_contacts where client_id = ?", [id]);
  await purgeEntity(id);
  await run("delete from clients where id = ?", [id]);
}

export async function purgeContact(id) {
  if (!id) return;
  await purgeEntity(id);
  await run("delete from contacts where id = ?", [id]);
}
