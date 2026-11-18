// E2E: Catalogues module. Run: BASE_URL=http://localhost:3108 node e2e/catalogues.e2e.mjs
import { start, check, done } from "./helpers.mjs";

const { page, base } = await start();
// Sidebar <Link>s prefetch other modules' routes, which only exist once all modules are merged.
// In an isolated worktree those prefetches 404, so point them at /dashboard (they are never navigated to).
const OTHER = /^\/(leads|estimates|schedule|jobs|orders|invoices|clients|contacts|reminders|settings)(\/|$)/;
await page.route((u) => OTHER.test(u.pathname) && u.searchParams.has("_rsc"), async (route) => {
  const res = await route.fetch();
  if (res.status() !== 404) return route.fulfill({ response: res });
  const u = new URL(route.request().url());
  return route.continue({ url: `${u.origin}/dashboard${u.search}` });
});
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const NAME = `E2E Timber ${tag}`;
const posted = () => page.waitForResponse((r) => r.request().method() === "POST" && r.status() < 400);
const row = (desc) => page.locator('[data-testid="item-row"]').filter({ has: page.locator(`input[aria-label="Description"][value="${desc}"]`) });
const vis = (l) => l.first().waitFor({ state: "visible", timeout: 10000 }).then(() => true);
const countIs = (l, n) => l.nth(Math.max(0, n - 1)).waitFor({ timeout: 10000 }).then(() => l.count()).then((c) => c === n);
const settle = async () => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(300); };

console.log("Catalogue list + create");
await page.goto(base + "/catalogues");
await check(vis(page.getByRole("heading", { name: "Catalogues", exact: true })), "catalogues heading");
await check(vis(page.getByText("My Price List").first()), "seed catalogue listed");
await page.getByRole("button", { name: "+ New catalogue" }).click();
await page.getByRole("button", { name: "Create catalogue" }).click();
await check(vis(page.getByText("Name is required")), "validation: name required");
await page.locator('input[name="name"]').fill(NAME);
await page.locator('input[name="shortCode"]').fill("e2e");
await page.locator('input[name="effectiveDate"]').fill("2026-01-01");
await page.locator('input[name="expiryDate"]').fill("2025-01-01");
await page.getByRole("button", { name: "Create catalogue" }).click();
await check(vis(page.getByText("Expiry must be on or after")), "validation: expiry after effective");
await page.locator('input[name="expiryDate"]').fill("2027-06-30");
await page.getByRole("button", { name: "Create catalogue" }).click();
await page.waitForURL(/\/catalogues\/[0-9a-f-]{36}/);
const catUrl = page.url().split("?")[0];
const catId = catUrl.split("/").pop();
await check(vis(page.getByRole("heading", { name: NAME })), "detail page heading");
await check(vis(page.getByText("E2E", { exact: true })), "short code uppercased");
await check(vis(page.getByText("This catalogue is empty")), "empty state");

console.log("Categories");
await page.getByLabel("New category name", { exact: true }).fill("Framing");
await page.getByRole("button", { name: "Add", exact: true }).first().click();
await page.locator('[data-testid="category-item"]', { hasText: "Framing" }).waitFor();
await page.getByLabel("New category name", { exact: true }).fill("Roofing");
await page.locator("aside").getByRole("button", { name: "Add", exact: true }).click();
await page.locator('[data-testid="category-item"]', { hasText: "Roofing" }).waitFor();
await page.getByLabel("New category name", { exact: true }).fill("Walls");
await page.getByLabel("Parent category", { exact: true }).selectOption({ label: "Inside Framing" });
await page.locator("aside").getByRole("button", { name: "Add", exact: true }).click();
await page.locator('[data-testid="category-item"]', { hasText: "Walls" }).waitFor();
await check(vis(page.locator('[data-testid="category-item"].ml-4', { hasText: "Walls" })), "Walls nested under Framing");
// rename Roofing -> Roof & cladding
await page.locator('[data-testid="category-item"]', { hasText: "Roofing" }).hover();
await page.getByLabel("Rename Roofing", { exact: true }).click();
await page.getByLabel("Category name", { exact: true }).fill("Roof & cladding");
await page.getByLabel("Category name", { exact: true }).press("Enter");
await page.locator('[data-testid="category-item"]', { hasText: "Roof & cladding" }).waitFor();
await check(vis(page.locator('[data-testid="category-item"]', { hasText: "Roof & cladding" })), "category renamed");
// move Roof up above Framing
await page.locator('[data-testid="category-item"]', { hasText: "Roof & cladding" }).hover();
await page.getByLabel("Move Roof & cladding up", { exact: true }).click();
await page.waitForFunction(() => document.querySelector('[data-testid="category-item"]')?.textContent?.includes("Roof"));
await check(page.locator('[data-testid="category-item"]').first().textContent().then((t) => t.includes("Roof")), "category reordered");

