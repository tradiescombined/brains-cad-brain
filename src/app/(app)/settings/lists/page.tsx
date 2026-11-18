import Link from "next/link";
import { db, schema } from "@/db";
import { allLookupKinds } from "../validation";

export const metadata = { title: "Lists · Settings" };

export default async function ListsPage() {
  const rows = await db.select({ kind: schema.lookups.kind, active: schema.lookups.active }).from(schema.lookups);
  const kinds = allLookupKinds(rows.map((r) => r.kind));
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
      <header className="border-b border-ink-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Lists</h2>
        <p className="mt-0.5 text-xs text-ink-500">The pick-lists used across estimates, contacts, clients and documents. Choose a list to edit its values.</p>
      </header>
      <ul className="divide-y divide-ink-100" aria-label="Lists">
        {kinds.map((k) => {
          const mine = rows.filter((r) => r.kind === k.kind);
          const active = mine.filter((r) => r.active).length;
          return (
            <li key={k.kind}>
              <Link href={`/settings/lists/${k.kind}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-ink-50">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{k.label}</span>
                  <span className="block text-xs text-ink-500">{k.hint}</span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-ink-500">
                  {mine.length === 0 ? "Empty" : `${active} active${mine.length > active ? ` · ${mine.length - active} inactive` : ""}`}
                  <span className="ml-2 text-ink-300" aria-hidden>›</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
