"use client";
/** Small client widgets shared by orders / variations / invoices. */
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";
import type { FormState } from "../actions";

export function PrintButton({ label = "Print / save PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700"
    >
      ⎙ {label}
    </button>
  );
}

/** Inline result line for a useActionState form. Fades "ok" messages after a few seconds. */
export function FormMessage({ state }: { state: FormState }) {
  const [shown, setShown] = useState<FormState>(state);
  useEffect(() => {
    setShown(state);
    if (state?.ok) {
      const t = setTimeout(() => setShown(null), 3500);
      return () => clearTimeout(t);
    }
  }, [state]);
  if (!shown) return null;
  return (
    <p role={shown.error ? "alert" : "status"} className={cx("text-sm", shown.error ? "text-red-700" : "text-emerald-700")}>
      {shown.error ?? shown.message}
    </p>
  );
}

/** A <form> wired to a (state, formData) server action that shows its result inline. */
export function ActionForm({
  action, children, className, id,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className} id={id}>
      {children}
      <div className="mt-2"><FormMessage state={state} /></div>
    </form>
  );
}

/** Numeric input that keeps the raw text while typing and reports a number. */
export function NumCell({ value, onChange, step = "any", className, ariaLabel, min }: { value: number; onChange: (n: number) => void; step?: string; className?: string; ariaLabel?: string; min?: number }) {
  const [txt, setTxt] = useState(String(value ?? 0));
  useEffect(() => {
    if (parseFloat(txt) !== value) setTxt(String(value ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      aria-label={ariaLabel}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className={cx("w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums hover:border-ink-200 focus:border-brand-500 focus:bg-white focus:outline-none", className)}
    />
  );
}

/**
 * Two-step inline confirm for destructive submits. Same idea as ui/client ConfirmButton, but the
 * armed button is a *different* element (distinct keys): mutating type="button" → "submit" during the
 * click makes Chrome submit the form on the first click, skipping the confirmation.
 */
export function ConfirmSubmit({ children, confirmText = "Are you sure?", className }: { children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button key="confirm" type="submit" className={cx("rounded-md border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white", className)}>
      {confirmText}
    </button>
  ) : (
    <button key="arm" type="button" onClick={(e) => { e.preventDefault(); setArmed(true); }} className={cx("rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50", className)}>
      {children}
    </button>
  );
}

export const cellText =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-ink-200 focus:border-brand-500 focus:bg-white focus:outline-none";
