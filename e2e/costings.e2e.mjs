// E2E for module 5 (Estimate Costings). Run: BASE_URL=http://localhost:3105 node e2e/costings.e2e.mjs
// Uses the seeded "[SAMPLE] Bathroom renovation" estimate; adds a test recipe + measurement directly in the DB.
import { createClient } from "@libsql/client";
import { start, check, done } from "./helpers.mjs";

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
const one = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const all = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const uid = () => crypto.randomUUID();
const money = (n) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

const est = await one("select id, quote_total from estimates where name = '[SAMPLE] Bathroom renovation'");
if (!est) throw new Error("Sample estimate missing — run npm run db:reset");
const E = est.id;

// --- test fixtures (idempotent-ish: unique names per run)
const tag = Date.now().toString(36).slice(-5);
await db.execute({ sql: "delete from measurements where estimate_id = ? and code = 'M1'", args: [E] });
await db.execute({
  sql: "insert into measurements (id, estimate_id, plan_id, code, description, shape, points, colour, unit, pitch_degrees, depth_mm, height_mm, is_negative, value, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  args: [uid(), E, "e2e-plan", "M1", "E2E wall length", "line", "[]", "#2563eb", "m", 0, 0, 0, 0, 12.5, new Date().toISOString(), new Date().toISOString()],
});
const catalogue = await one("select id from catalogues limit 1");
const recipeId = uid();
const recipeName = `E2E wall recipe ${tag}`;
await db.execute({
  sql: "insert into catalogue_items (id, catalogue_id, item_code, description, cost_type, uom, unit_cost, is_recipe, archived, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?)",
  args: [recipeId, catalogue.id, `RC-${tag}`, recipeName, "Material", "m2", 0, 1, 0, new Date().toISOString(), new Date().toISOString()],
});
await db.execute({
  sql: "insert into catalogue_recipe_lines (id, recipe_item_id, component_item_id, description, cost_type, uom, quantity_expr, unit_cost, sort_order) values (?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?)",
  args: [uid(), recipeId, null, "Plasterboard sheet", "Material", "sheet", "0.5", 20, 1, uid(), recipeId, null, "Fixing labour", "Labour", "hr", "0.25", 80, 2],
});
// estimate with no rows for the empty state
const emptyId = uid();
await db.execute({
  sql: "insert into estimates (id, number, name, status, markup_lines, pcps_redistribution, rounding, cost_total, markup_total, tax_total, quote_total, is_template, is_sample, archived, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  args: [emptyId, `QE2E${tag}`, `E2E empty ${tag}`, "Draft", '[{"name":"Markup","percent":20}]', "none", "none", 0, 0, 0, 0, 0, 0, 0, new Date().toISOString(), new Date().toISOString()],
});

const { page, base } = await start();
// Other modules' routes (sidebar/tab links) do not exist on this isolated branch; their RSC prefetches
// would 404 and log console errors. Abort only those prefetch GETs; this module's own requests pass through.
await page.route((u) => u.searchParams.has("_rsc") && !/\/costings$|\/dashboard$/.test(u.pathname), (r) => r.abort("aborted"));
const url = `${base}/estimates/${E}/costings`;
const saved = () => page.getByTestId("save-state").filter({ hasText: "All changes saved" }).waitFor();
const settle = async () => { await page.waitForTimeout(150); await saved(); await page.waitForTimeout(150); };
const rowId = async (desc) => (await one("select id from estimate_items where estimate_id = ? and description = ?", [E, desc]))?.id;
const row = async (desc) => page.getByTestId(`row-${await rowId(desc)}`);
const storedQuote = async () => Number((await one("select quote_total from estimates where id = ?", [E])).quote_total);
const barQuote = async () => (await page.getByTestId("bar-quote").textContent()).trim();

console.log("Costings: initial render");
await page.goto(url);
await check(page.getByRole("table", { name: "Costings" }).isVisible(), "grid renders");
await check((await page.locator('tr[data-kind="category"]').count()) === 3, "three seeded categories");
await check((await barQuote()) === money(Number(est.quote_total)), `live quote total matches stored (${money(Number(est.quote_total))})`);
await check(page.getByText("2.1", { exact: true }).isVisible(), "hierarchical numbering 2.1");
await check(page.getByText("2.1.3", { exact: true }).isVisible(), "sub-item numbering 2.1.3");

