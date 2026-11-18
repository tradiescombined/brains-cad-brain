"use server";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calcLoaded, loadEstimate } from "@/lib/estimates";
import { getTaxRates, logActivity, nextNumber } from "@/lib/settings";
import { todayIso } from "@/lib/format";
import {
  isValidIsoDate,
  normaliseDuration,
  parseDependsOn,
  rescheduleDependants,
  sequentialChain,
  shiftSchedule as shiftTasks,
  snapToWorkingDay,
  suggestedDuration,
  taskFinish,
  wouldCreateCycle,
} from "@/lib/scheduling";
import { COST_TYPES, JOB_STATUSES, SELECTION_STATUSES, type ActionResult } from "../schedule/_lib/constants";

// ---------- helpers ----------
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => s(fd, k) || null;
function numOrNull(fd: FormData, k: string): number | null {
  const v = s(fd, k).replace(/[$,\s]/g, "");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (): ActionResult => ({ ok: true, at: Date.now() });

function revalidateJob(jobId: string) {
  revalidatePath(`/jobs/${jobId}`, "layout");
  revalidatePath("/jobs");
  revalidatePath("/schedule");
}

async function requireJob(jobId: string) {
  if (!jobId) return null;
  const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  return j ?? null;
}

function optDate(fd: FormData, k: string, label: string): string | null | Error {
  const v = s(fd, k);
  if (!v) return null;
  return isValidIsoDate(v) ? v : new Error(`${label} is not a valid date.`);
}

// ---------- jobs ----------
export async function createJobFromEstimate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const estimateId = s(fd, "estimateId");
  if (!estimateId) return fail("Choose an estimate to create the job from.");
  const l = await loadEstimate(estimateId);
  if (!l) return fail("That estimate no longer exists.");
  if (l.estimate.jobId) {
    const existing = await requireJob(l.estimate.jobId);
    if (existing && !existing.archived) return fail(`This estimate already has a job (${existing.number}).`);
  }
  const startDate = optDate(fd, "startDate", "Start date");
  if (startDate instanceof Error) return fail(startDate.message);
  const starter = fd.get("starterSchedule") === "on";

  const r = calcLoaded(l);
  const byId = new Map(l.items.map((i) => [i.id, i]));
  const rootOf = (id: string) => {
    let cur = byId.get(id)!;
    while (cur.parentId && byId.has(cur.parentId)) cur = byId.get(cur.parentId)!;
    return cur;
  };
  const number = await nextNumber("Job");
  const e = l.estimate;
  const [job] = await db
    .insert(schema.jobs)
    .values({
      number,
      name: e.name,
      estimateId: e.id,
      clientId: e.clientId,
      status: "Not started",
      siteAddress: e.siteAddress,
      siteCityTown: e.siteCityTown,
      siteState: e.siteState,
      sitePostcode: e.sitePostcode,
      startDate: startDate ?? null,
      contractValue: e.quoteTotal,
    })
    .returning();

  // One budget line per costing leaf, in display order.
  const lines: (typeof schema.jobBudgetLines.$inferInsert)[] = [];
  const catBudget = new Map<string, number>();
  for (const id of r.order) {
    const it = byId.get(id);
    const ri = r.items[id];
    if (!it || !ri || it.kind === "category" || ri.hasChildren) continue;
    const root = rootOf(id);
    const category = root.kind === "category" ? root.description || "Uncategorised" : "General";
    lines.push({
      jobId: job.id,
      category,
      description: it.description || "(no description)",
      costType: it.costType,
      uom: it.uom,
      quantity: ri.effectiveQuantity,
      unitCost: ri.unitCost,
      budget: ri.total,
      sortOrder: lines.length + 1,
    });
    catBudget.set(category, (catBudget.get(category) ?? 0) + ri.total);
  }
  if (lines.length) await db.insert(schema.jobBudgetLines).values(lines);

  if (starter) {
    const cats = r.order.map((id) => byId.get(id)!).filter((i) => i && i.kind === "category" && !i.parentId);
    const chain = sequentialChain(
      cats.map((c) => ({ name: c.description || "Stage", durationDays: suggestedDuration(catBudget.get(c.description || "Uncategorised") ?? 0) })),
      startDate ?? todayIso(),
      () => crypto.randomUUID(),
    );
    if (chain.length) {
      await db.insert(schema.jobTasks).values(
        chain.map((t, i) => ({ id: t.id, jobId: job.id, name: t.name, startDate: t.startDate, durationDays: t.durationDays, dependsOn: JSON.stringify(t.dependsOn), sortOrder: i + 1 })),
      );
      const last = chain[chain.length - 1];
      await db.update(schema.jobs).set({ startDate: chain[0].startDate, endDate: taskFinish(last) }).where(eq(schema.jobs.id, job.id));
    }
  }

  await db.update(schema.estimates).set({ jobId: job.id }).where(eq(schema.estimates.id, e.id));
  await logActivity("job", job.id, "created", `Job ${number} created from estimate ${e.number}`);
  revalidatePath("/jobs");
  revalidatePath(`/estimates/${e.id}`, "layout");
  redirect(`/jobs/${job.id}`);
}

