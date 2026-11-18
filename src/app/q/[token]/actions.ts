"use server";
import { syncLeadWithEstimate } from "@/lib/estimates";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLookups, logActivity } from "@/lib/settings";
import { findByShareToken } from "@/components/quote/data";

export type AcceptState = { ok: boolean; message: string; fields?: { name?: string } } | null;

export async function acceptQuote(token: string, _prev: AcceptState, fd: FormData): Promise<AcceptState> {
  const found = await findByShareToken(token);
  if (!found) return { ok: false, message: "This quote link is no longer valid. Please contact the builder." };
  const { options, estimate } = found;
  if (options.acceptanceSignedAt) return { ok: true, message: "This quote has already been accepted." };

  const name = String(fd.get("signatureName") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, message: "Type your full name to sign.", fields: { name } };
  if (name.length > 120) return { ok: false, message: "Name is too long.", fields: { name } };
  if (fd.get("agree") !== "on") return { ok: false, message: "Tick the box to confirm you accept the quote and terms.", fields: { name } };

  const now = new Date().toISOString();
  const statuses = await getLookups("estimate_status");
  const accepted = statuses.find((s) => s.flag)?.name ?? statuses.find((s) => /accept/i.test(s.name))?.name ?? "Accepted";
  await db.update(schema.quoteOptions).set({ acceptanceSignatureName: name, acceptanceSignedAt: now }).where(eq(schema.quoteOptions.id, options.id));
  await db.update(schema.estimates).set({ status: accepted, acceptedAt: now }).where(eq(schema.estimates.id, estimate.id));
  await syncLeadWithEstimate(estimate.id);
  revalidatePath("/leads", "layout");
  await logActivity("estimate", estimate.id, "quote_accepted", `Quote ${estimate.number} accepted online by ${name}`);
  // No revalidation of /q/[token] here: the form swaps itself for a confirmation; a reload shows the accepted state.
  revalidatePath(`/estimates/${estimate.id}`, "layout");
  return { ok: true, message: "Thank you — your acceptance has been recorded." };
}
