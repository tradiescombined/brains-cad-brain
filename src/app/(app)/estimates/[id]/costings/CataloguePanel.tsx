"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, money } from "@/lib/format";
import { browseCatalogue, type PanelItem } from "./actions";
import { costTypeLabel, costTypeTone, parseNumberInput } from "./cells";

/** dataTransfer type for a catalogue item dragged from the panel onto the grid. */
export const CATALOGUE_MIME = "application/x-bcb-catalogue-item";

type Tab = "catalogues" | "recipes";
type CatalogueOpt = { id: string; name: string; status: string };
type CatCategory = { id: string; catalogueId: string; parentId: string | null; name: string };

/**
 * Docked catalogue / recipe browser for the costings grid (a drawer on narrow screens).
 * Items are added with "+" (inline quantity) into the chosen target category, or dragged onto a grid row.
 */
export function CataloguePanel({
  open, onOpenChange, tab, onTab, catalogues, catalogueCategories, targets, target, onTarget, onAdd, onSelectSeveral,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  catalogues: CatalogueOpt[];
  catalogueCategories: CatCategory[];
  targets: { id: string; label: string }[];
  target: string;
  onTarget: (id: string) => void;
  onAdd: (categoryId: string, picks: { id: string; quantity: number }[]) => void;
  onSelectSeveral: () => void;
}) {
  const [q, setQ] = useState("");
  const [catalogueId, setCatalogueId] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]); // category drill-down within the catalogue
  const [hits, setHits] = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ id: string; qty: string; err?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const visibleCatalogues = useMemo(() => catalogues.filter((c) => c.status !== "Archived"), [catalogues]);
  const catalogueName = catalogues.find((c) => c.id === catalogueId)?.name ?? "";
  const categoryId = path[path.length - 1] ?? null;
  const catNames = useMemo(() => new Map(catalogueCategories.map((c) => [c.id, c.name])), [catalogueCategories]);
  const subCategories = useMemo(
    () => (catalogueId && !q.trim() ? catalogueCategories.filter((c) => c.catalogueId === catalogueId && (c.parentId ?? null) === categoryId) : []),
    [catalogueCategories, catalogueId, categoryId, q],
  );
  const atRoot = tab === "catalogues" && !catalogueId && !q.trim();

  useEffect(() => {
    if (!open || atRoot) return;
    let cancelled = false;
    setLoading(true);
    const query = q.trim();
    const t = setTimeout(async () => {
      try {
        const res = await browseCatalogue(
          tab === "recipes"
            ? { q: query, recipesOnly: true }
            : { q: query, catalogueId: catalogueId ?? "", categoryId: categoryId ?? (query ? "" : "none") },
        );
        if (cancelled) return;
        if (res.ok) { setHits(res.items); setFailed(null); } else { setHits([]); setFailed(res.error); }
      } catch {
        if (!cancelled) setFailed("Could not load catalogue items. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, atRoot, tab, q, catalogueId, categoryId]);

  useEffect(() => { if (adding) qtyRef.current?.focus(); }, [adding?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const targetLabel = targets.find((t) => t.id === target)?.label ?? "a new “General” category";
  const confirmAdd = (h: PanelItem) => {
    if (!adding) return;
    const n = parseNumberInput(adding.qty);
    if (n === null || Number.isNaN(n) || n < 0 || n >= 1e9) return setAdding({ ...adding, err: "Enter a quantity of 0 or more." });
    onAdd(target, [{ id: h.id, quantity: n }]);
    setNotice(`Added “${h.description}” to ${targetLabel}.`);
    setAdding(null);
  };

  const goRoot = () => { setCatalogueId(null); setPath([]); setAdding(null); };
  const crumbs: { label: string; onClick?: () => void }[] = [];
  if (tab === "catalogues") {
    crumbs.push({ label: "All catalogues", onClick: catalogueId ? goRoot : undefined });
    if (catalogueId) crumbs.push({ label: catalogueName, onClick: path.length ? () => setPath([]) : undefined });
    path.forEach((c, i) => crumbs.push({ label: catNames.get(c) ?? "Category", onClick: i < path.length - 1 ? () => setPath(path.slice(0, i + 1)) : undefined }));
  }

  if (!open) {
    // Docked (wide screens): a slim strip of vertical tabs that re-opens the panel
    return (
      <div className="sticky top-4 hidden shrink-0 flex-col gap-1 self-start rounded-lg border border-ink-200 bg-white p-1 shadow-xs lg:flex">
        {(["catalogues", "recipes"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-label={`Open ${t} panel`}
            onClick={() => { onTab(t); onOpenChange(true); }}
            className="rounded px-1 py-3 text-xs font-semibold text-ink-600 [writing-mode:vertical-rl] hover:bg-brand-50 hover:text-brand-800"
          >
            {t === "catalogues" ? "Catalogues" : "Recipes"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-ink-900/30 lg:hidden" aria-hidden onClick={() => onOpenChange(false)} />
      <aside
        aria-label="Catalogue panel"
        className={cx(
          "fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col bg-white shadow-xl",
          "lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-11rem)] lg:min-h-96 lg:w-80 lg:max-w-none lg:shrink-0 lg:self-start lg:rounded-lg lg:border lg:border-ink-200 lg:shadow-xs",
        )}
        onKeyDown={(e) => { if (e.key === "Escape" && !adding && window.matchMedia("(max-width: 1023px)").matches) onOpenChange(false); }}
      >
        <div className="flex items-center gap-1 border-b border-ink-100 px-2 pt-2">
          <div role="tablist" aria-label="Browse" className="flex flex-1 gap-1">
            {(["catalogues", "recipes"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => { onTab(t); setAdding(null); }}
                className={cx(
                  "-mb-px border-b-2 px-2.5 py-1.5 text-sm font-medium",
                  tab === t ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800",
                )}
              >
                {t === "catalogues" ? "Catalogues" : "Recipes"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close catalogue panel" className="mb-1 rounded p-1 text-ink-500 hover:bg-ink-100" title="Hide panel">
            <span aria-hidden>»</span>
          </button>
        </div>

        <div className="space-y-2 border-b border-ink-100 p-2">
          <input
            type="search"
            aria-label="Search items"
            placeholder={tab === "recipes" ? "Search recipes…" : catalogueId ? `Search ${catalogueName}…` : "Search all catalogues…"}
            value={q}
            onChange={(e) => { setQ(e.target.value); setAdding(null); }}
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <label className="flex items-center gap-2 text-xs text-ink-600">
            <span className="shrink-0">Add to</span>
            <select aria-label="Add items to" value={target} onChange={(e) => onTarget(e.target.value)} className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-1.5 py-1 text-xs">
              {targets.length === 0 && <option value="">New category “General”</option>}
              {targets.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          {crumbs.length > 0 && (
            <nav aria-label="Catalogue breadcrumb" className="flex flex-wrap items-center gap-1 text-xs">
              {crumbs.map((c, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <span className="text-ink-300">›</span>}
                  {c.onClick ? (
                    <button type="button" onClick={c.onClick} className="truncate text-brand-700 hover:underline">{c.label}</button>
                  ) : (
                    <span className="truncate font-medium text-ink-800" aria-current="location">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
          {atRoot ? (
            <ul aria-label="Catalogues">
              {visibleCatalogues.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setCatalogueId(c.id); setPath([]); }} className="flex w-full items-center justify-between gap-2 border-b border-ink-100 px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                    <span className="min-w-0 truncate font-medium text-ink-900">{c.name}</span>
                    <span className="shrink-0 text-ink-400" aria-hidden>›</span>
                  </button>
                </li>
              ))}
              {!visibleCatalogues.length && <li className="px-3 py-8 text-center text-sm text-ink-500">No catalogues yet. Add some under Catalogues.</li>}
            </ul>
          ) : (
            <>
              {subCategories.length > 0 && (
                <ul aria-label="Categories">
                  {subCategories.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setPath([...path, c.id])} className="flex w-full items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2 text-left text-sm hover:bg-ink-100">
                        <span className="flex min-w-0 items-center gap-2"><span aria-hidden className="text-ink-400">▸</span><span className="truncate text-ink-800">{c.name}</span></span>
                        <span className="shrink-0 text-ink-400" aria-hidden>›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <ul aria-label={tab === "recipes" ? "Recipes" : "Catalogue items"}>
                {hits.map((h) => {
                  const isAdding = adding?.id === h.id;
                  return (
                    <li
                      key={h.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(CATALOGUE_MIME, JSON.stringify({ id: h.id, description: h.description }));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      data-testid={`panel-item-${h.id}`}
                      className={cx("group cursor-grab border-b border-ink-100 px-3 py-2 active:cursor-grabbing", isAdding ? "bg-brand-50/60" : "hover:bg-ink-50")}
                      title="Drag onto a category or between rows, or use + to add"
                    >
                      <div className="flex items-start gap-2">
                        <span aria-hidden className="mt-0.5 select-none text-ink-300 group-hover:text-ink-500">⠿</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-snug text-ink-900">{h.description}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-500">
                            {h.itemCode && <span className="font-mono">{h.itemCode}</span>}
                            <span className={cx("rounded-full px-1.5 py-px font-semibold ring-1 ring-inset", h.isRecipe ? "bg-brand-50 text-brand-800 ring-brand-200" : costTypeTone[h.costType] ?? costTypeTone.Other)}>
                              {h.isRecipe ? `Recipe · ${h.lineCount} part${h.lineCount === 1 ? "" : "s"}` : costTypeLabel(h.costType)}
                            </span>
                            {(tab === "recipes" || q.trim()) && <span className="truncate">{h.catalogueName}{h.categoryName ? ` › ${h.categoryName}` : ""}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <div className="tabular-nums text-ink-800">{h.isRecipe ? <span className="text-ink-400">from parts</span> : money(h.unitCost)}</div>
                          <div className="text-ink-500">{h.uom ? `per ${h.uom}` : ""}</div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Add ${h.description}`}
                          aria-expanded={isAdding}
                          onClick={() => setAdding(isAdding ? null : { id: h.id, qty: "1" })}
                          className="shrink-0 rounded-md border border-ink-200 bg-white px-2 py-0.5 text-sm font-semibold text-brand-700 hover:border-brand-300 hover:bg-brand-50"
                        >
                          +
                        </button>
                      </div>
                      {isAdding && adding && (
                        <form
                          className="mt-2 flex flex-wrap items-center gap-2"
                          onSubmit={(e) => { e.preventDefault(); confirmAdd(h); }}
                          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAdding(null); } }}
                        >
                          <label className="flex items-center gap-1.5 text-xs text-ink-600">
                            Qty
                            <input
                              ref={qtyRef}
                              aria-label={`Quantity of ${h.description}`}
                              inputMode="decimal"
                              value={adding.qty}
                              onChange={(e) => setAdding({ ...adding, qty: e.target.value, err: undefined })}
                              className={cx("w-20 rounded border px-1.5 py-1 text-right text-sm tabular-nums", adding.err ? "border-red-400" : "border-ink-200")}
                            />
                          </label>
                          {h.uom && <span className="text-xs text-ink-500">{h.uom}</span>}
                          <button type="submit" className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">Add to estimate</button>
                          <button type="button" onClick={() => setAdding(null)} className="text-xs text-ink-500 hover:text-ink-800">Cancel</button>
                          {adding.err && <span role="alert" className="w-full text-xs text-red-700">{adding.err}</span>}
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!hits.length && !subCategories.length && (
                <p className="px-4 py-10 text-center text-sm text-ink-500">
                  {loading ? "Loading…" : failed ? failed : q.trim() ? `Nothing matches “${q.trim()}”.` : tab === "recipes" ? "No recipes yet." : "No items here."}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-ink-100 px-3 py-2 text-xs">
          <span aria-live="polite" className="min-w-0 flex-1 truncate text-emerald-700" data-testid="panel-notice">{notice}</span>
          <button type="button" onClick={onSelectSeveral} className="shrink-0 font-medium text-brand-700 hover:underline">Select several…</button>
        </div>
      </aside>
    </>
  );
}