console.log("Items: add, inline edit");
await page.getByRole("link", { name: "All items" }).click();
await settle();
async function addItem(code, desc, type, uom, cost) {
  await page.getByLabel("New item code", { exact: true }).fill(code);
  await page.getByLabel("New item description", { exact: true }).fill(desc);
  await page.getByLabel("New item cost type", { exact: true }).selectOption(type);
  await page.getByLabel("New item unit", { exact: true }).fill(uom);
  await page.getByLabel("New item unit cost", { exact: true }).fill(String(cost));
  await page.getByLabel("New item unit cost", { exact: true }).press("Enter");
  await row(desc).waitFor();
}
await addItem(`P-${tag}`, "Pine stud", "Material", "lm", 5);
await addItem(`L-${tag}`, "Carpenter hour", "Labour", "hr", 80);
await check(vis(row("Pine stud")), "item added (Pine stud)");
await check(row("Carpenter hour").locator('select[aria-label="Cost type"]').inputValue().then((v) => v === "Labour"), "cost type saved");
// add-row validation
await page.getByLabel("New item description", { exact: true }).fill("");
await page.getByRole("button", { name: "Add", exact: true }).last().click();
await check(vis(page.getByText("Enter a description for the new item")), "validation: add row needs description");

const cost = row("Pine stud").getByLabel("Unit cost", { exact: true });
await cost.fill("6");
let p = posted();
await cost.press("Enter");
await p;
await settle();
await page.reload();
await check(row("Pine stud").getByLabel("Unit cost", { exact: true }).inputValue().then((v) => Number(v) === 6), "inline unit cost persisted");
const desc = row("Pine stud").getByLabel("Description", { exact: true });
await desc.fill("Pine stud 90x45");
p = posted();
await desc.press("Enter");
await p;
await settle();
await page.reload();
await check(vis(row("Pine stud 90x45")), "inline description persisted");

console.log("Search, filter, sort");
await page.getByLabel("Search items", { exact: true }).fill("carpenter");
await page.waitForURL(/q=carpenter/);
await settle();
await check(page.locator('[data-testid="item-row"]').count().then((n) => n === 1), "search narrows to 1");
await page.getByLabel("Search items", { exact: true }).fill("");
await page.waitForURL((u) => !u.search.includes("q="));
await page.getByLabel("Filter by cost type", { exact: true }).selectOption("Labour");
await page.waitForURL(/type=Labour/);
await settle();
await check(page.locator('[data-testid="item-row"]').count().then((n) => n === 1), "cost type filter");
await page.goto(catUrl + "?sort=cost&dir=desc");
await check(page.locator('[data-testid="item-row"] input[aria-label="Description"]').first().inputValue().then((v) => v === "Carpenter hour"), "sort by cost desc");

console.log("Bulk actions");
await page.goto(catUrl);
await page.getByLabel("Select all on this page", { exact: true }).check();
await check(vis(page.getByTestId("bulk-bar").getByText("2 selected")), "bulk bar shows selection");
await page.getByLabel("Adjust price by percent", { exact: true }).fill("10");
p = posted();
await page.getByRole("button", { name: "Adjust prices" }).click();
await p;
await page.getByText("Adjusted 2 prices by +10%").waitFor();
await page.reload();
await check(row("Pine stud 90x45").getByLabel("Unit cost", { exact: true }).inputValue().then((v) => Number(v) === 6.6), "+10% on 6 → 6.60");
await check(row("Carpenter hour").getByLabel("Unit cost", { exact: true }).inputValue().then((v) => Number(v) === 88), "+10% on 80 → 88");
await row("Pine stud 90x45").getByRole("checkbox").check();
p = posted();
await page.getByLabel("Move to category", { exact: true }).selectOption({ label: "— Walls" });
await p;
await settle();
await page.locator('[data-testid="category-item"]', { hasText: "Walls" }).getByRole("link").click();
await settle();
await check(vis(row("Pine stud 90x45")), "bulk move to Walls");
await page.locator('[data-testid="category-item"]', { hasText: "Framing" }).first().getByRole("link").click();
await settle();
await check(vis(row("Pine stud 90x45")), "parent category includes child items");

