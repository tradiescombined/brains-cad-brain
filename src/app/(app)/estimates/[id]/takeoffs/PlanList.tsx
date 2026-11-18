"use client";
import { useRef, useState, useTransition } from "react";
import { cx } from "@/lib/format";
import { addPlan, deletePlan, movePlan, renamePlan } from "./actions";
import { prepareFiles } from "./prepareFiles";
import type { PlanView } from "./types";

const ACCEPT = ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf";

/** Hidden file input + trigger. Calls onUploaded with the first new plan id. */
export function useUploader(estimateId: string, onUploaded: (firstId: string | null, count: number) => void, onError: (msg: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function upload(files: File[]) {
    if (!files.length) return;
    let first: string | null = null;
    let count = 0;
    try {
      const pages = await prepareFiles(files, setProgress);
      for (let i = 0; i < pages.length; i++) {
        setProgress(`Saving plan ${i + 1} of ${pages.length}…`);
        const r = await addPlan(estimateId, pages[i]);
        if (!r.ok) throw new Error(r.error);
        first ??= r.data.id;
        count++;
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      if (count) onUploaded(first, count);
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      multiple
      className="hidden"
      data-testid="plan-upload"
      onChange={(e) => upload(Array.from(e.target.files ?? []))}
    />
  );
  return { input, open: () => inputRef.current?.click(), upload, progress };
}

export function PlanList({ plans, activeId, onActivate, onOpenUpload, onDropFiles, progress, onMessage }: {
  plans: PlanView[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onOpenUpload: () => void;
  onDropFiles: (files: File[]) => void;
  progress: string | null;
  onMessage: (msg: string, tone?: "ok" | "error") => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={cx("flex h-full min-h-0 flex-col", dragOver && "ring-2 ring-inset ring-brand-500")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Plans <span className="font-normal text-ink-400">({plans.length})</span></h2>
        <button type="button" onClick={onOpenUpload} disabled={!!progress} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          + Upload
        </button>
      </div>
      {progress && <div className="border-b border-ink-100 bg-brand-50 px-3 py-2 text-xs text-brand-800" role="status">{progress}</div>}
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {plans.map((p, i) => (
          <PlanRow key={p.id} plan={p} index={i} total={plans.length} active={p.id === activeId} onActivate={() => onActivate(p.id)} onMessage={onMessage} />
        ))}
        {!plans.length && !progress && (
          <li className="rounded-md border border-dashed border-ink-300 p-4 text-center text-xs text-ink-500">
            Drop PNG, JPG or PDF plans here, or use Upload.
          </li>
        )}
      </ul>
    </div>
  );
}

function PlanRow({ plan, index, total, active, onActivate, onMessage }: { plan: PlanView; index: number; total: number; active: boolean; onActivate: () => void; onMessage: (msg: string, tone?: "ok" | "error") => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.label);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) onMessage(r.error ?? "Something went wrong", "error");
      else if (success) onMessage(success);
    });
  }

  return (
    <li
      data-testid="plan-item"
      className={cx(
        "group rounded-md border bg-white p-1.5 transition-colors",
        active ? "border-brand-500 ring-1 ring-brand-500" : "border-ink-200 hover:border-ink-300",
        pending && "opacity-60",
      )}
    >
      <button type="button" onClick={onActivate} className="block w-full text-left" aria-label={`Open plan ${plan.label}`}>
        <div className="flex h-20 items-center justify-center overflow-hidden rounded bg-ink-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plan.src} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        </div>
      </button>
      {editing ? (
        <form
          className="mt-1.5 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renamePlan(plan.id, name), "Plan renamed");
            setEditing(false);
          }}
        >
          <input
            autoFocus
            aria-label="Plan name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setEditing(false), setName(plan.label))}
            className="min-w-0 flex-1 rounded border border-ink-300 px-1.5 py-0.5 text-xs focus:border-brand-500 focus:outline-none"
            maxLength={120}
          />
          <button type="submit" className="rounded bg-brand-600 px-1.5 text-xs text-white">Save</button>
        </form>
      ) : (
        <div className="mt-1.5 flex items-start justify-between gap-1">
          <button type="button" onClick={onActivate} className="min-w-0 text-left">
            <div className="truncate text-xs font-medium text-ink-900" title={plan.label}>{plan.label}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
              <span>{plan.measurementCount} meas.</span>
              {!plan.scale && <span className="rounded bg-amber-50 px-1 text-amber-800">no scale</span>}
            </div>
          </button>
        </div>
      )}
      {!editing && (
        <div className={cx("mt-1 flex items-center gap-0.5 text-ink-500", active ? "flex" : "hidden group-hover:flex group-focus-within:flex")}>
          <IconBtn label="Move up" disabled={index === 0} onClick={() => run(() => movePlan(plan.id, "up"))}>↑</IconBtn>
          <IconBtn label="Move down" disabled={index === total - 1} onClick={() => run(() => movePlan(plan.id, "down"))}>↓</IconBtn>
          <IconBtn label="Rename plan" onClick={() => { setName(plan.label); setEditing(true); }}>Rename</IconBtn>
          <span className="flex-1" />
          {confirmDelete ? (
            <span className="flex gap-0.5">
              <button type="button" onClick={() => { setConfirmDelete(false); run(() => deletePlan(plan.id), `Plan “${plan.label}” deleted`); }} className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-medium text-white">
                Delete{plan.measurementCount ? ` + ${plan.measurementCount}` : ""}
              </button>
              <IconBtn label="Keep plan" onClick={() => setConfirmDelete(false)}>Keep</IconBtn>
            </span>
          ) : (
            <IconBtn label="Delete plan" onClick={() => setConfirmDelete(true)} danger>Delete</IconBtn>
          )}
        </div>
      )}
    </li>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx("rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-ink-100 disabled:opacity-30", danger ? "text-red-700 hover:bg-red-50" : "text-ink-600")}
    >
      {children}
    </button>
  );
}
