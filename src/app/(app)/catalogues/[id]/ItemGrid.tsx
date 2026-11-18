"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { COST_TYPES } from "@/lib/catalogue-csv";
import { cx, money } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { bulkAdjustPrice, bulkCostType, bulkMoveCategory, createItem, deleteItems, updateItem, type ItemPatchInput } from "./actions";
import { ItemDrawer } from "./ItemDrawer";

export type GridItem = {
  id: string;
  itemCode: string | null;
  description: string;
  costType: string;
  uom: string;
  unitCost: number;
  isRecipe: boolean;
  categoryId: string | null;
  imageUrl: string | null;
  hasDetails: boolean;
  updatedAt: string;
};
export type GridCategory = { id: string; name: string; depth: number };
type SortKey = "code" | "description" | "type" | "uom" | "cost" | "updated";

export const TYPE_CHIP: Record<string, string> = {
  Material: "bg-sky-50 text-sky-700",
  Labour: "bg-amber-50 text-amber-800",
  MatLab: "bg-cyan-50 text-cyan-800",
  Equipment: "bg-violet-50 text-violet-700",
  Subcontractor: "bg-emerald-50 text-emerald-700",
  Other: "bg-ink-100 text-ink-700",
};

const cell = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-900 hover:border-ink-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function ItemGrid(props: {
  catalogueId: string;
  items: GridItem[];
  categories: GridCategory[];
  uoms: string[];
  defaultCategoryId: string | null;
  sort: SortKey;
  dir: "asc" | "desc";
  sortHrefs: Record<SortKey, string>;
  filtered: boolean;
  emptyCatalogue: boolean;
}) {
  const { catalogueId, items, categories, uoms } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const visibleSelected = items.filter((i) => selected.has(i.id)).map((i) => i.id);
  const allChecked = items.length > 0 && visibleSelected.length === items.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const bulk = (fn: () => Promise<{ ok: boolean; error?: string; count?: number }>, okText: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg({ tone: "err", text: r.error ?? "Something went wrong" });
      else { setMsg({ tone: "ok", text: okText }); }
    });

  const th = (key: SortKey, label: string, cls?: string) => (
    <th className={cx("border-b border-ink-200 bg-ink-50 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500", cls)} aria-sort={props.sort === key ? (props.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={props.sortHrefs[key]} scroll={false} className="inline-flex items-center gap-1 hover:text-ink-800">
        {label}
        <span className="text-[10px]">{props.sort === key ? (props.dir === "asc" ? "▲" : "▼") : ""}</span>
      </Link>
    </th>
  );

  return (
    <div className="space-y-3">
      <datalist id="uom-list">{uoms.map((u) => <option key={u} value={u} />)}</datalist>

      {visibleSelected.length > 0 && (
        <BulkBar
          count={visibleSelected.length}
          categories={categories}
          pending={pending}
          onClear={() => setSelected(new Set())}
          onMove={(cat) => bulk(() => bulkMoveCategory(catalogueId, visibleSelected, cat), `Moved ${visibleSelected.length} items`)}
          onType={(t) => bulk(() => bulkCostType(catalogueId, visibleSelected, t), `Changed cost type on ${visibleSelected.length} items`)}
          onAdjust={(pct) => bulk(() => bulkAdjustPrice(catalogueId, visibleSelected, pct), `Adjusted ${visibleSelected.length} prices by ${pct > 0 ? "+" : ""}${pct}%`)}
          onDelete={() =>
            bulk(async () => {
              const r = await deleteItems(visibleSelected);
              if (r.ok) setSelected(new Set());
              return r;
            }, `Deleted ${visibleSelected.length} items`)
          }
        />
      )}
      {msg && (
        <div role="status" className={cx("flex items-center justify-between rounded-md px-3 py-2 text-sm", msg.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm" data-testid="item-grid">
          <thead>
            <tr>
              <th className="w-8 border-b border-ink-200 bg-ink-50 px-2 py-2">
                <input type="checkbox" aria-label="Select all on this page" className="size-4 accent-brand-600" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)))} />
              </th>
              {th("code", "Code", "w-32")}
              {th("description", "Description")}
              {th("type", "Cost type", "w-36")}
              {th("uom", "UOM", "w-24")}
              {th("cost", "Unit cost", "w-32 text-right")}
              <th className="w-20 border-b border-ink-200 bg-ink-50 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <AddRow catalogueId={catalogueId} defaultCategoryId={props.defaultCategoryId} onError={(t) => setMsg({ tone: "err", text: t })} onAdded={() => setMsg(null)} />
            {items.map((it) => (
              <Row key={it.id + it.updatedAt} item={it} checked={selected.has(it.id)} onToggle={() => toggle(it.id)} onOpen={() => setOpenId(it.id)} />
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <div className="p-4">
            <EmptyState
              title={props.emptyCatalogue ? "This catalogue is empty" : props.filtered ? "No items match your search" : "No items in this category"}
              body={props.emptyCatalogue ? "Add items one at a time in the row above, or bring in a supplier price list with Import CSV." : props.filtered ? "Try another search term or cost type." : "Add an item above or move items here with the bulk actions."}
            />
          </div>
        )}
      </div>

      {openId && <ItemDrawer key={openId} itemId={openId} categories={categories} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function AddRow({ catalogueId, defaultCategoryId, onError, onAdded }: { catalogueId: string; defaultCategoryId: string | null; onError: (t: string) => void; onAdded: () => void }) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const formId = "add-item-form";
  const submit = () => {
    const f = formRef.current;
    if (!f) return;
    const fd = new FormData(f);
    const description = String(fd.get("description") ?? "").trim();
    if (!description) { onError("Enter a description for the new item"); descRef.current?.focus(); return; }
    const input: ItemPatchInput = {
      itemCode: String(fd.get("itemCode") ?? ""),
      description,
      costType: String(fd.get("costType")) as ItemPatchInput["costType"],
      uom: String(fd.get("uom") || "ea"),
      unitCost: String(fd.get("unitCost") || "0") as unknown as number,
      categoryId: defaultCategoryId,
    };
    start(async () => {
      const r = await createItem(catalogueId, input);
      if (!r.ok) return onError(r.error);
      f.reset();
      onAdded();
      descRef.current?.focus();
    });
  };
  return (
    <tr className="bg-brand-50/40" data-testid="add-row">
      <td className="border-b border-ink-100 px-2 py-1.5 text-center text-brand-600">+</td>
      <td className="border-b border-ink-100 px-1 py-1">
        <form id={formId} ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} />
        <input form={formId} name="itemCode" placeholder="Code" aria-label="New item code" className={cx(cell, "border-ink-200 bg-white font-mono text-xs")} />
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <input form={formId} ref={descRef} name="description" placeholder="Add an item — description…" aria-label="New item description" className={cx(cell, "border-ink-200 bg-white")} />
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <select form={formId} name="costType" aria-label="New item cost type" className={cx(cell, "border-ink-200 bg-white")} defaultValue="Material">
          {COST_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <input form={formId} name="uom" list="uom-list" defaultValue="ea" aria-label="New item unit" className={cx(cell, "border-ink-200 bg-white")} />
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <input form={formId} name="unitCost" type="number" min="0" step="0.01" placeholder="0.00" aria-label="New item unit cost" className={cx(cell, "border-ink-200 bg-white text-right tabular-nums")} />
      </td>
      <td className="border-b border-ink-100 px-2 py-1 text-right">
        <button form={formId} type="submit" disabled={pending} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
      </td>
    </tr>
  );
}

function Row({ item, checked, onToggle, onOpen }: { item: GridItem; checked: boolean; onToggle: () => void; onOpen: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const commit = (patch: ItemPatchInput, el?: HTMLInputElement | HTMLSelectElement) =>
    start(async () => {
      setError(null);
      const r = await updateItem(item.id, patch);
      if (!r.ok) {
        setError(r.error);
        el?.focus();
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
    });

  const onBlurText = (field: "itemCode" | "description" | "uom") => (e: React.FocusEvent<HTMLInputElement>) => {
    const v = e.target.value.trim();
    const cur = (item[field] ?? "") as string;
    if (v === cur) return;
    if (field === "description" && !v) { e.target.value = cur; setError("Description can't be blank"); return; }
    commit({ [field]: v }, e.target);
  };
  const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") { const t = e.target as HTMLInputElement; t.value = t.defaultValue; t.blur(); }
  };

  return (
    <tr className={cx("group", checked ? "bg-brand-50/50" : "hover:bg-ink-50/60", error && "bg-red-50/60")} data-testid="item-row" data-item-id={item.id}>
      <td className="border-b border-ink-100 px-2 py-1 text-center">
        <input type="checkbox" className="size-4 accent-brand-600" aria-label={`Select ${item.description}`} checked={checked} onChange={onToggle} />
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <input defaultValue={item.itemCode ?? ""} onBlur={onBlurText("itemCode")} onKeyDown={enterBlurs} aria-label="Item code" className={cx(cell, "font-mono text-xs")} />
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <div className="flex items-center gap-1">
          <input defaultValue={item.description} onBlur={onBlurText("description")} onKeyDown={enterBlurs} aria-label="Description" className={cell} />
          {item.isRecipe && <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700" title="Recipe (assembly)">Recipe</span>}
          {item.hasDetails && <span className="shrink-0 text-xs text-ink-400" title="Has details">¶</span>}
        </div>
        {error && <p role="alert" className="px-1.5 text-xs text-red-600">{error}</p>}
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <select defaultValue={item.costType} aria-label="Cost type" onChange={(e) => commit({ costType: e.target.value as ItemPatchInput["costType"] }, e.target)} className={cx(cell, "font-medium", TYPE_CHIP[item.costType])}>
          {COST_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        <input defaultValue={item.uom} list="uom-list" onBlur={onBlurText("uom")} onKeyDown={enterBlurs} aria-label="Unit of measure" className={cell} />
      </td>
      <td className="border-b border-ink-100 px-1 py-1">
        {item.isRecipe ? (
          <button type="button" onClick={onOpen} className="w-full px-1.5 py-1 text-right tabular-nums text-ink-900 hover:text-brand-700" title="Calculated from recipe components" aria-label="Unit cost (from recipe)">
            {money(item.unitCost)}
          </button>
        ) : (
          <input
            type="number"
            min="0"
            step="0.01"
            defaultValue={item.unitCost}
            aria-label="Unit cost"
            onKeyDown={enterBlurs}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const v = raw === "" ? NaN : Number(raw);
              if (!Number.isFinite(v) || v < 0) { setError("Unit cost must be zero or more"); e.target.value = String(item.unitCost); return; }
              if (v === item.unitCost) return;
              commit({ unitCost: v }, e.target);
            }}
            className={cx(cell, "text-right tabular-nums")}
          />
        )}
      </td>
      <td className="border-b border-ink-100 px-2 py-1 text-right">
        <span className="mr-1 inline-block w-3 text-xs text-ink-400" aria-hidden>{pending ? "…" : saved ? "✓" : ""}</span>
        <button type="button" onClick={onOpen} className="rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50" aria-label={`Open ${item.description}`}>
          Open
        </button>
      </td>
    </tr>
  );
}

function BulkBar(p: {
  count: number;
  categories: GridCategory[];
  pending: boolean;
  onClear: () => void;
  onMove: (cat: string | null) => void;
  onType: (t: string) => void;
  onAdjust: (pct: number) => void;
  onDelete: () => void;
}) {
  const [pct, setPct] = useState("");
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sel = "rounded-md border border-ink-200 bg-white px-2 py-1 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm" data-testid="bulk-bar">
      <span className="font-medium text-brand-800">{p.count} selected</span>
      <button type="button" onClick={p.onClear} className="text-xs text-ink-500 hover:text-ink-800">Clear</button>
      <span className="mx-1 h-5 w-px bg-brand-200" />
      <select aria-label="Move to category" className={sel} value="" onChange={(e) => e.target.value && p.onMove(e.target.value === "__none" ? null : e.target.value)} disabled={p.pending}>
        <option value="">Move to…</option>
        <option value="__none">Uncategorised</option>
        {p.categories.map((c) => <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>)}
      </select>
      <select aria-label="Change cost type" className={sel} value="" onChange={(e) => e.target.value && p.onType(e.target.value)} disabled={p.pending}>
        <option value="">Cost type…</option>
        {COST_TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(pct);
          if (!pct.trim() || !Number.isFinite(v) || v === 0) return setErr("Enter a % like 5 or -2.5");
          if (v <= -100) return setErr("Must be more than -100%");
          setErr(null);
          p.onAdjust(v);
          setPct("");
        }}
      >
        <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" placeholder="+5" aria-label="Adjust price by percent" className={cx(sel, "w-20 text-right tabular-nums")} />
        <span className="text-ink-500">%</span>
        <button disabled={p.pending} className="rounded-md border border-ink-200 bg-white px-2 py-1 font-medium text-ink-800 hover:bg-ink-50">Adjust prices</button>
      </form>
      {armed ? (
        <button type="button" onClick={() => { setArmed(false); p.onDelete(); }} className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white">
          Delete {p.count} items?
        </button>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className="rounded-md border border-red-200 bg-white px-2.5 py-1 font-medium text-red-700 hover:bg-red-50" disabled={p.pending}>
          Delete
        </button>
      )}
      {p.pending && <span className="text-xs text-ink-500">Working…</span>}
      {err && <span role="alert" className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
