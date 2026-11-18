import { currentPermissions } from "@/lib/permissions";
import Link from "next/link";
import { db, schema } from "@/db";
import { count } from "drizzle-orm";
import { Badge, EmptyState, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { cx, todayIso } from "@/lib/format";
import { getLookups } from "@/lib/settings";
import { matchesQuery, parseGroups, parseSort, qs, sortRows, type SortDir } from "../clients/list";
import { SortTh } from "../clients/SortTh";
import { insuranceStatus, stars } from "./fields";
import { InsuranceBadge } from "./InsuranceBadge";

export const metadata = { title: "Suppliers & trades" };

const SORTS = ["name", "type", "trade", "email", "mobile", "insurance", "rating", "orders"] as const;

type SP = { q?: string; type?: string; group?: string; trade?: string; insurance?: string; sort?: string; dir?: string; archived?: string; deleted?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const perm = await currentPermissions();
  const sp = await searchParams;
  const { sort, dir } = parseSort(sp.sort, sp.dir, SORTS, "name");
  const showArchived = sp.archived === "1";
  const today = todayIso();

  const [contacts, types, groups, poCounts] = await Promise.all([
    db.select().from(schema.contacts),
    getLookups("contact_type"),
    getLookups("contact_group"),
    db.select({ id: schema.purchaseOrders.supplierId, n: count() }).from(schema.purchaseOrders).groupBy(schema.purchaseOrders.supplierId),
  ]);
  const orders = new Map(poCounts.map((r) => [r.id, r.n]));
  const trades = [...new Set(contacts.map((c) => c.trade).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b));
  const archivedCount = contacts.filter((c) => c.archived).length;
  const attention = contacts.filter((c) => !c.archived && ["expired", "expiring"].includes(insuranceStatus(c.insuranceExpiry, today).state)).length;

  const rows = contacts
    .map((c) => ({ ...c, groupList: parseGroups(c.groups), ins: insuranceStatus(c.insuranceExpiry, today), orders: orders.get(c.id) ?? 0 }))
    .filter((c) => showArchived || !c.archived)
    .filter((c) => !sp.type || c.contactType === sp.type)
    .filter((c) => !sp.group || c.groupList.includes(sp.group))
    .filter((c) => !sp.trade || c.trade === sp.trade)
    .filter((c) => sp.insurance !== "attention" || c.ins.state === "expired" || c.ins.state === "expiring")
    .filter((c) => matchesQuery([c.name, c.businessName, c.trade, c.email, c.mobile, c.phone, c.cityTown, c.accountNumber, c.licenceNumber, c.groupList.join(" ")], sp.q));

  const getters: Record<(typeof SORTS)[number], (r: (typeof rows)[number]) => string | number | null> = {
    name: (r) => r.name,
    type: (r) => r.contactType,
    trade: (r) => r.trade,
    email: (r) => r.email,
    mobile: (r) => r.mobile,
    insurance: (r) => r.insuranceExpiry,
    rating: (r) => r.rating,
    orders: (r) => r.orders,
  };
  const sorted = sortRows(rows, getters[sort], dir);
  const filters = { q: sp.q, type: sp.type, group: sp.group, trade: sp.trade, insurance: sp.insurance, archived: showArchived ? "1" : undefined };
  const href = (k: string, d: SortDir) => `/contacts${qs({ ...filters, sort: k, dir: d })}`;
  const anyFilter = !!(sp.q || sp.type || sp.group || sp.trade || sp.insurance);

  return (
    <div>
      <PageHeader
        title="Suppliers & trades"
        subtitle={`${contacts.length - archivedCount} active${archivedCount ? ` · ${archivedCount} archived` : ""}`}
        actions={
          <>
            {perm["contacts.edit"] && <LinkButton href="/contacts/import" variant="secondary">Import CSV</LinkButton>
}            <a href={`/api/export/contacts${showArchived ? "?archived=1" : ""}`} className="inline-flex items-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-xs hover:bg-ink-50" download>
              Export CSV
            </a>
            {perm["contacts.edit"] && <LinkButton href="/contacts/new">New contact</LinkButton>
}          </>
        }
      />

      {sp.deleted && <div role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Contact deleted.</div>}
      {attention > 0 && sp.insurance !== "attention" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{attention} contact{attention === 1 ? " has" : "s have"} insurance that has expired or expires within 30 days.</span>
          <Link href={`/contacts${qs({ insurance: "attention" })}`} className="font-medium underline">Review</Link>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, trade, email, phone…" className="w-full sm:max-w-xs" aria-label="Search suppliers and trades" />
        <Select name="type" defaultValue={sp.type ?? ""} options={types.map((t) => t.name)} placeholder="All types" className="w-auto" aria-label="Filter by type" />
        <Select name="group" defaultValue={sp.group ?? ""} options={groups.map((g) => g.name)} placeholder="All groups" className="w-auto" aria-label="Filter by group" />
        <Select name="trade" defaultValue={sp.trade ?? ""} options={trades} placeholder="All trades" className="w-auto" aria-label="Filter by trade" />
        <Select name="insurance" defaultValue={sp.insurance ?? ""} options={[{ value: "attention", label: "Insurance expired/expiring" }]} placeholder="Any insurance" className="w-auto" aria-label="Filter by insurance" />
        {showArchived && <input type="hidden" name="archived" value="1" />}
        {sp.sort && <input type="hidden" name="sort" value={sort} />}
        {sp.dir && <input type="hidden" name="dir" value={dir} />}
        <button className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">Apply</button>
        {anyFilter && <Link href={`/contacts${qs({ archived: filters.archived })}`} className="py-1.5 text-sm text-ink-500 hover:text-ink-800">Clear</Link>}
        <Link href={`/contacts${qs({ ...filters, sort: sp.sort, dir: sp.dir, archived: showArchived ? undefined : "1" })}`} className="ml-auto py-1.5 text-sm font-medium text-brand-700 hover:underline">
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          title="No suppliers or trades yet"
          body="Keep your suppliers, subbies and consultants here with their insurance, licences and account details."
          action={perm["contacts.edit"] && <div className="flex gap-2"><LinkButton href="/contacts/import" variant="secondary">Import CSV</LinkButton><LinkButton href="/contacts/new">New contact</LinkButton></div>}
        />
      ) : sorted.length === 0 ? (
        <EmptyState title="No matching contacts" body="Try clearing a filter or searching for something else." action={<LinkButton href="/contacts" variant="secondary">Clear filters</LinkButton>} />
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh label="Name" k="name" sort={sort} dir={dir} href={href} />
              <SortTh label="Type" k="type" sort={sort} dir={dir} href={href} />
              <SortTh label="Trade" k="trade" sort={sort} dir={dir} href={href} className="hidden md:table-cell" />
              <SortTh label="Email" k="email" sort={sort} dir={dir} href={href} className="hidden lg:table-cell" />
              <SortTh label="Mobile" k="mobile" sort={sort} dir={dir} href={href} className="hidden xl:table-cell" />
              <SortTh label="Insurance" k="insurance" sort={sort} dir={dir} href={href} />
              <SortTh label="Rating" k="rating" sort={sort} dir={dir} href={href} className="hidden sm:table-cell" />
              <SortTh label="Orders" k="orders" sort={sort} dir={dir} href={href} className="hidden text-right sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className={cx("hover:bg-ink-50", c.archived && "text-ink-400")}>
                <Td>
                  <Link href={`/contacts/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700">{c.name}</Link>
                  {c.archived && <span className="ml-2"><Badge>Archived</Badge></span>}
                  {(c.businessName && c.businessName !== c.name) || c.groupList.length ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-500">
                      {c.businessName && c.businessName !== c.name && <span className="mr-1">{c.businessName}</span>}
                      {c.groupList.map((g) => <span key={g} className="rounded bg-ink-100 px-1.5 py-px text-[11px] text-ink-600">{g}</span>)}
                    </div>
                  ) : null}
                </Td>
                <Td className="text-ink-600">{c.contactType || <Dash />}</Td>
                <Td className="hidden md:table-cell">{c.trade || <Dash />}</Td>
                <Td className="hidden lg:table-cell">{c.email ? <a href={`mailto:${c.email}`} className="hover:text-brand-700">{c.email}</a> : <Dash />}</Td>
                <Td className="hidden whitespace-nowrap xl:table-cell">{c.mobile || c.phone || <Dash />}</Td>
                <Td><InsuranceBadge expiry={c.insuranceExpiry} today={today} /></Td>
                <Td className="hidden whitespace-nowrap text-amber-500 sm:table-cell" title={c.rating ? `${c.rating} of 5` : "Not rated"}>{c.rating ? stars(c.rating) : <Dash />}</Td>
                <Td className="hidden text-right tabular-nums sm:table-cell">{c.orders || <Dash />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {sorted.length > 0 && <p className="mt-2 text-xs text-ink-500">Showing {sorted.length} of {contacts.length} contacts</p>}
    </div>
  );
}

function Dash() {
  return <span className="text-ink-300">—</span>;
}
