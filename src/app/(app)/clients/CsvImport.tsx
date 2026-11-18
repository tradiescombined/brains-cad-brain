"use client";
/**
 * CSV import wizard shared by clients and suppliers/trades:
 * paste or upload → map header columns to fields → preview first 5 rows → import.
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, Textarea } from "@/components/ui";
import { cx } from "@/lib/format";
import { applyMapping, guessMapping, parseCsv, type CsvField } from "./csv";
import { validateClient } from "./fields";
import { validateContact } from "../contacts/fields";
import type { ImportResult } from "./actions";

type Kind = "clients" | "contacts";

const VALIDATORS: Record<Kind, (r: Record<string, string>) => { ok: boolean; errors?: Record<string, string> }> = {
  clients: validateClient,
  contacts: validateContact,
};

export function CsvImport({
  kind,
  fields,
  onImport,
  listHref,
  noun,
  sample,
}: {
  kind: Kind;
  fields: CsvField[];
  onImport: (records: Record<string, string>[]) => Promise<ImportResult>;
  listHref: string;
  noun: string;
  sample: string;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const headers = table?.[0] ?? [];
  const dataRows = useMemo(() => table?.slice(1) ?? [], [table]);
  const records = useMemo(() => applyMapping(dataRows, mapping), [dataRows, mapping]);
  const checked = useMemo(() => records.map((r) => VALIDATORS[kind](r)), [records, kind]);
  const invalid = checked.filter((c) => !c.ok).length;
  const mappedKeys = fields.filter((f) => mapping.includes(f.key));
  const nameMapped = mapping.includes("name") || mapping.includes("businessName");

  function read(src: string) {
    setResult(null);
    setImportError(null);
    const rows = parseCsv(src);
    if (rows.length < 2) {
      setTable(null);
      setReadError("We need a header row plus at least one data row.");
      return;
    }
    setReadError(null);
    setTable(rows);
    setMapping(guessMapping(rows[0], fields));
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setReadError("That file is larger than 5 MB.");
      return;
    }
    const t = await f.text();
    setFileName(f.name);
    setText(t);
    read(t);
  }

  function setCol(idx: number, key: string) {
    setMapping((m) => m.map((k, i) => (i === idx ? key : k === key && key ? "" : k)));
  }

  function doImport() {
    setImportError(null);
    start(async () => {
      try {
        const r = await onImport(records);
        setResult(r);
      } catch {
        setImportError("The import failed. Please check the file and try again.");
      }
    });
  }

  if (result) {
    return (
      <Card title="Import complete">
        <p className="text-sm text-ink-800" role="status">
          Imported <strong>{result.imported}</strong> {noun}
          {result.imported === 1 ? "" : "s"}.
          {result.failed.length > 0 && ` ${result.failed.length} row${result.failed.length === 1 ? " was" : "s were"} skipped.`}
        </p>
        {result.failed.length > 0 && (
          <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto text-xs text-red-700">
            {result.failed.map((f) => (
              <li key={f.row}>Row {f.row}{f.name ? ` (${f.name})` : ""}: {f.error}</li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <Link href={listHref} className="inline-flex rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">View {noun}s</Link>
          <Button variant="secondary" onClick={() => { setResult(null); setTable(null); setText(""); setFileName(null); }}>Import another file</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="1. Add your data">
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <div>
            <Textarea
              aria-label="CSV data"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={`Paste rows copied from a spreadsheet or a CSV file, with a header row. For example:\n\n${sample}`}
              className="font-mono text-xs"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => read(text)} disabled={!text.trim()}>Read pasted data</Button>
              <button type="button" onClick={() => { setText(sample); read(sample); }} className="text-xs font-medium text-brand-700 hover:underline">Use example data</button>
            </div>
          </div>
          <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-4 text-sm">
            <p className="font-medium text-ink-800">Or upload a file</p>
            <p className="mb-2 text-xs text-ink-500">.csv or .txt, up to 5 MB</p>
            <input aria-label="CSV file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} className="w-full text-xs file:mr-2 file:rounded-md file:border file:border-ink-200 file:bg-white file:px-2 file:py-1 file:text-xs" />
            {fileName && <p className="mt-2 truncate text-xs text-ink-600">Loaded {fileName}</p>}
          </div>
        </div>
        {readError && <p className="mt-3 text-sm text-red-600" role="alert">{readError}</p>}
      </Card>

      {table && (
        <>
          <Card title={`2. Match columns (${headers.length} found, ${dataRows.length} data rows)`} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2 font-semibold">Column in your file</th>
                    <th className="px-4 py-2 font-semibold">Example</th>
                    <th className="px-4 py-2 font-semibold">Import as</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i} className="border-t border-ink-100">
                      <td className="px-4 py-1.5 font-medium text-ink-800">{h || <span className="text-ink-400">(blank)</span>}</td>
                      <td className="max-w-56 truncate px-4 py-1.5 text-ink-500">{dataRows[0]?.[i]}</td>
                      <td className="px-4 py-1.5">
                        <select
                          aria-label={`Map column ${h}`}
                          value={mapping[i] ?? ""}
                          onChange={(e) => setCol(i, e.target.value)}
                          className={cx("w-48 rounded-md border px-2 py-1 text-sm", mapping[i] ? "border-brand-300 bg-brand-50" : "border-ink-200 bg-white text-ink-500")}
                        >
                          <option value="">Don&apos;t import</option>
                          {fields.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="3. Preview (first 5 rows)" pad={false}>
            {mappedKeys.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-500">Match at least one column to preview.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Import preview">
                  <thead>
                    <tr className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                      <th className="px-3 py-2 font-semibold">Check</th>
                      {mappedKeys.map((f) => <th key={f.key} className="whitespace-nowrap px-3 py-2 font-semibold">{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-ink-100">
                        <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                          {checked[i].ok ? <span className="text-emerald-700">Ready</span> : <span className="text-red-600" title={Object.values(checked[i].errors ?? {}).join(" ")}>{Object.values(checked[i].errors ?? {})[0]}</span>}
                        </td>
                        {mappedKeys.map((f) => <td key={f.key} className="max-w-48 truncate px-3 py-1.5 text-ink-800">{r[f.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {!nameMapped && <span className="text-sm text-amber-700">Match a column to Name (or Business name) to continue.</span>}
            {nameMapped && (
              <span className="text-sm text-ink-600">
                {records.length - invalid} ready to import{invalid ? `, ${invalid} will be skipped` : ""}
              </span>
            )}
            {importError && <span className="text-sm text-red-600" role="alert">{importError}</span>}
            <Button type="button" onClick={doImport} disabled={!nameMapped || pending || records.length - invalid === 0}>
              {pending ? "Importing…" : `Import ${records.length - invalid} ${noun}${records.length - invalid === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
