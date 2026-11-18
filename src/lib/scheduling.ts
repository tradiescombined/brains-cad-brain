/**
 * Job schedule maths (pure, no DB). Dates are ISO "YYYY-MM-DD" strings, working days are Mon–Fri.
 *
 * - A task occupies `durationDays` working days starting on `startDate` (snapped forward to a
 *   working day). Its finish is the last working day it occupies.
 * - Dependencies are finish-to-start: a successor may start no earlier than the working day after
 *   every predecessor finishes.
 * - When tasks change, dependants are re-scheduled preserving each link's original lag (gap in
 *   working days). A dependant moves later when a predecessor finishes later; it moves earlier only
 *   as far as its other predecessors allow.
 */

export interface SchedTask {
  id: string;
  startDate: string;
  durationDays: number;
  dependsOn: string[];
  progress?: number;
}

const DAY = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
function fromUtc(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function isValidIsoDate(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return fromUtc(toUtc(iso)) === iso;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

export function isWorkingDay(iso: string): boolean {
  const d = weekday(iso);
  return d !== 0 && d !== 6;
}

export function addCalendarDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * DAY);
}

/** Calendar days from a to b (b - a). */
export function calendarDaysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

/** The same day if it is a working day, otherwise the next Monday. */
export function snapToWorkingDay(iso: string): string {
  let d = iso;
  while (!isWorkingDay(d)) d = addCalendarDays(d, 1);
  return d;
}

/** The first working day strictly after `iso`. */
export function nextWorkingDay(iso: string): string {
  return snapToWorkingDay(addCalendarDays(iso, 1));
}

/** The last working day strictly before `iso`. */
export function prevWorkingDay(iso: string): string {
  let d = addCalendarDays(iso, -1);
  while (!isWorkingDay(d)) d = addCalendarDays(d, -1);
  return d;
}

/**
 * Moves `n` working days from `iso` (n may be negative). A non-working start is first snapped
 * forward (n >= 0) or backward (n < 0) to a working day, which counts as step zero.
 */
export function addWorkingDays(iso: string, n: number): string {
  let d = iso;
  if (n >= 0) {
    d = snapToWorkingDay(d);
    for (let i = 0; i < n; i++) d = nextWorkingDay(d);
  } else {
    if (!isWorkingDay(d)) d = prevWorkingDay(d);
    for (let i = 0; i > n; i--) d = prevWorkingDay(d);
  }
  return d;
}

/**
 * Signed number of working days to step from a to b: addWorkingDays(a, result) === b when both
 * are working days. Non-working endpoints are snapped forward first.
 */
export function workingDaysBetween(a: string, b: string): number {
  const x = snapToWorkingDay(a);
  const y = snapToWorkingDay(b);
  if (x === y) return 0;
  const sign = toUtc(y) > toUtc(x) ? 1 : -1;
  const [lo, hi] = sign > 0 ? [x, y] : [y, x];
  const days = calendarDaysBetween(lo, hi);
  const full = Math.floor(days / 7);
  let count = full * 5;
  let d = addCalendarDays(lo, full * 7);
  while (d !== hi) {
    d = addCalendarDays(d, 1);
    if (isWorkingDay(d)) count++;
  }
  return sign * count;
}

/** Number of working days in the inclusive range [a, b] (0 if b < a). */
export function workingDaysInclusive(a: string, b: string): number {
  if (toUtc(b) < toUtc(a)) return 0;
  let n = 0;
  const days = calendarDaysBetween(a, b);
  for (let i = 0; i <= days; i++) if (isWorkingDay(addCalendarDays(a, i))) n++;
  return n;
}

export function normaliseDuration(n: number | null | undefined): number {
  const v = Math.round(Number(n) || 0);
  return Math.max(1, Math.min(v, 2000));
}

/** First working day the task occupies. */
export function taskStart(t: Pick<SchedTask, "startDate">): string {
  return snapToWorkingDay(t.startDate);
}

/** Last working day the task occupies. */
export function taskFinish(t: Pick<SchedTask, "startDate" | "durationDays">): string {
  return addWorkingDays(taskStart(t), normaliseDuration(t.durationDays) - 1);
}