export async function createBlankJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const name = s(fd, "name");
  if (!name) return fail("Job name is required.");
  const startDate = optDate(fd, "startDate", "Start date");
  if (startDate instanceof Error) return fail(startDate.message);
  const cv = numOrNull(fd, "contractValue");
  if (Number.isNaN(cv) || (cv !== null && cv < 0)) return fail("Contract value must be a positive number.");
  const number = await nextNumber("Job");
  const [job] = await db
    .insert(schema.jobs)
    .values({
      number,
      name,
      clientId: opt(fd, "clientId"),
      siteAddress: opt(fd, "siteAddress"),
      siteCityTown: opt(fd, "siteCityTown"),
      siteState: opt(fd, "siteState"),
      sitePostcode: opt(fd, "sitePostcode"),
      startDate,
      contractValue: r2(cv ?? 0),
      description: opt(fd, "description"),
      projectManager: opt(fd, "projectManager"),
    })
    .returning();
  await logActivity("job", job.id, "created", `Job ${number} created`);
  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export async function updateJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = s(fd, "id");
  const job = await requireJob(id);
  if (!job) return fail("Job not found.");
  const name = s(fd, "name");
  if (!name) return fail("Job name is required.");
  const status = s(fd, "status");
  if (!(JOB_STATUSES as readonly string[]).includes(status)) return fail("Choose a valid status.");
  const startDate = optDate(fd, "startDate", "Start date");
  if (startDate instanceof Error) return fail(startDate.message);
  const endDate = optDate(fd, "endDate", "Finish date");
  if (endDate instanceof Error) return fail(endDate.message);
  if (startDate && endDate && endDate < startDate) return fail("Finish date can't be before the start date.");
  const cv = numOrNull(fd, "contractValue");
  if (Number.isNaN(cv) || (cv !== null && cv < 0)) return fail("Contract value must be a positive number.");
  await db
    .update(schema.jobs)
    .set({
      name,
      status: status as (typeof JOB_STATUSES)[number],
      startDate,
      endDate,
      projectManager: opt(fd, "projectManager"),
      siteAddress: opt(fd, "siteAddress"),
      siteCityTown: opt(fd, "siteCityTown"),
      siteState: opt(fd, "siteState"),
      sitePostcode: opt(fd, "sitePostcode"),
      description: opt(fd, "description"),
      clientId: opt(fd, "clientId"),
      contractValue: cv === null ? job.contractValue : r2(cv),
    })
    .where(eq(schema.jobs.id, id));
  if (status !== job.status) await logActivity("job", id, "status", `Job ${job.number} status changed to ${status}`);
  revalidateJob(id);
  return ok();
}

export async function archiveJob(fd: FormData) {
  const id = s(fd, "id");
  const job = await requireJob(id);
  if (!job) return;
  await db.update(schema.jobs).set({ archived: true }).where(eq(schema.jobs.id, id));
  if (job.estimateId) await db.update(schema.estimates).set({ jobId: null }).where(and(eq(schema.estimates.id, job.estimateId), eq(schema.estimates.jobId, id)));
  await logActivity("job", id, "archived", `Job ${job.number} archived`);
  revalidatePath("/jobs");
  revalidatePath("/schedule");
  redirect("/jobs");
}

