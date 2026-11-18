"use server";
import { denied } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sanitizeTree, toRows, type SpecNode } from "@/components/quote/spec-tree";
import { isValidSpecImage, normaliseLinks } from "@/components/quote/spec-costings";
import type { EditorActionState } from "@/components/quote/SpecEditor";
import { logActivity } from "@/lib/settings";

const isId = (s: string) => /^[A-Za-z0-9-]{4,64}$/.test(s);

function revalidateSpec(estimateId: string) {
  revalidatePath(`/estimates/${estimateId}/specifications`);
  revalidatePath(`/estimates/${estimateId}/quote`);
}

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
  // Links may only point at this estimate's costing categories, one section per category.
  const cats = await db
    .select({ id: schema.estimateItems.id })
    .from(schema.estimateItems)
    .where(and(eq(schema.estimateItems.estimateId, estimateId), eq(schema.estimateItems.kind, "category")));
  tree = normaliseLinks(tree, new Set(cats.map((c) => c.id)));
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
  revalidateSpec(estimateId);
  return { ok: true, message: "Saved", at: Date.now() };
}

export type SpecItemResult = { ok: true } | { ok: false; error: string };

async function findItem(estimateId: string, itemId: string) {
  if (!isId(estimateId) || !isId(itemId)) return null;
  const [it] = await db
    .select({ id: schema.estimateItems.id, kind: schema.estimateItems.kind, description: schema.estimateItems.description })
    .from(schema.estimateItems)
    .where(and(eq(schema.estimateItems.id, itemId), eq(schema.estimateItems.estimateId, estimateId)));
  return it && it.kind === "item" ? it : null;
}

/** Turns "include in specifications" on/off for a costing item (same flag as the Costings "S" toggle). */
export async function setItemInSpecification(estimateId: string, itemId: string, on: boolean): Promise<SpecItemResult> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const it = await findItem(estimateId, itemId);
  if (!it) return { ok: false, error: "That costing item no longer exists. Reload and try again." };
  await db.update(schema.estimateItems).set({ showInSpecification: !!on }).where(eq(schema.estimateItems.id, it.id));
  revalidateSpec(estimateId);
  revalidatePath(`/estimates/${estimateId}/costings`);
  return { ok: true };
}

/**
 * Saves an item's specification detail. `image`: undefined keeps the stored image, null removes it,
 * a data URL replaces it (png/jpeg/gif/webp, size limited).
 */
export async function saveSpecItemDetail(
  estimateId: string,
  itemId: string,
  input: { body: string; image?: string | null },
): Promise<SpecItemResult> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, error: denial };
  const it = await findItem(estimateId, itemId);
  if (!it) return { ok: false, error: "That costing item no longer exists. Reload and try again." };
  const body = typeof input?.body === "string" ? input.body.trim().slice(0, 20000) : "";
  const image = input?.image;
  if (typeof image === "string" && !isValidSpecImage(image)) {
    return { ok: false, error: "Images must be PNG, JPEG, GIF or WebP and under 1.5 MB." };
  }
  const t = schema.specItemDetails;
  const [existing] = await db.select({ id: t.id, imageDataUrl: t.imageDataUrl }).from(t).where(eq(t.estimateItemId, it.id));
  const nextImage = image === undefined ? existing?.imageDataUrl ?? null : image;
  if (!body && !nextImage) {
    if (existing) await db.delete(t).where(eq(t.id, existing.id));
  } else if (existing) {
    await db.update(t).set({ body: body || null, imageDataUrl: nextImage }).where(eq(t.id, existing.id));
  } else {
    await db.insert(t).values({ estimateId, estimateItemId: it.id, body: body || null, imageDataUrl: nextImage });
  }
  revalidateSpec(estimateId);
  return { ok: true };
}
