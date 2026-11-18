"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cx } from "@/lib/format";

/**
 * Two-step submit button (no browser dialog). The armed and idle buttons carry different keys so
 * React mounts a fresh element: re-using one node and flipping its type to "submit" mid-click
 * would submit the form on the first click.
 */
export function ConfirmSubmit({
  children,
  confirmText = "Are you sure?",
  pendingText = "Working…",
  tone = "danger",
  className,
}: {
  children: ReactNode;
  confirmText?: ReactNode;
  pendingText?: string;
  tone?: "danger" | "brand";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (pending) return <span className={cx("inline-block px-2 py-0.5 text-xs text-ink-500", className)}>{pendingText}</span>;
  const armedCls = tone === "danger" ? "border-red-300 bg-red-600 text-white" : "border-brand-600 bg-brand-600 text-white";
  const idleCls = tone === "danger" ? "border-red-200 bg-white text-red-700 hover:bg-red-50" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50";
  return armed ? (
    <button key="armed" type="submit" autoFocus className={cx("rounded-md border px-3 py-1.5 text-sm font-medium", armedCls, className)}>
      {confirmText}
    </button>
  ) : (
    <button key="idle" type="button" onClick={() => setArmed(true)} className={cx("rounded-md border px-3 py-1.5 text-sm font-medium", idleCls, className)}>
      {children}
    </button>
  );
}
