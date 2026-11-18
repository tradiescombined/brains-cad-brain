"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Card, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx } from "@/lib/format";
import type { FormState } from "./actions";
import { AU_STATES, F, FormMessage } from "./FormBits";
import { withCurrent } from "./list";

export type ClientValues = Partial<Record<
  "name" | "clientType" | "businessName" | "businessNumber" | "email" | "mobile" | "phone" | "address" | "cityTown" | "state" | "postcode" | "source" | "category" | "defaultInvoiceDays",
  string | number | null
>>;

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: ClientValues;
  sources: string[];
  categories: string[];
  submitLabel: string;
  cancelHref: string;
};

export function ClientForm({ action, initial, sources, categories, submitLabel, cancelHref }: Props) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const val = (k: keyof ClientValues): string => {
    const sv = state.values?.[k];
    if (sv !== undefined) return Array.isArray(sv) ? sv[0] ?? "" : sv;
    const iv = initial[k];
    return iv === null || iv === undefined ? "" : String(iv);
  };
  const [type, setType] = useState<"Person" | "Business">(val("clientType") === "Business" ? "Business" : "Person");
  const e = state.errors ?? {};
  const isBiz = type === "Business";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="clientType" value={type} />
      <FormMessage ok={state.ok} msg={state.message} />
      <div key={state.savedAt ?? 0} className="grid gap-4 lg:grid-cols-2">
        <Card title="Client">
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-600">Client is a</span>
              <div role="radiogroup" aria-label="Client type" className="inline-flex rounded-md border border-ink-200 bg-ink-50 p-0.5">
                {(["Person", "Business"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => setType(t)}
                    className={cx("rounded px-3 py-1 text-sm font-medium", type === t ? "bg-white text-brand-700 shadow-xs" : "text-ink-500 hover:text-ink-800")}
                  >
                    {t === "Person" ? "Person" : "Business"}
                  </button>
                ))}
              </div>
            </div>
            {isBiz && (
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Business name *" error={e.businessName}>
                  <Input name="businessName" defaultValue={val("businessName")} placeholder="e.g. Harbourside Developments" />
                </F>
                <F label="ABN" error={e.businessNumber} hint="11 digits">
                  <Input name="businessNumber" defaultValue={val("businessNumber")} inputMode="numeric" placeholder="12 345 678 901" />
                </F>
              </div>
            )}
            <F label={isBiz ? "Contact name" : "Full name *"} error={e.name} hint={isBiz ? "Leave blank to use the business name" : undefined}>
              <Input name="name" defaultValue={val("name")} autoFocus required={!isBiz} placeholder={isBiz ? "Main contact person" : "e.g. Alex Nguyen"} />
            </F>
          </div>
        </Card>
        <Card title="Contact details">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Email" error={e.email} className="sm:col-span-2">
              <Input name="email" type="email" defaultValue={val("email")} placeholder="name@example.com" />
            </F>
            <F label="Mobile" error={e.mobile}>
              <Input name="mobile" type="tel" defaultValue={val("mobile")} placeholder="04xx xxx xxx" />
            </F>
            <F label="Phone" error={e.phone}>
              <Input name="phone" type="tel" defaultValue={val("phone")} />
            </F>
          </div>
        </Card>
        <Card title="Address">
          <div className="grid gap-3 sm:grid-cols-6">
            <F label="Street address" error={e.address} className="sm:col-span-6">
              <Input name="address" defaultValue={val("address")} />
            </F>
            <F label="City / town" error={e.cityTown} className="sm:col-span-3">
              <Input name="cityTown" defaultValue={val("cityTown")} />
            </F>
            <F label="State" error={e.state} className="sm:col-span-1">
              <Select name="state" defaultValue={val("state")} options={withCurrent(AU_STATES, val("state"))} placeholder="—" />
            </F>
            <F label="Postcode" error={e.postcode} className="sm:col-span-2">
              <Input name="postcode" defaultValue={val("postcode")} inputMode="numeric" />
            </F>
          </div>
        </Card>
        <Card title="Classification & billing">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Source" error={e.source} hint="How they found you">
              <Select name="source" defaultValue={val("source")} options={withCurrent(sources, val("source"))} placeholder="Not set" />
            </F>
            <F label="Category" error={e.category}>
              <Select name="category" defaultValue={val("category")} options={withCurrent(categories, val("category"))} placeholder="Not set" />
            </F>
            <F label="Invoice due (days)" error={e.defaultInvoiceDays} hint="Default terms for new invoices">
              <Input name="defaultInvoiceDays" type="number" min={0} max={365} step={1} defaultValue={val("defaultInvoiceDays")} placeholder="e.g. 7" />
            </F>
          </div>
        </Card>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100">Cancel</Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
