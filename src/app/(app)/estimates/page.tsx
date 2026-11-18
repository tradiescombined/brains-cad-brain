import { currentPermissions } from "@/lib/permissions";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, EmptyState, Input, LinkButton, PageHeader, Table, Td, Th, statusTone } from "@/components/ui";
import { getLookups } from "@/lib/settings";
import { cx, date, money } from "@/lib/format";
import { filterEstimates, type SortKey } from "./_components/logic";

export const metadata = { title: "Estimates" };

type SP = Promise<{ q?: string; status?: string; sort?: string; dir?: string; archived?: string }>;

export default async function EstimatesPage({ searchParams }: { searchParams: SP }) {
  const perm = await currentPermissions();
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const statuses = (await getLookups("estimate_status")).map((s) => s.name);
  const rows = await db
    .select({
      id: schema.estimates.id, number: schema.estimates.number, name: schema.estimates.name, status: schema.estimates.status,
      buildingType: schema.estimates.buildingType, clientName: schema.estimates.clientName, datePrepared: schema.estimates.datePrepared,
      createdAt: schema.estimates.createdAt, quoteTotal: schema.estimates.quoteTotal, jobId: schema.estimates.jobId,
    })
    .from(schema.estimates)
    .where(and(eq(schema.estimates.isTemplate, false), eq(schema.estimates.archived, showArchived)));
  const jobIds = new Map(rows.map((r) => [r.id, r.jobId]));

  const res = filterEstimates(rows, { q: sp.q, status: sp.status, statuses, sort: sp.sort, dir: sp.dir });
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, status: res.status || undefined, sort: sp.sort, dir: sp.dir, archived: showArchived ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/estimates?${s}` : "/estimates";
  };
  const sortHref = (key: SortKey) => href({ sort: key, dir: res.sort === key ? (res.dir === "asc" ? "desc" : "asc") : undefined });
  const anyAtAll = rows.length > 0;
  const filtering = !!(sp.q || res.status);

  return (
    <div>
      <PageHeader
        title="Estimates"
        subtitle={showArchived ? "Archived estimates" : "Price up work, track where each quote is at and turn wins into jobs."}
        actions={
          <>
            <LinkButton variant="secondary" href="/estimates/templates">Manage templates</LinkButton>
            {perm["estimates.edit"] && <LinkButton href="/estimates/new">New estimate</LinkButton>}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          <Chip href={href({ status: undefined })} active={!res.status} label="All" count={res.allCount} />
          {res.counts.map((c) => (
            <Chip key={c.name} href={href({ status: c.name })} active={res.status === c.name} label={c.name} count={c.count} />
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/estimates" className="flex items-center gap-2" role="search">
            {res.status && <input type="hidden" name="status" value={res.status} />}
            {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
            {sp.dir && <input type="hidden" name="dir" value={sp.dir} />}
            {showArchived && <input type="hidden" name="archived" value="1" />}
            <Input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search number, name, client…" aria-label="Search estimates" className="w-64" />
          </form>
          <Link
            href={href({ archived: showArchived ? undefined : "1", status: undefined })}
            className={cx(
              "rounded-md border px-2.5 py-1.5 text-sm font-medium",
              showArchived ? "border-brand-300 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
            )}
          >
            {showArchived ? "✓ Showing archived" : "Show archived"}
          </Link>
        </div>
      </div>

      {res.rows.length === 0 ? (
        anyAtAll || filtering ? (
          <EmptyState
            title="No estimates match"
            body={sp.q ? `Nothing found for “${sp.q}”${res.status ? ` with status ${res.status}` : ""}.` : `No estimates with status ${res.status}.`}
            action={<LinkButton variant="secondary" href={showArchived ? "/estimates?archived=1" : "/estimates"}>Clear filters</LinkButton>}
          />
        ) : showArchived ? (
          <EmptyState title="Nothing archived" body="Archived estimates are tucked away here. Archive an estimate from its actions menu." action={<LinkButton variant="secondary" href="/estimates">Back to estimates</LinkButton>} />
        ) : (
          <EmptyState title="No estimates yet" body="Start from a blank estimate or one of your templates." action={perm["estimates.edit"] && <LinkButton href="/estimates/new">Create your first estimate</LinkButton>} />
        )
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh sort={res.sort} dir={res.dir} hrefFor={sortHref} k="number" className="w-24">Number</SortTh>
              <SortTh sort={res.sort} dir={res.dir} hrefFor={sortHref} k="name">Name</SortTh>
              <SortTh sort={res.sort} dir={res.dir} hrefFor={sortHref} k="buildingType" className="hidden md:table-cell">Building type</SortTh>
              <SortTh sort={res.sort} dir={res.dir} hrefFor={sortHref} k="status">Status</SortTh>
              <SortTh sort={res.sort} dir={res.dir} hrefFor={sortHref} k="client" className="hidden sm:table-cell">Client</SortTh>
              <SortTh sort={res.sort} dir={res.dir} hrefFor={sortHref} k="date" className="hidden lg:table-cell">Date</SortTh>
              <SortTh sort={res.sort} dir={res.dir} hrefFor={sortHref} k="total" className="text-right">Quote total</SortTh>
            </tr>
          </thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={r.id} className="group hover:bg-brand-50/40" data-testid="estimate-row">
                <Td className="font-mono text-xs text-ink-600">{r.number}</Td>
                <Td>
                  <Link href={`/estimates/${r.id}`} className="font-medium text-ink-900 group-hover:text-brand-700 hover:underline">{r.name}</Link>
                  {jobIds.get(r.id) && <span className="ml-2 text-xs text-ink-400">· job created</span>}
                </Td>
                <Td className="hidden text-ink-600 md:table-cell">{r.buildingType ?? <span className="text-ink-300">—</span>}</Td>
                <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
                <Td className="hidden text-ink-600 sm:table-cell">{r.clientName ?? <span className="text-ink-300">—</span>}</Td>
                <Td className="hidden whitespace-nowrap text-ink-600 lg:table-cell">{date(r.datePrepared || r.createdAt)}</Td>
                <Td className="text-right tabular-nums font-medium">{money(r.quoteTotal)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-ink-50">
              <td colSpan={2} className="px-3 py-2 text-xs font-medium text-ink-500">
                {res.rows.length} {res.rows.length === 1 ? "estimate" : "estimates"} listed · total value
              </td>
              <td className="hidden md:table-cell" />
              <td />
              <td className="hidden sm:table-cell" />
              <td className="hidden lg:table-cell" />
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums" data-testid="list-total">{money(res.total)}</td>
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
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50",
      )}
    >
      {label}
      <span className={cx("rounded-full px-1.5 tabular-nums", active ? "bg-white/20" : "bg-ink-100 text-ink-500")}>{count}</span>
    </Link>
  );
}

function SortTh({ k, sort, dir, hrefFor, children, className }: { k: SortKey; sort: SortKey; dir: "asc" | "desc"; hrefFor: (k: SortKey) => string; children: React.ReactNode; className?: string }) {
  const active = sort === k;
  return (
    <Th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={hrefFor(k)} className="inline-flex items-center gap-1 hover:text-ink-800">
        {children}
        <span className={cx("text-[10px]", active ? "text-brand-700" : "text-ink-300")}>{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </Link>
    </Th>
  );
}
