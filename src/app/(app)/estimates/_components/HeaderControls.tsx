"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/lib/format";
import { SubmitButton } from "@/components/ui/client";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { deleteEstimate, duplicateEstimate, saveAsTemplate, setArchived, setEstimateStatus } from "../actions";

/** Status dropdown that saves as soon as a new status is picked. */
export function StatusSelect({ id, status, statuses }: { id: string; status: string; statuses: string[] }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(status);
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
      Status
      <select
        aria-label="Estimate status"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          const fd = new FormData();
          fd.set("id", id);
          fd.set("status", next);
          start(() => setEstimateStatus(fd));
        }}
        className="rounded-md border border-ink-200 bg-white py-1.5 pl-2.5 pr-8 text-sm font-medium text-ink-900 shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
      >
        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  );
}

const itemCls = "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-100";

/** "More" menu: duplicate, save as template, archive / unarchive, delete (templates & archived only). */
export function OverflowMenu({ id, name, isTemplate, archived, hasJob }: { id: string; name: string; isTemplate: boolean; archived: boolean; hasJob: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "template">("menu");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const canDelete = (isTemplate || archived) && !hasJob;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen(!open); setMode("menu"); }}
        className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-700 shadow-xs hover:bg-ink-50"
      >
        More <span aria-hidden className="text-ink-400">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-ink-200 bg-white p-1 shadow-lg">
          {mode === "menu" ? (
            <>
              <form action={duplicateEstimate}>
                <input type="hidden" name="id" value={id} />
                <MenuSubmit>{isTemplate ? "Duplicate template" : "Duplicate estimate"}</MenuSubmit>
              </form>
              {!isTemplate && (
                <button type="button" role="menuitem" className={itemCls} onClick={() => setMode("template")}>Save as template…</button>
              )}
              <form action={setArchived}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="archived" value={archived ? "0" : "1"} />
                <MenuSubmit>{archived ? "Unarchive" : "Archive"}</MenuSubmit>
              </form>
              {canDelete && (
                <form action={deleteEstimate} className="mt-1 border-t border-ink-100 px-2 pt-2 pb-1">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="redirectTo" value={isTemplate ? "/estimates/templates" : "/estimates?archived=1"} />
                  <ConfirmSubmit confirmText="Yes, delete permanently" pendingText="Deleting…" className="w-full">
                    {isTemplate ? "Delete template" : "Delete estimate"}
                  </ConfirmSubmit>
                </form>
              )}
            </>
          ) : (
            <form action={saveAsTemplate} className="space-y-2 p-2">
              <input type="hidden" name="id" value={id} />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-600">Template name</span>
                <input
                  name="name"
                  required
                  autoFocus
                  defaultValue={`${name} template`}
                  maxLength={200}
                  className="block w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              <p className="text-xs text-ink-500">Costings, specifications, quote settings and plans are copied. Client details are left out.</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode("menu")} className="rounded-md px-2.5 py-1.5 text-sm text-ink-600 hover:bg-ink-100">Back</button>
                <SubmitButton pendingText="Saving…">Save template</SubmitButton>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function MenuSubmit({ children }: { children: React.ReactNode }) {
  return (
    <button type="submit" role="menuitem" className={cx(itemCls)}>
      {children}
    </button>
  );
}
