"use server";
import { db, schema } from "@/db";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/settings";
import { clientReferences } from "./queries";
import { formToObject, safeReturnTo, validateClient, validateClientContact, withParam, clientDisplayName, type FieldErrors } from "./fields";

export type FormState = { ok?: boolean; message?: string; errors?: FieldErrors; values?: Record<string, string | string[]>; savedAt?: number };

const C = schema.clients;

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "");
}

export async function createClient(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formToObject(fd);
  const v = validateClient(values);
  if (!v.ok) return { errors: v.errors, values, message: "Check the highlighted fields.", savedAt: Date.now() };
  const [row] = await db.insert(C).values(v.data).returning({ id: C.id });
  await logActivity("client", row.id, "created", `Client ${clientDisplayName(v.data)} created`);
  revalidatePath("/clients");
  redirect(`/clients/${row.id}?created=1`);
}

export async function updateClient(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formToObject(fd);
  const v = validateClient(values);
  if (!v.ok) return { errors: v.errors, values, message: "Check the highlighted fields.", savedAt: Date.now() };
  const res = await db.update(C).set(v.data).where(eq(C.id, id)).returning({ id: C.id });
  if (!res.length) return { values, message: "This client no longer exists." };
  await logActivity("client", id, "updated", `Client ${clientDisplayName(v.data)} updated`);
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true, values, message: "Client saved.", savedAt: Date.now() };
}

/** Quick-create used by the reusable modal. Redirects to returnTo?clientId=<id>. */
export async function quickCreateClient(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formToObject(fd);
  const v = validateClient(values);
  if (!v.ok) return { errors: v.errors, values, message: "Check the highlighted fields.", savedAt: Date.now() };
  const [row] = await db.insert(C).values(v.data).returning({ id: C.id });
  await logActivity("client", row.id, "created", `Client ${clientDisplayName(v.data)} created`);
  revalidatePath("/clients");
  const returnTo = safeReturnTo(values.returnTo, "/clients");
  redirect(withParam(returnTo, "clientId", row.id));
}

export async function setClientArchived(fd: FormData) {
  const id = str(fd, "id");
  const archived = str(fd, "archived") === "1";
  await db.update(C).set({ archived }).where(eq(C.id, id));
  await logActivity("client", id, archived ? "archived" : "restored", archived ? "Client archived" : "Client restored");
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function deleteClient(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const refs = await clientReferences(id);
  if (refs.estimates || refs.jobs || refs.leads) {
    return { message: "This client is linked to estimates, jobs or leads and can't be deleted. Archive it instead." };
  }
  const [c] = await db.select().from(C).where(eq(C.id, id));
  await db.delete(schema.clientContacts).where(eq(schema.clientContacts.clientId, id));
  await db.delete(schema.notes).where(and(eq(schema.notes.entityType, "client"), eq(schema.notes.entityId, id)));
  await db.delete(schema.documents).where(and(eq(schema.documents.entityType, "client"), eq(schema.documents.entityId, id)));
  await db.delete(C).where(eq(C.id, id));
  if (c) await logActivity("client", id, "deleted", `Client ${clientDisplayName(c)} deleted`);
  revalidatePath("/clients");
  redirect("/clients?deleted=1");
}

// ---- Additional client contacts ----

async function clearOtherPrimaries(clientId: string, keepId: string) {
  await db
    .update(schema.clientContacts)
    .set({ isPrimary: false })
    .where(and(eq(schema.clientContacts.clientId, clientId), ne(schema.clientContacts.id, keepId)));
}

export async function saveClientContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formToObject(fd);
  const clientId = str(fd, "clientId");
  const contactId = str(fd, "contactId");
  const v = validateClientContact(values);
  if (!v.ok) return { errors: v.errors, values };
  let id = contactId;
  if (contactId) {
    await db.update(schema.clientContacts).set(v.data).where(and(eq(schema.clientContacts.id, contactId), eq(schema.clientContacts.clientId, clientId)));
  } else {
    const [row] = await db.insert(schema.clientContacts).values({ ...v.data, clientId }).returning({ id: schema.clientContacts.id });
    id = row.id;
  }
  if (v.data.isPrimary) await clearOtherPrimaries(clientId, id);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, savedAt: Date.now() };
}

export async function makePrimaryContact(fd: FormData) {
  const clientId = str(fd, "clientId");
  const id = str(fd, "contactId");
  await db.update(schema.clientContacts).set({ isPrimary: true }).where(and(eq(schema.clientContacts.id, id), eq(schema.clientContacts.clientId, clientId)));
  await clearOtherPrimaries(clientId, id);
  revalidatePath(`/clients/${clientId}`);
}

export async function removeClientContact(fd: FormData) {
  const clientId = str(fd, "clientId");
  await db.delete(schema.clientContacts).where(and(eq(schema.clientContacts.id, str(fd, "contactId")), eq(schema.clientContacts.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`);
}

// ---- CSV import ----

export type ImportResult = { imported: number; failed: { row: number; name: string; error: string }[] };

export async function importClients(records: Record<string, string>[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, failed: [] };
  const valid: (typeof C.$inferInsert)[] = [];
  records.slice(0, 5000).forEach((r, i) => {
    const v = validateClient(r);
    if (v.ok) valid.push(v.data);
    else result.failed.push({ row: i + 2, name: r.name ?? r.businessName ?? "", error: Object.values(v.errors).join(" ") });
  });
  for (let i = 0; i < valid.length; i += 200) await db.insert(C).values(valid.slice(i, i + 200));
  result.imported = valid.length;
  if (valid.length) await logActivity("client", "import", "imported", `Imported ${valid.length} client${valid.length === 1 ? "" : "s"} from CSV`);
  revalidatePath("/clients");
  return result;
}
