"use client";
import { useEffect, useState } from "react";
import { cx, money } from "@/lib/format";
import type { CalcResult, MarkupLine } from "@/lib/calc";
import { COST_TYPES, costTypeBar, costTypeLabel, parseNumberInput } from "./cells";

const ROUNDING = [
  { value: "none", label: "No rounding" },
  { value: "dollar", label: "Up to nearest $1" },
  { value: "ten", label: "Up to nearest $10" },
  { value: "hundred", label: "Up to nearest $100" },
  { value: "thousand", label: "Up to nearest $1,000" },
];
const REDIST: Record<string, string> = {
  none: "Not redistributed",
  across_estimate: "Spread across the estimate",
  within_category: "Spread within each category",
};

type Draft = { name: string; percent: string };

export function SummaryPanel({
  calc, markupLines, onSaveMarkup, rounding, onRounding, taxLabel, redistribution, incomplete, itemCount, allowances,
}: {
  calc: CalcResult;
  markupLines: MarkupLine[];
  onSaveMarkup: (lines: MarkupLine[]) => void;
  rounding: string;
  onRounding: (r: string) => void;
  taxLabel: string;
  redistribution: string;
  incomplete: number;
  itemCount: number;
  allowances: { pc: number; ps: number };
}) {
  const [draft, setDraft] = useState<Draft[]>(() => markupLines.map((l) => ({ name: l.name, percent: String(l.percent) })));
  const [err, setErr] = useState<string | null>(null);
  const key = JSON.stringify(markupLines);
  useEffect(() => {
    setDraft(markupLines.map((l) => ({ name: l.name, percent: String(l.percent) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const validate = (d: Draft[]): MarkupLine[] | string => {
    const out: MarkupLine[] = [];
    for (const l of d) {
      if (!l.name.trim()) return "Each markup line needs a name.";
      const p = parseNumberInput(l.percent);
      if (p === null || Number.isNaN(p)) return `Enter a percentage for “${l.name.trim()}”.`;
      if (p < -100 || p > 1000) return "Markup must be between -100% and 1000%.";
      out.push({ name: l.name.trim(), percent: p });
    }
    return out;
  };
  const persist = (d: Draft[]) => {
    const v = validate(d);
    if (typeof v === "string") return setErr(v);
    setErr(null);
    if (JSON.stringify(v) !== key) onSaveMarkup(v);
  };
  const totalPct = draft.reduce((s, l) => s + (Number(parseNumberInput(l.percent)) || 0), 0);
  const byType = COST_TYPES.map((t) => ({ t, v: calc.byCostType[t] ?? 0 }));
  const maxType = Math.max(1, ...byType.map((x) => x.v));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-lg border border-ink-200 bg-white shadow-xs" aria-label="Estimate totals">
        <header className="border-b border-ink-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-500">Totals</header>
        <dl className="space-y-1.5 p-4 text-sm">
          <Line label="Cost total" value={money(calc.costTotal)} testId="sum-cost" />
          {calc.markupBreakdown.map((m, i) => (
            <Line key={i} label={`${m.name} ${fmtPct(m.percent)}`} value={money(m.amount)} muted />
          ))}
          <Line label="Markup total" value={money(calc.markupTotal)} testId="sum-markup" />
          <Line label="Subtotal ex tax" value={money(calc.subtotalExTax)} strong testId="sum-subtotal" />
          <Line label={`Tax (${taxLabel})`} value={money(calc.taxTotal)} testId="sum-tax" />
          <div className="flex items-center justify-between gap-2 py-0.5">
            <dt className="text-ink-600">
              <select aria-label="Quote rounding" value={rounding} onChange={(e) => onRounding(e.target.value)} className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-xs">
                {ROUNDING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </dt>
            <dd className="tabular-nums text-ink-700">{money(calc.roundingAdjustment)}</dd>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-ink-200 pt-3">
            <dt className="font-semibold text-ink-900">Quote total</dt>
            <dd className="text-xl font-semibold tabular-nums text-ink-900" data-testid="sum-quote">{money(calc.quoteTotal)}</dd>
          </div>
          <p className="pt-1 text-xs text-ink-500">Inc. tax. Prime cost & provisional sums: {REDIST[redistribution] ?? redistribution}.</p>
        </dl>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white shadow-xs" aria-label="Markup lines">
        <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Markup</h2>
          <span className="text-xs font-medium text-ink-600 tabular-nums">Total {fmtPct(totalPct)}</span>
        </header>
        <div className="space-y-2 p-4">
          {draft.length === 0 && <p className="text-sm text-ink-500">No markup. Items are quoted at cost unless they have their own markup.</p>}
          {draft.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label={`Markup line ${i + 1} name`}
                value={l.name}
                maxLength={60}
                onChange={(e) => setDraft(draft.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                onBlur={() => persist(draft)}
                className="min-w-0 flex-1 rounded-md border border-ink-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <div className="relative w-24">
                <input
                  aria-label={`Markup line ${i + 1} percent`}
                  inputMode="decimal"
                  value={l.percent}
                  onChange={(e) => setDraft(draft.map((x, k) => (k === i ? { ...x, percent: e.target.value } : x)))}
                  onBlur={() => persist(draft)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="w-full rounded-md border border-ink-200 py-1 pl-2 pr-6 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-400">%</span>
              </div>
              <button
                type="button"
                aria-label={`Remove markup line ${l.name || i + 1}`}
                onClick={() => { const d = draft.filter((_, k) => k !== i); setDraft(d); persist(d); }}
                className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          <button
            type="button"
            onClick={() => { const d = [...draft, { name: draft.length ? "Contingency" : "Markup", percent: "0" }]; setDraft(d); persist(d); }}
            className="text-sm font-medium text-brand-700 hover:text-brand-800"
            disabled={draft.length >= 12}
          >
            + Add markup line
          </button>
          <p className="text-xs text-ink-500">Lines add together and apply to every item without its own markup %.</p>
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white shadow-xs" aria-label="Cost breakdown">
        <header className="border-b border-ink-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-500">By cost type</header>
        <div className="space-y-2.5 p-4">
          {byType.map(({ t, v }) => (
            <div key={t}>
              <div className="flex justify-between text-sm">
                <span className="text-ink-700">{costTypeLabel(t)}</span>
                <span className="tabular-nums text-ink-900">
                  {money(v)}
                  <span className="ml-2 inline-block w-10 text-right text-xs text-ink-400">{calc.costTotal ? Math.round((v / calc.costTotal) * 100) : 0}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-ink-100">
                <div className={cx("h-1.5 rounded-full", costTypeBar[t])} style={{ width: `${(v / maxType) * 100}%` }} />
              </div>
            </div>
          ))}
          <dl className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm">
            <Line label="Prime cost allowances" value={money(allowances.pc)} muted />
            <Line label="Provisional sums" value={money(allowances.ps)} muted />
            <div className="flex justify-between">
              <dt className="text-ink-600">Rows still to check</dt>
              <dd className={cx("font-medium tabular-nums", incomplete ? "text-amber-700" : "text-emerald-700")} data-testid="sum-incomplete">
                {incomplete} of {itemCount}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

function Line({ label, value, strong, muted, testId }: { label: string; value: string; strong?: boolean; muted?: boolean; testId?: string }) {
  return (
    <div className={cx("flex justify-between gap-2", muted && "pl-3 text-xs")}>
      <dt className={cx(muted ? "text-ink-500" : "text-ink-600", strong && "font-medium text-ink-800")}>{label}</dt>
      <dd className={cx("tabular-nums", muted ? "text-ink-500" : "text-ink-900", strong && "font-medium")} data-testid={testId}>{value}</dd>
    </div>
  );
}

export function fmtPct(n: number) {
  return `${Math.round(n * 100) / 100}%`;
}
