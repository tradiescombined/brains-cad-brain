// E2E for module 1: Dashboard, Reminders & Settings.
// Run: BASE_URL=http://localhost:3101 node e2e/dashboard.e2e.mjs
// Settings are a shared singleton: every settings change below is undone through the UI, and the
// business_settings row, tax-rate defaults and the accepted-status flag are snapshotted up front and
// written back at the end, so the suite leaves global state exactly as it found it.
import { start, check, done, db, all, RUN } from "./helpers.mjs";

const settingsBefore = await all("select * from business_settings");
const taxDefaultsBefore = await all("select id, is_default from tax_rates");
const flagsBefore = await all("select id, flag from lookups where kind = 'estimate_status'");
async function restoreGlobalState() {
  for (const row of settingsBefore) {
    const cols = Object.keys(row).filter((c) => c !== "id");
    await db().execute({ sql: `update business_settings set ${cols.map((c) => `${c} = ?`).join(", ")} where id = ?`, args: [...cols.map((c) => row[c]), row.id] });
  }
  for (const t of taxDefaultsBefore) await db().execute({ sql: "update tax_rates set is_default = ? where id = ?", args: [t.is_default, t.id] });
  for (const l of flagsBefore) await db().execute({ sql: "update lookups set flag = ? where id = ?", args: [l.flag, l.id] });
}

const { page, base } = await start();
const U = RUN.slice(-6);
const vis = (loc, timeout = 8000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const gone = (loc, timeout = 8000) => loc.first().waitFor({ state: "detached", timeout }).then(() => true, () => false);
const go = async (path) => {
  await page.goto(base + path);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
};
const poll = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await page.waitForTimeout(200);
  }
  return false;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = iso(new Date());
const yesterday = iso(new Date(Date.now() - 86400000));

/* ───────────── Dashboard ───────────── */
console.log("Dashboard");
await go("/dashboard");
await check(page.getByRole("heading", { name: "Dashboard" }).isVisible(), "dashboard heading");
for (const id of ["kpi-open", "kpi-winrate", "kpi-jobs", "kpi-invoices"]) await check(vis(page.getByTestId(id)), `KPI tile ${id}`);
await check(page.getByTestId("kpi-winrate").innerText().then((t) => /Close \d more estimate/.test(t) || /\d+%/.test(t)), "win rate shows % or unlock hint");
await check(vis(page.getByRole("table", { name: "Recent estimates" }).getByRole("link").first()), "recent estimates link to records");
await check(page.getByRole("table", { name: "Recent estimates" }).getByRole("link").first().getAttribute("href").then((h) => /^\/estimates\/[\w-]+$/.test(h ?? "")), "recent estimate href is /estimates/[id]");
await check(vis(page.getByRole("list", { name: "Pipeline by stage" })), "leads pipeline");
await check(vis(page.getByRole("list", { name: "Quick start checklist" })), "quick-start checklist visible");
await check(vis(page.getByRole("list", { name: "Estimates by status" })), "estimate summary visible");

/* ───────────── Reminders ───────────── */
console.log("Reminders");
const title = `Call client re quote ${U}`;
const title2 = `Chase plumber ${U}`;
await go("/dashboard");
await page.getByRole("link", { name: "+ Reminder" }).click();
const dlg = page.getByRole("dialog", { name: "New reminder" });
await check(vis(dlg), "dashboard '+ Reminder' opens new reminder dialog");
await dlg.getByLabel("Title").fill("");
await dlg.getByRole("button", { name: "Add reminder" }).click();
await check(vis(dlg.getByText("Give the reminder a title")), "validation: title required");
await dlg.getByLabel("Title").fill(title);
await dlg.getByLabel("Due date").fill(yesterday);
await dlg.getByLabel("Record type").selectOption("estimate");
await dlg.getByLabel("Record", { exact: true }).selectOption({ index: 1 });
await dlg.getByLabel("Details").fill("Ask about the tile selection");
await dlg.getByRole("button", { name: "Add reminder" }).click();
await check(gone(dlg), "dialog closes after save");
const overdue = page.getByRole("list", { name: "Overdue reminders" });
const row = page.locator(`li[data-reminder="${title}"]`);
await check(vis(overdue.locator(`li[data-reminder="${title}"]`)), "new reminder listed under Overdue");
await check(row.getByRole("link", { name: /^Estimate:/ }).getAttribute("href").then((h) => /^\/estimates\/[\w-]+$/.test(h ?? "")), "linked record shows as estimate link");

