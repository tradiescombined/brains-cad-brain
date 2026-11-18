/** Pure reminder helpers: grouping and due-date wording. */

export type ReminderLite = { id: string; title: string; dueDate: string | null; done: boolean; updatedAt?: string };

/** YYYY-MM-DD for the given moment in the server's local time zone. */
export function localIso(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Calendar arithmetic on YYYY-MM-DD strings (time-zone safe). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function groupReminders<T extends ReminderLite>(rows: T[], today: string) {
  const overdue: T[] = [], dueToday: T[] = [], upcoming: T[] = [], done: T[] = [];
  for (const r of rows) {
    const d = r.dueDate?.slice(0, 10) || null;
    if (r.done) done.push(r);
    else if (d && d < today) overdue.push(r);
    else if (d === today) dueToday.push(r);
    else upcoming.push(r);
  }
  const byDue = (a: T, b: T) => {
    if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title);
  };
  overdue.sort(byDue);
  dueToday.sort(byDue);
  upcoming.sort(byDue);
  done.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return { overdue, today: dueToday, upcoming, done };
}

/** Human wording relative to today: "Today", "Tomorrow", "In 5 days", "3 days overdue". */
export function dueLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return "No due date";
  const n = daysBetween(today, dueDate.slice(0, 10));
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n} days overdue`;
  return `In ${n} days`;
}
