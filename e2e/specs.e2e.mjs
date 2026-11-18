// E2E: Specifications organised by costing category.
// Flag items in Costings → Sync → items appear under their category's section; per-item detail + image;
// include/remove items from the spec tab; Match costings order; search; export (print + markdown);
// quote preview renders the structure.
// Run: BASE_URL=http://localhost:3000 node e2e/specs.e2e.mjs   (needs seeded DB: npm run db:reset)
import { start, check, done, one, all, RUN, cloneEstimate, purgeEstimate } from "./helpers.mjs";

const sample = await one("select id from estimates where name = '[SAMPLE] Bathroom renovation' and is_sample = 1");
if (!sample) throw new Error("Sample estimate missing - run npm run db:reset");
const E = await cloneEstimate(sample.id, { name: `E2E specs ${RUN}`, number: `QE2E-S${RUN}` });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const { page, base } = await start();
const seen = (loc, timeout = 8000) => loc.waitFor({ timeout }).then(() => true);
const item = (desc) => one("select id, show_in_specification as s from estimate_items where estimate_id = ? and description = ?", [E, desc]);
const cat = (desc) => one("select id from estimate_items where estimate_id = ? and kind = 'category' and description = ?", [E, desc]);
const specRows = () => all("select heading, category_item_id as cat, sort_order from specifications where estimate_id = ? and parent_id is null order by sort_order", [E]);
const section = (name) => page.getByTestId("spec-section").filter({ has: page.getByTestId("spec-linked").filter({ hasText: `Costings: ${name}` }) });

