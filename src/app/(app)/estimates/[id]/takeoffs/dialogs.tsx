"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Button, Field, Input, Select } from "@/components/ui";
import { calibrateScale, distance, formatQuantity, parseRatio, ratioToScale, scaleToRatio, type Pt } from "@/lib/geometry";
import { cx } from "@/lib/format";
import { createCostingItem, setPlanScale } from "./actions";
import { NEW_CATEGORY, type CategoryOption, type MeasurementView, type PlanView } from "./types";

/** Controlled modal dialog (Esc / backdrop closes). */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Close">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function scaleSummary(plan: PlanView): string {
  if (!plan.scale) return "No scale set";
  const dpi = plan.sourceDpi ?? 96;
  const ratio = scaleToRatio(plan.scale, dpi);
  return `1 px = ${plan.scale.toLocaleString("en-AU", { maximumFractionDigits: 3 })} mm · ≈1:${Math.round(ratio)} @ ${Math.round(dpi)} dpi`;
}

export function ScaleDialog({ open, onClose, plan, line, onDrawLine, onDone }: {
  open: boolean;
  onClose: () => void;
  plan: PlanView;
  line: [Pt, Pt] | null;
  onDrawLine: () => void;
  onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"length" | "ratio">(line ? "length" : "ratio");
  const [length, setLength] = useState("");
  const [unit, setUnit] = useState<"mm" | "m">("m");
  const [ratio, setRatio] = useState("1:100");
  const [dpi, setDpi] = useState(String(plan.sourceDpi ?? 96));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setMode(line ? "length" : "ratio");
    setError(null);
    setDpi(String(plan.sourceDpi ?? 96));
  }, [open, line, plan.sourceDpi]);

  const px = line ? distance(line[0], line[1]) : 0;

  function save() {
    setError(null);
    let mmPerPx: number | null = null;
    let usedDpi: number | null = null;
    if (mode === "length") {
      if (!line) return setError("Draw a line on the plan first.");
      const n = parseFloat(length);
      mmPerPx = calibrateScale(line[0], line[1], n, unit);
      if (!mmPerPx) return setError("Enter the real length of the line (greater than zero).");
    } else {
      const r = parseRatio(ratio);
      const d = parseFloat(dpi);
      if (!r) return setError("Enter a ratio like 1:100.");
      if (!(d > 0)) return setError("Enter the resolution in dots per inch.");
      mmPerPx = ratioToScale(r, d);
      usedDpi = d;
    }
    start(async () => {
      const res = await setPlanScale(plan.id, mmPerPx, usedDpi);
      if (!res.ok) return setError(res.error);
      onDone(`Scale set on ${plan.label}`);
      onClose();
    });
  }

  function clear() {
    start(async () => {
      const res = await setPlanScale(plan.id, null);
      if (!res.ok) return setError(res.error);
      onDone(`Scale removed from ${plan.label}`);
      onClose();
    });
  }

  return (
    <Dialog open={open} title="Set plan scale" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <div className="flex rounded-md border border-ink-200 p-0.5 text-sm">
          {(["length", "ratio"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx("flex-1 rounded px-3 py-1.5 font-medium", mode === m ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50")}
            >
              {m === "length" ? "Known length" : "Drawing ratio"}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-500">Current: {scaleSummary(plan)}</p>
        {mode === "length" ? (
          line ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-700">
                Your line is <span className="font-semibold tabular-nums">{px.toFixed(1)} px</span> long. How long is it in reality?
              </p>
              <div className="flex gap-2">
                <Field label="Real length" className="flex-1">
                  <Input name="realLength" type="number" step="any" min="0" inputMode="decimal" autoFocus value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 3.6" />
                </Field>
                <Field label="Unit" className="w-24">
                  <Select name="unit" value={unit} onChange={(e) => setUnit(e.target.value as "mm" | "m")} options={[{ value: "m", label: "m" }, { value: "mm", label: "mm" }]} />
                </Field>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-ink-50 p-3 text-sm text-ink-700">
              Pick the scale tool and click both ends of a dimension you know, like a wall length or a scale bar.
              <div className="mt-2">
                <Button type="button" variant="secondary" onClick={() => { onClose(); onDrawLine(); }}>Draw calibration line</Button>
              </div>
            </div>
          )
        ) : (
          <div className="flex gap-2">
            <Field label="Ratio" className="flex-1" hint="As printed on the drawing">
              <Input name="ratio" value={ratio} onChange={(e) => setRatio(e.target.value)} placeholder="1:100" />
            </Field>
            <Field label="Resolution (dpi)" className="w-36" hint={plan.sourceDpi ? "From the PDF render" : "Scanned/exported dpi"}>
              <Input name="dpi" type="number" step="any" min="1" value={dpi} onChange={(e) => setDpi(e.target.value)} />
            </Field>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-4">
          {plan.scale ? <Button type="button" variant="ghost" onClick={clear} disabled={pending}>Remove scale</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending || (mode === "length" && !line)}>{pending ? "Saving…" : "Apply scale"}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function CostingDialog({ open, onClose, measurement, categories, estimateId, onDone }: {
  open: boolean;
  onClose: () => void;
  measurement: MeasurementView | null;
  categories: CategoryOption[];
  estimateId: string;
  onDone: (msg: string) => void;
}) {
  const takeoffCat = categories.find((c) => /takeoff items$/i.test(c.label));
  const [categoryId, setCategoryId] = useState(NEW_CATEGORY);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || !measurement) return;
    setCategoryId(takeoffCat?.id ?? categories[0]?.id ?? NEW_CATEGORY);
    setDescription(measurement.description);
    setError(null);
    setCreated(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, measurement?.id]);

  if (!measurement) return null;
  const options = [
    ...categories.map((c) => ({ value: c.id, label: c.label })),
    ...(takeoffCat ? [] : [{ value: NEW_CATEGORY, label: "+ New category “Takeoff items”" }]),
  ];

  return (
    <Dialog open={open} title={`Create costing item from ${measurement.code}`} onClose={onClose}>
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            Costing item added with quantity <code className="rounded bg-ink-100 px-1">[{measurement.code}]</code> ({formatQuantity(measurement.value, measurement.unit)}). Add a unit cost on the Costings tab.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
            <Link href={`/estimates/${estimateId}/costings`} className="inline-flex items-center rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Open costings</Link>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await createCostingItem(measurement.id, categoryId, description);
              if (!r.ok) return setError(r.error);
              setCreated(true);
              onDone(`Costing item created from ${measurement.code}`);
            });
          }}
        >
          <Field label="Category">
            <Select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={options} />
          </Field>
          <Field label="Item description">
            <Input name="itemDescription" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={`Measurement ${measurement.code}`} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3 rounded-md bg-ink-50 p-3 text-xs text-ink-600">
            <div>Quantity formula<div className="mt-0.5 font-mono text-sm text-ink-900">[{measurement.code}]</div></div>
            <div>Unit<div className="mt-0.5 text-sm text-ink-900">{measurement.unit} · {formatQuantity(measurement.value, measurement.unit)}</div></div>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create item"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
