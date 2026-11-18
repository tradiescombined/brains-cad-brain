// Module 3 — Clients & Suppliers/Trades end-to-end flows.
// Run: BASE_URL=http://localhost:3103 node e2e/people.e2e.mjs
import { start, check, done } from "./helpers.mjs";

const { page, base } = await start();

// Standalone-worktree shim: sidebar <Link>s prefetch other modules' routes, which don't exist
// until integration and would log 404s. Serve those prefetches from /dashboard's RSC payload.
// Harmless once all modules are merged (real routes answer first-class).
const OTHER_MODULES = /^\/(leads|estimates|catalogues|jobs|schedule|orders|invoices|reminders|settings)(\/|$)/;
await page.route(
  (url) => OTHER_MODULES.test(url.pathname) && url.searchParams.has("_rsc"),
  async (route) => {
    const u = new URL(route.request().url());
    u.pathname = "/dashboard";
    u.searchParams.delete("clientId");
    const res = await route.fetch({ url: u.toString() });
    await route.fulfill({ response: res });
  },
);
const stamp = Date.now().toString().slice(-6);
const biz = `E2E Builders ${stamp}`;
const contactName = `E2E Person ${stamp}`;

const seen = (loc) => loc.first().waitFor({ timeout: 10000 }).then(() => true);
const val = (label) => page.getByLabel(label).inputValue();

// ---------- Clients list ----------
console.log("Clients");
await page.goto(base + "/clients");
await check(seen(page.getByRole("heading", { name: "Clients" })), "clients heading");
await check(seen(page.getByRole("link", { name: "(sample) Jordan Lee" })), "sample client listed");

// ---------- Create with validation ----------
await page.getByRole("link", { name: "New client" }).click();
await page.waitForURL(/\/clients\/new/);
await page.getByRole("button", { name: "Create client" }).click();
await check(seen(page.getByText("Enter the client's name.")), "name required error");
await page.getByRole("radio", { name: "Business" }).click();
await page.getByLabel("Contact name").fill(contactName);
await page.getByLabel("Email").fill("bad-email");
await page.getByRole("button", { name: "Create client" }).click();
await check(seen(page.getByText("Business name is required for a business client.")), "business name required");
await check(seen(page.getByText("Enter a valid email address.")), "email error");
await check((await val("Contact name")) === contactName, "values kept after validation error");
await page.getByLabel("Business name *").fill(biz);
await page.getByLabel("ABN").fill("51824753556");
await page.getByLabel("Email").fill("E2E@Example.com");
await page.getByLabel("Mobile").fill("0411 222 333");
await page.getByLabel("City / town").fill("Toowong");
await page.getByLabel("State").selectOption("QLD");
await page.getByLabel("Source").selectOption("Website");
await page.getByLabel("Category").selectOption("Developer");
await page.getByLabel("Invoice due (days)").fill("14");
await page.getByRole("button", { name: "Create client" }).click();
await page.waitForURL(/\/clients\/[0-9a-f-]{36}\?created=1/);
const clientUrl = page.url().split("?")[0];
await check(seen(page.getByRole("heading", { name: biz })), "detail heading shows business name");
await check(seen(page.getByText("Client created.")), "created flash");

// ---------- Persisted values ----------
await page.goto(clientUrl);
await check((await val("Business name *")) === biz, "business name persisted");
await check((await val("ABN")) === "51 824 753 556", "ABN normalised + persisted");
await check((await val("Email")) === "e2e@example.com", "email lower-cased");
await check((await page.getByLabel("Source").inputValue()) === "Website", "source persisted");
await check((await val("Invoice due (days)")) === "14", "invoice days persisted");

// ---------- Edit ----------
await page.getByLabel("Mobile").fill("0499 888 777");
await page.getByRole("button", { name: "Save changes" }).click();
await check(page.getByText("Client saved.").waitFor().then(() => true), "save confirmation");
await page.reload();
await check((await val("Mobile")) === "0499 888 777", "edited mobile persisted");

