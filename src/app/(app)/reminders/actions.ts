"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/settings";
import { errState, issuesToFieldErrors, okState, type ActionState } from "../settings/_components/action-state";
import { ENTITY_TYPES } from "./entities";

const reminderSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().trim().min(1, "Give the reminder a title").max(160, "Keep the title under 160 characters"),
    details: z.string().trim().max(2000).optional().transform((v) => v || null),
    dueDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))), "Pick a valid date"),
    assignedTo: z.string().trim().max(120).optional().transform((v) => v || null),
    entityType: z.string().trim().optional().transform((v) => v || null),
    entityId: z.string().trim().optional().transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.entityType && !ENTITY_TYPES.some((t) => t.value === v.entityType)) ctx.addIssue({ code: "custom", path: ["entityType"], message: "Unknown record type" });
    if (v.entityType && !v.entityId) ctx.addIssue({ code: "custom", path: ["entityId"], message: "Choose which record to link" });
  });

function revalidate() {
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
}

export async function saveReminder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const r = reminderSchema.safeParse(raw);
  if (!r.success) return errState("Please fix the highlighted fields.", issuesToFieldErrors(r.error.issues));
  const { id, ...v } = r.data;
  const values = { ...v, entityId: v.entityType ? v.entityId : null };
  if (id) {
    const res = await db.update(schema.reminders).set(values).where(eq(schema.reminders.id, id)).returning({ id: schema.reminders.id });
    if (!res.length) return errState("That reminder no longer exists.");
    revalidate();
    return okState("Reminder updated");
  }
  const [row] = await db.insert(schema.reminders).values(values).returning();
  await logActivity("reminder", row.id, "created", `Reminder added: ${row.title}`);
  revalidate();
  return okState("Reminder added");
}

export async function toggleReminder(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const [r] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, id));
  if (!r) return;
  await db.update(schema.reminders).set({ done: !r.done }).where(eq(schema.reminders.id, id));
  if (!r.done) await logActivity("reminder", id, "completed", `Reminder completed: ${r.title}`);
  revalidate();
}

export async function deleteReminder(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await db.delete(schema.reminders).where(eq(schema.reminders.id, id));
  revalidate();
}

export async function clearDoneReminders() {
  await db.delete(schema.reminders).where(eq(schema.reminders.done, true));
  revalidate();
}
