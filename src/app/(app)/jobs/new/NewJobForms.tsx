"use client";
import Link from "next/link";
import { useState } from "react";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx, money } from "@/lib/format";
import { ActionForm, type FormAction } from "../../schedule/_lib/client";

type Est = { id: string; number: string; name: string; status: string; quoteTotal: number; clientName: string | null; accepted: boolean; hasJob: boolean };

export function NewJobForms({
  mode: initialMode,
  estimates,
  defaultEstimateId,
  clients,
  defaultStart,
  fromEstimate,
  blank,
}: {
  mode: "estimate" | "blank";
  estimates: Est[];
  defaultEstimateId: string;
  clients: { value: string; label: string }[];
  defaultStart: string;
  fromEstimate: FormAction;
  blank: FormAction;
}) {
  const [mode, setMode] = useState(initialMode);
  const [estId, setEstId] = useState(defaultEstimateId);
  const est = estimates.find((e) => e.id === estId);
  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={cx("rounded-md px-3 py-1.5 text-sm font-medium", mode === m ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800")}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="mb-5 inline-flex rounded-lg bg-ink-100 p-1">
        {tab("estimate", "From an estimate")}
        {tab("blank", "Blank job")}
      </div>

      {mode === "estimate" ? (
        estimates.length === 0 ? (
          <p className="text-sm text-ink-600">
            There are no estimates without a job yet. <button type="button" className="text-brand-700 hover:underline" onClick={() => setMode("blank")}>Create a blank job</button> or{" "}
            <Link href="/estimates" className="text-brand-700 hover:underline">open your estimates</Link>.
          </p>
        ) : (
          <ActionForm action={fromEstimate} className="space-y-4">
            <Field label="Estimate">
              <Select
                name="estimateId"
                value={estId}
                onChange={(e) => setEstId(e.target.value)}
                options={estimates.map((e) => ({ value: e.id, label: `${e.number} · ${e.name}${e.accepted ? " (accepted)" : ` (${e.status})`}` }))}
              />
            </Field>
            {est && (
              <div className="grid grid-cols-2 gap-3 rounded-md bg-ink-50 p-3 text-sm sm:grid-cols-3">
                <div><div className="text-xs text-ink-500">Client</div>{est.clientName || "—"}</div>
                <div><div className="text-xs text-ink-500">Contract value</div><span className="tabular-nums">{money(est.quoteTotal)}</span></div>
                <div><div className="text-xs text-ink-500">Status</div>{est.status}</div>
                {!est.accepted && <p className="col-span-full text-xs text-amber-700">This estimate hasn&apos;t been marked accepted. You can still create the job.</p>}
                {est.hasJob && <p className="col-span-full text-xs text-red-700">This estimate already has a job.</p>}
              </div>
            )}
            <Field label="Start date" hint="Used for the starter schedule. Weekends roll to Monday.">
              <Input type="date" name="startDate" defaultValue={defaultStart} className="w-48" />
            </Field>
            <Checkbox name="starterSchedule" defaultChecked label={<>Create a starter schedule <span className="text-ink-500">— one task per costing category, run back to back</span></>} />
            <p className="text-xs text-ink-500">Every costing line becomes a budget line grouped by its category, and the quote total becomes the contract value.</p>
            <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
              <Link href="/jobs" className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100">Cancel</Link>
              <SubmitButton pendingText="Creating…">Create job</SubmitButton>
            </div>
          </ActionForm>
        )
      ) : (
        <ActionForm action={blank} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Job name" className="sm:col-span-2"><Input name="name" required placeholder="e.g. Smith kitchen renovation" /></Field>
            <Field label="Client"><Select name="clientId" options={clients} placeholder="— No client —" /></Field>
            <Field label="Project manager"><Input name="projectManager" /></Field>
            <Field label="Site address" className="sm:col-span-2"><Input name="siteAddress" /></Field>
            <Field label="Suburb / town"><Input name="siteCityTown" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State"><Input name="siteState" /></Field>
              <Field label="Postcode"><Input name="sitePostcode" /></Field>
            </div>
            <Field label="Start date"><Input type="date" name="startDate" defaultValue={defaultStart} /></Field>
            <Field label="Contract value (inc tax)"><Input name="contractValue" inputMode="decimal" placeholder="0.00" /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea name="description" rows={3} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
            <Link href="/jobs" className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100">Cancel</Link>
            <SubmitButton pendingText="Creating…">Create job</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
