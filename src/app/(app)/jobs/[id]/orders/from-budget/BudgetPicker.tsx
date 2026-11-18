"use client";
import { useActionState, useMemo, useState } from "react";
import { money, num } from "@/lib/format";
import { createOrdersFromBudget } from "../../../../orders/actions";
import { FormMessage } from "../../../../orders/_shared/client";

type Line = { id: string; category: string; description: string; costType: string; uom: string; quantity: number; unitCost: number; budget: number; onOrder: string[] };
type Opt = { value: string; label: string };

const sel = "w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none";

export function BudgetPicker({ jobId, groupBy, suppliers, lines }: { jobId: string; groupBy: "costType" | "category"; suppliers: Opt[]; lines: Line[] }) {
  const [state, action, pending] = useActionState(createOrdersFromBudget, null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sup, setSup] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, Line[]>();
    for (const l of lines) {
      const k = (groupBy === "category" ? l.category : l.costType) || "Other";
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m];
  }, [lines, groupBy]);
  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const i of ids) (on ? n.add(i) : n.delete(i));
      return n;
    });
  const supplierCount = new Set([...picked].map((i) => sup[i] || "")).size;
  const pickedTotal = lines.filter((l) => picked.has(l.id)).reduce((s, l) => s + l.quantity * l.unitCost, 0);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-ink-200 bg-white p-3">
        <label className="min-w-56 flex-1 text-xs font-medium text-ink-600">
          <span className="mb-1 block">Supplier for ticked lines</span>
          <select value={bulk} onChange={(e) => setBulk(e.target.value)} className={sel} aria-label="Bulk supplier">
            <option value="">Unassigned</option>
            {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={!picked.size} onClick={() => setSup((s) => ({ ...s, ...Object.fromEntries([...picked].map((i) => [i, bulk])) }))} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50 disabled:opacity-50">
          Apply to ticked
        </button>
        <div className="ml-auto text-right text-sm">
          <div className="text-ink-500">{picked.size} line{picked.size === 1 ? "" : "s"} · {picked.size ? supplierCount : 0} order{supplierCount === 1 ? "" : "s"}</div>
          <div className="font-semibold tabular-nums">{money(pickedTotal)} ex tax</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <th className="w-8 px-3 py-2"></th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">{groupBy === "category" ? "Cost type" : "Category"}</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2">UOM</th>
              <th className="px-2 py-2 text-right">Unit cost</th>
              <th className="px-2 py-2 text-right">Budget</th>
              <th className="w-64 px-2 py-2">Supplier</th>
            </tr>
          </thead>
          {groups.map(([g, ls]) => {
            const all = ls.every((l) => picked.has(l.id));
            return (
              <tbody key={g}>
                <tr className="border-t border-ink-200 bg-ink-50/60">
                  <td className="px-3 py-1.5">
                    <input type="checkbox" aria-label={`Select all ${g}`} checked={all} onChange={(e) => toggle(ls.map((l) => l.id), e.target.checked)} className="size-4 accent-brand-600" />
                  </td>
                  <td colSpan={7} className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-600">{g} <span className="font-normal text-ink-400">({ls.length})</span></td>
                </tr>
                {ls.map((l) => (
                  <tr key={l.id} className="border-t border-ink-100">
                    <td className="px-3 py-1.5">
                      <input type="checkbox" name="pick" value={l.id} aria-label={`Order ${l.description}`} checked={picked.has(l.id)} onChange={(e) => toggle([l.id], e.target.checked)} className="size-4 accent-brand-600" />
                    </td>
                    <td className="px-2 py-1.5">
                      {l.description}
                      {l.onOrder.length > 0 && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">On {l.onOrder.join(", ")}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-ink-500">{groupBy === "category" ? l.costType : l.category}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(l.quantity, 3)}</td>
                    <td className="px-2 py-1.5">{l.uom}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(l.unitCost)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(l.budget)}</td>
                    <td className="px-2 py-1">
                      <select name={`supplier_${l.id}`} aria-label={`Supplier for ${l.description}`} value={sup[l.id] ?? ""} onChange={(e) => setSup((s) => ({ ...s, [l.id]: e.target.value }))} className={sel}>
                        <option value="">Unassigned</option>
                        {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      <div className="flex items-center justify-end gap-3">
        <FormMessage state={state} />
        <button type="submit" disabled={pending || !picked.size} className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Creating…" : `Create ${picked.size ? supplierCount : ""} draft order${supplierCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}
