/** Small presentational helpers shared by client + contact forms (server/client safe). */
import type { ReactNode } from "react";
import { cx } from "@/lib/format";

export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{msg}</span>;
}

export function FormMessage({ ok, msg }: { ok?: boolean; msg?: string }) {
  if (!msg) return null;
  return (
    <div role="status" className={cx("rounded-md px-3 py-2 text-sm", ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
      {msg}
    </div>
  );
}

/** Label + control + error, with red ring when invalid. */
export function F({ label, error, children, className, hint }: { label: string; error?: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cx("block", className, error && "[&_input]:border-red-400 [&_select]:border-red-400")}>
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      <FieldError msg={error} />
    </label>
  );
}
