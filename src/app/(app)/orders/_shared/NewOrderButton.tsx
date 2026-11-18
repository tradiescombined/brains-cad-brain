"use client";
import { useActionState } from "react";
import { Modal } from "@/components/ui/client";
import { createOrder } from "../actions";
import { FormMessage } from "./client";

type Opt = { value: string; label: string };
const sel = "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function NewOrderButton({ jobs, suppliers, jobId, variant = "primary" }: { jobs: Opt[]; suppliers: Opt[]; jobId?: string; variant?: "primary" | "secondary" }) {
  const [state, action, pending] = useActionState(createOrder, null);
  return (
    <Modal
      title="New purchase order"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={
            variant === "primary"
              ? "inline-flex items-center gap-1.5 rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700"
              : "inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-xs hover:bg-ink-50"
          }
        >
          + New order
        </button>
      )}
    >
      {(close) => (
        <form action={action} className="space-y-4">
          {jobId ? (
            <input type="hidden" name="jobId" value={jobId} />
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Job</span>
              <select name="jobId" required className={sel} defaultValue="">
                <option value="" disabled>Select a job…</option>
                {jobs.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
              {!jobs.length && <span className="mt-1 block text-xs text-amber-700">Create a job first — orders are always raised against a job.</span>}
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Supplier or trade</span>
            <select name="supplierId" className={sel} defaultValue="">
              <option value="">Choose later</option>
              {suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium">Cancel</button>
            <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              {pending ? "Creating…" : "Create draft"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
