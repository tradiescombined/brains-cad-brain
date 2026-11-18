"use client";
/** Inline two-step delete for actions that return an ActionState (shows the refusal reason inline). */
import { ConfirmSubmit } from "./ConfirmSubmit";
import { ActionForm, useActionFormState } from "./ActionForm";
import type { ActionState } from "./action-state";

export function DeleteForm({
  action,
  id,
  label = "Delete",
  confirmText = "Confirm delete",
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  id: string;
  label?: string;
  confirmText?: string;
}) {
  return (
    <ActionForm action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Status />
      <ConfirmSubmit confirmText={confirmText} className="px-2.5! py-1! text-xs!">
        {label}
      </ConfirmSubmit>
    </ActionForm>
  );
}

function Status() {
  const { state, pending } = useActionFormState();
  if (pending || !state.error) return null;
  return (
    <span role="alert" className="max-w-56 text-right text-xs text-red-600">
      {state.error}
    </span>
  );
}
