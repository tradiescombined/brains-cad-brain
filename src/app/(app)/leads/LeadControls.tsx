"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/client";
import { SubmitButton } from "@/components/ui/client";
import { Field, Textarea } from "@/components/ui";
import { LEAD_STAGES } from "./lib";
import { setLeadStage, markLeadLost, deleteLead } from "./actions";

/** Compact stage picker that saves on change (used on board cards and list rows). */
export function StageSelect({ id, stage, label }: { id: string; stage: string; label: string }) {
  return (
    <form action={setLeadStage}>
      <input type="hidden" name="id" value={id} />
      <select
        name="stage"
        defaultValue={stage}
        aria-label={`Move ${label} to stage`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded border border-ink-200 bg-white px-1.5 py-0.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none"
      >
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}

/**
 * Two-step delete button. (The shared ConfirmButton reuses the same <button> element and flips its
 * type to "submit" mid-click, so the form submits on the first click; distinct keys avoid that.)
 */
export function DeleteLeadButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <form action={deleteLead} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      {armed ? (
        <>
          <button key="confirm" type="submit" className="rounded-md border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
            Delete permanently
          </button>
          <button key="cancel" type="button" onClick={() => setArmed(false)} className="rounded-md px-2 py-1.5 text-sm text-ink-600 hover:bg-ink-100">
            Cancel
          </button>
        </>
      ) : (
        <button key="arm" type="button" onClick={() => setArmed(true)} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-xs hover:bg-red-50">
          Delete
        </button>
      )}
    </form>
  );
}

/** "Mark lost" button opening a modal asking for the reason. */
export function MarkLostButton({ id, defaultReason }: { id: string; defaultReason?: string | null }) {
  return (
    <Modal
      title="Mark lead as lost"
      trigger={(open) => (
        <button type="button" onClick={open} className="inline-flex items-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-xs hover:bg-red-50">
          Mark lost
        </button>
      )}
    >
      {(close) => <LostForm id={id} defaultReason={defaultReason} onDone={close} />}
    </Modal>
  );
}

function LostForm({ id, defaultReason, onDone }: { id: string; defaultReason?: string | null; onDone: () => void }) {
  const [state, action] = useActionState(markLeadLost, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <Field label="Why was this lead lost?">
        <Textarea name="lostReason" defaultValue={defaultReason ?? ""} rows={3} autoFocus placeholder="e.g. Price too high, timing, chose another builder…" />
      </Field>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">
          Cancel
        </button>
        <SubmitButton variant="danger">Mark as lost</SubmitButton>
      </div>
    </form>
  );
}
