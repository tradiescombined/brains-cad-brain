"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { cx, money } from "@/lib/format";
import { searchCatalogue, type CatalogueHit } from "./actions";
import { Dialog, costTypeTone, parseNumberInput } from "./cells";

type Pick = { hit: CatalogueHit; qty: string };

export function CatalogueModal({
  open, onClose, onAdd, categories, defaultCategoryId, catalogues, catalogueCategories,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (categoryId: string, picks: { id: string; quantity: number }[]) => void;
  categories: { id: string; label: string }[];
  defaultCategoryId: string | null;
  catalogues: { id: string; name: string; status: string }[];
  catalogueCategories: { id: string; catalogueId: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [catalogueId, setCatalogueId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [hits, setHits] = useState<CatalogueHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState<Map<string, Pick>>(new Map());
  const [target, setTarget] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  // reset when (re)opened
  useEffect(() => {
    if (!open) return;
    setPicks(new Map());
    setErr(null);
    setTarget(defaultCategoryId && categories.some((c) => c.id === defaultCategoryId) ? defaultCategoryId : categories[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchCatalogue({ q, catalogueId, categoryId: categoryFilter });
        if (!cancelled) { setHits(r); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, q, catalogueId, categoryFilter]);

  const catNames = useMemo(() => new Map(catalogueCategories.map((c) => [c.id, c.name])), [catalogueCategories]);
  const catalogueNames = useMemo(() => new Map(catalogues.map((c) => [c.id, c.name])), [catalogues]);
  const filterCats = catalogueCategories.filter((c) => !catalogueId || c.catalogueId === catalogueId);

  const toggle = (h: CatalogueHit) => {
    setPicks((m) => {
      const n = new Map(m);
      if (n.has(h.id)) n.delete(h.id);
      else n.set(h.id, { hit: h, qty: "1" });
      return n;
    });
  };
  const setQty = (id: string, qty: string) =>
    setPicks((m) => {
      const n = new Map(m);
      const p = n.get(id);
      if (p) n.set(id, { ...p, qty });
      return n;
    });

  const submit = () => {
    const list = [...picks.values()];
    if (!list.length) return setErr("Tick at least one item to add.");
    const out: { id: string; quantity: number }[] = [];
    for (const p of list) {
      const n = parseNumberInput(p.qty);
      if (n === null || Number.isNaN(n) || n < 0) return setErr(`Enter a quantity of 0 or more for “${p.hit.description}”.`);
      out.push({ id: p.hit.id, quantity: n });
    }
    onAdd(target, out);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add from catalogue"
      wide
      footer={
        <>
          {err && <span className="mr-auto text-sm text-red-700" role="alert">{err}</span>}
          <span className="text-sm text-ink-500">{picks.size} selected</span>
          <label className="flex items-center gap-2 text-sm text-ink-600">
            Add to
            <select aria-label="Add to category" value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm">
              {categories.length === 0 && <option value="">New category “General”</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={!picks.size}>Add {picks.size || ""} item{picks.size === 1 ? "" : "s"}</Button>
        </>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <input
          autoFocus
          type="search"
          aria-label="Search catalogue"
          placeholder="Search by description or code…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-md border border-ink-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <select aria-label="Catalogue" value={catalogueId} onChange={(e) => { setCatalogueId(e.target.value); setCategoryFilter(""); }} className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm">
          <option value="">All catalogues</option>
          {catalogues.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== "Published" ? ` (${c.status})` : ""}</option>)}
        </select>
        <select aria-label="Catalogue category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          {filterCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-md border border-ink-200">
        <div className="max-h-[48vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2">Item</th>
                <th className="w-24 px-2 py-2">Type</th>
                <th className="w-16 px-2 py-2">UOM</th>
                <th className="w-24 px-2 py-2 text-right">Unit cost</th>
                <th className="w-24 px-2 py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((h) => {
                const p = picks.get(h.id);
                return (
                  <tr key={h.id} className={cx("border-t border-ink-100", p ? "bg-brand-50/60" : "hover:bg-ink-50")}>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" aria-label={`Select ${h.description}`} checked={!!p} onChange={() => toggle(h)} className="size-4 accent-brand-600" />
                    </td>
                    <td className="cursor-pointer px-2 py-1.5" onClick={() => toggle(h)}>
                      <div className="font-medium text-ink-900">
                        {h.description}
                        {h.isRecipe && <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-800">Recipe · {h.lineCount} part{h.lineCount === 1 ? "" : "s"}</span>}
                      </div>
                      <div className="text-xs text-ink-500">
                        {h.itemCode && <span className="font-mono">{h.itemCode}</span>}
                        {h.itemCode && " · "}
                        {catalogueNames.get(h.catalogueId)}
                        {h.categoryId && catNames.get(h.categoryId) ? ` › ${catNames.get(h.categoryId)}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-1.5"><span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", costTypeTone[h.costType] ?? costTypeTone.Other)}>{h.costType}</span></td>
                    <td className="px-2 py-1.5 text-ink-600">{h.uom}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{h.isRecipe ? <span className="text-ink-400">from parts</span> : money(h.unitCost)}</td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Quantity for ${h.description}`}
                        inputMode="decimal"
                        disabled={!p}
                        value={p?.qty ?? ""}
                        onChange={(e) => setQty(h.id, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        className="w-full rounded border border-ink-200 px-1.5 py-1 text-right text-sm tabular-nums disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!hits.length && (
            <div className="px-4 py-10 text-center text-sm text-ink-500">
              {loading ? "Searching…" : failed ? "Search failed. Try again." : q ? `No catalogue items match “${q}”.` : "No catalogue items yet. Add some under Catalogues."}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-500">Recipes are added as a parent item with their parts as sub-items. Part quantities are per 1 unit of the parent.</p>
    </Dialog>
  );
}
