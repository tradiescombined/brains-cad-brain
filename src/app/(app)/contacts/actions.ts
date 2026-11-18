"use server";
import { denied, requirePermission } from "@/lib/permissions";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/settings";
import { formToObject } from "../clients/fields";
import type { FormState, ImportResult } from "../clients/actions";
import { validateContact, type ContactInput } from "./fields";
import { contactReferences, describeContactRefs } from "./queries";

const T = schema.contacts;

function toRow(d: ContactInput) {
  return { ...d, groups: JSON.stringify(d.groups) };
}

export async function createContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const denial = await denied("contacts.edit");
  if (denial) return { message: denial, savedAt: Date.now() };
  const values = formToObject(fd);
  const v = validateContact(values);
  if (!v.ok) return { errors: v.errors, values, message: "Check the highlighted fields.", savedAt: Date.now() };
  const [row] = await db.insert(T).values(toRow(v.data)).returning({ id: T.id });
  await logActivity("contact", row.id, "created", `Contact ${v.data.name} created`);
  revalidatePath("/contacts");
  redirect(`/contacts/${row.id}?created=1`);
}

export async function updateContact(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const denial = await denied("contacts.edit");
  if (denial) return { message: denial, savedAt: Date.now() };
  const values = formToObject(fd);
  const v = validateContact(values);
  if (!v.ok) return { errors: v.errors, values, message: "Check the highlighted fields.", savedAt: Date.now() };
  const res = await db.update(T).set(toRow(v.data)).where(eq(T.id, id)).returning({ id: T.id });
  if (!res.length) return { values, message: "This contact no longer exists." };
  await logActivity("contact", id, "updated", `Contact ${v.data.name} updated`);
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  return { ok: true, values, message: "Contact saved.", savedAt: Date.now() };
}

export async function setContactArchived(fd: FormData) {
  await requirePermission("contacts.edit");
  const id = String(fd.get("id") ?? "");
  const archived = fd.get("archived") === "1";
  await db.update(T).set({ archived }).where(eq(T.id, id));
  await logActivity("contact", id, archived ? "archived" : "restored", archived ? "Contact archived" : "Contact restored");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
}

export async function deleteContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const denial = await denied("records.delete");
  if (denial) return { message: denial, savedAt: Date.now() };
  const id = String(fd.get("id") ?? "");
  const blocked = describeContactRefs(await contactReferences(id));
  if (blocked) return { message: `${blocked} Archive it instead.` };
  const [c] = await db.select().from(T).where(eq(T.id, id));
  await db.delete(schema.notes).where(and(eq(schema.notes.entityType, "contact"), eq(schema.notes.entityId, id)));
  await db.delete(schema.documents).where(and(eq(schema.documents.entityType, "contact"), eq(schema.documents.entityId, id)));
  await db.delete(T).where(eq(T.id, id));
  if (c) await logActivity("contact", id, "deleted", `Contact ${c.name} deleted`);
  revalidatePath("/contacts");
  redirect("/contacts?deleted=1");
}

export async function importContacts(records: Record<string, string>[]): Promise<ImportResult> {
  const denial = await denied("contacts.edit");
  if (denial) return { imported: 0, failed: [{ row: 0, name: "", error: denial }] };
  const result: ImportResult = { imported: 0, failed: [] };
  const valid: (typeof T.$inferInsert)[] = [];
  records.slice(0, 5000).forEach((r, i) => {
    const v = validateContact(r);
    if (v.ok) valid.push(toRow(v.data));
    else result.failed.push({ row: i + 2, name: r.name ?? r.businessName ?? "", error: Object.values(v.errors).join(" ") });
  });
  for (let i = 0; i < valid.length; i += 200) await db.insert(T).values(valid.slice(i, i + 200));
  result.imported = valid.length;
  if (valid.length) await logActivity("contact", "import", "imported", `Imported ${valid.length} supplier/trade contact${valid.length === 1 ? "" : "s"} from CSV`);
  revalidatePath("/contacts");
  return result;
}
