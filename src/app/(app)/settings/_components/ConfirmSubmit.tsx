"use client";
/**
 * Two-step submit (no browser dialog). The idle and armed states are separate keyed elements so the
 * first click can never be promoted into a form submit while React flushes the state change.
 */
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

export function ConfirmSubmit({ children, confirmText = "Are you sure?", className }: { children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button
      key="armed"
      type="submit"
      autoFocus
      // Disarm once the submit has been dispatched, so a refused action doesn't leave it armed.
      onClick={() => setTimeout(() => setArmed(false), 0)}
      className={cx("rounded-md border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white", className)}>
      {confirmText}
    </button>
  ) : (
    <button
      key="idle"
      type="button"
      onClick={(e) => {
        e.preventDefault();
        setArmed(true);
      }}
      className={cx("rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50", className)}
    >
      {children}
    </button>
  );
}
