import type { Action } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; /** Permission needed to see the entry. */ perm?: Action };
export type NavSection = { section: string; items: NavItem[] };

/** Sidebar navigation. Each module owns one entry. */
export const NAV: NavSection[] = [
  {
    section: "Win work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "◧" },
      { href: "/leads", label: "Leads", icon: "◎" },
      { href: "/estimates", perm: "estimates.view", label: "Estimates", icon: "▤" },
      { href: "/catalogues", perm: "costs.view", label: "Catalogues", icon: "▦" },
    ],
  },
  {
    section: "Run jobs",
    items: [
      { href: "/jobs", perm: "jobs.view", label: "Jobs", icon: "⚒" },
      { href: "/schedule", perm: "jobs.view", label: "Schedule", icon: "▥" },
      { href: "/orders", perm: "orders.view", label: "Orders", icon: "⇲" },
      { href: "/invoices", perm: "invoices.view", label: "Invoices", icon: "$" },
    ],
  },
  {
    section: "People",
    items: [
      { href: "/clients", label: "Clients", icon: "☺" },
      { href: "/contacts", label: "Suppliers & trades", icon: "☏" },
      { href: "/reminders", label: "Reminders", icon: "⏰" },
    ],
  },
  {
    section: "Setup",
    items: [{ href: "/settings", perm: "settings.manage", label: "Settings", icon: "⚙" }],
  },
];

/** Sections/items the user may see (`allowed` = their permission flags). Empty sections are dropped. */
export function navFor(allowed: Partial<Record<Action, boolean>>): NavSection[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || allowed[it.perm]) })).filter((g) => g.items.length > 0);
}
