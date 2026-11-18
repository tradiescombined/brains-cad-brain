"use client";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/ui/client";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { captureVersionAction, deleteVersionAction, restoreVersionAction } from "../[id]/details-actions";

export interface VersionRow {
  id: string;
  label: string;
  dateLabel: string;
  totalLabel: string;
  itemCount: number;
  valid: boolean;
}

export function VersionsPanel({ estimateId, versions, currentTotal }: { estimateId: string; versions: VersionRow[]; currentTotal: string }) {
  const [capState, capture] = useActionState(captureVersionAction, undefined);
  const [resState, restore] = useActionState(restoreVersionAction, undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (capState?.ok && inputRef.current) inputRef.current.value = "";
  }, [capState?.at, capState?.ok]);
  const msg = [capState, resState].filter(Boolean).sort((a, b) => (b!.at ?? 0) - (a!.at ?? 0))[0];

  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-xs" aria-labelledby="versions-h">
      <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <h2 id="versions-h" className="text-xs font-semibold uppercase tracking-wider text-ink-500">Versions</h2>
        <span className="text-xs text-ink-400">Current {currentTotal}</span>
      </header>
      <div className="p-4">
        <form action={capture} className="flex gap-2">
          <input type="hidden" name="estimateId" value={estimateId} />
          <input
            ref={inputRef}
            name="label"
            maxLength={120}
            placeholder="Label, e.g. Sent to client v1"
            aria-label="Version label"
            className="block w-full min-w-0 rounded-md border border-ink-200 px-2.5 py-1.5 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <SubmitButton variant="secondary" pendingText="Capturing…">Capture</SubmitButton>
        </form>
        {msg && (
          <p role="status" className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
            {msg.ok ? msg.message : msg.error}
          </p>
        )}
        {versions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No versions yet. Capture one before making big changes so you can roll back.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-100" data-testid="versions">
            {versions.map((v) => (
              <li key={v.id} className="py-2" data-testid="version-row">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-900">{v.label}</div>
                    <div className="text-xs text-ink-500">{v.dateLabel} · {v.itemCount} items</div>
                  </div>
                  <div className="text-right text-sm font-medium tabular-nums">{v.totalLabel}</div>
                </div>
                <div className="mt-1.5 flex justify-end gap-2">
                  {v.valid && (
                    <form action={restore}>
                      <input type="hidden" name="estimateId" value={estimateId} />
                      <input type="hidden" name="versionId" value={v.id} />
                      <ConfirmSubmit tone="brand" confirmText="Replace current costings?" pendingText="Restoring…" className="px-2 py-0.5 text-xs">Restore</ConfirmSubmit>
                    </form>
                  )}
                  <form action={deleteVersionAction}>
                    <input type="hidden" name="estimateId" value={estimateId} />
                    <input type="hidden" name="versionId" value={v.id} />
                    <ConfirmSubmit confirmText="Delete?" pendingText="Deleting…" className="px-2 py-0.5 text-xs">Delete</ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