// ---------- Additional contacts ----------
await page.getByRole("button", { name: "+ Add contact" }).click();
const addDlg = page.getByRole("dialog", { name: "Add contact" });
await addDlg.getByLabel("Name *").fill("Sam Partner");
await addDlg.getByLabel("Role").fill("Partner");
await addDlg.getByLabel("Email").fill("sam@example.com");
await addDlg.getByRole("button", { name: "Add contact" }).click();
await check(addDlg.waitFor({ state: "detached" }).then(() => true), "add contact modal closes");
await check(seen(page.locator('[data-contact="Sam Partner"]')), "contact listed");
await page.getByRole("button", { name: "+ Add contact" }).click();
const addDlg2 = page.getByRole("dialog", { name: "Add contact" });
await addDlg2.getByLabel("Name *").fill("Alex Site");
await addDlg2.getByRole("button", { name: "Add contact" }).click();
await addDlg2.waitFor({ state: "detached" });
const sam = page.locator('[data-contact="Sam Partner"]');
await sam.getByRole("button", { name: "Make primary" }).click();
await check(sam.getByText("Primary").waitFor().then(() => true), "make primary");
await sam.getByRole("button", { name: "Edit" }).click();
const editDlg = page.getByRole("dialog", { name: "Edit contact" });
await editDlg.getByLabel("Role").fill("Co-owner");
await editDlg.getByRole("button", { name: "Save contact" }).click();
await editDlg.waitFor({ state: "detached" });
await page.reload();
await check(seen(page.locator('[data-contact="Sam Partner"]').getByText("Co-owner")), "contact edit persisted");
await check(seen(page.locator('[data-contact="Sam Partner"]').getByText("Primary")), "primary persisted");
const alex = page.locator('[data-contact="Alex Site"]');
await alex.getByRole("button", { name: "Remove" }).click();
await alex.getByRole("button", { name: "Remove?" }).click();
await check(alex.waitFor({ state: "detached" }).then(() => true), "contact removed");

// ---------- Tabs ----------
await page.getByRole("link", { name: "Estimates (0)" }).click();
await check(seen(page.getByText("No estimates for this client")), "estimates tab empty state");
await page.getByRole("link", { name: "Jobs (0)" }).click();
await check(seen(page.getByText("No jobs for this client")), "jobs tab empty state");
await page.getByRole("link", { name: "Notes & files" }).click();
await page.getByPlaceholder("Write a note…").fill("Prefers email after 5pm");
await page.getByRole("button", { name: "Add note" }).click();
await check(page.getByText("Prefers email after 5pm").waitFor().then(() => true), "note added on client");

// ---------- Search / sort / archive ----------
await page.goto(base + "/clients");
await page.getByLabel("Search clients").fill(`builders ${stamp}`);
await page.getByRole("button", { name: "Search" }).click();
await page.waitForURL(/q=/);
await check(seen(page.getByRole("link", { name: biz })), "search finds client");
await check((await page.getByRole("link", { name: "(sample) Jordan Lee" }).count()) === 0, "search excludes others");
await page.goto(base + "/clients?sort=name&dir=desc");
await check(seen(page.locator("th[aria-sort=descending]")), "sort desc indicator");

await page.goto(clientUrl);
await page.getByRole("button", { name: "Archive" }).click();
await check(page.getByText("Archived", { exact: true }).first().waitFor().then(() => true), "archived badge");
await page.goto(base + "/clients");
await check((await page.getByRole("link", { name: biz }).count()) === 0, "archived hidden from list");
await page.getByRole("link", { name: "Show archived" }).click();
await check(page.getByRole("link", { name: biz }).waitFor().then(() => true), "show archived lists it");
await page.goto(clientUrl);
await page.getByRole("button", { name: "Restore client" }).click();
await check(page.getByRole("button", { name: "Archive" }).waitFor().then(() => true), "restored");

