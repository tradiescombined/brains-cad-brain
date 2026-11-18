"use client";
/**
 * Trigger button + modal containing an <ActionForm>. Fields are passed as (server-renderable) children.
 * Closes itself when the action reports success.
 */
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";
import { ActionForm, FormFooter } from "./ActionForm";
import type { ActionState } from "./action-state";

const triggerStyles = {
  primary: "border-transparent bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border-ink-200 bg-white text-ink-800 hover:bg-ink-50",
  small: "border-ink-200 bg-white px-2.5! py-1! text-xs! text-ink-700 hover:bg-ink-50",
} as const;

export function DialogForm({
  action,
  title,
  triggerLabel,
  trigger = "primary",
  submitLabel = "Save",
  children,
  wide,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  title: string;
  triggerLabel: ReactNode;
  trigger?: keyof typeof triggerStyles;
  submitLabel?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs", triggerStyles[trigger])}
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 pt-[8vh]"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div role="dialog" aria-modal="true" aria-label={title} className={cx("w-full rounded-lg bg-white text-left shadow-xl", wide ? "max-w-2xl" : "max-w-lg")}>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
              <h2 className="text-base font-semibold text-ink-900">{title}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Close">
                ✕
              </button>
            </div>
            <ActionForm action={action} onSuccess={() => setOpen(false)} className="space-y-3 p-5">
              {children}
              <FormFooter label={submitLabel} className="border-t border-ink-100 pt-3" />
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}
