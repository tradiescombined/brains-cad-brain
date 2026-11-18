// Plans & takeoffs end-to-end: upload PNG + PDF, scale, draw every tool, edit, totals,
// costing link, delete, plan rename/reorder/delete. Verifies persistence in the DB.
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
const row = (code) => page.getByTestId(`measurement-${code}`);
const value = async (code) => (await row(code).getByTestId("measurement-value").textContent())?.trim();
async function waitRow(code) {
  await row(code).waitFor();
  await page.waitForTimeout(150);
}

try {
  console.log("Plans & takeoffs");
  await page.goto(url);
  await check(page.getByText("No plans uploaded yet").isVisible(), "empty state shown");
  await check(page.getByText("No measurements yet").isVisible(), "empty measurement list");

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
  const [scaled] = await q("select scale_x, scale_y from plans where id = ?", planRow.id);
  await check(Math.abs(scaled.scale_x - 10) < 1e-9 && scaled.scale_y === scaled.scale_x, "scale persisted (scaleX = scaleY = 10)");

  // --- Line: (100,100)-(400,500) = 500px = 5 m ---
  await tool("Line");
  await clickAt(100, 100);
  const mid = await at(400, 500);
  await page.mouse.move(mid.x, mid.y);
  await check(page.getByTestId("live-readout").filter({ hasText: "5.00 m" }).isVisible(), "live measurement while drawing");
  await clickAt(400, 500);
  await waitRow("M1");
  await check((await value("M1")) === "5.00 m", "line M1 = 5.00 m");

  // --- Rectangle 200x300 px = 6 m² ---
  await tool("Rectangle");
  await clickAt(100, 100);
  await clickAt(300, 400);
  await waitRow("M2");
  await check((await value("M2")) === "6.00 m²", "rectangle M2 = 6.00 m²");

  // --- Polygon: Esc cancels, Backspace undoes, Enter finishes ---
  await tool("Polygon");
  await clickAt(800, 600);
  await clickAt(850, 650);
  await page.keyboard.press("Escape");
  await check((await page.getByTestId("live-readout").count()) === 0, "Esc cancels the draft");
  await clickAt(500, 100);
  await clickAt(700, 100);
  await clickAt(900, 300); // mistake
  await page.keyboard.press("Backspace");
  await clickAt(500, 300);
  await page.keyboard.press("Enter");
  await waitRow("M3");
  await check((await value("M3")) === "2.00 m²", "polygon M3 = 2.00 m² (undo + Enter)");

  // --- Polyline with Shift snapping, finished by double-click ---
  await tool("Polyline");
  await clickAt(100, 650);
  await page.keyboard.down("Shift");
  await clickAt(250, 663, { modifiers: ["Shift"] });
  const end = await at(300, 690);
  await page.mouse.dblclick(end.x, end.y, { modifiers: ["Shift"] });
  await page.keyboard.up("Shift");
  await waitRow("M4");
  await check((await value("M4")) === "2.00 m", "polyline M4 snapped to 90° = 2.00 m (double-click finish)");
  const [m4] = await q("select points from measurements where estimate_id = ? and code = 'M4'", estimateId);
  const pts4 = JSON.parse(m4.points);
  await check(pts4.length === 3 && pts4[1][1] === 650 && pts4[2][1] === 650, "snapped points persisted");

  // --- Count ---
  await tool("Count");
  await clickAt(150, 150);
  await clickAt(200, 150);
  await clickAt(250, 150);
  await page.keyboard.press("Enter");
  await waitRow("M5");
  await check((await value("M5")) === "3 ea", "count M5 = 3 ea");

  // --- Ellipse rx100 ry50 px = π×1×0.5 = 1.57 m² ---
  await tool("Ellipse");
  await clickAt(600, 400);
  await clickAt(800, 500);
  await waitRow("M6");
  await check((await value("M6")) === "1.57 m²", "ellipse M6 = 1.57 m²");

  const ms = await q("select code, shape, unit, value from measurements where estimate_id = ? order by code", estimateId);
  await check(ms.map((m) => `${m.code}:${m.shape}:${m.unit}:${m.value}`).join(",") === "M1:line:m:5,M2:rectangle:m2:6,M3:polygon:m2:2,M4:polyline:m:2,M5:point:ea:3,M6:ellipse:m2:1.571", "all measurements persisted with values");

  // --- Edit M2: description, depth -> m³, colour ---
  await row("M2").locator("button[aria-expanded]").click();
  const ed2 = page.getByRole("form", { name: "Edit M2" });
  await ed2.locator('input[name="description"]').fill("Slab");
  await ed2.locator('input[name="depth"]').fill("100");
  await check(ed2.getByTestId("editor-preview").filter({ hasText: "0.600 m³" }).isVisible(), "editor previews volume");
  await ed2.getByRole("button", { name: "Colour #16a34a" }).click();
  await ed2.getByRole("button", { name: "Save changes" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="measurement-M2"] [data-testid="measurement-value"]')?.textContent?.includes("0.600 m³"));
  await check(true, "M2 updated to 0.600 m³");

  // --- Edit M1: wall height + deduction + pitch ---
  await row("M1").locator("button[aria-expanded]").click();
  const ed1 = page.getByRole("form", { name: "Edit M1" });
  await ed1.locator('input[name="description"]').fill("Slab");
  await ed1.locator('input[name="height"]').fill("2400");
  await ed1.locator('input[name="negative"]').check();
  await ed1.getByRole("button", { name: "Save changes" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="measurement-M1"] [data-testid="measurement-value"]')?.textContent?.includes("-12.00 m²"));
  await check(true, "M1 height 2.4 m + deduction = -12.00 m²");

  // Pitch on M3: 60° doubles area
  await row("M3").locator("button[aria-expanded]").click();
  const ed3 = page.getByRole("form", { name: "Edit M3" });
  await ed3.locator('input[name="pitch"]').fill("60");
  await ed3.getByRole("button", { name: "Save changes" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="measurement-M3"] [data-testid="measurement-value"]')?.textContent?.includes("4.00 m²"));
  await check(true, "M3 pitched 60° = 4.00 m²");

  // Validation: pitch out of range is rejected
  await ed3.locator('input[name="pitch"]').fill("95");
  await ed3.getByRole("button", { name: "Save changes" }).click();
  await check(ed3.getByRole("alert").filter({ hasText: "Pitch must be 0–89°" }).isVisible(), "invalid pitch rejected");

  // --- Reload: persisted values ---
  await page.reload();
  await waitRow("M6");
  await check((await value("M2")) === "0.600 m³" && (await value("M1")) === "-12.00 m²" && (await value("M3")) === "4.00 m²", "edited values persist after reload");
  const [m2db] = await q("select description, depth_mm, colour, unit from measurements where estimate_id = ? and code = 'M2'", estimateId);
  await check(m2db.description === "Slab" && m2db.depth_mm === 100 && m2db.colour === "#16a34a" && m2db.unit === "m3", "M2 properties persisted in DB");

  // --- Totals by description ---
  await page.getByRole("button", { name: "Totals", exact: true }).click();
  const totals = page.getByTestId("totals-table");
  await check(totals.getByText("0.600 m³").isVisible(), "totals table groups by description/unit");
  await check(totals.getByText("-12.00 m²").isVisible(), "deductions included in totals");
  await page.getByRole("button", { name: "List", exact: true }).click();

  // --- Zoom / pan / fit ---
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

  // --- Select a shape on the canvas highlights its row ---
  await tool("Select");
  await clickAt(675, 450); // inside ellipse
  await check(row("M6").locator('button[aria-expanded="true"]').isVisible(), "clicking a shape selects its measurement");

  // --- Create costing item from M2 (new "Takeoff items" category) ---
  await row("M2").locator("button[aria-expanded]").click();
  await row("M2").getByRole("button", { name: "Create costing item" }).click();
  const cdlg = page.getByRole("dialog", { name: "Create costing item from M2" });
  await cdlg.waitFor();
  await check((await cdlg.locator('select[name="categoryId"]').inputValue()) === "__new__", "defaults to new Takeoff items category");
  await cdlg.getByRole("button", { name: "Create item" }).click();
  await cdlg.getByText("Costing item added").waitFor();
  await cdlg.getByRole("button", { name: "Close" }).first().click();
  const items = await q("select id, kind, description, quantity_expr, quantity, uom, measurement_id, parent_id from estimate_items where estimate_id = ?", estimateId);
  const cat = items.find((i) => i.kind === "category");
  const item = items.find((i) => i.kind === "item");
  await check(cat?.description === "Takeoff items", "Takeoff items category created");
  await check(item?.quantity_expr === "[M2]" && item.quantity === 0.6 && item.uom === "m3" && item.parent_id === cat.id && item.description === "Slab", "costing item created with [M2], qty 0.6, uom m3");
  await row("M2").getByText("in 1 costing").waitFor();
  await check(true, "measurement shows it is used in a costing");

  // Second link reuses the existing category
  await row("M5").locator("button[aria-expanded]").click();
  await row("M5").getByRole("button", { name: "Create costing item" }).click();
  const cdlg2 = page.getByRole("dialog", { name: "Create costing item from M5" });
  await check((await cdlg2.locator('select[name="categoryId"]').inputValue()) === cat.id, "existing Takeoff items category preselected");
  await cdlg2.locator('input[name="itemDescription"]').fill("Downlights");
  await cdlg2.getByRole("button", { name: "Create item" }).click();
  await cdlg2.getByText("Costing item added").waitFor();
  await page.keyboard.press("Escape");
  const items2 = await q("select description, quantity, uom from estimate_items where estimate_id = ? and kind = 'item' order by sort_order", estimateId);
  await check(items2.length === 2 && items2[1].description === "Downlights" && items2[1].quantity === 3 && items2[1].uom === "ea", "count linked as 3 ea item");

  // Changing the measurement recalculates the costing quantity
  await row("M2").locator("button[aria-expanded]").click();
  const ed2b = page.getByRole("form", { name: "Edit M2" });
  await ed2b.locator('input[name="depth"]').fill("200");
  await ed2b.getByRole("button", { name: "Save changes" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="measurement-M2"] [data-testid="measurement-value"]')?.textContent?.includes("1.200 m³"));
  const [linked] = await q("select quantity from estimate_items where estimate_id = ? and quantity_expr = '[M2]'", estimateId);
  await check(linked.quantity === 1.2, "recalcEstimate updated linked costing quantity to 1.2");

  // --- Delete M1; codes are never reused ---
  await row("M1").locator("button[aria-expanded]").click();
  await row("M1").getByRole("button", { name: "Delete" }).click();
  await row("M1").getByRole("button", { name: "Confirm delete" }).click();
  await row("M1").waitFor({ state: "detached" });
  await check((await q("select id from measurements where estimate_id = ? and code = 'M1'", estimateId)).length === 0, "M1 deleted from DB");
  // delete highest code then draw again: must become M7, not M6
  await row("M6").locator("button[aria-expanded]").click();
  await row("M6").getByRole("button", { name: "Delete" }).click();
  await row("M6").getByRole("button", { name: "Confirm delete" }).click();
  await row("M6").waitFor({ state: "detached" });
  await page.getByLabel("Description for new measurements").fill("Skirting");
  await tool("Line");
  await clickAt(100, 300);
  await clickAt(300, 300);
  await waitRow("M7");
  await check((await value("M7")) === "2.00 m" && (await row("M7").getByText("Skirting").isVisible()), "new code M7 (deleted codes not reused) with preset label");

  // --- Ratio scale on PDF page 1 ---
  await page.getByRole("button", { name: "Open plan Drawings – p1" }).click();
  await page.getByTestId("scale-status").filter({ hasText: "No scale set" }).click();
  const sdlg = page.getByRole("dialog", { name: "Set plan scale" });
  await sdlg.getByRole("button", { name: "Drawing ratio" }).click();
  await sdlg.locator('input[name="ratio"]').fill("1:100");
  await sdlg.getByRole("button", { name: "Apply scale" }).click();
  await sdlg.waitFor({ state: "detached" });
  await page.getByTestId("scale-status").filter({ hasText: "1:100" }).waitFor();
  await check(true, "ratio scale 1:100 applied using PDF render dpi");

  // --- Rename, reorder, delete plans ---
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
  const order = await q("select label from plans where estimate_id = ? order by sort_order", estimateId);
  await check(order[0].label === "Level 1 floor plan", "plan moved up and order persisted");

  const p2 = page.getByTestId("plan-item").filter({ hasText: "Drawings – p2" });
  await p2.getByRole("button", { name: "Open plan Drawings – p2" }).click();
  await p2.getByRole("button", { name: "Delete plan" }).click();
  await p2.getByRole("button", { name: /^Delete/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="plan-item"]').length === 2);
  await check((await q("select id from plans where estimate_id = ?", estimateId)).length === 2, "plan deleted from DB");

  // Deleting a plan removes its measurements
  const gf = page.getByTestId("plan-item").filter({ hasText: "Ground floor plan" });
  await gf.getByRole("button", { name: "Open plan Ground floor plan" }).click();
  await gf.getByRole("button", { name: "Delete plan" }).click();
  await gf.getByRole("button", { name: /^Delete \+ 5/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="plan-item"]').length === 1);
  await check((await q("select id from measurements where estimate_id = ?", estimateId)).length === 0, "plan delete removed its measurements");
  await check(page.getByText("No measurements yet").isVisible(), "measurement list empty again");

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
