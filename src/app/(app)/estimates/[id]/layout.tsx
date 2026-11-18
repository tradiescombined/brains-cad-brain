/**
 * Shared estimate shell: header (name, number, status, quote total) + tab bar.
 * Owned by the integrator. Header actions live in ./EstimateHeaderActions.tsx (module 4 owns).
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { Badge, statusTone } from "@/components/ui";
import { RouteTabs } from "@/components/shell/RouteTabs";
import { money } from "@/lib/format";
import { EstimateHeaderActions } from "./EstimateHeaderActions";

export default async function EstimateLayout({ children, params }: LayoutProps<"/estimates/[id]">) {
  const { id } = await params;
  const [e] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!e) notFound();
  const base = `/estimates/${id}`;
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/estimates" className="text-xs font-medium text-ink-500 hover:text-brand-700">← Estimates</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{e.name}</h1>
            <Badge tone={statusTone(e.status)}>{e.status}</Badge>
            {e.isTemplate && <Badge tone="purple">Template</Badge>}
          </div>
          <div className="mt-1 text-sm text-ink-500">
            {e.number}
            {e.clientName ? ` · ${e.clientName}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-ink-500">Quote total</div>
            <div className="text-2xl font-semibold tabular-nums">{money(e.quoteTotal)}</div>
          </div>
          <EstimateHeaderActions estimate={e} />
        </div>
      </div>
      <RouteTabs
        base={base}
        tabs={[
          { seg: "", label: "Details" },
          { seg: "takeoffs", label: "Plans & takeoffs" },
          { seg: "costings", label: "Costings" },
          { seg: "specifications", label: "Specifications" },
          { seg: "quote", label: "Quote" },
        ]}
      />
      {children}
    </div>
  );
}
