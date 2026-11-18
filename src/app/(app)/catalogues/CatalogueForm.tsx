"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/client";
import { Field, Input, Select, Textarea, Button } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx } from "@/lib/format";
import { saveCatalogue, type FormState } from "./actions";

export type CatalogueFormValues = {
  id?: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  supplierId: string | null;
  colour: string;
  status: string;
  effectiveDate: string | null;
  expiryDate: string | null;
};

const SWATCHES = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#475569"];

function Form({ initial, suppliers, close }: { initial?: CatalogueFormValues; suppliers: { value: string; label: string }[]; close: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState<FormState, FormData>(saveCatalogue, null);
  useEffect(() => {
    if (state?.ok) {
      close();
      if (!initial?.id && state.id) router.push(`/catalogues/${state.id}`);
    }
  }, [state, close, initial?.id, router]);
  const fe = state?.fieldErrors ?? {};
  // React resets uncontrolled fields after an action; re-seed them with what was submitted.
  const v = state?.values;
  const val = (k: keyof CatalogueFormValues) => (v ? v[k] ?? "" : ((initial?.[k] as string | null | undefined) ?? ""));
  const err = (k: string) => fe[k] && <span className="mt-1 block text-xs text-red-600">{fe[k]}</span>;
  return (
    <form key={JSON.stringify(v ?? null)} action={action} className="space-y-4" noValidate>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state?.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Catalogue name" className="sm:col-span-2">
          <Input name="name" defaultValue={val("name")} placeholder="e.g. Timber & sheet supplies 2026" autoFocus aria-invalid={!!fe.name} className={cx(fe.name && "border-red-400")} />
          {err("name")}
        </Field>
        <Field label="Short code" hint="Shown on item chips">
          <Input name="shortCode" defaultValue={val("shortCode")} placeholder="TSS" maxLength={12} className="uppercase" />
          {err("shortCode")}
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Supplier">
          <Select name="supplierId" defaultValue={val("supplierId")} options={suppliers} placeholder="Own price list (no supplier)" />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={val("status") || "Published"} options={["Draft", "Published", "Expired", "Archived"]} />
        </Field>
        <Field label="Effective from">
          <Input type="date" name="effectiveDate" defaultValue={val("effectiveDate")} />
          {err("effectiveDate")}
        </Field>
        <Field label="Expires">
          <Input type="date" name="expiryDate" defaultValue={val("expiryDate")} aria-invalid={!!fe.expiryDate} className={cx(fe.expiryDate && "border-red-400")} />
          {err("expiryDate")}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-ink-600">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((c) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="colour" value={c} defaultChecked={(val("colour") || SWATCHES[0]) === c} className="peer sr-only" />
              <span className="block size-7 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-ink-800 peer-focus-visible:ring-brand-500" style={{ background: c }} aria-label={c} />
            </label>
          ))}
          {initial?.colour && !SWATCHES.includes(initial.colour) && (
            <label className="cursor-pointer">
              <input type="radio" name="colour" value={initial.colour} defaultChecked className="peer sr-only" />
              <span className="block size-7 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-ink-800" style={{ background: initial.colour }} />
            </label>
          )}
        </div>
      </fieldset>
      <Field label="Description">
        <Textarea name="description" defaultValue={val("description")} rows={2} placeholder="What this price list covers, account numbers, delivery terms…" />
      </Field>
      <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
        <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
        <SubmitButton>{initial?.id ? "Save changes" : "Create catalogue"}</SubmitButton>
      </div>
    </form>
  );
}

export function CatalogueFormModal({ initial, suppliers, triggerLabel, variant = "primary" }: { initial?: CatalogueFormValues; suppliers: { value: string; label: string }[]; triggerLabel: string; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Modal
      wide
      title={initial?.id ? "Edit catalogue" : "New catalogue"}
      trigger={(open) => (
        <Button type="button" variant={variant} onClick={open}>
          {triggerLabel}
        </Button>
      )}
    >
      {(close) => <Form initial={initial} suppliers={suppliers} close={close} />}
    </Modal>
  );
}
