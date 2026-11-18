"use client";
import { useActionState, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { poLineTotal, poTotals, type PoLine } from "@/lib/money-docs";
import { saveOrder } from "../actions";
import { FormMessage, NumCell, cellText } from "../_shared/client";

type Opt = { value: string; label: string };
type Props = {
  id: string;
  locked: boolean;
  taxRate: number;
  taxLabel: string;
  suppliers: Opt[];
  uoms: string[];
  initial: { supplierId: string; orderDate: string; deliveryDate: string; deliveryAddress: string; deliveryInstructions: string; lines: PoLine[] };
};

const inputCls = "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50";
const blank = (): PoLine => ({ description: "", itemCode: "", quantity: 1, uom: "ea", unitCost: 0, costType: "Material", budgetLineId: null });

export function PoEditor({ id, locked, taxRate, taxLabel, suppliers, uoms, initial }: Props) {
  const [state, action, pending] = useActionState(saveOrder, null);
  const [lines, setLines] = useState<PoLine[]>(initial.lines.length ? initial.lines : [blank()]);
  const [dirty, setDirty] = useState(false);
  const totals = useMemo(() => poTotals(lines, taxRate), [lines, taxRate]);
  const upd = (i: number, patch: Partial<PoLine>) => {
    setDirty(true);
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  const move = (i: number, d: -1 | 1) => {
    setDirty(true);
    setLines((ls) => {
      const n = [...ls];
      const j = i + d;
      if (j < 0 || j >= n.length) return ls;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };

  return (
    <form action={action} onChange={() => setDirty(true)} className="space-y-4" aria-label="Purchase order">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <fieldset disabled={locked} className="space-y-4">
        <section className="rounded-lg border border-ink-200 bg-white p-4 shadow-xs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-600">Supplier / trade</span>
              <select name="supplierId" defaultValue={initial.supplierId} className={inputCls}>
                <option value="">Not set</option>
                {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Order date</span>
              <input type="date" name="orderDate" required defaultValue={initial.orderDate} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Delivery date</span>
              <input type="date" name="deliveryDate" defaultValue={initial.deliveryDate} className={inputCls} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-600">Delivery address</span>
              <textarea name="deliveryAddress" rows={2} defaultValue={initial.deliveryAddress} className={inputCls} placeholder="Site address" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-600">Delivery instructions</span>
              <textarea name="deliveryInstructions" rows={2} defaultValue={initial.deliveryInstructions} className={inputCls} placeholder="e.g. Call site supervisor 30 min before arrival; forklift on site" />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
          <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Order lines</h2>
            {!locked && (
              <button type="button" onClick={() => { setDirty(true); setLines((l) => [...l, blank()]); }} className="text-sm font-medium text-brand-700 hover:underline">
                + Add line
              </button>
            )}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="w-8 px-2 py-2">#</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="w-28 px-2 py-2">Code</th>
                  <th className="w-24 px-2 py-2 text-right">Qty</th>
                  <th className="w-20 px-2 py-2">UOM</th>
                  <th className="w-28 px-2 py-2 text-right">Unit cost</th>
                  <th className="w-28 px-2 py-2 text-right">Total</th>
                  <th className="w-20 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-ink-100" data-testid="po-line">
                    <td className="px-2 py-1 text-xs text-ink-400">{i + 1}</td>
                    <td className="px-1 py-1"><input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => upd(i, { description: e.target.value })} className={cellText} placeholder="What are you ordering?" /></td>
                    <td className="px-1 py-1"><input aria-label={`Line ${i + 1} code`} value={l.itemCode} onChange={(e) => upd(i, { itemCode: e.target.value })} className={cellText} /></td>
                    <td className="px-1 py-1"><NumCell ariaLabel={`Line ${i + 1} quantity`} value={l.quantity} min={0} onChange={(n) => upd(i, { quantity: n })} /></td>
                    <td className="px-1 py-1">
                      <input aria-label={`Line ${i + 1} UOM`} list="po-uoms" value={l.uom} onChange={(e) => upd(i, { uom: e.target.value })} className={cellText} />
                    </td>
                    <td className="px-1 py-1"><NumCell ariaLabel={`Line ${i + 1} unit cost`} value={l.unitCost} min={0} onChange={(n) => upd(i, { unitCost: n })} /></td>
                    <td className="px-2 py-1 text-right tabular-nums">{money(poLineTotal(l))}</td>
                    <td className="px-1 py-1 text-right whitespace-nowrap">
                      {!locked && (
                        <>
                          <button type="button" onClick={() => move(i, -1)} className="px-1 text-ink-400 hover:text-ink-800" aria-label={`Move line ${i + 1} up`}>↑</button>
                          <button type="button" onClick={() => move(i, 1)} className="px-1 text-ink-400 hover:text-ink-800" aria-label={`Move line ${i + 1} down`}>↓</button>
                          <button type="button" onClick={() => { setDirty(true); setLines((ls) => ls.filter((_, j) => j !== i)); }} className="px-1 text-ink-400 hover:text-red-600" aria-label={`Remove line ${i + 1}`}>✕</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!lines.length && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-ink-500">No lines. Add what you&apos;re ordering.</td></tr>
                )}
              </tbody>
            </table>
            <datalist id="po-uoms">{uoms.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          <div className="flex justify-end border-t border-ink-100 px-4 py-3">
            <dl className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums" data-testid="po-subtotal">{money(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">{taxLabel}</dt><dd className="tabular-nums" data-testid="po-tax">{money(totals.tax)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums" data-testid="po-total">{money(totals.total)}</dd></div>
            </dl>
          </div>
        </section>
      </fieldset>
      {!locked && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {dirty && !pending && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <FormMessage state={state} />
          <button type="submit" disabled={pending} onClick={() => setDirty(false)} className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-60">
            {pending ? "Saving…" : "Save order"}
          </button>
        </div>
      )}
    </form>
  );
}
