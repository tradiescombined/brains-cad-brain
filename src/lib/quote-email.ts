/**
 * "Email quote" composer (pure, client + server safe). Builds a mailto: link with a short
 * summary and the online quote link, so the builder sends from their own email app —
 * no email service needed.
 */
import { money } from "./format";
import { formatIsoDate } from "./merge-fields";

export type QuoteEmailInput = {
  to: string | null | undefined;
  clientName: string | null | undefined;
  estimateName: string;
  number: string;
  quoteTotal: number;
  validUntil: string | null | undefined; // YYYY-MM-DD
  quoteUrl: string | null | undefined;
  siteAddress?: string | null;
  businessName: string;
  senderPhone?: string | null;
};

export type QuoteEmail = { to: string; subject: string; body: string };

export function buildQuoteEmail(i: QuoteEmailInput): QuoteEmail {
  const first = (i.clientName ?? "").trim().split(/\s+/)[0]?.replace(/^\(sample\)$/i, "") || "";
  const greeting = first ? `Hi ${first},` : "Hello,";
  const lines = [
    greeting,
    "",
    `Please find our quote ${i.number} for ${i.estimateName}${i.siteAddress ? ` at ${i.siteAddress}` : ""}.`,
    "",
    `Quote total (inc GST): ${money(i.quoteTotal)}`,
  ];
  if (i.validUntil) lines.push(`Valid until: ${formatIsoDate(i.validUntil)}`);
  if (i.quoteUrl) lines.push("", "You can view, print and accept the quote online here:", i.quoteUrl);
  lines.push("", "Let us know if you have any questions.", "", "Kind regards,", i.businessName);
  if (i.senderPhone) lines.push(i.senderPhone);
  return {
    to: (i.to ?? "").trim(),
    subject: `Quote ${i.number} – ${i.estimateName} – ${i.businessName}`,
    body: lines.join("\n"),
  };
}

/** mailto: URL (RFC 6068: spaces as %20, line breaks as %0D%0A). */
export function mailtoHref(e: QuoteEmail): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  const to = e.to.split(/[;,]\s*/).filter(Boolean).map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",");
  return `mailto:${to}?subject=${enc(e.subject)}&body=${enc(e.body)}`;
}
