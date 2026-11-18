import { db, schema } from "@/db";
import { Input } from "@/components/ui";
import { getSettings, type Settings } from "@/lib/settings";
import { ActionForm, FieldError, FormFooter } from "../_components/ActionForm";
import { saveNumbering } from "../actions";
import { NUMBERING_KINDS, minSafeNext } from "../validation";

export const metadata = { title: "Numbering · Settings" };

export default async function NumberingPage() {
  const [s, est, jobs, inv, po, vars] = await Promise.all([
    getSettings(),
    db.select({ n: schema.estimates.number }).from(schema.estimates),
    db.select({ n: schema.jobs.number }).from(schema.jobs),
    db.select({ n: schema.invoices.number }).from(schema.invoices),
    db.select({ n: schema.purchaseOrders.number }).from(schema.purchaseOrders),
    db.select({ n: schema.variations.number }).from(schema.variations),
  ]);
  const existing: Record<string, string[]> = { estimate: est.map((x) => x.n), job: jobs.map((x) => x.n), invoice: inv.map((x) => x.n), order: po.map((x) => x.n), variation: vars.map((x) => x.n) };

  return (
    <ActionForm action={saveNumbering} aria-label="Numbering" className="rounded-lg border border-ink-200 bg-white shadow-xs">
      <header className="border-b border-ink-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Document numbering</h2>
        <p className="mt-0.5 text-xs text-ink-500">Each new record takes the next number, then the counter goes up by one. Numbers already in use can&apos;t be reissued.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-2 font-semibold">Document</th>
              <th className="px-3 py-2 font-semibold">Prefix</th>
              <th className="px-3 py-2 font-semibold">Next number</th>
              <th className="hidden px-4 py-2 font-semibold sm:table-cell">Next will be</th>
            </tr>
          </thead>
          <tbody>
            {NUMBERING_KINDS.map((k) => {
              const cap = k.key[0].toUpperCase() + k.key.slice(1);
              const pName = `${k.key}NumberPrefix`;
              const nName = `next${cap}Number`;
              const prefix = s[pName as keyof Settings] as string;
              const next = s[nName as keyof Settings] as number;
              const used = existing[k.key].length;
              const safe = minSafeNext(prefix, existing[k.key]);
              return (
                <tr key={k.key} className="border-t border-ink-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{k.label}</div>
                    <div className="text-xs text-ink-500">{used} issued{safe > 0 ? ` · lowest free ${prefix}${safe}` : ""}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Input name={pName} aria-label={`${k.label} prefix`} defaultValue={prefix} className="w-24 font-mono" />
                    <FieldError name={pName} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Input name={nName} aria-label={`${k.label} next number`} type="number" min={0} step={1} defaultValue={next} className="w-32 tabular-nums" />
                    <FieldError name={nName} />
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-sm text-ink-700 sm:table-cell" data-testid={`next-${k.key}`}>
                    {prefix}
                    {next}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FormFooter label="Save numbering" className="border-t border-ink-100 px-4 py-3" />
    </ActionForm>
  );
}
