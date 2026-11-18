"use client";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx } from "@/lib/format";
import { LEAD_STAGES, NEW_CLIENT, type LeadFormState, type LeadFormValues, type LeadInput } from "./lib";

export type ClientOption = { id: string; name: string; email: string | null; phone: string | null; mobile: string | null; address: string | null; cityTown: string | null; state: string | null; postcode: string | null };

type Props = {
  action: (prev: LeadFormState, fd: FormData) => Promise<LeadFormState>;
  initial: LeadFormValues;
  sources: string[];
  buildingTypes: string[];
  clients: ClientOption[];
  users: { id: string; name: string }[];
  submitLabel: string;
  cancel?: ReactNode;
};

const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [...list, current] : list);

export function LeadForm({ action, initial, sources, buildingTypes, clients, users, submitLabel, cancel }: Props) {
  const [state, formAction] = useActionState(action, {} as LeadFormState);
  // On validation errors keep what the user typed; otherwise the server record is the source of truth.
  const v = state.errors && state.values ? state.values : initial;
  const err = state.errors ?? {};
  const [stage, setStage] = useState(v.stage);
  const [clientId, setClientId] = useState(v.clientId);
  const formRef = useRef<HTMLFormElement>(null);

  // Remount fields (and resync controlled selects) whenever the values change, e.g. after the
  // record is updated elsewhere on the page (Mark won, stage moves) or a save returns errors.
  const formKey = JSON.stringify(v);
  const [prevKey, setPrevKey] = useState(formKey);
  if (prevKey !== formKey) {
    setPrevKey(formKey);
    setStage(v.stage);
    setClientId(v.clientId);
  }

  function onClientChange(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    const f = formRef.current;
    if (!c || !f) return;
    const fill = (name: string, val: string | null) => {
      const el = f.elements.namedItem(name) as HTMLInputElement | null;
      if (el && !el.value && val) el.value = val;
    };
    fill("contactName", c.name);
    fill("email", c.email);
    fill("phone", c.phone ?? c.mobile);
    fill("address", c.address);
    fill("cityTown", c.cityTown);
    fill("state", c.state);
    fill("postcode", c.postcode);
  }

  const bad = (name: keyof LeadInput) => (err[name] ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : undefined);

  return (
    <form ref={formRef} action={formAction} key={formKey} className="space-y-6" noValidate>
      {state.message && (
        <div role="status" className={cx("rounded-md px-3 py-2 text-sm", state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
          {state.message}
        </div>
      )}

      <Section title="Lead">
        <F err={err} name="title" label="Title *" className="sm:col-span-2">
          <Input name="title" defaultValue={v.title} placeholder="e.g. Rear deck and pergola" required className={bad("title")} />
        </F>
        <F err={err} name="stage" label="Stage">
          <Select name="stage" value={stage} onChange={(e) => setStage(e.target.value)} options={[...LEAD_STAGES]} />
        </F>
        <F err={err} name="buildingType" label="Building type">
          <Select name="buildingType" defaultValue={v.buildingType} options={withCurrent(buildingTypes, v.buildingType)} placeholder="— Select —" />
        </F>
        {stage === "Lost" && (
          <F err={err} name="lostReason" label="Lost reason" className="sm:col-span-2">
            <Input name="lostReason" defaultValue={v.lostReason} placeholder="e.g. Went with another builder" className={bad("lostReason")} />
          </F>
        )}
        <F err={err} name="description" label="Description" className="sm:col-span-2">
          <Textarea name="description" defaultValue={v.description} rows={3} placeholder="Scope, budget expectations, anything the client mentioned…" />
        </F>
      </Section>

      <Section title="Contact & client">
        <F err={err} name="contactName" label="Contact name">
          <Input name="contactName" defaultValue={v.contactName} autoComplete="off" />
        </F>
        <F err={err} name="clientId" label="Client" hint={clientId === NEW_CLIENT ? "A new client will be created from the contact and site details when you save." : "Link an existing client, or create one from this contact."}>
          <Select
            name="clientId"
            value={clientId}
            onChange={(e) => onClientChange(e.target.value)}
            placeholder="— Not linked —"
            options={[{ value: NEW_CLIENT, label: "+ Create new client from contact" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </F>
        <F err={err} name="email" label="Email">
          <Input name="email" type="email" defaultValue={v.email} autoComplete="off" className={bad("email")} />
        </F>
        <F err={err} name="phone" label="Phone">
          <Input name="phone" type="tel" defaultValue={v.phone} autoComplete="off" />
        </F>
      </Section>

      <Section title="Site">
        <F err={err} name="address" label="Street address" className="sm:col-span-2">
          <Input name="address" defaultValue={v.address} autoComplete="off" />
        </F>
        <F err={err} name="cityTown" label="Suburb / town">
          <Input name="cityTown" defaultValue={v.cityTown} autoComplete="off" />
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F err={err} name="state" label="State">
            <Input name="state" defaultValue={v.state} autoComplete="off" />
          </F>
          <F err={err} name="postcode" label="Postcode">
            <Input name="postcode" defaultValue={v.postcode} inputMode="numeric" autoComplete="off" />
          </F>
        </div>
      </Section>

      <Section title="Pipeline">
        <F err={err} name="estimatedValue" label="Estimated value (AUD)">
          <Input name="estimatedValue" defaultValue={v.estimatedValue} inputMode="decimal" placeholder="0" className={cx("text-right tabular-nums", bad("estimatedValue"))} />
        </F>
        <F err={err} name="probability" label="Probability %">
          <Input name="probability" type="number" min={0} max={100} step={5} defaultValue={v.probability} className={cx("text-right tabular-nums", bad("probability"))} />
        </F>
        <F err={err} name="source" label="Source">
          <Select name="source" defaultValue={v.source} options={withCurrent(sources, v.source)} placeholder="— Select —" />
        </F>
        <F err={err} name="assignedTo" label="Assigned to">
          <Select name="assignedTo" defaultValue={v.assignedTo} options={users.map((u) => ({ value: u.id, label: u.name }))} placeholder="— Unassigned —" />
        </F>
        <F err={err} name="followUpDate" label="Follow-up date">
          <Input name="followUpDate" type="date" defaultValue={v.followUpDate} className={bad("followUpDate")} />
        </F>
        <F err={err} name="expectedStart" label="Expected start">
          <Input name="expectedStart" type="date" defaultValue={v.expectedStart} className={bad("expectedStart")} />
        </F>
      </Section>

      <div className="flex items-center justify-end gap-2 border-t border-ink-100 pt-4">
        {cancel}
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function F({ err, name, label, hint, className, children }: { err: NonNullable<LeadFormState["errors"]>; name: keyof LeadInput; label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <Field label={label} hint={err[name] ? undefined : hint} className={className}>
      {children}
      {err[name] && (
        <span role="alert" className="mt-1 block text-xs font-medium text-red-600">
          {err[name]}
        </span>
      )}
    </Field>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
