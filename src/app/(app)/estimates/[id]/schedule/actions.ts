"use server";
/**
 * Estimate schedule (planned at quote stage). Same rules as the job schedule (src/lib/scheduling.ts):
 * working days, finish-to-start links, dependants shift, loops rejected. Copied into the job
 * schedule by createJobFromEstimate.
 */
import { denied, requirePermission } from "@/lib/permissions";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { calcLoaded, loadEstimate } from "@/lib/estimates";
import { logActivity } from "@/lib/settings";
import {
  isValidIsoDate,
  offsetScheduleTo,
  parseDependsOn,
  planTaskSave,
  scheduleStart,
  sequentialChain,
  suggestedDuration,
} from "@/lib/scheduling";
import type { ActionResult } from "../../../schedule/_lib/constants";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => s(fd, k) || null;
const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (): ActionResult => ({ ok: true, at: Date.now() });

function revalidate(estimateId: string) {
  revalidatePath(`/estimates/${estimateId}/schedule`);
  revalidatePath(`/estimates/${estimateId}/quote`);
}

async function estimateExists(estimateId: string) {
  if (!estimateId) return false;
  const [e] = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(eq(schema.estimates.id, estimateId));
  return !!e;
}

function loadRows(estimateId: string) {
  return db.select().from(schema.estimateTasks).where(eq(schema.estimateTasks.estimateId, estimateId)).orderBy(asc(schema.estimateTasks.sortOrder), asc(schema.estimateTasks.startDate));
}

export async function saveEstimateTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const denial = await denied("estimates.edit");
  if (denial) return fail(denial);
  const estimateId = s(fd, "estimateId");
  if (!(await estimateExists(estimateId))) return fail("Estimate not found.");
  const id = s(fd, "id");
  const name = s(fd, "name");
  if (!name) return fail("Task name is required.");
  const start = s(fd, "startDate");
  if (!isValidIsoDate(start)) return fail("Choose a valid start date.");
  const dur = Number(s(fd, "durationDays"));
  if (!s(fd, "durationDays") || !Number.isFinite(dur) || dur < 1 || dur > 2000) return fail("Duration must be between 1 and 2000 working days.");

  const rows = await loadRows(estimateId);
  const before = rows.map((r) => ({ id: r.id, startDate: r.startDate, durationDays: r.durationDays, dependsOn: parseDependsOn(r.dependsOn) }));
  const plan = planTaskSave(before, { id, newId: crypto.randomUUID(), startDate: start, durationDays: dur, dependsOn: fd.getAll("dependsOn").map(String) });
  if (!plan.ok) return fail(plan.error);

  const values = {
    name: name.slice(0, 200),
    startDate: plan.final.startDate,
    durationDays: plan.final.durationDays,
    dependsOn: JSON.stringify(plan.preds),
    assigneeContactId: opt(fd, "assigneeContactId"),
    colour: opt(fd, "colour"),
    notes: opt(fd, "notes"),
  };
  await db.transaction(async (tx) => {
    if (id) await tx.update(schema.estimateTasks).set(values).where(eq(schema.estimateTasks.id, id));
    else await tx.insert(schema.estimateTasks).values({ id: plan.id, estimateId, sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1, ...values });
    for (const mid of plan.moved) {
      if (mid === plan.id) continue;
      await tx.update(schema.estimateTasks).set({ startDate: plan.tasks.find((t) => t.id === mid)!.startDate }).where(eq(schema.estimateTasks.id, mid));
    }
  });
  revalidate(estimateId);
  return ok();
}

export async function deleteEstimateTask(fd: FormData) {
  await requirePermission("estimates.edit");
  const id = s(fd, "id");
  const [t] = await db.select().from(schema.estimateTasks).where(eq(schema.estimateTasks.id, id));
  if (!t) return;
  await db.delete(schema.estimateTasks).where(eq(schema.estimateTasks.id, id));
  const others = await db.select().from(schema.estimateTasks).where(eq(schema.estimateTasks.estimateId, t.estimateId));
  for (const o of others) {
    const deps = parseDependsOn(o.dependsOn);
    if (deps.includes(id)) await db.update(schema.estimateTasks).set({ dependsOn: JSON.stringify(deps.filter((d) => d !== id)) }).where(eq(schema.estimateTasks.id, o.id));
  }
  revalidate(t.estimateId);
}

