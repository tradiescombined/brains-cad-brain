"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EstimateItem } from "@/db/schema";
import { calculate, totalMarkupPercent, type MarkupLine, type Redistribution, type Rounding } from "@/lib/calc";
import { cx, money } from "@/lib/format";
import {
  canIndent, canMove, canOutdent, childrenOf, depthOf, diffRows, duplicateSubtree, indentRow, insertAfter, insertAt,
  isEmptyPatch, moveRow, moveToCategory, outdentRow, removeSubtrees, subtreeIds, visibleOrder, categoryOf,
} from "@/lib/costings-tree";
import { addCatalogueItems, applyCostingsPatch, saveMarkupLines, setRounding as setRoundingAction, type ActionResult } from "./actions";
import {
  AllowanceSelect, Chevron, COST_TYPES, CostTypeSelect, Dialog, EditCell, editNumber, fmt, isPlainNumber, parseNumberInput,
  type CostTypeName,
} from "./cells";
import { CatalogueModal } from "./CatalogueModal";
import { SummaryPanel, fmtPct } from "./SummaryPanel";

type Row = EstimateItem;
type Measure = { id: string; code: string; description: string; value: number; unit: string };

const FIELDS = [
  "parentId", "kind", "sortOrder", "description", "itemCode", "costType", "allowanceType", "uom", "quantityExpr", "unitCost",
  "markupPercent", "taxable", "supplierId", "catalogueItemId", "measurementId", "notes", "showInSpecification", "hiddenOnQuote", "status",
] as const satisfies readonly (keyof Row)[];

