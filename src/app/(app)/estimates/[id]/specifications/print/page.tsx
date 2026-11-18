import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/permissions";
import { getOrCreateQuoteOptions, loadQuoteModel } from "@/components/quote/data";
import { QUOTE_PRINT_CSS } from "@/components/quote/QuoteDocument";
import { Markdown } from "@/components/quote/Markdown";
import { SpecDocumentView } from "@/components/quote/SpecDocumentView";
import { buildSpecDocument } from "@/components/quote/spec-costings";
import { formatIsoDate } from "@/lib/merge-fields";
import { todayIso } from "@/lib/format";
import { AutoPrint } from "../../quote/print/AutoPrint";

export const metadata = { title: "Print specification" };

/** Stand-alone printable specification (opens the print dialog; ?noprint=1 skips it). */
export default async function SpecificationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("estimates.view");
  const { id } = await params;
  const opts = await getOrCreateQuoteOptions(id);
  const model = await loadQuoteModel(id, opts);
  if (!model) notFound();
  const doc = buildSpecDocument(model.specs, model.specItems);
  const b = model.business;
  const e = model.estimate;
  const empty = !doc.sections.length && !doc.inclusions && !model.specIntro?.trim();
  return (
    <div className="quote-print-sheet fixed inset-0 z-[60] overflow-y-auto bg-ink-200">
      <style>{QUOTE_PRINT_CSS + `
@media print {
  .quote-print-sheet { position: static !important; overflow: visible !important; background: #fff !important; }
  main { padding: 0 !important; }
}`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-2">
        <Link href={`/estimates/${id}/specifications`} className="text-sm font-medium text-ink-600 hover:text-brand-700">← Back to specifications</Link>
        <span className="hidden text-xs text-ink-500 sm:inline">Choose “Save as PDF” in the print dialog to create a PDF.</span>
        <AutoPrint />
      </div>
      <div className="py-6 print:py-0">
        <article
          data-testid="spec-print"
          className="quote-doc mx-auto w-full max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[12.5px] leading-relaxed text-ink-800 shadow-lg print:shadow-none"
        >
          <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b-4 pb-4" style={{ borderColor: b.brandColour }}>
            <div className="flex items-center gap-4">
              {b.logoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoDataUrl} alt={`${b.name} logo`} className="max-h-14 max-w-[40mm] object-contain" />
              )}
              <div>
                <h1 className="text-xl font-bold text-ink-900">Specification</h1>
                <div className="text-ink-600">{e.name} · {e.number}</div>
                {e.siteAddress && <div className="text-ink-500">{e.siteAddress}</div>}
              </div>
            </div>
            <div className="text-right text-ink-500">
              <div className="font-medium text-ink-800">{b.name}</div>
              <div>{formatIsoDate(todayIso())}</div>
            </div>
          </header>
          {model.specIntro?.trim() && <Markdown text={model.specIntro} className="mb-4" />}
          {empty ? (
            <p className="text-ink-500">This estimate has no specification yet.</p>
          ) : (
            <SpecDocumentView doc={doc} numbers={opts.printSpecificationNumbers} />
          )}
        </article>
      </div>
    </div>
  );
}
