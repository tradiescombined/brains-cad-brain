// Module 9 — Jobs, Schedule, Cost tracking, Timesheets, Selections.
// Run: BASE_URL=http://localhost:3109 node e2e/jobs.e2e.mjs   (needs the seeded sample estimate Q1000)
// Creates the job from a private copy of the sample estimate (creating a job links the estimate),
// so the seed estimate is never mutated. Both jobs and the copy are purged at the end.
import { start, check, done, one, RUN, cloneEstimate, purgeEstimate, purgeJob } from "./helpers.mjs";

const sample = await one("select id from estimates where number = 'Q1000' and is_sample = 1");
if (!sample) throw new Error("Sample estimate Q1000 missing - run npm run db:reset");
const estName = `E2E job estimate ${RUN}`;
const estNumber = `QE2E-J${RUN}`;
const cloneId = await cloneEstimate(sample.id, { name: estName, number: estNumber });
const blankName = `E2E blank shed job ${RUN}`;
let jobId, blankId;

const { page, base } = await start();
const dialog = () => page.getByRole("dialog");
const settle = () => page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
const rowText = (sel) => page.locator(sel).first().innerText();
async function submitDialog(name) {
  await dialog().getByRole("button", { name }).click();
  await dialog().waitFor({ state: "detached" });
  await settle();
}
async function confirmDelete(rowSel) {
  await page.locator(rowSel).first().getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(rowSel).first().getByRole("button", { name: "Delete?" }).click();
  await page.locator(rowSel).waitFor({ state: "detached" }).catch(() => {});
  await settle();
}

