import Link from "next/link";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { Badge, EmptyState, Input, LinkButton, PageHeader, Select, Stat, Table, Td, Th, statusTone } from "@/components/ui";
import { cx, date, money } from "@/lib/format";
import { clientNames, loadFinanceForJobs, JOB_STATUSES } from "../schedule/_lib/job-data";
import { ProgressBar, pctText } from "../schedule/_lib/bits";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const q = (sp.q ?? "").trim().toLowerCase();

  const all = await db.select().from(schema.jobs).where(eq(schema.jobs.archived, false)).orderBy(desc(schema.jobs.createdAt));
  const names = await clientNames(all);
  const rows = all.filter((j) => {
    if (status === "active" && (j.status === "Completed" || j.status === "Cancelled")) return false;
    if (status !== "active" && status !== "all" && j.status !== status) return false;
    if (q) {
      const hay = [j.number, j.name, names.get(j.id), j.siteAddress, j.siteCityTown, j.projectManager].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const fin = await loadFinanceForJobs(rows);
  const totals = rows.reduce(
    (t, j) => {
      const f = fin.get(j.id)!;
      return { contract: t.contract + f.revisedContract, invoiced: t.invoiced + f.invoiced, outstanding: t.outstanding + f.outstanding, cost: t.cost + f.actualToDate };
    },
    { contract: 0, invoiced: 0, outstanding: 0, cost: 0 },
  );
  const counts = new Map<string, number>();
  for (const j of all) counts.set(j.status, (counts.get(j.status) ?? 0) + 1);

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={`${all.length} job${all.length === 1 ? "" : "s"} · ${(counts.get("In progress") ?? 0)} in progress`}
        actions={
          <>
            <LinkButton variant="secondary" href="/schedule">Schedule</LinkButton>
            <LinkButton href="/jobs/new">New job</LinkButton>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contract value" value={money(totals.contract, { cents: false })} sub={`${rows.length} shown`} />
        <Stat label="Invoiced" value={money(totals.invoiced, { cents: false })} sub={totals.contract ? `${pctText((totals.invoiced / totals.contract) * 100, 0)} of contract` : undefined} />
        <Stat label="Outstanding" value={money(totals.outstanding, { cents: false })} />
        <Stat label="Costs to date" value={money(totals.cost, { cents: false })} />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search number, name, client, site…" className="w-full sm:w-72" aria-label="Search jobs" />
        <div className="w-full sm:w-48">
        <Select
          name="status"
          defaultValue={status}
          aria-label="Status filter"
          options={[{ value: "active", label: "Active jobs" }, { value: "all", label: "All statuses" }, ...JOB_STATUSES.map((s) => ({ value: s, label: `${s} (${counts.get(s) ?? 0})` }))]}
        />
        </div>
        <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50">Filter</button>
        {(q || status !== "active") && <Link href="/jobs" className="text-sm text-ink-500 hover:text-brand-700">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            body="Turn an accepted estimate into a job to carry its costings across as a budget, or start a blank job."
            action={<LinkButton href="/jobs/new">Create your first job</LinkButton>}
          />
        ) : (
          <EmptyState title="No jobs match" body="Try a different search or status filter." action={<LinkButton variant="secondary" href="/jobs?status=all">Show all jobs</LinkButton>} />
        )
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Job</Th>
              <Th className="hidden md:table-cell">Client</Th>
              <Th>Status</Th>
              <Th className="hidden lg:table-cell">Start</Th>
              <Th className="hidden lg:table-cell">Finish</Th>
              <Th className="text-right">Contract</Th>
              <Th className="hidden w-36 sm:table-cell">Invoiced</Th>
              <Th className="text-right">Margin</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              const f = fin.get(j.id)!;
              return (
                <tr key={j.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap font-medium"><Link href={`/jobs/${j.id}`} className="text-brand-700 hover:underline">{j.number}</Link></Td>
                  <Td>
                    <Link href={`/jobs/${j.id}`} className="font-medium text-ink-900 hover:text-brand-700">{j.name}</Link>
                    {j.siteAddress && <div className="text-xs text-ink-500">{[j.siteAddress, j.siteCityTown].filter(Boolean).join(", ")}</div>}
                  </Td>
                  <Td className="hidden md:table-cell">{names.get(j.id) ?? <span className="text-ink-400">—</span>}</Td>
                  <Td><Badge tone={statusTone(j.status)}>{j.status}</Badge></Td>
                  <Td className="hidden whitespace-nowrap lg:table-cell">{date(j.startDate) || <span className="text-ink-400">—</span>}</Td>
                  <Td className="hidden whitespace-nowrap lg:table-cell">{date(j.endDate) || <span className="text-ink-400">—</span>}</Td>
                  <Td className="text-right tabular-nums">{money(f.revisedContract)}</Td>
                  <Td className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={f.invoicedPercent} className="w-16" label="Invoiced" />
                      <span className="text-xs tabular-nums text-ink-600">{pctText(f.invoicedPercent, 0)}</span>
                    </div>
                  </Td>
                  <Td className={cx("text-right tabular-nums", f.forecastMarginPercent < 0 ? "text-red-700" : f.forecastMarginPercent < 10 ? "text-amber-700" : "text-ink-800")}>
                    {f.revisedContract ? pctText(f.forecastMarginPercent) : <span className="text-ink-400">—</span>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