console.log("Create category + item with formula");
await page.getByRole("button", { name: "+ Category" }).click();
await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
await page.keyboard.type("E2E Carpentry");
await page.keyboard.press("Enter");
await settle();
const catId = await rowId("E2E Carpentry");
await check(!!catId, "category persisted");
await page.getByTestId(`row-${catId}`).getByRole("button", { name: "+ Add item" }).click();
await page.keyboard.type("E2E stud wall");
await page.keyboard.press("Tab");
await settle();
let r = await row("E2E stud wall");
await check(!!(await rowId("E2E stud wall")), "item persisted with description");
await r.getByLabel("Quantity").fill("[M1]*2");
await r.getByLabel("Unit cost").fill("10"); // focusing unit cost blurs (commits) qty
// live preview while typing (before commit)
await check(r.getByTestId(/^total-/).filter({ hasText: "$250.00" }).isVisible(), "live total while typing = 12.5*2*10");
await page.keyboard.press("Tab");
await r.getByLabel("Unit of measure").fill("lm");
await page.keyboard.press("Tab");
await settle();
let dbRow = await one("select quantity_expr, quantity, unit_cost, uom, total from estimate_items where id = ?", [await rowId("E2E stud wall")]);
await check(dbRow.quantity_expr === "[M1]*2" && Number(dbRow.quantity) === 25 && Number(dbRow.unit_cost) === 10 && dbRow.uom === "lm" && Number(dbRow.total) === 250, "qty formula, unit cost, uom, total persisted");
await check(r.getByText("[M1]*2").isVisible(), "formula hint shown under value");

console.log("Formula error state");
await r.getByLabel("Quantity").fill("[M9]+1");
await page.keyboard.press("Tab");
await settle();
await check(r.getByRole("alert").filter({ hasText: "Unknown measurement" }).isVisible(), "formula error message shown");
await r.getByLabel("Quantity").fill("2*");
await page.getByRole("button", { name: /Measurements/ }).click();
await page.getByRole("dialog", { name: "Measurements" }).getByRole("button", { name: /\[M1\]/ }).click();
await check((await r.getByLabel("Quantity").inputValue()) === "2*[M1]", "measurement picker inserts [M1] at caret");
await page.getByRole("dialog", { name: "Measurements" }).getByRole("button", { name: "[W10]" }).click();
await check((await r.getByLabel("Quantity").inputValue()) === "2*[M1]*[W10]", "wastage helper inserts [W10]");
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Close measurements" }).click();
await settle();
dbRow = await one("select quantity, total from estimate_items where id = ?", [await rowId("E2E stud wall")]);
await check(Number(dbRow.quantity) === 27.5 && Number(dbRow.total) === 275, "measurement formula persisted (27.5 × $10)");

console.log("Markup override, taxable, PC/PS, cost type");
await r.getByLabel("Markup percent").fill("50");
await page.keyboard.press("Tab");
await settle();
await check(r.getByTestId(/^sell-/).filter({ hasText: "$412.50" }).isVisible(), "sell uses 50% item markup");
await r.getByLabel("Cost type").selectOption("Labour");
await r.getByLabel("Prime cost / provisional sum").selectOption("PS");
await r.getByLabel("Taxable").uncheck();
await settle();
dbRow = await one("select markup_percent, cost_type, allowance_type, taxable from estimate_items where id = ?", [await rowId("E2E stud wall")]);
await check(Number(dbRow.markup_percent) === 50 && dbRow.cost_type === "Labour" && dbRow.allowance_type === "PS" && Number(dbRow.taxable) === 0, "markup/type/PS/taxable persisted");

console.log("Keyboard: Ctrl+Enter adds a row below");
await r.getByLabel("Description").click();
await page.keyboard.press("Control+Enter");
await page.keyboard.type("E2E noggings");
await page.keyboard.press("Enter");
await settle();
const nog = await one("select sort_order, parent_id from estimate_items where description = 'E2E noggings' and estimate_id = ?", [E]);
await check(nog && nog.parent_id === catId && Number(nog.sort_order) === 2, "Ctrl+Enter inserted sibling below");

