"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { computeMeasurement, formatQuantity, shapeKind, totalsByDescription } from "@/lib/geometry";
import { cx } from "@/lib/format";
import { deleteMeasurement, updateMeasurement } from "./actions";
import { PALETTE, SHAPE_LABEL, type MeasurementView, type PlanView } from "./types";

export function MeasurementPanel({ plans, measurements, selectedId, onSelect, onCreateCosting, onMessage }: {
  plans: PlanView[];
  measurements: MeasurementView[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreateCosting: (m: MeasurementView) => void;
  onMessage: (msg: string, tone?: "ok" | "error") => void;
}) {
  const [tab, setTab] = useState<"list" | "totals">("list");
  const totals = totalsByDescription(measurements);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Measurements <span className="font-normal text-ink-400">({measurements.length})</span></h2>
        <div className="flex rounded-md border border-ink-200 p-0.5 text-[11px]">
          {(["list", "totals"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cx("rounded px-2 py-0.5 font-medium", tab === t ? "bg-ink-800 text-white" : "text-ink-600 hover:bg-ink-50")}>
              {t === "list" ? "List" : "Totals"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "totals" ? (
          totals.length ? (
            <table className="w-full text-sm" data-testid="totals-table">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2 font-semibold">Description</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={`${t.description}|${t.unit}`} className="border-t border-ink-100">
                    <td className="px-3 py-1.5 text-ink-800">{t.description} <span className="text-xs text-ink-400">×{t.count}</span></td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-ink-900">{formatQuantity(t.total, t.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )
        ) : measurements.length ? (
          plans
            .filter((p) => measurements.some((m) => m.planId === p.id))
            .map((p) => (
              <section key={p.id}>
                <h3 className="sticky top-0 z-10 border-b border-ink-100 bg-ink-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{p.label}</h3>
                <ul>
                  {measurements
                    .filter((m) => m.planId === p.id)
                    .map((m) => (
                      <MeasurementRow
                        key={m.id}
                        m={m}
                        plan={p}
                        selected={m.id === selectedId}
                        onSelect={() => onSelect(m.id === selectedId ? null : m.id)}
                        onCreateCosting={() => onCreateCosting(m)}
                        onMessage={onMessage}
                        onDeleted={() => onSelect(null)}
                      />
                    ))}
                </ul>
              </section>
            ))
        ) : (
          <Empty />
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="p-6 text-center text-sm text-ink-500">
      <p className="font-medium text-ink-700">No measurements yet</p>
      <p className="mt-1 text-xs">Pick a tool above the plan and click on the drawing to measure lengths, areas and counts.</p>
    </div>
  );
}

function MeasurementRow({ m, plan, selected, onSelect, onCreateCosting, onMessage, onDeleted }: {
  m: MeasurementView;
  plan: PlanView;
  selected: boolean;
  onSelect: () => void;
  onCreateCosting: () => void;
  onMessage: (msg: string, tone?: "ok" | "error") => void;
  onDeleted: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <li ref={ref} data-testid={`measurement-${m.code}`} className={cx("border-b border-ink-100", selected ? "bg-brand-50/60" : "hover:bg-ink-50", pending && "opacity-50")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={selected}>
          <span className="size-3 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: m.colour }} />
          <span className="shrink-0 rounded bg-ink-100 px-1 font-mono text-[11px] font-semibold text-ink-700">{m.code}</span>
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate text-sm", m.description ? "text-ink-900" : "italic text-ink-400")}>{m.description || "Untitled"}</span>
            <span className="block text-[11px] text-ink-500">
              {SHAPE_LABEL[m.shape]}
              {m.isNegative && <span className="ml-1 text-red-700">deduction</span>}
              {m.usedBy > 0 && <span className="ml-1 text-brand-700">· in {m.usedBy} costing{m.usedBy > 1 ? "s" : ""}</span>}
            </span>
          </span>
          <span data-testid="measurement-value" className={cx("shrink-0 text-right text-sm font-medium tabular-nums", m.value < 0 ? "text-red-700" : "text-ink-900")}>
            {formatQuantity(m.value, m.unit)}
          </span>
        </button>
      </div>
      {selected && (
        <div className="space-y-3 border-t border-brand-100 px-3 pb-3 pt-2">
          {shapeKind(m.shape) !== "count" && !plan.scale && (
            <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">This plan has no scale, so the value is 0. Set the scale to measure.</p>
          )}
          <MeasurementEditor key={`${m.id}`} m={m} plan={plan} onMessage={onMessage} />
          <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2">
            <button type="button" onClick={onCreateCosting} className="rounded-md border border-brand-200 bg-white px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
              Create costing item
            </button>
            <span className="flex-1" />
            {confirm ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    start(async () => {
                      const r = await deleteMeasurement(m.id);
                      if (!r.ok) return onMessage(r.error, "error");
                      onMessage(`${m.code} deleted`);
                      onDeleted();
                    })
                  }
                  className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white"
                >
                  Confirm delete
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-100">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                Delete
              </button>
            )}
          </div>
          {m.usedBy > 0 && confirm && <p className="text-xs text-red-700">{m.usedBy} costing item{m.usedBy > 1 ? "s use" : " uses"} [{m.code}] and will show a formula error.</p>}
        </div>
      )}
    </li>
  );
}

function MeasurementEditor({ m, plan, onMessage }: { m: MeasurementView; plan: PlanView; onMessage: (msg: string, tone?: "ok" | "error") => void }) {
  const [description, setDescription] = useState(m.description);
  const [colour, setColour] = useState(m.colour);
  const [pitch, setPitch] = useState(String(m.pitchDegrees || ""));
  const [depth, setDepth] = useState(String(m.depthMm || ""));
  const [height, setHeight] = useState(String(m.heightMm || ""));
  const [negative, setNegative] = useState(m.isNegative);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const kind = shapeKind(m.shape);

  const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const values = { pitchDegrees: num(pitch), depthMm: num(depth), heightMm: num(height), isNegative: negative };
  const invalid = Object.values(values).some((v) => typeof v === "number" && !Number.isFinite(v));
  const preview = invalid ? null : computeMeasurement({ shape: m.shape, points: m.points, scale: plan.scale ? { x: plan.scale, y: plan.scale } : null, ...values });
  const dirty =
    description !== m.description || colour !== m.colour || values.pitchDegrees !== m.pitchDegrees || values.depthMm !== m.depthMm || values.heightMm !== m.heightMm || negative !== m.isNegative;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (invalid) return setError("Enter numbers only for pitch, depth and height.");
    if (values.pitchDegrees < 0 || values.pitchDegrees > 89) return setError("Pitch must be 0–89°");
    if (values.depthMm < 0 || values.heightMm < 0) return setError("Depth and height cannot be negative");
    start(async () => {
      const r = await updateMeasurement(m.id, { description, colour, ...values });
      if (!r.ok) return setError(r.error);
      onMessage(`${m.code} saved`);
    });
  }

  const inputCls = "block w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-400";
  return (
    <form onSubmit={save} noValidate className="space-y-2" aria-label={`Edit ${m.code}`}>
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Description</span>
        <input name="description" autoFocus={!m.description} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. External walls" maxLength={200} className={inputCls} />
      </label>
      <div>
        <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Colour</span>
        <div className="flex flex-wrap items-center gap-1">
          {PALETTE.map((c) => (
            <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColour(c)} className={cx("size-5 rounded-sm ring-offset-1", colour === c ? "ring-2 ring-ink-800" : "ring-1 ring-black/10")} style={{ background: c }} />
          ))}
          <input type="color" aria-label="Custom colour" value={colour} onChange={(e) => setColour(e.target.value)} className="h-5 w-7 cursor-pointer rounded border border-ink-200 p-0" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Pitch °</span>
          <input name="pitch" type="number" step="any" min="0" max="89" inputMode="decimal" value={pitch} onChange={(e) => setPitch(e.target.value)} disabled={kind === "count"} placeholder="0" className={inputCls} />
        </label>
        <label className="block" title="Turns an area into a volume">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Depth mm</span>
          <input name="depth" type="number" step="any" min="0" inputMode="decimal" value={depth} onChange={(e) => setDepth(e.target.value)} disabled={kind !== "area"} placeholder="—" className={inputCls} />
        </label>
        <label className="block" title="Turns a length into a wall area">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Height mm</span>
          <input name="height" type="number" step="any" min="0" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} disabled={kind !== "length"} placeholder="—" className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-800">
        <input type="checkbox" name="negative" checked={negative} onChange={(e) => setNegative(e.target.checked)} className="size-4 accent-brand-600" />
        Deduction (negative)
      </label>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-500">
          Result: <span className="font-semibold tabular-nums text-ink-800" data-testid="editor-preview">{preview ? formatQuantity(preview.value, preview.unit) : "—"}</span>
        </span>
        <button type="submit" disabled={pending || !dirty} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