console.log("Recipes");
await page.goto(catUrl);
await addItem(`W-${tag}`, "Wall frame per m2", "Other", "m2", 0);
await row("Wall frame per m2").getByRole("button", { name: /^Open/ }).click();
const drawer = page.getByRole("dialog", { name: "Item details" });
await drawer.getByText("Recipe (assembly)").click();
await drawer.getByLabel("Search components", { exact: true }).fill(`P-${tag}`);
await drawer.getByRole("option", { name: new RegExp(`P-${tag}`) }).click();
await drawer.getByLabel("Search components", { exact: true }).fill(`L-${tag}`);
await drawer.getByRole("option", { name: new RegExp(`L-${tag}`) }).click();
await check(drawer.getByTestId("recipe-line").count().then((n) => n === 2), "two components added");
await drawer.getByLabel("Quantity per unit", { exact: true }).first().fill("[M1]");
await check(vis(drawer.getByText("Only [Q] can be referenced")), "invalid formula flagged live");
await drawer.getByLabel("Quantity per unit", { exact: true }).first().fill("2");
await drawer.getByLabel("Quantity per unit", { exact: true }).nth(1).fill("1/2");
await check(drawer.getByTestId("recipe-total").textContent().then((t) => t.includes("57.20")), "live recipe total 2×6.60 + 0.5×88 = 57.20");
await drawer.getByLabel("Search components", { exact: true }).fill("Nails");
await drawer.getByRole("button", { name: /as a free-text line/ }).click();
await drawer.getByLabel("Component unit cost", { exact: true }).fill("3");
await drawer.getByLabel("Quantity per unit", { exact: true }).nth(2).fill("ceil(0.2)");
await check(drawer.getByTestId("recipe-total").textContent().then((t) => t.includes("60.20")), "free-text line adds 1×3");
await drawer.getByLabel("Details", { exact: true }).fill("Includes studs, plates and labour.");
p = posted();
await drawer.getByRole("button", { name: "Save item" }).click();
await drawer.waitFor({ state: "detached" });
await settle();
await page.reload();
await check(row("Wall frame per m2").getByRole("button", { name: "Unit cost (from recipe)" }).textContent().then((t) => t.includes("60.20")), "recipe unit cost saved to item");
await row("Wall frame per m2").getByRole("button", { name: /^Open/ }).click();
await check(countIs(drawer.getByTestId("recipe-line"), 3), "recipe lines persisted");
await check(drawer.getByLabel("Details", { exact: true }).inputValue().then((v) => v.startsWith("Includes studs")), "details persisted");
await drawer.getByRole("button", { name: "Close" }).click();

