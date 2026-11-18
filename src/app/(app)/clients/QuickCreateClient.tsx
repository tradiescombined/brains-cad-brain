"use client";
/**
 * Reusable "quick add client" modal. Drop it anywhere:
 *   <QuickCreateClient returnTo="/estimates/new" />
 * On save it redirects to `returnTo` with `?clientId=<new id>` appended (other params kept).
 */
import { useActionState, useState } from "react";
import { Input } from "@/components/ui";
import { Modal, SubmitButton } from "@/components/ui/client";
import { cx } from "@/lib/format";
import { quickCreateClient, type FormState } from "./actions";
import { F, FormMessage } from "./FormBits";

type Props = {
  /** Relative path to return to after creating, e.g. "/estimates/new". */
  returnTo: string;
  /** Trigger button text. */
  label?: string;
  /** Prefill the name field. */
  defaultName?: string;
  variant?: "primary" | "secondary" | "ghost" | "link";
  className?: string;
};

const triggerCls = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent",
  secondary: "bg-white text-ink-800 hover:bg-ink-50 border-ink-200",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100 border-transparent",
  link: "border-transparent bg-transparent px-0 py-0 text-brand-700 shadow-none hover:underline",
};

export function QuickCreateClient({ returnTo, label = "Quick add client", defaultName, variant = "secondary", className }: Props) {
  return (
    <Modal
      title="Quick add client"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={cx("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs", triggerCls[variant], className)}
        >
          {label}
        </button>
      )}
    >
      {(close) => <QuickCreateForm returnTo={returnTo} defaultName={defaultName} onCancel={close} />}
    </Modal>
  );
}

function QuickCreateForm({ returnTo, defaultName, onCancel }: { returnTo: string; defaultName?: string; onCancel: () => void }) {
  const [state, action] = useActionState(quickCreateClient, {} as FormState);
  const [type, setType] = useState<"Person" | "Business">(state.values?.clientType === "Business" ? "Business" : "Person");
  const v = (k: string) => {
    const x = state.values?.[k];
    return Array.isArray(x) ? x[0] : x ?? (k === "name" ? defaultName ?? "" : "");
  };
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate aria-label="Quick add client">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="clientType" value={type} />
      <FormMessage msg={state.message} />
      <div className="flex gap-4 text-sm">
        {(["Person", "Business"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <input type="radio" name="qcType" checked={type === t} onChange={() => setType(t)} className="accent-brand-600" />
            {t}
          </label>
        ))}
      </div>
      {type === "Business" && (
        <F label="Business name *" error={e.businessName}>
          <Input name="businessName" defaultValue={v("businessName")} />
        </F>
      )}
      <F label={type === "Business" ? "Contact name" : "Full name *"} error={e.name}>
        <Input name="name" defaultValue={v("name")} autoFocus />
      </F>
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Email" error={e.email}>
          <Input name="email" type="email" defaultValue={v("email")} />
        </F>
        <F label="Mobile" error={e.mobile}>
          <Input name="mobile" type="tel" defaultValue={v("mobile")} />
        </F>
      </div>
      <p className="text-xs text-ink-500">You can add the address and other details later from the client record.</p>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100">Cancel</button>
        <SubmitButton>Add client</SubmitButton>
      </div>
    </form>
  );
}
