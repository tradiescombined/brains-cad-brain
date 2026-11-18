/** Sidebar navigation. Each module owns one entry. */
export const NAV: { section: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    section: "Win work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "◧" },
      { href: "/leads", label: "Leads", icon: "◎" },
      { href: "/estimates", label: "Estimates", icon: "▤" },
      { href: "/catalogues", label: "Catalogues", icon: "▦" },
    ],
  },
  {
    section: "Run jobs",
    items: [
      { href: "/jobs", label: "Jobs", icon: "⚒" },
      { href: "/schedule", label: "Schedule", icon: "▥" },
      { href: "/orders", label: "Orders", icon: "⇲" },
      { href: "/invoices", label: "Invoices", icon: "$" },
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
    items: [{ href: "/settings", label: "Settings", icon: "⚙" }],
  },
];
