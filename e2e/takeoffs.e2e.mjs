// Plans & takeoffs end-to-end: upload PNG + PDF, scale, draw every tool, multi-shape takeoffs
// (across plans, deductions, unit check), manual calculator takeoffs, hide/search/reorder/print,
// costing link + formula using a multi-shape takeoff, delete, plan rename/reorder/delete.
// Verifies persistence in the DB.
// Run: BASE_URL=http://localhost:3106 node e2e/takeoffs.e2e.mjs
import { start, check, done, db as getDb, RUN, purgeEstimate } from "./helpers.mjs";

const db = getDb();
const estimateId = crypto.randomUUID();
const now = new Date().toISOString();
await db.execute({
  sql: "insert into estimates (id, number, name, created_at, updated_at) values (?, ?, ?, ?, ?)",
  args: [estimateId, `QE2E-T${RUN}`, `Takeoff e2e house ${RUN}`, now, now],
});
const q = async (sql, ...args) => (await db.execute({ sql, args })).rows;

/** Minimal 2-page PDF with some lines (valid xref offsets). */
function makePdf() {
  const objs = [];
  const content = (label) => `0 0 0 RG 2 w 72 72 m 500 72 l S 72 72 m 72 700 l S BT /F1 24 Tf 100 400 Td (${label}) Tj ET`;
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>";
  objs[4] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>";
  const c1 = content("Ground floor"), c2 = content("Elevations");
  objs[5] = `<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`;
  objs[6] = `<< /Length ${c2.length} >>\nstream\n${c2}\nendstream`;
  objs[7] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const { page, base } = await start();
const url = `${base}/estimates/${estimateId}/takeoffs`;

/** Screen position of an image-pixel coordinate on the plan canvas. */
async function at(x, y) {
  const svg = page.getByTestId("plan-canvas");
  const box = await svg.boundingBox();
  const v = JSON.parse(await svg.getAttribute("data-view"));
  return { x: box.x + v.x + x * v.zoom, y: box.y + v.y + y * v.zoom };
}
async function clickAt(x, y, opts) {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y, opts);
  await page.waitForTimeout(60);
}
async function tool(name) {
  await page.getByRole("toolbar", { name: "Takeoff tools" }).getByRole("button", { name, exact: true }).click();
}
const row = (code) => page.getByTestId(`takeoff-${code}`);
const value = async (code) => (await row(code).getByTestId("takeoff-value").textContent())?.trim();
async function waitRow(code) {
  await row(code).waitFor();
  await page.waitForTimeout(150);
}
/** Waits until takeoff `code` shows `text` as its value. */
async function waitValue(code, text) {
  await page.waitForFunction(
    ([c, t]) => document.querySelector(`[data-testid="takeoff-${c}"] [data-testid="takeoff-value"]`)?.textContent?.trim() === t,
    [code, text],
  );
}
/** Expands a takeoff row (selects the takeoff) unless it already is. */
async function openRow(code) {
  const btn = row(code).locator("button[aria-expanded]");
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await row(code).locator('button[aria-expanded="true"]').waitFor();
}
async function newTakeoffMode() {
  const b = page.getByTestId("draw-target").getByRole("button", { name: "New takeoff" });
  if (await b.count()) await b.click();
  await page.getByTestId("draw-target").filter({ hasText: "Drawing creates a new takeoff" }).waitFor();
}
const takeoffDb = async (code) => (await q("select * from takeoffs where estimate_id = ? and code = ?", estimateId, code))[0];
const shapesDb = async (takeoffId) => q("select * from measurements where takeoff_id = ? order by created_at", takeoffId);

