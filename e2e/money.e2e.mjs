// Module 10 e2e: purchase orders, variations, invoices.
// Run: BASE_URL=http://localhost:3110 node e2e/money.e2e.mjs
import { start, check, done, db, one, RUN, purgeJob, purgeClient } from "./helpers.mjs";

const sql = db();

// ---- fixture: own client + a job with a contract and budget lines (jobs are owned by module 9)
const jobId = crypto.randomUUID();
const tag = RUN.toUpperCase();
const client = { id: crypto.randomUUID() };
await sql.execute({
  sql: "insert into clients (id, name, client_type, email, is_sample, archived, created_at, updated_at) values (?, ?, 'Person', 'money.e2e@example.com', 0, 0, datetime('now'), datetime('now'))",
  args: [client.id, `E2E money client ${tag}`],
});
await sql.execute({
  sql: `insert into jobs (id, number, name, client_id, status, site_address, site_city_town, site_state, site_postcode, contract_value, archived, created_at, updated_at)
        values (?, ?, ?, ?, 'In progress', '7 Test Ave', 'Brisbane', 'QLD', '4000', 110000, 0, datetime('now'), datetime('now'))`,
  args: [jobId, `E2E-${tag}`, `E2E money job ${tag}`, client?.id ?? null],
});
const bl = [
  ["Framing", "90x45 framing", "Material", "lm", 120, 6.4],
  ["Framing", "Framing nails", "Material", "box", 2, 89],
  ["Electrical", "Electrician rough-in", "Subcontractor", "hr", 10, 95],
];
const blIds = [];
for (const [i, [category, description, costType, uom, qty, rate]] of bl.entries()) {
  const id = crypto.randomUUID();
  blIds.push(id);
  await sql.execute({
    sql: `insert into job_budget_lines (id, job_id, category, description, cost_type, uom, quantity, unit_cost, budget, sort_order) values (?,?,?,?,?,?,?,?,?,?)`,
    args: [id, jobId, category, description, costType, uom, qty, rate, qty * rate, i],
  });
}
const timber = await one("select id from contacts where business_name = 'Timber Yard Co' limit 1");
const spark = await one("select id from contacts where business_name = 'Spark Electrical' limit 1");

const { page, base } = await start();
const J = `${base}/jobs/${jobId}`;
const text = (sel) => page.locator(sel).first().innerText();
// Client-only buttons (modals, inline confirms) do nothing until React hydrates: retry until the target shows.
async function clickUntil(btn, target, tries = 20) {
  for (let i = 0; i < tries; i++) {
    await btn.click();
    try { await target.waitFor({ timeout: 500 }); return; } catch {}
  }
  throw new Error("clickUntil: target never appeared");
}

