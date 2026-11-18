import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { money } from "@/lib/format";
import { formatIsoDate } from "@/lib/merge-fields";
import { findByShareToken, loadQuoteModel, toOptionValues } from "@/components/quote/data";
import { QuoteDocument, QUOTE_PRINT_CSS } from "@/components/quote/QuoteDocument";
import { AcceptForm } from "./AcceptForm";
import { acceptQuote } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const found = await findByShareToken(token);
  return { title: found ? `Quote ${found.estimate.number}` : "Quote not found" };
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByShareToken(token);
  if (!found) notFound();
  const model = await loadQuoteModel(found.estimate.id, found.options);
  if (!model) notFound();
  const total = money(model.totals.quoteTotal);

  return (
    <div className="mx-auto max-w-[230mm] space-y-5">
      <style>{QUOTE_PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-ink-500">{model.business.name}</div>
          <h1 className="text-xl font-semibold text-ink-900">Quote {model.estimate.number} · {model.estimate.name}</h1>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-ink-500">Total (inc tax)</div>
          <div className="text-2xl font-semibold tabular-nums text-ink-900">{total}</div>
        </div>
      </div>

      {model.acceptance && (
        <div className="no-print rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="already-accepted">
          This quote was accepted by <strong>{model.acceptance.name}</strong> on {formatIsoDate(model.acceptance.signedAt)}. Thank you!
        </div>
      )}

      <div className="overflow-x-auto rounded-lg shadow-md print:shadow-none">
        <QuoteDocument model={model} options={toOptionValues(found.options)} className="min-w-[600px]" />
      </div>

      <div className="no-print">
        <AcceptForm action={acceptQuote.bind(null, token)} total={total} number={model.estimate.number} accepted={!!model.acceptance} />
      </div>
      <p className="no-print pb-6 text-center text-xs text-ink-400">Questions about this quote? Contact {model.business.name}{model.business.phone ? ` on ${model.business.phone}` : ""}{model.business.email ? ` · ${model.business.email}` : ""}.</p>
    </div>
  );
}
