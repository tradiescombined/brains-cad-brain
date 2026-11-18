"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { computeMeasurement, formatQuantity, shapeKind, unitLabel } from "@/lib/geometry";
import { evaluateManual, matchesTakeoff, TAKEOFF_UNITS } from "@/lib/takeoffs";
import { cx } from "@/lib/format";
import { createManualTakeoff, deleteMeasurement, deleteTakeoff, moveTakeoff, setTakeoffManual, updateMeasurement, updateTakeoff } from "./actions";
import { PALETTE, SHAPE_LABEL, type MeasurementView, type PlanView, type TakeoffView } from "./types";

type Msg = (msg: string, tone?: "ok" | "error") => void;

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-400";
const smallBtn = "rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40";

export function TakeoffPanel({ estimateId, plans, takeoffs, measurements, selectedTakeoffId, selectedShapeId, onSelectTakeoff, onSelectShape, onCreateCosting, onMessage }: {
  estimateId: string;
  plans: PlanView[];
  takeoffs: TakeoffView[];
  measurements: MeasurementView[];
  selectedTakeoffId: string | null;
  selectedShapeId: string | null;
  onSelectTakeoff: (id: string | null) => void;
  onSelectShape: (id: string | null) => void;
  onCreateCosting: (t: TakeoffView) => void;
  onMessage: Msg;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const shown = takeoffs.filter((t) => matchesTakeoff(t, query));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Takeoffs <span className="font-normal text-ink-400">({takeoffs.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700">
            + Manual takeoff
          </button>
          <Link href={`/estimates/${estimateId}/takeoffs/print`} className={smallBtn} title="Printable takeoff list">
            Print
          </Link>
        </div>
      </div>
      {adding && <NewManualTakeoff estimateId={estimateId} onClose={() => setAdding(false)} onCreated={(id) => onSelectTakeoff(id)} onMessage={onMessage} colour={PALETTE[takeoffs.length % PALETTE.length]} />}
      <div className="border-b border-ink-100 px-3 py-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search takeoffs…" aria-label="Search takeoffs" className={inputCls} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {takeoffs.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-500">
            <p className="font-medium text-ink-700">No takeoffs yet</p>
            <p className="mt-1 text-xs">Pick a tool above the plan and draw to create a takeoff, or add one with the calculator using “+ Manual takeoff”.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-500">No takeoffs match “{query}”.</p>
        ) : (
          <ul>
            {shown.map((t) => (
              <TakeoffRow
                key={t.id}
                t={t}
                index={takeoffs.indexOf(t)}
                total={takeoffs.length}
                plans={plans}
                shapes={measurements.filter((m) => m.takeoffId === t.id)}
                selected={t.id === selectedTakeoffId}
                selectedShapeId={selectedShapeId}
                onSelect={() => onSelectTakeoff(t.id === selectedTakeoffId ? null : t.id)}
                onSelectShape={onSelectShape}
                onCreateCosting={() => onCreateCosting(t)}
                onDeleted={() => onSelectTakeoff(null)}
                onMessage={onMessage}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewManualTakeoff({ estimateId, colour, onClose, onCreated, onMessage }: { estimateId: string; colour: string; onClose: () => void; onCreated: (id: string) => void; onMessage: Msg }) {
  const [description, setDescription] = useState("");
  const [expr, setExpr] = useState("");
  const [unit, setUnit] = useState("m");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ev = expr.trim() ? evaluateManual(expr) : null;
  return (
    <form
      aria-label="New manual takeoff"
      noValidate
      className="space-y-2 border-b border-brand-100 bg-brand-50/40 px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!expr.trim()) return setError("Enter a value or calculation");
        if (ev?.error) return setError(`Calculation: ${ev.error}`);
        start(async () => {
          const r = await createManualTakeoff(estimateId, { description, expr, unit: unit as "m", colour });
          if (!r.ok) return setError(r.error);
          onMessage(`${r.data.code} added`);
          onCreated(r.data.id);
          onClose();
        });
      }}
    >
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Description</span>
        <input name="description" autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Junctions @ 2.4" maxLength={200} className={inputCls} />
      </label>
      <CalcFields expr={expr} setExpr={setExpr} unit={unit} setUnit={setUnit} />
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-100">Cancel</button>
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Adding…" : "Add takeoff"}
        </button>
      </div>
    </form>
  );
}

/** Calculator expression + unit inputs with a live result. */
function CalcFields({ expr, setExpr, unit, setUnit }: { expr: string; setExpr: (s: string) => void; unit: string; setUnit: (s: string) => void }) {
  const ev = expr.trim() ? evaluateManual(expr) : null;
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-1.5">
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Value or calculation</span>
          <input name="expr" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="e.g. 12.5*2 + 3.6" inputMode="decimal" maxLength={500} className={cx(inputCls, "font-mono")} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Unit</span>
          <select name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
            {TAKEOFF_UNITS.map((u) => (
              <option key={u} value={u}>{unitLabel(u)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-[11px] text-ink-500">
        {ev?.error ? (
          <span className="text-red-700">{ev.error}</span>
        ) : (
          <>
            = <span data-testid="calc-preview" className="font-semibold tabular-nums text-ink-800">{formatQuantity(ev?.value ?? 0, unit)}</span>
            <span className="ml-1 text-ink-400">· + − × ÷ ^ ( ), round(), ceil(), max()…</span>
          </>
        )}
      </p>
    </div>
  );
}

function TakeoffRow({ t, index, total, plans, shapes, selected, selectedShapeId, onSelect, onSelectShape, onCreateCosting, onDeleted, onMessage }: {
  t: TakeoffView;
  index: number;
  total: number;
  plans: PlanView[];
  shapes: MeasurementView[];
  selected: boolean;
  selectedShapeId: string | null;
  onSelect: () => void;
  onSelectShape: (id: string | null) => void;
  onCreateCosting: () => void;
  onDeleted: () => void;
  onMessage: Msg;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const manual = t.manualExpr != null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string, after?: () => void) {
    start(async () => {
      const r = await fn();
      if (!r.ok) return onMessage(r.error ?? "Something went wrong", "error");
      if (success) onMessage(success);
      after?.();
    });
  }

  return (
    <li ref={ref} data-testid={`takeoff-${t.code}`} data-hidden={t.hidden ? "true" : undefined} className={cx("border-b border-ink-100", selected ? "bg-brand-50/60" : "hover:bg-ink-50", pending && "opacity-50")}>
      <div className="flex items-center gap-1 py-1.5 pl-3 pr-1.5">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left" aria-expanded={selected} aria-label={`${t.code} ${t.description || "Untitled"}`}>
          <span className="size-3 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: t.colour }} />
          <span className="shrink-0 rounded bg-ink-100 px-1 font-mono text-[11px] font-semibold text-ink-700">{t.code}</span>
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate text-sm", t.description ? "text-ink-900" : "italic text-ink-400", t.hidden && "opacity-60")}>{t.description || "Untitled"}</span>
            <span className="block text-[11px] text-ink-500">
              {manual ? <span className="text-violet-700">Manual</span> : `${t.shapeCount} shape${t.shapeCount === 1 ? "" : "s"}`}
              {t.usedBy > 0 && <span className="ml-1 text-brand-700">· in {t.usedBy} costing{t.usedBy > 1 ? "s" : ""}</span>}
            </span>
          </span>
          <span data-testid="takeoff-value" className={cx("shrink-0 text-right text-sm font-medium tabular-nums", t.value < 0 ? "text-red-700" : "text-ink-900")}>
            {formatQuantity(t.value, t.unit)}
          </span>
        </button>
        <button
          type="button"
          aria-label={t.hidden ? `Show ${t.code}` : `Hide ${t.code}`}
          aria-pressed={t.hidden}
          title={t.hidden ? "Hidden on plans: click to show" : "Hide on plans"}
          onClick={() => run(() => updateTakeoff(t.id, { hidden: !t.hidden }))}
          className={cx("shrink-0 rounded px-1.5 py-1 text-xs hover:bg-ink-100", t.hidden ? "text-ink-400" : "text-ink-600")}
        >
          <EyeIcon off={t.hidden} />
        </button>
      </div>
      {selected && (
        <div className="space-y-3 border-t border-brand-100 px-3 pb-3 pt-2">
          {!manual && <p className="text-[11px] text-brand-800">Draw on any plan to add shapes to {t.code}. Tick “Deduction” on a shape to subtract it.</p>}
          <TakeoffEditor key={`${t.id}-${t.description}-${t.colour}`} t={t} onMessage={onMessage} />
          <ManualEditor key={`${t.id}-${t.manualExpr}-${t.unit}`} t={t} hasShapes={shapes.length > 0} onMessage={onMessage} />
          {shapes.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ink-600">
                <span>Shapes{manual && <span className="ml-1 font-normal text-ink-400">(ignored while manual)</span>}</span>
              </div>
              <ul className="divide-y divide-ink-100 rounded-md border border-ink-200 bg-white">
                {shapes.map((m, i) => (
                  <ShapeRow
                    key={m.id}
                    m={m}
                    n={i + 1}
                    plan={plans.find((p) => p.id === m.planId)}
                    selected={m.id === selectedShapeId}
                    onSelect={() => onSelectShape(m.id === selectedShapeId ? null : m.id)}
                    onDeleted={() => onSelectShape(null)}
                    onMessage={onMessage}
                  />
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2">
            <button type="button" onClick={onCreateCosting} className="rounded-md border border-brand-200 bg-white px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
              Create costing item
            </button>
            <button type="button" aria-label="Move up" title="Move up" disabled={index <= 0} onClick={() => run(() => moveTakeoff(t.id, "up"))} className={smallBtn}>↑</button>
            <button type="button" aria-label="Move down" title="Move down" disabled={index >= total - 1} onClick={() => run(() => moveTakeoff(t.id, "down"))} className={smallBtn}>↓</button>
            <span className="flex-1" />
            {confirm ? (
              <>
                <button type="button" onClick={() => run(() => deleteTakeoff(t.id), `${t.code} deleted`, onDeleted)} className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white">
                  Confirm delete
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-100">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                Delete takeoff
              </button>
            )}
          </div>
          {confirm && (
            <p className="text-xs text-red-700">
              Deletes {t.code}
              {t.shapeCount ? ` and its ${t.shapeCount} shape${t.shapeCount > 1 ? "s" : ""}` : ""}.
              {t.usedBy > 0 && ` ${t.usedBy} costing item${t.usedBy > 1 ? "s use" : " uses"} [${t.code}] and will show a formula error.`}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.5" />
      {off && <path d="M3 17 17 3" />}
    </svg>
  );
}

function TakeoffEditor({ t, onMessage }: { t: TakeoffView; onMessage: Msg }) {
  const [description, setDescription] = useState(t.description);
  const [colour, setColour] = useState(t.colour);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = description !== t.description || colour !== t.colour;
  return (
    <form
      aria-label={`Edit ${t.code}`}
      noValidate
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await updateTakeoff(t.id, { description, colour });
          if (!r.ok) return setError(r.error);
          onMessage(`${t.code} saved`);
        });
      }}
    >
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Description</span>
        <input name="description" autoFocus={!t.description} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. External walls" maxLength={200} className={inputCls} />
      </label>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="mb-0.5 block text-[11px] font-medium text-ink-600">Colour</span>
          <div className="flex flex-wrap items-center gap-1">
            {PALETTE.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColour(c)} className={cx("size-5 rounded-sm ring-offset-1", colour === c ? "ring-2 ring-ink-800" : "ring-1 ring-black/10")} style={{ background: c }} />
            ))}
            <input type="color" aria-label="Custom colour" value={colour} onChange={(e) => setColour(e.target.value)} className="h-5 w-7 cursor-pointer rounded border border-ink-200 p-0" />
          </div>
        </div>
        <button type="submit" disabled={pending || !dirty} className="shrink-0 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </form>
  );
}

/** Calculator: enter the takeoff's value by hand (replaces the sum of its shapes), or switch back. */
function ManualEditor({ t, hasShapes, onMessage }: { t: TakeoffView; hasShapes: boolean; onMessage: Msg }) {
  const manual = t.manualExpr != null;
  const [open, setOpen] = useState(manual);
  const [expr, setExpr] = useState(t.manualExpr ?? (t.value ? String(t.value) : ""));
  const [unit, setUnit] = useState(t.unit);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={smallBtn}>
        <span aria-hidden className="mr-1">▦</span>Enter value manually
      </button>
    );
  }
  return (
    <form
      aria-label={`Calculator for ${t.code}`}
      noValidate
      className="space-y-2 rounded-md border border-violet-200 bg-violet-50/40 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const ev = evaluateManual(expr);
        if (!expr.trim()) return setError("Enter a value or calculation");
        if (ev.error) return setError(`Calculation: ${ev.error}`);
        start(async () => {
          const r = await setTakeoffManual(t.id, expr, unit);
          if (!r.ok) return setError(r.error);
          onMessage(`${t.code} = ${formatQuantity(r.data.value, unit)}`);
        });
      }}
    >
      <p className="text-[11px] font-medium text-violet-900">Manual value{hasShapes && !manual ? " (replaces the drawn shapes' total)" : ""}</p>
      <CalcFields expr={expr} setExpr={setExpr} unit={unit} setUnit={setUnit} />
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-1.5">
        {manual ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setTakeoffManual(t.id, null);
                if (!r.ok) return setError(r.error);
                onMessage(`${t.code} now uses its drawn shapes`);
              })
            }
            className="rounded-md px-2 py-1 text-xs text-ink-700 hover:bg-ink-100"
          >
            Use drawn shapes
          </button>
        ) : (
          <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-100">Cancel</button>
        )}
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save value"}
        </button>
      </div>
    </form>
  );
}

function ShapeRow({ m, n, plan, selected, onSelect, onDeleted, onMessage }: {
  m: MeasurementView;
  n: number;
  plan: PlanView | undefined;
  selected: boolean;
  onSelect: () => void;
  onDeleted: () => void;
  onMessage: Msg;
}) {
  const [pending, start] = useTransition();
  return (
    <li data-testid="shape-row" className={cx(selected && "bg-brand-50", pending && "opacity-50")}>
      <div className="flex items-center gap-1 px-2 py-1">
        <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs">
          <span className="w-4 shrink-0 text-right tabular-nums text-ink-400">{n}</span>
          <span className="min-w-0 flex-1 truncate text-ink-700">
            {SHAPE_LABEL[m.shape]} · {plan?.label ?? "Plan"}
            {m.isNegative && <span className="ml-1 text-red-700">deduction</span>}
          </span>
          <span data-testid="shape-value" className={cx("shrink-0 tabular-nums", m.value < 0 ? "text-red-700" : "text-ink-900")}>{formatQuantity(m.value, m.unit)}</span>
        </button>
        <button
          type="button"
          aria-label={`Delete shape ${n}`}
          title="Delete shape"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteMeasurement(m.id);
              if (!r.ok) return onMessage(r.error, "error");
              onMessage(`Shape removed from ${m.code}`);
              onDeleted();
            })
          }
          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50"
        >
          ✕
        </button>
      </div>
      {selected && (
        <div className="border-t border-brand-100 px-2 pb-2 pt-1.5">
          {shapeKind(m.shape) !== "count" && !plan?.scale && (
            <p className="mb-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">This plan has no scale, so the value is 0. Set the scale to measure.</p>
          )}
          <ShapeEditor key={m.id} m={m} plan={plan} onMessage={onMessage} />
        </div>
      )}
    </li>
  );
}