/** Earliest start allowed by a task's predecessors (null when it has none / none exist). */
export function earliestStart(task: SchedTask, byId: Map<string, SchedTask>): string | null {
  let best: string | null = null;
  for (const pid of task.dependsOn) {
    const p = byId.get(pid);
    if (!p) continue;
    const s = nextWorkingDay(taskFinish(p));
    if (!best || s > best) best = s;
  }
  return best;
}

export function parseDependsOn(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** True if giving `taskId` the predecessors `preds` would create a dependency loop. */
export function wouldCreateCycle(tasks: SchedTask[], taskId: string, preds: string[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [...preds];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = byId.get(id);
    if (t) stack.push(...t.dependsOn);
  }
  return false;
}

/** Map of task id -> ids of tasks that depend on it. */
export function successorsMap(tasks: SchedTask[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const t of tasks) m.set(t.id, []);
  for (const t of tasks) for (const p of t.dependsOn) m.get(p)?.push(t.id);
  return m;
}

/** Topological order (predecessors first). Tasks on a cycle are appended in input order. */
export function topoOrder(tasks: SchedTask[]): string[] {
  const indeg = new Map<string, number>();
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) indeg.set(t.id, t.dependsOn.filter((p) => ids.has(p) && p !== t.id).length);
  const succ = successorsMap(tasks);
  const queue = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const s of succ.get(id) ?? []) {
      if (s === id) continue;
      const n = (indeg.get(s) ?? 0) - 1;
      indeg.set(s, n);
      if (n === 0) queue.push(s);
    }
  }
  if (out.length < tasks.length) for (const t of tasks) if (!out.includes(t.id)) out.push(t.id);
  return out;
}

/**
 * Re-schedules every task downstream of `changedIds`.
 * `before` is the schedule prior to the edit (used to measure each link's lag), `after` is the
 * schedule with the edit applied. Returns the full new task list and the ids whose start moved
 * (including changed tasks pushed forward to satisfy their own predecessors).
 */
export function rescheduleDependants<T extends SchedTask>(
  before: SchedTask[],
  after: T[],
  changedIds: string[],
): { tasks: T[]; moved: string[] } {
  const oldById = new Map(before.map((t) => [t.id, t]));
  const cur = new Map(after.map((t) => [t.id, { ...t }]));
  const succ = successorsMap(after);

  // Affected set = changed tasks + everything reachable downstream of them.
  const affected = new Set<string>();
  const stack = [...changedIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (affected.has(id) || !cur.has(id)) continue;
    affected.add(id);
    stack.push(...(succ.get(id) ?? []));
  }

  const moved: string[] = [];
  const changed = new Set(changedIds);
  for (const id of topoOrder(after)) {
    if (!affected.has(id)) continue;
    const t = cur.get(id)!;
    const preds = t.dependsOn.map((p) => cur.get(p)).filter((p): p is T => !!p && p.id !== id);
    if (preds.length === 0) continue;
    let start: string | null = null;
    if (changed.has(id)) {
      // The edited task keeps its requested start unless a predecessor forbids it.
      const min = earliestStart(t, cur as Map<string, SchedTask>)!;
      start = taskStart(t) < min ? min : taskStart(t);
    } else {
      const old = oldById.get(id);
      for (const p of preds) {
        const oldP = oldById.get(p.id);
        let lag = 0;
        if (old && oldP && old.dependsOn.includes(p.id)) {
          lag = Math.max(0, workingDaysBetween(nextWorkingDay(taskFinish(oldP)), taskStart(old)));
        }
        const s = addWorkingDays(nextWorkingDay(taskFinish(p)), lag);
        if (!start || s > start) start = s;
      }
    }
    if (start && start !== t.startDate) {
      t.startDate = start;
      moved.push(id);
    }
  }
  return { tasks: after.map((t) => cur.get(t.id)!), moved };
}

/** Shifts every task by `n` working days (negative = earlier). Keeps links intact. */
export function shiftSchedule<T extends SchedTask>(tasks: T[], n: number): T[] {
  return tasks.map((t) => ({ ...t, startDate: addWorkingDays(taskStart(t), Math.round(n)) }));
}

