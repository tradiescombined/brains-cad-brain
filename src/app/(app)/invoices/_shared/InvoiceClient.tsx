"use client";
import { useActionState, useMemo, useState } from "react";
import { cx, money } from "@/lib/format";
import { exTax, invoiceTotals, percentOfContractExTax, progressClaim, PAYMENT_METHODS, type InvoiceKind, type InvoiceLine } from "@/lib/money-docs";
import { addPayment, createInvoice, saveInvoice } from "../actions";
import { FormMessage, NumCell, cellText } from "../../orders/_shared/client";

const inputCls = "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50";
const label = "mb-1 block text-xs font-medium text-ink-600";

// ------------------------------------------------------------ editor

export function InvoiceEditor({
  id, locked, taxRate, taxLabel, initial,
}: {
  id: string; locked: boolean; taxRate: number; taxLabel: string;
  initial: { issueDate: string; dueDate: string; notes: string; lines: InvoiceLine[]; amountPaid: number };
}) {
  const [state, action, pending] = useActionState(saveInvoice, null);
  const [lines, setLines] = useState<InvoiceLine[]>(initial.lines.length ? initial.lines : [{ description: "", amount: 0, taxable: true }]);
  const t = useMemo(() => invoiceTotals(lines, taxRate), [lines, taxRate]);
  const upd = (i: number, p: Partial<InvoiceLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <form action={action} className="space-y-4" aria-label="Invoice">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <fieldset disabled={locked} className="space-y-4">
        <section className="grid gap-4 rounded-lg border border-ink-200 bg-white p-4 shadow-xs sm:grid-cols-2">
          <label className="block"><span className={label}>Issue date</span><input type="date" name="issueDate" required defaultValue={initial.issueDate} className={inputCls} /></label>
          <label className="block"><span className={label}>Due date</span><input type="date" name="dueDate" defaultValue={initial.dueDate} className={inputCls} /></label>
          <label className="block sm:col-span-2"><span className={label}>Notes to client</span><textarea name="notes" rows={2} defaultValue={initial.notes} className={inputCls} placeholder="Shown on the printed invoice" /></label>
        </section>
        <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
          <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Lines (ex tax)</h2>
            {!locked && <button type="button" onClick={() => setLines((l) => [...l, { description: "", amount: 0, taxable: true }])} className="text-sm font-medium text-brand-700 hover:underline">+ Add line</button>}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-2 py-2">Description</th>
                  <th className="w-20 px-2 py-2 text-center">Taxable</th>
                  <th className="w-36 px-2 py-2 text-right">Amount</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-ink-100" data-testid="inv-line">
                    <td className="px-1 py-1"><input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => upd(i, { description: e.target.value })} className={cellText} /></td>
                    <td className="px-2 py-1 text-center"><input type="checkbox" aria-label={`Line ${i + 1} taxable`} checked={l.taxable} onChange={(e) => upd(i, { taxable: e.target.checked })} className="size-4 accent-brand-600" /></td>
                    <td className="px-1 py-1"><NumCell ariaLabel={`Line ${i + 1} amount`} value={l.amount} onChange={(n) => upd(i, { amount: n })} /></td>
                    <td className="px-1 py-1 text-right">
                      {!locked && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="px-1 text-ink-400 hover:text-red-600" aria-label={`Remove line ${i + 1}`}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-ink-100 px-4 py-3">
            <dl className="w-72 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums" data-testid="inv-subtotal">{money(t.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">{taxLabel}</dt><dd className="tabular-nums" data-testid="inv-tax">{money(t.tax)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums" data-testid="inv-total">{money(t.total)}</dd></div>
              <div className="flex justify-between text-ink-500"><dt>Paid</dt><dd className="tabular-nums">{money(initial.amountPaid)}</dd></div>
              <div className="flex justify-between font-medium"><dt>Balance due</dt><dd className="tabular-nums">{money(t.total - initial.amountPaid)}</dd></div>
            </dl>
          </div>
        </section>
      </fieldset>
      {!locked && (
        <div className="flex items-center justify-end gap-3">
          <FormMessage state={state} />
          <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-60">{pending ? "Saving…" : "Save invoice"}</button>
        </div>
      )}
    </form>
  );
}

// ------------------------------------------------------------ payments

export function PaymentForm({ invoiceId, balance, today }: { invoiceId: string; balance: number; today: string }) {
  const [state, action, pending] = useActionState(addPayment, null);
  return (
    <form action={action} key={balance} className="space-y-2" aria-label="Record payment">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className={label}>Date</span><input type="date" name="date" required defaultValue={today} className={inputCls} /></label>
        <label className="block"><span className={label}>Amount</span><input type="number" step="0.01" min="0.01" name="amount" required defaultValue={balance > 0 ? balance.toFixed(2) : ""} className={inputCls + " text-right tabular-nums"} /></label>
        <label className="block"><span className={label}>Method</span>
          <select name="method" className={inputCls} defaultValue="Bank transfer">{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="block"><span className={label}>Reference</span><input name="reference" className={inputCls} placeholder="Bank ref" /></label>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="w-full rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{pending ? "Recording…" : "Record payment"}</button>
    </form>
  );
}

// ------------------------------------------------------------ new invoice

type NewProps = {
  jobId: string;
  today: string;
  taxRate: number;
  base: number;
  contract: number;
  contractClaims: number;
  remaining: number;
  variations: { id: string; number: string; title: string; total: number }[];
  initialKind: InvoiceKind;
};

const KINDS: { kind: InvoiceKind; hint: string }[] = [
  { kind: "Deposit", hint: "A % of the contract price up front" },
  { kind: "Progress claim", hint: "Claim by % complete or custom lines" },
  { kind: "Variation", hint: "Bill approved variations" },
  { kind: "Final", hint: "Remaining balance of the contract" },
  { kind: "Other", hint: "Free-form lines" },
];

export function NewInvoiceForm(p: NewProps) {
  const [state, action, pending] = useActionState(createInvoice, null);
  const [kind, setKind] = useState<InvoiceKind>(p.initialKind);
  const [depositPct, setDepositPct] = useState(10);
  const [mode, setMode] = useState<"percent" | "lines">("percent");
  const prevPct = p.base > 0 ? (p.contractClaims / p.base) * 100 : 0;
  const [cumPct, setCumPct] = useState(Math.min(100, Math.ceil(prevPct) + 10));
  const [vars, setVars] = useState<Set<string>>(new Set(p.variations.map((v) => v.id)));

  let preview: number | null = null;
  let detail = "";
  if (kind === "Deposit") {
    preview = invoiceTotals([{ amount: percentOfContractExTax(p.base, depositPct, p.taxRate), taxable: true }], p.taxRate).total;
    detail = `${depositPct}% of ${money(p.base)} contract price`;
  } else if (kind === "Progress claim" && mode === "percent") {
    const pc = progressClaim({ contractValue: p.base, previouslyClaimed: p.contractClaims, cumulativePercent: cumPct });
    preview = invoiceTotals([{ amount: exTax(pc.amount, p.taxRate), taxable: true }], p.taxRate).total;
    detail = `(${pc.cumulativePercent}% − ${pc.previousPercent}% previously claimed) × ${money(p.base)} = ${pc.thisPercent}% this claim`;
  } else if (kind === "Variation") {
    preview = p.variations.filter((v) => vars.has(v.id)).reduce((a, v) => a + v.total, 0);
    detail = `${vars.size} variation${vars.size === 1 ? "" : "s"}`;
  } else if (kind === "Final") {
    preview = invoiceTotals([{ amount: exTax(p.remaining, p.taxRate), taxable: true }], p.taxRate).total;
    detail = `Contract ${money(p.contract)} less invoiced to date`;
  }

  return (
    <form action={action} className="space-y-5" aria-label="New invoice">
      <input type="hidden" name="jobId" value={p.jobId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Invoice type">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cx("rounded-lg border p-3 text-left transition-colors", kind === k.kind ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-ink-200 bg-white hover:border-ink-300")}
          >
            <div className="text-sm font-semibold">{k.kind}</div>
            <div className="mt-0.5 text-xs text-ink-500">{k.hint}</div>
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-lg border border-ink-200 bg-white p-4 shadow-xs">
        <label className="block max-w-48"><span className={label}>Issue date</span><input type="date" name="issueDate" defaultValue={p.today} required className={inputCls} /></label>

        {kind === "Deposit" && (
          <label className="block max-w-48">
            <span className={label}>Deposit % of contract</span>
            <input type="number" name="percent" min="0.01" max="100" step="0.01" value={depositPct} onChange={(e) => setDepositPct(parseFloat(e.target.value) || 0)} className={inputCls} />
          </label>
        )}

        {kind === "Progress claim" && (
          <div className="space-y-3">
            <input type="hidden" name="mode" value={mode} />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "percent"} onChange={() => setMode("percent")} className="accent-brand-600" /> By % complete</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "lines"} onChange={() => setMode("lines")} className="accent-brand-600" /> Custom lines</label>
            </div>
            {mode === "percent" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div><span className={label}>Previously claimed</span><div className="py-1.5 text-sm tabular-nums">{prevPct.toFixed(2)}% · {money(p.contractClaims)}</div></div>
                <label className="block"><span className={label}>Cumulative % complete</span>
                  <input type="number" name="cumulativePercent" min="0.01" max="100" step="0.01" value={cumPct} onChange={(e) => setCumPct(parseFloat(e.target.value) || 0)} className={inputCls} />
                </label>
              </div>
            ) : (
              <p className="text-sm text-ink-500">A draft claim is created with a blank line for you to fill in.</p>
            )}
          </div>
        )}

        {kind === "Variation" && (
          p.variations.length ? (
            <ul className="divide-y divide-ink-100 rounded-md border border-ink-200">
              {p.variations.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="variationId"
                      value={v.id}
                      checked={vars.has(v.id)}
                      onChange={(e) => setVars((s) => { const n = new Set(s); if (e.target.checked) n.add(v.id); else n.delete(v.id); return n; })}
                      className="size-4 accent-brand-600"
                    />
                    <span><span className="font-medium">{v.number}</span> · {v.title}</span>
                  </label>
                  <span className="tabular-nums">{money(v.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">No approved variations are waiting to be invoiced.</p>
          )
        )}

        {kind === "Other" && <p className="text-sm text-ink-500">A draft invoice is created with a blank line for you to fill in.</p>}

        {preview !== null && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-ink-50 px-3 py-2">
            <span className="text-sm text-ink-600">{detail}</span>
            <span className="text-lg font-semibold tabular-nums" data-testid="new-inv-preview">{money(preview)} <span className="text-xs font-normal text-ink-500">inc tax</span></span>
          </div>
        )}
      </section>
      <div className="flex items-center justify-end gap-3">
        <FormMessage state={state} />
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-60">{pending ? "Creating…" : "Create draft invoice"}</button>
      </div>
    </form>
  );
}
