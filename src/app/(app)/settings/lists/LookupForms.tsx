"use client";
import { useState } from "react";
import { ActionForm, FieldError, useActionFormState } from "../_components/ActionForm";
import { addLookup, renameLookup } from "../actions";

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/** Inline rename: the Save button only appears once the text differs from the stored name. */
export function RenameLookup({ id, name, inactive }: { id: string; name: string; inactive?: boolean }) {
  const [value, setValue] = useState(name);
  const [base, setBase] = useState(name);
  if (name !== base) {
    // Server value changed (e.g. after save) — follow it.
    setBase(name);
    setValue(name);
  }
  const dirty = value.trim() !== name;
  return (
    <ActionForm action={renameLookup} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        aria-label={`Name for ${name}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setValue(name)}
        className={`${inputCls} max-w-xs min-w-32 flex-1 ${inactive ? "text-ink-400 line-through" : ""}`}
      />
      {dirty && (
        <button type="submit" className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">
          Save
        </button>
      )}
      <InlineStatus />
    </ActionForm>
  );
}

function InlineStatus() {
  const { state, pending } = useActionFormState();
  if (pending) return <span className="text-xs text-ink-400">Saving…</span>;
  if (state.error) return <span role="alert" className="text-xs text-red-600">{state.error}</span>;
  return null;
}

export function AddLookup({ kind, label }: { kind: string; label: string }) {
  return (
    <ActionForm action={addLookup} resetOnSuccess aria-label={`Add to ${label}`} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="kind" value={kind} />
      <div className="min-w-48 flex-1 sm:max-w-sm">
        <input name="name" aria-label="New value" placeholder="Add a new value…" className={inputCls} />
        <FieldError name="name" />
      </div>
      <AddButton />
    </ActionForm>
  );
}

function AddButton() {
  const { pending, state } = useActionFormState();
  return (
    <>
      <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
      {!pending && state.ok && <span role="status" className="self-center text-xs text-emerald-700">✓ {state.ok}</span>}
      {!pending && state.error && !state.fieldErrors && <span role="alert" className="self-center text-xs text-red-600">{state.error}</span>}
    </>
  );
}
