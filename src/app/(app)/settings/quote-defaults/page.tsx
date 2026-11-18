import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { ActionForm, FieldError, FormFooter } from "../_components/ActionForm";
import { saveQuoteDefaults } from "../actions";
import { DEFAULT_COVER_LETTER, DEFAULT_TERMS } from "@/components/quote/defaults";

export const metadata = { title: "Quote defaults · Settings" };

export default async function QuoteDefaultsPage() {
  const [s, rates] = await Promise.all([
    getSettings(),
    db.select().from(schema.taxRates).where(eq(schema.taxRates.appliesTo, "income")).orderBy(asc(schema.taxRates.code)),
  ]);
  const currentDefault = s.defaultTaxRateId ?? rates.find((r) => r.isDefault)?.id ?? "";
  return (
    <ActionForm action={saveQuoteDefaults} aria-label="Quote defaults" className="space-y-6">
      <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Pricing &amp; validity</h2>
          <p className="mt-0.5 text-xs text-ink-500">Applied to new estimates and invoices. Existing records keep their own values.</p>
        </header>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <Field label="Default markup (%)" hint="Starting markup line on a new estimate">
            <Input name="defaultMarkupPercent" inputMode="decimal" defaultValue={String(s.defaultMarkupPercent)} />
            <FieldError name="defaultMarkupPercent" />
          </Field>
          <Field label="Default tax rate" hint="Income tax rate for new estimates">
            <Select
              name="defaultTaxRateId"
              defaultValue={currentDefault}
              placeholder="No default"
              options={rates.filter((r) => r.active || r.id === currentDefault).map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))}
            />
            <FieldError name="defaultTaxRateId" />
          </Field>
          <Field label="Quotes valid for (days)" hint="Sets the 'valid until' date on quotes">
            <Input name="quoteValidDays" type="number" min={1} max={365} defaultValue={s.quoteValidDays} />
            <FieldError name="quoteValidDays" />
          </Field>
          <Field label="Invoice due (days after issue)" hint="0 means due on receipt">
            <Input name="defaultInvoiceDueDays" type="number" min={0} max={365} defaultValue={s.defaultInvoiceDueDays} />
            <FieldError name="defaultInvoiceDueDays" />
          </Field>
        </div>
      </section>
      <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Payment details</h2>
          <p className="mt-0.5 text-xs text-ink-500">Printed on quotes and tax invoices so clients know how to pay.</p>
        </header>
        <div className="p-4">
          <Field label="Bank details">
            <Textarea name="bankDetails" rows={4} defaultValue={s.bankDetails ?? ""} placeholder={"Account name: My Building Co\nBSB: 000-000\nAccount: 12345678"} className="font-mono" />
            <FieldError name="bankDetails" />
          </Field>
        </div>
      </section>
      <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <header className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Quote wording</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Used when a quote is prepared for the first time. Merge fields: [ClientName] [EstimateName] [EstimateNumber] [QuoteTotal] [ValidUntil] [BusinessName] [SiteAddress]. Leave blank for the built-in wording.
          </p>
        </header>
        <div className="space-y-4 p-4">
          <Field label="Default cover letter">
            <Textarea name="defaultCoverLetter" rows={8} defaultValue={s.defaultCoverLetter ?? ""} placeholder={DEFAULT_COVER_LETTER} />
            <FieldError name="defaultCoverLetter" />
          </Field>
          <Field label="Default terms & conditions" hint="Supports paragraphs, bullet lists (- item) and **bold**.">
            <Textarea name="defaultTermsAndConditions" rows={12} defaultValue={s.defaultTermsAndConditions ?? ""} placeholder={DEFAULT_TERMS} />
            <FieldError name="defaultTermsAndConditions" />
          </Field>
        </div>
      </section>
      <FormFooter label="Save quote defaults" />
    </ActionForm>
  );
}
