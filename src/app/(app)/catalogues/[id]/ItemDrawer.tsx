"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { COST_TYPES } from "@/lib/catalogue-csv";
import { cx, money, num } from "@/lib/format";
import { evalRecipeQty, recipeTotals } from "../recipe";
import { deleteItems, getItemDetail, saveRecipe, searchComponents, updateItem, type ItemDetail, type ItemPatchInput } from "./actions";
import type { GridCategory } from "./ItemGrid";

type Line = {
  key: string;
  componentItemId: string | null;
  componentCode: string | null;
  componentCatalogue: string | null;
  description: string;
  costType: string;
  uom: string;
  quantityExpr: string;
  unitCost: number;
};
type Comp = Awaited<ReturnType<typeof searchComponents>>[number];

const input = "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
const label = "mb-1 block text-xs font-medium text-ink-600";

export function ItemDrawer({ itemId, categories, onClose }: { itemId: string; categories: GridCategory[]; onClose: () => void }) {
  const [detail, setDetail] = useState<ItemDetail | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getItemDetail(itemId).then((d) => live && setDetail(d));
    return () => { live = false; };
  }, [itemId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Item details" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-base font-semibold text-ink-900">Item details</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Close">✕</button>
        </div>
        {detail === undefined ? (
          <p className="p-5 text-sm text-ink-500">Loading…</p>
        ) : detail === null ? (
          <p className="p-5 text-sm text-ink-500">This item no longer exists.</p>
        ) : (
          <DrawerBody detail={detail} categories={categories} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function DrawerBody({ detail, categories, onClose }: { detail: ItemDetail; categories: GridCategory[]; onClose: () => void }) {
  const it = detail.item;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isRecipe, setIsRecipe] = useState(it.isRecipe);
  const [imageUrl, setImageUrl] = useState(it.imageUrl ?? "");
  const [unitCost, setUnitCost] = useState(String(it.unitCost));
  const [armDelete, setArmDelete] = useState(false);
  const [lines, setLines] = useState<Line[]>(() =>
    detail.lines.map((l) => ({ key: l.id, componentItemId: l.componentMissing ? null : l.componentItemId, componentCode: l.componentCode, componentCatalogue: l.componentCatalogue, description: l.description, costType: l.costType, uom: l.uom ?? "", quantityExpr: l.quantityExpr, unitCost: l.unitCost })),
  );
  const totals = recipeTotals(lines);
  const formRef = useRef<HTMLFormElement>(null);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => setLines((ls) => { const n = [...ls]; const j = i + d; if (j < 0 || j >= n.length) return ls; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = () => {
    const fd = new FormData(formRef.current!);
    const patch: ItemPatchInput = {
      itemCode: String(fd.get("itemCode") ?? ""),
      description: String(fd.get("description") ?? ""),
      costType: String(fd.get("costType")) as ItemPatchInput["costType"],
      uom: String(fd.get("uom") ?? ""),
      categoryId: String(fd.get("categoryId") ?? "") || null,
      details: String(fd.get("details") ?? ""),
      imageUrl,
    };
    if (!patch.description?.trim()) return setError("Description is required");
    if (!isRecipe) {
      const v = Number(unitCost);
      if (unitCost.trim() === "" || !Number.isFinite(v) || v < 0) return setError("Unit cost must be zero or more");
      patch.unitCost = v;
    } else if (totals.errors) {
      return setError("Fix the highlighted component quantities first");
    }
    start(async () => {
      setError(null);
      // recipe flag first so a recipe's unit cost isn't overwritten by the plain-item path
      const r1 = await saveRecipe(it.id, isRecipe, lines.map(({ componentItemId, description, costType, uom, quantityExpr, unitCost }) => ({ componentItemId, description, costType, uom, quantityExpr, unitCost })));
      if (!r1.ok) return setError(r1.error);
      const r2 = await updateItem(it.id, patch);
      if (!r2.ok) return setError(r2.error);
      onClose();
    });
  };

  return (
    <>
      <form ref={formRef} className="flex-1 space-y-4 overflow-y-auto p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <label className={label} htmlFor="d-code">Item code</label>
            <input id="d-code" name="itemCode" defaultValue={it.itemCode ?? ""} className={cx(input, "font-mono")} />
          </div>
          <div className="sm:col-span-3">
            <label className={label} htmlFor="d-desc">Description</label>
            <input id="d-desc" name="description" defaultValue={it.description} required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="d-type">Cost type</label>
            <select id="d-type" name="costType" defaultValue={it.costType} className={input}>{COST_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div>
            <label className={label} htmlFor="d-uom">Unit</label>
            <input id="d-uom" name="uom" list="uom-list" defaultValue={it.uom} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="d-cost">Unit cost</label>
            {isRecipe ? (
              <div id="d-cost" className={cx(input, "bg-ink-50 text-right tabular-nums")} data-testid="recipe-unit-cost">{money(totals.unitCost)}</div>
            ) : (
              <input id="d-cost" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={cx(input, "text-right tabular-nums")} />
            )}
          </div>
          <div>
            <label className={label} htmlFor="d-cat">Category</label>
            <select id="d-cat" name="categoryId" defaultValue={it.categoryId ?? ""} className={input}>
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="d-details">Details</label>
          <textarea id="d-details" name="details" defaultValue={it.details ?? ""} rows={3} placeholder="Specification, brand, supplier notes — shown when this item is used in an estimate." className={cx(input, "min-h-20")} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={label} htmlFor="d-img">Image URL</label>
            <input id="d-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={input} />
          </div>
          {/^https?:\/\/\S+$/i.test(imageUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="size-16 rounded-md border border-ink-200 object-cover" />
          )}
        </div>

        <div className="rounded-lg border border-ink-200">
          <label className="flex items-start gap-2 border-b border-ink-100 px-3 py-2.5">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={isRecipe} onChange={(e) => setIsRecipe(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-ink-900">Recipe (assembly)</span>
              <span className="block text-xs text-ink-500">Build this item from component lines. Its unit cost becomes the sum of the components per 1 {it.uom}.</span>
            </span>
          </label>
          {isRecipe ? (
            <RecipeEditor itemId={it.id} lines={lines} setLine={setLine} setLines={setLines} move={move} totals={totals} />
          ) : (
            detail.lines.length > 0 && <p className="px-3 py-2 text-xs text-amber-700">Saving will remove the {detail.lines.length} component line{detail.lines.length === 1 ? "" : "s"} from this item.</p>
          )}
        </div>
        {detail.usedIn.length > 0 && (
          <p className="text-xs text-ink-500">
            Used as a component in: {detail.usedIn.map((u) => u.description).join(", ")}. Price changes flow through to those recipes.
          </p>
        )}
      </form>
      <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-5 py-3">
        {armDelete ? (
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => start(async () => { const r = await deleteItems([it.id]); if (r.ok) onClose(); else setError(r.error); })}
          >
            Confirm delete
          </button>
        ) : (
          <button type="button" className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50" onClick={() => setArmDelete(true)}>
            Delete item
          </button>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">Cancel</button>
          <button type="button" onClick={save} disabled={pending} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {pending ? "Saving…" : "Save item"}
          </button>
        </div>
      </div>
    </>
  );
}

function RecipeEditor({ itemId, lines, setLine, setLines, move, totals }: {
  itemId: string;
  lines: Line[];
  setLine: (k: string, p: Partial<Line>) => void;
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  move: (i: number, d: number) => void;
  totals: ReturnType<typeof recipeTotals<Line>>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Comp[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchComponents(v, itemId);
      setResults(r);
      setSearching(false);
    }, 250);
  };
  const addComp = (c: Comp) => {
    setLines((ls) => [...ls, { key: crypto.randomUUID(), componentItemId: c.id, componentCode: c.itemCode, componentCatalogue: c.catalogueName, description: c.description, costType: c.costType, uom: c.uom, quantityExpr: "1", unitCost: c.unitCost }]);
    setQ(""); setResults([]);
  };
  const addFree = () => setLines((ls) => [...ls, { key: crypto.randomUUID(), componentItemId: null, componentCode: null, componentCatalogue: null, description: q.trim() || "", costType: "Material", uom: "ea", quantityExpr: "1", unitCost: 0 }]);
  const cellCls = "w-full rounded border border-ink-200 bg-white px-1.5 py-1 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-2 p-3" data-testid="recipe-editor">
      <div className="relative">
        <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search any catalogue to add a component…" aria-label="Search components" className={input} />
        {(results.length > 0 || (q && !searching)) && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-ink-200 bg-white shadow-lg" role="listbox">
            {results.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => addComp(c)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-50" role="option" aria-selected={false}>
                  <span className="min-w-0 truncate">
                    {c.itemCode && <span className="mr-1.5 font-mono text-xs text-ink-500">{c.itemCode}</span>}
                    {c.description}
                    <span className="ml-1.5 text-xs text-ink-400">· {c.catalogueName}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-600">{money(c.unitCost)}/{c.uom}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => { addFree(); setQ(""); setResults([]); }} className="w-full border-t border-ink-100 px-3 py-1.5 text-left text-sm text-brand-700 hover:bg-brand-50">
                + Add “{q.trim()}” as a free-text line
              </button>
            </li>
          </ul>
        )}
      </div>
      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-500">
          No components yet. Search above, or <button type="button" onClick={addFree} className="font-medium text-brand-700 hover:underline">add a free-text line</button>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" data-testid="recipe-lines">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-1 py-1">Component</th>
                <th className="w-24 px-1 py-1">Qty / unit</th>
                <th className="w-16 px-1 py-1">UOM</th>
                <th className="w-24 px-1 py-1 text-right">Unit cost</th>
                <th className="w-20 px-1 py-1 text-right">Total</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {totals.rows.map((l, i) => (
                <tr key={l.key} className="align-top" data-testid="recipe-line">
                  <td className="px-1 py-1">
                    {l.componentItemId ? (
                      <div className="px-1.5 py-1">
                        <div className="truncate">{l.description}</div>
                        <div className="text-xs text-ink-400">
                          {l.componentCode && <span className="font-mono">{l.componentCode} · </span>}
                          {l.componentCatalogue} · <button type="button" className="text-brand-700 hover:underline" onClick={() => setLine(l.key, { componentItemId: null })}>unlink</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Description" aria-label="Component description" className={cellCls} />
                        <select value={l.costType} onChange={(e) => setLine(l.key, { costType: e.target.value })} aria-label="Component cost type" className={cx(cellCls, "w-28")}>
                          {COST_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <input value={l.quantityExpr} onChange={(e) => setLine(l.key, { quantityExpr: e.target.value })} aria-label="Quantity per unit" aria-invalid={!!l.error} className={cx(cellCls, "font-mono", l.error && "border-red-400 bg-red-50")} />
                    {l.error ? <div className="text-[11px] leading-tight text-red-600">{l.error}</div> : /[^\d.\s]/.test(l.quantityExpr) && <div className="text-[11px] text-ink-400">= {num(evalRecipeQty(l.quantityExpr).value, 3)}</div>}
                  </td>
                  <td className="px-1 py-1">
                    <input value={l.uom} onChange={(e) => setLine(l.key, { uom: e.target.value })} list="uom-list" aria-label="Component unit" className={cellCls} />
                  </td>
                  <td className="px-1 py-1">
                    {l.componentItemId ? (
                      <div className="px-1.5 py-1 text-right tabular-nums" title="Follows the linked item's price">{money(l.unitCost)}</div>
                    ) : (
                      <input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: Number(e.target.value) })} aria-label="Component unit cost" className={cx(cellCls, "text-right tabular-nums")} />
                    )}
                  </td>
                  <td className="px-1 py-1 pt-2 text-right tabular-nums">{money(l.extended)}</td>
                  <td className="whitespace-nowrap px-1 py-1 pt-1.5 text-right">
                    <button type="button" className="px-1 text-xs text-ink-400 hover:text-ink-800 disabled:opacity-30" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="px-1 text-xs text-ink-400 hover:text-ink-800 disabled:opacity-30" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="px-1 text-xs text-ink-400 hover:text-red-600" aria-label="Remove component" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-200">
                <td colSpan={4} className="px-1 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-500">Recipe unit cost</td>
                <td className="px-1 py-2 text-right font-semibold tabular-nums" data-testid="recipe-total">{money(totals.unitCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-400">Quantities are per 1 unit of this recipe. Use numbers, + − × ÷, functions like ceil() and [Q] for the parent quantity. Linked components follow their catalogue price.</p>
    </div>
  );
}
