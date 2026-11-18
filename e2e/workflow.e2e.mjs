// Whole-business workflow through the real UI, across every module seam:
// Client → Lead → Estimate (details, takeoff, costings, specs, quote) → client accepts online →
// Job (budget, schedule) → PO → bill → variation → invoices → dashboard.
// No route stubs, no console filters. Records are prefixed WF-<timestamp>.
// Run: BASE_URL=http://localhost:3200 node e2e/workflow.e2e.mjs
import { createClient } from "@libsql/client";
import { start, check, done } from "./helpers.mjs";

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
const one = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];

const TAG = `WF-${Date.now()}`;
const clientName = `${TAG} Casey Client`;
const leadTitle = `${TAG} Rear extension`;
const catName = `${TAG} Slab`;
const itemName = `${TAG} Concrete slab`;
const signer = "Casey Client";

const { page, base } = await start();
const money = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));
const aud = (n) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const near = (a, b, tol = 0.011) => Math.abs(a - b) < tol;
const seen = (loc, timeout = 10000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true);
const settle = () => page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
const go = async (path) => { await page.goto(base + path); await settle(); };
const dialog = () => page.getByRole("dialog");
// Client-only buttons do nothing until React hydrates: retry until the target shows.
async function clickUntil(btn, target, tries = 20) {
  for (let i = 0; i < tries; i++) {
    await btn.click();
    try { await target.waitFor({ timeout: 500 }); return; } catch {}
  }
  throw new Error("clickUntil: target never appeared");
}
/** Poll a numeric reader until it satisfies pred (server revalidation can lag a beat). */
async function pollNum(read, pred, ms = 8000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await read().catch(() => NaN);
    if (pred(v)) return v;
    await page.waitForTimeout(250);
  }
  return v;
}
const estHeaderTotal = async () => money(await page.locator("text=Quote total").first().locator("xpath=following-sibling::div[1]").innerText());
const jobHeaderContract = async () =>
  money(await page.locator("div.text-right").filter({ has: page.getByText("Contract value", { exact: true }) }).first().locator("div").nth(1).innerText());
const financeCard = async (label) =>
  money(await page.getByTestId("finance-cards").locator(":scope > div").filter({ has: page.getByText(label, { exact: true }) }).first().locator("div").nth(1).innerText());
const statValue = async (label) =>
  money(await page.locator("div.rounded-lg").filter({ has: page.getByText(label, { exact: true }) }).first().locator("div").nth(1).innerText());
const kpiValue = async (id) => (await page.getByTestId(id).locator("div").nth(1).innerText()).trim();

let clientId, leadId, estId, jobId, quoteTotal, token, poId;

// Baselines for cross-module totals (other data may exist in the DB)
await go("/invoices");
const invOutstanding0 = await statValue("Outstanding").catch(() => NaN);
await go("/dashboard");
const dashOutstanding0 = money(await kpiValue("kpi-invoices").catch(() => "NaN"));

