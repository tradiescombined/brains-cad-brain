// E2E: Specifications tab, spec library, quote builder, print view and public client quote.
// Run: BASE_URL=http://localhost:3107 node e2e/quote.e2e.mjs   (needs seeded DB: npm run db:reset)
import { start, check, done, db, one, RUN, cloneEstimate, purgeEstimate } from "./helpers.mjs";

const dbc = db();
// Work on a private copy of the seeded sample estimate (status, specs, quote options and acceptance
// all change here), so the seed record is never mutated and the suite is order-independent.
const sample = await one("select id from estimates where is_sample = 1 order by created_at limit 1");
if (!sample) throw new Error("No sample estimate - run npm run db:reset");
const id = await cloneEstimate(sample.id, { name: `E2E quote ${RUN}`, number: `QE2E-Q${RUN}` });
await dbc.execute({ sql: "update estimate_items set show_in_specification = 1 where estimate_id = ? and description = 'Skip bin 6m3'", args: [id] });
const tplName = `E2E Bathroom spec ${RUN}`;
const tmpTplName = `E2E Temp ${RUN}`;

const { page, base } = await start();
const seen = (loc) => loc.waitFor({ timeout: 8000 }).then(() => true);
const settle = async () => { await page.waitForLoadState("load"); await page.waitForTimeout(400); };
await page.addInitScript(() => { window.print = () => { window.__printed = true; }; });

console.log("Specifications tab");
await page.goto(`${base}/estimates/${id}/specifications`);
await settle();
await check(seen(page.getByText("No specification sections yet")), "empty state shown");
await check(seen(page.getByTestId("spec-inclusions").getByText("Skip bin 6m3")), "inclusion from costings listed");
await page.getByLabel("Introduction (optional)").fill("This specification forms part of the quote.");
await page.getByRole("button", { name: "Add section" }).click();
await page.getByLabel("Section heading").fill("Demolition");
await page.getByLabel("Section body").fill("Remove existing fixtures.\n\n- Cap services\n- **Dispose** of waste");
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: "+ Add section" }).click();
await page.getByLabel("Section heading").fill("Tiling");
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: "+ Add section" }).click();
await page.getByLabel("Section heading").fill("Wall tiles");
await page.getByRole("button", { name: "Done" }).click();
// indent "Wall tiles" under Tiling -> 2.1
await page.getByTestId("spec-node").filter({ hasText: "Wall tiles" }).getByRole("button", { name: /^Indent/ }).click();
await check(seen(page.getByTestId("spec-node").filter({ hasText: "Wall tiles" }).getByText("2.1")), "indent numbers clause 2.1");
// move Tiling up -> 1
await page.getByTestId("spec-node").filter({ hasText: "Tiling" }).first().getByRole("button", { name: "Move up" }).click();
await check(seen(page.getByTestId("spec-node").first().getByText("Tiling")), "move up reorders");
await check(seen(page.getByTestId("spec-dirty")), "dirty indicator shown");
await page.getByTestId("spec-save").click();
await page.getByTestId("spec-saved").waitFor();
await check(true, "specification saved");
const specCount = await one("select count(*) as n from specifications where estimate_id = ?", [id]);
await check(Number(specCount.n) === 3, "3 spec rows persisted");
const child = await one("select s.heading, p.heading as parent from specifications s join specifications p on p.id = s.parent_id where s.estimate_id = ?", [id]);
await check(child?.heading === "Wall tiles" && child?.parent === "Tiling", "clause persisted under parent");
await page.reload();
await settle();
await check(seen(page.getByTestId("spec-node").first().getByText("Tiling")), "order persisted after reload");
await check(seen(page.getByText("Dispose").first()), "markdown body rendered");
await check((await page.getByLabel("Introduction (optional)").inputValue()) === "This specification forms part of the quote.", "intro persisted");

// Edit + outdent + delete
await page.getByTestId("spec-node").filter({ hasText: "Wall tiles" }).getByRole("button", { name: "Edit" }).click();
await page.getByLabel("Section heading").fill("Wall & floor tiles");
await page.getByRole("button", { name: "Done" }).click();
await page.getByTestId("spec-node").filter({ hasText: "Wall & floor tiles" }).getByRole("button", { name: /^Outdent/ }).click();
await check(seen(page.getByTestId("spec-node").filter({ hasText: "Wall & floor tiles" }).getByText("2", { exact: true })), "outdent makes section 2");
await page.getByTestId("spec-node").filter({ hasText: "Demolition" }).getByRole("button", { name: "Delete" }).click();
await page.getByTestId("spec-node").filter({ hasText: "Demolition" }).getByRole("button", { name: "Delete", exact: true }).click();
await page.getByTestId("spec-save").click();
await page.getByTestId("spec-saved").waitFor();
const rows = (await dbc.execute({ sql: "select heading, parent_id from specifications where estimate_id = ? order by sort_order", args: [id] })).rows;
await check(rows.length === 2 && rows.every((r) => r.parent_id === null) && rows.some((r) => r.heading === "Wall & floor tiles"), "edit/outdent/delete persisted");

