import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { Badge, EmptyState, LinkButton, Stat, TabNav, Table, Td, Th, statusTone } from "@/components/ui";
import { DocumentsPanel, NotesPanel } from "@/components/records";
import { date, money } from "@/lib/format";
import { getLookups } from "@/lib/settings";
import { deleteClient, setClientArchived, updateClient } from "../actions";
import { ClientForm } from "../ClientForm";
import { DeleteRecord } from "../DeleteRecord";
import { clientDisplayName } from "../fields";
import { clientReferences } from "../queries";
import { ClientContacts } from "./ClientContacts";

const TABS = ["details", "leads", "estimates", "jobs", "notes"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  return { title: c ? clientDisplayName(c) : "Client" };
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "details";
  const [c] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  if (!c) notFound();

  const [leads, estimates, jobs, refs] = await Promise.all([
    db
      .select({ id: schema.leads.id, number: schema.leads.number, title: schema.leads.title, stage: schema.leads.stage, estimatedValue: schema.leads.estimatedValue, followUpDate: schema.leads.followUpDate, archived: schema.leads.archived })
      .from(schema.leads)
      .where(eq(schema.leads.clientId, id))
      .orderBy(desc(schema.leads.createdAt)),
    db
      .select({ id: schema.estimates.id, number: schema.estimates.number, name: schema.estimates.name, status: schema.estimates.status, quoteTotal: schema.estimates.quoteTotal, datePrepared: schema.estimates.datePrepared, createdAt: schema.estimates.createdAt, archived: schema.estimates.archived })
      .from(schema.estimates)
      .where(and(eq(schema.estimates.clientId, id), eq(schema.estimates.isTemplate, false)))
      .orderBy(desc(schema.estimates.createdAt)),
    db
      .select({ id: schema.jobs.id, number: schema.jobs.number, name: schema.jobs.name, status: schema.jobs.status, contractValue: schema.jobs.contractValue, startDate: schema.jobs.startDate, archived: schema.jobs.archived })
      .from(schema.jobs)
      .where(eq(schema.jobs.clientId, id))
      .orderBy(desc(schema.jobs.createdAt)),
    clientReferences(id),
  ]);
  const estTotal = estimates.reduce((s, e) => s + (e.quoteTotal ?? 0), 0);
  const jobTotal = jobs.reduce((s, j) => s + (j.contractValue ?? 0), 0);
  const display = clientDisplayName(c);
  const base = `/clients/${id}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/clients" className="text-xs font-medium text-ink-500 hover:text-brand-700">← Clients</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{display}</h1>
            <Badge tone={c.clientType === "Business" ? "blue" : "grey"}>{c.clientType}</Badge>
            {c.category && <Badge tone="purple">{c.category}</Badge>}
            {c.archived && <Badge tone="amber">Archived</Badge>}
          </div>
          <div className="mt-1 text-sm text-ink-500">
            {[c.clientType === "Business" && c.name !== display ? c.name : null, c.email, c.mobile, c.cityTown].filter(Boolean).join(" · ") || "No contact details yet"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={setClientArchived}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
            <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-xs hover:bg-ink-50">
              {c.archived ? "Restore client" : "Archive"}
            </button>
          </form>
          <LinkButton href={`/estimates/new?clientId=${id}`}>New estimate</LinkButton>
        </div>
      </div>

      {sp.created && <div role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Client created.</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Estimates" value={estimates.length} sub={money(estTotal, { cents: false }) + " quoted"} />
        <Stat label="Accepted" value={estimates.filter((e) => /accept/i.test(e.status)).length} sub="estimates" />
        <Stat label="Jobs" value={jobs.length} sub={`${jobs.filter((j) => j.status === "In progress").length} in progress`} />
        <Stat label="Contract value" value={money(jobTotal, { cents: false })} sub="across all jobs" />
      </div>

      <TabNav
        active={tab}
        tabs={[
          { key: "details", label: "Details", href: base },
          { key: "leads", label: `Leads (${leads.length})`, href: `${base}?tab=leads` },
          { key: "estimates", label: `Estimates (${estimates.length})`, href: `${base}?tab=estimates` },
          { key: "jobs", label: `Jobs (${jobs.length})`, href: `${base}?tab=jobs` },
          { key: "notes", label: "Notes & files", href: `${base}?tab=notes` },
        ]}
      />

      {tab === "details" && <DetailsTab client={c} refs={refs} />}

      {tab === "leads" &&
        (leads.length === 0 ? (
          <EmptyState title="No leads for this client" body="Enquiries linked to this client will appear here." action={<LinkButton href="/leads/new">New lead</LinkButton>} />
        ) : (
          <Table>
            <thead>
              <tr><Th>Number</Th><Th>Lead</Th><Th>Stage</Th><Th className="hidden sm:table-cell">Follow up</Th><Th className="text-right">Value</Th></tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-600">{l.number}</Td>
                  <Td><Link href={`/leads/${l.id}`} className="font-medium text-ink-900 hover:text-brand-700">{l.title}</Link>{l.archived && <span className="ml-2"><Badge>Archived</Badge></span>}</Td>
                  <Td><Badge tone={statusTone(l.stage)}>{l.stage}</Badge></Td>
                  <Td className="hidden sm:table-cell">{date(l.followUpDate)}</Td>
                  <Td className="text-right tabular-nums">{l.estimatedValue != null ? money(l.estimatedValue, { cents: false }) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}

      {tab === "estimates" &&
        (estimates.length === 0 ? (
          <EmptyState title="No estimates for this client" body="Estimates linked to this client will appear here." action={<LinkButton href={`/estimates/new?clientId=${id}`}>New estimate</LinkButton>} />
        ) : (
          <Table>
            <thead>
              <tr><Th>Number</Th><Th>Name</Th><Th>Status</Th><Th className="hidden sm:table-cell">Prepared</Th><Th className="text-right">Quote total</Th></tr>
            </thead>
            <tbody>
              {estimates.map((e) => (
                <tr key={e.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-600">{e.number}</Td>
                  <Td><Link href={`/estimates/${e.id}`} className="font-medium text-ink-900 hover:text-brand-700">{e.name}</Link>{e.archived && <span className="ml-2"><Badge>Archived</Badge></span>}</Td>
                  <Td><Badge tone={statusTone(e.status)}>{e.status}</Badge></Td>
                  <Td className="hidden sm:table-cell">{date(e.datePrepared ?? e.createdAt)}</Td>
                  <Td className="text-right tabular-nums">{money(e.quoteTotal)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td colSpan={4} className="text-right text-ink-600">Total quoted</Td>
                <Td className="text-right tabular-nums">{money(estTotal)}</Td>
              </tr>
            </tfoot>
          </Table>
        ))}

      {tab === "jobs" &&
        (jobs.length === 0 ? (
          <EmptyState title="No jobs for this client" body="When an estimate is accepted and turned into a job, it will show up here." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Number</Th><Th>Name</Th><Th>Status</Th><Th className="hidden sm:table-cell">Start</Th><Th className="text-right">Contract value</Th></tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-ink-600">{j.number}</Td>
                  <Td><Link href={`/jobs/${j.id}`} className="font-medium text-ink-900 hover:text-brand-700">{j.name}</Link>{j.archived && <span className="ml-2"><Badge>Archived</Badge></span>}</Td>
                  <Td><Badge tone={statusTone(j.status)}>{j.status}</Badge></Td>
                  <Td className="hidden sm:table-cell">{date(j.startDate)}</Td>
                  <Td className="text-right tabular-nums">{money(j.contractValue)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td colSpan={4} className="text-right text-ink-600">Total contract value</Td>
                <Td className="text-right tabular-nums">{money(jobTotal)}</Td>
              </tr>
            </tfoot>
          </Table>
        ))}

      {tab === "notes" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <NotesPanel entityType="client" entityId={id} path={base} />
          <DocumentsPanel entityType="client" entityId={id} path={base} />
        </div>
      )}
    </div>
  );
}

async function DetailsTab({ client: c, refs }: { client: typeof schema.clients.$inferSelect; refs: { estimates: number; jobs: number; leads: number } }) {
  const [sources, categories, contacts] = await Promise.all([
    getLookups("client_source"),
    getLookups("client_type"),
    db.select().from(schema.clientContacts).where(eq(schema.clientContacts.clientId, c.id)).orderBy(desc(schema.clientContacts.isPrimary), asc(schema.clientContacts.name)),
  ]);
  const parts = [refs.estimates && `${refs.estimates} estimate${refs.estimates === 1 ? "" : "s"}`, refs.jobs && `${refs.jobs} job${refs.jobs === 1 ? "" : "s"}`, refs.leads && `${refs.leads} lead${refs.leads === 1 ? "" : "s"}`].filter(Boolean);
  return (
    <div className="space-y-6">
      <ClientForm
        action={updateClient.bind(null, c.id)}
        initial={c}
        sources={sources.map((l) => l.name)}
        categories={categories.map((l) => l.name)}
        submitLabel="Save changes"
        cancelHref="/clients"
      />
      <ClientContacts clientId={c.id} contacts={contacts} />
      <DeleteRecord
        id={c.id}
        action={deleteClient}
        noun="client"
        blockedReason={parts.length ? `This client can't be deleted because ${parts.join(", ")} ${parts.length === 1 && /^1 /.test(String(parts[0])) ? "is" : "are"} linked to it.` : null}
        archiveHint={c.archived ? "It's already archived and hidden from the client list." : "Archive it instead to hide it from lists while keeping its history."}
      />
    </div>
  );
}
