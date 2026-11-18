import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui";
import { cx } from "@/lib/format";
import { DeleteForm } from "../../_components/DeleteForm";
import { deleteLookup, moveLookup, setAcceptedStatus, toggleLookupActive } from "../../actions";
import { allLookupKinds } from "../../validation";
import { AddLookup, RenameLookup } from "../LookupForms";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const k = allLookupKinds([kind]).find((x) => x.kind === kind);
  return { title: `${k?.label ?? "List"} · Settings` };
}

const iconBtn = "grid size-7 place-items-center rounded-md border border-ink-200 bg-white text-xs text-ink-600 hover:bg-ink-50 disabled:opacity-30 disabled:hover:bg-white";

export default async function LookupKindPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(kind)) notFound();
  const [rows, allKinds] = await Promise.all([
    db.select().from(schema.lookups).where(eq(schema.lookups.kind, kind)).orderBy(asc(schema.lookups.sortOrder), asc(schema.lookups.name)),
    db.selectDistinct({ kind: schema.lookups.kind }).from(schema.lookups),
  ]);
  const kinds = allLookupKinds(allKinds.map((k) => k.kind));
  const meta = kinds.find((k) => k.kind === kind);
  if (!meta) notFound();
  const isStatus = kind === "estimate_status";

  return (
    <div className="space-y-4">
      <nav aria-label="Lists" className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <Link
            key={k.kind}
            href={`/settings/lists/${k.kind}`}
            aria-current={k.kind === kind ? "page" : undefined}
            className={cx(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium",
              k.kind === kind ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-700",
            )}
          >
            {k.label}
          </Link>
        ))}
      </nav>

      <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-900">{meta.label}</h2>
          <p className="mt-0.5 text-xs text-ink-500">{meta.hint} Inactive values stay on existing records but aren&apos;t offered for new ones.</p>
        </header>
        <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-3">
          <AddLookup kind={kind} label={meta.label} />
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-400">This list is empty. Add the first value above.</p>
        ) : (
          <ol className="divide-y divide-ink-100" aria-label={`${meta.label} values`}>
            {rows.map((r, i) => (
              <li key={r.id} data-lookup={r.name} className={cx("flex flex-wrap items-center gap-2 px-4 py-2", !r.active && "bg-ink-50/70")}>
                <div className="flex shrink-0 items-center gap-1">
                  <form action={moveLookup}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button type="submit" className={iconBtn} disabled={i === 0} aria-label={`Move ${r.name} up`}>▲</button>
                  </form>
                  <form action={moveLookup}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button type="submit" className={iconBtn} disabled={i === rows.length - 1} aria-label={`Move ${r.name} down`}>▼</button>
                  </form>
                </div>
                <RenameLookup id={r.id} name={r.name} inactive={!r.active} />
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {isStatus &&
                    (r.flag ? (
                      <Badge tone="green">Accepted status</Badge>
                    ) : (
                      <form action={setAcceptedStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-brand-50 hover:text-brand-700" aria-label={`Mark ${r.name} as the accepted status`}>
                          Set as accepted
                        </button>
                      </form>
                    ))}
                  {!r.active && <Badge tone="amber">Inactive</Badge>}
                  {r.isSystem && <Badge>Built-in</Badge>}
                  {!(r.flag && r.active) && (
                    <form action={toggleLookupActive}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50">
                        {r.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  )}
                  {!r.isSystem && !r.flag && <DeleteForm action={deleteLookup} id={r.id} confirmText="Delete?" />}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
