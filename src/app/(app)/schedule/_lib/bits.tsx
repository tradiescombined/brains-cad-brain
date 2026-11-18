/** Small server-safe presentational helpers for the jobs module. */
import { cx } from "@/lib/format";

export function ProgressBar({ value, over, className, label }: { value: number; over?: boolean; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 100));
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-ink-100", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full", over ? "bg-red-500" : v >= 90 ? "bg-amber-500" : "bg-brand-500")} style={{ width: `${v}%` }} />
    </div>
  );
}

export function pctText(n: number, dp = 1) {
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-AU", { maximumFractionDigits: dp, minimumFractionDigits: dp })}%`;
}

/** Signed money tone class: negative red, positive green. */
export function signTone(n: number) {
  return n < -0.004 ? "text-red-700" : n > 0.004 ? "text-emerald-700" : "text-ink-700";
}

export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={cx("grid grid-cols-1 gap-3", c)}>{children}</div>;
}

/** Compact stat tile. */
export function Mini({ label, value, sub, tone, warn }: { label: string; value: string; sub?: string; tone?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cx("text-lg font-semibold tabular-nums text-ink-900", tone)}>{value || "—"}</div>
      {sub && <div className={cx("text-xs", warn ? "text-red-700" : "text-ink-500")}>{sub}</div>}
    </div>
  );
}

/** Button class names (server-safe). */
export function btn(variant: "primary" | "secondary" | "ghost" | "link" = "primary", extra?: string) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs whitespace-nowrap";
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent",
    secondary: "bg-white text-ink-800 hover:bg-ink-50 border-ink-200",
    ghost: "bg-transparent text-ink-700 hover:bg-ink-100 border-transparent shadow-none",
    link: "border-transparent bg-transparent p-0 text-brand-700 shadow-none hover:underline",
  }[variant];
  return cx(base, v, extra);
}
