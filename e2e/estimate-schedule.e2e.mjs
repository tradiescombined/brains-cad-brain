// Estimate schedule: plan tasks at quote stage, print on the quote, carry into the job schedule.
// Run: BASE_URL=http://localhost:31xx node e2e/estimate-schedule.e2e.mjs   (needs the seeded sample estimate Q1000)
// Works on a private copy of the sample estimate; the copy and the job are purged at the end.
import { start, check, done, one, all, RUN, cloneEstimate, purgeEstimate, purgeJob } from "./helpers.mjs";

const sample = await one("select id from estimates where number = 'Q1000' and is_sample = 1");
if (!sample) throw new Error("Sample estimate Q1000 missing - run npm run db:reset");
const estName = `E2E schedule estimate ${RUN}`;
const estNumber = `QE2E-S${RUN}`;
const estId = await cloneEstimate(sample.id, { name: estName, number: estNumber });
let jobId;

const { page, base } = await start();
const dialog = () => page.getByRole("dialog");
const settle = () => page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
const cell = (task, col) => page.locator(`tr[data-task="${task}"] [data-col="${col}"]`).first().innerText();
async function submitDialog(name) {
  await dialog().getByRole("button", { name }).click();
  await dialog().waitFor({ state: "detached" });
  await settle();
}

