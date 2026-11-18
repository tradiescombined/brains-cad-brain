import { currentPermissions } from "@/lib/permissions";
import Link from "next/link";
import { db, schema } from "@/db";
import { count, eq } from "drizzle-orm";
import { Badge, EmptyState, Input, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { cx } from "@/lib/format";
import { clientDisplayName } from "./fields";
import { matchesQuery, parseSort, qs, sortRows, type SortDir } from "./list";
import { QuickCreateClient } from "./QuickCreateClient";
import { SortTh } from "./SortTh";

export const metadata = { title: "Clients" };

const SORTS = ["name", "type", "email", "mobile", "city", "source", "estimates", "jobs"] as const;

type SP = { q?: string; sort?: string; dir?: string; archived?: string; clientId?: string; deleted?: string; imported?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const perm = await currentPermissions();
  const sp = await searchParams;
  const { sort, dir } = parseSort(sp.sort, sp.dir, SORTS, "name");
  const showArchived = sp.archived === "1";

  const [clients, estCounts, jobCounts] = await Promise.all([
    db.select().from(schema.clients),
    db.select({ id: schema.estimates.clientId, n: count() }).from(schema.estimates).where(eq(schema.estimates.isTemplate, false)).groupBy(schema.estimates.clientId),
    db.select({ id: schema.jobs.clientId, n: count() }).from(schema.jobs).groupBy(schema.jobs.clientId),
  ]);
  const est = new Map(estCounts.map((r) => [r.id, r.n]));
  const jobs = new Map(jobCounts.map((r) => [r.id, r.n]));
  const archivedCount = clients.filter((c) => c.archived).length;

  const rows = clients
    .filter((c) => showArchived || !c.archived)
    .filter((c) => matchesQuery([c.name, c.businessName, c.email, c.mobile, c.phone, c.cityTown, c.postcode, c.address, c.source, c.category], sp.q))
    .map((c) => ({ ...c, display: clientDisplayName(c), estimates: est.get(c.id) ?? 0, jobs: jobs.get(c.id) ?? 0 }));

  const getters: Record<(typeof SORTS)[number], (r: (typeof rows)[number]) => string | number | null> = {
    name: (r) => r.display,
    type: (r) => r.clientType,
    email: (r) => r.email,
    mobile: (r) => r.mobile,
    city: (r) => r.cityTown,
    source: (r) => r.source,
    estimates: (r) => r.estimates,
    jobs: (r) => r.jobs,
  };
  const sorted = sortRows(rows, getters[sort], dir);
  const base = { q: sp.q, archived: showArchived ? "1" : undefined };
  const href = (k: string, d: SortDir) => `/clients${qs({ ...base, sort: k, dir: d })}`;
  const highlighted = sp.clientId;

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length - archivedCount} active${archivedCount ? ` · ${archivedCount} archived` : ""}`}
        actions={
          <>
            {perm["clients.edit"] && <LinkButton href="/clients/import" variant="secondary">Import CSV</LinkButton>
}            <a href={`/api/export/clients${showArchived ? "?archived=1" : ""}`} className="inline-flex items-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-xs hover:bg-ink-50" download>
              Export CSV
            </a>
            <QuickCreateClient returnTo="/clients" label="Quick add" />
            {perm["clients.edit"] && <LinkButton href="/clients/new">New client</LinkButton>
}          </>
        }
      />

      {sp.deleted && <Flash>Client deleted.</Flash>}
      {highlighted && clients.some((c) => c.id === highlighted) && <Flash>Client added. It&apos;s highlighted below.</Flash>}

      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, email, phone, suburb…" className="max-w-sm" aria-label="Search clients" />
        {showArchived && <input type="hidden" name="archived" value="1" />}
        {sp.sort && <input type="hidden" name="sort" value={sort} />}
        {sp.dir && <input type="hidden" name="dir" value={dir} />}
        <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">Search</button>
        {sp.q && <Link href={`/clients${qs({ archived: base.archived, sort: sp.sort, dir: sp.dir })}`} className="text-sm text-ink-500 hover:text-ink-800">Clear</Link>}
        <Link
          href={`/clients${qs({ q: sp.q, sort: sp.sort, dir: sp.dir, archived: showArchived ? undefined : "1" })}`}
          className="ml-auto text-sm font-medium text-brand-700 hover:underline"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </form>

      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          body="Add the people and businesses you quote for, or bring them across from a spreadsheet."
          action={perm["clients.edit"] && <div className="flex gap-2"><LinkButton href="/clients/import" variant="secondary">Import CSV</LinkButton><LinkButton href="/clients/new">New client</LinkButton></div>}
        />
      ) : sorted.length === 0 ? (
        <EmptyState title="No matching clients" body={sp.q ? `Nothing matches “${sp.q}”. Try a different search${showArchived ? "" : " or show archived clients"}.` : "All clients are archived."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh label="Name" k="name" sort={sort} dir={dir} href={href} />
              <SortTh label="Type" k="type" sort={sort} dir={dir} href={href} />
              <SortTh label="Email" k="email" sort={sort} dir={dir} href={href} className="hidden md:table-cell" />
              <SortTh label="Mobile" k="mobile" sort={sort} dir={dir} href={href} className="hidden sm:table-cell" />
              <SortTh label="City/Town" k="city" sort={sort} dir={dir} href={href} className="hidden lg:table-cell" />
              <SortTh label="Source" k="source" sort={sort} dir={dir} href={href} className="hidden lg:table-cell" />
              <SortTh label="Estimates" k="estimates" sort={sort} dir={dir} href={href} className="text-right" />
              <SortTh label="Jobs" k="jobs" sort={sort} dir={dir} href={href} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className={cx("hover:bg-ink-50", c.id === highlighted && "bg-brand-50", c.archived && "text-ink-400")} data-client-row={c.id}>
                <Td>
                  <Link href={`/clients/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700">{c.display}</Link>
                  {c.clientType === "Business" && c.name !== c.display && <div className="text-xs text-ink-500">{c.name}</div>}
                  {c.archived && <span className="ml-2"><Badge>Archived</Badge></span>}
                </Td>
                <Td className="text-ink-600">{c.clientType}</Td>
                <Td className="hidden md:table-cell">{c.email ? <a href={`mailto:${c.email}`} className="text-ink-700 hover:text-brand-700">{c.email}</a> : <Dash />}</Td>
                <Td className="hidden whitespace-nowrap sm:table-cell">{c.mobile || <Dash />}</Td>
                <Td className="hidden lg:table-cell">{c.cityTown || <Dash />}</Td>
                <Td className="hidden lg:table-cell">{c.source || <Dash />}</Td>
                <Td className="text-right tabular-nums">{c.estimates || <Dash />}</Td>
                <Td className="text-right tabular-nums">{c.jobs || <Dash />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {sorted.length > 0 && <p className="mt-2 text-xs text-ink-500">Showing {sorted.length} of {clients.length} clients</p>}
    </div>
  );
}

function Dash() {
  return <span className="text-ink-300">—</span>;
}

function Flash({ children }: { children: React.ReactNode }) {
  return <div role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{children}</div>;
}