// Edit → due today, new title
await row.getByRole("button", { name: "Edit" }).click();
const edlg = page.getByRole("dialog", { name: "Edit reminder" });
await edlg.getByLabel("Title").fill(title2);
await edlg.getByLabel("Due date").fill(today);
await edlg.getByRole("button", { name: "Save reminder" }).click();
await check(gone(edlg), "edit dialog closes");
await go("/reminders");
const row2 = page.locator(`li[data-reminder="${title2}"]`);
await check(vis(page.getByRole("list", { name: "Today reminders" }).locator(`li[data-reminder="${title2}"]`)), "edited reminder persisted and moved to Today");
await check(row2.innerText().then((t) => t.includes("Ask about the tile selection")), "details persisted");

await go("/dashboard");
await check(vis(page.getByRole("list", { name: "Upcoming reminders" }).locator(`li[data-reminder="${title2}"]`)), "reminder shows on dashboard");

// Toggle done
await go("/reminders");
await page.getByRole("button", { name: `Mark "${title2}" done` }).click();
await check(vis(page.getByRole("list", { name: "Done reminders" }).locator(`li[data-reminder="${title2}"]`)), "toggle done moves to Done");
await page.getByRole("button", { name: `Mark "${title2}" not done` }).click();
await check(vis(page.getByRole("list", { name: "Today reminders" }).locator(`li[data-reminder="${title2}"]`)), "toggle back to open");
await go("/dashboard");
await check(vis(page.getByRole("list", { name: "Activity feed" }).getByText(`Reminder completed: ${title2}`)), "activity feed logs completion");

// Delete
await go("/reminders");
await page.locator(`li[data-reminder="${title2}"]`).getByRole("button", { name: "Delete", exact: true }).click();
await page.waitForTimeout(600);
await check(vis(page.locator(`li[data-reminder="${title2}"]`).getByRole("button", { name: "Delete?" })), "first click only arms delete (row kept)");
await page.locator(`li[data-reminder="${title2}"]`).getByRole("button", { name: "Delete?" }).click();
await check(gone(page.locator(`li[data-reminder="${title2}"]`)), "reminder deleted");
await go("/reminders");
await check(page.locator(`li[data-reminder="${title2}"]`).count().then((n) => n === 0), "deletion persisted");

