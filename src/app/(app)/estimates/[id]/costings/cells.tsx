"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";
import { insertToken } from "@/lib/costings-tree";

export const COST_TYPES = ["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"] as const;
export type CostTypeName = (typeof COST_TYPES)[number];

export const costTypeTone: Record<string, string> = {
  Material: "bg-sky-50 text-sky-800 ring-sky-200",
  Labour: "bg-amber-50 text-amber-800 ring-amber-200",
  MatLab: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  Equipment: "bg-violet-50 text-violet-800 ring-violet-200",
  Subcontractor: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Other: "bg-ink-100 text-ink-700 ring-ink-200",
};
export const costTypeBar: Record<string, string> = {
  Material: "bg-sky-500",
  Labour: "bg-amber-500",
  MatLab: "bg-cyan-500",
  Equipment: "bg-violet-500",
  Subcontractor: "bg-emerald-500",
  Other: "bg-ink-400",
};
/** Display label for a cost type value ("MatLab" reads as "Mat + Lab"). */
export const costTypeLabel = (t: string) => (t === "MatLab" ? "Mat + Lab" : t);

export const costTypeShort: Record<string, string> = {
  Material: "Material",
  Labour: "Labour",
  MatLab: "Mat + Lab",
  Equipment: "Equipment",
  Subcontractor: "Subbie",
  Other: "Other",
};

/** "12.5" style number for editing; "" for 0 when blankZero. */
export function editNumber(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(Math.round(n * 10 ** dp) / 10 ** dp);
}
export function fmt(n: number, dp = 2, minDp = dp): string {
  return (Number(n) || 0).toLocaleString("en-AU", { minimumFractionDigits: minDp, maximumFractionDigits: dp });
}
/** Parse a user-typed number ("$1,250.50", "12") → number | null (blank) | NaN (invalid). */
export function parseNumberInput(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "").replace(/%$/, "");
  if (t === "") return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}
export const isPlainNumber = (s: string | null | undefined) => !!s && /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

const cellInput =
  "block w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-ink-900 placeholder:text-ink-400 hover:border-ink-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * Inline editable cell. Shows `display` at rest and `editValue` while focused.
 * Commits on blur (Enter/Tab move focus, which blurs). Escape cancels.
 */
export function EditCell({
  rowId, col, display, editValue, onCommit, onDraft, onCancel, placeholder, align = "left", className, list, ariaLabel,
  invalid, inputMode, onFocusCell, registerInsert, hint,
}: {
  rowId: string;
  col: string;
  display: string;
  editValue: string;
  onCommit: (v: string) => void;
  onDraft?: (v: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
  list?: string;
  ariaLabel: string;
  invalid?: boolean;
  inputMode?: "decimal" | "text";
  onFocusCell?: () => void;
  /** Lets the grid insert text (e.g. "[M1]") at this cell's caret. */
  registerInsert?: (fn: ((token: string) => void) | null) => void;
  hint?: ReactNode;
}) {
  const [text, setText] = useState<string | null>(null);
  const textRef = useRef<string | null>(null);
  const escaped = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const selectOnEdit = useRef<"now" | "next" | null>(null);
  const editing = text !== null;

  const set = (v: string | null) => {
    textRef.current = v;
    setText(v);
  };

  useEffect(() => {
    if (!registerInsert) return;
    registerInsert((token: string) => {
      const el = ref.current;
      if (!el) return;
      const focused = document.activeElement === el;
      const base = focused && textRef.current !== null ? textRef.current : editValue;
      const r = insertToken(base, token, focused ? el.selectionStart : null, focused ? el.selectionEnd : null);
      if (!focused) el.focus();
      caret.current = r.caret;
      set(r.text);
      onDraft?.(r.text);
    });
    return () => registerInsert(null);
  });

  // Select the whole value when editing starts (synchronously, so fast typing is never swallowed).
  useLayoutEffect(() => {
    if (selectOnEdit.current === "next" && caret.current == null && ref.current && document.activeElement === ref.current) {
      ref.current.select();
    }
    selectOnEdit.current = null;
    if (caret.current != null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [text]);

  return (
    <div className="relative">
      <input
        ref={ref}
        data-row={rowId}
        data-col={col}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        list={list}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={col === "description"}
        className={cx(cellInput, align === "right" && "text-right tabular-nums", invalid && "border-red-300 bg-red-50/60 text-red-800", className)}
        value={editing ? text : display}
        placeholder={placeholder}
        onFocus={(e) => {
          if (textRef.current !== null) { onFocusCell?.(); return; }
          if (textRef.current === null) set(editValue);
          escaped.current = false;
          onFocusCell?.();
          selectOnEdit.current = e.currentTarget.value === editValue ? "now" : "next";
          if (selectOnEdit.current === "now") e.currentTarget.select();
        }}
        onChange={(e) => {
          set(e.target.value);
          onDraft?.(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            escaped.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          const v = textRef.current;
          set(null);
          if (escaped.current) {
            escaped.current = false;
            onCancel?.();
            return;
          }
          if (v !== null && v !== editValue) onCommit(v);
          else onCancel?.();
        }}
      />
      {hint}
    </div>
  );
}

export function CostTypeSelect({ value, onChange, rowId, disabled }: { value: string; onChange: (v: CostTypeName) => void; rowId: string; disabled?: boolean }) {
  return (
    <select
      aria-label="Cost type"
      data-row={rowId}
      data-col="costType"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as CostTypeName)}
      className={cx(
        "w-full cursor-pointer appearance-none truncate rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-brand-500",
        costTypeTone[value] ?? costTypeTone.Other,
      )}
    >
      {COST_TYPES.map((t) => (
        <option key={t} value={t}>{costTypeLabel(t)}</option>
      ))}
    </select>
  );
}

export function AllowanceSelect({ value, onChange, rowId }: { value: string; onChange: (v: "none" | "PC" | "PS") => void; rowId: string }) {
  return (
    <select
      aria-label="Prime cost / provisional sum"
      title="Normal item, Prime Cost (PC) allowance or Provisional Sum (PS)"
      data-row={rowId}
      data-col="allowance"
      value={value}
      onChange={(e) => onChange(e.target.value as "none" | "PC" | "PS")}
      className={cx(
        "w-full cursor-pointer appearance-none rounded px-1 py-0.5 text-center text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500",
        value === "PC" ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" : value === "PS" ? "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200" : "bg-transparent text-ink-300 hover:bg-ink-100",
      )}
    >
      <option value="none">—</option>
      <option value="PC">PC</option>
      <option value="PS">PS</option>
    </select>
  );
}

/** Controlled modal dialog (no trigger), closes on Escape / backdrop. */
export function Dialog({ open, title, onClose, children, wide, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("flex max-h-[88vh] w-full flex-col rounded-lg bg-white shadow-xl", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Close">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={cx("size-3.5 transition-transform", open ? "rotate-90" : "")} aria-hidden>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
