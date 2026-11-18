"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";

/** Tab bar whose active tab follows the URL. `base` + tab.seg ("" = index). */
export function RouteTabs({ base, tabs }: { base: string; tabs: { seg: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg ? path === href || path.startsWith(href + "/") : path === base;
        return (
          <Link
            key={t.seg}
            href={href}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
