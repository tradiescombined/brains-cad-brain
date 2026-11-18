"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { IMPORT_FIELDS, detectMapping, mapRows, parseCsv, type Mapping } from "@/lib/catalogue-csv";
import { cx, money, num } from "@/lib/format";
import { importCsv, type ImportReport } from "../actions";

const SAMPLE = `Item code,Description,Cost type,UOM,Unit cost,Category
FR-9045,90x45 MGP10 pine framing,Material,lm,6.40,Framing > Wall frames
LB-CARP,Carpenter,Labour,hr,75.00,Labour`;

const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";

export function ImportWizard({ catalogueId, catalogueName }: { catalogueId: string; catalogueName: string }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(() => (step >= 2 ? parseCsv(text) : []), [text, step]);
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const headers = hasHeader && rows[0] ? Array.from({ length: width }, (_, i) => rows[0][i]?.trim() || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const mapped = useMemo(() => (mapping ? mapRows(rows, mapping, hasHeader) : null), [rows, mapping, hasHeader]);

  const next = () => {
    const parsed = parseCsv(text);
    if (!parsed.length) return setError("Paste some CSV text or choose a file first.");
    setError(null);
    const m = detectMapping(parsed[0].map((h) => h ?? ""));
    // if nothing at all matched, the file probably has no header row
    const any = Object.values(m).some((v) => v >= 0);
    setHasHeader(any);
    setMapping(any ? m : { ...m, description: 0 });
    setStep(2);
  };

  const runImport = () => {
    if (!mapping || mapping.description < 0) return setError("Choose which column holds the item description.");
    setError(null);
    start(async () => {
      const r = await importCsv(catalogueId, text, mapping, hasHeader);
      if (!r.ok) return setError(r.error);
      setReport(r.report);
      setStep(3);
    });
  };

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Import steps">
        {["Choose data", "Map columns & preview", "Results"].map((s, i) => (
          <li key={s} className={cx("rounded-full px-3 py-1", step === i + 1 ? "bg-brand-600 text-white" : step > i + 1 ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-500")}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {step === 1 && (
        <Card title="Choose data">
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              Upload a CSV price list or paste rows copied from a spreadsheet. Items whose code already exists in <strong>{catalogueName}</strong> are updated; everything else is added. Use <code className="rounded bg-ink-100 px-1">Parent &gt; Child</code> in the category column for sub-categories.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink-200 px-4 py-6 text-sm text-ink-600 hover:border-brand-400 hover:bg-brand-50/40">
              <span className="font-medium text-brand-700">Choose a CSV file</span>
              <span className="text-xs text-ink-400">{fileName ?? ".csv or .txt, comma, semicolon or tab separated"}</span>
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                aria-label="CSV file"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 10 * 1024 * 1024) return setError("That file is over 10 MB. Split it into smaller files.");
                  setFileName(`${f.name} · ${num(f.size / 1024, 0)} KB`);
                  setText(await f.text());
                  setError(null);
                }}
              />
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="csv-text" className="text-xs font-medium text-ink-600">…or paste CSV</label>
                <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setText(SAMPLE)}>Use an example</button>
              </div>
              <textarea id="csv-text" value={text} onChange={(e) => { setText(e.target.value); setFileName(null); }} rows={8} placeholder={SAMPLE} className="block w-full rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-xs focus:border-brand-500 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2">
              <Link href={`/catalogues/${catalogueId}`} className={cx(btn, "border border-ink-200 text-ink-800 hover:bg-ink-50")}>Cancel</Link>
              <button type="button" onClick={next} disabled={!text.trim()} className={cx(btn, "bg-brand-600 text-white hover:bg-brand-700")}>Next: map columns</button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && mapping && mapped && (
        <>
          <Card title="Map columns">
            <label className="mb-3 flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="size-4 accent-brand-600" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              First row is a header
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {IMPORT_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-600">
                    {f.label} {f.required && <span className="text-red-600">*</span>}
                  </span>
                  <select
                    aria-label={`Column for ${f.label}`}
                    value={mapping[f.key]}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}
                    className={cx("block w-full rounded-md border bg-white px-2 py-1.5 text-sm", f.required && mapping[f.key] < 0 ? "border-red-300" : "border-ink-200")}
                  >
                    <option value={-1}>— Don’t import —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Card>
          <Card title={`Preview · ${num(mapped.rows.length, 0)} ready, ${num(mapped.skipped.length, 0)} will be skipped`} pad={false}>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm" data-testid="import-preview">
                <thead className="sticky top-0 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2">Line</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">UOM</th><th className="px-3 py-2 text-right">Unit cost</th><th className="px-3 py-2">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.rows.slice(0, 50).map((r) => (
                    <tr key={r.line} className="border-t border-ink-100">
                      <td className="px-3 py-1.5 text-ink-400 tabular-nums">{r.line}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.code}</td>
                      <td className="px-3 py-1.5">{r.description}{r.warnings.length > 0 && <span className="ml-1 text-xs text-amber-700">({r.warnings.join("; ")})</span>}</td>
                      <td className="px-3 py-1.5">{r.costType ?? <span className="text-ink-400">Material</span>}</td>
                      <td className="px-3 py-1.5">{r.uom ?? <span className="text-ink-400">ea</span>}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.unitCost === null ? <span className="text-ink-400">—</span> : money(r.unitCost)}</td>
                      <td className="px-3 py-1.5">{r.category?.join(" › ")}</td>
                    </tr>
                  ))}
                  {mapped.skipped.slice(0, 20).map((s) => (
                    <tr key={`s${s.line}`} className="border-t border-ink-100 bg-red-50/50 text-red-700">
                      <td className="px-3 py-1.5 tabular-nums">{s.line}</td>
                      <td colSpan={6} className="px-3 py-1.5">Skip: {s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mapped.rows.length > 50 && <p className="px-3 py-2 text-xs text-ink-500">Showing the first 50 of {num(mapped.rows.length, 0)} rows.</p>}
            </div>
          </Card>
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => setStep(1)} className={cx(btn, "border border-ink-200 text-ink-800 hover:bg-ink-50")}>Back</button>
            <button type="button" onClick={runImport} disabled={pending || mapped.rows.length === 0} className={cx(btn, "bg-brand-600 text-white hover:bg-brand-700")}>
              {pending ? "Importing…" : `Import ${num(mapped.rows.length, 0)} rows`}
            </button>
          </div>
        </>
      )}

      {step === 3 && report && (
        <Card title="Import complete">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="import-report">
            <Count label="Added" n={report.added} tone="text-emerald-700" />
            <Count label="Updated" n={report.updated} tone="text-sky-700" />
            <Count label="Skipped" n={report.skipped.length} tone="text-red-700" />
            <Count label="New categories" n={report.categoriesCreated} tone="text-ink-800" />
          </div>
          {report.skipped.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Skipped rows</h3>
              <ul className="max-h-48 overflow-auto rounded-md border border-ink-100 text-sm">
                {report.skipped.map((s) => <li key={s.line} className="border-b border-ink-100 px-3 py-1.5 last:border-0"><span className="mr-2 tabular-nums text-ink-400">Line {s.line}</span>{s.reason}</li>)}
              </ul>
            </div>
          )}
          {report.warnings.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Warnings</h3>
              <ul className="max-h-48 overflow-auto rounded-md border border-ink-100 text-sm">
                {report.warnings.map((s, i) => <li key={i} className="border-b border-ink-100 px-3 py-1.5 text-amber-800 last:border-0"><span className="mr-2 tabular-nums text-ink-400">Line {s.line}</span>{s.reason}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setText(""); setFileName(null); setReport(null); setStep(1); }} className={cx(btn, "border border-ink-200 text-ink-800 hover:bg-ink-50")}>Import another file</button>
            <Link href={`/catalogues/${catalogueId}`} className={cx(btn, "bg-brand-600 text-white hover:bg-brand-700")}>Back to catalogue</Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function Count({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cx("text-2xl font-semibold tabular-nums", tone)}>{num(n, 0)}</div>
    </div>
  );
}
