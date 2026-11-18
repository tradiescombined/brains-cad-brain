"use client";
/**
 * Two-step inline confirm for a <form> submit (no browser dialog).
 * Local variant of the shared ConfirmButton: the arm and confirm buttons have distinct keys so React
 * never morphs the clicked type="button" into type="submit" during the click (which would submit
 * the form on the first click).
 */
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

export function ConfirmSubmit({ children, confirmText = "Are you sure?", className }: { children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button key="confirm" type="submit" className={cx("rounded-md border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white", className)}>
      {confirmText}
    </button>
  ) : (
    <button key="arm" type="button" onClick={() => setArmed(true)} className={cx("rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50", className)}>
      {children}
    </button>
  );
}
