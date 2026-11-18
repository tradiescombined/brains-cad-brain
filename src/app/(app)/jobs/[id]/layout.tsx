/**
 * Shared job shell: header + tab bar. Owned by the integrator.
 * Module 9 owns: overview (page.tsx), schedule, costs, timesheets, selections, files.
 * Module 10 owns: orders, variations, invoices.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { Badge, statusTone } from "@/components/ui";
import { RouteTabs } from "@/components/shell/RouteTabs";
import { money } from "@/lib/format";

export default async function JobLayout({ children, params }: LayoutProps<"/jobs/[id]">) {
  const { id } = await params;
  const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!j) notFound();
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/jobs" className="text-xs font-medium text-ink-500 hover:text-brand-700">← Jobs</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{j.name}</h1>
            <Badge tone={statusTone(j.status)}>{j.status}</Badge>
          </div>
          <div className="mt-1 text-sm text-ink-500">{j.number}{j.siteAddress ? ` · ${j.siteAddress}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-ink-500">Contract value</div>
          <div className="text-2xl font-semibold tabular-nums">{money(j.contractValue)}</div>
        </div>
      </div>
      <RouteTabs
        base={`/jobs/${id}`}
        tabs={[
          { seg: "", label: "Overview" },
          { seg: "schedule", label: "Schedule" },
          { seg: "costs", label: "Cost tracking" },
          { seg: "orders", label: "Orders" },
          { seg: "variations", label: "Variations" },
          { seg: "invoices", label: "Invoices" },
          { seg: "timesheets", label: "Timesheets" },
          { seg: "selections", label: "Selections" },
          { seg: "files", label: "Notes & files" },
        ]}
      />
      {children}
    </div>
  );
}
