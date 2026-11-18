import { currentPermissions } from "@/lib/permissions";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, EmptyState, Input, PageHeader, Select, Stat, Table, Td, Th, Button, statusTone } from "@/components/ui";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { addDays, date, num, todayIso } from "@/lib/format";
import { CatalogueFormModal } from "./CatalogueForm";
import { deleteCatalogue, duplicateCatalogueAction } from "./actions";
import { itemCounts, supplierOptions } from "./server";

export const metadata = { title: "Catalogues" };

/** Status shown to the user: a published list past its expiry date reads as Expired. */
function effectiveStatus(status: string, expiryDate: string | null) {
  return status === "Published" && expiryDate && expiryDate < todayIso() ? "Expired" : status;
}

export default async function CataloguesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const perm = await currentPermissions();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const statusFilter = sp.status ?? "";
  const [all, counts, suppliers] = await Promise.all([
    db.select().from(schema.catalogues).orderBy(asc(schema.catalogues.name)),
    itemCounts(),
    supplierOptions(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.value, s.label.replace(/ \([^)]*\)$/, "")]));
  const rows = all.map((c) => ({ ...c, shownStatus: effectiveStatus(c.status, c.expiryDate), items: counts.get(c.id) ?? 0, supplier: c.supplierId ? supplierName.get(c.supplierId) ?? "" : "" }));
  const filtered = rows.filter(
    (c) =>
      (!statusFilter || c.shownStatus === statusFilter) &&
      (!q || [c.name, c.shortCode, c.supplier, c.description].some((v) => v?.toLowerCase().includes(q))),
  );
  const totalItems = rows.reduce((s, r) => s + r.items, 0);
  const expiringSoon = rows.filter((r) => r.expiryDate && r.shownStatus === "Published" && r.expiryDate <= addDays(todayIso(), 30)).length;

  return (
    <div>
      <PageHeader
        title="Catalogues"
        subtitle="Your own rates and supplier price lists. Items here can be pulled straight into estimate costings."
        actions={<CatalogueFormModal triggerLabel="+ New catalogue" suppliers={suppliers} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Catalogues" value={rows.length} />
        <Stat label="Cost items" value={num(totalItems, 0)} />
        <Stat label="Supplier lists" value={rows.filter((r) => r.supplierId).length} />
        <Stat label="Expiring in 30 days" value={expiringSoon} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No catalogues yet"
          body="Create a catalogue for your own labour and material rates, or one per supplier and import their price list from CSV."
          action={<CatalogueFormModal triggerLabel="Create your first catalogue" suppliers={suppliers} />}
        />
      ) : (
        <>
          <form className="mb-3 flex flex-wrap items-center gap-2" role="search">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search catalogues…" className="w-64" aria-label="Search catalogues" />
            <Select name="status" defaultValue={statusFilter} options={["Draft", "Published", "Expired", "Archived"]} placeholder="All statuses" className="w-40" aria-label="Status filter" />
            <Button type="submit" variant="secondary">Filter</Button>
            {(q || statusFilter) && <Link href="/catalogues" className="text-sm text-ink-500 hover:text-brand-700">Clear</Link>}
          </form>
          {filtered.length === 0 ? (
            <EmptyState title="No catalogues match" body="Try a different search or status." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Catalogue</Th>
                  <Th className="hidden md:table-cell">Supplier</Th>
                  <Th className="text-right">Items</Th>
                  <Th>Status</Th>
                  <Th className="hidden lg:table-cell">Effective</Th>
                  <Th className="hidden lg:table-cell">Expires</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50/60" data-testid="catalogue-row">
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: c.colour }} aria-hidden />
                        <div className="min-w-0">
                          <Link href={`/catalogues/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700">{c.name}</Link>
                          <div className="flex items-center gap-2 text-xs text-ink-500">
                            {c.shortCode && <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-600">{c.shortCode}</span>}
                            {c.description && <span className="truncate max-w-xs">{c.description}</span>}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td className="hidden md:table-cell">{c.supplier || <span className="text-ink-400">Own list</span>}</Td>
                    <Td className="text-right tabular-nums">{num(c.items, 0)}</Td>
                    <Td><Badge tone={statusTone(c.shownStatus)}>{c.shownStatus}</Badge></Td>
                    <Td className="hidden lg:table-cell whitespace-nowrap">{date(c.effectiveDate) || <span className="text-ink-400">—</span>}</Td>
                    <Td className="hidden lg:table-cell whitespace-nowrap">{date(c.expiryDate) || <span className="text-ink-400">—</span>}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <CatalogueFormModal
                          triggerLabel="Edit"
                          variant="ghost"
                          suppliers={suppliers}
                          initial={{ id: c.id, name: c.name, shortCode: c.shortCode, description: c.description, supplierId: c.supplierId, colour: c.colour, status: c.status, effectiveDate: c.effectiveDate, expiryDate: c.expiryDate }}
                        />
                        {perm["catalogues.edit"] && <><form action={duplicateCatalogueAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button type="submit" variant="ghost">Duplicate</Button>
                        </form>
                        <form action={deleteCatalogue}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmSubmit confirmText={c.items ? `Delete with ${c.items} item${c.items === 1 ? "" : "s"}?` : "Confirm delete"}>Delete</ConfirmSubmit>
                        </form></>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

