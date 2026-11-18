"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/settings";
import { deleteCatalogueHard, duplicateCatalogue, getCatalogue } from "./server";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean; id?: string; values?: Record<string, string> } | null;

const STATUSES = ["Draft", "Published", "Expired", "Archived"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").optional().or(z.literal("")).transform((v) => v || null);

const CatalogueSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Keep the name under 120 characters"),
    shortCode: z.string().trim().max(12, "Short code is 12 characters max").transform((v) => (v ? v.toUpperCase() : null)),
    description: z.string().trim().max(1000).transform((v) => v || null),
    supplierId: z.string().trim().transform((v) => v || null),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour").default("#0f766e"),
    status: z.enum(STATUSES).default("Published"),
    effectiveDate: isoDate,
    expiryDate: isoDate,
  })
  .refine((d) => !d.effectiveDate || !d.expiryDate || d.expiryDate >= d.effectiveDate, { path: ["expiryDate"], message: "Expiry must be on or after the effective date" });

/** Create or update a catalogue (useActionState). */
export async function saveCatalogue(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const parsed = CatalogueSchema.safeParse({
    name: fd.get("name") ?? "",
    shortCode: fd.get("shortCode") ?? "",
    description: fd.get("description") ?? "",
    supplierId: fd.get("supplierId") ?? "",
    colour: fd.get("colour") || undefined,
    status: fd.get("status") || undefined,
    effectiveDate: fd.get("effectiveDate") ?? "",
    expiryDate: fd.get("expiryDate") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    const values = Object.fromEntries(["name", "shortCode", "description", "supplierId", "colour", "status", "effectiveDate", "expiryDate"].map((k) => [k, String(fd.get(k) ?? "")]));
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const data = parsed.data;
  if (id) {
    if (!(await getCatalogue(id))) return { error: "That catalogue no longer exists." };
    await db.update(schema.catalogues).set(data).where(eq(schema.catalogues.id, id));
    await logActivity("catalogue", id, "updated", `Updated catalogue ${data.name}`);
    revalidatePath("/catalogues");
    revalidatePath(`/catalogues/${id}`);
    return { ok: true, id };
  }
  const [row] = await db.insert(schema.catalogues).values(data).returning();
  await logActivity("catalogue", row.id, "created", `Created catalogue ${data.name}`);
  revalidatePath("/catalogues");
  return { ok: true, id: row.id };
}

export async function deleteCatalogue(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCatalogue(id);
  if (!c) return;
  await deleteCatalogueHard(id);
  await logActivity("catalogue", id, "deleted", `Deleted catalogue ${c.name}`);
  revalidatePath("/catalogues");
  if (fd.get("redirect")) redirect("/catalogues");
}

export async function duplicateCatalogueAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const newId = await duplicateCatalogue(id);
  if (!newId) return;
  await logActivity("catalogue", newId, "created", "Duplicated catalogue");
  revalidatePath("/catalogues");
  redirect(`/catalogues/${newId}`);
}