/**
 * Builds a sequential chain: each task starts the working day after the previous finishes and
 * depends on it. Used for starter schedules created from estimate categories.
 */
export function sequentialChain(names: { name: string; durationDays: number }[], start: string, makeId: () => string) {
  const out: (SchedTask & { name: string })[] = [];
  let next = snapToWorkingDay(start);
  for (const n of names) {
    const id = makeId();
    const prev = out[out.length - 1];
    const t = { id, name: n.name, startDate: next, durationDays: normaliseDuration(n.durationDays), dependsOn: prev ? [prev.id] : [] };
    out.push(t);
    next = nextWorkingDay(taskFinish(t));
  }
  return out;
}

export interface ScheduleSummary {
  start: string | null;
  finish: string | null;
  workingDays: number;
  /** Duration-weighted progress 0-100. */
  percentComplete: number;
  /** Tasks with zero total float (any slip delays the finish). */
  critical: Set<string>;
  /** Total float in working days per task. */
  float: Map<string, number>;
  /** Not complete and finish date before today. */
  overdue: Set<string>;
  /** Start before a predecessor allows. */
  conflicts: Set<string>;
}

/** Critical path (zero-float tasks), overdue tasks and overall dates. */
export function summarise(tasks: SchedTask[], today: string): ScheduleSummary {
  const empty: ScheduleSummary = { start: null, finish: null, workingDays: 0, percentComplete: 0, critical: new Set(), float: new Map(), overdue: new Set(), conflicts: new Set() };
  if (tasks.length === 0) return empty;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let start = taskStart(tasks[0]);
  let finish = taskFinish(tasks[0]);
  let weight = 0;
  let done = 0;
  for (const t of tasks) {
    const s = taskStart(t);
    const f = taskFinish(t);
    if (s < start) start = s;
    if (f > finish) finish = f;
    const d = normaliseDuration(t.durationDays);
    weight += d;
    done += d * Math.min(100, Math.max(0, t.progress ?? 0));
  }
  // Backward pass: latest finish in working-day offsets from project start.
  const off = (iso: string) => workingDaysBetween(start, iso);
  const succ = successorsMap(tasks);
  const order = topoOrder(tasks).reverse();
  const latestFinish = new Map<string, number>();
  const finishOff = off(finish);
  for (const id of order) {
    const ss = (succ.get(id) ?? []).filter((s) => s !== id && byId.has(s));
    let lf = finishOff;
    for (const s of ss) {
      const sLf = latestFinish.get(s);
      if (sLf === undefined) continue;
      const sLs = sLf - (normaliseDuration(byId.get(s)!.durationDays) - 1);
      lf = Math.min(lf, sLs - 1);
    }
    latestFinish.set(id, lf);
  }
  const critical = new Set<string>();
  const float = new Map<string, number>();
  const overdue = new Set<string>();
  const conflicts = new Set<string>();
  for (const t of tasks) {
    const fl = (latestFinish.get(t.id) ?? finishOff) - off(taskFinish(t));
    float.set(t.id, fl);
    if (fl <= 0) critical.add(t.id);
    if ((t.progress ?? 0) < 100 && taskFinish(t) < today) overdue.add(t.id);
    const es = earliestStart(t, byId);
    if (es && taskStart(t) < es) conflicts.add(t.id);
  }
  return {
    start,
    finish,
    workingDays: workingDaysInclusive(start, finish),
    percentComplete: weight ? Math.round(done / weight) : 0,
    critical,
    float,
    overdue,
    conflicts,
  };
}

/** Monday of the ISO week containing `iso`. */
export function weekStart(iso: string): string {
  const d = weekday(iso);
  return addCalendarDays(iso, d === 0 ? -6 : 1 - d);
}

/** Guess a starter duration (working days) from a category's budget. */
export function suggestedDuration(budget: number): number {
  if (budget <= 0) return 1;
  return Math.max(1, Math.min(20, Math.round(budget / 2500)));
}