// Save as library template
await page.getByRole("button", { name: "Save as library template" }).click();
await page.getByLabel("Template name").fill(tplName);
await page.getByRole("button", { name: "Save template" }).click();
await page.getByText(`Saved “${tplName}” to your library.`).waitFor();
const tpl = await one("select id, content from specification_templates where name = ?", [tplName]);
await check(tpl && JSON.parse(tpl.content).length === 2, "template saved with 2 sections");
await page.keyboard.press("Escape");

console.log("Spec library");
await page.goto(`${base}/settings/spec-library`);
await settle();
await check(seen(page.getByRole("link", { name: tplName })), "template listed");
await page.getByRole("link", { name: tplName }).click();
await page.waitForURL(/spec-library\/[\w-]+$/);
await settle();
await page.getByLabel("Template name").fill(`${tplName} v2`);
await page.getByRole("button", { name: "+ Add section" }).click();
await page.getByLabel("Section heading").fill("Painting");
await page.getByRole("button", { name: "Done" }).click();
await page.getByTestId("spec-save").click();
await page.getByTestId("spec-saved").waitFor();
const tpl2 = await one("select name, content from specification_templates where id = ?", [tpl.id]);
await check(tpl2.name === `${tplName} v2` && JSON.parse(tpl2.content).length === 3, "template edit persisted");
// create new empty template then delete it
await page.goto(`${base}/settings/spec-library`);
await settle();
await page.getByLabel("New template name").fill(tmpTplName);
await page.getByRole("button", { name: "New template" }).click();
await page.waitForURL(/spec-library\/[\w-]+$/);
await settle();
await page.getByRole("button", { name: "Delete template" }).click();
await page.getByRole("button", { name: "Confirm delete" }).click();
await page.waitForURL(/spec-library$/);
await check((await one("select count(*) as n from specification_templates where name = ?", [tmpTplName])).n == 0, "template deleted");

// Insert from library (labelled "Presets" on the estimate tab)
await page.goto(`${base}/estimates/${id}/specifications`);
await settle();
await page.getByRole("button", { name: "Presets" }).click();
await page.getByRole("dialog").getByRole("listitem").filter({ hasText: `${tplName} v2` }).getByRole("button", { name: "Insert" }).click();
await check(seen(page.getByTestId("spec-node").filter({ hasText: "Painting" })), "library sections inserted");
await page.getByTestId("spec-save").click();
await page.getByTestId("spec-saved").waitFor();
await check(Number((await one("select count(*) as n from specifications where estimate_id = ?", [id])).n) === 5, "inserted sections persisted (5)");

console.log("Quote tab");
await page.goto(`${base}/estimates/${id}/quote`);
await settle();
const opts = await one("select * from quote_options where estimate_id = ?", [id]);
await check(opts && opts.valid_days === 30 && String(opts.cover_letter).includes("[ClientName]"), "quote options created with defaults");
const doc = page.getByTestId("quote-document");
await check(seen(doc.getByText("Dear (sample) Jordan Lee,")), "cover letter merge fields resolved");
const totalText = await doc.getByTestId("quote-total").textContent();
const estRow = await one("select quote_total from estimates where id = ?", [id]);
await check(totalText.replace(/[^0-9.]/g, "") === Number(estRow.quote_total).toFixed(2), `total matches estimate (${totalText})`);
await check(seen(doc.getByTestId("quote-allowances").getByText("Prime cost (PC) allowances total")), "PC allowance total shown");
await check(seen(doc.getByTestId("quote-specifications").getByText("Painting")), "specifications in preview");
await check(seen(doc.getByTestId("quote-specifications").getByText("Skip bin 6m3")), "inclusions in preview");

// Live preview reacts to options
await page.getByLabel("Title").fill("Fixed price quotation");
await check(seen(doc.getByTestId("quote-title").getByText("Fixed price quotation")), "title updates live");
await page.getByRole("checkbox", { name: "Items", exact: true }).check();
await page.getByRole("checkbox", { name: "Item prices" }).check();
await check(seen(doc.getByTestId("quote-item").filter({ hasText: "Skip bin 6m3" })), "items shown when enabled");
await check(!(await doc.getByTestId("quote-item").filter({ hasText: "Vanity, toilet" }).count()), "PC item not in scope list");
await page.getByLabel("PC allowances").selectOption("show_items");
await check(seen(doc.getByTestId("quote-allowances").getByText("Vanity, toilet & tapware allowance")), "PC show items");
await page.getByLabel("PS allowances").selectOption("hide");
await check(!(await doc.getByText("Provisional sum (PS) allowances total").count()), "PS hidden");
await page.getByRole("checkbox", { name: "Show cost and markup in totals" }).check();
await check(seen(doc.getByTestId("quote-totals").getByText("Contingency (2%)")), "markup lines shown");
await page.getByRole("checkbox", { name: "Client initials on every page" }).check();
await check(seen(doc.getByTestId("quote-initials")), "initials area shown");
await page.getByRole("checkbox", { name: "Specifications", exact: true }).uncheck();
await check(!(await doc.getByTestId("quote-specifications").count()), "specifications hidden");
await page.getByRole("checkbox", { name: "Specifications", exact: true }).check();
await page.getByLabel("Valid for (days)").fill("14");
await page.getByTestId("quote-save").click();
await page.getByTestId("quote-saved").waitFor();
const saved = await one("select * from quote_options where estimate_id = ?", [id]);
await check(saved.title === "Fixed price quotation" && saved.valid_days === 14 && saved.print_items === 1 && saved.print_item_totals === 1 && saved.show_markup === 1 && saved.pc_print_option === "show_items" && saved.ps_print_option === "hide" && saved.print_initials_area === 1, "options persisted");
await page.reload();
await settle();
await check((await page.getByLabel("Title").inputValue()) === "Fixed price quotation", "options reload from DB");

