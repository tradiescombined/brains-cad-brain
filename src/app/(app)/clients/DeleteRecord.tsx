"use client";
/** Danger-zone delete card used by client and contact detail pages. */
import { useActionState } from "react";
import { Card } from "@/components/ui";
import { ConfirmSubmit } from "./ConfirmSubmit";
import type { FormState } from "./actions";
import { FormMessage } from "./FormBits";

export function DeleteRecord({
  id,
  action,
  blockedReason,
  noun,
  archiveHint,
}: {
  id: string;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** When set, deletion is not allowed and this explanation is shown instead of the button. */
  blockedReason?: string | null;
  noun: string;
  archiveHint?: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <Card title="Delete">
      {blockedReason ? (
        <div className="text-sm text-ink-600">
          <p>{blockedReason}</p>
          {archiveHint && <p className="mt-1 text-ink-500">{archiveHint}</p>}
        </div>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center justify-between gap-3">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-ink-600">Permanently delete this {noun} along with its notes, files and contacts. This can&apos;t be undone.</p>
          <ConfirmSubmit confirmText={`Yes, delete ${noun}`}>Delete {noun}</ConfirmSubmit>
        </form>
      )}
      {state.message && <div className="mt-3"><FormMessage msg={state.message} /></div>}
    </Card>
  );
}
