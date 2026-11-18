"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { NAV } from "./nav";
import { Brand } from "./Brand";
import { cx } from "@/lib/format";

export type SidebarUser = { name: string; role: string; email: string };

export function Sidebar({
  businessName,
  user,
  showUserButton,
}: {
  businessName: string;
  user: SidebarUser | null;
  /** False when the test auth bypass is on (no ClerkProvider is mounted then). */
  showUserButton: boolean;
}) {
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
          {NAV.map((g) => (
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
        <div className="border-t border-ink-100 px-4 py-3" data-testid="signed-in-user">
          {user && (
            <div className="flex items-center gap-2.5">
              {showUserButton ? (
                <UserButton appearance={{ elements: { avatarBox: { width: "2rem", height: "2rem" } } }} />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800" aria-hidden>
                  {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink-900" title={user.email}>{user.name}</div>
                <div className="truncate text-xs text-ink-500">{user.role}</div>
              </div>
            </div>
          )}
          <div className={cx("truncate text-xs text-ink-500", user && "mt-2")}>{businessName}</div>
        </div>
      </aside>
    </>
  );
}

