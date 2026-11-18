"use client";
import { useActionState, useEffect } from "react";
import { Modal } from "@/components/ui/client";
import { recordBill } from "../actions";
import { FormMessage } from "../_shared/client";

const inputCls = "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function RecordBill({ id, number, subtotal, tax, today }: { id: string; number: string; subtotal: number; tax: number; today: string }) {
  return (
    <Modal
      title={`Record supplier bill for ${number}`}
      trigger={(open) => (
        <button type="button" onClick={open} className="w-full rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700">
          Record bill
        </button>
      )}
    >
      {(close) => <BillForm id={id} subtotal={subtotal} tax={tax} today={today} close={close} />}
    </Modal>
  );
}

function BillForm({ id, subtotal, tax, today, close }: { id: string; subtotal: number; tax: number; today: string; close: () => void }) {
  const [state, action, pending] = useActionState(recordBill, null);
  useEffect(() => {
    if (state?.ok) close();
  }, [state, close]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-ink-600">Adds the bill to this job&apos;s actual costs and marks the order as billed. Adjust the amounts if the supplier&apos;s invoice differs from the order.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Bill date</span>
          <input type="date" name="date" required defaultValue={today} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Supplier invoice #</span>
          <input name="reference" className={inputCls} placeholder="e.g. INV-4471" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Amount ex tax</span>
          <input type="number" step="0.01" min="0.01" name="amount" required defaultValue={subtotal.toFixed(2)} className={inputCls + " text-right tabular-nums"} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Tax</span>
          <input type="number" step="0.01" min="0" name="tax" defaultValue={tax.toFixed(2)} className={inputCls + " text-right tabular-nums"} />
        </label>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium">Cancel</button>
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">{pending ? "Recording…" : "Record bill"}</button>
      </div>
    </form>
  );
}