console.log("Row menu: sub-item, duplicate, move, indent/outdent, complete, details");
const openMenu = async (desc) => { const rr = await row(desc); await rr.getByRole("button", { name: /Row actions/ }).click(); return page.getByRole("menu", { name: "Row actions" }); };
let m = await openMenu("E2E noggings");
await m.getByRole("menuitem", { name: "Move up" }).click();
await settle();
await check(Number((await one("select sort_order from estimate_items where description='E2E noggings' and estimate_id=?", [E])).sort_order) === 1, "move up persisted");
m = await openMenu("E2E noggings");
await m.getByRole("menuitem", { name: "Move down" }).click();
await settle();
m = await openMenu("E2E noggings");
await m.getByRole("menuitem", { name: /Indent/ }).click();
await settle();
const studId = await rowId("E2E stud wall");
await check((await one("select parent_id from estimate_items where description='E2E noggings' and estimate_id=?", [E])).parent_id === studId, "indent made it a sub-item");
await check((await row("E2E stud wall")).getByText("Recipe").isVisible(), "parent shows Recipe chip and rolled-up cost");
m = await openMenu("E2E noggings");
await m.getByRole("menuitem", { name: /Outdent/ }).click();
await settle();
await check((await one("select parent_id from estimate_items where description='E2E noggings' and estimate_id=?", [E])).parent_id === catId, "outdent made it an item again");
m = await openMenu("E2E stud wall");
await m.getByRole("menuitem", { name: "Add sub-item" }).click();
await page.keyboard.type("E2E sub screws");
await page.keyboard.press("Tab");
await settle();
await check((await one("select parent_id from estimate_items where description='E2E sub screws' and estimate_id=?", [E]))?.parent_id === studId, "add sub-item persisted");
m = await openMenu("E2E stud wall");
await m.getByRole("menuitem", { name: /Duplicate/ }).click();
await settle();
await check(Number((await one("select count(*) c from estimate_items where description='E2E stud wall' and estimate_id=?", [E])).c) === 2, "duplicate copies item");
await check(Number((await one("select count(*) c from estimate_items where description='E2E sub screws' and estimate_id=?", [E])).c) === 2, "duplicate copies sub-items (subtree)");
m = await openMenu("E2E noggings");
await m.getByRole("menuitem", { name: "Mark complete" }).click();
await settle();
await check((await one("select status from estimate_items where description='E2E noggings' and estimate_id=?", [E])).status === "Complete", "mark complete persisted");
m = await openMenu("E2E noggings");
await m.getByRole("menuitem", { name: /Notes, supplier/ }).click();
const dlg = page.getByRole("dialog", { name: /Details/ });
await dlg.getByLabel("Notes").fill("Check spacing on site");
await dlg.getByLabel("Supplier").selectOption({ label: "Timber Yard Co · Supplier" });
await dlg.getByText("Show in specification").click();
await dlg.getByRole("button", { name: "Save details" }).click();
await settle();
const det = await one("select notes, supplier_id, show_in_specification from estimate_items where description='E2E noggings' and estimate_id=?", [E]);
await check(det.notes === "Check spacing on site" && !!det.supplier_id && Number(det.show_in_specification) === 1, "notes, supplier, spec flag persisted");

console.log("Delete with inline confirm");
const dupIds = (await all("select id from estimate_items where description='E2E stud wall' and estimate_id=? order by sort_order", [E])).map((x) => x.id);
await page.getByTestId(`row-${dupIds[1]}`).getByRole("button", { name: /Row actions/ }).click();
m = page.getByRole("menu", { name: "Row actions" });
await m.getByRole("menuitem", { name: /^Delete/ }).click();
await m.getByRole("menuitem", { name: /Confirm delete/ }).click();
await settle();
await check(Number((await one("select count(*) c from estimate_items where description='E2E sub screws' and estimate_id=?", [E])).c) === 1, "delete removed subtree");

console.log("Add from catalogue (recipe expands)");
await page.getByRole("button", { name: "Add from catalogue" }).first().click();
const cm = page.getByRole("dialog", { name: "Add from catalogue" });
await cm.getByLabel("Search catalogue").fill(recipeName);
await cm.getByLabel(`Select ${recipeName}`).check();
await cm.getByLabel(`Quantity for ${recipeName}`).fill("4");
await cm.getByLabel("Search catalogue").fill("Carpenter");
await cm.getByLabel("Select Carpenter").check();
await cm.getByLabel("Add to category").selectOption({ label: `4. E2E Carpentry` });
await cm.getByRole("button", { name: /^Add 2 items/ }).click();
await settle();
const rec = await one("select id, quantity, total, catalogue_item_id from estimate_items where description = ? and estimate_id = ?", [recipeName, E]);
const subs = await all("select description, quantity_expr from estimate_items where parent_id = ? order by sort_order", [rec?.id ?? ""]);
await check(rec && rec.catalogue_item_id === recipeId && Number(rec.quantity) === 4, "recipe parent inserted with catalogueItemId and qty");
await check(subs.length === 2 && subs[0].description === "Plasterboard sheet" && subs[0].quantity_expr === "0.5", "recipe lines inserted as sub-items");
await check(Number(rec.total) === 4 * (0.5 * 20 + 0.25 * 80), "recipe total = qty × Σ(parts) = $120");
await check(!!(await one("select id from estimate_items where description='Carpenter' and estimate_id=?", [E])), "plain catalogue item inserted");

