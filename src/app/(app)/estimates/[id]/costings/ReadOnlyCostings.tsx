import { Card } from "@/components/ui";
import { cx, money, num } from "@/lib/format";
import { calcLoaded, type LoadedEstimate } from "@/lib/estimates";

/**
 * Read-only costings for users who can view but not edit estimates.
 * Without `costs.view` only sell prices are shown (no unit cost, cost, markup or margin).
 */
export function ReadOnlyCostings({ l, showCosts }: { l: LoadedEstimate; showCosts: boolean }) {
  const calc = calcLoaded(l);
  const byId = new Map(l.items.map((i) => [i.id, i]));
  return (
    <div className="space-y-4" data-testid="costings-readonly" data-show-costs={showCosts ? "1" : "0"}>
      <p className="text-sm text-ink-500">
        {showCosts ? "You can view this estimate's costings but not change them." : "Sell prices (ex tax). Costs and margins are hidden for your role."}
      </p>
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label="Costings">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 font-semibold">UOM</th>
                {showCosts && <th className="px-3 py-2 text-right font-semibold">Unit cost</th>}
                {showCosts && <th className="px-3 py-2 text-right font-semibold">Cost</th>}
                {showCosts && <th className="px-3 py-2 text-right font-semibold">Markup</th>}
                <th className="px-3 py-2 text-right font-semibold">Sell (ex tax)</th>
              </tr>
            </thead>
            <tbody>
              {calc.order.map((id) => {
                const it = byId.get(id);
                const r = calc.items[id];
                if (!it || !r) return null;
                const isCat = it.kind === "category";
                return (
                  <tr key={id} className={cx("border-t border-ink-100", isCat && "bg-ink-50 font-semibold")}>
                    <td className="px-3 py-1.5 tabular-nums text-ink-500">{r.number}</td>
                    <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + r.depth * 1}rem` }}>{it.description || <span className="text-ink-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{isCat ? "" : num(r.quantity)}</td>
                    <td className="px-3 py-1.5 text-ink-600">{isCat ? "" : it.uom}</td>
                    {showCosts && <td className="px-3 py-1.5 text-right tabular-nums">{isCat ? "" : money(r.unitCost)}</td>}
                    {showCosts && <td className="px-3 py-1.5 text-right tabular-nums">{money(r.total)}</td>}
                    {showCosts && <td className="px-3 py-1.5 text-right tabular-nums">{money(r.markup)}</td>}
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(isCat ? calc.categoryTotals[id]?.sell ?? r.displaySell : r.displaySell)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Summary">
        <dl className="ml-auto max-w-sm space-y-1 text-sm">
          {showCosts && <Row label="Cost total" value={money(calc.costTotal)} />}
          {showCosts && <Row label="Markup total" value={money(calc.markupTotal)} />}
          <Row label="Subtotal (ex tax)" value={money(calc.subtotalExTax)} />
          <Row label="Tax" value={money(calc.taxTotal)} />
          <Row label="Quote total" value={money(calc.quoteTotal)} strong />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-4", strong && "border-t border-ink-200 pt-1 font-semibold")}>
      <dt className="text-ink-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
