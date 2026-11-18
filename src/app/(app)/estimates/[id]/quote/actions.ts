"use server";
import { denied, requirePermission } from "@/lib/permissions";
import { syncLeadWithEstimate } from "@/lib/estimates";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLookups, logActivity } from "@/lib/settings";
import { getOrCreateQuoteOptions } from "@/components/quote/data";
import { BOOLEAN_OPTIONS, asAllowancePrint } from "@/components/quote/model";

export type QuoteActionState = { ok: boolean; message: string; at: number } | null;

function paths(id: string) {
  revalidatePath(`/estimates/${id}/quote`);
  revalidatePath(`/estimates/${id}`, "layout");
}

export async function saveQuoteOptions(estimateId: string, _prev: QuoteActionState, fd: FormData): Promise<QuoteActionState> {
  const denial = await denied("estimates.edit");
  if (denial) return { ok: false, message: denial, at: Date.now() };
  const title = String(fd.get("title") ?? "").trim();
  const validDays = Number(fd.get("validDays"));
  if (!title) return { ok: false, message: "Enter a document title.", at: Date.now() };
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) return { ok: false, message: "Valid days must be a whole number from 1 to 365.", at: Date.now() };
  await getOrCreateQuoteOptions(estimateId);
  const flags = Object.fromEntries(BOOLEAN_OPTIONS.map((k) => [k, fd.get(k) === "on"]));
  await db
    .update(schema.quoteOptions)
    .set({
      title: title.slice(0, 120),
      validDays,
      coverLetter: String(fd.get("coverLetter") ?? "").slice(0, 50000) || null,
      termsAndConditions: String(fd.get("termsAndConditions") ?? "").slice(0, 100000) || null,
      pcPrintOption: asAllowancePrint(String(fd.get("pcPrintOption"))),
      psPrintOption: asAllowancePrint(String(fd.get("psPrintOption"))),
      ...flags,
    })
    .where(eq(schema.quoteOptions.estimateId, estimateId));
  paths(estimateId);
  return { ok: true, message: "Quote options saved", at: Date.now() };
}

export async function markAsSent(fd: FormData) {
  await requirePermission("quotes.send");
  const id = String(fd.get("estimateId") ?? "");
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) return;
  const statuses = await getLookups("estimate_status");
  const sent = statuses.find((s) => s.name.toLowerCase() === "sent");
  const isAccepted = statuses.some((s) => s.flag && s.name === est.status);
  await db
    .update(schema.estimates)
    .set({ sentAt: new Date().toISOString(), ...(sent && !isAccepted ? { status: sent.name } : {}) })
    .where(eq(schema.estimates.id, id));
  await syncLeadWithEstimate(id);
  revalidatePath("/leads", "layout");
  await logActivity("estimate", id, "quote_sent", `Quote ${est.number} marked as sent`);
  paths(id);
}

export async function createShareLink(fd: FormData) {
  await requirePermission("quotes.send");
  const id = String(fd.get("estimateId") ?? "");
  await getOrCreateQuoteOptions(id);
  const token = randomBytes(18).toString("base64url");
  await db.update(schema.quoteOptions).set({ shareToken: token }).where(eq(schema.quoteOptions.estimateId, id));
  await logActivity("estimate", id, "quote_link_created", "Client quote link created");
  paths(id);
}

export async function revokeShareLink(fd: FormData) {
  await requirePermission("quotes.send");
  const id = String(fd.get("estimateId") ?? "");
  await db.update(schema.quoteOptions).set({ shareToken: null }).where(and(eq(schema.quoteOptions.estimateId, id)));
  await logActivity("estimate", id, "quote_link_revoked", "Client quote link revoked");
  paths(id);
}
