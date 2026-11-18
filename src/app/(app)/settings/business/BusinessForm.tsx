"use client";
import { useState } from "react";
import { ActionForm, FieldError, FormFooter } from "../_components/ActionForm";
import { saveBusiness } from "../actions";
import { AU_STATES, CURRENCIES, HEX_RE, LOGO_TYPES, MAX_LOGO_BYTES } from "../validation";

export type BusinessValues = {
  businessName: string;
  tradingName: string | null;
  businessNumber: string | null;
  licenceNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  cityTown: string | null;
  state: string | null;
  postcode: string | null;
  country: string;
  currency: string;
  logoDataUrl: string | null;
  brandColour: string;
};

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

function F({ label, name, defaultValue, placeholder, type = "text", hint, list, className }: { label: string; name: string; defaultValue?: string | null; placeholder?: string; type?: string; hint?: string; list?: string; className?: string }) {
  return (
    <label className={className ?? "block"}>
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} list={list} className={inputCls} />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      <FieldError name={name} />
    </label>
  );
}

export function BusinessForm({ v }: { v: BusinessValues }) {
  const [colour, setColour] = useState(v.brandColour);
  const [preview, setPreview] = useState<string | null>(v.logoDataUrl);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const swatch = HEX_RE.test(colour) ? colour : "#ffffff";

  return (
    <ActionForm action={saveBusiness} aria-label="Business details" className="space-y-6">
      <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Business</h2>
        </header>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <F label="Business name *" name="businessName" defaultValue={v.businessName} />
          <F label="Trading name" name="tradingName" defaultValue={v.tradingName} placeholder="If different to business name" />
          <F label="ABN / business number" name="businessNumber" defaultValue={v.businessNumber} placeholder="e.g. 51 824 753 556" />
          <F label="Builder licence number" name="licenceNumber" defaultValue={v.licenceNumber} />
          <F label="Email" name="email" type="email" defaultValue={v.email} placeholder="office@yourbusiness.com.au" />
          <F label="Phone" name="phone" defaultValue={v.phone} />
          <F label="Website" name="website" defaultValue={v.website} placeholder="https://" className="block sm:col-span-2" />
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Address</h2>
        </header>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <F label="Street address" name="address" defaultValue={v.address} className="col-span-2 block sm:col-span-4" />
          <F label="Suburb / town" name="cityTown" defaultValue={v.cityTown} className="col-span-2 block" />
          <F label="State" name="state" defaultValue={v.state} list="bcb-au-states" />
          <F label="Postcode" name="postcode" defaultValue={v.postcode} />
          <F label="Country *" name="country" defaultValue={v.country} className="col-span-2 block" />
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Currency</span>
            <select name="currency" defaultValue={v.currency} className={inputCls}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <FieldError name="currency" />
          </label>
          <datalist id="bcb-au-states">
            {AU_STATES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Branding</h2>
        </header>
        <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-600">Logo</span>
            <div className="flex items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border border-dashed border-ink-300 bg-ink-50">
                {preview && !removeLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Business logo" data-testid="logo-preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-ink-400">No logo</span>
                )}
              </div>
              <div className="min-w-0 space-y-1.5">
                <input
                  type="file"
                  name="logo"
                  aria-label="Upload logo"
                  accept={LOGO_TYPES.join(",")}
                  className="block w-full text-xs text-ink-600 file:mr-2 file:rounded-md file:border file:border-ink-200 file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink-700 hover:file:bg-ink-50"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setFileNote(null);
                    if (!f) return;
                    if (f.size > MAX_LOGO_BYTES) setFileNote("That file is over 1 MB and will be rejected.");
                    setRemoveLogo(false);
                    const r = new FileReader();
                    r.onload = () => setPreview(String(r.result));
                    r.readAsDataURL(f);
                  }}
                />
                <span className="block text-xs text-ink-400">PNG, JPG, SVG or WebP, up to 1 MB. Shown on quotes, orders and invoices.</span>
                {fileNote && <span className="block text-xs text-amber-700">{fileNote}</span>}
                <FieldError name="logo" />
                {v.logoDataUrl && (
                  <label className="flex items-center gap-1.5 text-xs text-ink-600">
                    <input type="checkbox" name="removeLogo" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)} className="size-3.5 accent-brand-600" />
                    Remove current logo
                  </label>
                )}
              </div>
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-600">Brand colour</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick brand colour"
                value={swatch}
                onChange={(e) => setColour(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-ink-200 bg-white p-0.5"
              />
              <input name="brandColour" aria-label="Brand colour hex" value={colour} onChange={(e) => setColour(e.target.value.trim())} className={`${inputCls} w-32 font-mono`} />
            </div>
            <FieldError name="brandColour" />
            <div className="mt-3 overflow-hidden rounded-md border border-ink-200 text-xs">
              <div className="px-3 py-2 font-semibold text-white" style={{ background: swatch }}>
                Quote heading preview
              </div>
              <div className="px-3 py-2 text-ink-500">Used for headings and accents on printed documents.</div>
            </div>
          </div>
        </div>
      </section>

      <FormFooter label="Save business details" />
    </ActionForm>
  );
}
