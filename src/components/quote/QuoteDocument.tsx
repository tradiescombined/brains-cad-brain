/**
 * Printable A4 quote document. Pure presentational (no hooks) so it renders in Server
 * Components (print page, public page) and inside the client-side live preview.
 */
import { Fragment, type ReactNode } from "react";
import { money, num, cx } from "@/lib/format";
import { addDaysIso, applyMergeFields, formatIsoDate, type MergeValues } from "@/lib/merge-fields";
import { Markdown } from "./Markdown";
import { numberTree } from "./spec-tree";
import { buildQuoteView, type QuoteModel, type QuoteOptionValues } from "./model";

export function quoteMergeValues(model: QuoteModel, opts: Pick<QuoteOptionValues, "validDays">): MergeValues {
  return {
    ClientName: model.estimate.clientName || "Client",
    EstimateName: model.estimate.name,
    EstimateNumber: model.estimate.number,
    QuoteTotal: money(model.totals.quoteTotal),
    ValidUntil: formatIsoDate(addDaysIso(model.issueDate, opts.validDays)),
    BusinessName: model.business.name,
    SiteAddress: model.estimate.siteAddress || "the site",
  };
}

function SectionTitle({ children, colour }: { children: ReactNode; colour: string }) {
  return (
    <h2 className="mb-2 border-b pb-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: colour, borderColor: colour + "55" }}>
      {children}
    </h2>
  );
}

