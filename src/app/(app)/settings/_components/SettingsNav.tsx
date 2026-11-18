"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";

export const SETTINGS_SECTIONS = [
  { href: "/settings/business", label: "Business details", desc: "Name, contact details, logo and brand colour" },
  { href: "/settings/users", label: "Users", desc: "Team members, roles and access" },
  { href: "/settings/tax-rates", label: "Tax rates", desc: "GST and other tax codes" },
  { href: "/settings/numbering", label: "Numbering", desc: "Prefixes and next numbers" },
  { href: "/settings/quote-defaults", label: "Quote defaults", desc: "Markup, validity, payment terms" },
  { href: "/settings/lists", label: "Lists", desc: "Statuses, types, units and folders" },
  { href: "/settings/display", label: "Display preferences", desc: "Dashboard panels" },
  { href: "/settings/spec-library", label: "Specification library", desc: "Reusable specification templates" },
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-ink-200 pb-px lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0">
      {SETTINGS_SECTIONS.map((s) => {
        const active = path === s.href || path.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:whitespace-normal",
              active ? "bg-white text-brand-800 shadow-xs ring-1 ring-ink-200" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            {s.label}
            <span className="hidden text-xs font-normal text-ink-500 lg:block">{s.desc}</span>
          </Link>
        );
      })}
    </nav>
  );
}