try {
  console.log("Costings: flag items for the specification");
  await page.goto(`${base}/estimates/${E}/costings`);
  const saved = () => page.getByTestId("save-state").filter({ hasText: "All changes saved" }).waitFor();
  for (const desc of ["Skip bin 6m3", "Plumber fit-off", "Waterproofing membrane (licensed)"]) {
    await page.getByTestId(`row-${(await item(desc)).id}`).getByRole("button", { name: /Row actions/ }).click();
    await page.getByRole("menu", { name: "Row actions" }).getByRole("menuitem", { name: /Show in specification/ }).click();
    await page.waitForTimeout(150);
    await saved();
  }
  await check(Number((await item("Skip bin 6m3")).s) === 1 && Number((await item("Plumber fit-off")).s) === 1, "spec flags persisted from costings");

  console.log("Specifications tab: sync with costings");
  await page.goto(`${base}/estimates/${E}/specifications`);
  await page.waitForLoadState("load");
  await check(seen(page.getByTestId("spec-notice").getByText("3 costing categories have specification items")), "missing-category notice");
  await check(seen(page.getByTestId("spec-inclusions").getByText("Skip bin 6m3")), "unplaced items listed before sync");
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByLabel("Section heading").fill("General");
  await page.getByLabel("Section body").fill("All work to comply with the NCC.");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Sync with costings" }).first().click();
  await check(seen(page.getByText("Added 3 costing categories")), "sync reports 3 added");
  await check((await page.getByTestId("spec-section").count()) === 4, "4 sections after sync");
  await check(seen(section("Demolition").getByTestId("spec-linked").getByText("Costings: Demolition")), "Demolition section linked");
  await check(seen(section("Demolition").getByTestId("spec-item").filter({ hasText: "Skip bin 6m3" }).getByText("2.1", { exact: true })), "flagged item listed under its category (2.1)");
  await check(!(await section("Demolition").getByTestId("spec-item").filter({ hasText: "Strip out existing bathroom" }).count()), "unflagged item not listed");
  await page.getByTestId("spec-save").click();
  await page.getByTestId("spec-saved").waitFor();
  let rows = await specRows();
  const demo = await cat("Demolition"), water = await cat("Waterproofing & tiling"), fix = await cat("Fixtures");
  await check(rows.length === 4 && rows[0].cat === null && rows[1].cat === demo.id && rows[2].cat === water.id && rows[3].cat === fix.id, "linked sections persisted with category ids");

  console.log("Per-item detail + image");
  const skip = section("Demolition").getByTestId("spec-item").filter({ hasText: "Skip bin 6m3" });
  await skip.getByRole("button", { name: "Add detail" }).click();
  await skip.getByLabel("Specification detail").fill("6m3 **mixed waste** bin, swapped weekly");
  await skip.getByLabel("Item image").setInputFiles({ name: "bin.png", mimeType: "image/png", buffer: PNG });
  await check(seen(skip.getByRole("button", { name: "Remove image" })), "image preview shown");
  await skip.getByRole("button", { name: "Save detail" }).click();
  await check(seen(skip.getByText("mixed waste")), "detail rendered after save");
  const skipId = (await item("Skip bin 6m3")).id;
  let det = null;
  for (let i = 0; i < 20 && !det?.img; i++) {
    det = await one("select body, image_data_url as img from spec_item_details where estimate_item_id = ?", [skipId]);
    if (!det?.img) await page.waitForTimeout(250);
  }
  await check(det?.body?.includes("mixed waste") && String(det?.img).startsWith("data:image/png;base64,"), "detail + image persisted");
  await check(seen(skip.locator("img")), "stored image displayed");
  const imgOk = await page.evaluate(async (src) => (await fetch(src)).headers.get("content-type"), await skip.locator("img").getAttribute("src"));
  await check(imgOk === "image/png", "image served by route");

  console.log("Include / remove items from the spec tab");
  await section("Fixtures").getByRole("button", { name: "Remove Plumber fit-off from specifications" }).click();
  await check(seen(section("Fixtures").getByText("No items from this category are included yet.")), "item removed from section");
  await check(Number((await item("Plumber fit-off")).s) === 0, "remove clears showInSpecification");
  await section("Fixtures").getByText(/Add costing items/).click();
  await section("Fixtures").getByRole("button", { name: "Include Electrical (exhaust fan, lights) in specifications" }).click();
  await check(seen(section("Fixtures").getByTestId("spec-item").filter({ hasText: "Electrical (exhaust fan, lights)" })), "included item appears");
  await check(Number((await item("Electrical (exhaust fan, lights)")).s) === 1, "include sets showInSpecification");

  console.log("Match costings order");
  const fixturesNode = page.getByTestId("spec-node").filter({ hasText: "Costings: Fixtures" });
  await fixturesNode.getByRole("button", { name: "Move up" }).click();
  await fixturesNode.getByRole("button", { name: "Move up" }).click();
  await check(seen(fixturesNode.getByText("2", { exact: true })), "Fixtures moved to 2");
  await page.getByTestId("spec-save").click();
  await page.getByTestId("spec-saved").waitFor();
  await check((await specRows())[1].heading === "Fixtures", "out-of-order sections saved");
  await page.getByRole("button", { name: "Match costings order" }).click();
  await check(seen(page.getByText("Sections reordered to match costings")), "match order notice");
  await page.getByTestId("spec-save").click();
  await page.getByTestId("spec-saved").waitFor();
  rows = await specRows();
  await check(rows.map((r) => r.heading).join("|") === "General|Demolition|Waterproofing & tiling|Fixtures", `costings order restored, custom stays first (${rows.map((r) => r.heading).join(", ")})`);

  console.log("Search");
  await page.getByLabel("Search specifications").fill("mixed waste");
  await check((await page.getByTestId("spec-section").count()) === 1, "search filters to one section");
  await check(seen(section("Demolition").getByText("Skip bin 6m3")), "matching item shown");
  await page.getByLabel("Search specifications").fill("");
  await check((await page.getByTestId("spec-section").count()) === 4, "clearing search shows all");

  console.log("Persisted after reload");
  await page.reload();
  await page.waitForLoadState("load");
  await check(seen(section("Demolition").getByText("mixed waste")), "detail persisted after reload");
  await check(!(await page.getByTestId("spec-notice").count()), "no missing-category notice once synced");

  console.log("Export");
  await page.getByRole("button", { name: "Export" }).click();
  await check(seen(page.getByRole("dialog").getByRole("link", { name: "Print / PDF" })), "export menu offers print");
  await page.keyboard.press("Escape");
  const md = await page.request.get(`${base}/estimates/${E}/specifications/export`);
  const text = await md.text();
  await check(md.status() === 200 && /attachment; filename="specification-.*\.md"/.test(md.headers()["content-disposition"] ?? ""), "markdown download headers");
  await check(text.includes("## 1 General") && text.includes("## 2 Demolition") && text.includes("### 2.1 Skip bin 6m3") && text.includes("mixed waste"), "markdown structure");
  await check(!text.includes("Inclusions"), "no leftover Inclusions in markdown");
  await page.addInitScript(() => { window.print = () => { window.__printed = true; }; });
  await page.goto(`${base}/estimates/${E}/specifications/print`);
  const sheet = page.getByTestId("spec-print");
  await check(seen(sheet.getByText("Demolition")), "print page renders sections");
  await check(seen(sheet.getByTestId("spec-doc-item").filter({ hasText: "Skip bin 6m3" }).locator("img")), "print page shows item image");
  await check(seen(sheet.getByText("Electrical (exhaust fan, lights)")), "print page shows included item");
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 5000 }).then(() => check(true, "print dialog opened"), () => check(false, "print dialog opened"));

  console.log("Quote preview");
  await page.goto(`${base}/estimates/${E}/quote`);
  const specs = page.getByTestId("quote-document").getByTestId("quote-specifications");
  await check(seen(specs.getByText("Waterproofing & tiling")), "quote shows category sections");
  const skipDoc = specs.getByTestId("spec-doc-item").filter({ hasText: "Skip bin 6m3" });
  await check(seen(skipDoc.getByText("2.1", { exact: true })), "quote numbers items within section");
  await check(seen(skipDoc.getByText("mixed waste")), "quote shows item detail");
  await check(seen(skipDoc.locator("img")), "quote shows item image");
  await check(!(await specs.getByTestId("spec-doc-inclusions").count()), "no fallback Inclusions when all items are placed");
  await check(!(await specs.getByText("Plumber fit-off").count()), "removed item not in quote");

  console.log("Costings reflect spec-tab toggles");
  await page.goto(`${base}/estimates/${E}/costings`);
  await check(seen(page.getByTestId(`row-${(await item("Electrical (exhaust fan, lights)")).id}`).getByText("In spec")), "costings shows In spec for item included from spec tab");
} finally {
  await purgeEstimate(E);
}
await done();