try {
  // ───────────── 1. Client
  console.log("1. Client");
  await go("/clients/new");
  await page.getByLabel("Full name *").fill(clientName);
  await page.getByLabel("Email").fill("casey.wf@example.com");
  await page.getByLabel("Mobile").fill("0412 345 678");
  await page.getByLabel("Street address").fill("12 Workflow St");
  await page.getByLabel("City / town").fill("Ballarat");
  await page.getByLabel("State").selectOption("VIC");
  await page.getByLabel("Postcode").fill("3350");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}\?created=1/);
  clientId = new URL(page.url()).pathname.split("/").pop();
  await check(seen(page.getByRole("heading", { name: clientName })), "client created");

  // ───────────── 2. Lead → estimate
  console.log("2. Lead → estimate");
  await go("/leads/new");
  await page.locator('form [name="title"]').fill(leadTitle);
  await page.locator('form [name="clientId"]').selectOption(clientId);
  await page.locator('form [name="estimatedValue"]').fill("60000");
  await check((async () => (await page.locator('form [name="address"]').inputValue()) === "12 Workflow St")(), "picking client pre-fills lead site");
  await page.getByRole("button", { name: "Create lead" }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  leadId = page.url().split("/").pop();
  await settle();
  await check(seen(page.getByTestId("linked-client").filter({ hasText: clientName })), "lead linked to client");
  await page.getByRole("button", { name: "Convert to estimate" }).first().click();
  await page.waitForURL(/\/estimates\/[0-9a-f-]{36}/);
  estId = page.url().split("/estimates/")[1].split(/[/?#]/)[0];
  await settle();

  // ───────────── 3. Estimate details
  console.log("3a. Estimate details");
  await go(`/estimates/${estId}`);
  await check(seen(page.getByRole("heading", { name: leadTitle })), "estimate named after lead");
  await check((async () => (await page.locator("select[name=clientLink]").inputValue()) === clientId)(), "estimate linked to client record");
  await check((async () => (await page.locator("input[name=clientName]").inputValue()) === clientName)(), "client name copied");
  await check((async () => (await page.locator("input[name=clientEmail]").inputValue()) === "casey.wf@example.com")(), "client email copied");
  await check((async () => (await page.locator("input[name=siteAddress]").inputValue()) === "12 Workflow St")(), "site address copied");
  await check((async () => (await page.locator("input[name=siteCityTown]").inputValue()) === "Ballarat")(), "site town copied");
  await check((async () => (await page.locator("select[name=leadId]").inputValue()) === leadId)(), "estimate linked back to lead");

  // ───────────── 3b. Takeoffs
  console.log("3b. Takeoffs");
  await go(`/estimates/${estId}/takeoffs`);
  const pngDataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1000; c.height = 700;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 700);
    g.strokeStyle = "#111"; g.lineWidth = 3;
    g.strokeRect(100, 100, 600, 400);
    g.beginPath(); g.moveTo(100, 600); g.lineTo(600, 600); g.stroke();
    return c.toDataURL("image/png");
  });
  await page.getByTestId("plan-upload").setInputFiles({ name: "WF plan.png", mimeType: "image/png", buffer: Buffer.from(pngDataUrl.split(",")[1], "base64") });
  await page.getByTestId("plan-item").first().waitFor();
  await check((await page.getByTestId("plan-item").count()) === 1, "plan uploaded");
  const svg = page.getByTestId("plan-canvas");
  const at = async (x, y) => {
    const box = await svg.boundingBox();
    const v = JSON.parse(await svg.getAttribute("data-view"));
    return { x: box.x + v.x + x * v.zoom, y: box.y + v.y + y * v.zoom };
  };
  const clickAt = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(60); };
  const tool = (name) => page.getByRole("toolbar", { name: "Takeoff tools" }).getByRole("button", { name, exact: true }).click();
  await svg.waitFor();
  await tool("Set scale");
  await clickAt(100, 600);
  await clickAt(600, 600);
  const sdlg = page.getByRole("dialog", { name: "Set plan scale" });
  await sdlg.locator('input[name="realLength"]').fill("5");
  await sdlg.getByRole("button", { name: "Apply scale" }).click();
  await sdlg.waitFor({ state: "detached" });
  await check(seen(page.getByTestId("scale-status").filter({ hasText: "1 px = 10 mm" })), "scale set");
  await tool("Rectangle");
  await clickAt(100, 100);
  await clickAt(300, 400); // 200×300 px = 2 m × 3 m
  await page.getByTestId("measurement-M1").waitFor();
  await page.waitForTimeout(300);
  await check((await page.getByTestId("measurement-M1").getByTestId("measurement-value").textContent())?.trim() === "6.00 m²", "rectangle M1 = 6.00 m²");

  // ───────────── 3c. Costings
  console.log("3c. Costings");
  await go(`/estimates/${estId}/costings`);
  const saved = () => page.getByTestId("save-state").filter({ hasText: "All changes saved" }).waitFor();
  const csettle = async () => { await page.waitForTimeout(200); await saved(); await page.waitForTimeout(200); };
  const empty = page.getByRole("button", { name: "Add your first category" });
  if (await empty.count()) await empty.click();
  else await page.getByRole("button", { name: "+ Category" }).click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type(catName);
  await page.keyboard.press("Enter");
  await csettle();
  const catRow = await one("select id from estimate_items where estimate_id = ? and kind = 'category' and description = ?", [estId, catName]);
  await check(!!catRow, "category added");
  await page.getByTestId(`row-${catRow.id}`).getByRole("button", { name: "+ Add item" }).click();
  await page.keyboard.type(itemName);
  await page.keyboard.press("Tab");
  await csettle();
  const itemRow = await one("select id from estimate_items where estimate_id = ? and description = ?", [estId, itemName]);
  const ir = page.getByTestId(`row-${itemRow.id}`);
  await ir.getByLabel("Quantity").fill("[M1]*[W10]");
  await ir.getByLabel("Unit cost").fill("120");
  await page.keyboard.press("Tab");
  await csettle();
  const it = await one("select quantity, total from estimate_items where id = ?", [itemRow.id]);
  await check(near(Number(it.quantity), 6.6) && near(Number(it.total), 792), `formula item qty 6.6 × $120 = $792 (got ${it.quantity} / ${it.total})`);
  await page.getByRole("button", { name: "Add from catalogue" }).first().click();
  const cm = page.getByRole("dialog", { name: "Add from catalogue" });
  await cm.getByLabel("Search catalogue").fill("Carpenter");
  await cm.getByLabel("Select Carpenter").check();
  await cm.getByLabel("Quantity for Carpenter").fill("8");
  await cm.getByLabel("Add to category").selectOption({ label: `1. ${catName}` });
  await cm.getByRole("button", { name: /^Add 1 item/ }).click();
  await csettle();
  const carp = await one("select total, parent_id from estimate_items where estimate_id = ? and description = 'Carpenter'", [estId]);
  await check(carp && carp.parent_id === catRow.id && near(Number(carp.total), 600), "catalogue item added (8 h × $75)");
  const sumQuote = money(await page.getByTestId("sum-quote").textContent());
  await check(money(await page.getByTestId("bar-quote").textContent()) === sumQuote, "costings bar total = summary total");
  await page.reload();
  await settle();
  quoteTotal = money(await page.getByTestId("sum-quote").textContent());
  await check(quoteTotal > 1392 && quoteTotal === sumQuote, `summary quote total stable after reload (${aud(quoteTotal)})`);
  const hdr = await estHeaderTotal();
  await check(hdr === quoteTotal, `estimate header quote total ${aud(hdr)} = costings summary ${aud(quoteTotal)}`);

  // ───────────── 4. Specifications + quote + online acceptance
  console.log("4. Specifications & quote");
  await go(`/estimates/${estId}/specifications`);
  await page.getByRole("button", { name: /Add section/ }).first().click();
  await page.getByLabel("Section heading").fill(`${TAG} Concrete works`);
  await page.getByLabel("Section body").fill("25 MPa slab on ground, 100 mm thick.");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("spec-save").click();
  await page.getByTestId("spec-saved").waitFor();
  await check(Number((await one("select count(*) n from specifications where estimate_id = ?", [estId])).n) === 1, "spec section saved");

  await go(`/estimates/${estId}/quote`);
  const doc = page.getByTestId("quote-document");
  await check(money(await doc.getByTestId("quote-total").textContent()) === quoteTotal, "quote preview total = estimate total");
  await check(seen(doc.getByTestId("quote-specifications").getByText(`${TAG} Concrete works`)), "spec section in quote preview");
  await page.getByRole("checkbox", { name: "Items", exact: true }).check();
  await page.getByRole("checkbox", { name: "Item prices" }).check();
  await check(seen(doc.getByTestId("quote-item").filter({ hasText: itemName })), "items shown in preview after toggling");
  await page.getByTestId("quote-save").click();
  await page.getByTestId("quote-saved").waitFor();
  const qo = await one("select print_items, print_item_totals from quote_options where estimate_id = ?", [estId]);
  await check(qo.print_items === 1 && qo.print_item_totals === 1, "print options persisted");
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByText(/^Sent \d/).waitFor();
  await page.getByRole("button", { name: "Create client link" }).click();
  await page.getByTestId("share-url").waitFor();
  token = (await page.getByTestId("share-url").inputValue()).split("/q/")[1];
  await check(!!token, "client share link created");

  await go(`/q/${token}`);
  await check(seen(page.getByTestId("quote-document")), "public quote renders");
  await check(money(await page.getByTestId("quote-total").first().textContent()) === quoteTotal, "public quote total = estimate total");
  await page.getByLabel("Full name").fill(signer);
  await page.getByLabel("I accept the quote and terms").check();
  await page.getByRole("button", { name: "Accept quote" }).click();
  await page.getByTestId("accept-confirmation").waitFor();
  await check(true, "client accepted online");

  const acceptedName = (await one("select name from lookups where kind = 'estimate_status' and flag = 1"))?.name ?? "Accepted";
  await go(`/estimates/${estId}`);
  await check(seen(page.locator("h1 + *").filter({ hasText: acceptedName })), `estimate header badge shows ${acceptedName}`);
  await check((async () => (await page.getByLabel("Estimate status").inputValue()) === acceptedName)(), "estimate status selector shows accepted");
  await go(`/estimates/${estId}/quote`);
  await check(seen(page.getByText(new RegExp(`Accepted by ${signer}`))), "quote tab shows acceptance");
  await go(`/leads/${leadId}`);
  await check(seen(page.getByTestId("lead-estimates").locator("li").filter({ hasText: acceptedName })), "lead lists the estimate as accepted");
  await check((async () => (await page.getByTestId("lead-stage").innerText()).trim() === "Won")(), "lead stage moves to Won after client accepts the quote");
  await go(`/estimates?q=${encodeURIComponent(TAG)}`);
  await check(seen(page.getByTestId("estimate-row").filter({ hasText: acceptedName })), "estimates list shows accepted status");

  // ───────────── 5. Job from estimate
  console.log("5. Job");
  await go(`/estimates/${estId}`);
  await page.getByRole("link", { name: "Create job" }).click();
  await page.waitForURL(/\/jobs\/new/);
  await settle();
  const sel = page.locator('select[name="estimateId"]');
  if ((await sel.inputValue()) !== estId) await sel.selectOption(estId);
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  jobId = page.url().split("/").pop();
  await settle();
  await check(seen(page.getByRole("heading", { name: leadTitle })), "job created with estimate name");
  await check((await jobHeaderContract()) === quoteTotal, `job header contract value = quote total ${aud(quoteTotal)}`);
  await check((await financeCard("Contract value")) === quoteTotal, "overview contract value card = quote total");
  const budgetTxt = await page.locator("table").first().innerText();
  await check(budgetTxt.includes(catName), "budget vs actual lists estimate category");
  const nLines = Number((await one("select count(*) n from job_budget_lines where job_id = ?", [jobId])).n);
  await check(nLines === 2, `budget lines copied from costings (${nLines})`);
  await go(`/estimates/${estId}`);
  await check(seen(page.getByRole("link", { name: "View job" })), "estimate header now links to job");

  await go(`/jobs/${jobId}/schedule`);
  await clickUntil(page.getByRole("button", { name: "Add task" }), dialog());
  await dialog().locator('input[name="name"]').fill(`${TAG} Pour slab`);
  await dialog().locator('input[name="durationDays"]').fill("2");
  await dialog().locator('input[name="startDate"]').fill("2026-12-01");
  await dialog().getByRole("button", { name: "Add task" }).click();
  await dialog().waitFor({ state: "detached" });
  await check(seen(page.locator(`tr[data-task="${TAG} Pour slab"]`)), "schedule task added");

  // ───────────── 6. Purchase order → bill → actual cost
  console.log("6. Purchase order");
  const timber = await one("select id from contacts where business_name = 'Timber Yard Co' limit 1");
  await go(`/jobs/${jobId}/orders`);
  await page.getByRole("link", { name: "Create orders from budget" }).first().click();
  await page.waitForURL(/from-budget/);
  await settle();
  await page.getByLabel(`Order ${itemName}`).check();
  await page.getByLabel(`Supplier for ${itemName}`).selectOption(timber.id);
  await page.getByRole("button", { name: /Create 1 draft order/ }).click();
  await page.waitForURL(/orders\?created=1/);
  const po = await one("select id, number, total from purchase_orders where job_id = ?", [jobId]);
  poId = po.id;
  await check(near(Number(po.total), 792 * 1.1), `PO total = budget line + GST (${po.total})`);
  await go(`/orders/${poId}`);
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("button", { name: "Mark confirmed" }).waitFor();
  await clickUntil(page.getByRole("button", { name: "Record bill" }), dialog());
  await page.locator('input[name="reference"]').fill(`${TAG}-BILL`);
  await dialog().getByRole("button", { name: "Record bill" }).click();
  await page.getByText("Billed — this order is locked").waitFor();
  await check(true, "PO billed");
  await go(`/jobs/${jobId}/costs`);
  await check(seen(page.getByTestId("cost-table").getByText(`${TAG}-BILL`)), "bill appears in cost tracking actuals");
  await check(money(await page.getByTestId("cost-total").innerText()) === 792, "actual cost total = bill ex tax ($792)");
  await check(page.getByTestId("budget-table").locator("tr", { hasText: itemName }).innerText().then((t) => t.includes("$792.00")), "bill allocated to its budget line");
  await go(`/jobs/${jobId}`);
  await check((await financeCard("Actual cost to date")) === 792, "overview actual cost includes bill");

  // ───────────── 7. Variation
  console.log("7. Variation");
  await go(`/jobs/${jobId}/variations`);
  await clickUntil(page.getByRole("button", { name: "+ New variation" }).first(), dialog());
  await dialog().locator('input[name="title"]').fill(`${TAG} Extra footing`);
  await dialog().getByRole("button", { name: "Create variation" }).click();
  await page.waitForURL(/variations\/[0-9a-f-]{36}$/);
  await page.getByLabel("Line 1 description").fill("Additional pad footing");
  await page.getByLabel("Line 1 quantity").fill("2");
  await page.getByLabel("Line 1 unit cost").fill("450");
  await page.getByLabel("Markup percent").fill("20");
  await page.getByRole("button", { name: "Save variation" }).click();
  await page.getByText("Variation saved").waitFor();
  const varTotal = 1188; // 900 + 20% + GST
  await check(money(await page.getByTestId("var-total").innerText()) === varTotal, "variation total $1,188");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByText(/has been added to the contract value/).waitFor();
  const revised = Math.round((quoteTotal + varTotal) * 100) / 100;
  await go(`/jobs/${jobId}`);
  const hdrContract = await jobHeaderContract();
  await check(hdrContract === revised, `job header contract = quote + variation (${aud(hdrContract)} vs ${aud(revised)})`);
  const cardContract = await financeCard("Contract value");
  await check(cardContract === hdrContract, `overview contract card ${aud(cardContract)} = header ${aud(hdrContract)} (no double count)`);
  await go(`/jobs/${jobId}/invoices`);
  await check(money(await page.getByTestId("cs-contract-value").innerText()) === revised, "invoices contract summary = revised contract");

  // ───────────── 8. Invoices
  console.log("8. Invoices");
  await page.getByRole("link", { name: "+ New invoice" }).first().click();
  await page.waitForURL(/invoices\/new/);
  await settle();
  await page.locator('input[name="percent"]').fill("10");
  // Deposit and progress claims are % of the original contract; approved variations are claimed via variation invoices.
  const depExpected = Math.round(quoteTotal * 0.1 * 100) / 100;
  await check(near(money(await page.getByTestId("new-inv-preview").innerText()), depExpected, 0.02), `deposit preview 10% of original contract (${aud(depExpected)})`);
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
  const depId = page.url().split("/").pop();
  const dep = await one("select total from invoices where id = ?", [depId]);
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("button", { name: "Back to draft" }).waitFor();
  await page.locator('form[aria-label="Record payment"] input[name="amount"]').fill(String(dep.total));
  await page.locator('form[aria-label="Record payment"] input[name="reference"]').fill(`${TAG}-DEP`);
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByText(`${TAG}-DEP`).waitFor();
  await check((await one("select status from invoices where id = ?", [depId])).status === "Paid", "deposit fully paid → Paid");
  await check(seen(page.getByText("Paid", { exact: true })), "Paid status shown on invoice");

  await go(`/jobs/${jobId}/invoices/new?kind=Progress%20claim`);
  await page.locator('input[name="cumulativePercent"]').fill("40");
  const pcExpected = Math.round((quoteTotal * 0.4 - Number(dep.total)) * 100) / 100;
  await check(near(money(await page.getByTestId("new-inv-preview").innerText()), pcExpected, 0.02), `progress claim = 40% less deposit (${aud(pcExpected)})`);
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/);
  const pcId = page.url().split("/").pop();
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("button", { name: "Back to draft" }).waitFor();
  const pc = await one("select total, status from invoices where id = ?", [pcId]);
  await check(pc.status === "Sent", "progress claim sent");
  const pcTotal = Number(pc.total);

  await go(`/jobs/${jobId}`);
  await check((await financeCard("Paid")) === Number(dep.total), "overview Paid = deposit");
  await check(near(await financeCard("Outstanding"), pcTotal), "overview Outstanding = progress claim");
  await go("/invoices");
  const invOutstanding = await statValue("Outstanding");
  await check(near(invOutstanding - invOutstanding0, pcTotal, 0.02), `/invoices outstanding rose by the progress claim (${aud(invOutstanding0)} → ${aud(invOutstanding)}, claim ${aud(pcTotal)})`);

  // ───────────── 9. Dashboard
  console.log("9. Dashboard");
  await go("/dashboard");
  await check(Number(await kpiValue("kpi-jobs")) >= 1, "active jobs ≥ 1");
  await check(seen(page.getByRole("table", { name: "Recent estimates" }).getByRole("link", { name: new RegExp(TAG) })), "new estimate in recent estimates");
  const dashOutstanding = money(await kpiValue("kpi-invoices"));
  await check(Math.abs(dashOutstanding - dashOutstanding0 - pcTotal) <= 1, `dashboard invoices outstanding rose by the claim (${dashOutstanding0} → ${dashOutstanding})`);
  await check(Math.abs(dashOutstanding - invOutstanding) <= 1, `dashboard outstanding (${dashOutstanding}) agrees with /invoices (${invOutstanding})`);
} catch (e) {
  console.log("   ", String(e.stack ?? e).split("\n").slice(0, 4).join("\n    "), "@", page.url());
  if (process.env.DEBUG_SHOT) await page.screenshot({ path: process.env.DEBUG_SHOT, fullPage: true });
  await check(Promise.resolve(false), `unexpected error: ${String(e).split("\n")[0]}`);
}
console.log(`   records: client ${clientId} lead ${leadId} estimate ${estId} job ${jobId}`);
await done();
