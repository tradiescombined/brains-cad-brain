import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui";
import { DocumentsPanel, NotesPanel } from "@/components/records";
import { getLookups, getSettings, getTaxRates } from "@/lib/settings";
import { dialCodeForCountry } from "@/lib/phone";
import { parseMarkupLines } from "@/lib/calc";
import { date, money } from "@/lib/format";
import { DetailsForm } from "../_components/DetailsForm";
import { VersionsPanel } from "../_components/VersionsPanel";
import { listVersions } from "../_components/estimate-db";
import { setArchived } from "../actions";

export default async function EstimateDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [e] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!e) notFound();

  const [statuses, buildingTypes, sources, taxRates, versions] = await Promise.all([
    getLookups("estimate_status"),
    getLookups("building_type"),
    getLookups("client_source"),
    getTaxRates(),
    listVersions(id),
  ]);
  const clients = await db
    .select({
      id: schema.clients.id, name: schema.clients.name, email: schema.clients.email, mobile: schema.clients.mobile, phone: schema.clients.phone,
      address: schema.clients.address, cityTown: schema.clients.cityTown, state: schema.clients.state, postcode: schema.clients.postcode, source: schema.clients.source,
      archived: schema.clients.archived,
    })
    .from(schema.clients)
    .orderBy(asc(schema.clients.name));
  const leads = await db
    .select({ id: schema.leads.id, title: schema.leads.title, number: schema.leads.number, stage: schema.leads.stage, contactName: schema.leads.contactName, archived: schema.leads.archived })
    .from(schema.leads)
    .orderBy(asc(schema.leads.title));
  const markup = parseMarkupLines(e.markupLines);
  const path = `/estimates/${id}`;
  const s = (v: string | null | undefined) => v ?? "";

  return (
    <div className="space-y-5">
      {e.archived && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
          <span>This {e.isTemplate ? "template" : "estimate"} is archived and hidden from the main list.</span>
          <form action={setArchived}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="archived" value="0" />
            <button className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100">Unarchive</button>
          </form>
        </div>
      )}
      {e.isTemplate && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
          You’re editing a template. Changes here affect new estimates created from it, not existing ones.
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DetailsForm
            initial={{
              id, name: e.name, number: e.number, datePrepared: s(e.datePrepared), buildingType: s(e.buildingType), status: e.status,
              clientId: s(e.clientId), clientName: s(e.clientName), clientEmail: s(e.clientEmail), clientMobile: s(e.clientMobile), clientPhone: s(e.clientPhone),
              clientAddress: s(e.clientAddress), clientCityTown: s(e.clientCityTown), clientState: s(e.clientState), clientPostcode: s(e.clientPostcode), source: s(e.source),
              siteAddress: s(e.siteAddress), siteCityTown: s(e.siteCityTown), siteState: s(e.siteState), sitePostcode: s(e.sitePostcode),
              leadId: s(e.leadId), taxRateId: s(e.taxRateId), pcpsRedistribution: e.pcpsRedistribution, rounding: e.rounding, isTemplate: e.isTemplate,
            }}
            statuses={statuses.map((x) => x.name)}
            buildingTypes={buildingTypes.map((x) => x.name)}
            sources={sources.map((x) => x.name)}
            clients={clients.filter((c) => !c.archived || c.id === e.clientId)}
            leads={leads.filter((l) => !l.archived || l.id === e.leadId)}
            taxRates={taxRates.filter((t) => t.appliesTo === "income" || t.id === e.taxRateId).map((t) => ({ id: t.id, label: t.name }))}
            dialCode={dialCodeForCountry((await getSettings()).country)}
          />
        </div>
        <div className="space-y-5">
          <Card title="Summary">
            <dl className="space-y-1.5 text-sm" data-testid="summary">
              <Row k="Cost" v={money(e.costTotal)} />
              {markup.map((m, i) => <Row key={i} k={`${m.name} (${m.percent}%)`} v="" muted />)}
              <Row k="Markup" v={money(e.markupTotal)} />
              <Row k="Tax" v={money(e.taxTotal)} />
              <div className="flex justify-between border-t border-ink-100 pt-1.5 font-semibold">
                <dt>Quote total</dt>
                <dd className="tabular-nums" data-testid="summary-total">{money(e.quoteTotal)}</dd>
              </div>
            </dl>
            <dl className="mt-4 space-y-1 border-t border-ink-100 pt-3 text-xs text-ink-500">
              <Row k="Created" v={date(e.createdAt)} muted />
              <Row k="Last updated" v={date(e.updatedAt)} muted />
              {e.sentAt && <Row k="Sent" v={date(e.sentAt)} muted />}
              {e.acceptedAt && <Row k="Accepted" v={date(e.acceptedAt)} muted />}
            </dl>
          </Card>
          <VersionsPanel
            estimateId={id}
            currentTotal={money(e.quoteTotal)}
            versions={versions.map((v) => ({
              id: v.id, label: v.label, itemCount: v.itemCount, valid: v.valid, totalLabel: money(v.quoteTotal),
              dateLabel: new Date(v.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
            }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DocumentsPanel entityType="estimate" entityId={id} path={path} />
        <NotesPanel entityType="estimate" entityId={id} path={path} />
      </div>
    </div>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${muted ? "text-ink-500" : ""}`}>
      <dt className={muted ? "pl-0" : ""}>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