export async function moveEstimateTask(fd: FormData) {
  await requirePermission("estimates.edit");
  const id = s(fd, "id");
  const dir = s(fd, "dir") === "up" ? -1 : 1;
  const [t] = await db.select().from(schema.estimateTasks).where(eq(schema.estimateTasks.id, id));
  if (!t) return;
  const rows = await loadRows(t.estimateId);
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) if (rows[k].sortOrder !== k + 1) await db.update(schema.estimateTasks).set({ sortOrder: k + 1 }).where(eq(schema.estimateTasks.id, rows[k].id));
  revalidate(t.estimateId);
}

/** Moves the whole schedule so the first task starts on the chosen date (links and gaps kept). */
export async function setEstimateScheduleStart(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const denial = await denied("estimates.edit");
  if (denial) return fail(denial);
  const estimateId = s(fd, "estimateId");
  if (!(await estimateExists(estimateId))) return fail("Estimate not found.");
  const start = s(fd, "startDate");
  if (!isValidIsoDate(start)) return fail("Choose a valid start date.");
  const rows = await loadRows(estimateId);
  if (rows.length === 0) return fail("There are no tasks to move.");
  const shifted = offsetScheduleTo(rows.map((r) => ({ ...r, dependsOn: parseDependsOn(r.dependsOn) })), start);
  await db.transaction(async (tx) => {
    for (const t of shifted) await tx.update(schema.estimateTasks).set({ startDate: t.startDate }).where(eq(schema.estimateTasks.id, t.id));
  });
  await logActivity("estimate", estimateId, "schedule", `Schedule start moved to ${scheduleStart(shifted)}`);
  revalidate(estimateId);
  return ok();
}

/** One task per costing category, back to back from the start date. Replaces any existing tasks. */
export async function generateEstimateSchedule(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const denial = await denied("estimates.edit");
  if (denial) return fail(denial);
  const estimateId = s(fd, "estimateId");
  const start = s(fd, "startDate");
  if (!isValidIsoDate(start)) return fail("Choose a valid start date.");
  const l = await loadEstimate(estimateId);
  if (!l) return fail("Estimate not found.");
  const existing = await loadRows(estimateId);
  if (existing.length && fd.get("replace") !== "on") return fail(`Tick “Replace the ${existing.length} existing task${existing.length === 1 ? "" : "s"}” to continue.`);
  const r = calcLoaded(l);
  const cats = r.order.map((id) => l.items.find((i) => i.id === id)).filter((i): i is (typeof l.items)[number] => !!i && i.kind === "category" && !i.parentId);
  if (cats.length === 0) return fail("This estimate has no costing categories yet. Add categories in Costings first.");
  const chain = sequentialChain(
    cats.map((c) => ({ name: c.description || "Stage", durationDays: suggestedDuration(r.categoryTotals[c.id]?.cost ?? 0) })),
    start,
    () => crypto.randomUUID(),
  );
  await db.transaction(async (tx) => {
    await tx.delete(schema.estimateTasks).where(eq(schema.estimateTasks.estimateId, estimateId));
    await tx.insert(schema.estimateTasks).values(
      chain.map((t, i) => ({ id: t.id, estimateId, name: t.name, startDate: t.startDate, durationDays: t.durationDays, dependsOn: JSON.stringify(t.dependsOn), sortOrder: i + 1 })),
    );
  });
  await logActivity("estimate", estimateId, "schedule", `Schedule generated from ${chain.length} costing categor${chain.length === 1 ? "y" : "ies"}`);
  revalidate(estimateId);
  return ok();
}
