"use client";
/**
 * Two-step inline confirm for destructive form submits.
 * The two buttons are keyed so React never morphs the type="button" element into the
 * type="submit" one mid-click (which would submit on the first click).
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
    <button key="confirm" type="submit" className={cx("rounded-md border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700", className)}>
      {confirmText}
    </button>
  ) : (
    <button
      key="arm"
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
