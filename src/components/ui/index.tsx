/**
 * Shared UI kit. Server-safe (no hooks). Import from "@/components/ui".
 * Client-only pieces live in ./client.tsx.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/format";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent",
  secondary: "bg-white text-ink-800 hover:bg-ink-50 border-ink-200",
  danger: "bg-white text-red-700 hover:bg-red-50 border-red-200",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100 border-transparent",
};
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btnBase, variants[variant], className)} {...p} />;
}

export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btnBase, variants[variant], className)} {...p} />;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs font-medium text-ink-500 hover:text-brand-700">
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("rounded-lg border border-ink-200 bg-white shadow-xs", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputCls, className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "min-h-20", className)} {...p} />;
}
export function Select({ className, options, placeholder, ...p }: ComponentProps<"select"> & { options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <select className={cx(inputCls, "pr-8", className)} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Checkbox({ label, className, ...p }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("flex items-start gap-2 text-sm text-ink-800", className)}>
      <input type="checkbox" className="mt-0.5 size-4 rounded border-ink-300 accent-brand-600" {...p} />
      <span>{label}</span>
    </label>
  );
}

const badgeTones = {
  grey: "bg-ink-100 text-ink-700",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
} as const;
export type Tone = keyof typeof badgeTones;
export function Badge({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent", badgeTones[tone])}>{children}</span>;
}

/** Map common statuses to badge tones. */
export function statusTone(s: string | null | undefined): Tone {
  const v = (s ?? "").toLowerCase();
  if (/(accepted|approved|paid|won|complete|delivered|published|selected)/.test(v)) return "green";
  if (/(sent|in progress|quoting|confirmed|part)/.test(v)) return "blue";
  if (/(draft|new|pending|not started|incomplete)/.test(v)) return "grey";
  if (/(hold|overdue|site visit|contacted|expired)/.test(v)) return "amber";
  if (/(rejected|lost|void|cancel|declined)/.test(v)) return "red";
  return "purple";
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-lg border border-ink-200 bg-white", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className, ...p }: ComponentProps<"th">) {
  return <th className={cx("border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500", className)} {...p}>{children}</th>;
}
export function Td({ children, className, ...p }: ComponentProps<"td">) {
  return <td className={cx("border-b border-ink-100 px-3 py-2 text-ink-800", className)} {...p}>{children}</td>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
      <p className="text-base font-medium text-ink-800">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-500">{sub}</div>}
    </div>
  );
}

/** Link-based tab bar (server friendly). `active` is the current tab key. */
export function TabNav({ tabs, active }: { tabs: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function DescList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium text-ink-500">{k}</dt>
          <dd className="text-sm text-ink-900">{v || <span className="text-ink-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
