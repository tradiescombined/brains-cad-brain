"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui";
import { cx, money } from "@/lib/format";

type Opt = { key: number; name: string; price: string };

/** Editable list of options with prices, the chosen option, and the allowance (live difference). */
export function OptionsEditor({ initial, chosen: initialChosen, allowance: initialAllowance }: { initial: { name: string; price: number }[]; chosen: string | null; allowance: number | null }) {
  const [opts, setOpts] = useState<Opt[]>(() => {
    const rows = initial.map((o, i) => ({ key: i, name: o.name, price: String(o.price) }));
    return rows.length ? rows : [{ key: 0, name: "", price: "" }];
  });
  const [chosen, setChosen] = useState(initialChosen ?? "");
  const [allowance, setAllowance] = useState(initialAllowance === null ? "" : String(initialAllowance));
  const nextKey = () => Math.max(-1, ...opts.map((o) => o.key)) + 1;
  const update = (key: number, patch: Partial<Opt>) => {
    setOpts((cur) => cur.map((o) => (o.key === key ? { ...o, ...patch } : o)));
    const old = opts.find((o) => o.key === key);
    if (patch.name !== undefined && old && old.name.trim() === chosen) setChosen(patch.name.trim());
  };
  const named = opts.filter((o) => o.name.trim());
  const chosenOpt = named.find((o) => o.name.trim() === chosen);
  const allowNum = allowance.trim() === "" ? null : Number(allowance.replace(/[$,\s]/g, ""));
  const diff = chosenOpt && allowNum !== null && Number.isFinite(allowNum) ? (Number(chosenOpt.price) || 0) - allowNum : null;

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-600">Options</legend>
        <div className="space-y-2">
          {opts.map((o, i) => (
            <div key={o.key} className="flex items-center gap-2">
              <Input name="optName" value={o.name} onChange={(e) => update(o.key, { name: e.target.value })} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1} name`} />
              <Input name="optPrice" value={o.price} onChange={(e) => update(o.key, { price: e.target.value })} inputMode="decimal" placeholder="Price" className="w-28" aria-label={`Option ${i + 1} price`} />
              <button
                type="button"
                onClick={() => {
                  setOpts((cur) => (cur.length > 1 ? cur.filter((x) => x.key !== o.key) : [{ key: nextKey(), name: "", price: "" }]));
                  if (o.name.trim() === chosen) setChosen("");
                }}
                className="rounded px-2 py-1 text-ink-400 hover:bg-ink-100 hover:text-red-600"
                aria-label={`Remove option ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setOpts((cur) => [...cur, { key: nextKey(), name: "", price: "" }])} className="mt-2 text-sm font-medium text-brand-700 hover:underline">
          + Add option
        </button>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Allowance">
          <Input name="allowance" value={allowance} onChange={(e) => setAllowance(e.target.value)} inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field label="Chosen option">
          <select
            name="chosenOption"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">— Not chosen yet —</option>
            {named.map((o) => (
              <option key={o.key} value={o.name.trim()}>{o.name.trim()}</option>
            ))}
          </select>
        </Field>
      </div>
      {diff !== null && (
        <p className={cx("rounded-md px-3 py-2 text-sm", diff > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>
          {diff > 0 ? `${money(diff)} over allowance — client pays the difference.` : diff < 0 ? `${money(-diff)} under allowance — credit to client.` : "Exactly on allowance."}
        </p>
      )}
    </div>
  );
}
