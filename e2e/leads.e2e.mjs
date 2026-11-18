// Leads module end-to-end: BASE_URL=http://localhost:3102 node e2e/leads.e2e.mjs
import { start, check, done } from "./helpers.mjs";
import { createClient } from "@libsql/client";

const { page, base } = await start();
const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
const stamp = Date.now().toString(36);
const title = `E2E kitchen ${stamp}`;
const contact = `Pat Tester ${stamp}`;

// When run in an isolated module worktree, sibling modules' routes (sidebar prefetches, the
// /estimates/[id] page after conversion) do not exist yet and 404. Soften only those 404s to an
// empty 204 so the console check stays meaningful; once integrated this is a no-op.
await page.route(/\/(estimates|catalogues|jobs|schedule|orders|invoices|clients|contacts|reminders|settings|dashboard)(\/|\?|$)/, async (route) => {
  const res = await route.fetch();
  if (res.status() === 404) {
    if (route.request().resourceType() === "document")
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stub</title><p>Route provided by another module</p>" });
    return route.fulfill({ status: 204, body: "" });
  }
  return route.fulfill({ response: res });
});

const settle = () => page.waitForTimeout(700); // let hydration / revalidation finish
const goto = async (url) => {
  await page.goto(url);
  await settle();
};
const reload = async () => {
  await page.reload();
  await settle();
};
const visible = (loc) => loc.first().waitFor({ state: "visible" }).then(() => true);
const textIs = async (loc, want) => {
  const deadline = Date.now() + 10000;
  let last = "";
  while (Date.now() < deadline) {
    last = (await loc.first().innerText().catch(() => "")).trim();
    if (want instanceof RegExp ? want.test(last) : last === want) return true;
    await page.waitForTimeout(150);
  }
  console.log("    (got:", JSON.stringify(last) + ")");
  return false;
};
const field = (name) => page.locator(`form [name="${name}"]`).first();
const click = (name, opts = {}) => page.getByRole("button", { name, ...opts }).first().click();

console.log("List");
await goto(base + "/leads");
await check(visible(page.getByRole("heading", { name: "Leads", exact: true })), "leads heading");
await check(visible(page.locator('tr[data-lead="L1000"]')), "sample lead L1000 in list");

console.log("Create (validation)");
await goto(base + "/leads/new");
await field("title").fill("");
await field("email").fill("not-an-email");
await field("probability").fill("150");
await click("Create lead");
await check(visible(page.getByRole("alert").filter({ hasText: /title/i })), "title required error");
await check(visible(page.getByRole("alert").filter({ hasText: /valid email/i })), "email error");
await check(visible(page.getByRole("alert").filter({ hasText: /100 or less/ })), "probability error");
await check(field("email").inputValue().then((v) => v === "not-an-email"), "typed values kept after error");

console.log("Create");
await field("title").fill(title);
await field("contactName").fill(contact);
await field("email").fill("pat@example.com");
await field("phone").fill("0400 111 222");
await field("address").fill("7 Test Lane");
await field("cityTown").fill("Geelong");
await field("state").fill("VIC");
await field("postcode").fill("3220");
await field("source").selectOption("Referral");
await field("buildingType").selectOption("Kitchen");
await field("estimatedValue").fill("45,000");
await field("probability").fill("40");
await field("followUpDate").fill("2026-01-05"); // in the past -> overdue
await field("expectedStart").fill("2027-03-01");
await field("description").fill("Full kitchen replacement with island bench.");
await field("clientId").selectOption("__new__");
await click("Create lead");
await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
await settle();
const leadUrl = page.url();
const leadId = leadUrl.split("/").pop();
await check(visible(page.getByRole("heading", { name: title })), "detail heading");
await check(textIs(page.getByTestId("lead-number"), /^L1\d{3,}$/).then(async (ok) => ok && (await page.getByTestId("lead-number").innerText()) !== "L1000"), "auto-numbered lead (L1001+)");
await check(textIs(page.getByTestId("linked-client"), contact), "new client created and linked");
const [clientRow] = (await db.execute({ sql: "select c.* from clients c join leads l on l.client_id = c.id where l.id = ?", args: [leadId] })).rows;
await check(clientRow?.email === "pat@example.com" && clientRow?.city_town === "Geelong" && clientRow?.source === "Referral", "client row has contact + site details");
const [leadRow] = (await db.execute({ sql: "select * from leads where id = ?", args: [leadId] })).rows;
await check(leadRow?.estimated_value === 45000 && leadRow?.probability === 40 && leadRow?.building_type === "Kitchen" && leadRow?.follow_up_date === "2026-01-05" && leadRow?.assigned_to, "lead row persisted with parsed values + default assignee");
await check(field("estimatedValue").inputValue().then((v) => v === "45000"), "value shown in form");
await check(visible(page.getByText(/Jan 2026 · overdue/)), "overdue shown in summary");

