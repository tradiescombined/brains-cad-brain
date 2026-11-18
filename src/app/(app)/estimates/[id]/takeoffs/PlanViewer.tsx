"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  centroid, computeMeasurement, distance, ellipseFromCorners, fitView, formatQuantity, isValidShape, maxPoints,
  minPoints, outline, screenToImage, shapeKind, snapOrthogonal, zoomAt, type Pt, type Shape, type View,
} from "@/lib/geometry";
import { SHAPE_LABEL, type MeasurementView, type PlanView, type Tool } from "./types";

export interface PendingShape { shape: Shape; points: Pt[]; colour: string }

interface Props {
  plan: PlanView;
  measurements: MeasurementView[];
  selectedId: string | null;
  /** Takeoff whose shapes are highlighted. */
  highlightTakeoffId?: string | null;
  onSelect: (id: string | null) => void;
  tool: Tool;
  pending: PendingShape | null;
  draftColour: string;
  onComplete: (shape: Shape, pts: Pt[]) => void;
  onScaleLine: (a: Pt, b: Pt) => void;
  onHint: (msg: string) => void;
}

const DRAW_TOOLS: Tool[] = ["line", "polyline", "rectangle", "polygon", "ellipse", "point", "scale"];
const isDrawTool = (t: Tool) => DRAW_TOOLS.includes(t);

/** True when keyboard input is going to a form field or a dialog is open. */
export function keyboardBusy(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.isContentEditable)) return true;
  return !!document.querySelector("[role=dialog]");
}

