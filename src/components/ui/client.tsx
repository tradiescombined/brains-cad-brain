"use client";
/** Client-side UI helpers. Import from "@/components/ui/client". */
import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

/** Submit button that disables itself while the parent <form action> is pending. */
export function SubmitButton({ children, variant = "primary", className, pendingText }: { children: ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent",
    secondary: "bg-white text-ink-800 hover:bg-ink-50 border-ink-200",
    danger: "bg-white text-red-700 hover:bg-red-50 border-red-200",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs disabled:opacity-60", v, className)}
    >
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

/** Button that asks for confirmation (inline, no browser dialog) before submitting its form. */
export function ConfirmButton({ children, confirmText = "Are you sure?", className }: { children: ReactNode; confirmText?: string; className?: string }) {
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

/** Simple modal dialog controlled by a trigger button. */
export function Modal({ trigger, title, children, wide }: { trigger: (open: () => void) => ReactNode; title: string; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div ref={ref} role="dialog" aria-label={title} className={cx("w-full rounded-lg bg-white shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
              <h2 className="text-base font-semibold text-ink-900">{title}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Close">✕</button>
            </div>
            <div className="p-5">{children(() => setOpen(false))}</div>
          </div>
        </div>
      )}
    </>
  );
}
