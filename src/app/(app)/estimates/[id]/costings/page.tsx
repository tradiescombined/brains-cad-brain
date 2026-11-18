import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadEstimate } from "@/lib/estimates";
import { takeoffSummaries } from "@/lib/takeoffs";
import { getLookups, getTaxRates } from "@/lib/settings";
import { taxableDefaults } from "@/lib/tax-defaults";
import { parseMarkupLines } from "@/lib/calc";
import { CostingsGrid } from "./CostingsGrid";
import { ReadOnlyCostings } from "./ReadOnlyCostings";
import { currentPermissions } from "@/lib/permissions";

export const metadata = { title: "Costings" };

export default async function CostingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await loadEstimate(id);
  if (!l) notFound();
  const p = await currentPermissions();
  if (!p["estimates.edit"]) return <ReadOnlyCostings l={l} showCosts={p["costs.view"]} />;
  const [uoms, contacts, catalogues, catCategories, taxRates] = await Promise.all([
    getLookups("unit_measure"),
    db
      .select({ id: schema.contacts.id, name: schema.contacts.name, businessName: schema.contacts.businessName, contactType: schema.contacts.contactType })
      .from(schema.contacts)
      .where(eq(schema.contacts.archived, false))
      .orderBy(asc(schema.contacts.name)),
    db.select({ id: schema.catalogues.id, name: schema.catalogues.name, status: schema.catalogues.status }).from(schema.catalogues).orderBy(asc(schema.catalogues.name)),
    db
      .select({
        id: schema.catalogueCategories.id,
        catalogueId: schema.catalogueCategories.catalogueId,
        parentId: schema.catalogueCategories.parentId,
        name: schema.catalogueCategories.name,
      })
      .from(schema.catalogueCategories)
      .orderBy(asc(schema.catalogueCategories.sortOrder), asc(schema.catalogueCategories.name)),
    getTaxRates(),
  ]);
  const e = l.estimate;
  return (
    <CostingsGrid
      estimateId={id}
      items={l.items}
      measurements={takeoffSummaries(l.takeoffs, l.measurements)}
      markupLines={parseMarkupLines(e.markupLines)}
      taxRate={l.taxRate}
      taxLabel={l.taxRateRow ? (l.taxRateRow.name.includes("%") ? l.taxRateRow.name : `${l.taxRateRow.name} ${Math.round(l.taxRateRow.rate * 1000) / 10}%`) : "No tax"}
      redistribution={e.pcpsRedistribution}
      rounding={e.rounding}
      storedTotals={{ costTotal: e.costTotal, markupTotal: e.markupTotal, taxTotal: e.taxTotal, quoteTotal: e.quoteTotal }}
      uoms={uoms.map((u) => u.name)}
      suppliers={contacts.map((c) => ({ id: c.id, name: c.businessName || c.name, type: c.contactType }))}
      catalogues={catalogues}
      catalogueCategories={catCategories}
      taxDefaults={taxableDefaults(taxRates)}
    />
  );
}
