import { currentPermissions } from "@/lib/permissions";
import Link from "next/link";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, EmptyState, Input, LinkButton, PageHeader, Stat, Table, Td, Th, statusTone } from "@/components/ui";
import { cx, date, money, todayIso } from "@/lib/format";
import { LEAD_STAGES, OPEN_STAGES, initials, isFollowUpOverdue, leadsHref, pipelineSummary, stageTotals } from "./lib";
import { StageSelect } from "./LeadControls";
import { getUsers } from "./data";

export const metadata = { title: "Leads" };

type SP = { q?: string; stage?: string; view?: string; archived?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const perm = await currentPermissions();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const view = sp.view === "board" ? "board" : "list";
  const archived = sp.archived === "1";
  const stageFilter = sp.stage && (sp.stage === "open" || (LEAD_STAGES as readonly string[]).includes(sp.stage)) ? sp.stage : "";
  const today = todayIso();

  const L = schema.leads;
  const pat = `%${q}%`;
  const rows = await db
    .select({
      id: L.id,
      number: L.number,
      title: L.title,
      contactName: L.contactName,
      email: L.email,
      phone: L.phone,
      stage: L.stage,
      source: L.source,
      estimatedValue: L.estimatedValue,
      probability: L.probability,
      followUpDate: L.followUpDate,
      assignedTo: L.assignedTo,
      cityTown: L.cityTown,
      clientName: schema.clients.name,
    })
    .from(L)
    .leftJoin(schema.clients, eq(schema.clients.id, L.clientId))
    .where(
      and(
        eq(L.archived, archived),
        q
          ? or(like(L.title, pat), like(L.number, pat), like(L.contactName, pat), like(L.email, pat), like(L.phone, pat), like(L.address, pat), like(L.cityTown, pat), like(schema.clients.name, pat))
          : undefined,
      ),
    )
    .orderBy(desc(L.createdAt));

  const users = new Map((await getUsers()).map((u) => [u.id, u.name]));
  const summary = pipelineSummary(rows, today);
  const totals = stageTotals(rows);
  const shown =
    view === "board" || !stageFilter
      ? rows
      : rows.filter((r) => (stageFilter === "open" ? OPEN_STAGES.includes(r.stage) : r.stage === stageFilter));

  const base = { q, view: view === "board" ? "board" : undefined, archived: archived ? "1" : undefined };

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Track enquiries from first contact through to a signed job."
        actions={perm["leads.edit"] && <LinkButton href="/leads/new">+ New lead</LinkButton>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open leads" value={summary.openCount} />
        <Stat label="Pipeline value" value={money(summary.openValue, { cents: false })} sub="Open leads, estimated" />
        <Stat label="Weighted value" value={money(summary.weighted, { cents: false })} sub="Value × probability" />
        <Stat label="Overdue follow-ups" value={<span className={summary.overdue ? "text-red-600" : undefined}>{summary.overdue}</span>} sub={summary.winRate === null ? "No closed leads yet" : `Win rate ${summary.winRate}%`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form action="/leads" className="flex w-full max-w-md items-center gap-2">
          {view === "board" && <input type="hidden" name="view" value="board" />}
          {stageFilter && view === "list" && <input type="hidden" name="stage" value={stageFilter} />}
          {archived && <input type="hidden" name="archived" value="1" />}
          <Input type="search" name="q" defaultValue={q} placeholder="Search title, contact, client, suburb…" aria-label="Search leads" />
          <button type="submit" className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">
            Search
          </button>
        </form>
        <div className="flex items-center gap-2">
          <Link
            href={leadsHref({ ...base, archived: archived ? undefined : "1", stage: view === "list" ? stageFilter : undefined })}
            className={cx("rounded-md px-2.5 py-1.5 text-xs font-medium", archived ? "bg-amber-50 text-amber-800" : "text-ink-500 hover:text-ink-800")}
          >
            {archived ? "Showing archived · show active" : "Show archived"}
          </Link>
          <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-sm" role="group" aria-label="View">
            <Link href={leadsHref({ ...base, view: undefined, stage: stageFilter })} aria-current={view === "list" ? "page" : undefined} className={cx("rounded px-3 py-1 font-medium", view === "list" ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50")}>
              List
            </Link>
            <Link href={leadsHref({ ...base, view: "board" })} aria-current={view === "board" ? "page" : undefined} className={cx("rounded px-3 py-1 font-medium", view === "board" ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50")}>
              Board
            </Link>
          </div>
        </div>
      </div>

      {view === "list" && (
        <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by stage">
          <Chip href={leadsHref({ ...base })} active={!stageFilter} label="All" count={rows.length} />
          <Chip href={leadsHref({ ...base, stage: "open" })} active={stageFilter === "open"} label="Open" count={summary.openCount} />
          {totals.map((t) => (
            <Chip key={t.stage} href={leadsHref({ ...base, stage: t.stage })} active={stageFilter === t.stage} label={t.stage} count={t.count} />
          ))}
        </nav>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "No leads match your search" : archived ? "No archived leads" : "No leads yet"}
          body={q ? "Try a different name, suburb or lead number." : archived ? "Leads you archive will appear here." : "Capture your first enquiry and move it through the pipeline to an estimate."}
          action={q ? <LinkButton variant="secondary" href={leadsHref({ ...base, q: undefined })}>Clear search</LinkButton> : !archived && perm["leads.edit"] && <LinkButton href="/leads/new">+ New lead</LinkButton>}
        />
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-3">
            {totals.map((t) => (
              <section key={t.stage} aria-label={`${t.stage} column`} data-stage={t.stage} className="flex w-64 shrink-0 flex-col rounded-lg border border-ink-200 bg-ink-100/60">
                <header className="border-b border-ink-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <Badge tone={statusTone(t.stage)}>{t.stage}</Badge>
                    <span className="text-xs font-medium text-ink-500" data-testid="column-count">{t.count}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-600">
                    <span data-testid="column-total">{money(t.value, { cents: false })}</span>
                    <span className="text-ink-400" title="Weighted by probability">≈ {money(t.weighted, { cents: false })}</span>
                  </div>
                </header>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {rows
                    .filter((r) => r.stage === t.stage)
                    .map((r) => {
                      const overdue = isFollowUpOverdue(r.followUpDate, r.stage, today);
                      const who = r.assignedTo ? users.get(r.assignedTo) : null;
                      return (
                        <article key={r.id} className="rounded-md border border-ink-200 bg-white p-2.5 shadow-xs" data-lead={r.number ?? ""}>
                          <Link href={`/leads/${r.id}`} className="block text-sm font-medium text-ink-900 hover:text-brand-700">
                            {r.title}
                          </Link>
                          <div className="mt-0.5 truncate text-xs text-ink-500">
                            {r.number} · {r.clientName ?? r.contactName ?? "No contact"}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="font-medium tabular-nums text-ink-800">{r.estimatedValue != null ? money(r.estimatedValue, { cents: false }) : "—"}</span>
                            {r.followUpDate && <span className={cx(overdue ? "font-medium text-red-600" : "text-ink-500")}>{overdue ? "Overdue " : "Follow up "}{date(r.followUpDate)}</span>}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1">
                              <StageSelect id={r.id} stage={r.stage} label={r.title} />
                            </div>
                            {who && (
                              <span title={who} className="grid size-6 place-items-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-800">
                                {initials(who)}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  {t.count === 0 && <p className="px-1 py-4 text-center text-xs text-ink-400">No leads</p>}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState title={`No leads in “${stageFilter === "open" ? "Open" : stageFilter}”`} action={<LinkButton variant="secondary" href={leadsHref({ ...base })}>Show all leads</LinkButton>} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-20">No.</Th>
              <Th>Title</Th>
              <Th>Client / contact</Th>
              <Th>Stage</Th>
              <Th className="hidden md:table-cell">Source</Th>
              <Th className="text-right">Value</Th>
              <Th>Follow-up</Th>
              <Th className="hidden lg:table-cell">Assigned</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const overdue = isFollowUpOverdue(r.followUpDate, r.stage, today);
              return (
                <tr key={r.id} className="hover:bg-ink-50/60" data-lead={r.number ?? ""}>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink-500">{r.number}</Td>
                  <Td>
                    <Link href={`/leads/${r.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {r.title}
                    </Link>
                    {r.cityTown && <div className="text-xs text-ink-500">{r.cityTown}</div>}
                  </Td>
                  <Td>
                    <div>{r.clientName ?? r.contactName ?? <span className="text-ink-400">—</span>}</div>
                    {r.clientName && r.contactName && r.contactName !== r.clientName && <div className="text-xs text-ink-500">{r.contactName}</div>}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(r.stage)}>{r.stage}</Badge>
                  </Td>
                  <Td className="hidden md:table-cell">{r.source ?? <span className="text-ink-400">—</span>}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{r.estimatedValue != null ? money(r.estimatedValue, { cents: false }) : <span className="text-ink-400">—</span>}</Td>
                  <Td className="whitespace-nowrap">
                    {r.followUpDate ? (
                      <span className={cx(overdue && "font-medium text-red-600")} data-overdue={overdue ? "1" : undefined}>
                        {date(r.followUpDate)}
                        {overdue && <span className="ml-1.5 rounded bg-red-50 px-1 py-0.5 text-[10px] font-semibold uppercase text-red-700">Overdue</span>}
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </Td>
                  <Td className="hidden lg:table-cell">{(r.assignedTo && users.get(r.assignedTo)) || <span className="text-ink-400">—</span>}</Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <Td colSpan={5} className="border-b-0 bg-ink-50 text-xs font-medium text-ink-500">
                {shown.length} lead{shown.length === 1 ? "" : "s"}
              </Td>
              <Td className="border-b-0 bg-ink-50 text-right font-semibold tabular-nums">{money(shown.reduce((s, r) => s + (r.estimatedValue ?? 0), 0), { cents: false })}</Td>
              <Td colSpan={2} className="border-b-0 bg-ink-50" />
            </tr>
          </tfoot>
        </Table>
      )}
    </div>
  );
}

function Chip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
      )}
    >
      {label}
      <span className={cx("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20" : "bg-ink-100 text-ink-600")}>{count}</span>
    </Link>
  );
}
