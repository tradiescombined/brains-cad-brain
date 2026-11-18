"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { cx } from "@/lib/format";
import { MERGE_FIELDS, unknownMergeFields } from "@/lib/merge-fields";
import { QuoteDocument } from "@/components/quote/QuoteDocument";
import { ALLOWANCE_PRINT_OPTIONS, type QuoteModel, type QuoteOptionValues } from "@/components/quote/model";
import type { QuoteActionState } from "./actions";

type BoolKey = { [K in keyof QuoteOptionValues]: QuoteOptionValues[K] extends boolean ? K : never }[keyof QuoteOptionValues];

export function QuoteBuilder({
  model, initial, saveAction, printHref,
}: {
  model: QuoteModel;
  initial: QuoteOptionValues;
  saveAction: (p: QuoteActionState, fd: FormData) => Promise<QuoteActionState>;
  printHref: string;
}) {
  const [o, setO] = useState<QuoteOptionValues>(initial);
  const [state, formAction, pending] = useActionState(saveAction, null);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const submitted = useRef(saved);
  const dirty = JSON.stringify(o) !== saved;
  useEffect(() => {
    if (state?.ok) setSaved(submitted.current);
  }, [state]);

  const set = <K extends keyof QuoteOptionValues>(k: K, v: QuoteOptionValues[K]) => setO((p) => ({ ...p, [k]: v }));
  const toggle = (k: BoolKey, label: string, disabled?: boolean) => (
    <label key={k} className={cx("flex items-center gap-2 py-0.5 text-sm text-ink-800", disabled && "opacity-50")}>
      <input type="checkbox" name={k} checked={o[k]} disabled={disabled} onChange={(e) => set(k, e.target.checked)} className="size-4 rounded border-ink-300 accent-brand-600" />
      {label}
      {disabled && o[k] && <input type="hidden" name={k} value="on" />}
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <form
        action={formAction}
        onSubmit={() => (submitted.current = JSON.stringify(o))}
        className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1"
        data-testid="quote-options-form"
      >
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2">
          <div className="text-xs">
            {dirty ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800" data-testid="quote-dirty">Unsaved changes</span>
            ) : state?.ok ? (
              <span className="font-medium text-emerald-700" data-testid="quote-saved">Saved</span>
            ) : (
              <span className="text-ink-500">Preview updates as you type</span>
            )}
            {state && !state.ok && <div className="mt-1 font-medium text-red-700" role="alert">{state.message}</div>}
          </div>
          <Button type="submit" disabled={pending || !dirty} data-testid="quote-save">{pending ? "Saving…" : "Save options"}</Button>
        </div>

        <Panel title="Document">
          <Field label="Title">
            <Input name="title" value={o.title} onChange={(e) => set("title", e.target.value)} maxLength={120} required />
          </Field>
          <Field label="Valid for (days)" hint="Valid-until date is calculated from the quote date.">
            <Input name="validDays" type="number" min={1} max={365} value={o.validDays} onChange={(e) => set("validDays", Math.max(0, Math.round(Number(e.target.value) || 0)))} required />
          </Field>
          {toggle("printBusinessInfo", "Business details")}
          {toggle("printLogo", "Logo")}
        </Panel>

        <Panel title="Cover letter">
          <LetterField name="coverLetter" value={o.coverLetter ?? ""} onChange={(v) => set("coverLetter", v)} rows={9} />
        </Panel>

        <Panel title="Pricing & scope">
          {toggle("printCategories", "Categories")}
          <div className="pl-6">
            {toggle("printCategoryTotals", "Category totals", !o.printCategories)}
            <div className="pl-6">{toggle("categoryTotalsIncludeTax", "Include tax in category totals", !o.printCategories || !o.printCategoryTotals)}</div>
          </div>
          {toggle("printItems", "Items")}
          <div className="pl-6">
            {toggle("printQuantities", "Quantities", !o.printItems)}
            {toggle("printUnitMeasures", "Units of measure", !o.printItems)}
            {toggle("printItemTotals", "Item prices", !o.printItems)}
            {toggle("printZeroDollarItems", "Zero-dollar items", !o.printItems)}
          </div>
          {toggle("showMarkup", "Show cost and markup in totals")}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Field label="PC allowances">
              <Select name="pcPrintOption" value={o.pcPrintOption} onChange={(e) => set("pcPrintOption", e.target.value)} options={ALLOWANCE_PRINT_OPTIONS} />
            </Field>
            <Field label="PS allowances">
              <Select name="psPrintOption" value={o.psPrintOption} onChange={(e) => set("psPrintOption", e.target.value)} options={ALLOWANCE_PRINT_OPTIONS} />
            </Field>
          </div>
        </Panel>

        <Panel title="Specifications & acceptance">
          {toggle("printSpecifications", "Specifications")}
          <div className="pl-6">{toggle("printSpecificationNumbers", "Section numbers", !o.printSpecifications)}</div>
          {toggle("printInitialsArea", "Client initials on every page")}
        </Panel>

        <Panel title="Terms & conditions">
          <LetterField name="termsAndConditions" value={o.termsAndConditions ?? ""} onChange={(v) => set("termsAndConditions", v)} rows={10} />
        </Panel>
      </form>

      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between text-xs text-ink-500">
          <span>A4 preview{dirty ? " (unsaved — save to update the print and client versions)" : ""}</span>
          <a href={printHref} target="_blank" rel="noopener" className="font-medium text-brand-700 hover:underline">Open print view ↗</a>
        </div>
        <div className="overflow-x-auto rounded-lg bg-ink-200/60 p-3 sm:p-6">
          <QuoteDocument model={model} options={o} className="min-w-[640px] shadow-md" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-ink-200 bg-white p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</legend>
      {children}
    </fieldset>
  );
}

function LetterField({ name, value, onChange, rows }: { name: string; value: string; onChange: (v: string) => void; rows: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const a = el?.selectionStart ?? value.length;
    const b = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, a) + token + value.slice(b));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + token.length, a + token.length);
    });
  };
  const unknown = unknownMergeFields(value);
  return (
    <div>
      <Textarea ref={ref} name={name} aria-label={name === "coverLetter" ? "Cover letter" : "Terms and conditions"} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="font-[inherit] text-[13px]" />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {MERGE_FIELDS.map((f) => (
          <button key={f.key} type="button" title={`Insert ${f.label}`} onClick={() => insert(`[${f.key}]`)} className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-600 hover:border-brand-300 hover:text-brand-700">
            [{f.key}]
          </button>
        ))}
      </div>
      {unknown.length > 0 && <p className="mt-1 text-xs text-amber-700">Unknown merge field{unknown.length > 1 ? "s" : ""}: {unknown.map((u) => `[${u}]`).join(", ")}</p>}
      <p className="mt-1 text-[11px] text-ink-400">**bold**, “- ” for bullets, blank line between paragraphs.</p>
    </div>
  );
}