export function PlanViewer({ plan, measurements, selectedId, highlightTakeoffId = null, onSelect, tool, pending, draftColour, onComplete, onScaleLine, onHint }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [shift, setShift] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** Screen position + time of the last accepted click, to swallow the 2nd click of a double-click. */
  const lastClick = useRef<{ x: number; y: number; t: number } | null>(null);
  const pan = useRef<{ sx: number; sy: number; v: View; moved: boolean; deselect: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const fittedFor = useRef<string | null>(null);

  const scale = plan.scale ? { x: plan.scale, y: plan.scale } : null;
  const drawShape: Shape | "scale" | null = isDrawTool(tool) ? (tool as Shape | "scale") : null;

  // Track viewport size.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (size.w && size.h) setView(fitView(plan.width, plan.height, size.w, size.h));
  }, [plan.width, plan.height, size.w, size.h]);

  // Fit whenever a different plan is shown (once the viewport has a size).
  useLayoutEffect(() => {
    if (!size.w || !size.h || fittedFor.current === plan.id) return;
    fittedFor.current = plan.id;
    fit();
  }, [plan.id, size.w, size.h, fit]);

  // Reset the draft when tool or plan changes.
  useEffect(() => {
    setDraft([]);
    setCursor(null);
  }, [tool, plan.id]);

  const zoomBy = useCallback((factor: number, sx?: number, sy?: number) => {
    const el = wrapRef.current;
    const cxp = sx ?? (el ? el.clientWidth / 2 : 0);
    const cyp = sy ?? (el ? el.clientHeight / 2 : 0);
    setView((v) => zoomAt(v, factor, cxp, cyp));
  }, []);

  // Wheel zoom (non-passive so the page does not scroll).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const finish = useCallback(
    (pts: Pt[] = draft) => {
      if (!drawShape) return;
      if (drawShape === "scale") {
        if (pts.length === 2 && distance(pts[0], pts[1]) > 0) onScaleLine(pts[0], pts[1]);
        else onHint("Click two points over a dimension you know.");
        setDraft([]);
        return;
      }
      if (!isValidShape(drawShape, pts)) {
        if (pts.length) onHint(`${SHAPE_LABEL[drawShape]} needs at least ${minPoints(drawShape)} points.`);
        return;
      }
      onComplete(drawShape, pts);
      setDraft([]);
    },
    [draft, drawShape, onComplete, onScaleLine, onHint],
  );

  // Keyboard: Enter finish, Esc cancel, Backspace undo, Space pan, Shift snap, +/- zoom, 0 fit.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(true);
      if (keyboardBusy(e)) return;
      if (e.key === " ") {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (e.key === "Enter" && draft.length) {
        e.preventDefault();
        finish();
      } else if (e.key === "Escape") {
        if (draft.length) setDraft([]);
        else onSelect(null);
      } else if ((e.key === "Backspace" || e.key === "Delete") && draft.length) {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
      } else if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-" || e.key === "_") zoomBy(0.8);
      else if (e.key === "0") fit();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(false);
      if (e.key === " ") setSpaceHeld(false);
    };
    const blur = () => { setShift(false); setSpaceHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [draft, finish, fit, onSelect, zoomBy]);

  function localPoint(e: { clientX: number; clientY: number }): [number, number] {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function imagePoint(e: { clientX: number; clientY: number; shiftKey: boolean }, base: Pt[]): Pt {
    const [sx, sy] = localPoint(e);
    let p = screenToImage(viewRef.current, sx, sy);
    p = [Math.min(Math.max(p[0], 0), plan.width), Math.min(Math.max(p[1], 0), plan.height)];
    const snapTool = drawShape && drawShape !== "rectangle" && drawShape !== "ellipse" && drawShape !== "point";
    if (e.shiftKey && snapTool && base.length) p = snapOrthogonal(base[base.length - 1], p);
    return p;
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const wantsPan = e.button === 1 || (e.button === 0 && (tool === "pan" || spaceHeld || tool === "select"));
    if (wantsPan) {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      pan.current = { sx: e.clientX, sy: e.clientY, v: viewRef.current, moved: false, deselect: tool === "select" && e.button === 0 && !spaceHeld };
      setPanning(true);
      return;
    }
    if (e.button !== 0 || !drawShape) return;
    const p = imagePoint(e, draft);
    // Ignore a repeat click on the same spot (the second click of a double-click). Compare raw
    // screen positions so Shift-snapping cannot turn the repeat click into a new vertex.
    const lc = lastClick.current;
    if (draft.length && lc && Math.hypot(e.clientX - lc.x, e.clientY - lc.y) < 5 && e.timeStamp - lc.t < 600) return;
    lastClick.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const next = [...draft, p];
    const limit = drawShape === "scale" ? 2 : maxPoints(drawShape);
    if (next.length >= limit) finish(next);
    else setDraft(next);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const pn = pan.current;
    if (pn) {
      const dx = e.clientX - pn.sx;
      const dy = e.clientY - pn.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) pn.moved = true;
      setView({ ...pn.v, x: pn.v.x + dx, y: pn.v.y + dy });
      return;
    }
    if (drawShape) setCursor(imagePoint(e, draft));
  }

  function onPointerUp() {
    const pn = pan.current;
    if (pn && !pn.moved && pn.deselect) onSelect(null);
    pan.current = null;
    setPanning(false);
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (!drawShape || drawShape === "scale") return;
    if (maxPoints(drawShape) === 2) return;
    e.preventDefault();
    finish();
  }

  // Live preview geometry and readout.
  const preview = useMemo(() => {
    if (!drawShape) return null;
    const pts = cursor && draft.length && drawShape !== "point" ? [...draft, cursor] : draft;
    if (!pts.length) return null;
    if (drawShape === "scale") {
      return { pts, text: pts.length === 2 ? `${distance(pts[0], pts[1]).toFixed(1)} px — click to set the known length` : "Click the second point" };
    }
    const r = computeMeasurement({ shape: drawShape, points: pts, scale });
    const kind = shapeKind(drawShape);
    const label = kind === "length" ? "Length" : kind === "area" ? "Area" : "Count";
    let text = r.needsScale ? `${label}: set a scale to measure` : `${label}: ${formatQuantity(r.value, r.unit)}`;
    if (kind !== "count" && scale && pts.length >= 2 && drawShape !== "rectangle" && drawShape !== "ellipse") {
      const seg = (distance(pts[pts.length - 2], pts[pts.length - 1]) * scale.x) / 1000;
      text += ` · segment ${seg.toFixed(2)} m`;
    }
    return { pts, text };
  }, [cursor, draft, drawShape, scale]);

  const z = view.zoom;
  const cursorStyle = panning ? "grabbing" : tool === "pan" || spaceHeld ? "grab" : drawShape ? "crosshair" : "default";
  const hint = drawShape
    ? drawShape === "scale"
      ? "Click both ends of a known dimension"
      : maxPoints(drawShape as Shape) === 2
        ? "Click two points · Esc cancels"
        : "Click to add points · double-click or Enter to finish · Backspace undoes · Shift snaps 90°"
    : tool === "pan"
      ? "Drag to pan · scroll to zoom"
      : "Click a shape to select its takeoff · drag to pan · scroll to zoom";

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-ink-100">
      <svg
        ref={svgRef}
        data-testid="plan-canvas"
        data-view={JSON.stringify({ zoom: view.zoom, x: view.x, y: view.y })}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        onAuxClick={(e) => e.preventDefault()}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${z})`}>
          <rect width={plan.width} height={plan.height} fill="#fff" />
          <image href={plan.src} width={plan.width} height={plan.height} preserveAspectRatio="none" />
          <rect width={plan.width} height={plan.height} fill="none" stroke="#c5ccd5" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <g pointerEvents={tool === "select" ? "visiblePainted" : "none"}>
            {measurements.map((m) => (
              <MeasurementShape
                key={m.id}
                m={m}
                zoom={z}
                selected={m.id === selectedId}
                highlighted={m.takeoffId === highlightTakeoffId}
                dimmed={!!highlightTakeoffId && m.takeoffId !== highlightTakeoffId}
                onSelect={() => onSelect(m.id)}
              />
            ))}
          </g>
          {pending && <ShapeGeometry shape={pending.shape} pts={pending.points} colour={pending.colour} zoom={z} dashed />}
          {preview && drawShape && (
            drawShape === "scale" ? (
              <g pointerEvents="none">
                <polyline points={preview.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                {preview.pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={5 / z} fill="#dc2626" />)}
              </g>
            ) : (
              <g pointerEvents="none">
                <ShapeGeometry shape={drawShape} pts={preview.pts} colour={draftColour} zoom={z} dashed open={drawShape === "polygon" && preview.pts.length < 3} />
                {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={4 / z} fill="#fff" stroke={draftColour} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
              </g>
            )
          )}
        </g>
      </svg>

      {/* Readouts */}
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1.5">
        {preview && (
          <div data-testid="live-readout" className="rounded-md bg-ink-900/85 px-2.5 py-1 text-xs font-medium text-white tabular-nums shadow">
            {preview.text}
          </div>
        )}
        <div className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] text-ink-600 shadow-xs ring-1 ring-ink-200">{hint}</div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center overflow-hidden rounded-md border border-ink-200 bg-white text-sm shadow-sm">
        <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomBy(0.8)} className="px-2.5 py-1.5 text-ink-700 hover:bg-ink-50">−</button>
        <span data-testid="zoom-level" className="min-w-14 border-x border-ink-200 px-2 py-1.5 text-center text-xs tabular-nums text-ink-600">{Math.round(z * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1.25)} className="px-2.5 py-1.5 text-ink-700 hover:bg-ink-50">+</button>
        <button type="button" aria-label="Fit to screen" title="Fit to screen (0)" onClick={fit} className="border-l border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">Fit</button>
      </div>
    </div>
  );
}

function MeasurementShape({ m, zoom, selected, highlighted, dimmed, onSelect }: { m: MeasurementView; zoom: number; selected: boolean; highlighted: boolean; dimmed: boolean; onSelect: () => void }) {
  const [lx, ly] = m.shape === "point" ? m.points[0] ?? [0, 0] : centroid(outline(m.shape, m.points));
  return (
    <g
      data-testid={`shape-${m.code}`}
      data-highlighted={highlighted ? "true" : undefined}
      opacity={dimmed ? 0.45 : 1}
      className="cursor-pointer"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect();
      }}
    >
      <ShapeGeometry shape={m.shape} pts={m.points} colour={m.colour} zoom={zoom} selected={selected} highlighted={highlighted} negative={m.isNegative} />
      <text
        x={lx}
        y={ly}
        dy={m.shape === "point" ? -10 / zoom : 0}
        fontSize={12 / zoom}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={m.colour}
        stroke="#fff"
        strokeWidth={3 / zoom}
        paintOrder="stroke"
        pointerEvents="none"
      >
        {m.code}
      </text>
    </g>
  );
}

function ShapeGeometry({ shape, pts, colour, zoom, selected, highlighted, dashed, negative, open }: { shape: Shape; pts: Pt[]; colour: string; zoom: number; selected?: boolean; highlighted?: boolean; dashed?: boolean; negative?: boolean; open?: boolean }) {
  const sw = selected ? 4 : highlighted ? 3 : 2;
  const common = {
    stroke: colour,
    strokeWidth: sw,
    vectorEffect: "non-scaling-stroke" as const,
    strokeDasharray: dashed || negative ? "6 4" : undefined,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  const fillOpacity = negative ? 0.08 : selected ? 0.32 : highlighted ? 0.26 : 0.18;
  const handles = selected ? pts.map((p, i) => <rect key={i} x={p[0] - 4 / zoom} y={p[1] - 4 / zoom} width={8 / zoom} height={8 / zoom} fill="#fff" stroke={colour} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />) : null;
  if (shape === "point") {
    return (
      <g>
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={(selected ? 8 : 6) / zoom} fill={colour} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {selected && <text x={p[0]} y={p[1]} fontSize={8 / zoom} fill="#fff" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{i + 1}</text>}
          </g>
        ))}
      </g>
    );
  }
  if (pts.length < 2) return null;
  if (shape === "ellipse") {
    const e = ellipseFromCorners(pts[0], pts[1]);
    return (
      <g>
        <ellipse cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill={colour} fillOpacity={fillOpacity} {...common} />
        {selected && <rect x={Math.min(pts[0][0], pts[1][0])} y={Math.min(pts[0][1], pts[1][1])} width={e.rx * 2} height={e.ry * 2} fill="none" stroke={colour} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </g>
    );
  }
  const poly = outline(shape, pts).map((p) => p.join(",")).join(" ");
  const isArea = shapeKind(shape) === "area" && !open;
  return (
    <g>
      {/* Wide transparent hit area makes thin lines easy to click. */}
      {!isArea && <polyline points={poly} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />}
      {isArea ? <polygon points={poly} fill={colour} fillOpacity={fillOpacity} {...common} /> : <polyline points={poly} fill="none" {...common} />}
      {handles}
    </g>
  );
}

