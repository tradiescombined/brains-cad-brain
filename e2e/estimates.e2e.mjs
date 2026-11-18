// Module 4 — Estimates list, creation, Details tab, templates & versions.
// Run: BASE_URL=http://localhost:3104 node e2e/estimates.e2e.mjs
// Reads the seeded sample estimate (as a template source) but never mutates it; links its own lead.
import { start, check, done, one as q1, RUN, purgeEstimate, purgeLead, purgeClient } from "./helpers.mjs";

const stamp = RUN;
const { page, base } = await start();
// Own lead: linking + accepting moves the lead's stage (syncLeadWithEstimate), so never use a seed lead.
const lead = { id: crypto.randomUUID(), title: `E2E estimate lead ${stamp}` };
{
  const now = new Date().toISOString();
  await q1("insert into leads (id, number, title, stage, archived, created_at, updated_at) values (?, ?, ?, 'Quoting', 0, ?, ?)", [lead.id, `LE2E-${stamp}`, lead.title, now, now]);
}

const money = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));
const headerTotal = async () => money(await page.locator("text=Quote total").first().locator("xpath=following-sibling::div[1]").innerText());
const estimateIdFromUrl = () => new URL(page.url()).pathname.split("/")[2];
const visible = (loc) => loc.first().waitFor({ state: "visible", timeout: 10000 }).then(() => true);

console.log("List");
await page.goto(base + "/estimates");
await check(visible(page.getByRole("heading", { name: "Estimates", exact: true })), "list heading");
await check(visible(page.getByTestId("estimate-row").filter({ hasText: "[SAMPLE] Bathroom renovation" })), "sample estimate listed");
await check(visible(page.getByRole("link", { name: /^Draft\s*\d+$/ })), "status chip with count");
await check((async () => money(await page.getByTestId("list-total").innerText()) > 0)(), "list total shown");
await page.getByRole("searchbox", { name: "Search estimates" }).fill("zzznomatch");
await page.keyboard.press("Enter");
await page.waitForURL(/q=zzznomatch/);
await check(visible(page.getByText("No estimates match")), "search empty state");
await page.goto(base + "/estimates?q=bathroom&sort=total&dir=asc");
await check((async () => (await page.getByTestId("estimate-row").count()) >= 1)(), "search finds sample");

console.log("Save sample as template");
const sample = await q1("select id, quote_total from estimates where is_sample = 1 limit 1");
await page.goto(base + `/estimates/${sample.id}`);
await page.getByRole("button", { name: /More/ }).click();
await page.getByRole("menuitem", { name: "Save as template…" }).click();
const tplName = `E2E template ${stamp}`;
await page.getByLabel("Template name").fill(tplName);
await page.getByRole("button", { name: "Save template" }).click();
await page.waitForURL(/\/estimates\/templates\?saved=/);
await check(visible(page.getByText(`Saved “${tplName}” as a template`)), "template saved banner");
const tpl = await q1("select id, quote_total from estimates where name = ? and is_template = 1", [tplName]);
const srcItems = (await q1("select count(*) n from estimate_items where estimate_id = ?", [sample.id])).n;
await check(Promise.resolve(tpl && (await q1("select count(*) n from estimate_items where estimate_id = ?", [tpl.id])).n === srcItems), "template has deep-copied items");
await check(Promise.resolve(tpl && (await q1("select client_name from estimates where id = ?", [tpl.id])).client_name === null), "template has no client");

console.log("Rename template");
const row = page.getByTestId("template-row").filter({ hasText: tplName });
await row.getByRole("button", { name: "Rename" }).click();
const renamed = `${tplName} renamed`;
const editForm = page.locator("form").filter({ has: page.getByLabel("Template name") });
await editForm.getByLabel("Template name").fill(renamed);
await editForm.getByRole("button", { name: "Save" }).click();
await check(visible(page.getByTestId("template-row").filter({ hasText: renamed })), "template renamed in list");
await check((async () => (await q1("select name from estimates where id = ?", [tpl.id])).name === renamed)(), "rename persisted");