export function CostingsGrid(props: {
  estimateId: string;
  items: Row[];
  measurements: Measure[];
  markupLines: MarkupLine[];
  taxRate: number;
  taxLabel: string;
  redistribution: string;
  rounding: string;
  storedTotals: { costTotal: number; markupTotal: number; taxTotal: number; quoteTotal: number };
  uoms: string[];
  suppliers: { id: string; name: string; type: string | null }[];
  catalogues: { id: string; name: string; status: string }[];
  catalogueCategories: { id: string; catalogueId: string; name: string }[];
}) {
  const { estimateId, items, measurements, taxRate, uoms, suppliers } = props;

  // ---------------------------------------------------------------- state
  const [rows, setRowsState] = useState<Row[]>(items);
  const rowsRef = useRef<Row[]>(items);
  const serverRows = useRef<Row[]>(items);
  const setRows = useCallback((r: Row[]) => {
    rowsRef.current = r;
    setRowsState(r);
  }, []);
  const [drafts, setDrafts] = useState<Record<string, Partial<Row>>>({});
  const [markup, setMarkup] = useState<MarkupLine[]>(props.markupLines);
  const [rounding, setRoundingState] = useState(props.rounding);
  const pending = useRef(0);
  const [saving, setSaving] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; up: boolean; max: number } | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [catalogueTarget, setCatalogueTarget] = useState<string | null>(null);
  const [showMeasures, setShowMeasures] = useState(false);
  const [focusReq, setFocusReq] = useState<{ id: string; col: string } | null>(null);
  const currentRow = useRef<string | null>(null);
  const lastQtyRow = useRef<string | null>(null);
  const qtyInserters = useRef(new Map<string, (t: string) => void>());
  const tableRef = useRef<HTMLDivElement>(null);
  const storageKey = `bcb.costings.collapsed.${estimateId}`;

  // Adopt fresh server props when nothing of ours is in flight.
  useEffect(() => {
    serverRows.current = items;
    if (pending.current === 0) setRows(items);
  }, [items, setRows]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* storage unavailable */ }
  }, [storageKey]);
  const updateCollapsed = (s: Set<string>) => {
    setCollapsed(s);
    try { localStorage.setItem(storageKey, JSON.stringify([...s])); } catch { /* ignore */ }
  };

  // ---------------------------------------------------------------- persistence
  const run = useCallback(
    (fn: () => Promise<ActionResult>, onOk?: () => void) => {
      pending.current++;
      setSaving((s) => s + 1);
      queue.current = queue.current.then(async () => {
        let res: ActionResult;
        try {
          res = await fn();
        } catch {
          res = { ok: false, error: "Could not reach the server, so the last change was not saved." };
        }
        pending.current--;
        setSaving((s) => s - 1);
        if (res.ok) {
          serverRows.current = res.items;
          if (pending.current === 0) setRows(res.items);
          onOk?.();
        } else {
          setError(res.error);
          if (pending.current === 0) setRows(serverRows.current);
        }
      });
    },
    [setRows],
  );

  const commit = useCallback(
    (next: Row[] | null) => {
      if (!next) return false;
      const patch = diffRows(rowsRef.current, next, FIELDS);
      if (isEmptyPatch(patch)) return false;
      setRows(next);
      setError(null);
      run(() => applyCostingsPatch(estimateId, patch));
      return true;
    },
    [estimateId, run, setRows],
  );

  const clearDraft = (id: string) =>
    setDrafts((d) => {
      if (!(id in d)) return d;
      const n = { ...d };
      delete n[id];
      return n;
    });
  const setDraft = (id: string, p: Partial<Row>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const updateRow = (id: string, p: Partial<Row>) => {
    clearDraft(id);
    commit(rowsRef.current.map((r) => (r.id === id ? { ...r, ...p } : r)));
  };

  // ---------------------------------------------------------------- calc (live)
  const merged = useMemo(
    () => (Object.keys(drafts).length ? rows.map((r) => (drafts[r.id] ? { ...r, ...drafts[r.id] } : r)) : rows),
    [rows, drafts],
  );
  const mmap = useMemo(() => Object.fromEntries(measurements.map((m) => [m.code, m.value])), [measurements]);
  const calc = useMemo(
    () =>
      calculate({
        items: merged.map((r) => ({
          id: r.id, parentId: r.parentId, kind: r.kind, sortOrder: r.sortOrder, description: r.description, costType: r.costType,
          allowanceType: r.allowanceType, quantityExpr: r.quantityExpr, quantity: r.quantity, unitCost: r.unitCost,
          markupPercent: r.markupPercent, taxable: r.taxable,
        })),
        markupLines: markup,
        taxRate,
        measurements: mmap,
        pcpsRedistribution: props.redistribution as Redistribution,
        rounding: rounding as Rounding,
      }),
    [merged, markup, taxRate, mmap, props.redistribution, rounding],
  );
  const byId = useMemo(() => new Map(merged.map((r) => [r.id, r])), [merged]);
  /** Persisted (non-draft) rows: edit values compare against these so typed drafts still commit. */
  const baseById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const visible = useMemo(() => visibleOrder(merged, collapsed), [merged, collapsed]);
  const parentsWithKids = useMemo(() => new Set(merged.filter((r) => r.parentId).map((r) => r.parentId!)), [merged]);
  const categories = useMemo(() => childrenOf(merged, null).filter((r) => r.kind === "category"), [merged]);
  const estMarkupPct = totalMarkupPercent(markup);
  const itemRows = merged.filter((r) => r.kind === "item");
  const incomplete = itemRows.filter((r) => r.status !== "Complete").length;
  const allowances = useMemo(() => {
    let pc = 0, ps = 0;
    for (const r of merged) {
      if (r.kind !== "item" || depthOf(merged, r.id) !== 1) continue;
      const t = calc.items[r.id]?.total ?? 0;
      if (r.allowanceType === "PC") pc += t;
      if (r.allowanceType === "PS") ps += t;
    }
    return { pc, ps };
  }, [merged, calc]);

  // ---------------------------------------------------------------- focus helpers
  useEffect(() => {
    if (!focusReq) return;
    const el = tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${focusReq.id}"][data-col="${focusReq.col}"]`);
    if (el) {
      el.focus();
      setFocusReq(null);
    }
  }, [focusReq, visible]);

  const moveFocus = (rowId: string, col: string, dir: 1 | -1) => {
    const i = visible.indexOf(rowId);
    for (let k = i + dir; k >= 0 && k < visible.length; k += dir) {
      const el = tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${visible[k]}"][data-col="${col}"]`);
      if (el) { el.focus(); return; }
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const expand = (ids: (string | null | undefined)[]) => {
    const need = ids.filter((x): x is string => !!x && collapsed.has(x));
    if (!need.length) return;
    const s = new Set(collapsed);
    need.forEach((x) => s.delete(x));
    updateCollapsed(s);
  };

  // ---------------------------------------------------------------- row factories & ops
  const newRow = (p: Partial<Row>): Row => ({
    id: crypto.randomUUID(), estimateId, parentId: null, kind: "item", sortOrder: 0, description: "", itemCode: null, costType: "Material",
    allowanceType: "none", uom: null, quantityExpr: "1", quantity: 1, unitCost: 0, markupPercent: null, taxable: true, supplierId: null,
    catalogueItemId: null, measurementId: null, notes: null, showInSpecification: false, hiddenOnQuote: false, status: "Incomplete",
    total: 0, totalIncMarkup: 0, ...p,
  });

  const addCategory = (afterId?: string | null) => {
    const r = newRow({ kind: "category", description: "New category", quantityExpr: null, quantity: 0 });
    const cur = rowsRef.current;
    const after = afterId ? categoryOf(cur, afterId) : null;
    commit(after ? insertAfter(cur, r, after) : insertAt(cur, r, null, Number.MAX_SAFE_INTEGER));
    setFocusReq({ id: r.id, col: "description" });
  };
  const addItemTo = (categoryId: string, index = Number.MAX_SAFE_INTEGER) => {
    const r = newRow({ parentId: categoryId });
    expand([categoryId]);
    commit(insertAt(rowsRef.current, r, categoryId, index));
    setFocusReq({ id: r.id, col: "description" });
  };
  const addSibling = (rowId: string) => {
    const row = rowsRef.current.find((x) => x.id === rowId);
    if (!row) return;
    if (row.kind === "category") return addItemTo(row.id, 0);
    const r = newRow({ parentId: row.parentId, costType: row.costType });
    commit(insertAfter(rowsRef.current, r, rowId));
    setFocusReq({ id: r.id, col: "description" });
  };
  const addSubItem = (itemId: string) => {
    const row = rowsRef.current.find((x) => x.id === itemId);
    if (!row || row.kind !== "item" || depthOf(rowsRef.current, itemId) !== 1) return;
    const r = newRow({ parentId: itemId, costType: row.costType });
    expand([itemId]);
    commit(insertAt(rowsRef.current, r, itemId, Number.MAX_SAFE_INTEGER));
    setFocusReq({ id: r.id, col: "description" });
  };
  const addItemToolbar = () => {
    const cur = rowsRef.current;
    const anchor = currentRow.current && cur.some((r) => r.id === currentRow.current) ? currentRow.current : null;
    if (anchor) {
      const row = cur.find((r) => r.id === anchor)!;
      if (row.kind === "category") return addItemTo(row.id);
      if (depthOf(cur, anchor) === 1) return addSibling(anchor);
      return addSibling(row.parentId!); // sub-item focused → new item after its parent
    }
    const cats = childrenOf(cur, null);
    if (cats.length) return addItemTo(cats[cats.length - 1].id);
    // no categories yet: create one with a first item
    const c = newRow({ kind: "category", description: "General", quantityExpr: null, quantity: 0 });
    const it = newRow({ parentId: c.id });
    commit(insertAt(insertAt(cur, c, null, 0), it, c.id, 0));
    setFocusReq({ id: it.id, col: "description" });
  };
  const duplicate = (id: string) => {
    const res = duplicateSubtree(rowsRef.current, id);
    if (res) commit(res.rows);
  };
  const remove = (ids: string[]) => {
    commit(removeSubtrees(rowsRef.current, ids));
    setSelected(new Set());
  };

  // bulk targets: selected items + item descendants of any selected row
  const bulkTargets = () => {
    const s = new Set<string>();
    for (const id of selected) for (const x of subtreeIds(rowsRef.current, id)) s.add(x);
    return rowsRef.current.filter((r) => s.has(r.id) && r.kind === "item").map((r) => r.id);
  };
  const bulkSet = (p: Partial<Row>) => {
    const t = new Set(bulkTargets());
    commit(rowsRef.current.map((r) => (t.has(r.id) ? { ...r, ...p } : r)));
  };

  const insertMeasure = (token: string) => {
    const active = document.activeElement as HTMLElement | null;
    const id = active?.dataset.col === "qty" ? active.dataset.row ?? null : lastQtyRow.current;
    const fn = id ? qtyInserters.current.get(id) : undefined;
    if (!fn) {
      setError("Click into an item's quantity first, then choose a measurement to insert.");
      return;
    }
    setError(null);
    fn(token);
  };

  // ---------------------------------------------------------------- keyboard
  const onGridKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const col = t.dataset.col;
    const rid = t.dataset.row;
    if (!col || !rid || t.tagName !== "INPUT" || (t as HTMLInputElement).type === "checkbox") return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      t.blur();
      addSibling(rid);
    } else if (e.key === "Enter") {
      e.preventDefault();
      moveFocus(rid, col, e.shiftKey ? -1 : 1);
    }
  };

  const menuAnchor = useRef<HTMLElement | null>(null);
  const openMenu = (id: string, el: HTMLElement) => {
    menuAnchor.current = el;
    placeMenu(id, el);
  };
  const placeMenu = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 440 && above > below;
    setMenu({ id, x: Math.max(8, r.right - 224), y: up ? r.top - 4 : r.bottom + 4, up, max: Math.max(160, up ? above : below) });
  };

  // close row menu on outside click / scroll
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && document.getElementById("row-menu")?.contains(e.target)) return;
      setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    // keep the menu attached to its ⋯ button while the page or grid scrolls
    const follow = (e: Event) => {
      if (e.target instanceof Node && document.getElementById("row-menu")?.contains(e.target)) return;
      const btn = menuAnchor.current;
      if (!btn || !btn.isConnected) return setMenu(null);
      placeMenu(menu.id, btn);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.id]);

  const toggleCollapse = (id: string) => {
    const s = new Set(collapsed);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    updateCollapsed(s);
  };
  const collapseAll = () => updateCollapsed(new Set(merged.filter((r) => parentsWithKids.has(r.id)).map((r) => r.id)));
  const expandAll = () => updateCollapsed(new Set());

  const toggleSel = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const allVisibleSelected = visible.length > 0 && visible.every((id) => selected.has(id));

  const categoryOptions = categories.map((c) => ({ id: c.id, label: `${calc.items[c.id]?.number ?? ""}. ${c.description || "Untitled category"}` }));

  // ---------------------------------------------------------------- render
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {error && <ErrorBar error={error} onClose={() => setError(null)} />}
        <div className="rounded-lg border border-dashed border-ink-300 bg-white px-6 py-14 text-center">
          <p className="text-base font-medium text-ink-800">No costings yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Break the job into categories such as Demolition or Framing, then add the materials, labour and trades under each one.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => addCategory()} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              Add your first category
            </button>
            <button type="button" onClick={() => { setCatalogueTarget(null); setCatalogueOpen(true); }} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">
              Add from catalogue
            </button>
          </div>
        </div>
        <CatalogueModal
          open={catalogueOpen}
          onClose={() => setCatalogueOpen(false)}
          onAdd={(cat, picks) => run(() => addCatalogueItems(estimateId, { categoryId: cat, picks }))}
          categories={categoryOptions}
          defaultCategoryId={catalogueTarget}
          catalogues={props.catalogues}
          catalogueCategories={props.catalogueCategories}
        />
      </div>
    );
  }

  const menuRow = menu ? byId.get(menu.id) : undefined;
  const detailsRow = detailsFor ? byId.get(detailsFor) : undefined;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <ToolBtn onClick={() => addCategory(currentRow.current)} primary>+ Category</ToolBtn>
        <ToolBtn onClick={addItemToolbar}>+ Item</ToolBtn>
        <ToolBtn onClick={() => { setCatalogueTarget(currentRow.current ? categoryOf(rowsRef.current, currentRow.current) : null); setCatalogueOpen(true); }}>
          Add from catalogue
        </ToolBtn>
        <div className="relative">
          <ToolBtn onClick={() => setShowMeasures((v) => !v)} keepFocus active={showMeasures}>
            Measurements{measurements.length ? ` (${measurements.length})` : ""} ▾
          </ToolBtn>
          {showMeasures && (
            <MeasurePanel measurements={measurements} onPick={insertMeasure} onClose={() => setShowMeasures(false)} estimateId={estimateId} />
          )}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-ink-200 sm:block" />
        <ToolBtn onClick={collapseAll}>Collapse all</ToolBtn>
        <ToolBtn onClick={expandAll}>Expand all</ToolBtn>
        <div className="ml-auto flex items-center gap-3 text-xs text-ink-500">
          <span className="hidden md:inline">Enter ↓ · Tab → · {isMacLike() ? "⌘" : "Ctrl"}+Enter adds a row · Esc undoes typing</span>
          <span aria-live="polite" data-testid="save-state" className={cx("rounded-full px-2 py-0.5 font-medium", saving ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
            {saving ? "Saving…" : "All changes saved"}
          </span>
        </div>
      </div>

      {error && <ErrorBar error={error} onClose={() => setError(null)} />}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          categories={categoryOptions}
          estMarkupPct={estMarkupPct}
          onClear={() => setSelected(new Set())}
          onDelete={() => remove([...selected])}
          onCostType={(t) => bulkSet({ costType: t })}
          onMarkup={(m) => bulkSet({ markupPercent: m })}
          onMove={(cat) => { commit(moveToCategory(rowsRef.current, [...selected], cat)); expand([cat]); setSelected(new Set()); }}
          deleteCount={new Set([...selected].flatMap((id) => subtreeIds(merged, id))).size}
        />
      )}

      {/* Grid */}
      <div ref={tableRef} className="max-h-[calc(100vh-15rem)] min-h-64 overflow-auto rounded-lg border border-ink-200 bg-white shadow-xs" onKeyDown={onGridKey}>
        <datalist id="uom-list">
          {uoms.map((u) => <option key={u} value={u} />)}
        </datalist>
        <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 text-[13px]" aria-label="Costings">
          <colgroup>
            <col className="w-8" />
            <col className="w-16" />
            <col />
            <col className="w-[104px]" />
            <col className="w-14" />
            <col className="w-28" />
            <col className="w-[72px]" />
            <col className="w-[100px]" />
            <col className="w-[72px]" />
            <col className="w-11" />
            <col className="w-[104px]" />
            <col className="w-[104px]" />
            <col className="w-9" />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <Th><input type="checkbox" aria-label="Select all rows" className="size-3.5 accent-brand-600" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible))} /></Th>
              <Th>#</Th>
              <Th>Description</Th>
              <Th>Type</Th>
              <Th title="Prime cost / provisional sum">PC/PS</Th>
              <Th right>Qty</Th>
              <Th>UOM</Th>
              <Th right>Unit cost</Th>
              <Th right title="Leave blank to use the estimate markup">Markup</Th>
              <Th title="Taxable">Tax</Th>
              <Th right>Total</Th>
              <Th right>Sell</Th>
              <Th><span className="sr-only">Actions</span></Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((id) => {
              const r = byId.get(id)!;
              const ri = calc.items[id];
              if (!ri) return null;
              const depth = ri.depth;
              const isCat = r.kind === "category";
              const hasKids = parentsWithKids.has(id);
              const isOpen = !collapsed.has(id);
              const sel = selected.has(id);
              const complete = r.status === "Complete";
              const parent = r.parentId ? byId.get(r.parentId) : undefined;
              const cellBase = cx("border-b border-ink-100 px-1 py-1 align-top", isCat ? "bg-ink-50" : sel ? "bg-brand-50/50" : "bg-white group-hover:bg-ink-50/40");
              const b = baseById.get(id) ?? r;
              const qtyExpr = b.quantityExpr ?? (b.quantity ? editNumber(b.quantity, 3) : "");
              const supplier = r.supplierId ? suppliers.find((s) => s.id === r.supplierId) : undefined;

              return (
                <tr
                  key={id}
                  className="group"
                  data-testid={`row-${id}`}
                  data-kind={isCat ? "category" : depth === 2 ? "subitem" : "item"}
                  onFocus={() => { currentRow.current = id; }}
                >
                  <td className={cellBase}>
                    <input type="checkbox" aria-label={`Select row ${ri.number}`} checked={sel} onChange={() => toggleSel(id)} className="mt-1.5 size-3.5 accent-brand-600" />
                  </td>
                  <td className={cx(cellBase, "pt-2 font-mono text-[11px]", isCat ? "font-semibold text-ink-800" : "text-ink-500")}>
                    <span className="flex items-center gap-1">
                      {ri.number}
                      {complete && !isCat && <span title="Marked complete" className="text-emerald-600">✓</span>}
                    </span>
                  </td>
                  <td className={cellBase}>
                    <div className="flex items-start gap-1" style={{ paddingLeft: depth * 18 }}>
                      {hasKids ? (
                        <button
                          type="button"
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          aria-expanded={isOpen}
                          onClick={() => toggleCollapse(id)}
                          className="mt-1 rounded p-0.5 text-ink-500 hover:bg-ink-200"
                        >
                          <Chevron open={isOpen} />
                        </button>
                      ) : (
                        <span className={cx("mt-1 inline-block w-[18px] shrink-0", depth === 2 && "border-l-2 border-ink-200")} />
                      )}
                      <div className="min-w-0 flex-1">
                        <EditCell
                          rowId={id}
                          col="description"
                          ariaLabel={isCat ? "Category name" : "Description"}
                          display={r.description}
                          editValue={r.description}
                          placeholder={isCat ? "Category name" : depth === 2 ? "Sub-item description" : "Describe this item"}
                          className={cx(isCat && "font-semibold", complete && !isCat && "text-ink-500")}
                          onCommit={(v) => updateRow(id, { description: v.slice(0, 500) })}
                        />
                        {!isCat && (r.notes || supplier || r.showInSpecification || r.itemCode) && (
                          <div className="flex flex-wrap gap-x-2 px-1.5 text-[11px] text-ink-500">
                            {r.itemCode && <span className="font-mono">{r.itemCode}</span>}
                            {supplier && <span>⛟ {supplier.name}</span>}
                            {r.notes && <button type="button" className="hover:text-brand-700" onClick={() => setDetailsFor(id)} title={r.notes}>✎ Note</button>}
                            {r.showInSpecification && <span className="text-brand-700">In spec</span>}
                          </div>
                        )}
                        {isCat && (
                          <div className="px-1.5 text-[11px] text-ink-500">
                            {childrenOf(merged, id).length} item{childrenOf(merged, id).length === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {isCat ? (
                    <>
                      <td className={cellBase} colSpan={7}>
                        <button type="button" onClick={() => addItemTo(id)} className="mt-1 text-xs font-medium text-brand-700 hover:text-brand-800">+ Add item</button>
                      </td>
                      <td className={cx(cellBase, "pt-2 text-right font-semibold tabular-nums")} data-testid={`cat-total-${id}`}>{money(ri.total)}</td>
                      <td className={cx(cellBase, "pt-2 text-right font-semibold tabular-nums")}>{money(ri.totalIncMarkup)}</td>
                    </>
                  ) : (
                    <>
                      <td className={cx(cellBase, "pt-1.5")}>
                        {hasKids ? (
                          <span className="block rounded-full bg-brand-50 px-2 py-0.5 text-center text-[11px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-200" title="Cost comes from its sub-items">Recipe</span>
                        ) : (
                          <CostTypeSelect rowId={id} value={r.costType} onChange={(v) => updateRow(id, { costType: v })} />
                        )}
                      </td>
                      <td className={cx(cellBase, "pt-1.5")}>
                        <AllowanceSelect rowId={id} value={r.allowanceType} onChange={(v) => updateRow(id, { allowanceType: v })} />
                      </td>
                      <td className={cellBase}>
                        <EditCell
                          rowId={id}
                          col="qty"
                          ariaLabel="Quantity"
                          align="right"
                          display={ri.error ? (r.quantityExpr ?? "") : fmt(ri.quantity, 3, 0)}
                          editValue={qtyExpr}
                          invalid={!!ri.error}
                          onFocusCell={() => { lastQtyRow.current = id; }}
                          registerInsert={(fn) => { if (fn) qtyInserters.current.set(id, fn); else qtyInserters.current.delete(id); }}
                          onDraft={(v) => setDraft(id, { quantityExpr: v })}
                          onCancel={() => clearDraft(id)}
                          onCommit={(v) => updateRow(id, { quantityExpr: v.trim() || null, ...(v.trim() ? {} : { quantity: 0 }) })}
                          hint={
                            ri.error ? (
                              <div className="px-1.5 text-right text-[10px] leading-tight text-red-700" role="alert">{ri.error}</div>
                            ) : r.quantityExpr && !isPlainNumber(r.quantityExpr) ? (
                              <div className="truncate px-1.5 text-right font-mono text-[10px] leading-tight text-ink-400" title={r.quantityExpr}>{r.quantityExpr}</div>
                            ) : depth === 2 && parent ? (
                              <div className="truncate px-1.5 text-right text-[10px] leading-tight text-ink-400">per {parent.uom || "unit"}</div>
                            ) : null
                          }
                        />
                      </td>
                      <td className={cellBase}>
                        <EditCell
                          rowId={id}
                          col="uom"
                          ariaLabel="Unit of measure"
                          list="uom-list"
                          display={r.uom ?? ""}
                          editValue={r.uom ?? ""}
                          placeholder="ea"
                          onCommit={(v) => updateRow(id, { uom: v.trim().slice(0, 32) || null })}
                        />
                      </td>
                      <td className={cellBase}>
                        {hasKids ? (
                          <div className="px-1.5 py-1 text-right tabular-nums text-ink-600" title="Rolled up from sub-items">{fmt(ri.unitCost)}</div>
                        ) : (
                          <EditCell
                            rowId={id}
                            col="unitCost"
                            ariaLabel="Unit cost"
                            align="right"
                            inputMode="decimal"
                            display={fmt(b.unitCost)}
                            editValue={editNumber(b.unitCost, 4)}
                            onDraft={(v) => { const n = parseNumberInput(v); if (n !== null && !Number.isNaN(n)) setDraft(id, { unitCost: n }); }}
                            onCancel={() => clearDraft(id)}
                            onCommit={(v) => {
                              const n = parseNumberInput(v);
                              if (Number.isNaN(n) || (n !== null && Math.abs(n) >= 1e10)) { clearDraft(id); setError(`“${v}” is not a valid unit cost.`); return; }
                              updateRow(id, { unitCost: n ?? 0 });
                            }}
                          />
                        )}
                      </td>
                      <td className={cellBase}>
                        <EditCell
                          rowId={id}
                          col="markup"
                          ariaLabel="Markup percent"
                          align="right"
                          inputMode="decimal"
                          placeholder={fmtPct(estMarkupPct)}
                          className={r.markupPercent != null ? "font-medium text-brand-800" : undefined}
                          display={r.markupPercent != null ? fmtPct(r.markupPercent) : ""}
                          editValue={r.markupPercent != null ? String(r.markupPercent) : ""}
                          onCommit={(v) => {
                            const n = parseNumberInput(v);
                            if (Number.isNaN(n) || (n !== null && (n < -100 || n > 1000))) { setError("Markup must be a number between -100 and 1000, or blank for the estimate default."); return; }
                            updateRow(id, { markupPercent: n });
                          }}
                        />
                      </td>
                      <td className={cx(cellBase, "pt-2 text-center")}>
                        <input type="checkbox" aria-label="Taxable" checked={r.taxable} onChange={(e) => updateRow(id, { taxable: e.target.checked })} className="size-3.5 accent-brand-600" />
                      </td>
                      <td className={cx(cellBase, "pt-2 pr-2 text-right tabular-nums", hasKids && "font-medium")} data-testid={`total-${id}`}>{money(ri.total)}</td>
                      <td className={cx(cellBase, "pt-2 pr-2 text-right tabular-nums text-ink-700", hasKids && "font-medium")} data-testid={`sell-${id}`}>{money(ri.totalIncMarkup)}</td>
                    </>
                  )}
                  <td className={cx(cellBase, "text-center")}>
                    <button
                      type="button"
                      aria-label={`Row actions ${ri.number}`}
                      aria-haspopup="menu"
                      onClick={(e) => (menu?.id === id ? setMenu(null) : openMenu(id, e.currentTarget))}
                      className="mt-0.5 rounded px-1.5 py-0.5 text-ink-500 hover:bg-ink-200 hover:text-ink-800"
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky totals bar */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-ink-200 bg-white/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
        <Mini label="Cost" value={money(calc.costTotal)} />
        <Mini label={`Markup ${fmtPct(estMarkupPct)}`} value={money(calc.markupTotal)} />
        <Mini label="Tax" value={money(calc.taxTotal)} />
        <Mini label="Quote total" value={money(calc.quoteTotal)} strong testId="bar-quote" />
        <span className={cx("ml-auto text-xs", incomplete ? "text-amber-700" : "text-emerald-700")}>
          {incomplete ? `${incomplete} row${incomplete === 1 ? "" : "s"} not yet marked complete` : "All rows complete"}
        </span>
      </div>

      <SummaryPanel
        calc={calc}
        markupLines={markup}
        onSaveMarkup={(lines) => { setMarkup(lines); run(() => saveMarkupLines(estimateId, lines)); }}
        rounding={rounding}
        onRounding={(r) => { setRoundingState(r); run(() => setRoundingAction(estimateId, r)); }}
        taxLabel={props.taxLabel}
        redistribution={props.redistribution}
        incomplete={incomplete}
        itemCount={itemRows.length}
        allowances={allowances}
      />

      {/* Row menu */}
      {menu && menuRow && (
        <RowMenu
          key={menu.id}
          pos={menu}
          row={menuRow}
          depth={depthOf(merged, menu.id)}
          hasKids={parentsWithKids.has(menu.id)}
          collapsed={collapsed.has(menu.id)}
          canUp={canMove(merged, menu.id, -1)}
          canDown={canMove(merged, menu.id, 1)}
          canIndent={canIndent(merged, menu.id)}
          canOutdent={canOutdent(merged, menu.id)}
          subtreeSize={subtreeIds(merged, menu.id).length}
          onAction={(a) => {
            const id = menu.id;
            setMenu(null);
            const cur = rowsRef.current;
            switch (a) {
              case "addItem": return addItemTo(id);
              case "addBelow": return addSibling(id);
              case "addSub": return addSubItem(id);
              case "addCategory": return addCategory(id);
              case "catalogue": setCatalogueTarget(categoryOf(cur, id)); return setCatalogueOpen(true);
              case "duplicate": return duplicate(id);
              case "up": return commit(moveRow(cur, id, -1));
              case "down": return commit(moveRow(cur, id, 1));
              case "indent": { const r = indentRow(cur, id); const p = r?.find((x) => x.id === id)?.parentId; expand([p]); return commit(r); }
              case "outdent": return commit(outdentRow(cur, id));
              case "complete": return updateRow(id, { status: menuRow.status === "Complete" ? "Incomplete" : "Complete" });
              case "spec": return updateRow(id, { showInSpecification: !menuRow.showInSpecification });
              case "details": return setDetailsFor(id);
              case "collapse": return toggleCollapse(id);
              case "delete": return remove([id]);
            }
          }}
        />
      )}

      <DetailsDialog
        key={detailsFor ?? "none"}
        row={detailsRow}
        suppliers={suppliers}
        onClose={() => setDetailsFor(null)}
        onSave={(p) => { if (detailsFor) updateRow(detailsFor, p); setDetailsFor(null); }}
      />

      <CatalogueModal
        open={catalogueOpen}
        onClose={() => setCatalogueOpen(false)}
        onAdd={(cat, picks) => { if (cat) expand([cat]); run(() => addCatalogueItems(estimateId, { categoryId: cat, picks })); }}
        categories={categoryOptions}
        defaultCategoryId={catalogueTarget}
        catalogues={props.catalogues}
        catalogueCategories={props.catalogueCategories}
      />
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function isMacLike() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");
}

function Th({ children, right, title }: { children?: ReactNode; right?: boolean; title?: string }) {
  return (
    <th title={title} className={cx("border-b border-ink-200 bg-ink-50 px-2 py-2", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function ToolBtn({ children, onClick, primary, keepFocus, active }: { children: ReactNode; onClick: () => void; primary?: boolean; keepFocus?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium shadow-xs",
        primary ? "border-transparent bg-brand-600 text-white hover:bg-brand-700" : active ? "border-brand-300 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-800 hover:bg-ink-50",
      )}
    >
      {children}
    </button>
  );
}

function Mini({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={cx("tabular-nums", strong ? "text-base font-semibold text-ink-900" : "text-ink-800")} data-testid={testId}>{value}</span>
    </span>
  );
}

function ErrorBar({ error, onClose }: { error: string; onClose: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span>{error}</span>
      <button type="button" onClick={onClose} className="text-red-500 hover:text-red-800" aria-label="Dismiss">✕</button>
    </div>
  );
}

function MeasurePanel({ measurements, onPick, onClose, estimateId }: { measurements: Measure[]; onPick: (t: string) => void; onClose: () => void; estimateId: string }) {
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep focus in the quantity cell
  return (
    <div className="absolute left-0 top-full z-40 mt-1 w-80 rounded-lg border border-ink-200 bg-white p-2 shadow-lg" onMouseDown={keep} role="dialog" aria-label="Measurements">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Insert into quantity</span>
        <button type="button" onClick={onClose} className="rounded px-1 text-ink-400 hover:bg-ink-100" aria-label="Close measurements">✕</button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {measurements.length === 0 && (
          <p className="px-2 py-3 text-sm text-ink-500">
            No takeoff measurements yet. Draw them under{" "}
            <a href={`/estimates/${estimateId}/takeoffs`} className="text-brand-700 underline" onMouseDown={(e) => e.stopPropagation()}>Plans & takeoffs</a>.
          </p>
        )}
        {measurements.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(`[${m.code}]`)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-brand-50"
          >
            <span className="w-12 shrink-0 font-mono text-xs font-semibold text-brand-700">[{m.code}]</span>
            <span className="min-w-0 flex-1 truncate text-ink-800">{m.description}</span>
            <span className="shrink-0 tabular-nums text-ink-500">{fmt(m.value, 3, 0)} {m.unit}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 border-t border-ink-100 px-1 pt-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Wastage & helpers</div>
        <div className="flex flex-wrap gap-1">
          {[5, 10, 15, 20].map((w) => (
            <button key={w} type="button" onClick={() => onPick(`[W${w}]`)} className="rounded border border-ink-200 px-1.5 py-0.5 font-mono text-xs hover:border-brand-300 hover:bg-brand-50" title={`Adds ${w}% waste (×${1 + w / 100})`}>
              [W{w}]
            </button>
          ))}
          <button type="button" onClick={() => onPick("[Q]")} className="rounded border border-ink-200 px-1.5 py-0.5 font-mono text-xs hover:border-brand-300 hover:bg-brand-50" title="Parent item's quantity (for sub-items)">[Q]</button>
        </div>
      </div>
    </div>
  );
}

type MenuAction =
  | "addItem" | "addBelow" | "addSub" | "addCategory" | "catalogue" | "duplicate" | "up" | "down" | "indent" | "outdent"
  | "complete" | "spec" | "details" | "collapse" | "delete";

function MenuItem({ a, children, disabled, hint, onAction }: { a: MenuAction; children: ReactNode; disabled?: boolean; hint?: string; onAction: (a: MenuAction) => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onAction(a)}
      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-100 disabled:pointer-events-none disabled:text-ink-300"
    >
      <span>{children}</span>
      {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
    </button>
  );
}
const MenuSep = () => <div className="my-1 border-t border-ink-100" />;

function RowMenu({
  pos, row, depth, hasKids, collapsed, canUp, canDown, canIndent, canOutdent, subtreeSize, onAction,
}: {
  pos: { x: number; y: number; up: boolean; max: number };
  row: Row;
  depth: number;
  hasKids: boolean;
  collapsed: boolean;
  canUp: boolean;
  canDown: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  subtreeSize: number;
  onAction: (a: MenuAction) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const isCat = row.kind === "category";
  return (
    <div
      id="row-menu"
      role="menu"
      aria-label="Row actions"
      className="fixed z-50 w-56 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-xl"
      style={{ left: pos.x, top: pos.up ? undefined : pos.y, bottom: pos.up ? window.innerHeight - pos.y : undefined, maxHeight: pos.max }}
    >
      {isCat ? (
        <>
          <MenuItem onAction={onAction} a="addItem">Add item</MenuItem>
          <MenuItem onAction={onAction} a="catalogue">Add from catalogue…</MenuItem>
          <MenuItem onAction={onAction} a="addCategory">Add category below</MenuItem>
        </>
      ) : (
        <>
          <MenuItem onAction={onAction} a="addBelow" hint="Ctrl+Enter">{depth === 2 ? "Add sub-item below" : "Add item below"}</MenuItem>
          {depth === 1 && <MenuItem onAction={onAction} a="addSub">Add sub-item</MenuItem>}
        </>
      )}
      <MenuItem onAction={onAction} a="duplicate">Duplicate{subtreeSize > 1 ? ` (${subtreeSize} rows)` : ""}</MenuItem>
      <MenuSep />
      <MenuItem onAction={onAction} a="up" disabled={!canUp}>Move up</MenuItem>
      <MenuItem onAction={onAction} a="down" disabled={!canDown}>Move down</MenuItem>
      {!isCat && (
        <>
          <MenuItem onAction={onAction} a="indent" disabled={!canIndent}>Indent (make sub-item)</MenuItem>
          <MenuItem onAction={onAction} a="outdent" disabled={!canOutdent}>Outdent (make item)</MenuItem>
        </>
      )}
      {hasKids && <MenuItem onAction={onAction} a="collapse">{collapsed ? "Expand" : "Collapse"}</MenuItem>}
      {!isCat && (
        <>
          <MenuSep />
          <MenuItem onAction={onAction} a="complete">{row.status === "Complete" ? "Mark as not complete" : "Mark complete"}</MenuItem>
          <MenuItem onAction={onAction} a="spec">{row.showInSpecification ? "✓ " : ""}Show in specification</MenuItem>
          <MenuItem onAction={onAction} a="details">Notes, supplier & code…</MenuItem>
        </>
      )}
      <MenuSep />
      {confirm ? (
        <button type="button" role="menuitem" onClick={() => onAction("delete")} className="w-full rounded bg-red-600 px-2 py-1.5 text-left text-sm font-medium text-white hover:bg-red-700">
          Confirm delete{subtreeSize > 1 ? ` ${subtreeSize} rows` : ""}
        </button>
      ) : (
        <button type="button" role="menuitem" onClick={() => setConfirm(true)} className="w-full rounded px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50">
          Delete{isCat ? " category" : ""}…
        </button>
      )}
    </div>
  );
}

function BulkBar({
  count, categories, estMarkupPct, onClear, onDelete, onCostType, onMarkup, onMove, deleteCount,
}: {
  count: number;
  categories: { id: string; label: string }[];
  estMarkupPct: number;
  onClear: () => void;
  onDelete: () => void;
  onCostType: (t: CostTypeName) => void;
  onMarkup: (m: number | null) => void;
  onMove: (cat: string) => void;
  deleteCount: number;
}) {
  const [confirm, setConfirm] = useState(false);
  const [mk, setMk] = useState("");
  const [mkErr, setMkErr] = useState(false);
  const sel = "rounded-md border border-ink-200 bg-white px-2 py-1 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
      <span className="font-medium text-brand-900">{count} selected</span>
      <select aria-label="Set cost type" className={sel} value="" onChange={(e) => e.target.value && onCostType(e.target.value as CostTypeName)}>
        <option value="">Set cost type…</option>
        {COST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span className="flex items-center gap-1">
        <input
          aria-label="Bulk markup percent"
          placeholder={`Markup % (${fmtPct(estMarkupPct)})`}
          value={mk}
          onChange={(e) => { setMk(e.target.value); setMkErr(false); }}
          className={cx(sel, "w-36", mkErr && "border-red-400")}
          inputMode="decimal"
        />
        <button
          type="button"
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-sm hover:bg-ink-50"
          onClick={() => {
            const n = parseNumberInput(mk);
            if (Number.isNaN(n) || (n !== null && (n < -100 || n > 1000))) return setMkErr(true);
            onMarkup(n);
            setMk("");
          }}
        >
          {mk.trim() ? "Apply markup" : "Reset markup"}
        </button>
      </span>
      <select aria-label="Move to category" className={sel} value="" onChange={(e) => e.target.value && onMove(e.target.value)}>
        <option value="">Move to category…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      {confirm ? (
        <button type="button" onClick={onDelete} className="rounded-md bg-red-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-red-700">
          Confirm delete {deleteCount} row{deleteCount === 1 ? "" : "s"}
        </button>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-sm text-red-700 hover:bg-red-50">
          Delete selected…
        </button>
      )}
      <button type="button" onClick={onClear} className="ml-auto text-sm text-ink-600 hover:text-ink-900">Clear selection</button>
    </div>
  );
}

function DetailsDialog({
  row, suppliers, onClose, onSave,
}: {
  row: Row | undefined;
  suppliers: { id: string; name: string; type: string | null }[];
  onClose: () => void;
  onSave: (p: Partial<Row>) => void;
}) {
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [supplierId, setSupplierId] = useState(row?.supplierId ?? "");
  const [itemCode, setItemCode] = useState(row?.itemCode ?? "");
  const [spec, setSpec] = useState(row?.showInSpecification ?? false);
  const [hidden, setHidden] = useState(row?.hiddenOnQuote ?? false);
  const [complete, setComplete] = useState(row?.status === "Complete");
  const input = "block w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
  return (
    <Dialog
      open={!!row}
      onClose={onClose}
      title={row?.description ? `Details: ${row.description}` : "Item details"}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50">Cancel</button>
          <button
            type="button"
            onClick={() =>
              onSave({
                notes: notes.trim() ? notes.slice(0, 5000) : null,
                supplierId: supplierId || null,
                itemCode: itemCode.trim().slice(0, 64) || null,
                showInSpecification: spec,
                hiddenOnQuote: hidden,
                status: complete ? "Complete" : "Incomplete",
              })
            }
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Save details
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Supplier / trade</span>
            <select aria-label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.type ? ` · ${s.type}` : ""}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Item code</span>
            <input aria-label="Item code" value={itemCode} maxLength={64} onChange={(e) => setItemCode(e.target.value)} className={input} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Notes</span>
          <textarea aria-label="Notes" rows={4} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} className={input} placeholder="Internal notes, assumptions, inclusions…" />
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-800">
          <label className="flex items-center gap-2"><input type="checkbox" checked={spec} onChange={(e) => setSpec(e.target.checked)} className="size-4 accent-brand-600" /> Show in specification</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="size-4 accent-brand-600" /> Hide on quote</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} className="size-4 accent-brand-600" /> Complete</label>
        </div>
      </div>
    </Dialog>
  );
}
