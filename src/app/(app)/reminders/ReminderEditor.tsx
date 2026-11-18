"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/format";
import { ActionForm, FieldError, FormFooter } from "../settings/_components/ActionForm";
import { saveReminder } from "./actions";
import { ENTITY_TYPES } from "./entities";
import type { EntityOption } from "./entities.server";

export type ReminderData = {
  id?: string;
  title?: string;
  details?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function ReminderEditor({
  reminder,
  options,
  users,
  triggerLabel,
  triggerClass,
  defaultOpen,
  today,
}: {
  reminder?: ReminderData;
  options: EntityOption[];
  users: string[];
  triggerLabel: string;
  triggerClass?: string;
  defaultOpen?: boolean;
  today: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const router = useRouter();
  const close = () => {
    setOpen(false);
    if (defaultOpen) router.replace("/reminders", { scroll: false });
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const editing = !!reminder?.id;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClass ??
          "inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700"
        }
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 pt-[8vh]"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <div role="dialog" aria-modal="true" aria-label={editing ? "Edit reminder" : "New reminder"} className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
              <h2 className="text-base font-semibold text-ink-900">{editing ? "Edit reminder" : "New reminder"}</h2>
              <button type="button" onClick={close} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Close">✕</button>
            </div>
            <ActionForm action={saveReminder} onSuccess={close} className="space-y-3 p-5">
              <Fields reminder={reminder} options={options} users={users} today={today} />
              <FormFooter label={editing ? "Save reminder" : "Add reminder"} className="border-t border-ink-100 pt-3" />
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

function Fields({ reminder, options, users, today }: { reminder?: ReminderData; options: EntityOption[]; users: string[]; today: string }) {
  const [type, setType] = useState(reminder?.entityType ?? "");
  const [entityId, setEntityId] = useState(reminder?.entityId ?? "");
  const records = useMemo(() => options.filter((o) => o.type === type), [options, type]);
  const assignees = reminder?.assignedTo && !users.includes(reminder.assignedTo) ? [reminder.assignedTo, ...users] : users;
  return (
    <>
      {reminder?.id && <input type="hidden" name="id" value={reminder.id} />}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Title</span>
        <input name="title" defaultValue={reminder?.title ?? ""} autoFocus placeholder="e.g. Follow up quote with client" className={inputCls} />
        <FieldError name="title" />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Due date</span>
          <input type="date" name="dueDate" defaultValue={reminder?.dueDate ?? (reminder?.id ? "" : today)} className={inputCls} />
          <FieldError name="dueDate" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Assigned to</span>
          <select name="assignedTo" defaultValue={reminder?.assignedTo ?? ""} className={inputCls}>
            <option value="">Unassigned</option>
            {assignees.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Details</span>
        <textarea name="details" rows={3} defaultValue={reminder?.details ?? ""} placeholder="Optional notes" className={cx(inputCls, "min-h-20")} />
      </label>
      <fieldset className="rounded-md border border-ink-100 bg-ink-50 p-3">
        <legend className="px-1 text-xs font-medium text-ink-600">Link to a record (optional)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
          <select
            name="entityType"
            aria-label="Record type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setEntityId("");
            }}
            className={inputCls}
          >
            <option value="">No link</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div>
            <select name="entityId" aria-label="Record" value={entityId} onChange={(e) => setEntityId(e.target.value)} disabled={!type} className={cx(inputCls, "disabled:bg-ink-100")}>
              <option value="">{!type ? "—" : records.length ? "Choose…" : "No records of this type yet"}</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
              {entityId && !records.some((r) => r.id === entityId) && <option value={entityId}>(linked record)</option>}
            </select>
            <FieldError name="entityId" />
            <FieldError name="entityType" />
          </div>
        </div>
      </fieldset>
    </>
  );
}
