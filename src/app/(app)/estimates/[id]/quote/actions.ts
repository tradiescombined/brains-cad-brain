"use server";
import { syncLeadWithEstimate } from "@/lib/estimates";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLookups, logActivity } from "@/lib/settings";
import { getOrCreateQuoteOptions } from "@/components/quote/data";
import { BOOLEAN_OPTIONS, asAllowancePrint } from "@/components/quote/model";
import { headers } from "next/headers";
import { getSettings } from "@/lib/settings";
import { addDaysIso, joinAddress, quoteIssueDate } from "@/lib/merge-fields";
import { todayIso } from "@/lib/format";
import { buildQuoteEmail, type QuoteEmail } from "@/lib/quote-email";

export type QuoteActionState = { ok: boolean; message: string; at: number } | null;

function paths(id: string) {
  revalidatePath(`/estimates/${id}/quote`);
  revalidatePath(`/estimates/${id}`, "layout");
}

export async function saveQuoteOptions(estimateId: string, _prev: QuoteActionState, fd: FormData): Promise<QuoteActionState> {
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
  const id = String(fd.get("estimateId") ?? "");
  await getOrCreateQuoteOptions(id);
  const token = randomBytes(18).toString("base64url");
  await db.update(schema.quoteOptions).set({ shareToken: token }).where(eq(schema.quoteOptions.estimateId, id));
  await logActivity("estimate", id, "quote_link_created", "Client quote link created");
  paths(id);
}

export async function revokeShareLink(fd: FormData) {
  const id = String(fd.get("estimateId") ?? "");
  await db.update(schema.quoteOptions).set({ shareToken: null }).where(and(eq(schema.quoteOptions.estimateId, id)));
  await logActivity("estimate", id, "quote_link_revoked", "Client quote link revoked");
  paths(id);
}

/**
 * Compose the "Email quote" message: makes sure the online quote link exists, then returns
 * recipient, subject and body for a mailto: link (sent from the builder's own email app).
 */
export async function prepareQuoteEmail(estimateId: string): Promise<({ ok: true; shareUrl: string } & QuoteEmail) | { ok: false; error: string }> {
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, String(estimateId)));
  if (!est) return { ok: false, error: "Estimate not found" };
  let opts = await getOrCreateQuoteOptions(est.id);
  if (!opts.shareToken) {
    await db.update(schema.quoteOptions).set({ shareToken: randomBytes(18).toString("base64url") }).where(eq(schema.quoteOptions.estimateId, est.id));
    await logActivity("estimate", est.id, "quote_link_created", "Client quote link created (email)");
    opts = await getOrCreateQuoteOptions(est.id);
    paths(est.id);
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const shareUrl = `${proto}://${host}/q/${opts.shareToken}`;
  let to = est.clientEmail;
  if (!to && est.clientId) {
    const [c] = await db.select({ email: schema.clients.email }).from(schema.clients).where(eq(schema.clients.id, est.clientId));
    to = c?.email ?? null;
  }
  const s = await getSettings();
  const issued = quoteIssueDate(est.sentAt, est.datePrepared, todayIso());
  const email = buildQuoteEmail({
    to,
    clientName: est.clientName,
    estimateName: est.name,
    number: est.number,
    quoteTotal: est.quoteTotal,
    validUntil: addDaysIso(issued, opts.validDays),
    quoteUrl: shareUrl,
    siteAddress: joinAddress(est.siteAddress, est.siteCityTown, est.siteState, est.sitePostcode) || null,
    businessName: s.tradingName || s.businessName,
    senderPhone: s.phone,
  });
  return { ok: true, shareUrl, ...email };
}
