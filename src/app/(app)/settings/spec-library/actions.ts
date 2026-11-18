"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sanitizeTree, toTemplateContent } from "@/components/quote/spec-tree";
import type { EditorActionState } from "@/components/quote/SpecEditor";

const isId = (s: string) => /^[A-Za-z0-9-]{4,64}$/.test(s);

function parseTree(raw: FormDataEntryValue | null) {
  try {
    return sanitizeTree(JSON.parse(String(raw ?? "[]")), isId);
  } catch {
    return null;
  }
}

/** Creates a library template from the editor's current tree (used on the estimate Specifications tab). */
export async function saveTreeAsTemplate(_prev: EditorActionState, fd: FormData): Promise<EditorActionState> {
  const name = String(fd.get("templateName") ?? "").trim();
  if (!name) return { ok: false, message: "Enter a template name.", at: Date.now() };
  const tree = parseTree(fd.get("templateTree"));
  if (!tree) return { ok: false, message: "The sections could not be read. Please try again.", at: Date.now() };
  if (!tree.length) return { ok: false, message: "Add at least one section first.", at: Date.now() };
  await db.insert(schema.specificationTemplates).values({ name: name.slice(0, 120), content: toTemplateContent(tree) });
  revalidatePath("/settings/spec-library");
  return { ok: true, message: `Saved “${name}” to your library.`, at: Date.now() };
}

export async function createTemplate(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim().slice(0, 120) || "Untitled template";
  const [row] = await db.insert(schema.specificationTemplates).values({ name, content: "[]" }).returning();
  revalidatePath("/settings/spec-library");
  redirect(`/settings/spec-library/${row.id}`);
}

export async function saveTemplate(templateId: string, _prev: EditorActionState, fd: FormData): Promise<EditorActionState> {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Template name is required.", at: Date.now() };
  const tree = parseTree(fd.get("tree"));
  if (!tree) return { ok: false, message: "The sections could not be read. Please try again.", at: Date.now() };
  const res = await db
    .update(schema.specificationTemplates)
    .set({ name: name.slice(0, 120), content: toTemplateContent(tree) })
    .where(eq(schema.specificationTemplates.id, templateId))
    .returning({ id: schema.specificationTemplates.id });
  if (!res.length) return { ok: false, message: "This template no longer exists.", at: Date.now() };
  revalidatePath("/settings/spec-library");
  return { ok: true, message: "Saved", at: Date.now() };
}

export async function deleteTemplate(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (id) await db.delete(schema.specificationTemplates).where(eq(schema.specificationTemplates.id, id));
  revalidatePath("/settings/spec-library");
  redirect("/settings/spec-library");
}
