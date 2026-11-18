"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Card, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import type { FormState } from "../clients/actions";
import { AU_STATES, F, FormMessage } from "../clients/FormBits";
import { withCurrent } from "../clients/list";

export type ContactValues = Partial<Record<string, string | number | boolean | null | string[]>>;

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: ContactValues;
  types: string[];
  groups: string[];
  submitLabel: string;
  cancelHref: string;
};

export function ContactForm({ action, initial, types, groups, submitLabel, cancelHref }: Props) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const val = (k: string): string => {
    const sv = state.values?.[k];
    if (sv !== undefined) return Array.isArray(sv) ? sv[0] ?? "" : sv;
    const iv = initial[k];
    return iv === null || iv === undefined || Array.isArray(iv) ? "" : String(iv);
  };
  const selectedGroups: string[] = state.values
    ? ([] as string[]).concat(state.values.groups ?? [])
    : Array.isArray(initial.groups) ? initial.groups : [];
  const allGroups = [...groups, ...selectedGroups.filter((g) => !groups.includes(g))];
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage ok={state.ok} msg={state.message} />
      <div key={state.savedAt ?? 0} className="grid gap-4 lg:grid-cols-2">
        <Card title="Supplier / trade">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Name *" error={e.name} hint="Person or trading name shown in lists">
              <Input name="name" defaultValue={val("name")} autoFocus placeholder="e.g. Coastal Roofing" />
            </F>
            <F label="Business name" error={e.businessName}>
              <Input name="businessName" defaultValue={val("businessName")} />
            </F>
            <F label="Contact type" error={e.contactType}>
              <Select name="contactType" defaultValue={val("contactType")} options={withCurrent(types, val("contactType"))} placeholder="Not set" />
            </F>
            <F label="Trade" error={e.trade}>
              <Input name="trade" defaultValue={val("trade")} placeholder="e.g. Electrician" />
            </F>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-xs font-medium text-ink-600">Groups</legend>
              {allGroups.length === 0 ? (
                <p className="text-xs text-ink-400">No contact groups set up yet.</p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {allGroups.map((g) => (
                    <label key={g} className="flex items-center gap-1.5 text-sm text-ink-800">
                      <input type="checkbox" name="groups" value={g} defaultChecked={selectedGroups.includes(g)} className="size-4 accent-brand-600" />
                      {g}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        </Card>
        <Card title="Contact details">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Email" error={e.email} className="sm:col-span-2">
              <Input name="email" type="email" defaultValue={val("email")} placeholder="orders@example.com" />
            </F>
            <F label="Mobile" error={e.mobile}><Input name="mobile" type="tel" defaultValue={val("mobile")} /></F>
            <F label="Phone" error={e.phone}><Input name="phone" type="tel" defaultValue={val("phone")} /></F>
            <F label="Website" error={e.website} className="sm:col-span-2"><Input name="website" defaultValue={val("website")} placeholder="example.com.au" /></F>
          </div>
        </Card>
        <Card title="Address">
          <div className="grid gap-3 sm:grid-cols-6">
            <F label="Street address" error={e.address} className="sm:col-span-6"><Input name="address" defaultValue={val("address")} /></F>
            <F label="City / town" error={e.cityTown} className="sm:col-span-3"><Input name="cityTown" defaultValue={val("cityTown")} /></F>
            <F label="State" error={e.state} className="sm:col-span-1">
              <Select name="state" defaultValue={val("state")} options={withCurrent(AU_STATES, val("state"))} placeholder="—" />
            </F>
            <F label="Postcode" error={e.postcode} className="sm:col-span-2"><Input name="postcode" defaultValue={val("postcode")} inputMode="numeric" /></F>
          </div>
        </Card>
        <Card title="Compliance & accounts">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="ABN" error={e.businessNumber} hint="11 digits"><Input name="businessNumber" defaultValue={val("businessNumber")} inputMode="numeric" /></F>
            <F label="Licence number" error={e.licenceNumber}><Input name="licenceNumber" defaultValue={val("licenceNumber")} /></F>
            <F label="Insurance expiry" error={e.insuranceExpiry} hint="We flag it 30 days before expiry"><Input name="insuranceExpiry" type="date" defaultValue={val("insuranceExpiry")} /></F>
            <F label="Rating" error={e.rating}>
              <Select name="rating" defaultValue={val("rating")} options={[{ value: "5", label: "★★★★★ Excellent" }, { value: "4", label: "★★★★ Good" }, { value: "3", label: "★★★ OK" }, { value: "2", label: "★★ Poor" }, { value: "1", label: "★ Avoid" }]} placeholder="Not rated" />
            </F>
            <F label="Account number" error={e.accountNumber}><Input name="accountNumber" defaultValue={val("accountNumber")} /></F>
            <F label="Payment terms (days)" error={e.paymentTermsDays}><Input name="paymentTermsDays" type="number" min={0} max={365} step={1} defaultValue={val("paymentTermsDays")} placeholder="e.g. 30" /></F>
          </div>
        </Card>
        <Card title="Notes" className="lg:col-span-2">
          <Textarea name="notes" defaultValue={val("notes")} rows={3} aria-label="Notes" placeholder="Pricing agreements, preferred reps, delivery quirks…" />
        </Card>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100">Cancel</Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