console.log("New estimate validation + from template");
await page.goto(base + "/estimates/new");
await page.getByRole("button", { name: "Create estimate" }).click();
await check(visible(page.getByText("Give the estimate a name.")), "name required error");
await page.getByRole("radio", { name: new RegExp(renamed) }).click();
const estName = `E2E house ${stamp}`;
await page.locator("input[name=name]").fill(estName);
await page.getByRole("combobox", { name: "Client" }).fill(`E2E Client ${stamp}`);
await check(visible(page.getByText("A new client will be created")), "new client hint");
await page.locator("input[name=siteAddress]").fill("1 Test Lane");
await page.getByRole("button", { name: "Create from template" }).click();
await page.waitForURL(/\/estimates\/[0-9a-f-]{36}$/);
const estId = estimateIdFromUrl();
await check(visible(page.getByRole("heading", { name: estName })), "redirected to new estimate");
const est = await q1("select * from estimates where id = ?", [estId]);
await check(Promise.resolve(est.client_name === `E2E Client ${stamp}` && !!est.client_id), "client created and linked");
await check(Promise.resolve(!!(await q1("select id from clients where id = ?", [est.client_id]))), "client row exists");
await check(Promise.resolve(Math.abs(est.quote_total - tpl.quote_total) < 0.01 && est.quote_total > 0), "totals copied from template");
const tree = await q1(
  "select count(*) n from estimate_items c join estimate_items p on c.parent_id = p.id where c.estimate_id = ? and p.estimate_id = ?",
  [estId, estId],
);
const srcTree = await q1("select count(*) n from estimate_items c join estimate_items p on c.parent_id = p.id where c.estimate_id = ?", [sample.id]);
await check(Promise.resolve(tree.n === srcTree.n && tree.n > 0), "parent/child links remapped within new estimate");
await check(Promise.resolve(/^Q\d+$/.test(est.number) && !!est.tax_rate_id && est.date_prepared?.length === 10), "number, tax and date defaults");

console.log("Details tab edit");
const startTotal = await headerTotal();
await page.locator("input[name=name]").fill(`${estName} edited`);
await page.locator("select[name=buildingType]").selectOption("Kitchen");
await page.locator("input[name=clientEmail]").fill("bad-email");
await page.getByRole("button", { name: "Save details" }).click();
await check(visible(page.getByText("That email doesn't look right.")), "email validation");
await page.locator("input[name=clientEmail]").fill("client@example.com");
await page.locator("input[name=clientMobile]").fill("0411 222 333");
await page.locator("select[name=taxRateId]").selectOption({ label: "GST free income" });
await page.locator("select[name=rounding]").selectOption("hundred");
await page.getByRole("radio", { name: /Across estimate/ }).check();
await page.locator("select[name=leadId]").selectOption(lead.id);
await check(visible(page.getByTestId("linked-lead").filter({ hasText: lead.title })), "linked lead shown");
await page.getByRole("button", { name: "Save details" }).click();
await check(visible(page.getByText("✓ Changes saved")), "saved message");
await page.reload();
await check(visible(page.getByRole("heading", { name: `${estName} edited` })), "name persisted");
await check((async () => (await page.locator("input[name=clientMobile]").inputValue()) === "0411 222 333")(), "client mobile persisted");
await check((async () => (await page.locator("select[name=rounding]").inputValue()) === "hundred")(), "rounding persisted");
await check(page.getByRole("radio", { name: /Across estimate/ }).isChecked(), "redistribution persisted");
const editedTotal = await headerTotal();
await check(Promise.resolve(editedTotal % 100 === 0 && editedTotal < startTotal), `recalculated total (${startTotal} → ${editedTotal})`);
const e2 = await q1("select * from estimates where id = ?", [estId]);
await check(Promise.resolve(e2.lead_id === lead.id && e2.building_type === "Kitchen" && e2.client_email === "client@example.com"), "details persisted in DB");

console.log("Status");
await page.getByLabel("Estimate status").selectOption("Accepted");
await page.waitForFunction(() => document.querySelector("[data-testid=summary]")?.parentElement?.textContent?.includes("Accepted"));
await check((async () => !!(await q1("select accepted_at from estimates where id = ?", [estId])).accepted_at)(), "acceptedAt stamped");
await page.getByLabel("Estimate status").selectOption("Sent");
await page.waitForFunction(() => !document.querySelector("[data-testid=summary]")?.parentElement?.textContent?.includes("Accepted"));
await check((async () => (await q1("select accepted_at, status from estimates where id = ?", [estId])).status === "Sent")(), "status changed to Sent");

