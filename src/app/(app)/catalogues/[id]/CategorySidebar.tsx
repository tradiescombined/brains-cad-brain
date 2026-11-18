"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cx } from "@/lib/format";
import { addCategory, deleteCategory, moveCategory, renameCategory, setCategoryParent } from "./actions";

type Cat = { id: string; name: string; parentId: string | null; depth: number };

const iconBtn = "rounded px-1 text-xs text-ink-400 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-30";

export function CategorySidebar({ catalogueId, tree, counts, allCount, active, hrefFor }: { catalogueId: string; tree: Cat[]; counts: Record<string, number>; allCount: number; active: string; hrefFor: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong");
    });

  const tops = tree.filter((c) => c.depth === 0);
  // total for a parent includes its children
  const countFor = (c: Cat) => (counts[c.id] ?? 0) + (c.depth === 0 ? tree.filter((k) => k.parentId === c.id).reduce((s, k) => s + (counts[k.id] ?? 0), 0) : 0);

  const row = (key: string, label: string, n: number) => (
    <Link
      href={hrefFor[key]}
      className={cx("flex items-center justify-between rounded-md px-2 py-1.5 text-sm", active === key ? "bg-brand-50 font-medium text-brand-800" : "text-ink-700 hover:bg-ink-50")}
    >
      <span>{label}</span>
      <span className="text-xs tabular-nums text-ink-400">{n}</span>
    </Link>
  );

  return (
    <aside className="h-fit rounded-lg border border-ink-200 bg-white p-2 lg:sticky lg:top-4" aria-label="Categories">
      <div className="space-y-0.5">
        {row("all", "All items", allCount)}
        {row("none", "Uncategorised", counts.none ?? 0)}
      </div>
      <div className="mb-1 mt-3 flex items-center justify-between px-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Categories</h3>
        {pending && <span className="text-xs text-ink-400">Saving…</span>}
      </div>
      {tree.length === 0 && <p className="px-2 py-1 text-xs text-ink-400">No categories yet. Add one below to group items.</p>}
      <ul className="space-y-0.5" data-testid="category-list">
        {tree.map((c) => {
          const sibs = tree.filter((s) => s.parentId === c.parentId && s.depth === c.depth);
          const idx = sibs.findIndex((s) => s.id === c.id);
          const hasKids = tree.some((k) => k.parentId === c.id);
          const prevTop = c.depth === 0 ? tops[tops.findIndex((t) => t.id === c.id) - 1] : undefined;
          return (
            <li key={c.id} className={cx("group", c.depth === 1 && "ml-4")} data-testid="category-item">
              {editing === c.id ? (
                <form
                  className="flex gap-1 px-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = String(new FormData(e.currentTarget).get("name") ?? "");
                    setEditing(null);
                    run(() => renameCategory(c.id, v));
                  }}
                >
                  <input name="name" defaultValue={c.name} autoFocus aria-label="Category name" className="min-w-0 flex-1 rounded border border-brand-400 px-1.5 py-1 text-sm focus:outline-none" onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />
                  <button className="rounded bg-brand-600 px-2 text-xs font-medium text-white">Save</button>
                </form>
              ) : (
                <div className={cx("flex items-center rounded-md", active === c.id ? "bg-brand-50" : "hover:bg-ink-50")}>
                  <Link href={hrefFor[c.id]} className={cx("min-w-0 flex-1 truncate px-2 py-1.5 text-sm", active === c.id ? "font-medium text-brand-800" : "text-ink-700")}>
                    {c.name}
                  </Link>
                  {confirmDel === c.id ? (
                    <span className="flex items-center gap-1 pr-1">
                      <button type="button" className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white" onClick={() => { setConfirmDel(null); run(() => deleteCategory(c.id)); }}>
                        Delete
                      </button>
                      <button type="button" className={iconBtn} onClick={() => setConfirmDel(null)}>Keep</button>
                    </span>
                  ) : (
                    <>
                      <span className="hidden items-center group-hover:flex group-focus-within:flex">
                        <button type="button" className={iconBtn} title="Move up" aria-label={`Move ${c.name} up`} disabled={idx <= 0} onClick={() => run(() => moveCategory(c.id, -1))}>↑</button>
                        <button type="button" className={iconBtn} title="Move down" aria-label={`Move ${c.name} down`} disabled={idx >= sibs.length - 1} onClick={() => run(() => moveCategory(c.id, 1))}>↓</button>
                        {c.depth === 0 ? (
                          <button type="button" className={iconBtn} title={prevTop && !hasKids ? `Nest under ${prevTop.name}` : "Can't nest"} aria-label={`Nest ${c.name}`} disabled={!prevTop || hasKids} onClick={() => prevTop && run(() => setCategoryParent(c.id, prevTop.id))}>→</button>
                        ) : (
                          <button type="button" className={iconBtn} title="Move to top level" aria-label={`Un-nest ${c.name}`} onClick={() => run(() => setCategoryParent(c.id, null))}>←</button>
                        )}
                        <button type="button" className={iconBtn} title="Rename" aria-label={`Rename ${c.name}`} onClick={() => setEditing(c.id)}>✎</button>
                        <button type="button" className={cx(iconBtn, "hover:text-red-600")} title="Delete" aria-label={`Delete ${c.name}`} onClick={() => setConfirmDel(c.id)}>✕</button>
                      </span>
                      <span className="px-2 text-xs tabular-nums text-ink-400 group-hover:hidden group-focus-within:hidden">{countFor(c)}</span>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 space-y-1.5 border-t border-ink-100 px-1 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return setError("Enter a category name");
          setNewName("");
          run(() => addCategory(catalogueId, name, newParent || null));
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" aria-label="New category name" className="block w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none" />
        <div className="flex gap-1">
          <select value={newParent} onChange={(e) => setNewParent(e.target.value)} aria-label="Parent category" className="min-w-0 flex-1 rounded-md border border-ink-200 px-1.5 py-1 text-xs text-ink-700">
            <option value="">Top level</option>
            {tops.map((t) => <option key={t.id} value={t.id}>Inside {t.name}</option>)}
          </select>
          <button className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">Add</button>
        </div>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </form>
    </aside>
  );
}
