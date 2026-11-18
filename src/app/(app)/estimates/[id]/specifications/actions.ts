"use server";
import { denied } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sanitizeTree, toRows, type SpecNode } from "@/components/quote/spec-tree";
import type { EditorActionState } from "@/components/quote/SpecEditor";
import { logActivity } from "@/lib/settings";

const isId = (s: string) => /^[A-Za-z0-9-]{4,64}$/.test(s);

/** Replaces the estimate's specification tree and intro with the posted editor state. */
export async function saveSpecifications(estimateId: string, _prev: EditorActionState, fd: FormData): Promise<EditorActionState> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, message: denial, at: Date.now() };
  const [est] = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(eq(schema.estimates.id, estimateId));
  if (!est) return { ok: false, message: "Estimate not found.", at: Date.now() };
  let tree: SpecNode[] | null;
  try {
    tree = sanitizeTree(JSON.parse(String(fd.get("tree") ?? "[]")), isId);
  } catch {
    tree = null;
  }
  if (!tree) return { ok: false, message: "The sections could not be read. Please reload and try again.", at: Date.now() };
  const intro = String(fd.get("intro") ?? "").trim().slice(0, 20000);
  const rows = toRows(tree);
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.specifications).where(eq(schema.specifications.estimateId, estimateId));
      if (rows.length) await tx.insert(schema.specifications).values(rows.map((r) => ({ ...r, estimateId })));
      await tx.update(schema.estimates).set({ specificationIntro: intro || null }).where(eq(schema.estimates.id, estimateId));
    });
  } catch {
    return { ok: false, message: "Could not save the specification. Please reload and try again.", at: Date.now() };
  }
  await logActivity("estimate", estimateId, "specifications_updated", `Specification updated (${rows.length} sections)`);
  revalidatePath(`/estimates/${estimateId}/specifications`);
  revalidatePath(`/estimates/${estimateId}/quote`);
  return { ok: true, message: "Saved", at: Date.now() };
}