console.log("Edit");
await field("estimatedValue").fill("52000");
await field("stage").selectOption("Contacted");
await field("probability").fill("55");
await click("Save changes");
await check(visible(page.getByRole("status").filter({ hasText: "Changes saved" })), "saved message");
await reload();
await check(field("estimatedValue").inputValue().then((v) => v === "52000"), "edited value persisted after reload");
await check(field("stage").inputValue().then((v) => v === "Contacted"), "edited stage persisted");
await check(textIs(page.getByTestId("lead-stage"), "Contacted"), "stage badge updated");

console.log("Notes");
await page.getByPlaceholder("Write a note…").fill("Client wants stone benchtops");
await click("Add note");
await check(visible(page.getByText("Client wants stone benchtops")), "note added");

console.log("List filters + search");
await goto(base + "/leads?q=" + encodeURIComponent(stamp));
const row = page.locator("tbody tr").filter({ hasText: title });
await check(visible(row), "search finds lead");
await check(page.locator("tbody tr").count().then((n) => n === 1), "search narrows to one row");
await check(visible(row.locator("[data-overdue]")), "overdue follow-up highlighted in list");
await check(visible(row.getByText("$52,000")), "value column");
await page.getByRole("link", { name: /^Contacted/ }).click();
await page.waitForURL(/stage=Contacted/);
await check(visible(page.locator("tbody tr").filter({ hasText: title })), "stage chip Contacted shows lead");
await goto(base + `/leads?stage=Won&q=${stamp}`);
await check(visible(page.getByText(/No leads in/)), "stage chip Won excludes lead");
await goto(base + "/leads?q=zzzz-nothing-" + stamp);
await check(visible(page.getByText("No leads match your search")), "empty search state");

console.log("Board");
await goto(base + "/leads?view=board");
const col = (s) => page.locator(`section[data-stage="${s}"]`);
await check(visible(col("Contacted").getByText(title)), "card in Contacted column");
await check(visible(col("Site visit").getByText("(sample) Deck & pergola")), "sample card in Site visit column");
await page.locator("article").filter({ hasText: title }).locator("select").selectOption("Site visit");
await check(visible(col("Site visit").getByText(title)), "card moved to Site visit");
await reload();
await check(visible(col("Site visit").getByText(title)), "card move persisted");
const [sv] = (await db.execute("select count(*) n, coalesce(sum(estimated_value), 0) v from leads where stage = 'Site visit' and archived = 0")).rows;
const svTotal = "$" + Number(sv.v).toLocaleString("en-AU");
await check(textIs(col("Site visit").getByTestId("column-total"), svTotal), `column total matches DB (${svTotal}, includes 28,000 sample + 52,000)`);
await check(Number(sv.v) >= 80000, "column sum includes moved lead");
await check(textIs(col("Site visit").getByTestId("column-count"), String(sv.n)), "column count matches DB");

console.log("Won / Lost");
await goto(leadUrl);
await click("Mark lost");
const dialog = page.getByRole("dialog");
await dialog.getByRole("button", { name: "Mark as lost" }).click();
await check(visible(dialog.getByRole("alert")), "lost reason required");
await dialog.locator("textarea").fill("Went with a cheaper quote");
await dialog.getByRole("button", { name: "Mark as lost" }).click();
await check(visible(page.getByTestId("lost-reason").filter({ hasText: "Went with a cheaper quote" })), "lost reason shown");
await check(textIs(page.getByTestId("lead-stage"), "Lost"), "stage Lost");
await check(dialog.count().then((n) => n === 0), "dialog closed");
await check(field("stage").inputValue().then((v) => v === "Lost"), "form stage resynced to Lost");
await click("Reopen lead");
await check(visible(page.getByRole("button", { name: "Mark won" })), "reopened");
await check(textIs(page.getByTestId("lead-stage"), "New"), "reopened to New");
await click("Mark won");
await check(visible(page.getByRole("button", { name: "Reopen lead" })), "won");
await check(textIs(page.getByTestId("lead-stage"), "Won"), "stage Won");