// ---------- schedule ----------
export async function saveTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = s(fd, "jobId");
  if (!(await requireJob(jobId))) return fail("Job not found.");
  const id = s(fd, "id");
  const name = s(fd, "name");
  if (!name) return fail("Task name is required.");
  const start = s(fd, "startDate");
  if (!isValidIsoDate(start)) return fail("Choose a valid start date.");
  const dur = numOrNull(fd, "durationDays");
  if (dur === null || Number.isNaN(dur) || dur < 1 || dur > 2000) return fail("Duration must be between 1 and 2000 working days.");
  const progress = numOrNull(fd, "progress") ?? 0;
  if (Number.isNaN(progress) || progress < 0 || progress > 100) return fail("Progress must be between 0 and 100%.");

  const rows = await db.select().from(schema.jobTasks).where(eq(schema.jobTasks.jobId, jobId)).orderBy(asc(schema.jobTasks.sortOrder));
  if (id && !rows.some((r) => r.id === id)) return fail("Task not found.");
  const ids = new Set(rows.map((r) => r.id));
  const preds = [...new Set(fd.getAll("dependsOn").map(String))].filter((p) => ids.has(p) && p !== id);
  const taskId = id || crypto.randomUUID();
  const before = rows.map((r) => ({ id: r.id, startDate: r.startDate, durationDays: r.durationDays, dependsOn: parseDependsOn(r.dependsOn) }));
  if (id && wouldCreateCycle(before, taskId, preds)) return fail("Those predecessors would create a loop (a task can't depend on its own successors).");

  const edited = { id: taskId, startDate: snapToWorkingDay(start), durationDays: normaliseDuration(dur), dependsOn: preds };
  const after = id ? before.map((t) => (t.id === id ? edited : t)) : [...before, edited];
  const { tasks, moved } = rescheduleDependants(before, after, [taskId]);
  const final = tasks.find((t) => t.id === taskId)!;

  const values = {
    name,
    startDate: final.startDate,
    durationDays: final.durationDays,
    dependsOn: JSON.stringify(preds),
    assigneeContactId: opt(fd, "assigneeContactId"),
    progress: Math.round(progress),
    colour: opt(fd, "colour"),
    notes: opt(fd, "notes"),
  };
  if (id) await db.update(schema.jobTasks).set(values).where(eq(schema.jobTasks.id, id));
  else await db.insert(schema.jobTasks).values({ id: taskId, jobId, sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1, ...values });
  for (const mid of moved) {
    if (mid === taskId) continue;
    await db.update(schema.jobTasks).set({ startDate: tasks.find((t) => t.id === mid)!.startDate }).where(eq(schema.jobTasks.id, mid));
  }
  revalidateJob(jobId);
  return ok();
}

export async function deleteTask(fd: FormData) {
  const id = s(fd, "id");
  const [t] = await db.select().from(schema.jobTasks).where(eq(schema.jobTasks.id, id));
  if (!t) return;
  await db.delete(schema.jobTasks).where(eq(schema.jobTasks.id, id));
  const others = await db.select().from(schema.jobTasks).where(eq(schema.jobTasks.jobId, t.jobId));
  for (const o of others) {
    const deps = parseDependsOn(o.dependsOn);
    if (deps.includes(id)) await db.update(schema.jobTasks).set({ dependsOn: JSON.stringify(deps.filter((d) => d !== id)) }).where(eq(schema.jobTasks.id, o.id));
  }
  revalidateJob(t.jobId);
}

export async function moveTask(fd: FormData) {
  const id = s(fd, "id");
  const dir = s(fd, "dir") === "up" ? -1 : 1;
  const [t] = await db.select().from(schema.jobTasks).where(eq(schema.jobTasks.id, id));
  if (!t) return;
  const rows = await db.select().from(schema.jobTasks).where(eq(schema.jobTasks.jobId, t.jobId)).orderBy(asc(schema.jobTasks.sortOrder), asc(schema.jobTasks.startDate));
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) if (rows[k].sortOrder !== k + 1) await db.update(schema.jobTasks).set({ sortOrder: k + 1 }).where(eq(schema.jobTasks.id, rows[k].id));
  revalidateJob(t.jobId);
}

export async function shiftSchedule(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = s(fd, "jobId");
  const job = await requireJob(jobId);
  if (!job) return fail("Job not found.");
  const n = numOrNull(fd, "days");
  if (n === null || Number.isNaN(n) || !Number.isInteger(n) || n === 0 || Math.abs(n) > 520) return fail("Enter a whole number of working days (e.g. 5 or -3).");
  const rows = await db.select().from(schema.jobTasks).where(eq(schema.jobTasks.jobId, jobId));
  if (rows.length === 0) return fail("There are no tasks to shift.");
  const shifted = shiftTasks(rows.map((r) => ({ ...r, dependsOn: parseDependsOn(r.dependsOn) })), n);
  for (const t of shifted) await db.update(schema.jobTasks).set({ startDate: t.startDate }).where(eq(schema.jobTasks.id, t.id));
  await logActivity("job", jobId, "schedule", `Schedule shifted by ${n} working day${Math.abs(n) === 1 ? "" : "s"}`);
  revalidateJob(jobId);
  return ok();
}

