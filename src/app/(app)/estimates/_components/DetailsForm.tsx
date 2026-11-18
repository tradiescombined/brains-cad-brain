"use client";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { Card, Field, Input, Select } from "@/components/ui";
import { cx } from "@/lib/format";
import { saveDetails } from "../[id]/details-actions";
import type { ClientOption } from "./ClientPicker";
import { PCPS_OPTIONS, ROUNDING_OPTIONS } from "./logic";

export interface DetailsValues {
  id: string;
  name: string;
  number: string;
  datePrepared: string;
  buildingType: string;
  status: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  clientPhone: string;
  clientAddress: string;
  clientCityTown: string;
  clientState: string;
  clientPostcode: string;
  source: string;
  siteAddress: string;
  siteCityTown: string;
  siteState: string;
  sitePostcode: string;
  leadId: string;
  taxRateId: string;
  pcpsRedistribution: string;
  rounding: string;
  isTemplate: boolean;
}

export interface LeadOption {
  id: string;
  title: string;
  number: string | null;
  stage: string;
  contactName: string | null;
}

type ClientKey = "clientName" | "clientEmail" | "clientMobile" | "clientPhone" | "clientAddress" | "clientCityTown" | "clientState" | "clientPostcode" | "source";
type SiteKey = "siteAddress" | "siteCityTown" | "siteState" | "sitePostcode";
const SITE_FROM_CLIENT: Record<SiteKey, ClientKey> = { siteAddress: "clientAddress", siteCityTown: "clientCityTown", siteState: "clientState", sitePostcode: "clientPostcode" };

