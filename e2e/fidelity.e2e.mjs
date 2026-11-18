// Feature-fidelity additions (docs/FIDELITY.md): tax defaults per cost type, Mat + Lab cost type,
// email quote (mailto), phone country codes, GST-registered contacts, client leads tab, default
// estimate template, business documents, dashboard average win value, extra list defaults.
// Run: BASE_URL=http://localhost:3302 node e2e/fidelity.e2e.mjs   (cleans up after itself)
import { createClient } from "@libsql/client";
import { start, check, done } from "./helpers.mjs";

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
const one = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const run = (sql, args = []) => db.execute({ sql, args });
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const tag = Date.now().toString(36).slice(-5);

const { page, base } = await start();
const go = (p) => page.goto(base + p);
const vis = (loc) => loc.first().waitFor({ timeout: 10000 }).then(() => true);
const poll = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await page.waitForTimeout(150);
  }
  return false;
};

const cleanup = [];
try {
  /* ───────────── Lists: reference defaults present ───────────── */
  console.log("Lists");
  await go("/settings/lists/unit_measure");
  for (const u of ["bag", "roll", "pair", "per 100", "per 1000", "per job", "week", "month", "allowance"])
    await check(vis(page.locator(`li[data-lookup="${u}"]`)), `unit measure "${u}"`);
  await go("/settings/lists/building_type");
  for (const b of ["Granny flat", "Office fitout", "Duplex", "Shed"]) await check(vis(page.locator(`li[data-lookup="${b}"]`)), `building type "${b}"`);
  await go("/settings/lists/contact_group");
  await check(vis(page.locator('li[data-lookup="Suppliers"]')), "contact group Suppliers");

  /* ───────────── Tax profile + defaults per cost type ───────────── */
  console.log("Tax profile & cost type defaults");
  await go("/settings/tax-rates");
  const pform = page.getByRole("form", { name: "Tax profile" });
  await pform.getByLabel("Profile name").fill("");
  await pform.getByRole("button", { name: "Save profile" }).click();
  await check(vis(pform.getByText("Enter a profile name")), "profile name required");
  await pform.getByLabel("Profile name").fill(`GST AU ${tag}`);
  await pform.getByRole("button", { name: "Save profile" }).click();
  await check(vis(pform.getByText("Tax profile saved")), "tax profile saved");
  await check(poll(async () => (await one("select tax_profile_name from business_settings")).tax_profile_name === `GST AU ${tag}`), "profile persisted");
  await pform.getByLabel("Profile name").fill("GST (Australia)");
  await pform.getByRole("button", { name: "Save profile" }).click();
  await check(vis(pform.getByText("Tax profile saved")), "profile restored");

  const fre = await one("select id from tax_rates where code = 'FRE' and applies_to = 'income'");
  const gst = await one("select id from tax_rates where code = 'GST' and applies_to = 'income'");
  const snapshot = (await db.execute("select id, default_cost_types d from tax_rates")).rows;
  cleanup.push(async () => { for (const x of snapshot) await run("update tax_rates set default_cost_types = ? where id = ?", [x.d, x.id]); });
  const cform = page.getByRole("form", { name: "Cost type tax defaults" });
  await check((await cform.getByLabel("Income rate for Subcontractor").inputValue()) === gst.id, "seeded: Subcontractor defaults to GST");
  await cform.getByLabel("Income rate for Subcontractor").selectOption(fre.id);
  await cform.getByRole("button", { name: "Save cost type defaults" }).click();
  await check(vis(cform.getByText("Cost type defaults saved")), "cost type defaults saved");
  await check(poll(async () => JSON.parse((await one("select default_cost_types d from tax_rates where id = ?", [fre.id])).d).includes("Subcontractor")), "FRE now default for Subcontractor");

  /* ───────────── Costings: new item taxable follows its cost type ───────────── */
  console.log("Costings tax defaults & Mat + Lab");
  const E = uid();
  cleanup.push(() => run("delete from estimate_items where estimate_id = ?", [E]), () => run("delete from quote_options where estimate_id = ?", [E]), () => run("delete from estimates where id = ?", [E]));
  await run(
    "insert into estimates (id, number, name, status, client_name, client_email, markup_lines, pcps_redistribution, rounding, cost_total, markup_total, tax_total, quote_total, is_template, is_sample, archived, tax_rate_id, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [E, `QF${tag}`, `E2E fidelity ${tag}`, "Draft", "Robin Fidelity", "robin@example.com", '[{"name":"Markup","percent":20}]', "none", "none", 0, 0, 0, 0, 0, 0, 0, gst.id, now(), now()],
  );
  const saved = () => page.getByTestId("save-state").filter({ hasText: "All changes saved" }).waitFor();
  const settle = async () => { await page.waitForTimeout(150); await saved(); await page.waitForTimeout(150); };
  const item = async (d) => one("select id, taxable, cost_type from estimate_items where estimate_id = ? and description = ?", [E, d]);
  await go(`/estimates/${E}/costings`);
  await page.getByRole("button", { name: "Add your first category" }).click();
  await page.keyboard.type("Fid cat");
  await page.keyboard.press("Tab");
  await settle();
  const cat = await one("select id from estimate_items where estimate_id = ? and kind = 'category'", [E]);
  await page.getByTestId(`row-${cat.id}`).getByRole("button", { name: "+ Add item" }).click();
  await page.keyboard.type("Fid tiler");
  await page.keyboard.press("Tab");
  await settle();
  let it = await item("Fid tiler");
  await check(it && Number(it.taxable) === 1 && it.cost_type === "Material", "new Material item is taxable");
  const r = page.getByTestId(`row-${it.id}`);
  await check(r.getByLabel("Cost type").locator('option[value="MatLab"]').textContent().then((t) => t === "Mat + Lab"), "Mat + Lab cost type offered");
  await r.getByLabel("Cost type").selectOption("Subcontractor");
  await settle();
  it = await item("Fid tiler");
  await check(it.cost_type === "Subcontractor" && Number(it.taxable) === 0, "switching to Subcontractor applies its GST-free default");
  await r.getByLabel("Cost type").selectOption("MatLab");
  await settle();
  it = await item("Fid tiler");
  await check(it.cost_type === "MatLab" && Number(it.taxable) === 1, "switching to Mat + Lab restores taxable");
  await go(`/estimates/${E}/costings`);
  await check(page.getByTestId(`row-${it.id}`).getByLabel("Cost type").inputValue().then((v) => v === "MatLab"), "Mat + Lab kept after reload");

  // restore the seeded defaults
  await go("/settings/tax-rates");
  await page.getByRole("form", { name: "Cost type tax defaults" }).getByLabel("Income rate for Subcontractor").selectOption(gst.id);
  await page.getByRole("form", { name: "Cost type tax defaults" }).getByRole("button", { name: "Save cost type defaults" }).click();
  await check(vis(page.getByText("Cost type defaults saved")), "cost type defaults restored");

  /* ───────────── Email quote ───────────── */
  console.log("Email quote");
  await go(`/estimates/${E}`);
  await page.getByRole("button", { name: "Email", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Email quote" });
  const link = dlg.getByTestId("email-quote-link");
  await check(vis(link), "email composer opens");
  const href = await link.getAttribute("href");
  const token = (await one("select share_token from quote_options where estimate_id = ?", [E]))?.share_token;
  await check(!!token, "online quote link created for the email");
  await check(href.startsWith("mailto:robin@example.com?subject=") && decodeURIComponent(href).includes(`/q/${token}`), "mailto has client email and quote link");
  await check((await dlg.getByLabel("Email message").inputValue()).startsWith("Hi Robin,"), "message greets the client");
  await dlg.getByLabel("Email subject").fill(`Custom subject ${tag}`);
  await check(link.getAttribute("href").then((h) => h.includes(encodeURIComponent(`Custom subject ${tag}`))), "edits flow into the mailto link");
  await dlg.getByRole("button", { name: "Mark as sent" }).click();
  await check(vis(dlg.getByText("Marked as sent")), "mark as sent from the email dialog");
  await check(poll(async () => !!(await one("select sent_at from estimates where id = ?", [E])).sent_at), "sent date recorded");
  await page.keyboard.press("Escape");

  /* ───────────── Contacts: phone country code + GST registered ───────────── */
  console.log("Phone country code & GST registration");
  const cname = `E2E Kiwi Supplies ${tag}`;
  await go("/contacts/new");
  await page.getByLabel("Name *").fill(cname);
  await page.getByLabel("Mobile").fill("021 555 1234");
  await page.locator('[data-phone="mobile"]').getByLabel("Country code").selectOption("+64");
  await check((await page.getByLabel("Mobile").inputValue()) === "+64 21 555 1234", "country code rewrites the number");
  await page.getByLabel("Phone").fill("07 3000 1111");
  await page.getByLabel("Registered for GST").uncheck();
  await page.getByRole("button", { name: "Create contact" }).click();
  await page.waitForURL(/\/contacts\/[0-9a-f-]{36}\?created=1/);
  const con = await one("select id, mobile, phone, gst_registered from contacts where name = ?", [cname]);
  cleanup.push(() => run("delete from contacts where id = ?", [con.id]));
  await check(con.mobile === "+64 21 555 1234" && con.phone === "07 3000 1111", "international and local numbers stored");
  await check(Number(con.gst_registered) === 0, "not GST registered persisted");
  await page.reload();
  await check((await page.locator('[data-phone="mobile"]').getByLabel("Country code").inputValue()) === "+64", "country code shown on edit");
  await check(!(await page.getByLabel("Registered for GST").isChecked()), "GST box unticked on edit");

  /* ───────────── Client leads tab ───────────── */
  console.log("Client leads tab");
  const client = await one("select id from clients where name = '(sample) Jordan Lee'");
  const leadId = uid();
  cleanup.push(() => run("delete from leads where id = ?", [leadId]));
  await run("insert into leads (id, number, title, client_id, stage, archived, created_at, updated_at) values (?,?,?,?,?,?,?,?)", [leadId, `LF${tag}`, `E2E fidelity lead ${tag}`, client.id, "New", 0, now(), now()]);
  await go(`/clients/${client.id}`);
  await page.getByRole("link", { name: /^Leads \(\d+\)$/ }).click();
  await check(vis(page.getByRole("link", { name: `E2E fidelity lead ${tag}` })), "client's lead listed");

  /* ───────────── Default estimate template ───────────── */
  console.log("Default template");
  const T = uid();
  cleanup.push(() => run("update business_settings set default_template_id = null"), () => run("delete from estimates where id = ?", [T]));
  await run(
    "insert into estimates (id, number, name, status, markup_lines, pcps_redistribution, rounding, cost_total, markup_total, tax_total, quote_total, is_template, is_sample, archived, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [T, `TF${tag}`, `E2E fidelity template ${tag}`, "Draft", '[{"name":"Markup","percent":20}]', "none", "none", 0, 0, 0, 0, 1, 0, 0, now(), now()],
  );
  await go("/estimates/templates");
  const trow = page.locator('tr[data-testid="template-row"]').filter({ has: page.locator(`input[name="id"][value="${T}"]`) });
  await trow.getByRole("button", { name: "Make default" }).click();
  await check(vis(trow.getByTestId("default-template")), "template marked default");
  await go("/estimates/new");
  await check((await page.locator('input[name="templateId"]').inputValue()) === T, "new estimate preselects the default template");
  await go("/estimates/new?template=blank");
  await check((await page.locator('input[name="templateId"]').inputValue()) === "", "blank still available");
  await go("/estimates/templates");
  await trow.getByRole("button", { name: "Clear default" }).click();
  await check(poll(async () => (await one("select default_template_id d from business_settings")).d === null), "default cleared");

  /* ───────────── Business documents ───────────── */
  console.log("Business documents");
  await go("/settings/documents");
  await page.locator('input[type="file"][name="files"]').setInputFiles({ name: `licence-${tag}.txt`, mimeType: "text/plain", buffer: Buffer.from("Builder licence") });
  await page.getByRole("button", { name: "Upload" }).click();
  await check(vis(page.getByText(`licence-${tag}.txt`)), "business document uploaded");
  cleanup.push(() => run("delete from documents where entity_type = 'business' and file_name = ?", [`licence-${tag}.txt`]));

  /* ───────────── Dashboard: average win value ───────────── */
  console.log("Dashboard insight");
  const ids = [uid(), uid(), uid()];
  cleanup.push(() => run(`delete from estimates where id in (?,?,?)`, ids));
  const ins = (id, status, total) =>
    run(
      "insert into estimates (id, number, name, status, markup_lines, pcps_redistribution, rounding, cost_total, markup_total, tax_total, quote_total, is_template, is_sample, archived, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, `QW${tag}${status[0]}${total}`, `E2E win ${tag}`, status, "[]", "none", "none", 0, 0, 0, total, 0, 0, 0, now(), now()],
    );
  await ins(ids[0], "Accepted", 10000);
  await ins(ids[1], "Accepted", 20000);
  await ins(ids[2], "Rejected", 5000);
  await go("/dashboard");
  await check(vis(page.getByTestId("kpi-winrate").getByTestId("avg-win-value")), "average win value shown with win rate");
  await check(page.getByTestId("avg-win-value").innerText().then((t) => /avg win \$[\d,]+/.test(t)), "average win value formatted");
} catch (e) {
  await check(Promise.reject(e), "unexpected error");
} finally {
  for (const f of cleanup.reverse()) await f().catch(() => {});
}

await done();
