import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Checkbox, Field, Input, Select } from "@/components/ui";
import { num } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { TAX_COST_TYPES, rateForCostType } from "@/lib/tax-defaults";
import { ActionForm, FieldError, FormFooter } from "../_components/ActionForm";
import { DialogForm } from "../_components/DialogForm";
import { DeleteForm } from "../_components/DeleteForm";
import { deleteTaxRate, saveCostTypeTaxDefaults, saveTaxProfile, saveTaxRate, setDefaultTaxRate } from "../actions";

export const metadata = { title: "Tax rates · Settings" };

type TaxRate = typeof schema.taxRates.$inferSelect;

function TaxFields({ t }: { t?: TaxRate }) {
  return (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Code *" hint="Short code, e.g. GST">
          <Input name="code" defaultValue={t?.code ?? ""} autoFocus className="uppercase" />
          <FieldError name="code" />
        </Field>
        <Field label="Name *">
          <Input name="name" defaultValue={t?.name ?? ""} placeholder="e.g. GST on income (10%)" />
          <FieldError name="name" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Rate (%) *">
          <Input name="ratePercent" inputMode="decimal" defaultValue={t ? String(Math.round(t.rate * 1_000_000) / 10_000) : "10"} />
          <FieldError name="ratePercent" />
        </Field>
        <Field label="Applies to">
          <Select name="appliesTo" defaultValue={t?.appliesTo ?? "income"} options={[{ value: "income", label: "Income (sales, quotes, invoices)" }, { value: "expense", label: "Expenses (orders, bills)" }]} />
          <FieldError name="appliesTo" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox name="active" defaultChecked={t ? t.active : true} label="Active" />
        <Checkbox name="isDefault" defaultChecked={t?.isDefault ?? false} label="Default for its type" />
      </div>
      <FieldError name="isDefault" />
    </>
  );
}

function RateTable({ title, rows, hint }: { title: string; rows: TaxRate[]; hint: string }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
      <header className="border-b border-ink-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-500">{hint}</p>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-400">No rates of this type yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label={title}>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 text-right font-semibold">Rate</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} data-tax={t.code} className="border-t border-ink-100">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-ink-800">{t.code}</td>
                  <td className="px-3 py-2 text-ink-800">{t.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-900">{num(t.rate * 100, 4)}%</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.isDefault && <Badge tone="green">Default</Badge>}
                      {!t.active && <Badge>Inactive</Badge>}
                      {t.active && !t.isDefault && <span className="text-xs text-ink-400">Active</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      {!t.isDefault && (
                        <form action={setDefaultTaxRate}>
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                            Make default
                          </button>
                        </form>
                      )}
                      <DialogForm action={saveTaxRate} title={`Edit ${t.code}`} triggerLabel="Edit" trigger="small" submitLabel="Save rate">
                        <TaxFields t={t} />
                      </DialogForm>
                      <DeleteForm action={deleteTaxRate} id={t.id} confirmText="Delete rate?" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const COST_TYPE_LABEL: Record<string, string> = { MatLab: "Material + labour", Subcontractor: "Subcontractor" };

function TaxProfile({ name, code }: { name: string; code: string }) {
  return (
    <ActionForm action={saveTaxProfile} aria-label="Tax profile" className="rounded-lg border border-ink-200 bg-white shadow-xs">
      <header className="border-b border-ink-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Tax profile</h2>
        <p className="mt-0.5 text-xs text-ink-500">The tax scheme your rates belong to. Shown on estimates next to the tax rate.</p>
      </header>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_10rem]">
        <Field label="Profile name">
          <Input name="taxProfileName" defaultValue={name} />
          <FieldError name="taxProfileName" />
        </Field>
        <Field label="Short code">
          <Input name="taxProfileCode" defaultValue={code} className="uppercase" />
          <FieldError name="taxProfileCode" />
        </Field>
      </div>
      <FormFooter label="Save profile" className="border-t border-ink-100 px-4 py-3" />
    </ActionForm>
  );
}

function CostTypeDefaults({ rates }: { rates: TaxRate[] }) {
  const income = rates.filter((r) => r.appliesTo === "income" && r.active);
  const expense = rates.filter((r) => r.appliesTo === "expense" && r.active);
  const opts = (list: TaxRate[]) => list.map((r) => ({ value: r.id, label: `${r.code} (${num(r.rate * 100, 4)}%)` }));
  return (
    <ActionForm action={saveCostTypeTaxDefaults} aria-label="Cost type tax defaults" className="rounded-lg border border-ink-200 bg-white shadow-xs">
      <header className="border-b border-ink-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Default tax by cost type</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          New costing items are taxable when their cost type&apos;s income rate charges tax (e.g. pick a GST-free rate for exempt work). You can still tick or untick Taxable on any item.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" aria-label="Default tax by cost type">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-2 font-semibold">Cost type</th>
              <th className="px-3 py-2 font-semibold">Income (quotes)</th>
              <th className="px-3 py-2 font-semibold">Expenses (orders)</th>
            </tr>
          </thead>
          <tbody>
            {TAX_COST_TYPES.map((t) => (
              <tr key={t} data-cost-type={t} className="border-t border-ink-100">
                <td className="px-4 py-2 font-medium text-ink-800">{COST_TYPE_LABEL[t] ?? t}</td>
                <td className="px-3 py-2">
                  <Select name={`income:${t}`} aria-label={`Income rate for ${t}`} defaultValue={rateForCostType(rates, t, "income")?.id ?? ""} placeholder="Not set (taxable)" options={opts(income)} className="min-w-40" />
                  <FieldError name={`income:${t}`} />
                </td>
                <td className="px-3 py-2">
                  <Select name={`expense:${t}`} aria-label={`Expense rate for ${t}`} defaultValue={rateForCostType(rates, t, "expense")?.id ?? ""} placeholder="Not set" options={opts(expense)} className="min-w-40" />
                  <FieldError name={`expense:${t}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormFooter label="Save cost type defaults" className="border-t border-ink-100 px-4 py-3" />
    </ActionForm>
  );
}

export default async function TaxRatesPage() {
  const [rates, settings] = await Promise.all([db.select().from(schema.taxRates).orderBy(asc(schema.taxRates.code)), getSettings()]);
  return (
    <div className="space-y-4">
      <TaxProfile name={settings.taxProfileName} code={settings.taxProfileCode} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">The default income rate is applied to new estimates; the default expense rate to purchase orders.</p>
        <DialogForm action={saveTaxRate} title="Add tax rate" triggerLabel="+ Add tax rate" submitLabel="Add rate">
          <TaxFields />
        </DialogForm>
      </div>
      <RateTable title="Income" hint="Charged on quotes, variations and invoices." rows={rates.filter((r) => r.appliesTo === "income")} />
      <RateTable title="Expenses" hint="Paid on purchase orders and supplier costs." rows={rates.filter((r) => r.appliesTo === "expense")} />
      <CostTypeDefaults rates={rates} />
    </div>
  );
}
