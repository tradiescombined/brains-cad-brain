"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";
import type { Pt, Shape } from "@/lib/geometry";
import { createMeasurement } from "./actions";
import { CostingDialog, ScaleDialog, scaleSummary } from "./dialogs";
import { TakeoffPanel } from "./TakeoffPanel";
import { PlanList, useUploader } from "./PlanList";
import { keyboardBusy, PlanViewer, type PendingShape } from "./PlanViewer";
import { PALETTE, type CategoryOption, type MeasurementView, type PlanView, type TakeoffView, type Tool } from "./types";

const TOOLS: { tool: Tool; label: string; key: string; icon: string; group: number }[] = [
  { tool: "select", label: "Select", key: "v", icon: "↖", group: 0 },
  { tool: "pan", label: "Pan", key: "h", icon: "✋", group: 0 },
  { tool: "scale", label: "Set scale", key: "s", icon: "⟷", group: 1 },
  { tool: "line", label: "Line", key: "l", icon: "╱", group: 2 },
  { tool: "polyline", label: "Polyline", key: "p", icon: "⌇", group: 2 },
  { tool: "rectangle", label: "Rectangle", key: "r", icon: "▭", group: 3 },
  { tool: "polygon", label: "Polygon", key: "g", icon: "⬠", group: 3 },
  { tool: "ellipse", label: "Ellipse", key: "e", icon: "◯", group: 3 },
  { tool: "point", label: "Count", key: "c", icon: "•", group: 4 },
];

type Toast = { text: string; tone: "ok" | "error" } | null;