/* ───────────── Settings: business ───────────── */
console.log("Settings · Business details");
await go("/settings");
await check(page.waitForURL(/\/settings\/business$/).then(() => true, () => false), "/settings redirects to business details");
await check(page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: /Specification library/ }).getAttribute("href").then((h) => h === "/settings/spec-library"), "spec library link in settings nav");
const form = page.getByRole("form", { name: "Business details" });
const origName = await form.locator('input[name="businessName"]').inputValue();
const bizName = `E2E Builders ${U}`;
await form.locator('input[name="businessName"]').fill(bizName);
await form.locator('input[name="email"]').fill("not-an-email");
await form.getByRole("button", { name: "Save business details" }).click();
await check(vis(form.getByText("Enter a valid email address")), "validation: business email");
await form.locator('input[name="email"]').fill("office@e2e.example");
await form.locator('input[name="cityTown"]').fill("Brisbane");
await form.locator('input[name="postcode"]').fill("4000");
await form.getByLabel("Brand colour hex").fill("#1d4ed8");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
await form.getByLabel("Upload logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
await form.getByRole("button", { name: "Save business details" }).click();
await check(vis(form.getByText("Business details saved")), "business details saved");
await go("/settings/business");
await check(form.locator('input[name="businessName"]').inputValue().then((v) => v === bizName), "business name persisted");
await check(form.locator('input[name="email"]').inputValue().then((v) => v === "office@e2e.example"), "email persisted");
await check(form.getByLabel("Brand colour hex").inputValue().then((v) => v === "#1d4ed8"), "brand colour persisted");
await check(page.getByTestId("logo-preview").getAttribute("src").then((s) => s?.startsWith("data:image/png;base64,")), "logo stored as data URL");
await check(vis(page.locator("aside").getByText(bizName)), "sidebar shows new business name");
// remove logo + restore name
await form.getByLabel("Remove current logo").check();
await form.locator('input[name="businessName"]').fill(origName);
await form.getByLabel("Brand colour hex").fill("#0f766e");
await form.getByRole("button", { name: "Save business details" }).click();
await check(vis(form.getByText("Business details saved")), "business details restored");
await go("/settings/business");
await check(page.getByTestId("logo-preview").count().then((n) => n === 0), "logo removed");

/* ───────────── Settings: users ───────────── */
console.log("Settings · Users");
await go("/settings/users");
const email = `sam.${U}@e2e.example`;
await page.getByRole("button", { name: "+ Add user" }).click();
const udlg = page.getByRole("dialog", { name: "Add user" });
await udlg.locator('input[name="firstName"]').fill("Sam");
await udlg.locator('input[name="email"]').fill("bad");
await udlg.getByRole("button", { name: "Add user" }).click();
await check(vis(udlg.getByText("Enter a valid email address")), "validation: user email");
await udlg.locator('input[name="email"]').fill(email);
await udlg.locator('input[name="surname"]').fill("Tester");
await udlg.locator('select[name="role"]').selectOption("Project Manager");
await udlg.getByRole("button", { name: "Add user" }).click();
await check(gone(udlg), "add user dialog closes");
const urow = page.locator(`tr[data-user="${email}"]`);
await check(vis(urow.getByText("Project Manager")), "user added with role");
await urow.getByRole("button", { name: "Edit" }).click();
const uedit = page.getByRole("dialog", { name: "Edit Sam Tester" });
await uedit.locator('select[name="role"]').selectOption("Site Supervisor");
await uedit.getByLabel(/Active/).uncheck();
await uedit.getByRole("button", { name: "Save user" }).click();
await check(gone(uedit), "edit user dialog closes");
await go("/settings/users");
await check(vis(urow.getByText("Site Supervisor")), "role change persisted");
await check(vis(urow.getByText("Inactive")), "inactive persisted");
// owner protection
const ownerRow = page.locator('tr[data-user="owner@example.com"]');
if (await ownerRow.count()) {
  await ownerRow.getByRole("button", { name: "Delete", exact: true }).click();
  await ownerRow.getByRole("button", { name: "Delete user?" }).click();
  await check(vis(ownerRow.getByText(/only active Owner/)), "cannot delete the only Owner");
}
await urow.getByRole("button", { name: "Delete", exact: true }).click();
await urow.getByRole("button", { name: "Delete user?" }).click();
await check(gone(urow), "user deleted");

/* ───────────── Settings: tax rates ───────────── */
console.log("Settings · Tax rates");
await go("/settings/tax-rates");
const code = `T${U}`.slice(0, 8).toUpperCase();
await page.getByRole("button", { name: "+ Add tax rate" }).click();
const tdlg = page.getByRole("dialog", { name: "Add tax rate" });
await tdlg.locator('input[name="code"]').fill(code);
await tdlg.locator('input[name="name"]').fill("Test levy");
await tdlg.locator('input[name="ratePercent"]').fill("150");
await tdlg.getByRole("button", { name: "Add rate" }).click();
await check(vis(tdlg.getByText("Rate must be between 0 and 100")), "validation: rate range");
await tdlg.locator('input[name="ratePercent"]').fill("7.5");
await tdlg.getByRole("button", { name: "Add rate" }).click();
await check(gone(tdlg), "add tax rate dialog closes");
const trow = page.locator(`tr[data-tax="${code}"]`);
await check(vis(trow.getByText("7.5%")), "tax rate added at 7.5%");
await trow.getByRole("button", { name: "Make default" }).click();
await check(vis(trow.getByText("Default", { exact: true })), "new rate made default");
await go("/settings/tax-rates");
await check(vis(trow.getByText("Default", { exact: true })), "default persisted");
await check(page.locator('tr[data-tax="GST"]').getByText("Default", { exact: true }).count().then((n) => n === 0), "previous income default cleared");
await trow.getByRole("button", { name: "Delete", exact: true }).click();
await trow.getByRole("button", { name: "Delete rate?" }).click();
await check(vis(trow.getByText(/another rate the default/)), "cannot delete the default rate");
await page.locator('tr[data-tax="GST"]').getByRole("button", { name: "Make default" }).click();
await check(vis(page.locator('tr[data-tax="GST"]').getByText("Default", { exact: true })), "GST restored as default");
await trow.getByRole("button", { name: "Edit" }).click();
const tedit = page.getByRole("dialog", { name: `Edit ${code}` });
await tedit.locator('input[name="name"]').fill("Test levy renamed");
await tedit.getByRole("button", { name: "Save rate" }).click();
await check(vis(trow.getByText("Test levy renamed")), "tax rate edited");
await trow.getByRole("button", { name: "Delete", exact: true }).click();
await trow.getByRole("button", { name: "Delete rate?" }).click();
await check(gone(trow), "tax rate deleted");

/* ───────────── Settings: numbering ───────────── */
console.log("Settings · Numbering");
await go("/settings/numbering");
const nform = page.getByRole("form", { name: "Numbering" });
const origJobPrefix = await nform.getByLabel("Jobs prefix").inputValue();
const origJobNext = await nform.getByLabel("Jobs next number").inputValue();
const origEstNext = await nform.getByLabel("Estimates / quotes next number").inputValue();
// Relative to the current counter, so earlier runs/suites that consumed numbers can't cause a clash.
const estTarget = String(Number(origEstNext) + 4000);
const jobTarget = String(Number(origJobNext) + 1000);
await nform.getByLabel("Estimates / quotes next number").fill("1");
await nform.getByRole("button", { name: "Save numbering" }).click();
await check(vis(nform.getByText(/would clash with existing numbers/)), "validation: clashing estimate number");
await nform.getByLabel("Estimates / quotes next number").fill(estTarget);
await nform.getByLabel("Jobs prefix").fill("JOB-");
await nform.getByLabel("Jobs next number").fill(jobTarget);
await nform.getByRole("button", { name: "Save numbering" }).click();
await check(vis(nform.getByText("Numbering saved")), "numbering saved");
await go("/settings/numbering");
await check(page.getByTestId("next-job").innerText().then((t) => t.trim() === `JOB-${jobTarget}`), `job numbering persisted (JOB-${jobTarget})`);
await check(page.getByTestId("next-estimate").innerText().then((t) => t.trim().endsWith(estTarget)), "estimate counter persisted");
await nform.getByLabel("Estimates / quotes next number").fill(origEstNext);
await nform.getByLabel("Jobs prefix").fill(origJobPrefix);
await nform.getByLabel("Jobs next number").fill(origJobNext);
await nform.getByRole("button", { name: "Save numbering" }).click();
await check(vis(nform.getByText("Numbering saved")), "numbering restored");

/* ───────────── Settings: quote defaults ───────────── */
console.log("Settings · Quote defaults");
await go("/settings/quote-defaults");
const qform = page.getByRole("form", { name: "Quote defaults" });
const origQ = {};
for (const n of ['input[name="quoteValidDays"]', 'input[name="defaultMarkupPercent"]', 'input[name="defaultInvoiceDueDays"]', 'textarea[name="bankDetails"]']) origQ[n] = await qform.locator(n).inputValue();
await qform.locator('input[name="quoteValidDays"]').fill("0");
await qform.getByRole("button", { name: "Save quote defaults" }).click();
await check(vis(qform.getByText(/Quote valid for: whole number 1/)), "validation: valid days");
await qform.locator('input[name="quoteValidDays"]').fill("45");
await qform.locator('input[name="defaultMarkupPercent"]').fill("22.5");
await qform.locator('input[name="defaultInvoiceDueDays"]').fill("7");
await qform.locator('textarea[name="bankDetails"]').fill(`BSB 000-000 Acc ${U}`);
await qform.getByRole("button", { name: "Save quote defaults" }).click();
await check(vis(qform.getByText("Quote defaults saved")), "quote defaults saved");
await go("/settings/quote-defaults");
await check(qform.locator('input[name="quoteValidDays"]').inputValue().then((v) => v === "45"), "valid days persisted");
await check(qform.locator('input[name="defaultMarkupPercent"]').inputValue().then((v) => v === "22.5"), "markup persisted");
await check(qform.locator('textarea[name="bankDetails"]').inputValue().then((v) => v.includes(U)), "bank details persisted");
for (const [n, v] of Object.entries(origQ)) await qform.locator(n).fill(v);
await qform.getByRole("button", { name: "Save quote defaults" }).click();
await check(vis(qform.getByText("Quote defaults saved")), "quote defaults restored");

/* ───────────── Settings: lists ───────────── */
console.log("Settings · Lists");
await go("/settings/lists");
await check(vis(page.getByRole("link", { name: /Lead statuses/ })), "lists overview shows every kind");
await page.getByRole("link", { name: /Building types/ }).click();
await page.waitForURL(/\/settings\/lists\/building_type$/);
const v1 = `E2E Shed ${U}`;
const v2 = `E2E Garage ${U}`;
await page.getByLabel("New value").fill("Deck");
await page.getByRole("button", { name: "Add", exact: true }).click();
await check(vis(page.getByText('"Deck" is already in this list')), "validation: duplicate list value");
await page.getByLabel("New value").fill(v1);
await page.getByRole("button", { name: "Add", exact: true }).click();
const lrow = () => page.locator(`li[data-lookup="${v1}"], li[data-lookup="${v2}"]`);
await check(vis(lrow()), "list value added");
const vals = page.getByRole("list", { name: "Building types values" });
const order = () => vals.locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-lookup")));
await check(order().then((o) => o[o.length - 1] === v1), "new value added at the end");
await lrow().getByLabel(`Name for ${v1}`).fill(v2);
await lrow().getByRole("button", { name: "Save" }).click();
await check(vis(page.locator(`li[data-lookup="${v2}"]`)), "list value renamed");
await page.getByRole("button", { name: `Move ${v2} up` }).click();
await check(poll(async () => { const o = await order(); return o[o.length - 2] === v2; }), "value moved up");
await page.locator(`li[data-lookup="${v2}"]`).getByRole("button", { name: "Deactivate" }).click();
await check(vis(page.locator(`li[data-lookup="${v2}"]`).getByText("Inactive")), "value deactivated");
await go("/settings/lists/building_type");
await check(vis(page.locator(`li[data-lookup="${v2}"]`).getByRole("button", { name: "Activate" })), "deactivation persisted");
await page.locator(`li[data-lookup="${v2}"]`).getByRole("button", { name: "Activate" }).click();
await check(vis(page.locator(`li[data-lookup="${v2}"]`).getByRole("button", { name: "Deactivate" })), "value reactivated");
await page.locator(`li[data-lookup="${v2}"]`).getByRole("button", { name: "Delete", exact: true }).click();
await page.locator(`li[data-lookup="${v2}"]`).getByRole("button", { name: "Delete?" }).click();
await check(gone(page.locator(`li[data-lookup="${v2}"]`)), "custom value deleted");

// Accepted status flag
await page.getByRole("navigation", { name: "Lists" }).getByRole("link", { name: "Estimate statuses" }).click();
await page.waitForURL(/estimate_status$/);
await page.getByRole("button", { name: "Mark Sent as the accepted status" }).click();
await check(vis(page.locator('li[data-lookup="Sent"]').getByText("Accepted status")), "accepted flag moved to Sent");
await check(vis(page.getByRole("button", { name: "Mark Accepted as the accepted status" })), "previous accepted flag cleared");
await page.getByRole("button", { name: "Mark Accepted as the accepted status" }).click();
await check(vis(page.locator('li[data-lookup="Accepted"]').getByText("Accepted status")), "accepted flag restored");

/* ───────────── Settings: display preferences ───────────── */
console.log("Settings · Display preferences");
await go("/settings/display");
const dform = page.getByRole("form", { name: "Display preferences" });
await dform.getByLabel("Getting started checklist").uncheck();
await dform.getByLabel("Estimate summary").uncheck();
await dform.getByRole("button", { name: "Save preferences" }).click();
await check(vis(dform.getByText("Display preferences saved")), "display prefs saved");
await go("/dashboard");
await check(page.getByRole("list", { name: "Quick start checklist" }).count().then((n) => n === 0), "quick-start hidden when toggled off");
await check(page.getByRole("list", { name: "Estimates by status" }).count().then((n) => n === 0), "estimate summary hidden when toggled off");
await go("/settings/display");
await check(dform.getByLabel("Getting started checklist").isChecked().then((c) => !c), "toggle state persisted");
await dform.getByLabel("Getting started checklist").check();
await dform.getByLabel("Estimate summary").check();
await dform.getByRole("button", { name: "Save preferences" }).click();
await check(vis(dform.getByText("Display preferences saved")), "display prefs restored");
await go("/dashboard");
await check(vis(page.getByRole("list", { name: "Quick start checklist" })), "quick-start visible again");

/* ───────────── Responsive ───────────── */
console.log("Responsive");
await page.setViewportSize({ width: 390, height: 844 });
for (const p of ["/dashboard", "/reminders", "/settings/users", "/settings/lists/estimate_status"]) {
  await go(p);
  await check(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `no horizontal page scroll at 390px: ${p}`);
}

await restoreGlobalState();
await done();
