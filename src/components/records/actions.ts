"use server";
import { requirePermission } from "@/lib/permissions";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function addNote(formData: FormData) {
  await requirePermission("notes.edit");
  const body = String(formData.get("body") ?? "").trim();
  const entityType = String(formData.get("entityType"));
  const entityId = String(formData.get("entityId"));
  if (body) await db.insert(schema.notes).values({ entityType, entityId, body, author: "Owner" });
  revalidatePath(String(formData.get("path") ?? "/"));
}

export async function deleteNote(formData: FormData) {
  await requirePermission("notes.edit");
  await db.delete(schema.notes).where(eq(schema.notes.id, String(formData.get("id"))));
  revalidatePath(String(formData.get("path") ?? "/"));
}

export async function uploadDocuments(formData: FormData) {
  await requirePermission("notes.edit");
  const entityType = String(formData.get("entityType"));
  const entityId = String(formData.get("entityId"));
  const folder = String(formData.get("folder") || "Unassigned");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    await db.insert(schema.documents).values({
      entityType, entityId, folder, fileName: f.name, mimeType: f.type, sizeBytes: f.size,
      dataUrl: `data:${f.type || "application/octet-stream"};base64,${buf.toString("base64")}`,
    });
  }
  revalidatePath(String(formData.get("path") ?? "/"));
}

export async function deleteDocument(formData: FormData) {
  await requirePermission("notes.edit");
  await db.delete(schema.documents).where(eq(schema.documents.id, String(formData.get("id"))));
  revalidatePath(String(formData.get("path") ?? "/"));
}
