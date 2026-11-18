import Link from "next/link";
import { Badge, Button, LinkButton, statusTone } from "@/components/ui";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { date, num, todayIso } from "@/lib/format";
import { CatalogueFormModal } from "../CatalogueForm";
import { deleteCatalogue, duplicateCatalogueAction } from "../actions";
import { supplierOptions, type Catalogue } from "../server";

/** Catalogue title block + actions, shared by the item grid and import pages. */
export async function CatalogueHeader({ catalogue: c, itemCount, compact }: { catalogue: Catalogue; itemCount: number; compact?: boolean }) {
  const suppliers = await supplierOptions();
  const supplier = suppliers.find((s) => s.value === c.supplierId)?.label.replace(/ \([^)]*\)$/, "");
  const status = c.status === "Published" && c.expiryDate && c.expiryDate < todayIso() ? "Expired" : c.status;
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Link href={compact ? `/catalogues/${c.id}` : "/catalogues"} className="text-xs font-medium text-ink-500 hover:text-brand-700">
          ← {compact ? c.name : "Catalogues"}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: c.colour }} aria-hidden />
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-900">{compact ? "Import items" : c.name}</h1>
          {!compact && c.shortCode && <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs text-ink-600">{c.shortCode}</span>}
          {!compact && <Badge tone={statusTone(status)}>{status}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-500">
          <span>{supplier ? `Supplier: ${supplier}` : "Own price list"}</span>
          <span className="tabular-nums">{num(itemCount, 0)} items</span>
          {c.effectiveDate && <span>From {date(c.effectiveDate)}</span>}
          {c.expiryDate && <span>Expires {date(c.expiryDate)}</span>}
        </div>
        {!compact && c.description && <p className="mt-1 max-w-2xl text-sm text-ink-600">{c.description}</p>}
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <CatalogueFormModal
            triggerLabel="Edit details"
            variant="secondary"
            suppliers={suppliers}
            initial={{ id: c.id, name: c.name, shortCode: c.shortCode, description: c.description, supplierId: c.supplierId, colour: c.colour, status: c.status, effectiveDate: c.effectiveDate, expiryDate: c.expiryDate }}
          />
          <LinkButton href={`/catalogues/${c.id}/import`} variant="secondary">Import CSV</LinkButton>
          <a href={`/api/export/catalogues/${c.id}`} className="inline-flex items-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-xs hover:bg-ink-50" download>
            Export CSV
          </a>
          <form action={duplicateCatalogueAction}>
            <input type="hidden" name="id" value={c.id} />
            <Button type="submit" variant="secondary">Duplicate</Button>
          </form>
          <form action={deleteCatalogue}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="redirect" value="1" />
            <ConfirmSubmit confirmText={itemCount ? `Delete with ${itemCount} items?` : "Confirm delete"}>Delete</ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  );
}