console.log("Versions");
await page.getByLabel("Version label").fill("Rounded quote");
await page.getByRole("button", { name: "Capture" }).click();
await check(visible(page.getByTestId("version-row").filter({ hasText: "Rounded quote" })), "version captured");
await page.locator("select[name=rounding]").selectOption("none");
await page.getByRole("button", { name: "Save details" }).click();
await check(visible(page.getByText("✓ Changes saved")), "saved without rounding");
await page.waitForFunction((t) => {
  const el = [...document.querySelectorAll("div")].find((d) => d.textContent === "Quote total");
  return el && Number(el.nextElementSibling.textContent.replace(/[^0-9.]/g, "")) !== t;
}, editedTotal);
const unrounded = await headerTotal();
await check(Promise.resolve(unrounded !== editedTotal), "total changed after edit");
const vrow = page.getByTestId("version-row").filter({ hasText: "Rounded quote" });
await vrow.getByRole("button", { name: "Restore" }).click();
await vrow.getByRole("button", { name: "Replace current costings?" }).click();
await visible(page.getByText(/Restored “Rounded quote”/));
await check(visible(page.getByText(/Restored “Rounded quote”/)), "restore message");
await page.reload();
await check((async () => (await headerTotal()) === editedTotal)(), "restored total matches version");
await check((async () => (await page.locator("select[name=rounding]").inputValue()) === "hundred")(), "restored pricing settings");
await check(visible(page.getByTestId("version-row").filter({ hasText: "Auto-saved before restoring" })), "auto-captured version before restore");
const before = await page.getByTestId("version-row").count();
const auto = page.getByTestId("version-row").filter({ hasText: "Auto-saved before restoring" });
await auto.getByRole("button", { name: "Delete" }).click();
await auto.getByRole("button", { name: "Delete?" }).click();
await page.waitForFunction((n) => document.querySelectorAll("[data-testid=version-row]").length === n - 1, before);
await check(Promise.resolve(true), "version deleted");

console.log("Notes panel present");
await check(visible(page.getByRole("heading", { name: "Notes" })), "notes panel");
await check(visible(page.getByRole("heading", { name: "Documents" })), "documents panel");

console.log("Duplicate, archive, delete");
await page.getByRole("button", { name: /More/ }).click();
await page.getByRole("menuitem", { name: "Duplicate estimate" }).click();
await page.waitForURL((u) => u.pathname !== `/estimates/${estId}` && /\/estimates\/[0-9a-f-]{36}$/.test(u.pathname));
const dupId = estimateIdFromUrl();
await check(visible(page.getByRole("heading", { name: `${estName} edited (copy)` })), "duplicate opened");
await check((async () => (await q1("select count(*) n from estimate_items where estimate_id = ?", [dupId])).n === srcItems)(), "duplicate items copied");
await page.getByRole("button", { name: /More/ }).click();
await page.getByRole("menuitem", { name: "Archive" }).click();
await check(visible(page.getByText("is archived and hidden from the main list")), "archived banner");
await page.goto(base + "/estimates");
await check((async () => (await page.getByTestId("estimate-row").filter({ hasText: `${estName} edited (copy)` }).count()) === 0)(), "archived hidden from list");
await page.getByRole("link", { name: "Show archived" }).click();
await check(visible(page.getByTestId("estimate-row").filter({ hasText: `${estName} edited (copy)` })), "archived toggle shows it");
await page.goto(base + `/estimates/${dupId}`);
await page.getByRole("button", { name: /More/ }).click();
await page.getByRole("button", { name: "Delete estimate" }).click();
await page.getByRole("button", { name: "Yes, delete permanently" }).click();
await page.waitForURL(/\/estimates\?archived=1/);
await check((async () => !(await q1("select id from estimates where id = ?", [dupId])))(), "duplicate deleted");
await check((async () => (await q1("select count(*) n from estimate_items where estimate_id = ?", [dupId])).n === 0)(), "duplicate items deleted");

console.log("Templates: create blank, open, delete");
await page.goto(base + "/estimates/templates");
await page.getByRole("button", { name: "New template" }).click();
const blank = `E2E blank ${stamp}`;
await page.getByRole("dialog").locator("input[name=name]").fill(blank);
await page.getByRole("button", { name: "Create template" }).click();
await page.waitForURL(/\/estimates\/[0-9a-f-]{36}$/);
await check(visible(page.getByText("You’re editing a template")), "blank template opens like an estimate");
await check(visible(page.getByRole("link", { name: "Use template" })), "Use template action");
const blankRow = await q1("select number, is_template from estimates where name = ?", [blank]);
await check(Promise.resolve(blankRow?.is_template === 1 && /^TPL\d+$/.test(blankRow.number)), "template numbered TPL");
await page.goto(base + "/estimates/templates");
for (const n of [blank, renamed]) {
  const r = page.getByTestId("template-row").filter({ hasText: n });
  await r.getByRole("button", { name: "Delete" }).click();
  await r.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForFunction((name) => ![...document.querySelectorAll("[data-testid=template-row]")].some((x) => x.textContent.includes(name)), n);
}
await check((async () => !(await q1("select id from estimates where name in (?, ?)", [blank, renamed])))(), "templates deleted");

console.log("Responsive");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/estimates");
await check(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal page scroll on phone");
await page.goto(base + `/estimates/${estId}`);
await check(visible(page.locator("input[name=name]")), "details usable on phone");

await purgeEstimate(estId);
await purgeLead(lead.id);
await purgeClient(est.client_id);
await done();