// ---------- budget lines ----------
export async function saveBudgetLine(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = s(fd, "jobId");
  if (!(await requireJob(jobId))) return fail("Job not found.");
  const id = s(fd, "id");
  const category = s(fd, "category");
  const description = s(fd, "description");
  if (!category) return fail("Category is required.");
  if (!description) return fail("Description is required.");
  const costType = s(fd, "costType") || "Material";
  if (!(COST_TYPES as readonly string[]).includes(costType)) return fail("Choose a valid cost type.");
  const quantity = numOrNull(fd, "quantity") ?? 1;
  const unitCost = numOrNull(fd, "unitCost") ?? 0;
  if (Number.isNaN(quantity) || quantity < 0) return fail("Quantity must be zero or more.");
  if (Number.isNaN(unitCost) || unitCost < 0) return fail("Unit cost must be zero or more.");
  const values = { category, description, costType, uom: opt(fd, "uom"), quantity, unitCost, budget: r2(quantity * unitCost) };
  if (id) await db.update(schema.jobBudgetLines).set(values).where(and(eq(schema.jobBudgetLines.id, id), eq(schema.jobBudgetLines.jobId, jobId)));
  else {
    const rows = await db.select({ o: schema.jobBudgetLines.sortOrder }).from(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.jobId, jobId));
    await db.insert(schema.jobBudgetLines).values({ jobId, sortOrder: Math.max(0, ...rows.map((r) => r.o)) + 1, ...values });
  }
  revalidateJob(jobId);
  return ok();
}

export async function deleteBudgetLine(fd: FormData) {
  const id = s(fd, "id");
  const [l] = await db.select().from(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.id, id));
  if (!l) return;
  await db.update(schema.actualCosts).set({ budgetLineId: null }).where(eq(schema.actualCosts.budgetLineId, id));
  await db.delete(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.id, id));
  revalidateJob(l.jobId);
}

// ---------- actual costs ----------
export async function saveActualCost(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = s(fd, "jobId");
  if (!(await requireJob(jobId))) return fail("Job not found.");
  const id = s(fd, "id");
  const date = s(fd, "date");
  if (!isValidIsoDate(date)) return fail("Choose a valid date.");
  const description = s(fd, "description");
  if (!description) return fail("Description is required.");
  const amount = numOrNull(fd, "amount");
  if (amount === null || Number.isNaN(amount)) return fail("Enter the amount (ex tax).");
  let tax = numOrNull(fd, "tax");
  if (Number.isNaN(tax)) return fail("Tax must be a number.");
  if (tax === null) {
    const rates = await getTaxRates();
    const rate = rates.find((t) => t.appliesTo === "expense" && t.isDefault)?.rate ?? 0;
    tax = r2(amount * rate);
  }
  const budgetLineId = opt(fd, "budgetLineId");
  let line: typeof schema.jobBudgetLines.$inferSelect | undefined;
  if (budgetLineId) {
    [line] = await db.select().from(schema.jobBudgetLines).where(and(eq(schema.jobBudgetLines.id, budgetLineId), eq(schema.jobBudgetLines.jobId, jobId)));
    if (!line) return fail("That budget line doesn't belong to this job.");
  }
  const costType = s(fd, "costType") || line?.costType || "Other";
  if (!(COST_TYPES as readonly string[]).includes(costType)) return fail("Choose a valid cost type.");
  const values = { date, description, amount: r2(amount), tax: r2(tax), costType, budgetLineId, supplierId: opt(fd, "supplierId"), reference: opt(fd, "reference") };
  if (id) await db.update(schema.actualCosts).set(values).where(and(eq(schema.actualCosts.id, id), eq(schema.actualCosts.jobId, jobId)));
  else await db.insert(schema.actualCosts).values({ jobId, ...values });
  revalidateJob(jobId);
  return ok();
}