// ---------- Delete blocked for referenced client ----------
await page.goto(base + "/clients");
await page.getByRole("link", { name: "(sample) Jordan Lee" }).click();
await check(seen(page.getByText(/can't be deleted because 1 estimate/)), "delete blocked with explanation");
await page.getByRole("link", { name: /Estimates \(1\)/ }).click();
await check(seen(page.getByRole("link", { name: "[SAMPLE] Bathroom renovation" })), "client's estimate listed");

// ---------- Quick add ----------
await page.goto(base + "/clients");
await page.getByRole("button", { name: "Quick add" }).click();
const qd = page.getByRole("dialog", { name: "Quick add client" });
await qd.getByRole("button", { name: "Add client" }).click();
await check(seen(qd.getByText("Enter the client's name.")), "quick add validation");
await qd.getByLabel("Full name *").fill(`Quick ${stamp}`);
await qd.getByLabel("Mobile").fill("0400 123 123");
await qd.getByRole("button", { name: "Add client" }).click();
await page.waitForURL(/clientId=/);
await check(seen(page.locator("tr.bg-brand-50").getByRole("link", { name: `Quick ${stamp}` })), "quick-added client highlighted via ?clientId");

// ---------- Export ----------
const exp = await page.request.get(base + "/api/export/clients");
const expText = await exp.text();
await check(exp.headers()["content-type"].includes("text/csv") && expText.includes(biz) && expText.includes("Business name"), "client CSV export");

// ---------- Import ----------
await page.goto(base + "/clients/import");
await page.getByLabel("CSV data").fill(`Client Name,E-mail,Suburb,Company\nImp One ${stamp},one@example.com,Ascot,\nImp Two ${stamp},two@example.com,Hamilton,Two Co\n,bad,,`);
await page.getByRole("button", { name: "Read pasted data" }).click();
await check((await page.getByLabel("Map column Suburb").inputValue()) === "cityTown", "header auto-mapped");
await check((await page.getByRole("table", { name: "Import preview" }).locator("tbody tr").count()) === 3, "preview rows");
await page.getByRole("button", { name: "Import 2 clients" }).click();
await check(page.getByText("Imported 2 clients").waitFor().then(() => true), "import result");
await page.goto(base + `/clients?q=${stamp}`);
await check(seen(page.getByRole("link", { name: "Two Co" })), "imported business client listed");
await check(seen(page.getByRole("link", { name: `Imp One ${stamp}` })), "imported person client listed");

// ---------- Delete ----------
await page.goto(clientUrl);
await page.getByRole("button", { name: "Delete client" }).click();
await page.getByRole("button", { name: "Yes, delete client" }).click();
await page.waitForURL(/deleted=1/);
await check((await page.getByRole("link", { name: biz }).count()) === 0, "client deleted");

// ================= Suppliers & trades =================
console.log("Suppliers & trades");
const sup = `E2E Sparky ${stamp}`;
const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
await page.goto(base + "/contacts");
await check(seen(page.getByRole("heading", { name: "Suppliers & trades" })), "contacts heading");
await page.getByRole("link", { name: "New contact" }).click();
await page.waitForURL(/\/contacts\/new/);
await page.getByLabel("Rating").selectOption("4");
await page.getByLabel("Email").fill("nope");
await page.getByRole("button", { name: "Create contact" }).click();
await check(seen(page.getByText("Enter a name or business name.")), "contact name required");
await check(seen(page.getByText("Enter a valid email address.")), "contact email validation");
await page.getByLabel("Name *").fill(sup);
await page.getByLabel("Email").fill("spark@example.com");
await page.getByLabel("Contact type").selectOption("Subcontractor");
await page.getByLabel("Trade").fill("Electrician");
await page.getByLabel("Electrical").check();
await page.getByLabel("Roofing").check();
await page.getByLabel("Insurance expiry").fill(soon);
await page.getByLabel("Payment terms (days)").fill("14");
await page.getByLabel("Account number").fill("ACC-99");
await page.getByLabel("Licence number").fill("LIC-123");
await page.getByRole("button", { name: "Create contact" }).click();
await page.waitForURL(/\/contacts\/[0-9a-f-]{36}\?created=1/);
const supUrl = page.url().split("?")[0];
await check(seen(page.getByText("Insurance: Expires in 10 days")), "insurance warning badge");
await page.reload();
await check((await page.getByLabel("Rating").inputValue()) === "4", "rating persisted");
await check(page.getByLabel("Electrical").isChecked(), "group Electrical persisted");
await check(page.getByLabel("Roofing").isChecked(), "group Roofing persisted");
await check((await page.getByLabel("Insurance expiry").inputValue()) === soon, "insurance expiry persisted");
await check((await page.getByLabel("Account number").inputValue()) === "ACC-99", "account number persisted");

await page.getByLabel("Trade").fill("Electrical contractor");
await page.getByLabel("Roofing").uncheck();
await page.getByRole("button", { name: "Save changes" }).click();
await check(page.getByText("Contact saved.").waitFor().then(() => true), "contact saved");
await page.reload();
await check((await page.getByLabel("Trade").inputValue()) === "Electrical contractor", "trade edit persisted");
await check(!(await page.getByLabel("Roofing").isChecked()), "group removal persisted");

await page.getByRole("link", { name: "Orders (0)" }).click();
await check(seen(page.getByText("No purchase orders yet")), "orders tab empty state");
await page.getByRole("link", { name: "Notes & files" }).click();
await page.getByPlaceholder("Write a note…").fill("Good on switchboards");
await page.getByRole("button", { name: "Add note" }).click();
await check(page.getByText("Good on switchboards").waitFor().then(() => true), "note added on contact");

// Filters
await page.goto(base + "/contacts?group=Electrical");
await check(seen(page.getByRole("link", { name: sup })), "group filter includes");
await page.goto(base + "/contacts?group=Plumbing");
await check((await page.getByRole("link", { name: sup }).count()) === 0, "group filter excludes");
await page.goto(base + "/contacts?type=Supplier");
await check((await page.getByRole("link", { name: sup }).count()) === 0, "type filter excludes");
await page.goto(base + "/contacts");
await page.getByRole("link", { name: "Review" }).click();
await check(page.getByRole("link", { name: sup }).waitFor().then(() => true), "insurance attention filter");
await check(seen(page.locator('[data-insurance="expiring"]').first()), "list warning badge");

// Export + import
const cexp = await (await page.request.get(base + "/api/export/contacts")).text();
await check(cexp.includes(sup) && cexp.includes("Electrical"), "contacts CSV export");
await page.goto(base + "/contacts/import");
await page.getByRole("button", { name: "Use example data" }).click();
await check((await page.getByLabel("Map column Insurance expiry").inputValue()) === "insuranceExpiry", "contacts header auto-mapped");
await page.getByRole("button", { name: "Import 2 contacts" }).click();
await check(page.getByText("Imported 2 contacts").waitFor().then(() => true), "contacts import result");
await page.goto(base + "/contacts?q=Coastal");
await check(seen(page.getByRole("link", { name: "Coastal Roofing" }).first()), "imported contact listed");

// Archive + delete
await page.goto(supUrl);
await page.getByRole("button", { name: "Archive" }).click();
await check(page.getByRole("button", { name: "Restore contact" }).waitFor().then(() => true), "contact archived");
await page.getByRole("button", { name: "Delete contact" }).click();
await page.getByRole("button", { name: "Yes, delete contact" }).click();
await page.waitForURL(/deleted=1/);
await check((await page.getByRole("link", { name: sup }).count()) === 0, "contact deleted");

// Mobile layout: no horizontal page overflow
await page.setViewportSize({ width: 390, height: 800 });
await page.goto(base + "/contacts");
await check(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "contacts list fits mobile width");
await page.goto(base + "/clients");
await check(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "clients list fits mobile width");

await done();
