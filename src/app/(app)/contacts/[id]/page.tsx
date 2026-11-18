import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { Badge, EmptyState, Stat, TabNav, Table, Td, Th, statusTone } from "@/components/ui";
import { DocumentsPanel, NotesPanel } from "@/components/records";
import { date, money, todayIso } from "@/lib/format";
import { getLookups } from "@/lib/settings";
import { DeleteRecord } from "../../clients/DeleteRecord";
import { parseGroups } from "../../clients/list";
import { deleteContact, setContactArchived, updateContact } from "../actions";
import { ContactForm } from "../ContactForm";
import { insuranceLabel, insuranceStatus, stars } from "../fields";
import { contactReferences, describeContactRefs } from "../queries";

const TABS = ["details", "orders", "notes"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c] = await db.select({ name: schema.contacts.name }).from(schema.contacts).where(eq(schema.contacts.id, id));
  return { title: c?.name ?? "Contact" };
}

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "details";
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id));
  if (!c) notFound();
  const today = todayIso();
  const ins = insuranceStatus(c.insuranceExpiry, today);
  const groups = parseGroups(c.groups);

  const orders = await db
    .select({ id: schema.purchaseOrders.id, number: schema.purchaseOrders.number, status: schema.purchaseOrders.status, orderDate: schema.purchaseOrders.orderDate, deliveryDate: schema.purchaseOrders.deliveryDate, total: schema.purchaseOrders.total, jobId: schema.purchaseOrders.jobId, jobName: schema.jobs.name, jobNumber: schema.jobs.number })
    .from(schema.purchaseOrders)
    .leftJoin(schema.jobs, eq(schema.jobs.id, schema.purchaseOrders.jobId))
    .where(eq(schema.purchaseOrders.supplierId, id))
    .orderBy(desc(schema.purchaseOrders.orderDate));
  const live = orders.filter((o) => o.status !== "Cancelled");
  const orderTotal = live.reduce((s, o) => s + (o.total ?? 0), 0);
  const open = live.filter((o) => !["Delivered", "Billed"].includes(o.status)).length;
  const base = `/contacts/${id}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/contacts" className="text-xs font-medium text-ink-500 hover:text-brand-700">← Suppliers & trades</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{c.name}</h1>
            {c.contactType && <Badge tone="blue">{c.contactType}</Badge>}
            {c.archived && <Badge tone="amber">Archived</Badge>}
            {(ins.state === "expired" || ins.state === "expiring") && <Badge tone={ins.state === "expired" ? "red" : "amber"}>Insurance: {insuranceLabel(ins)}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
            <span>{[c.businessName !== c.name ? c.businessName : null, c.trade, c.email, c.mobile || c.phone].filter(Boolean).join(" · ") || "No contact details yet"}</span>
            {groups.map((g) => <span key={g} className="rounded bg-ink-100 px-1.5 py-px text-xs text-ink-600">{g}</span>)}
          </div>
        </div>
        <form action={setContactArchived}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
          <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-xs hover:bg-ink-50">{c.archived ? "Restore contact" : "Archive"}</button>
        </form>
      </div>

      {sp.created && <div role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Contact created.</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={live.length} sub={`${open} open`} />
        <Stat label="Ordered value" value={money(orderTotal, { cents: false })} sub="excl. cancelled" />
        <Stat label="Insurance" value={<span className="text-lg">{c.insuranceExpiry ? date(c.insuranceExpiry) : "—"}</span>} sub={insuranceLabel(ins)} />
        <Stat label="Rating" value={<span className="text-lg text-amber-500">{c.rating ? stars(c.rating) : <span className="text-ink-400">Not rated</span>}</span>} sub={c.paymentTermsDays != null ? `${c.paymentTermsDays}-day terms` : "No terms set"} />
      </div>

      <TabNav
        active={tab}
        tabs={[
          { key: "details", label: "Details", href: base },
          { key: "orders", label: `Orders (${orders.length})`, href: `${base}?tab=orders` },
          { key: "notes", label: "Notes & files", href: `${base}?tab=notes` },
        ]}
      />

      {tab === "details" && <DetailsTab contact={c} groups={groups} />}

      {tab === "orders" &&
        (orders.length === 0 ? (
          <EmptyState title="No purchase orders yet" body="Orders raised to this supplier from a job will be listed here." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Order</Th><Th>Job</Th><Th>Status</Th><Th className="hidden sm:table-cell">Ordered</Th><Th className="hidden md:table-cell">Delivery</Th><Th className="text-right">Total</Th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap font-medium">{o.number}</Td>
                  <Td>{o.jobId ? <Link href={`/jobs/${o.jobId}`} className="hover:text-brand-700">{[o.jobNumber, o.jobName].filter(Boolean).join(" · ") || "Job"}</Link> : <span className="text-ink-400">—</span>}</Td>
                  <Td><Badge tone={statusTone(o.status)}>{o.status}</Badge></Td>
                  <Td className="hidden sm:table-cell">{date(o.orderDate)}</Td>
                  <Td className="hidden md:table-cell">{date(o.deliveryDate) || <span className="text-ink-400">—</span>}</Td>
                  <Td className="text-right tabular-nums">{money(o.total)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td colSpan={5} className="text-right text-ink-600">Total (excl. cancelled)</Td>
                <Td className="text-right tabular-nums">{money(orderTotal)}</Td>
              </tr>
            </tfoot>
          </Table>
        ))}

      {tab === "notes" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <NotesPanel entityType="contact" entityId={id} path={base} />
          <DocumentsPanel entityType="contact" entityId={id} path={base} />
        </div>
      )}
    </div>
  );
}

async function DetailsTab({ contact: c, groups }: { contact: typeof schema.contacts.$inferSelect; groups: string[] }) {
  const [types, groupLookups, refs] = await Promise.all([getLookups("contact_type"), getLookups("contact_group"), contactReferences(c.id)]);
  return (
    <div className="space-y-6">
      <ContactForm
        action={updateContact.bind(null, c.id)}
        initial={{ ...c, groups }}
        types={types.map((l) => l.name)}
        groups={groupLookups.map((l) => l.name)}
        submitLabel="Save changes"
        cancelHref="/contacts"
      />
      <DeleteRecord
        id={c.id}
        action={deleteContact}
        noun="contact"
        blockedReason={describeContactRefs(refs)}
        archiveHint={c.archived ? "It's already archived and hidden from lists." : "Archive it instead to hide it from lists while keeping its history."}
      />
    </div>
  );
}
