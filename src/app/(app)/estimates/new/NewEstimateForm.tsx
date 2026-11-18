"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Card, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx } from "@/lib/format";
import { createEstimate } from "../actions";
import { ClientPicker, type ClientOption } from "../_components/ClientPicker";

export interface TemplateCard {
  id: string;
  name: string;
  buildingType: string | null;
  totalLabel: string;
  itemCount: number;
}

export function NewEstimateForm({
  templates,
  clients,
  buildingTypes,
  initialTemplate,
}: {
  templates: TemplateCard[];
  clients: ClientOption[];
  buildingTypes: string[];
  initialTemplate: string;
}) {
  const [state, action] = useActionState(createEstimate, undefined);
  const [templateId, setTemplateId] = useState(initialTemplate);
  const [buildingType, setBuildingType] = useState(templates.find((t) => t.id === initialTemplate)?.buildingType ?? "");
  const fe = state?.fieldErrors ?? {};
  const v = state?.values ?? {};

  function pickTemplate(t: TemplateCard | null) {
    setTemplateId(t?.id ?? "");
    if (t?.buildingType && !buildingType) setBuildingType(t.buildingType);
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="templateId" value={templateId} />
      {state?.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}

      <Card title="1 · Starting point">
        <div role="radiogroup" aria-label="Starting point" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StartCard selected={!templateId} onSelect={() => pickTemplate(null)} title="Blank estimate" subtitle="Empty costings with your default markup and tax." badge="Blank" />
          {templates.map((t) => (
            <StartCard
              key={t.id}
              selected={templateId === t.id}
              onSelect={() => pickTemplate(t)}
              title={t.name}
              subtitle={`${t.itemCount} ${t.itemCount === 1 ? "item" : "items"} · ${t.totalLabel}`}
              badge={t.buildingType ?? "Template"}
            />
          ))}
        </div>
        {templates.length === 0 && (
          <p className="mt-3 text-xs text-ink-500">No templates yet. Open any estimate and choose “Save as template” to reuse its costings here.</p>
        )}
        {fe.templateId && <p className="mt-2 text-xs text-red-600">{fe.templateId}</p>}
      </Card>

      <Card title="2 · Estimate details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Estimate name *" className="sm:col-span-2">
            <Input name="name" defaultValue={v.name} required maxLength={200} autoFocus placeholder="e.g. Smith residence – rear extension" aria-invalid={!!fe.name} className={fe.name ? "border-red-400" : ""} />
            {fe.name && <span className="mt-1 block text-xs text-red-600">{fe.name}</span>}
          </Field>
          <Field label="Building type">
            <Select name="buildingType" options={buildingTypes} placeholder="Not set" value={buildingType} onChange={(e) => setBuildingType(e.target.value)} />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-600">Client</span>
            <ClientPicker clients={clients} error={fe.clientName} defaultName={v.clientName} defaultClientId={v.clientId} />
          </div>
        </div>
      </Card>

      <Card title="3 · Site address">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Field label="Street address" className="sm:col-span-6">
            <Input name="siteAddress" defaultValue={v.siteAddress} placeholder="Leave blank to use the client's address" />
          </Field>
          <Field label="City / town" className="sm:col-span-3"><Input name="siteCityTown" defaultValue={v.siteCityTown} /></Field>
          <Field label="State" className="sm:col-span-1"><Input name="siteState" defaultValue={v.siteState} placeholder="QLD" /></Field>
          <Field label="Postcode" className="sm:col-span-2"><Input name="sitePostcode" defaultValue={v.sitePostcode} inputMode="numeric" /></Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link href="/estimates" className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100">Cancel</Link>
        <SubmitButton pendingText="Creating…">{templateId ? "Create from template" : "Create estimate"}</SubmitButton>
      </div>
    </form>
  );
}

function StartCard({ selected, onSelect, title, subtitle, badge }: { selected: boolean; onSelect: () => void; title: string; subtitle: string; badge: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "flex min-h-24 flex-col items-start rounded-lg border p-3 text-left transition-colors",
        selected ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500/30" : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50",
      )}
    >
      <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", selected ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600")}>{badge}</span>
      <span className="mt-2 line-clamp-2 text-sm font-semibold text-ink-900">{title}</span>
      <span className="mt-0.5 text-xs text-ink-500">{subtitle}</span>
    </button>
  );
}