console.log("Bulk actions");
const carpenter = await row("Carpenter");
await carpenter.getByRole("checkbox", { name: /Select row/ }).check();
await (await row("E2E noggings")).getByRole("checkbox", { name: /Select row/ }).check();
const bulk = page.getByRole("region", { name: "Bulk actions" });
await bulk.getByLabel("Set cost type").selectOption("Equipment");
await settle();
await check((await all("select cost_type from estimate_items where description in ('Carpenter','E2E noggings') and estimate_id=?", [E])).every((x) => x.cost_type === "Equipment"), "bulk set cost type");
await bulk.getByLabel("Bulk markup percent").fill("30");
await bulk.getByRole("button", { name: "Apply markup" }).click();
await settle();
await check((await all("select markup_percent from estimate_items where description in ('Carpenter','E2E noggings') and estimate_id=?", [E])).every((x) => Number(x.markup_percent) === 30), "bulk set markup %");
await (await row("E2E noggings")).getByRole("checkbox", { name: /Select row/ }).uncheck();
await bulk.getByLabel("Move to category").selectOption({ label: "1. Demolition" });
await settle();
const demoId = await rowId("Demolition");
await check((await one("select parent_id from estimate_items where description='Carpenter' and estimate_id=?", [E])).parent_id === demoId, "bulk move to category");
await (await row("Carpenter")).getByRole("checkbox", { name: /Select row/ }).check();
await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Delete selected…" }).click();
await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: /Confirm delete 1 row/ }).click();
await settle();
await check(!(await rowId("Carpenter")), "bulk delete");

console.log("Collapse / expand");
await page.getByRole("button", { name: "Collapse all" }).click();
await check((await page.locator('tr[data-kind="item"]').count()) === 0, "collapse all hides items");
await page.getByRole("button", { name: "Expand all" }).click();
await check((await page.locator('tr[data-kind="subitem"]').count()) > 0, "expand all shows sub-items");

console.log("Markup lines + rounding");
await page.getByRole("button", { name: "+ Add markup line" }).click();
const lineCount = await page.getByLabel(/Markup line \d+ percent/).count();
await page.getByLabel(`Markup line ${lineCount} name`).fill("Risk");
await page.getByLabel(`Markup line ${lineCount} percent`).fill("5");
await page.keyboard.press("Enter");
await settle();
const ml = JSON.parse((await one("select markup_lines from estimates where id=?", [E])).markup_lines);
await check(ml.some((l) => l.name === "Risk" && l.percent === 5), "markup line saved to estimates.markupLines");
await page.getByLabel("Quote rounding").selectOption("hundred");
await settle();
await check(Number((await storedQuote())) % 100 === 0, "rounding to $100 applied to stored quote total");

console.log("Totals match recalcEstimate after reload");
await page.reload();
await saved();
const sq = await storedQuote();
await check((await barQuote()) === money(sq), `bar quote total equals stored ${money(sq)}`);
await check((await page.getByTestId("sum-quote").textContent()).trim() === money(sq), "summary quote total equals stored");
const est2 = await one("select cost_total, markup_total, tax_total from estimates where id=?", [E]);
await check((await page.getByTestId("sum-cost").textContent()).trim() === money(Number(est2.cost_total)), "summary cost equals stored");
await check((await page.getByTestId("sum-tax").textContent()).trim() === money(Number(est2.tax_total)), "summary tax equals stored");
await check((await row("E2E noggings")).getByLabel("Markup percent").inputValue().then((v) => v === "30%"), "persisted values reload into grid");

console.log("Cleanup: delete test category (restores sample)");
m = await openMenu("E2E Carpentry");
await m.getByRole("menuitem", { name: /^Delete/ }).click();
await m.getByRole("menuitem", { name: /Confirm delete/ }).click();
await settle();
await check(!(await rowId("E2E Carpentry")) && !(await rowId(recipeName)), "category subtree deleted");
await page.getByRole("button", { name: /Remove markup line Risk/ }).click();
await page.getByLabel("Quote rounding").selectOption("none");
await settle();

console.log("Empty state");
await page.goto(`${base}/estimates/${emptyId}/costings`);
await page.getByRole("button", { name: "Add your first category" }).click();
await page.keyboard.type("First room");
await page.keyboard.press("Tab");
await settle();
await check(!!(await one("select id from estimate_items where estimate_id=? and kind='category' and description='First room'", [emptyId])), "empty state creates first category");

// fixtures cleanup
await db.execute({ sql: "delete from estimate_items where estimate_id = ?", args: [emptyId] });
await db.execute({ sql: "delete from estimates where id = ?", args: [emptyId] });
await db.execute({ sql: "delete from catalogue_recipe_lines where recipe_item_id = ?", args: [recipeId] });
await db.execute({ sql: "delete from catalogue_items where id = ?", args: [recipeId] });
await done();