export function DetailsForm({
  initial,
  statuses,
  buildingTypes,
  sources,
  clients,
  leads,
  taxRates,
}: {
  initial: DetailsValues;
  statuses: string[];
  buildingTypes: string[];
  sources: string[];
  clients: ClientOption[];
  leads: LeadOption[];
  taxRates: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveDetails, undefined);
  const fe = state?.fieldErrors ?? {};
  const [clientLink, setClientLink] = useState(initial.clientId);
  const [c, setC] = useState<Record<ClientKey, string>>({
    clientName: initial.clientName, clientEmail: initial.clientEmail, clientMobile: initial.clientMobile, clientPhone: initial.clientPhone,
    clientAddress: initial.clientAddress, clientCityTown: initial.clientCityTown, clientState: initial.clientState, clientPostcode: initial.clientPostcode, source: initial.source,
  });
  const [site, setSite] = useState<Record<SiteKey, string>>({
    siteAddress: initial.siteAddress, siteCityTown: initial.siteCityTown, siteState: initial.siteState, sitePostcode: initial.sitePostcode,
  });
  const hasClientAddr = !!(initial.clientAddress || initial.clientCityTown || initial.clientPostcode);
  const [siteSame, setSiteSame] = useState(
    hasClientAddr && (Object.keys(SITE_FROM_CLIENT) as SiteKey[]).every((k) => (initial[k] || "") === (initial[SITE_FROM_CLIENT[k]] || "")),
  );
  const [leadId, setLeadId] = useState(initial.leadId);
  const [editedAt, setEditedAt] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(0);
  const showSaved = !!state?.at && state.at !== dismissedAt;
  const dirty = editedAt > (state?.ok && state.at ? state.at : 0);

  useEffect(() => {
    if (!state?.at) return;
    const at = state.at;
    const t = setTimeout(() => setDismissedAt(at), 4000);
    return () => clearTimeout(t);
  }, [state?.at]);

  const linkedClient = clients.find((x) => x.id === clientLink);
  const lead = leads.find((l) => l.id === leadId);

  function pickClient(id: string) {
    setClientLink(id);
    const found = clients.find((x) => x.id === id);
    if (found) {
      setC({
        clientName: found.name, clientEmail: found.email ?? "", clientMobile: found.mobile ?? "", clientPhone: found.phone ?? "",
        clientAddress: found.address ?? "", clientCityTown: found.cityTown ?? "", clientState: found.state ?? "", clientPostcode: found.postcode ?? "",
        source: found.source ?? "",
      });
    }
  }

  const setClientField = (k: ClientKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC((p) => ({ ...p, [k]: e.target.value }));
  const siteValue = (k: SiteKey) => (siteSame ? c[SITE_FROM_CLIENT[k]] : site[k]);
  const err = (k: string) => fe[k] && <span className="mt-1 block text-xs text-red-600">{fe[k]}</span>;
  const errCls = (k: string) => (fe[k] ? "border-red-400" : "");

  return (
    <form
      noValidate
      onChange={() => setEditedAt(Date.now())}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-5"
      aria-label="Estimate details"
    >
      <input type="hidden" name="id" value={initial.id} />

      <Card title={initial.isTemplate ? "Template" : "Estimate"}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Field label="Name *" className="sm:col-span-4">
            <Input name="name" defaultValue={initial.name} maxLength={200} className={errCls("name")} aria-invalid={!!fe.name} />
            {err("name")}
          </Field>
          <Field label="Number *" className="sm:col-span-2">
            <Input name="number" defaultValue={initial.number} maxLength={40} className={cx("font-mono", errCls("number"))} aria-invalid={!!fe.number} />
            {err("number")}
          </Field>
          <Field label="Date prepared" className="sm:col-span-2">
            <Input type="date" name="datePrepared" defaultValue={initial.datePrepared} className={errCls("datePrepared")} />
            {err("datePrepared")}
          </Field>
          <Field label="Building type" className="sm:col-span-2">
            <Select name="buildingType" defaultValue={initial.buildingType} options={withCurrent(buildingTypes, initial.buildingType)} placeholder="Not set" />
          </Field>
          {initial.isTemplate ? (
            <input type="hidden" name="status" value={initial.status} />
          ) : (
            <Field label="Status" className="sm:col-span-2">
              <Select name="status" key={initial.status} defaultValue={initial.status} options={withCurrent(statuses, initial.status)} className={errCls("status")} />
              {err("status")}
            </Field>
          )}
        </div>
      </Card>

      {!initial.isTemplate && (
        <Card title="Client">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Field label="Linked client record" className="sm:col-span-3" hint={clientLink === "__new" ? "A client record will be created from the details below when you save." : undefined}>
              <Select
                name="clientLink"
                value={clientLink}
                onChange={(e) => pickClient(e.target.value)}
                options={[...clients.map((x) => ({ value: x.id, label: x.name })), { value: "__new", label: "+ Create new client from these details" }]}
                placeholder="Not linked"
                className={errCls("clientLink")}
              />
              {err("clientLink")}
            </Field>
            <div className="flex items-end text-xs text-ink-500 sm:col-span-3">
              {linkedClient ? (
                <span>
                  Picking a client copies their details below. Edits here only change this estimate.{" "}
                  <Link href={`/clients/${linkedClient.id}`} className="font-medium text-brand-700 hover:underline">Open client</Link>
                </span>
              ) : (
                <span>Details below are saved on this estimate only.</span>
              )}
            </div>
            <Field label="Name" className="sm:col-span-3">
              <Input name="clientName" value={c.clientName} onChange={setClientField("clientName")} className={errCls("clientName")} />
              {err("clientName")}
            </Field>
            <Field label="Email" className="sm:col-span-3">
              <Input type="email" name="clientEmail" value={c.clientEmail} onChange={setClientField("clientEmail")} className={errCls("clientEmail")} />
              {err("clientEmail")}
            </Field>
            <Field label="Mobile" className="sm:col-span-2"><Input name="clientMobile" type="tel" value={c.clientMobile} onChange={setClientField("clientMobile")} /></Field>
            <Field label="Phone" className="sm:col-span-2"><Input name="clientPhone" type="tel" value={c.clientPhone} onChange={setClientField("clientPhone")} /></Field>
            <Field label="Source" className="sm:col-span-2">
              <Select name="source" value={c.source} onChange={setClientField("source")} options={withCurrent(sources, c.source)} placeholder="Not set" />
            </Field>
            <Field label="Address" className="sm:col-span-6"><Input name="clientAddress" value={c.clientAddress} onChange={setClientField("clientAddress")} /></Field>
            <Field label="City / town" className="sm:col-span-3"><Input name="clientCityTown" value={c.clientCityTown} onChange={setClientField("clientCityTown")} /></Field>
            <Field label="State" className="sm:col-span-1"><Input name="clientState" value={c.clientState} onChange={setClientField("clientState")} /></Field>
            <Field label="Postcode" className="sm:col-span-2"><Input name="clientPostcode" value={c.clientPostcode} onChange={setClientField("clientPostcode")} /></Field>
          </div>
        </Card>
      )}

      {!initial.isTemplate && (
        <Card title="Work location">
          <label className="mb-3 flex items-center gap-2 text-sm text-ink-800">
            <input type="checkbox" name="siteSame" checked={siteSame} onChange={(e) => setSiteSame(e.target.checked)} className="size-4 accent-brand-600" />
            Same as client address
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Field label="Site address" className="sm:col-span-6">
              <Input name="siteAddress" value={siteValue("siteAddress")} disabled={siteSame} onChange={(e) => setSite((p) => ({ ...p, siteAddress: e.target.value }))} />
            </Field>
            <Field label="City / town" className="sm:col-span-3">
              <Input name="siteCityTown" value={siteValue("siteCityTown")} disabled={siteSame} onChange={(e) => setSite((p) => ({ ...p, siteCityTown: e.target.value }))} />
            </Field>
            <Field label="State" className="sm:col-span-1">
              <Input name="siteState" value={siteValue("siteState")} disabled={siteSame} onChange={(e) => setSite((p) => ({ ...p, siteState: e.target.value }))} />
            </Field>
            <Field label="Postcode" className="sm:col-span-2">
              <Input name="sitePostcode" value={siteValue("sitePostcode")} disabled={siteSame} onChange={(e) => setSite((p) => ({ ...p, sitePostcode: e.target.value }))} />
            </Field>
          </div>
        </Card>
      )}

      {!initial.isTemplate && (
        <Card title="Lead">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Linked lead">
              <Select
                name="leadId"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                options={leads.map((l) => ({ value: l.id, label: `${l.number ? l.number + " · " : ""}${l.title}` }))}
                placeholder="No lead"
                className={errCls("leadId")}
              />
              {err("leadId")}
            </Field>
            {lead ? (
              <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm" data-testid="linked-lead">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">{lead.title}</Link>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink-600 ring-1 ring-ink-200">{lead.stage}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-500">{[lead.number, lead.contactName].filter(Boolean).join(" · ") || "Lead"}</div>
              </div>
            ) : (
              <p className="self-end text-xs text-ink-500">Link the lead this estimate came from to keep the pipeline in step.</p>
            )}
          </div>
        </Card>
      )}

      <Card title="Pricing settings">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Tax rate" hint="Applied to taxable items on the quote.">
            <Select name="taxRateId" defaultValue={initial.taxRateId} options={taxRates.map((t) => ({ value: t.id, label: t.label }))} placeholder="No tax" className={errCls("taxRateId")} />
            {err("taxRateId")}
          </Field>
          <Field label="Quote total rounding" hint="Rounds the final total up; the difference shows as an adjustment.">
            <Select name="rounding" defaultValue={initial.rounding} options={ROUNDING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-xs font-medium text-ink-600">PC / PS markup on the quote</legend>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {PCPS_OPTIONS.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-md border border-ink-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name="pcpsRedistribution" value={o.value} defaultChecked={initial.pcpsRedistribution === o.value} className="mt-0.5 accent-brand-600" />
                  <span>
                    <span className="block font-medium text-ink-900">{o.label}</span>
                    <span className="block text-xs text-ink-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Only changes how prices are shown; the quote total stays the same.</p>
          </fieldset>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 rounded-lg border border-ink-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <span role="status" aria-live="polite" className="mr-auto text-sm">
          {showSaved && state?.ok && <span className="font-medium text-emerald-700">✓ {state.message}</span>}
          {showSaved && state?.error && <span className="font-medium text-red-700">{state.error}</span>}
          {!showSaved && dirty && <span className="text-ink-500">Unsaved changes</span>}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md border border-transparent bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}

function withCurrent(list: string[], current: string) {
  return current && !list.includes(current) ? [current, ...list] : list;
}
