"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Modal, SubmitButton } from "@/components/ui/client";
import { Field, Input, Select } from "@/components/ui";
import { createBlankTemplate, renameTemplate } from "../actions";

export function NewTemplateForm({ buildingTypes }: { buildingTypes: string[] }) {
  const [state, action] = useActionState(createBlankTemplate, undefined);
  return (
    <Modal
      title="New blank template"
      trigger={(open) => (
        <button type="button" onClick={open} className="inline-flex items-center rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700">
          New template
        </button>
      )}
    >
      {(close) => (
        <form action={action} className="space-y-4" noValidate>
          <Field label="Template name *">
            <Input name="name" autoFocus maxLength={200} placeholder="e.g. Standard bathroom" />
            {state?.fieldErrors?.name && <span className="mt-1 block text-xs text-red-600">{state.fieldErrors.name}</span>}
          </Field>
          <Field label="Building type">
            <Select name="buildingType" options={buildingTypes} placeholder="Not set" />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100">Cancel</button>
            <SubmitButton pendingText="Creating…">Create template</SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function RenameTemplate({ id, name, buildingType, buildingTypes }: { id: string; name: string; buildingType: string; buildingTypes: string[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof renameTemplate>[0], fd: FormData) => {
    const r = await renameTemplate(prev, fd);
    if (r?.ok) setEditing(false);
    return r;
  }, undefined);

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <Link href={`/estimates/${id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">{name}</Link>
          <div className="text-xs text-ink-500">{buildingType || "No building type"}</div>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-brand-700 hover:underline">Rename</button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="name" defaultValue={name} aria-label="Template name" autoFocus maxLength={200} className="w-56" />
      <Select name="buildingType" defaultValue={buildingType} options={buildingType && !buildingTypes.includes(buildingType) ? [buildingType, ...buildingTypes] : buildingTypes} placeholder="No building type" aria-label="Building type" className="w-44" />
      <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
      <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2 py-1.5 text-xs text-ink-600 hover:bg-ink-100">Cancel</button>
      {state?.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