export function QuoteDocument({ model, options: o, className }: { model: QuoteModel; options: QuoteOptionValues; className?: string }) {
  const b = model.business;
  const e = model.estimate;
  const c = b.brandColour;
  const merge = quoteMergeValues(model, o);
  const view = buildQuoteView(model, o);
  const validUntil = addDaysIso(model.issueDate, o.validDays);
  const specNumbers = numberTree(model.specs);
  const schedule = model.schedule ?? [];
  const showSchedule = o.printSchedule && schedule.length > 0;
  const showSpecs = o.printSpecifications && (model.specs.length > 0 || !!model.specIntro?.trim() || model.inclusions.length > 0);
  const itemCols = (o.printQuantities ? 1 : 0) + (o.printUnitMeasures ? 1 : 0);
  const cols = itemCols;
  const amountCol = (view.showItems && o.printItemTotals) || (view.showCategories && o.printCategoryTotals);
  const t = model.totals;

  return (
    <article
      data-testid="quote-document"
      className={cx("quote-doc relative mx-auto w-full max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[12.5px] leading-relaxed text-ink-800", className)}
    >
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-4 pb-5" style={{ borderColor: c }}>
        <div className="flex min-w-0 items-start gap-4">
          {o.printLogo && b.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoDataUrl} alt={`${b.name} logo`} className="max-h-16 max-w-[45mm] object-contain" />
          )}
          {o.printBusinessInfo && (
            <div className="min-w-0 text-[11.5px] leading-snug text-ink-600">
              <div className="text-base font-bold text-ink-900">{b.name}</div>
              {b.legalName && <div>{b.legalName}</div>}
              {b.abn && <div>ABN {b.abn}</div>}
              {b.licence && <div>Licence {b.licence}</div>}
              {b.address && <div>{b.address}</div>}
              {(b.phone || b.email) && <div>{[b.phone, b.email].filter(Boolean).join(" · ")}</div>}
              {b.website && <div>{b.website}</div>}
            </div>
          )}
        </div>
        <div className="ml-auto text-right">
          <div className="text-2xl font-bold tracking-tight" style={{ color: c }} data-testid="quote-title">{o.title || "Quotation"}</div>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 text-[11.5px]">
            <dt className="text-ink-500">Quote no.</dt><dd className="font-semibold text-ink-900">{e.number}</dd>
            <dt className="text-ink-500">Date</dt><dd className="text-ink-900">{formatIsoDate(model.issueDate)}</dd>
            <dt className="text-ink-500">Valid until</dt><dd className="text-ink-900" data-testid="quote-valid-until">{formatIsoDate(validUntil)}</dd>
          </dl>
        </div>
      </header>

      {/* Client & site */}
      <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 print:grid-cols-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Prepared for</div>
          <div className="font-semibold text-ink-900">{e.clientName || "—"}</div>
          {e.clientAddress && <div>{e.clientAddress}</div>}
          {e.clientEmail && <div>{e.clientEmail}</div>}
          {e.clientPhone && <div>{e.clientPhone}</div>}
        </div>
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Site</div>
          <div>{e.siteAddress || "—"}</div>
        </div>
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Project</div>
          <div className="font-semibold text-ink-900">{e.name}</div>
        </div>
      </section>

      {/* Cover letter */}
      {o.coverLetter?.trim() && (
        <section className="mt-6" data-testid="quote-cover-letter">
          <Markdown text={applyMergeFields(o.coverLetter, merge)} />
        </section>
      )}

      {/* Scope & pricing */}
      <section className="mt-7">
        <SectionTitle colour={c}>Scope of works</SectionTitle>
        {!view.hasScope && <p className="text-ink-500">The full scope is included in the total price below.</p>}
        {view.sections.length > 0 && (
          <table className="w-full border-collapse text-[12px]" data-testid="quote-scope">
            {view.showItems && (cols > 0 || amountCol) && (
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-ink-400">
                  <th className="py-1 text-left font-semibold">Description</th>
                  {o.printQuantities && <th className="w-16 py-1 text-right font-semibold">Qty</th>}
                  {o.printUnitMeasures && <th className="w-14 py-1 pl-2 text-left font-semibold">Unit</th>}
                  {amountCol && <th className="w-28 py-1 text-right font-semibold">Amount</th>}
                </tr>
              </thead>
            )}
            <tbody>
              {view.sections.map((s) => (
                <Fragment key={s.id}>
                  {view.showCategories && (
                    <tr className="break-inside-avoid border-b border-ink-200">
                      <td colSpan={1 + (view.showItems ? itemCols : 0)} className="pt-3 pb-1 font-semibold text-ink-900">
                        <span className="mr-2 tabular-nums text-ink-400">{s.number}</span>
                        {s.name}
                      </td>
                      {amountCol && (
                        <td className="pt-3 pb-1 text-right font-semibold tabular-nums" data-testid={s.total != null ? "quote-category-total" : undefined}>
                          {s.total != null ? money(s.total) : ""}
                        </td>
                      )}
                    </tr>
                  )}
                  {s.items.map((it) => (
                    <tr key={it.id} className="break-inside-avoid border-b border-ink-100 align-top" data-testid="quote-item">
                      <td className="py-1 pr-2">
                        <span className={cx(view.showCategories && "pl-5")}>
                          {view.showCategories && <span className="mr-2 tabular-nums text-ink-400">{it.number}</span>}
                          {it.description}
                        </span>
                      </td>
                      {o.printQuantities && <td className="py-1 text-right tabular-nums">{num(it.quantity, 3)}</td>}
                      {o.printUnitMeasures && <td className="py-1 pl-2 text-ink-500">{it.uom}</td>}
                      {amountCol && <td className="py-1 text-right tabular-nums">{o.printItemTotals ? money(it.sell) : ""}</td>}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {view.allowances.length > 0 && (
          <div className="mt-5 break-inside-avoid" data-testid="quote-allowances">
            <h3 className="mb-1 text-[12px] font-semibold text-ink-900">Allowances</h3>
            <p className="mb-2 text-[11px] text-ink-500">Allowances are included in the price and will be adjusted to the actual cost once selections are made.</p>
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {view.allowances.map((a) => (
                  <Fragment key={a.kind}>
                    {a.items.map((it) => (
                      <tr key={it.id} className="border-b border-ink-100">
                        <td className="py-1 pr-2">{it.description} <span className="text-ink-400">({a.kind})</span></td>
                        <td className="w-28 py-1 text-right tabular-nums">{money(it.sell)}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-ink-200">
                      <td className="py-1 pr-2 font-medium">{a.label} total</td>
                      <td className="w-28 py-1 text-right font-medium tabular-nums">{money(a.total)}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="mt-5 flex justify-end break-inside-avoid">
          <table className="w-full max-w-[85mm] text-[12px]" data-testid="quote-totals">
            <tbody>
              {o.showMarkup && (
                <>
                  <tr><td className="py-0.5 text-ink-600">Cost subtotal</td><td className="py-0.5 text-right tabular-nums">{money(t.costTotal)}</td></tr>
                  {t.markupBreakdown.map((m) => (
                    <tr key={m.name}><td className="py-0.5 text-ink-600">{m.name} ({num(m.percent)}%)</td><td className="py-0.5 text-right tabular-nums">{money(m.amount)}</td></tr>
                  ))}
                </>
              )}
              <tr className="border-t border-ink-200"><td className="py-1 text-ink-600">Subtotal (ex tax)</td><td className="py-1 text-right tabular-nums">{money(t.subtotalExTax)}</td></tr>
              <tr><td className="py-0.5 text-ink-600">{model.taxLabel}</td><td className="py-0.5 text-right tabular-nums">{money(t.taxTotal)}</td></tr>
              {Math.abs(t.roundingAdjustment) >= 0.005 && (
                <tr><td className="py-0.5 text-ink-600">Rounding</td><td className="py-0.5 text-right tabular-nums">{money(t.roundingAdjustment)}</td></tr>
              )}
              <tr className="border-t-2" style={{ borderColor: c }}>
                <td className="pt-1.5 text-[13px] font-bold text-ink-900">Total (inc tax)</td>
                <td className="pt-1.5 text-right text-[15px] font-bold tabular-nums" style={{ color: c }} data-testid="quote-total">{money(t.quoteTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Specifications */}
      {showSpecs && (
        <section className="mt-8" data-testid="quote-specifications">
          <SectionTitle colour={c}>Specifications</SectionTitle>
          {model.specIntro?.trim() && <Markdown text={model.specIntro} className="mb-3" />}
          <div className="space-y-3">
            {model.specs.map((s) => (
              <div key={s.id}>
                <h3 className="break-after-avoid font-semibold text-ink-900">
                  {o.printSpecificationNumbers && <span className="mr-2 tabular-nums">{specNumbers[s.id]}</span>}
                  {s.heading}
                </h3>
                {s.body && <Markdown text={s.body} className="mt-1" />}
                {s.children.length > 0 && (
                  <div className="mt-2 space-y-2 pl-5">
                    {s.children.map((ch) => (
                      <div key={ch.id} className="break-inside-avoid">
                        <h4 className="font-medium text-ink-900">
                          {o.printSpecificationNumbers && <span className="mr-2 tabular-nums text-ink-500">{specNumbers[ch.id]}</span>}
                          {ch.heading}
                        </h4>
                        {ch.body && <Markdown text={ch.body} className="mt-0.5" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {model.inclusions.length > 0 && (
              <div className="break-inside-avoid">
                <h3 className="font-semibold text-ink-900">
                  {o.printSpecificationNumbers && <span className="mr-2 tabular-nums">{model.specs.length + 1}</span>}
                  Inclusions
                </h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {model.inclusions.map((i) => (
                    <li key={i.id}>
                      {i.description}
                      {i.notes && <span className="text-ink-500"> — {i.notes}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Schedule summary */}
      {showSchedule && (
        <section className="mt-8" data-testid="quote-schedule">
          <SectionTitle colour={c}>Proposed schedule</SectionTitle>
          <p className="mb-2 text-[11.5px] text-ink-600">
            Estimated {formatIsoDate(schedule.reduce((m, s) => (s.start < m ? s.start : m), schedule[0].start))} to{" "}
            {formatIsoDate(schedule.reduce((m, s) => (s.finish > m ? s.finish : m), schedule[0].finish))}, subject to approvals, weather and site conditions.
          </p>
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-ink-300 text-left text-[10.5px] uppercase tracking-wider text-ink-500">
                <th className="py-1 pr-2 font-semibold">#</th>
                <th className="py-1 pr-2 font-semibold">Task</th>
                <th className="py-1 pr-2 font-semibold">Start</th>
                <th className="py-1 pr-2 font-semibold">Finish</th>
                <th className="py-1 text-right font-semibold">Working days</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s, i) => (
                <tr key={s.id} className="border-b border-ink-100" data-schedule-task={s.name}>
                  <td className="py-1 pr-2 tabular-nums text-ink-500">{i + 1}</td>
                  <td className="py-1 pr-2">{s.name}</td>
                  <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{formatIsoDate(s.start)}</td>
                  <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{formatIsoDate(s.finish)}</td>
                  <td className="py-1 text-right tabular-nums">{s.durationDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Terms */}
      {o.termsAndConditions?.trim() && (
        <section className="mt-8" data-testid="quote-terms">
          <SectionTitle colour={c}>Terms &amp; conditions</SectionTitle>
          <Markdown text={applyMergeFields(o.termsAndConditions, merge)} className="text-[11.5px]" />
        </section>
      )}

      {/* Acceptance */}
      <section className="mt-8 break-inside-avoid rounded-md border border-ink-200 p-4" data-testid="quote-acceptance">
        <SectionTitle colour={c}>Acceptance</SectionTitle>
        <p className="text-[11.5px]">
          I/we accept quotation {e.number} for {money(t.quoteTotal)} (inc tax) and agree to the terms and conditions set out above.
        </p>
        {model.acceptance ? (
          <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800" data-testid="quote-accepted-note">
            Accepted online by <strong>{model.acceptance.name}</strong> on {formatIsoDate(model.acceptance.signedAt)}.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-6 text-[10.5px] uppercase tracking-wider text-ink-400">
            <div className="border-t border-ink-400 pt-1">Signature</div>
            <div className="border-t border-ink-400 pt-1">Full name</div>
            <div className="border-t border-ink-400 pt-1">Date</div>
          </div>
        )}
      </section>

      {o.printInitialsArea && (
        <footer className="quote-initials mt-8 flex items-center justify-between border-t border-ink-200 pt-2 text-[10.5px] text-ink-500" data-testid="quote-initials">
          <span>{e.number} · {b.name}</span>
          <span>Client initials: <span className="inline-block w-24 border-b border-ink-400 align-bottom">&nbsp;</span></span>
        </footer>
      )}
    </article>
  );
}

/** Print CSS shared by the print page and the public page. */
export const QUOTE_PRINT_CSS = `
@page { size: A4; margin: 14mm 12mm 18mm; }
@media print {
  html, body { background: #fff !important; }
  .quote-doc { max-width: none !important; padding: 0 !important; box-shadow: none !important; border: 0 !important; font-size: 11.5pt; }
  .quote-doc tr, .quote-doc .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
  .quote-doc h2, .quote-doc h3 { break-after: avoid; page-break-after: avoid; }
  .quote-doc .quote-initials { position: fixed; bottom: -12mm; left: 0; right: 0; margin: 0; background: #fff; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