try {
  console.log("Estimate Schedule tab");
  await page.goto(`${base}/estimates/${estId}`);
  const tab = page.locator(`a[href="/estimates/${estId}/schedule"]`, { hasText: "Schedule" });
  await check(tab.isVisible(), "Schedule tab in the estimate tab bar");
  await tab.click();
  await page.waitForURL(/\/schedule$/);
  await check(page.getByText("No tasks yet. Add a task, or generate one per costing category.").isVisible(), "empty state");

  console.log("Generate from costing categories");
  await page.getByRole("button", { name: "Generate from categories" }).click();
  await dialog().locator('input[name="startDate"]').fill("2026-11-16"); // Monday
  await submitDialog("Generate tasks");
  await check((await page.locator('[data-testid="gantt-bar"]').count()) === 3, "one task per category on the Gantt");
  await check((await cell("Demolition", "start")) === "16 Nov 2026", "first category starts on the chosen date");
  await check((await cell("Waterproofing & tiling", "after")) === "1", "categories are chained (2 after 1)");
  const fixturesFinish = await cell("Fixtures", "finish");

  console.log("Add a task with a dependency");
  await page.getByRole("button", { name: "Add task" }).click();
  await dialog().locator('input[name="name"]').fill("Site handover");
  await dialog().locator('input[name="startDate"]').fill("2026-11-16");
  await dialog().locator('input[name="durationDays"]').fill("1");
  await dialog().locator("label", { hasText: "Fixtures" }).locator('input[type="checkbox"]').check();
  await submitDialog("Add task");
  await check((await cell("Site handover", "after")) === "3", "handover depends on Fixtures (#3)");
  const handoverStart = await cell("Site handover", "start");
  await check(new Date(handoverStart) > new Date(fixturesFinish), `handover pushed after Fixtures (${fixturesFinish} → ${handoverStart})`);

  console.log("Dependency loops are rejected");
  await page.locator('tr[data-task="Demolition"]').getByRole("button", { name: "Edit" }).click();
  await dialog().locator("label", { hasText: "Site handover" }).locator('input[type="checkbox"]').check();
  await dialog().getByRole("button", { name: "Save task" }).click();
  await check(dialog().getByRole("alert").filter({ hasText: "loop" }).waitFor().then(() => true), "loop rejected with an inline error");
  await dialog().getByRole("button", { name: "Close" }).click();

  console.log("Editing a duration shifts dependants");
  await page.locator('tr[data-task="Fixtures"]').getByRole("button", { name: "Edit" }).click();
  const fixturesDur = Number(await dialog().locator('input[name="durationDays"]').inputValue());
  await dialog().locator('input[name="durationDays"]').fill(String(fixturesDur + 2));
  await submitDialog("Save task");
  const handoverStart2 = await cell("Site handover", "start");
  await check(new Date(handoverStart2) > new Date(handoverStart), `handover moved later (${handoverStart} → ${handoverStart2})`);

  console.log("Start date shifts everything");
  await page.getByRole("button", { name: "Set start date" }).click();
  await dialog().locator('input[name="startDate"]').fill("2026-11-23");
  await submitDialog("Move schedule");
  await check((await cell("Demolition", "start")) === "23 Nov 2026", "first task moved to Mon 23 Nov");
  const estRows = await all("select name, start_date, duration_days, depends_on from estimate_tasks where estimate_id = ? order by sort_order", [estId]);
  await check(estRows.length === 4 && estRows[0].start_date === "2026-11-23", "estimate tasks persisted");

  console.log("Schedule on the quote");
  await page.goto(`${base}/estimates/${estId}/quote`);
  await check((await page.locator('[data-testid="quote-schedule"]').count()) === 0, "schedule hidden on the quote by default");
  await page.getByLabel("Schedule summary (tasks and dates)").check();
  await check(page.locator('[data-testid="quote-schedule"]').isVisible(), "live preview shows the schedule");
  await page.getByTestId("quote-save").click();
  await page.getByTestId("quote-saved").waitFor();
  const qo = await one("select print_schedule from quote_options where estimate_id = ?", [estId]);
  await check(Number(qo?.print_schedule) === 1, "printSchedule saved");
  await page.reload();
  const qs = await page.locator('[data-testid="quote-schedule"]').innerText();
  await check(qs.includes("Site handover") && qs.includes("Demolition") && qs.includes("23 Nov 2026"), "quote lists tasks with dates");
  await check(page.getByLabel("Schedule summary (tasks and dates)").isChecked(), "toggle persisted");

  console.log("Create job → schedule copied");
  await page.goto(base + "/jobs/new");
  await page.selectOption('select[name="estimateId"]', estId);
  await check(page.getByText("Copy the estimate schedule").isVisible(), "new job form offers to copy the estimate schedule");
  await page.fill('input[name="startDate"]', "2026-12-07"); // Monday, 10 working days after 23 Nov
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  jobId = page.url().split("/").pop();
  await settle();

  const jobRows = await all("select id, name, start_date, duration_days, depends_on from job_tasks where job_id = ? order by sort_order", [jobId]);
  await check(jobRows.length === 4, "all 4 estimate tasks copied (no starter schedule)");
  await check(jobRows.map((r) => r.name).join("|") === estRows.map((r) => r.name).join("|"), "task order kept");
  const jobIds = new Set(jobRows.map((r) => r.id));
  const estIds = new Set((await all("select id from estimate_tasks where estimate_id = ?", [estId])).map((r) => r.id));
  const deps = jobRows.flatMap((r) => JSON.parse(r.depends_on));
  await check(deps.length === 3 && deps.every((d) => jobIds.has(d) && !estIds.has(d)), "dependencies remapped to the job's own task ids");
  const handover = jobRows.find((r) => r.name === "Site handover");
  const fixtures = jobRows.find((r) => r.name === "Fixtures");
  await check(JSON.parse(handover.depends_on)[0] === fixtures.id, "handover still depends on Fixtures");
  await check(jobRows.every((r, i) => r.duration_days === estRows[i].duration_days), "durations kept");
  await check(jobRows[0].start_date === "2026-12-07", "first task starts on the job start date");
  const job = await one("select start_date, end_date from jobs where id = ?", [jobId]);
  await check(job.start_date === "2026-12-07" && !!job.end_date, "job start/end set from the copied schedule");

  await page.goto(`${base}/jobs/${jobId}/schedule`);
  await check((await page.locator('[data-testid="gantt-bar"]').count()) === 4, "job Gantt shows the copied tasks");
  await check((await cell("Demolition", "start")) === "7 Dec 2026", "job schedule starts 7 Dec");
  await check((await cell("Site handover", "after")) === "3", "job task table shows the dependency");
  // Offset is 10 working days = exactly two calendar weeks here.
  const plus14 = (iso) => new Date(Date.parse(iso + "T00:00:00Z") + 14 * 86400000).toISOString().slice(0, 10);
  await check(jobRows.every((r, i) => r.start_date === plus14(estRows[i].start_date)), "every task offset by the same working days (gaps kept)");
} finally {
  await purgeJob(jobId);
  await purgeEstimate(estId);
}
await done();
