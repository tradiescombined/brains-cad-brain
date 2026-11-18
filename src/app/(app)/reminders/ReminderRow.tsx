import Link from "next/link";
import { cx, date } from "@/lib/format";
import { ConfirmSubmit } from "../settings/_components/ConfirmSubmit";
import { deleteReminder, toggleReminder } from "./actions";
import { dueLabel } from "./group";
import { entityHref, entityTypeLabel } from "./entities";
import { ReminderEditor } from "./ReminderEditor";
import type { EntityOption } from "./entities.server";

export type ReminderRowData = {
  id: string;
  title: string;
  details: string | null;
  dueDate: string | null;
  done: boolean;
  assignedTo: string | null;
  entityType: string | null;
  entityId: string | null;
};

export function ReminderRow({
  r,
  today,
  linkLabel,
  editor,
  compact,
}: {
  r: ReminderRowData;
  today: string;
  linkLabel?: string;
  editor?: { options: EntityOption[]; users: string[] };
  compact?: boolean;
}) {
  const overdue = !r.done && !!r.dueDate && r.dueDate < today;
  const isToday = !r.done && r.dueDate === today;
  const href = entityHref(r.entityType, r.entityId);
  return (
    <li className={cx("group flex items-start gap-3 py-2.5", r.done && "opacity-60")} data-reminder={r.title}>
      <form action={toggleReminder} className="pt-0.5">
        <input type="hidden" name="id" value={r.id} />
        <button
          type="submit"
          aria-label={r.done ? `Mark "${r.title}" not done` : `Mark "${r.title}" done`}
          className={cx(
            "grid size-[18px] place-items-center rounded border text-[11px] leading-none transition-colors",
            r.done ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-transparent hover:border-brand-500 hover:text-brand-500",
          )}
        >
          ✓
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <div className={cx("text-sm font-medium text-ink-900", r.done && "line-through")}>{r.title}</div>
        {!compact && r.details && <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-ink-500">{r.details}</p>}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
          <span className={cx(overdue && "font-medium text-red-600", isToday && "font-medium text-amber-700")} title={r.dueDate ? date(r.dueDate) : undefined}>
            {r.done ? (r.dueDate ? date(r.dueDate) : "No due date") : `${dueLabel(r.dueDate, today)}${r.dueDate && !isToday ? ` · ${date(r.dueDate)}` : ""}`}
          </span>
          {r.assignedTo && <span>👤 {r.assignedTo}</span>}
          {r.entityType && (
            href ? (
              <Link href={href} className="text-brand-700 hover:underline">
                {entityTypeLabel(r.entityType)}: {linkLabel ?? "open record"}
              </Link>
            ) : (
              <span>{entityTypeLabel(r.entityType)}</span>
            )
          )}
        </div>
      </div>
      {editor && (
        <div className="flex shrink-0 items-center gap-1.5">
          <ReminderEditor
            reminder={r}
            options={editor.options}
            users={editor.users}
            today={today}
            triggerLabel="Edit"
            triggerClass="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
          />
          <form action={deleteReminder}>
            <input type="hidden" name="id" value={r.id} />
            <ConfirmSubmit confirmText="Delete?" className="px-2.5! py-1! text-xs!">Delete</ConfirmSubmit>
          </form>
        </div>
      )}
    </li>
  );
}
