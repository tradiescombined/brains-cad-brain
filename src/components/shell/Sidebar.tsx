"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavSection } from "./nav";
import { cx } from "@/lib/format";

export function Sidebar({ businessName, nav, userLabel }: { businessName: string; nav: NavSection[]; userLabel?: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-2 lg:hidden">
        <Brand />
        <button onClick={() => setOpen(!open)} className="rounded-md border border-ink-200 px-2 py-1 text-sm" aria-label="Menu">☰</button>
      </div>
      <aside
        className={cx(
          "no-print fixed inset-y-0 left-0 z-30 w-60 shrink-0 flex-col border-r border-ink-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen",
          open ? "flex pt-12" : "hidden",
        )}
      >
        <div className="hidden px-5 py-4 lg:block"><Brand /></div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {nav.map((g) => (
            <div key={g.section} className="mt-4 first:mt-1">
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g.section}</div>
              {g.items.map((it) => {
                const active = path === it.href || path.startsWith(it.href + "/");
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium",
                      active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                    )}
                  >
                    <span className="w-4 text-center text-ink-400" aria-hidden>{it.icon}</span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
          {businessName}
          {userLabel && <div data-testid="current-user" className="mt-0.5 truncate text-ink-400">{userLabel}</div>}
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white">B</span>
      <span className="text-sm font-semibold leading-tight text-ink-900">
        Brains Cad Brain
      </span>
    </Link>
  );
}