export async function deleteActualCost(fd: FormData) {
  const id = s(fd, "id");
  const [c] = await db.select().from(schema.actualCosts).where(eq(schema.actualCosts.id, id));
  if (!c) return;
  await db.delete(schema.actualCosts).where(eq(schema.actualCosts.id, id));
  revalidateJob(c.jobId);
}

// ---------- timesheets ----------
export async function saveTimesheet(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = s(fd, "jobId");
  if (!(await requireJob(jobId))) return fail("Job not found.");
  const id = s(fd, "id");
  const worker = s(fd, "worker");
  if (!worker) return fail("Worker name is required.");
  const date = s(fd, "date");
  if (!isValidIsoDate(date)) return fail("Choose a valid date.");
  const hours = numOrNull(fd, "hours");
  if (hours === null || Number.isNaN(hours) || hours <= 0 || hours > 24) return fail("Hours must be more than 0 and no more than 24.");
  const rate = numOrNull(fd, "rate") ?? 0;
  if (Number.isNaN(rate) || rate < 0) return fail("Rate must be zero or more.");
  const values = { worker, date, hours: r2(hours), rate: r2(rate), notes: opt(fd, "notes") };
  if (id) await db.update(schema.timesheets).set(values).where(and(eq(schema.timesheets.id, id), eq(schema.timesheets.jobId, jobId)));
  else await db.insert(schema.timesheets).values({ jobId, ...values });
  revalidateJob(jobId);
  return ok();
}

export async function deleteTimesheet(fd: FormData) {
  const id = s(fd, "id");
  const [t] = await db.select().from(schema.timesheets).where(eq(schema.timesheets.id, id));
  if (!t) return;
  await db.delete(schema.timesheets).where(eq(schema.timesheets.id, id));
  revalidateJob(t.jobId);
}

// ---------- selections ----------
export async function saveSelection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const jobId = s(fd, "jobId");
  if (!(await requireJob(jobId))) return fail("Job not found.");
  const id = s(fd, "id");
  const category = s(fd, "category");
  const name = s(fd, "name");
  if (!category) return fail("Category is required.");
  if (!name) return fail("Item is required.");
  const names = fd.getAll("optName").map((v) => String(v).trim());
  const prices = fd.getAll("optPrice").map((v) => String(v).replace(/[$,\s]/g, ""));
  const options: { name: string; price: number }[] = [];
  for (let i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    const p = prices[i] === "" || prices[i] === undefined ? 0 : Number(prices[i]);
    if (!Number.isFinite(p) || p < 0) return fail(`Price for "${names[i]}" must be zero or more.`);
    if (options.some((o) => o.name.toLowerCase() === names[i].toLowerCase())) return fail(`Option "${names[i]}" is listed twice.`);
    options.push({ name: names[i], price: r2(p) });
  }
  const chosen = opt(fd, "chosenOption");
  if (chosen && !options.some((o) => o.name === chosen)) return fail("The chosen option must be one of the listed options.");
  const allowance = numOrNull(fd, "allowance");
  if (Number.isNaN(allowance) || (allowance !== null && allowance < 0)) return fail("Allowance must be zero or more.");
  const dueDate = optDate(fd, "dueDate", "Due date");
  if (dueDate instanceof Error) return fail(dueDate.message);
  let status = s(fd, "status") || "Pending";
  if (!(SELECTION_STATUSES as readonly string[]).includes(status)) return fail("Choose a valid status.");
  if (chosen && status === "Pending") status = "Selected";
  if (!chosen && status !== "Pending") return fail("Pick the chosen option before marking it selected or approved.");
  const values = {
    category,
    name,
    options: JSON.stringify(options),
    chosenOption: chosen,
    allowance: allowance === null ? null : r2(allowance),
    dueDate,
    status: status as (typeof SELECTION_STATUSES)[number],
  };
  if (id) await db.update(schema.selections).set(values).where(and(eq(schema.selections.id, id), eq(schema.selections.jobId, jobId)));
  else await db.insert(schema.selections).values({ jobId, ...values });
  revalidateJob(jobId);
  return ok();
}

export async function deleteSelection(fd: FormData) {
  const id = s(fd, "id");
  const [x] = await db.select().from(schema.selections).where(eq(schema.selections.id, id));
  if (!x) return;
  await db.delete(schema.selections).where(eq(schema.selections.id, id));
  if (x.jobId) revalidateJob(x.jobId);
}
