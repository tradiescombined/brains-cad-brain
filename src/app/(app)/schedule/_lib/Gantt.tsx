/**
 * Server-rendered Gantt chart (pure HTML/CSS, print friendly).
 * Rows are tasks or group headers; bars span working days; weekends shaded; today line.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { addCalendarDays, calendarDaysBetween, isWorkingDay, weekStart } from "@/lib/scheduling";
import { cx } from "@/lib/format";

export type Zoom = "day" | "week" | "month";

export type GanttRow =
  | { kind: "group"; id: string; label: ReactNode; href?: string; sub?: ReactNode }
  | {
      kind: "task";
      id: string;
      label: ReactNode;
      sub?: ReactNode;
      start: string;
      finish: string;
      colour?: string | null;
      progress: number;
      critical?: boolean;
      overdue?: boolean;
      title?: string;
    };

const PX: Record<Zoom, number> = { day: 30, week: 12, month: 4 };
const LABEL_W = 240;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function dayParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function Gantt({ rows, today, zoom = "day", emptyText = "Nothing scheduled." }: { rows: GanttRow[]; today: string; zoom?: Zoom; emptyText?: string }) {
  const tasks = rows.filter((r): r is Extract<GanttRow, { kind: "task" }> => r.kind === "task");
  if (tasks.length === 0) return <p className="rounded-lg border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-500">{emptyText}</p>;
  let min = tasks[0].start;
  let max = tasks[0].finish;
  for (const t of tasks) {
    if (t.start < min) min = t.start;
    if (t.finish > max) max = t.finish;
  }
  // Keep today in view if it's close to the schedule.
  if (today < min && calendarDaysBetween(today, min) <= 21) min = today;
  if (today > max && calendarDaysBetween(max, today) <= 21) max = today;
  const start = weekStart(addCalendarDays(min, -2));
  const end = addCalendarDays(weekStart(addCalendarDays(max, 7)), 6);
  const days = calendarDaysBetween(start, end) + 1;
  const px = PX[zoom];
  const width = days * px;
  const x = (iso: string) => calendarDaysBetween(start, iso) * px;
  const allDays = Array.from({ length: days }, (_, i) => addCalendarDays(start, i));
  const todayX = today >= start && today <= end ? x(today) + px / 2 : null;

  // Header segments
  const months: { label: string; left: number; w: number }[] = [];
  for (const d of allDays) {
    const { y, m } = dayParts(d);
    const label = `${MONTHS[m - 1]} ${y}`;
    const last = months[months.length - 1];
    if (last && last.label === label) last.w += px;
    else months.push({ label, left: x(d), w: px });
  }
  const weeks = allDays.filter((d) => dayParts(d) && new Date(d + "T00:00:00Z").getUTCDay() === 1);

  return (
    <div className="gantt overflow-x-auto rounded-lg border border-ink-200 bg-white print:overflow-visible">
      <div className="relative text-xs" style={{ width: LABEL_W + width, minWidth: "100%" }}>
        {/* Background layer: weekends + today line */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_W, width }} aria-hidden>
          {zoom !== "month" &&
            allDays.map((d) =>
              isWorkingDay(d) ? null : <div key={d} className="absolute inset-y-0 bg-ink-100/70" style={{ left: x(d), width: px }} />,
            )}
          {zoom !== "day" &&
            weeks.map((d) => <div key={d} className="absolute inset-y-0 border-l border-ink-100" style={{ left: x(d) }} />)}
          {todayX !== null && <div className="absolute inset-y-0 z-[5] w-0.5 bg-red-500/80" style={{ left: todayX }} data-testid="today-line" title="Today" />}
        </div>

        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b border-ink-200 bg-ink-50">
          <div className="sticky left-0 z-20 flex shrink-0 items-end border-r border-ink-200 bg-ink-50 px-3 py-1.5 font-semibold uppercase tracking-wide text-ink-500" style={{ width: LABEL_W }}>
            Task
          </div>
          <div className="relative" style={{ width, height: zoom === "day" ? 50 : zoom === "week" ? 40 : 24 }}>
            {months.map((m) => (
              <div key={m.label} className="absolute top-0 truncate border-l border-ink-200 px-1 py-0.5 font-semibold text-ink-600" style={{ left: m.left, width: m.w }}>
                {m.w > 40 ? m.label : ""}
              </div>
            ))}
            {zoom === "day" &&
              allDays.map((d) => (
                <div key={d} className={cx("absolute bottom-0 text-center leading-4", d === today ? "font-bold text-red-600" : isWorkingDay(d) ? "text-ink-600" : "text-ink-400")} style={{ left: x(d), width: px }}>
                  <div className="text-[9px]">{DOW[new Date(d + "T00:00:00Z").getUTCDay()]}</div>
                  <div>{dayParts(d).d}</div>
                </div>
              ))}
            {zoom === "week" &&
              weeks.map((d) => (
                <div key={d} className="absolute bottom-0.5 pl-1 text-ink-500" style={{ left: x(d) }}>
                  {dayParts(d).d}/{dayParts(d).m}
                </div>
              ))}
          </div>
        </div>

        {/* Rows */}
        {rows.map((r) =>
          r.kind === "group" ? (
            <div key={r.id} className="flex border-b border-ink-200 bg-ink-50/80">
              <div className="sticky left-0 z-10 shrink-0 truncate border-r border-ink-200 bg-ink-50 px-3 py-1.5 text-sm font-semibold text-ink-900" style={{ width: LABEL_W }}>
                {r.href ? <Link href={r.href} className="hover:text-brand-700">{r.label}</Link> : r.label}
                {r.sub && <span className="ml-2 text-xs font-normal text-ink-500">{r.sub}</span>}
              </div>
              <div style={{ width }} />
            </div>
          ) : (
            <div key={r.id} className="flex border-b border-ink-100 hover:bg-brand-50/30" data-testid="gantt-row">
              <div className="sticky left-0 z-10 shrink-0 border-r border-ink-200 bg-white px-3 py-1" style={{ width: LABEL_W }}>
                <div className="truncate text-sm text-ink-900">{r.label}</div>
                {r.sub && <div className="truncate text-[11px] text-ink-500">{r.sub}</div>}
              </div>
              <div className="relative" style={{ width, height: 36 }}>
                <div
                  className={cx(
                    "absolute top-2 h-5 overflow-hidden rounded shadow-xs",
                    r.critical && "ring-2 ring-amber-400 ring-offset-1",
                    r.overdue && "ring-2 ring-red-500 ring-offset-1",
                  )}
                  style={{ left: x(r.start), width: Math.max(px, x(r.finish) - x(r.start) + px), background: `${r.colour || "#0a8077"}55` }}
                  title={r.title}
                  data-testid="gantt-bar"
                >
                  <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, r.progress))}%`, background: r.colour || "#0a8077" }} />
                  {zoom === "day" && <span className="absolute inset-0 truncate px-1.5 text-[11px] font-medium leading-5 text-ink-900">{r.progress}%</span>}
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
