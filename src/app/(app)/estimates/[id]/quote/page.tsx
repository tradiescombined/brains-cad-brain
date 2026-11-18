import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { ConfirmSubmit } from "@/components/quote/ConfirmSubmit";
import { formatIsoDate } from "@/lib/merge-fields";
import { getOrCreateQuoteOptions, loadQuoteModel, toOptionValues } from "@/components/quote/data";
import { QuoteBuilder } from "./QuoteBuilder";
import { CopyLink } from "./CopyLink";
import { createShareLink, markAsSent, revokeShareLink, saveQuoteOptions } from "./actions";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const metadata = { title: "Quote" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) notFound();
  const opts = await getOrCreateQuoteOptions(id);
  const model = await loadQuoteModel(id, opts);
  if (!model) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const shareUrl = opts.shareToken ? `${proto}://${host}/q/${opts.shareToken}` : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-ink-200 bg-white p-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/estimates/${id}/quote/print`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700" data-testid="quote-print">
            Print / PDF
          </Link>
          <form action={markAsSent}>
            <input type="hidden" name="estimateId" value={id} />
            <SubmitButton variant="secondary" pendingText="Marking…">{est.sentAt ? "Mark as sent again" : "Mark as sent"}</SubmitButton>
          </form>
          {est.sentAt && <Badge tone="blue">Sent {formatIsoDate(est.sentAt)}</Badge>}
          {model.acceptance && <Badge tone="green">Accepted by {model.acceptance.name} · {formatIsoDate(model.acceptance.signedAt)}</Badge>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">Client link</span>
          {shareUrl ? (
            <>
              <CopyLink url={shareUrl} />
              <a href={shareUrl} target="_blank" rel="noopener" className="text-sm font-medium text-brand-700 hover:underline">Open</a>
              <form action={revokeShareLink}>
                <input type="hidden" name="estimateId" value={id} />
                <ConfirmSubmit confirmText="Confirm revoke">Revoke</ConfirmSubmit>
              </form>
            </>
          ) : (
            <form action={createShareLink}>
              <input type="hidden" name="estimateId" value={id} />
              <SubmitButton variant="secondary" pendingText="Creating…">Create client link</SubmitButton>
            </form>
          )}
        </div>
      </div>
      {model.categories.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This estimate has no costings yet, so there is nothing to price yet. Add items in{" "}
          <Link href={`/estimates/${id}/costings`} className="font-medium underline">Costings</Link> first.
        </div>
      )}
      <QuoteBuilder model={model} initial={toOptionValues(opts)} saveAction={saveQuoteOptions.bind(null, id)} printHref={`/estimates/${id}/quote/print`} />
    </div>
  );
}
