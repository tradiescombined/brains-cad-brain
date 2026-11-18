"use client";
import { useActionState, useMemo, useState } from "react";
import { Modal } from "@/components/ui/client";
import { money } from "@/lib/format";
import { COST_TYPES, poLineTotal, variationTotals, type VariationLine } from "@/lib/money-docs";
import { createVariation, saveVariation, setVariationStatus } from "./actions";
import { FormMessage, NumCell, cellText } from "../../../orders/_shared/client";

const inputCls = "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50";

export function NewVariationButton({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(createVariation, null);
  return (
    <Modal
      title="New variation"
      trigger={(open) => (
        <button type="button" onClick={open} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700">+ New variation</button>
      )}
    >
      {(close) => (
        <form action={action} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Title</span>
            <input name="title" required autoFocus className={inputCls} placeholder="e.g. Upgrade to engineered timber flooring" />
          </label>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium">Cancel</button>
            <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">{pending ? "Creating…" : "Create variation"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const blank = (): VariationLine => ({ description: "", quantity: 1, uom: "ea", unitCost: 0, costType: "Material" });

export function VariationEditor({
  id, locked, taxRate, taxLabel, uoms, initial,
}: {
  id: string; locked: boolean; taxRate: number; taxLabel: string; uoms: string[];
  initial: { title: string; description: string; markupPercent: number; lines: VariationLine[] };
}) {
  const [state, action, pending] = useActionState(saveVariation, null);
  const [lines, setLines] = useState<VariationLine[]>(initial.lines.length ? initial.lines : [blank()]);
  const [markup, setMarkup] = useState(initial.markupPercent);
  const t = useMemo(() => variationTotals(lines, markup, taxRate), [lines, markup, taxRate]);
  const upd = (i: number, p: Partial<VariationLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  return (
    <form action={action} className="space-y-4" aria-label="Variation">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="markupPercent" value={String(markup)} />
      <fieldset disabled={locked} className="space-y-4">
        <section className="grid gap-4 rounded-lg border border-ink-200 bg-white p-4 shadow-xs sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Title</span>
            <input name="title" required defaultValue={initial.title} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Markup %</span>
            <NumCell ariaLabel="Markup percent" value={markup} onChange={setMarkup} className="!border-ink-200 !bg-white !py-1.5" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-600">Description / reason</span>
            <textarea name="description" rows={3} defaultValue={initial.description} className={inputCls} placeholder="What changed, who requested it and any effect on the schedule." />
          </label>
        </section>

        <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
          <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Lines (cost)</h2>
            {!locked && <button type="button" onClick={() => setLines((l) => [...l, blank()])} className="text-sm font-medium text-brand-700 hover:underline">+ Add line</button>}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-2 py-2">Description</th>
                  <th className="w-36 px-2 py-2">Cost type</th>
                  <th className="w-24 px-2 py-2 text-right">Qty</th>
                  <th className="w-20 px-2 py-2">UOM</th>
                  <th className="w-28 px-2 py-2 text-right">Unit cost</th>
                  <th className="w-28 px-2 py-2 text-right">Cost</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-ink-100" data-testid="var-line">
                    <td className="px-1 py-1"><input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => upd(i, { description: e.target.value })} className={cellText} placeholder="Work or materials" /></td>
                    <td className="px-1 py-1">
                      <select aria-label={`Line ${i + 1} cost type`} value={l.costType} onChange={(e) => upd(i, { costType: e.target.value })} className={cellText}>
                        {COST_TYPES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1"><NumCell ariaLabel={`Line ${i + 1} quantity`} value={l.quantity} onChange={(n) => upd(i, { quantity: n })} /></td>
                    <td className="px-1 py-1"><input aria-label={`Line ${i + 1} UOM`} list="var-uoms" value={l.uom} onChange={(e) => upd(i, { uom: e.target.value })} className={cellText} /></td>
                    <td className="px-1 py-1"><NumCell ariaLabel={`Line ${i + 1} unit cost`} value={l.unitCost} onChange={(n) => upd(i, { unitCost: n })} /></td>
                    <td className="px-2 py-1 text-right tabular-nums">{money(poLineTotal(l))}</td>
                    <td className="px-1 py-1 text-right">
                      {!locked && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="px-1 text-ink-400 hover:text-red-600" aria-label={`Remove line ${i + 1}`}>✕</button>}
                    </td>
                  </tr>
                ))}
                {!lines.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-500">No lines yet. Use a negative unit cost for credits.</td></tr>}
              </tbody>
            </table>
            <datalist id="var-uoms">{uoms.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          <div className="flex justify-end border-t border-ink-100 px-4 py-3">
            <dl className="w-72 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Cost</dt><dd className="tabular-nums" data-testid="var-cost">{money(t.cost)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Markup ({markup}%)</dt><dd className="tabular-nums" data-testid="var-markup">{money(t.markup)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">{taxLabel}</dt><dd className="tabular-nums" data-testid="var-tax">{money(t.tax)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums" data-testid="var-total">{money(t.total)}</dd></div>
            </dl>
          </div>
        </section>
      </fieldset>
      {!locked && (
        <div className="flex items-center justify-end gap-3">
          <FormMessage state={state} />
          <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-60">{pending ? "Saving…" : "Save variation"}</button>
        </div>
      )}
    </form>
  );
}

const VERB: Record<string, string> = { Draft: "Back to draft", Sent: "Mark as sent", Approved: "Approve", Rejected: "Mark rejected" };

export function VariationStatusButtons({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(setVariationStatus, null);
  const next = (["Draft", "Sent", "Approved", "Rejected"] as const).filter((s) => s !== status && !(status === "Approved" && s === "Draft"));
  return (
    <div className="space-y-2">
      {next.map((s) => (
        <form key={s} action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={s} />
          <button
            disabled={pending}
            className={
              s === "Approved"
                ? "w-full rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                : s === "Rejected"
                  ? "w-full rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  : "w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50 disabled:opacity-60"
            }
          >
            {status === "Approved" && s === "Sent" ? "Withdraw approval" : VERB[s]}
          </button>
        </form>
      ))}
      <FormMessage state={state} />
    </div>
  );
}