console.log("CSV import");
await page.goto(catUrl + "/import");
await check(vis(page.getByRole("heading", { name: "Import items" })), "import page");
const csv = [
  "SKU,Product Name,Type,Unit,Price ex GST,Group",
  `P-${tag},Pine stud 90x45,Material,lm,$7.00,`,
  `N-${tag},Colorbond sheet,Material,m2,32.5,Roof & cladding > Sheeting`,
  `X-${tag},Bad row,Material,ea,abc,`,
  `,,Material,ea,1,`,
].join("\n");
await page.getByLabel("…or paste CSV", { exact: true }).fill(csv);
await page.getByRole("button", { name: "Next: map columns" }).click();
await check(page.getByLabel("Column for Unit cost", { exact: true }).inputValue().then((v) => v === "4"), "auto-detect: unit cost column");
await check(page.getByLabel("Column for Category", { exact: true }).inputValue().then((v) => v === "5"), "auto-detect: category column");
await check(vis(page.getByTestId("import-preview").getByText("Skip: Unit cost \"abc\" is not a number")), "preview shows skip reason");
await page.getByRole("button", { name: /^Import 2 rows/ }).click();
const rep = page.getByTestId("import-report");
await rep.waitFor();
await check(rep.textContent().then((t) => /Added1/.test(t) && /Updated1/.test(t) && /Skipped2/.test(t)), "report: 1 added, 1 updated, 2 skipped");
await page.getByRole("link", { name: "Back to catalogue" }).click();
await page.waitForURL(catUrl);
await settle();
await check(row("Pine stud 90x45").getByLabel("Unit cost", { exact: true }).inputValue().then((v) => Number(v) === 7), "import updated matched item");
await check(vis(row("Colorbond sheet")), "import inserted new item");
await check(vis(page.locator('[data-testid="category-item"].ml-4', { hasText: "Sheeting" })), "import created nested category");
await check(row("Wall frame per m2").getByRole("button", { name: "Unit cost (from recipe)" }).textContent().then((t) => t.includes("61.00")), "component price change flowed into recipe (2×7 + 0.5×88 + 3)");

console.log("CSV export");
const res = await page.request.get(`${base}/api/export/catalogues/${catId}`);
const body = await res.text();
await check(res.ok() && res.headers()["content-type"].includes("text/csv"), "export returns CSV");
await check(body.includes(`N-${tag},Colorbond sheet,Material,m2,32.5,Roof & cladding > Sheeting`), "export row with category path");
await check(body.includes("Wall frame per m2") && body.includes(",Yes"), "export flags recipe");

console.log("Delete category + item");
await page.locator('[data-testid="category-item"]', { hasText: "Walls" }).hover();
await page.getByLabel("Delete Walls", { exact: true }).click();
p = posted();
await page.locator('[data-testid="category-item"]', { hasText: "Walls" }).getByRole("button", { name: "Delete" }).click();
await p;
await settle();
await page.getByRole("link", { name: /^Uncategorised/ }).click();
await settle();
await check(vis(row("Pine stud 90x45")), "deleted category's items become uncategorised");
await page.goto(catUrl);
await row("Colorbond sheet").getByRole("checkbox").check();
await page.getByTestId("bulk-bar").getByRole("button", { name: "Delete", exact: true }).click();
p = posted();
await page.getByRole("button", { name: "Delete 1 items?" }).click();
await p;
await settle();
await page.reload();
await check(row("Colorbond sheet").count().then((n) => n === 0), "bulk delete removed item");

console.log("Edit, duplicate, delete catalogue");
await page.getByRole("button", { name: "Edit details" }).click();
await page.locator('input[name="name"]').fill(NAME + " v2");
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByRole("heading", { name: NAME + " v2" }).waitFor();
await page.reload();
await check(vis(page.getByRole("heading", { name: NAME + " v2" })), "catalogue edit persisted");
await page.getByRole("button", { name: "Duplicate" }).click();
await page.waitForURL((u) => !u.pathname.endsWith(catId) && /\/catalogues\/[0-9a-f-]{36}$/.test(u.pathname));
await check(vis(page.getByRole("heading", { name: `${NAME} v2 (copy)` })), "duplicate created");
await check(vis(row("Wall frame per m2")), "duplicate copied items");
await row("Wall frame per m2").getByRole("button", { name: /^Open/ }).click();
await check(countIs(drawer.getByTestId("recipe-line"), 3), "duplicate copied recipe lines");
await drawer.getByRole("button", { name: "Close" }).click();
await page.getByRole("button", { name: "Delete", exact: true }).click();
await page.getByRole("button", { name: /Delete with \d+ items\?/ }).click();
await page.waitForURL(base + "/catalogues");
await page.goto(base + "/catalogues");
const listRow = page.locator('[data-testid="catalogue-row"]', { hasText: NAME + " v2" });
await check(listRow.count().then((n) => n === 1), "copy deleted, original remains");
await listRow.getByRole("button", { name: "Delete" }).click();
p = posted();
await listRow.getByRole("button", { name: /Delete with/ }).click();
await p;
await settle();
await page.reload();
await check(page.locator('[data-testid="catalogue-row"]', { hasText: NAME }).count().then((n) => n === 0), "catalogue deleted from list");

await done();