console.log("Convert to estimate");
await click("Convert to estimate");
await page.waitForURL(/\/estimates\/[0-9a-f-]{36}/);
const estId = page.url().split("/estimates/")[1].split(/[/?#]/)[0];
const [est] = (await db.execute({ sql: "select * from estimates where id = ?", args: [estId] })).rows;
await check(est?.lead_id === leadId, "estimate linked to lead");
await check(est?.status === "Draft" && est?.name === title, "estimate draft with lead title");
await check(est?.client_id === clientRow?.id && est?.client_name === contact && est?.client_email === "pat@example.com", "client snapshot copied");
await check(est?.site_address === "7 Test Lane" && est?.site_city_town === "Geelong" && est?.site_state === "VIC" && est?.site_postcode === "3220", "site copied");
await check(est?.building_type === "Kitchen" && est?.date_prepared === new Date().toISOString().slice(0, 10), "building type + date prepared");
const [settings] = (await db.execute("select default_markup_percent from business_settings")).rows;
await check(JSON.stringify(JSON.parse(String(est?.markup_lines))) === JSON.stringify([{ name: "Markup", percent: settings.default_markup_percent }]), "markup lines from settings");
const [gst] = (await db.execute("select id from tax_rates where is_default = 1 and applies_to = 'income'")).rows;
await check(est?.tax_rate_id === gst.id, "default income tax rate");
await goto(leadUrl);
await check(textIs(page.getByTestId("lead-stage"), "Quoting"), "lead moved to Quoting");
await check(visible(page.getByTestId("lead-estimates").getByText(String(est?.number), { exact: true })), "linked estimate listed on lead");
await check(visible(page.getByTestId("lead-activity").getByText(/converted to estimate/)), "activity logged");

console.log("Archive / restore");
await click("Archive");
await check(visible(page.getByRole("button", { name: "Restore" })), "archived");
await goto(base + "/leads?q=" + stamp);
await check(visible(page.getByText("No leads match your search")), "archived lead hidden from list");
await goto(base + "/leads?archived=1&q=" + stamp);
await check(visible(page.locator("tbody tr").filter({ hasText: title })), "archived lead in archived view");
await goto(leadUrl);
await click("Restore");
await check(visible(page.getByRole("button", { name: "Archive" })), "restored");

console.log("Delete");
await goto(leadUrl);
await click("Delete", { exact: true });
await check(visible(page.getByRole("button", { name: "Delete permanently" })), "delete asks for confirmation");
await settle();
const still = (await db.execute({ sql: "select count(*) n from leads where id = ?", args: [leadId] })).rows[0].n;
await check(Number(still) === 1, "first click does not delete");
await click("Cancel", { exact: true });
await check(visible(page.getByRole("button", { name: "Delete", exact: true })), "cancel disarms");
await click("Delete", { exact: true });
await click("Delete permanently");
await page.waitForURL(base + "/leads");
await goto(base + "/leads?q=" + stamp);
await check(visible(page.getByText("No leads match your search")), "deleted lead gone from list");
const left = (await db.execute({ sql: "select count(*) n from leads where id = ?", args: [leadId] })).rows[0].n;
await check(Number(left) === 0, "lead row deleted");
const detached = (await db.execute({ sql: "select lead_id from estimates where id = ?", args: [estId] })).rows[0];
await check(detached && detached.lead_id === null, "estimate kept, detached from deleted lead");

// tidy up test data created along the way
await db.execute({ sql: "delete from estimates where id = ?", args: [estId] });
if (clientRow) await db.execute({ sql: "delete from clients where id = ?", args: [clientRow.id] });

console.log("Mobile layout");
await page.setViewportSize({ width: 390, height: 800 });
await goto(base + "/leads");
await check(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal page scroll at phone width (list)");
await goto(base + "/leads?view=board");
await check(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "board scrolls inside its container at phone width");

await done();