function ShapeEditor({ m, plan, onMessage }: { m: MeasurementView; plan: PlanView | undefined; onMessage: Msg }) {
  const [pitch, setPitch] = useState(String(m.pitchDegrees || ""));
  const [depth, setDepth] = useState(String(m.depthMm || ""));
  const [height, setHeight] = useState(String(m.heightMm || ""));
  const [negative, setNegative] = useState(m.isNegative);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const kind = shapeKind(m.shape);

  const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const values = { pitchDegrees: num(pitch), depthMm: num(depth), heightMm: num(height), isNegative: negative };
  const invalid = [values.pitchDegrees, values.depthMm, values.heightMm].some((v) => !Number.isFinite(v));
  const preview = invalid ? null : computeMeasurement({ shape: m.shape, points: m.points, scale: plan?.scale ? { x: plan.scale, y: plan.scale } : null, ...values });
  const dirty = values.pitchDegrees !== m.pitchDegrees || values.depthMm !== m.depthMm || values.heightMm !== m.heightMm || negative !== m.isNegative;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (invalid) return setError("Enter numbers only for pitch, depth and height.");
    if (values.pitchDegrees < 0 || values.pitchDegrees > 89) return setError("Pitch must be 0–89°");
    if (values.depthMm < 0 || values.heightMm < 0) return setError("Depth and height cannot be negative");
    start(async () => {
      const r = await updateMeasurement(m.id, values);
      if (!r.ok) return setError(r.error);
      onMessage(`Shape saved (${m.code})`);
    });
  }

  return (
    <form onSubmit={save} noValidate className="space-y-2" aria-label="Edit shape">
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
        Deduction (subtract from {m.code})
      </label>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-500">
          Result: <span className="font-semibold tabular-nums text-ink-800" data-testid="editor-preview">{preview ? formatQuantity(preview.value, preview.unit) : "—"}</span>
        </span>
        <button type="submit" disabled={pending || !dirty} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save shape"}
        </button>
      </div>
    </form>
  );
}