try {
  console.log("Jobs list & create from estimate");
  await page.goto(base + "/jobs");
  await check(page.getByRole("heading", { name: "Jobs" }).isVisible(), "jobs list renders");

  await page.goto(base + "/jobs/new");
  const est = await page.locator('select[name="estimateId"] option', { hasText: estNumber }).first().getAttribute("value");
  await check(est === cloneId, "own copy of the sample estimate offered");
  await page.selectOption('select[name="estimateId"]', est);
  await page.fill('input[name="startDate"]', "2026-11-16"); // Monday
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  await settle();
  const jobUrl = page.url();
  jobId = jobUrl.split("/").pop();
  await check(page.getByRole("heading", { name: estName }).isVisible(), "job created with estimate name");
  const cards = await rowText('[data-testid="finance-cards"]');
  await check(cards.includes("$11,995.50"), "contract value = quote total");
  const budgetTxt = await page.locator("table").first().innerText();
  await check(["Demolition", "Waterproofing & tiling", "Fixtures"].every((c) => budgetTxt.includes(c)), "budget vs actual lists estimate categories");
  await check(budgetTxt.includes("$9,087.50"), "budget total equals estimate cost");

  console.log("Edit job details");
  await page.selectOption('select[name="status"]', "In progress");
  await page.fill('input[name="projectManager"]', "Casey Builder");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.getByText("Job details saved.").waitFor();
  await page.reload();
  await check((await page.inputValue('input[name="projectManager"]')) === "Casey Builder", "project manager persisted");
  await check((await page.inputValue('select[name="status"]')) === "In progress", "status persisted");

  console.log("Schedule");
  await page.goto(jobUrl + "/schedule");
  await check((await page.locator('[data-testid="gantt-bar"]').count()) === 3, "starter schedule has one task per category");
  await check(page.locator('[data-testid="today-line"]').isVisible(), "today line shown");
  await check((await rowText('tr[data-task="Fixtures"] [data-col="finish"]')) === "19 Nov 2026", "Fixtures initially finishes Thu 19 Nov");
  await page.locator('tr[data-task="Demolition"]').getByRole("button", { name: "Edit" }).click();
  await dialog().locator('input[name="durationDays"]').fill("3");
  await submitDialog("Save task");
  await check((await rowText('tr[data-task="Waterproofing & tiling"] [data-col="start"]')) === "19 Nov 2026", "dependant shifted to Thu 19 Nov");
  await check((await rowText('tr[data-task="Fixtures"] [data-col="finish"]')) === "23 Nov 2026", "chain shifted over the weekend to Mon 23 Nov");

  await page.getByRole("button", { name: "Add task" }).click();
  await dialog().locator('input[name="name"]').fill("Final clean");
  await dialog().locator('input[name="durationDays"]').fill("1");
  await dialog().locator("label", { hasText: "Fixtures" }).locator('input[type="checkbox"]').check();
  await dialog().locator('input[name="startDate"]').fill("2026-11-16");
  await submitDialog("Add task");
  await check((await rowText('tr[data-task="Final clean"] [data-col="start"]')) === "24 Nov 2026", "new task pushed after its predecessor");

  await page.getByRole("button", { name: "Shift schedule" }).click();
  await dialog().locator('input[name="days"]').fill("0");
  await dialog().getByRole("button", { name: "Shift tasks" }).click();
  await check(dialog().getByRole("alert").waitFor().then(() => true), "shift validation error shown");
  await dialog().locator('input[name="days"]').fill("1");
  await submitDialog("Shift tasks");
  await check((await rowText('tr[data-task="Demolition"] [data-col="start"]')) === "17 Nov 2026", "whole schedule shifted by 1 working day");

  await page.locator('tr[data-task="Final clean"]').getByRole("button", { name: "Move Final clean up" }).click();
  await check(
    page
      .waitForFunction(() => [...document.querySelectorAll('[data-testid="task-table"] tbody tr')].map((r) => r.getAttribute("data-task")).indexOf("Final clean") === 2)
      .then(() => true),
    "task reordered up",
  );
  await confirmDelete('tr[data-task="Final clean"]');
  await check((await page.locator('tr[data-task="Final clean"]').count()) === 0, "task deleted");
  await page.goto(jobUrl + "/schedule?zoom=week");
  await check((await page.locator('[data-testid="gantt-bar"]').count()) === 3, "week zoom renders");

  console.log("Cost tracking");
  await page.goto(jobUrl + "/costs");
  await page.getByRole("button", { name: "Add cost" }).click();
  await dialog().locator('input[name="description"]').fill("Skip bin hire invoice");
  await dialog().locator('input[name="reference"]').fill("INV-778");
  await dialog().locator('input[name="amount"]').fill("600");
  const lineVal = await dialog().locator('select[name="budgetLineId"] option', { hasText: "Skip bin" }).getAttribute("value");
  await dialog().locator('select[name="budgetLineId"]').selectOption(lineVal);
  await submitDialog("Add cost");
  await check((await rowText('[data-testid="cost-total"]')) === "$600.00", "cost recorded");
  await check(page.locator('[data-testid="budget-table"] tr', { hasText: "Skip bin 6m3" }).getByText("Over").isVisible(), "over-budget line highlighted");
  await page.locator('tr[data-cost="Skip bin hire invoice"]').getByRole("button", { name: "Edit" }).click();
  await check((await dialog().locator('input[name="tax"]').inputValue()) === "60", "GST on expenses defaulted");
  await dialog().locator('input[name="amount"]').fill("650");
  await submitDialog("Save cost");
  await check((await rowText('[data-testid="cost-total"]')) === "$650.00", "cost edit persisted");
  await page.goto(jobUrl);
  await check((await rowText('[data-testid="finance-cards"]')).includes("$650.00 costs"), "overview actual cost includes the cost");
  await page.goto(jobUrl + "/costs");
  await confirmDelete('tr[data-cost="Skip bin hire invoice"]');
  await check((await page.locator('tr[data-cost="Skip bin hire invoice"]').count()) === 0, "cost deleted");

  console.log("Timesheets");
  await page.goto(jobUrl + "/timesheets");
  await page.getByRole("button", { name: "Add entry" }).click();
  await dialog().locator('input[name="worker"]').fill("Alex Chippy");
  await dialog().locator('input[name="date"]').fill("2026-11-17");
  await dialog().locator('input[name="hours"]').fill("8");
  await dialog().locator('input[name="rate"]').fill("65");
  await submitDialog("Add entry");
  await check((await rowText('[data-testid="by-worker"]')).includes("$520.00"), "worker total 8h × $65");
  await page.locator('tr[data-entry="Alex Chippy"]').getByRole("button", { name: "Edit" }).click();
  await dialog().locator('input[name="hours"]').fill("6");
  await submitDialog("Save entry");
  await check((await rowText('[data-testid="by-week"]')).includes("$390.00"), "weekly total updated after edit");
  await confirmDelete('tr[data-entry="Alex Chippy"]');
  await check(page.getByText("No time recorded").isVisible(), "timesheet entry deleted");

  console.log("Selections");
  await page.goto(jobUrl + "/selections");
  await page.getByRole("button", { name: "Add selection" }).click();
  await dialog().locator('input[name="category"]').fill("Bathroom");
  await dialog().locator('input[name="name"]').fill("Vanity");
  await dialog().getByLabel("Option 1 name").fill("Basic");
  await dialog().getByLabel("Option 1 price").fill("900");
  await dialog().getByRole("button", { name: "+ Add option" }).click();
  await dialog().getByLabel("Option 2 name").fill("Premium");
  await dialog().getByLabel("Option 2 price").fill("1500");
  await dialog().locator('input[name="allowance"]').fill("1000");
  await dialog().locator('select[name="chosenOption"]').selectOption("Premium");
  await check(dialog().getByText("$500.00 over allowance").isVisible(), "live allowance difference");
  await submitDialog("Add selection");
  await check((await rowText('tr[data-selection="Vanity"] [data-col="difference"]')) === "+$500.00", "selection saved with difference");
  await check(page.locator('tr[data-selection="Vanity"]').getByText("Selected").isVisible(), "status auto-set to Selected");
  await page.locator('tr[data-selection="Vanity"]').getByRole("button", { name: "Edit" }).click();
  await dialog().locator('select[name="chosenOption"]').selectOption("Basic");
  await submitDialog("Save selection");
  await check((await rowText('tr[data-selection="Vanity"] [data-col="difference"]')) === "-$100.00", "selection edit persisted");
  await confirmDelete('tr[data-selection="Vanity"]');
  await check(page.getByText("No selections yet").isVisible(), "selection deleted");

  console.log("Notes & files");
  await page.goto(jobUrl + "/files");
  await page.fill('textarea[name="body"]', "Site access via side gate.");
  await page.getByRole("button", { name: "Add note" }).click();
  await check(page.getByText("Site access via side gate.").waitFor().then(() => true), "note added");

  console.log("Company schedule & list");
  await page.goto(base + "/schedule");
  await check(page.getByRole("link", { name: estName }).first().isVisible(), "job grouped on company schedule");
  await page.selectOption('select[name="job"]', jobId);
  await page.getByRole("button", { name: "Apply" }).click();
  await settle();
  await check((await page.locator('[data-testid="gantt-row"]').count()) === 3, "filter by job");
  await page.goto(base + "/schedule?zoom=month");
  await check(page.locator('[data-testid="gantt-bar"]').first().isVisible(), "month zoom renders");
  await page.goto(base + `/jobs?q=${RUN}&status=all`);
  await check(page.getByRole("link", { name: estName }).first().isVisible(), "search finds job");

  console.log("Blank job + archive");
  await page.goto(base + "/jobs/new?mode=blank");
  await page.fill('input[name="name"]', blankName);
  await page.fill('input[name="contractValue"]', "5,500");
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  await settle();
  blankId = page.url().split("/").pop();
  await check((await rowText('[data-testid="finance-cards"]')).includes("$5,500.00"), "blank job contract value");
  for (const url of [page.url(), jobUrl]) {
    await page.goto(url);
    await page.getByRole("button", { name: "Archive job" }).click();
    await page.getByRole("button", { name: "Yes, archive job" }).click();
    await page.waitForURL(/\/jobs$/);
  }
  await page.goto(base + "/jobs?status=all");
  await check((await page.getByText(blankName).count()) === 0, "archived job hidden from list");
} catch (e) {
  if (process.env.DEBUG_SHOT) { console.log(String(e).slice(0, 600), page.url()); await page.screenshot({ path: process.env.DEBUG_SHOT, fullPage: true }); }
  await check(Promise.reject(e), "unexpected error");
} finally {
  await purgeJob(jobId);
  await purgeJob(blankId);
  await purgeEstimate(cloneId);
}
await done();