export function TakeoffWorkspace({ estimateId, plans, takeoffs, measurements, categories, initialPlanId }: {
  estimateId: string;
  plans: PlanView[];
  takeoffs: TakeoffView[];
  measurements: MeasurementView[];
  categories: CategoryOption[];
  initialPlanId?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(() => (initialPlanId && plans.some((p) => p.id === initialPlanId) ? initialPlanId : plans[0]?.id ?? null));
  const [tool, setTool] = useState<Tool>("select");
  /** Selected takeoff: highlighted on every plan, and the takeoff new shapes are added to. */
  const [takeoffId, setTakeoffId] = useState<string | null>(null);
  /** Selected shape (belongs to the selected takeoff). */
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingShape | null>(null);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleLine, setScaleLine] = useState<[Pt, Pt] | null>(null);
  const [costingFor, setCostingFor] = useState<TakeoffView | null>(null);
  const [nextLabel, setNextLabel] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const message = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 6000 : 3000);
  }, []);

  // Keep the active plan valid as plans are added/removed.
  const plan = plans.find((p) => p.id === activeId) ?? plans[0] ?? null;
  useEffect(() => {
    if (plan && plan.id !== activeId) setActiveId(plan.id);
  }, [plan, activeId]);

  // Mirror the active plan into the URL (shareable, survives refresh) without navigation.
  useEffect(() => {
    if (!plan) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("plan") !== plan.id) {
      url.searchParams.set("plan", plan.id);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [plan]);

  const uploader = useUploader(
    estimateId,
    (first, count) => {
      if (first) setActiveId(first);
      message(`${count} plan${count > 1 ? "s" : ""} added`);
    },
    (msg) => message(msg, "error"),
  );

  const target = takeoffs.find((t) => t.id === takeoffId) ?? null;
  const hiddenIds = useMemo(() => new Set(takeoffs.filter((t) => t.hidden).map((t) => t.id)), [takeoffs]);
  const planMeasurements = useMemo(
    () => measurements.filter((m) => m.planId === plan?.id && !hiddenIds.has(m.takeoffId)),
    [measurements, plan?.id, hiddenIds],
  );
  /** Plans holding shapes of the selected takeoff, with how many. */
  const targetCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (target) for (const m of measurements) if (m.takeoffId === target.id) c[m.planId] = (c[m.planId] ?? 0) + 1;
    return c;
  }, [measurements, target]);
  const draftColour = target?.colour ?? PALETTE[takeoffs.length % PALETTE.length];

  // Tool keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keyboardBusy(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t && plan) setTool(t.tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan]);

  const onComplete = useCallback(
    async (shape: Shape, pts: Pt[]) => {
      if (!plan) return;
      const colour = draftColour;
      setPending({ shape, points: pts, colour });
      const r = await createMeasurement({ planId: plan.id, shape, points: pts, colour, description: nextLabel.trim(), takeoffId: target?.id ?? null });
      setPending(null);
      if (!r.ok) return message(r.error, "error");
      setTakeoffId(r.data.takeoffId);
      setShapeId(null);
      message(r.data.created ? `${r.data.code} added` : `Shape added to ${r.data.code}`);
    },
    [plan, draftColour, nextLabel, message, target],
  );

  const onScaleLine = useCallback((a: Pt, b: Pt) => {
    setScaleLine([a, b]);
    setScaleOpen(true);
  }, []);

  /** Selects a shape and its takeoff, switching to the shape's plan. */
  const selectShape = useCallback(
    (id: string | null) => {
      setShapeId(id);
      const m = id ? measurements.find((x) => x.id === id) : null;
      if (m) {
        setTakeoffId(m.takeoffId);
        if (m.planId !== plan?.id) setActiveId(m.planId);
      }
    },
    [measurements, plan?.id],
  );

  /** Canvas: clicking a shape selects it; clicking empty space or Esc clears the selection. */
  const onCanvasSelect = useCallback(
    (id: string | null) => {
      if (id) return selectShape(id);
      setShapeId(null);
      setTakeoffId(null);
    },
    [selectShape],
  );

  const selectTakeoff = useCallback(
    (id: string | null) => {
      setTakeoffId(id);
      setShapeId(null);
      // Show a plan holding the takeoff's shapes when the current plan has none.
      if (id && !measurements.some((m) => m.takeoffId === id && m.planId === plan?.id)) {
        const first = measurements.find((m) => m.takeoffId === id);
        if (first) setActiveId(first.planId);
      }
    },
    [measurements, plan?.id],
  );

  const closeScale = useCallback(() => {
    setScaleOpen(false);
    setScaleLine(null);
    setTool((t) => (t === "scale" ? "select" : t));
  }, []);

  return (
    <div className="space-y-3">
      {uploader.input}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white px-2 py-1.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Takeoff tools">
          {TOOLS.map((t, i) => (
            <span key={t.tool} className="flex items-center">
              {i > 0 && TOOLS[i - 1].group !== t.group && <span className="mx-1 h-5 w-px bg-ink-200" />}
              <button
                type="button"
                disabled={!plan}
                aria-pressed={tool === t.tool}
                title={`${t.label} (${t.key.toUpperCase()})`}
                onClick={() => setTool(t.tool)}
                className={cx(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40",
                  tool === t.tool ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-100",
                )}
              >
                <span aria-hidden className="w-3 text-center">{t.icon}</span>
                {t.label}
              </button>
            </span>
          ))}
        </div>
        <span className="flex-1" />
        <span data-testid="draw-target" className="flex flex-wrap items-center gap-1 text-xs text-ink-600">
          {target ? (
            target.manualExpr != null ? (
              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-800 ring-1 ring-violet-200">{target.code} is entered manually</span>
            ) : (
              <span className="flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-brand-800 ring-1 ring-brand-200">
                <span className="size-2.5 rounded-sm" style={{ background: target.colour }} />
                Drawing adds to <strong className="font-semibold">{target.code}</strong>
              </span>
            )
          ) : (
            <span>Drawing creates a new takeoff</span>
          )}
          {target && (
            <button type="button" onClick={() => selectTakeoff(null)} className="rounded px-1.5 py-0.5 font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-100">
              New takeoff
            </button>
          )}
        </span>
        {!target && (
          <label className="flex items-center gap-1.5 text-xs text-ink-600">
            Label new as
            <input
              value={nextLabel}
              onChange={(e) => setNextLabel(e.target.value)}
              placeholder="e.g. External walls"
              aria-label="Description for new takeoffs"
              maxLength={200}
              className="w-40 rounded-md border border-ink-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
            />
          </label>
        )}
        {plan && (
          <button
            type="button"
            onClick={() => setScaleOpen(true)}
            data-testid="scale-status"
            className={cx(
              "rounded-md px-2 py-1 text-xs font-medium",
              plan.scale ? "bg-ink-50 text-ink-700 ring-1 ring-ink-200 hover:bg-ink-100" : "bg-amber-50 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100",
            )}
          >
            {plan.scale ? `Scale: ${scaleSummary(plan)}` : "⚠ No scale set — click to set"}
          </button>
        )}
      </div>

      {plan && !plan.scale && (
        <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong className="font-semibold">{plan.label}</strong> has no scale yet, so lengths and areas read 0. Use <em>Set scale</em> and click both ends of a known dimension, or enter the drawing ratio. Counts work without a scale.
        </div>
      )}

      {/* Three-pane workspace: takeoffs | plan | plans */}
      <div className="grid grid-cols-1 gap-3 lg:h-[calc(100vh-15rem)] lg:min-h-[560px] lg:grid-cols-[340px_minmax(0,1fr)_200px]">
        <aside className="order-2 max-h-[70vh] overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xs lg:order-1 lg:max-h-none">
          <TakeoffPanel
            estimateId={estimateId}
            plans={plans}
            takeoffs={takeoffs}
            measurements={measurements}
            selectedTakeoffId={target?.id ?? null}
            selectedShapeId={shapeId}
            onSelectTakeoff={selectTakeoff}
            onSelectShape={selectShape}
            onCreateCosting={setCostingFor}
            onMessage={message}
          />
        </aside>

        <section className="order-1 h-[60vh] min-h-[380px] overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xs lg:order-2 lg:h-auto">
          {plan ? (
            <PlanViewer
              key={plan.id}
              plan={plan}
              measurements={planMeasurements}
              selectedId={shapeId}
              highlightTakeoffId={target?.id ?? null}
              onSelect={onCanvasSelect}
              tool={tool}
              pending={pending}
              draftColour={draftColour}
              onComplete={onComplete}
              onScaleLine={onScaleLine}
              onHint={(m) => message(m, "error")}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="text-4xl text-ink-300" aria-hidden>⌗</div>
              <p className="text-base font-medium text-ink-800">No plans uploaded yet</p>
              <p className="max-w-sm text-sm text-ink-500">Upload floor plans or elevations as PNG, JPG or PDF. Every PDF page becomes its own plan you can scale and measure.</p>
              <button type="button" onClick={uploader.open} disabled={!!uploader.progress} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {uploader.progress ?? "Upload plans"}
              </button>
            </div>
          )}
        </section>

        <aside className="order-3 max-h-80 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xs lg:max-h-none">
          <PlanList
            plans={plans}
            activeId={plan?.id ?? null}
            highlight={target ? { code: target.code, counts: targetCounts } : null}
            onActivate={(id) => {
              setActiveId(id);
              setShapeId(null);
            }}
            onOpenUpload={uploader.open}
            onDropFiles={uploader.upload}
            progress={uploader.progress}
            onMessage={message}
          />
        </aside>
      </div>

      {plan && (
        <ScaleDialog
          open={scaleOpen}
          onClose={closeScale}
          plan={plan}
          line={scaleLine}
          onDrawLine={() => setTool("scale")}
          onDone={(m) => message(m)}
        />
      )}
      <CostingDialog
        open={!!costingFor}
        onClose={() => setCostingFor(null)}
        takeoff={costingFor}
        categories={categories}
        estimateId={estimateId}
        onDone={(m) => message(m)}
      />

      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          data-testid="toast"
          className={cx(
            "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg",
            toast.tone === "error" ? "bg-red-600 text-white" : "bg-ink-900 text-white",
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
