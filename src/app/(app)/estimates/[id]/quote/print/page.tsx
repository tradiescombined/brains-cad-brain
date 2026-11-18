import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateQuoteOptions, loadQuoteModel, toOptionValues } from "@/components/quote/data";
import { QuoteDocument, QUOTE_PRINT_CSS } from "@/components/quote/QuoteDocument";
import { AutoPrint } from "./AutoPrint";

export const metadata = { title: "Print quote" };

/**
 * Clean print view. Rendered inside the app/estimate layouts, so on screen it covers them with a
 * full-viewport sheet; in print the chrome is already `no-print` and the sheet flows normally.
 */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opts = await getOrCreateQuoteOptions(id);
  const model = await loadQuoteModel(id, opts);
  if (!model) notFound();
  return (
    <div className="quote-print-sheet fixed inset-0 z-[60] overflow-y-auto bg-ink-200">
      <style>{QUOTE_PRINT_CSS + `
@media print {
  .quote-print-sheet { position: static !important; overflow: visible !important; background: #fff !important; }
  main { padding: 0 !important; }
}`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-2">
        <Link href={`/estimates/${id}/quote`} className="text-sm font-medium text-ink-600 hover:text-brand-700">← Back to quote</Link>
        <span className="hidden text-xs text-ink-500 sm:inline">Choose “Save as PDF” in the print dialog to create a PDF.</span>
        <AutoPrint />
      </div>
      <div className="py-6 print:py-0">
        <QuoteDocument model={model} options={toOptionValues(opts)} className="shadow-lg print:shadow-none" />
      </div>
    </div>
  );
}
