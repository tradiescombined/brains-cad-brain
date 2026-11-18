import { requirePermission } from "@/lib/permissions";
import { db, schema } from "@/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { getLookups } from "@/lib/settings";
import { todayIso } from "@/lib/format";
import { snapToWorkingDay } from "@/lib/scheduling";
import { createBlankJob, createJobFromEstimate } from "../actions";
import { NewJobForms } from "./NewJobForms";

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ estimateId?: string; mode?: string }> }) {
  await requirePermission("jobs.edit");
  const sp = await searchParams;
  const ests = await db
    .select({ id: schema.estimates.id, number: schema.estimates.number, name: schema.estimates.name, status: schema.estimates.status, quoteTotal: schema.estimates.quoteTotal, clientName: schema.estimates.clientName, jobId: schema.estimates.jobId })
    .from(schema.estimates)
    .where(and(eq(schema.estimates.archived, false), eq(schema.estimates.isTemplate, false)))
    .orderBy(desc(schema.estimates.updatedAt));
  const accepted = new Set((await getLookups("estimate_status")).filter((l) => l.flag).map((l) => l.name));
  const live = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.archived, false));
  const liveIds = new Set(live.map((j) => j.id));
  const available = ests
    .filter((e) => !e.jobId || !liveIds.has(e.jobId) || e.id === sp.estimateId)
    .map((e) => ({ ...e, accepted: accepted.has(e.status), hasJob: !!e.jobId && liveIds.has(e.jobId) }))
    .sort((a, b) => Number(b.accepted) - Number(a.accepted));
  const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.archived, false)).orderBy(asc(schema.clients.name));
  const mode = sp.mode === "blank" || (!sp.estimateId && available.length === 0) ? "blank" : "estimate";

  return (
    <div className="max-w-3xl">
      <PageHeader title="New job" subtitle="Start from an estimate to copy its costings into a budget, or set up a blank job." back={{ href: "/jobs", label: "Jobs" }} />
      <Card>
        <NewJobForms
          mode={mode}
          estimates={available}
          defaultEstimateId={sp.estimateId ?? available.find((e) => e.accepted)?.id ?? available[0]?.id ?? ""}
          clients={clients.map((c) => ({ value: c.id, label: c.name }))}
          defaultStart={snapToWorkingDay(todayIso())}
          fromEstimate={createJobFromEstimate}
          blank={createBlankJob}
        />
      </Card>
    </div>
  );
}