try {
  // ================= Purchase orders
  console.log("Purchase orders");
  await page.goto(`${J}/orders`);
  await check(page.getByText("No orders for this job").isVisible(), "job orders empty state");
  await page.getByRole("link", { name: "Create orders from budget" }).first().click();
  await page.waitForURL(/from-budget/);
  await check(page.getByText("Electrician rough-in").isVisible(), "budget lines listed");
  await page.getByLabel("Order 90x45 framing").check();
  await page.getByLabel("Order Framing nails").check();
  await page.getByLabel("Bulk supplier").selectOption(timber.id);
  await page.getByRole("button", { name: "Apply to ticked" }).click();
  await page.getByLabel("Order Electrician rough-in").check();
  await page.getByLabel("Supplier for Electrician rough-in").selectOption(spark.id);
  await page.getByRole("button", { name: /Create 2 draft orders/ }).click();
  await page.waitForURL(/orders\?created=2/);
  await check(page.getByText("Created 2 draft orders").isVisible(), "two POs created (one per supplier)");
  const pos = (await sql.execute({ sql: "select id, number, supplier_id, total, delivery_address from purchase_orders where job_id = ? order by number", args: [jobId] })).rows;
  await check(pos.length === 2, "2 PO rows in DB");
  const timberPo = pos.find((p) => p.supplier_id === timber.id);
  // (120*6.4 + 2*89) = 946 + 10% = 1040.60
  await check(Math.abs(Number(timberPo.total) - 1040.6) < 0.001, "timber PO total 1040.60 inc tax");
  await check(String(timberPo.delivery_address).includes("7 Test Ave"), "delivery address defaults to job site");

  await page.goto(`${base}/orders?job=${jobId}`);
  await check((await page.locator("tbody tr").count()) === 2, "/orders filter by job shows 2");
  await page.goto(`${base}/orders?status=Billed&job=${jobId}`);
  await check(page.getByText("No orders match these filters").isVisible(), "/orders status filter empty");

  // Edit PO
  await page.goto(`${base}/orders/${timberPo.id}`);
  await page.getByRole("button", { name: "+ Add line" }).click();
  await page.getByLabel("Line 3 description").fill("Joist hangers");
  await page.getByLabel("Line 3 code").fill("JH-90");
  await page.getByLabel("Line 3 quantity").fill("10");
  await page.getByLabel("Line 3 unit cost").fill("4.5");
  await check((await text('[data-testid="po-total"]')).includes("1,090.10"), "live PO total updates (1,090.10)");
  await page.locator('input[name="deliveryDate"]').fill("2099-01-15");
  await page.locator('textarea[name="deliveryInstructions"]').fill("Unload at rear gate");
  await page.getByRole("button", { name: "Save order" }).click();
  await check(page.getByText("Saved · 3 lines").waitFor().then(() => true), "PO saved");
  await page.reload();
  await check((await page.getByLabel("Line 3 description").inputValue()) === "Joist hangers", "PO line persisted");
  await check((await page.locator('textarea[name="deliveryInstructions"]').inputValue()) === "Unload at rear gate", "PO instructions persisted");
  const dbPo = await one("select total, delivery_date from purchase_orders where id = ?", [timberPo.id]);
  await check(Number(dbPo.total) === 1090.1 && dbPo.delivery_date === "2099-01-15", "PO totals + delivery date in DB");

  // Status + bill
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await check(page.getByRole("button", { name: "Mark confirmed" }).waitFor().then(() => true), "PO sent → confirm available");
  await clickUntil(page.getByRole("button", { name: "Record bill" }), page.getByRole("dialog"));
  await page.locator('input[name="reference"]').fill("TY-5521");
  await page.getByRole("dialog").getByRole("button", { name: "Record bill" }).click();
  await page.getByText("Billed — this order is locked").waitFor();
  const ac = await one("select amount, tax, reference, cost_type from actual_costs where purchase_order_id = ?", [timberPo.id]);
  await check(ac && Number(ac.amount) === 991 && ac.reference === "TY-5521", "bill creates actual cost (991 ex tax)");
  await check((await one("select status from purchase_orders where id = ?", [timberPo.id])).status === "Billed", "PO status Billed");

  // Print
  await page.goto(`${base}/orders/${timberPo.id}/print`);
  await check(page.getByText("Purchase order", { exact: true }).isVisible(), "PO print heading");
  await check(page.getByText("Joist hangers").isVisible(), "PO print lines");

  // Blank PO create + delete
  await page.goto(`${base}/orders`);
  await clickUntil(page.getByRole("button", { name: "+ New order" }).first(), page.getByRole("dialog"));
  await page.getByRole("dialog").locator('select[name="jobId"]').selectOption(jobId);
  await page.getByRole("dialog").getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  const blankId = page.url().split("/").pop();
  await clickUntil(page.getByRole("button", { name: "Delete order" }), page.getByRole("button", { name: "Confirm delete" }));
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/jobs\/.*\/orders$/);
  await check(!(await one("select id from purchase_orders where id = ?", [blankId])), "blank PO deleted");

  // ================= Variations
  console.log("Variations");
  await page.goto(`${J}/variations`);
  await check(page.getByText("No variations yet").isVisible(), "variations empty state");
  await clickUntil(page.getByRole("button", { name: "+ New variation" }).first(), page.getByRole("dialog"));
  await page.getByRole("dialog").locator('input[name="title"]').fill("Extra power points");
  await page.getByRole("dialog").getByRole("button", { name: "Create variation" }).click();
  await page.waitForURL(/variations\/[0-9a-f-]{36}$/);
  const vid = page.url().split("/").pop();
  await page.getByLabel("Line 1 description").fill("Double GPO supply & install");
  await page.getByLabel("Line 1 cost type").selectOption("Subcontractor");
  await page.getByLabel("Line 1 quantity").fill("2");
  await page.getByLabel("Line 1 unit cost").fill("450");
  await page.getByLabel("Markup percent").fill("20");
  await check((await text('[data-testid="var-total"]')).includes("1,188.00"), "live variation total (900 +20% +GST = 1,188)");
  await page.getByRole("button", { name: "+ Add line" }).click();
  await page.getByLabel("Line 2 description").fill("Electrician labour");
  await page.getByLabel("Line 2 quantity").fill("8");
  await page.getByLabel("Line 2 unit cost").fill("75");
  await check((await text('[data-testid="var-total"]')).includes("1,980.00"), "variation total 1,980");
  await page.getByRole("button", { name: "Save variation" }).click();
  await page.getByText("Variation saved").waitFor();
  const v1 = await one("select total, cost_total, tax_total, lines from variations where id = ?", [vid]);
  await check(Number(v1.total) === 1980 && Number(v1.cost_total) === 1500 && Number(v1.tax_total) === 180, "variation totals persisted");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByText(/has been added to the contract value/).waitFor();
  await check(Number((await one("select contract_value from jobs where id = ?", [jobId])).contract_value) === 111980, "approve adds to contract (111,980)");
  await check(page.getByText("$111,980.00").first().isVisible(), "job header shows new contract value");
  await page.getByRole("button", { name: "Withdraw approval" }).click();
  await page.getByRole("button", { name: "Approve" }).waitFor();
  await check(Number((await one("select contract_value from jobs where id = ?", [jobId])).contract_value) === 110000, "un-approve subtracts (110,000)");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByText(/has been added to the contract value/).waitFor();
  await check(Number((await one("select contract_value from jobs where id = ?", [jobId])).contract_value) === 111980, "re-approve consistent (111,980)");
  await page.goto(`${J}/variations/${vid}/print`);
  await check(page.getByText("Double GPO supply & install").isVisible(), "variation print shows lines");
  // A second variation to delete
  await page.goto(`${J}/variations`);
  await clickUntil(page.getByRole("button", { name: "+ New variation" }).first(), page.getByRole("dialog"));
  await page.getByRole("dialog").locator('input[name="title"]').fill("Throwaway variation");
  await page.getByRole("dialog").getByRole("button", { name: "Create variation" }).click();
  await page.waitForURL(/variations\/[0-9a-f-]{36}$/);
  await clickUntil(page.getByRole("button", { name: "Delete variation" }), page.getByRole("button", { name: "Confirm delete" }));
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/variations$/);
  await check((await page.locator("tbody tr").count()) === 1, "variation deleted, one remains");

  // ================= Invoices
  console.log("Invoices");
  await page.goto(`${J}/invoices`);
  await check(page.getByText("No invoices for this job").isVisible(), "job invoices empty state");
  await check((await text('[data-testid="cs-contract-value"]')).includes("111,980.00"), "contract summary incl. variations");
  await page.getByRole("link", { name: "+ New invoice" }).first().click();
  await page.waitForURL(/invoices\/new/);
  await check((await page.getByRole("radio", { name: /Deposit/ }).getAttribute("aria-checked")) === "true", "deposit is default first invoice");
  await page.locator('input[name="percent"]').fill("10");
  await check((await text('[data-testid="new-inv-preview"]')).includes("11,000.00"), "deposit preview 10% of 110,000");
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
  const depId = page.url().split("/").pop();
  const dep = await one("select total, status, due_date, issue_date, kind from invoices where id = ?", [depId]);
  await check(Math.abs(Number(dep.total) - 11000) < 0.02 && dep.status === "Draft" && dep.kind === "Deposit", "deposit invoice created");
  await check(dep.due_date > dep.issue_date, "due date defaulted from settings");
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("button", { name: "Back to draft" }).waitFor();
  await page.locator('form[aria-label="Record payment"] input[name="amount"]').fill("5000");
  await page.locator('form[aria-label="Record payment"] input[name="reference"]').fill("DEP-1");
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByText("DEP-1").waitFor();
  const dep2 = await one("select status, amount_paid from invoices where id = ?", [depId]);
  await check(dep2.status === "Part paid" && Number(dep2.amount_paid) === 5000, "payment → Part paid");
  await check((await text('[data-testid="inv-balance"]')).includes("6,000"), "balance due ~6,000");

  // Edit invoice lines: add an untaxed line
  await page.getByRole("button", { name: "+ Add line" }).click();
  await page.getByLabel("Line 2 description").fill("Council fee (no GST)");
  await page.getByLabel("Line 2 amount").fill("200");
  await page.getByLabel("Line 2 taxable").uncheck();
  await page.locator('input[name="dueDate"]').fill("2020-01-01");
  await page.locator('input[name="issueDate"]').fill("2019-12-01");
  await page.getByRole("button", { name: "Save invoice" }).click();
  await page.getByText("Invoice saved").waitFor();
  const dep3 = await one("select total, tax_total from invoices where id = ?", [depId]);
  await check(Math.abs(Number(dep3.total) - 11200) < 0.02, "untaxed line adds 200 with no GST");
  await page.reload();
  await check(page.getByText(/Overdue \d+d/).first().isVisible(), "overdue badge when past due with balance");

  // Progress claim
  await page.goto(`${J}/invoices/new?kind=Progress%20claim`);
  await page.locator('input[name="cumulativePercent"]').fill("35");
  await check((await text('[data-testid="new-inv-preview"]')).includes("27,300"), "progress claim = 35% of 110,000 less 11,200 previously claimed = 27,300");
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
  const pcId = page.url().split("/").pop();
  const pc = await one("select total, claim_percent from invoices where id = ?", [pcId]);
  await check(Math.abs(Number(pc.total) - 27300) < 0.02 && Number(pc.claim_percent) === 35, "progress claim persisted");

  // Variation invoice
  await page.goto(`${J}/invoices/new?kind=Variation`);
  await check(page.getByText("Extra power points").isVisible(), "approved variation offered");
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
  const viId = page.url().split("/").pop();
  await check(Number((await one("select total from invoices where id = ?", [viId])).total) === 1980, "variation invoice 1,980");
  // Invoiced variation can't be un-approved
  await page.goto(`${J}/variations/${vid}`);
  await page.getByRole("button", { name: "Withdraw approval" }).click();
  await check(page.getByText(/has been invoiced/).waitFor().then(() => true), "invoiced variation locked from un-approve");

  // Summary + print
  await page.goto(`${J}/invoices`);
  await check((await page.locator("tbody tr").count()) === 3, "3 job invoices listed");
  await check((await text('[data-testid="cs-invoiced-to-date"]')).includes("40,480"), "invoiced to date 11,200 + 27,300 + 1,980");
  await page.goto(`${base}/invoices/${depId}/print`);
  await check(page.getByText("Tax invoice", { exact: true }).isVisible(), "tax invoice heading");
  await check((await text('[data-testid="print-amount-due"]')).includes("6,200"), "print amount due 6,200");

  // /invoices list: ageing + filters
  await page.goto(`${base}/invoices?show=overdue`);
  await check(page.getByRole("link", { name: (await one("select number from invoices where id = ?", [depId])).number }).isVisible(), "overdue filter shows deposit");
  await check(!(await text('[data-testid="ageing-4"]')).includes("$0.00"), "90+ bucket holds overdue deposit");
  await page.goto(`${base}/invoices?job=${jobId}&kind=Variation`);
  await check((await page.locator("tbody tr").count()) === 1, "invoice filters (job + type)");

  // Remove payment → back to Sent; void; delete
  await page.goto(`${base}/invoices/${depId}`);
  await clickUntil(page.getByRole("button", { name: "Remove", exact: true }), page.getByRole("button", { name: "Remove?" }));
  await page.getByRole("button", { name: "Remove?" }).click();
  await page.getByText("No payments yet.").waitFor();
  await check((await one("select status, amount_paid from invoices where id = ?", [depId])).status === "Sent", "removing payment → Sent");
  await page.goto(`${base}/invoices/${viId}`);
  await page.getByRole("button", { name: "Void invoice" }).click();
  await page.getByText("This invoice is void").waitFor();
  await check((await one("select status from invoices where id = ?", [viId])).status === "Void", "invoice voided");
  await page.goto(`${base}/invoices/${pcId}`);
  await clickUntil(page.getByRole("button", { name: "Delete invoice" }), page.getByRole("button", { name: "Confirm delete" }));
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/jobs\/.*\/invoices$/);
  await check(!(await one("select id from invoices where id = ?", [pcId])), "invoice deleted");

  // Responsive smoke
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/invoices`);
  await check(page.getByRole("heading", { name: "Invoices" }).isVisible(), "invoices renders on mobile");
} catch (e) {
  console.log(String(e.stack ?? e).split("\n").slice(0, 8).join("\n"));
  await check(Promise.resolve(false), `unexpected error: ${String(e).split("\n")[0]}`);
} finally {
  // cleanup fixture (purgeJob also removes the job's invoices, payments, variations, orders, costs)
  await purgeJob(jobId);
  await purgeClient(client.id);
}
await done();