// Validation
await page.getByLabel("Valid for (days)").fill("0");
await page.getByTestId("quote-save").click();
await check(page.getByLabel("Valid for (days)").evaluate((el) => !el.validity.valid), "invalid valid-days blocked by validation");
await check((await one("select valid_days from quote_options where estimate_id = ?", [id])).valid_days === 14, "invalid value not saved");
await page.reload();
await settle();

// Mark as sent
await page.getByRole("button", { name: "Mark as sent" }).click();
await page.getByText(/^Sent \d/).waitFor();
const sentRow = await one("select status, sent_at from estimates where id = ?", [id]);
await check(sentRow.status === "Sent" && !!sentRow.sent_at, "marked as sent (status + sentAt)");

// Print view
await page.goto(`${base}/estimates/${id}/quote/print`);
await check(seen(page.getByTestId("quote-title").getByText("Fixed price quotation")), "print view renders saved options");
await check(page.waitForFunction(() => window.__printed === true, null, { timeout: 5000 }).then(() => true).catch(() => false), "print dialog requested");
await check(page.evaluate(() => !!document.elementFromPoint(40, 300)?.closest(".quote-print-sheet")), "print view covers app chrome");
await page.goto(`${base}/estimates/${id}/quote`);
await settle();

console.log("Client link + public quote");
await page.getByRole("button", { name: "Create client link" }).click();
const urlInput = page.getByTestId("share-url");
await urlInput.waitFor();
const shareUrl = await urlInput.inputValue();
await check(/\/q\/[A-Za-z0-9_-]{20,}$/.test(shareUrl), "share URL generated");
const token = shareUrl.split("/q/")[1];

await check((await page.request.get(`${base}/q/does-not-exist-token-123456`)).status() === 404, "invalid token -> 404");



const pub = await page.goto(`${base}/q/${token}`);
await settle();
await check(pub.status() === 200, "public page 200");
await check(seen(page.getByTestId("quote-document")), "public quote document shown");
await check(!(await page.locator("aside").count()), "no app chrome");
await page.getByRole("button", { name: "Accept quote" }).click();
// browser validation blocks empty name; fill name but not checkbox
await page.getByLabel("Full name").fill("Jordan Lee");
await page.getByRole("button", { name: "Accept quote" }).click();
await check(page.getByRole("alert").getByText(/Tick the box/).waitFor().then(() => true), "checkbox required");
await check((await one("select acceptance_signed_at as s from quote_options where estimate_id = ?", [id])).s === null, "not accepted without checkbox");
await page.getByLabel("I accept the quote and terms").check();
await page.getByRole("button", { name: "Accept quote" }).click();
await page.getByTestId("accept-confirmation").waitFor();
await check(true, "acceptance confirmation shown");
const acc = await one("select e.status, e.accepted_at, q.acceptance_signature_name as n, q.acceptance_signed_at as s from estimates e join quote_options q on q.estimate_id = e.id where e.id = ?", [id]);
await check(acc.status === "Accepted" && acc.accepted_at && acc.n === "Jordan Lee" && acc.s, "acceptance persisted (status Accepted)");
const act = await one("select count(*) as n from activity where entity_id = ? and action = 'quote_accepted'", [id]);
await check(Number(act.n) >= 1, "activity logged");
await page.reload();
await settle();
await check(seen(page.getByTestId("already-accepted")), "already-accepted state");
await check(!(await page.getByTestId("accept-form").count()), "accept form hidden after acceptance");

// Revoke link
await page.goto(`${base}/estimates/${id}/quote`);
await settle();
await check(seen(page.getByText(/Accepted by Jordan Lee/)), "builder sees acceptance");
await page.getByRole("button", { name: "Revoke" }).click();
await page.getByRole("button", { name: "Confirm revoke" }).click();
await page.getByRole("button", { name: "Create client link" }).waitFor();
const res = await page.request.get(`${base}/q/${token}`);
await check(res.status() === 404, "revoked link -> 404");

await purgeEstimate(id);
await dbc.execute({ sql: "delete from specification_templates where id = ?", args: [tpl?.id ?? ""] });
await done();