try {
  console.log("Plans & takeoffs");
  await page.goto(url);
  await check(page.getByText("No plans uploaded yet").isVisible(), "empty state shown");
  await check(page.getByText("No takeoffs yet").isVisible(), "empty takeoff list");

  // --- Upload a PNG drawn on a canvas (1000x700) ---
  const pngDataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1000; c.height = 700;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 700);
    g.strokeStyle = "#111"; g.lineWidth = 3;
    g.strokeRect(100, 100, 600, 400);
    g.beginPath(); g.moveTo(100, 600); g.lineTo(600, 600); g.stroke();
    g.font = "20px sans-serif"; g.fillStyle = "#111"; g.fillText("5 m", 330, 630);
    return c.toDataURL("image/png");
  });
  const png = Buffer.from(pngDataUrl.split(",")[1], "base64");
  await page.getByTestId("plan-upload").setInputFiles({ name: "Ground floor plan.png", mimeType: "image/png", buffer: png });
  await page.getByTestId("plan-item").first().waitFor();
  await check((await page.getByTestId("plan-item").count()) === 1, "PNG uploaded as one plan");
  await check(page.getByText("Ground floor plan", { exact: true }).first().isVisible(), "plan label from file name");
  await check(page.getByTestId("scale-status").filter({ hasText: "No scale set" }).isVisible(), "no-scale warning shown");
  const [planRow] = await q("select * from plans where estimate_id = ?", estimateId);
  await check(planRow?.image_width === 1000 && planRow?.image_height === 700 && String(planRow.image_data_url).startsWith("data:image/png;base64,"), "plan image + size persisted");
  const imgRes = await page.request.get(`${base}/estimates/${estimateId}/takeoffs/image/${planRow.id}`);
  await check(imgRes.ok() && imgRes.headers()["content-type"] === "image/png", "plan image served by route");

  // --- Upload a 2-page PDF ---
  await page.getByTestId("plan-upload").setInputFiles({ name: "Drawings.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="plan-item"]').length === 3, null, { timeout: 30000 });
  await check((await page.getByTestId("plan-item").count()) === 3, "PDF pages became two plans");
  const pdfPlans = await q("select label, image_width, image_height, source_dpi from plans where estimate_id = ? and label like 'Drawings%' order by sort_order", estimateId);
  await check(pdfPlans.length === 2 && pdfPlans[0].label === "Drawings – p1" && pdfPlans[1].image_width > pdfPlans[1].image_height && pdfPlans[0].source_dpi > 72, "PDF pages rendered with labels, orientation and dpi");

  // --- Back to PNG plan, set scale by two-point calibration ---
  await page.getByRole("button", { name: "Open plan Ground floor plan" }).click();
  await page.waitForTimeout(200);
  await tool("Set scale");
  await clickAt(100, 600);
  await clickAt(600, 600);
  const dlg = page.getByRole("dialog", { name: "Set plan scale" });
  await dlg.waitFor();
  await check(dlg.getByText("500.0 px").isVisible(), "calibration line length shown");
  await dlg.locator('input[name="realLength"]').fill("5");
  await dlg.getByRole("button", { name: "Apply scale" }).click();
  await dlg.waitFor({ state: "detached" });
  await page.getByTestId("scale-status").filter({ hasText: "1 px = 10 mm" }).waitFor();
  await check(true, "scale applied: 1 px = 10 mm");

  // ===== Takeoff M1: multi-shape length (line + polyline) =====
  await check(page.getByTestId("draw-target").filter({ hasText: "Drawing creates a new takeoff" }).isVisible(), "no takeoff selected: drawing creates a new takeoff");
  await page.getByLabel("Description for new takeoffs").fill("Wall framing");
  await tool("Line");
  await clickAt(100, 100);
  const mid = await at(400, 500);
  await page.mouse.move(mid.x, mid.y);
  await check(page.getByTestId("live-readout").filter({ hasText: "5.00 m" }).isVisible(), "live measurement while drawing");
  await clickAt(400, 500); // (100,100)-(400,500) = 500 px = 5 m
  await waitRow("M1");
  await check((await value("M1")) === "5.00 m" && (await row("M1").getByText("Wall framing").isVisible()), "line creates takeoff M1 = 5.00 m with preset label");
  await check(page.getByTestId("draw-target").filter({ hasText: "Drawing adds to M1" }).isVisible(), "new takeoff is selected as the drawing target");

  // Polyline with Shift snapping, finished by double-click → added to M1
  await tool("Polyline");
  await clickAt(100, 650);
  await page.keyboard.down("Shift");
  await clickAt(250, 663, { modifiers: ["Shift"] });
  const end = await at(300, 690);
  await page.mouse.dblclick(end.x, end.y, { modifiers: ["Shift"] });
  await page.keyboard.up("Shift");
  await waitValue("M1", "7.00 m");
  await check(true, "polyline (snapped 90°, 2 m) added to M1: 5 + 2 = 7.00 m");
  await check((await page.getByTestId("takeoff-M1").count()) === 1 && (await q("select id from takeoffs where estimate_id = ?", estimateId)).length === 1, "still one takeoff");
  const t1 = await takeoffDb("M1");
  const s1 = await shapesDb(t1.id);
  await check(t1.value === 7 && t1.unit === "m" && s1.length === 2 && s1.every((s) => s.code === "M1"), "DB: M1 = 7 m from 2 shapes");
  const pts = JSON.parse(s1[1].points);
  await check(pts.length === 3 && pts[1][1] === 650 && pts[2][1] === 650, "snapped points persisted");

  // A shape with another unit cannot join M1
  await tool("Rectangle");
  await clickAt(500, 100);
  await clickAt(600, 200);
  await check(page.getByRole("alert").filter({ hasText: "M1 is measured in metres" }).isVisible(), "area shape rejected for a length takeoff");
  await check((await shapesDb(t1.id)).length === 2 && (await q("select id from takeoffs where estimate_id = ?", estimateId)).length === 1, "nothing saved for the rejected shape");

  // ===== Takeoff M2: rectangle + polygon, then a deduction =====
  await newTakeoffMode();
  await clickAt(100, 100);
  await clickAt(300, 400); // 200×300 px = 6 m²
  await waitRow("M2");
  await check((await value("M2")) === "6.00 m²", "rectangle creates M2 = 6.00 m²");
  await tool("Polygon");
  await clickAt(800, 600);
  await clickAt(850, 650);
  await page.keyboard.press("Escape");
  await check((await page.getByTestId("live-readout").count()) === 0, "Esc cancels the draft");
  await check(page.getByTestId("draw-target").filter({ hasText: "Drawing adds to M2" }).isVisible(), "Esc with a draft keeps the selected takeoff");
  await clickAt(500, 100);
  await clickAt(700, 100);
  await clickAt(900, 300); // mistake
  await page.keyboard.press("Backspace");
  await clickAt(500, 300);
  await page.keyboard.press("Enter");
  await waitValue("M2", "8.00 m²");
  await check(true, "polygon (2 m², undo + Enter) added to M2 = 8.00 m²");
  // Mark the polygon as a deduction
  await openRow("M2");
  await check((await row("M2").getByTestId("shape-row").count()) === 2, "M2 lists its 2 shapes");
  await row("M2").getByTestId("shape-row").nth(1).locator("button[aria-pressed]").click();
  const shapeForm = row("M2").getByRole("form", { name: "Edit shape" });
  await shapeForm.locator('input[name="negative"]').check();
  await check(shapeForm.getByTestId("editor-preview").filter({ hasText: "-2.00 m²" }).isVisible(), "shape editor previews the deduction");
  await shapeForm.getByRole("button", { name: "Save shape" }).click();
  await waitValue("M2", "4.00 m²");
  await check(true, "deduction subtracts: 6 − 2 = 4.00 m²");
  // Pitch 60° doubles the deduction; out-of-range pitch is rejected
  await shapeForm.locator('input[name="pitch"]').fill("60");
  await shapeForm.getByRole("button", { name: "Save shape" }).click();
  await waitValue("M2", "2.00 m²");
  await check(true, "pitched deduction: 6 − 4 = 2.00 m²");
  await shapeForm.locator('input[name="pitch"]').fill("95");
  await shapeForm.getByRole("button", { name: "Save shape" }).click();
  await check(shapeForm.getByRole("alert").filter({ hasText: "Pitch must be 0–89°" }).isVisible(), "invalid pitch rejected");

  // ===== M3 count, M4 ellipse (new takeoffs) =====
  await newTakeoffMode();
  await tool("Count");
  await clickAt(150, 150);
  await clickAt(200, 150);
  await clickAt(250, 150);
  await page.keyboard.press("Enter");
  await waitRow("M3");
  await check((await value("M3")) === "3 ea", "count creates M3 = 3 ea");
  await newTakeoffMode();
  await tool("Ellipse");
  await clickAt(600, 400);
  await clickAt(800, 500);
  await waitRow("M4");
  await check((await value("M4")) === "1.57 m²", "ellipse creates M4 = 1.57 m²");

  // Rename + recolour M3 (takeoff colour also used for its shapes)
  await openRow("M3");
  const ed3 = row("M3").getByRole("form", { name: "Edit M3" });
  await ed3.locator('input[name="description"]').fill("Downlights");
  await ed3.getByRole("button", { name: "Colour #16a34a" }).click();
  await ed3.getByRole("button", { name: "Save" }).click();
  await row("M3").getByText("Downlights").first().waitFor();
  const t3 = await takeoffDb("M3");
  await check(t3.description === "Downlights" && t3.colour === "#16a34a" && (await shapesDb(t3.id))[0].colour === "#16a34a", "M3 renamed and recoloured (takeoff + shapes)");

  // Single-shape takeoff follows its shape's unit: ellipse depth 100 mm → m³
  await openRow("M4");
  await row("M4").getByTestId("shape-row").first().locator("button[aria-pressed]").click();
  const ed4 = row("M4").getByRole("form", { name: "Edit shape" });
  await ed4.locator('input[name="depth"]').fill("100");
  await ed4.getByRole("button", { name: "Save shape" }).click();
  await waitValue("M4", "0.157 m³");
  await check((await takeoffDb("M4")).unit === "m3", "M4 becomes 0.157 m³ (unit follows its only shape)");

  // ===== Manual takeoffs (calculator) =====
  await page.getByRole("button", { name: "+ Manual takeoff" }).click();
  const mf = page.getByRole("form", { name: "New manual takeoff" });
  await mf.locator('input[name="description"]').fill("Junctions @ 2.4");
  await mf.locator('input[name="expr"]').fill("12*2+(");
  await check(mf.getByText("Unexpected end of formula").isVisible(), "calculator shows expression errors live");
  await mf.locator('input[name="expr"]').fill("12*2+3");
  await mf.locator('select[name="unit"]').selectOption("ea");
  await check(mf.getByTestId("calc-preview").filter({ hasText: "27 ea" }).isVisible(), "calculator previews 27 ea");
  await mf.getByRole("button", { name: "Add takeoff" }).click();
  await waitRow("M5");
  await check((await value("M5")) === "27 ea" && (await row("M5").getByText("Manual", { exact: true }).isVisible()), "manual takeoff M5 = 27 ea");
  const t5 = await takeoffDb("M5");
  await check(t5.manual_expr === "12*2+3" && t5.value === 27 && t5.unit === "ea" && (await shapesDb(t5.id)).length === 0, "DB: M5 manual expression, no shapes");
  // Drawing is refused while a manual takeoff is selected
  await check(page.getByTestId("draw-target").filter({ hasText: "M5 is entered manually" }).isVisible(), "toolbar says the selected takeoff is manual");

  // Override a drawn takeoff with a manual value, then switch back
  await openRow("M2");
  await row("M2").getByRole("button", { name: "Enter value manually" }).click();
  const calc2 = row("M2").getByRole("form", { name: "Calculator for M2" });
  await calc2.locator('input[name="expr"]').fill("2.5*4");
  await calc2.getByRole("button", { name: "Save value" }).click();
  await waitValue("M2", "10.00 m²");
  await check(true, "manual value overrides M2's shapes (10.00 m²)");
  await row("M2").getByRole("form", { name: "Calculator for M2" }).getByRole("button", { name: "Use drawn shapes" }).click();
  await waitValue("M2", "2.00 m²");
  await check((await takeoffDb("M2")).manual_expr === null, "back to the sum of drawn shapes (2.00 m²)");

  // ===== Reload: everything persisted =====
  await page.reload();
  await waitRow("M5");
  await check(
    (await value("M1")) === "7.00 m" && (await value("M2")) === "2.00 m²" && (await value("M3")) === "3 ea" && (await value("M4")) === "0.157 m³" && (await value("M5")) === "27 ea",
    "takeoff values persist after reload",
  );

  // ===== Selecting a takeoff highlights its shapes; hide / show =====
  await openRow("M1");
  await check((await page.locator('[data-testid="shape-M1"][data-highlighted="true"]').count()) === 2, "both M1 shapes highlighted on the plan");
  await check(page.getByTestId("plan-highlight").filter({ hasText: "M1 ×2" }).isVisible(), "plan list marks the plan holding M1's shapes");
  await row("M1").getByRole("button", { name: "Hide M1" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="shape-M1"]').length === 0);
  await check((await takeoffDb("M1")).hidden === 1 && (await row("M1").getAttribute("data-hidden")) === "true", "M1 hidden on the plans (persisted)");
  await check((await value("M1")) === "7.00 m", "hidden takeoff keeps its value");
  await row("M1").getByRole("button", { name: "Show M1" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="shape-M1"]').length === 2);
  await check((await takeoffDb("M1")).hidden === 0, "M1 shown again");

  // ===== Search and reorder =====
  await page.getByLabel("Search takeoffs").fill("downl");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="takeoff-M"]').length === 1);
  await check(row("M3").isVisible(), "search filters by description");
  await page.getByLabel("Search takeoffs").fill("m5");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="takeoff-M"]').length === 1);
  await check(row("M5").isVisible(), "search filters by code");
  await page.getByLabel("Search takeoffs").fill("");
  await openRow("M5");
  await row("M5").getByRole("button", { name: "Move up" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="takeoff-M"]')].map((e) => e.dataset.testid).join() === "takeoff-M1,takeoff-M2,takeoff-M3,takeoff-M5,takeoff-M4");
  const order = await q("select code from takeoffs where estimate_id = ? order by sort_order", estimateId);
  await check(order.map((r) => r.code).join() === "M1,M2,M3,M5,M4", "M5 moved above M4 (persisted)");

  // ===== Zoom / pan / fit =====
  await page.keyboard.press("Escape");
  const z0 = await page.getByTestId("zoom-level").textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  const z1 = await page.getByTestId("zoom-level").textContent();
  await check(parseInt(z1) > parseInt(z0), `zoom in button (${z0} → ${z1})`);
  const c = await at(500, 350);
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(100);
  const z2 = await page.getByTestId("zoom-level").textContent();
  await check(parseInt(z2) < parseInt(z1), `wheel zoom out (${z1} → ${z2})`);
  await tool("Pan");
  const v0 = JSON.parse(await page.getByTestId("plan-canvas").getAttribute("data-view"));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 4 });
  await page.mouse.up();
  const v1 = JSON.parse(await page.getByTestId("plan-canvas").getAttribute("data-view"));
  await check(Math.abs(v1.x - v0.x - 80) < 1 && Math.abs(v1.y - v0.y - 40) < 1, "pan with hand tool");
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await check((await page.getByTestId("zoom-level").textContent()) === z0, "fit to screen restores fit zoom");

  // Clicking a shape on the canvas selects its takeoff
  await tool("Select");
  await clickAt(675, 450); // inside the ellipse
  await check(row("M4").locator('button[aria-expanded="true"]').isVisible(), "clicking a shape selects its takeoff");

  // ===== Costing item from the multi-shape takeoff M1 =====
  await openRow("M1");
  await row("M1").getByRole("button", { name: "Create costing item" }).click();
  const cdlg = page.getByRole("dialog", { name: "Create costing item from M1" });
  await cdlg.waitFor();
  await check((await cdlg.locator('select[name="categoryId"]').inputValue()) === "__new__", "defaults to new Takeoff items category");
  await cdlg.getByRole("button", { name: "Create item" }).click();
  await cdlg.getByText("Costing item added").waitFor();
  await cdlg.getByRole("button", { name: "Close" }).first().click();
  const items = await q("select id, kind, description, quantity_expr, quantity, uom, measurement_id, parent_id from estimate_items where estimate_id = ?", estimateId);
  const cat = items.find((i) => i.kind === "category");
  const item = items.find((i) => i.kind === "item");
  await check(cat?.description === "Takeoff items", "Takeoff items category created");
  await check(item?.quantity_expr === "[M1]" && item.quantity === 7 && item.uom === "m" && item.measurement_id === t1.id && item.description === "Wall framing", "costing item [M1] = 7 m linked to the takeoff");
  await row("M1").getByText("in 1 costing").waitFor();
  await check(true, "takeoff shows it is used in a costing");

  // Manual takeoff M5 into the existing category
  await openRow("M5");
  await row("M5").getByRole("button", { name: "Create costing item" }).click();
  const cdlg2 = page.getByRole("dialog", { name: "Create costing item from M5" });
  await check((await cdlg2.locator('select[name="categoryId"]').inputValue()) === cat.id, "existing Takeoff items category preselected");
  await cdlg2.getByRole("button", { name: "Create item" }).click();
  await cdlg2.getByText("Costing item added").waitFor();
  await page.keyboard.press("Escape");
  const [m5item] = await q("select description, quantity, uom from estimate_items where estimate_id = ? and quantity_expr = '[M5]'", estimateId);
  await check(m5item?.quantity === 27 && m5item.uom === "ea" && m5item.description === "Junctions @ 2.4", "manual takeoff linked as 27 ea item");

  // A costing formula combining takeoffs: [M1]*2 + [M5]
  const formulaId = crypto.randomUUID();
  await db.execute({
    sql: "insert into estimate_items (id, estimate_id, parent_id, kind, sort_order, description, cost_type, allowance_type, uom, quantity_expr, quantity, unit_cost, taxable, show_in_specification, hidden_on_quote, status, total, total_inc_markup) values (?,?,?,'item',9,'Framing + junction labour','Labour','none','hr','[M1]*2+[M5]',0,10,1,0,0,'Incomplete',0,0)",
    args: [formulaId, estimateId, cat.id],
  });
  // Adding a third shape to M1 (line 200 px = 2 m) recalculates every formula using it
  await openRow("M1");
  await tool("Line");
  await clickAt(100, 300);
  await clickAt(300, 300);
  await waitValue("M1", "9.00 m");
  await check(true, "third shape added to M1 → 9.00 m");
  const [linked] = await q("select quantity from estimate_items where estimate_id = ? and quantity_expr = '[M1]'", estimateId);
  const [formula] = await q("select quantity, total from estimate_items where id = ?", formulaId);
  await check(linked.quantity === 9, "linked costing item quantity follows the takeoff (9)");
  await check(formula.quantity === 45 && formula.total === 450, "formula [M1]*2+[M5] = 9×2+27 = 45 (× $10 = $450)");
  const [est] = await q("select cost_total from estimates where id = ?", estimateId);
  await check(est.cost_total >= 450, "estimate totals recalculated");

  // Per-shape delete keeps the takeoff
  await row("M1").getByRole("button", { name: "Delete shape 3" }).click();
  await waitValue("M1", "7.00 m");
  const [linked2] = await q("select quantity from estimate_items where estimate_id = ? and quantity_expr = '[M1]'", estimateId);
  await check(linked2.quantity === 7 && (await shapesDb(t1.id)).length === 2, "deleting a shape updates M1 (7 m) and its costing");

  // ===== Delete takeoff M5 (highest code); codes are never reused =====
  await openRow("M5");
  await row("M5").getByRole("button", { name: "Delete takeoff" }).click();
  await check(row("M5").getByText("2 costing items use [M5]").isVisible(), "delete warns about costing formulas");
  await row("M5").getByRole("button", { name: "Confirm delete" }).click();
  await row("M5").waitFor({ state: "detached" });
  await check(!(await takeoffDb("M5")), "M5 deleted from DB");
  await newTakeoffMode();
  await page.getByLabel("Description for new takeoffs").fill("Skirting");
  await tool("Line");
  await clickAt(100, 300);
  await clickAt(300, 300);
  await waitRow("M6");
  await check((await value("M6")) === "2.00 m" && (await row("M6").getByText("Skirting").isVisible()), "new code M6 (deleted M5 not reused)");

  // ===== Printable takeoff list =====
  await page.goto(`${base}/estimates/${estimateId}/takeoffs/print`);
  const sheet = page.getByTestId("takeoff-print");
  await sheet.waitFor();
  await check(sheet.getByTestId("print-M1").filter({ hasText: "7.00 m" }).filter({ hasText: "2 shapes" }).isVisible(), "print: M1 with value and shape count");
  await check(sheet.getByTestId("print-M2").filter({ hasText: "1 deduction" }).isVisible(), "print: deductions noted");
  await check((await sheet.locator('[data-testid^="print-M"]').count()) === 5, "print lists every takeoff");
  await check(page.getByRole("button", { name: "Print / save as PDF" }).isVisible(), "print button shown");
  await page.goto(url);
  await waitRow("M6");

  // ===== Ratio scale on PDF page 1 (M3 stays selected while switching plans) =====
  await openRow("M3");
  await page.getByRole("button", { name: "Open plan Drawings – p1" }).click();
  await page.getByTestId("scale-status").filter({ hasText: "No scale set" }).click();
  const sdlg = page.getByRole("dialog", { name: "Set plan scale" });
  await sdlg.getByRole("button", { name: "Drawing ratio" }).click();
  await sdlg.locator('input[name="ratio"]').fill("1:100");
  await sdlg.getByRole("button", { name: "Apply scale" }).click();
  await sdlg.waitFor({ state: "detached" });
  await page.getByTestId("scale-status").filter({ hasText: "1:100" }).waitFor();
  await check(true, "ratio scale 1:100 applied using PDF render dpi");

  // A takeoff spans plans: add a count on PDF page 1 to M3 (Downlights)
  await check(page.getByTestId("draw-target").filter({ hasText: "Drawing adds to M3" }).isVisible(), "M3 still the drawing target on another plan");
  await tool("Count");
  await clickAt(100, 100);
  await clickAt(150, 100);
  await page.keyboard.press("Enter");
  await waitValue("M3", "5 ea");
  const t3b = await takeoffDb("M3");
  const s3 = await shapesDb(t3b.id);
  await check(t3b.value === 5 && new Set(s3.map((s) => s.plan_id)).size === 2, "M3 = 3 + 2 = 5 ea from shapes on two plans");
  await check(page.getByTestId("plan-highlight").count().then((n) => n === 2), "both plans marked as holding M3 shapes");

  // ===== Rename, reorder, delete plans =====
  const p1 = page.getByTestId("plan-item").nth(1); // stable while its label turns into an input
  await check((await p1.textContent()).includes("Drawings – p1"), "second plan is PDF page 1");
  await p1.getByRole("button", { name: "Rename plan" }).click();
  await p1.getByLabel("Plan name").fill("Level 1 floor plan");
  await p1.getByRole("button", { name: "Save" }).click();
  await page.getByText("Level 1 floor plan").first().waitFor();
  await check((await q("select label from plans where estimate_id = ? and label = 'Level 1 floor plan'", estimateId)).length === 1, "plan renamed and persisted");
  const lvl = page.getByTestId("plan-item").filter({ hasText: "Level 1 floor plan" });
  await lvl.getByRole("button", { name: "Move up" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="plan-item"]')?.textContent?.includes("Level 1 floor plan"));
  const porder = await q("select label from plans where estimate_id = ? order by sort_order", estimateId);
  await check(porder[0].label === "Level 1 floor plan", "plan moved up and order persisted");

  const p2 = page.getByTestId("plan-item").filter({ hasText: "Drawings – p2" });
  await p2.getByRole("button", { name: "Open plan Drawings – p2" }).click();
  await p2.getByRole("button", { name: "Delete plan" }).click();
  await p2.getByRole("button", { name: /^Delete/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="plan-item"]').length === 2);
  await check((await q("select id from plans where estimate_id = ?", estimateId)).length === 2, "plan deleted from DB");

  // Deleting a plan removes its shapes; takeoffs stay and their totals drop
  const gf = page.getByTestId("plan-item").filter({ hasText: "Ground floor plan" });
  await gf.getByRole("button", { name: "Open plan Ground floor plan" }).click();
  await gf.getByRole("button", { name: "Delete plan" }).click();
  await gf.getByRole("button", { name: /^Delete \+ 7/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="plan-item"]').length === 1);
  await waitValue("M1", "0.00 m");
  await check((await q("select id from measurements where estimate_id = ?", estimateId)).length === 1, "plan delete removed its 7 shapes (1 left on Level 1)");
  await check((await value("M3")) === "2 ea" && (await row("M1").getByText("0 shapes").isVisible()), "takeoffs kept; M3 = 2 ea from the remaining plan");
  const [linked3] = await q("select quantity from estimate_items where estimate_id = ? and quantity_expr = '[M1]'", estimateId);
  await check(linked3.quantity === 0, "costing follows the emptied takeoff (0)");

  // Mobile layout renders without horizontal overflow
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByTestId("plan-canvas").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await check(overflow <= 1, `no horizontal overflow on phone width (${overflow}px)`);
} catch (e) {
  await check(Promise.reject(e), "unexpected error");
} finally {
  // Clean up the test estimate.
  await purgeEstimate(estimateId);
  await done();
}
