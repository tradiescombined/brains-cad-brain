"use client";
import { useActionState, useEffect } from "react";
import { Badge, Card, Input } from "@/components/ui";
import { Modal, SubmitButton } from "@/components/ui/client";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { makePrimaryContact, removeClientContact, saveClientContact, type FormState } from "../actions";
import { F } from "../FormBits";

export type ClientContactRow = { id: string; name: string; role: string | null; email: string | null; mobile: string | null; phone: string | null; isPrimary: boolean };

export function ClientContacts({ clientId, contacts }: { clientId: string; contacts: ClientContactRow[] }) {
  return (
    <Card
      title={`Additional contacts (${contacts.length})`}
      pad={false}
      actions={
        <Modal title="Add contact" trigger={(open) => <button type="button" onClick={open} className="text-sm font-medium text-brand-700 hover:underline">+ Add contact</button>}>
          {(close) => <ContactForm clientId={clientId} onDone={close} />}
        </Modal>
      }
    >
      {contacts.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-500">No extra contacts. Add a partner, site contact or accounts person so everyone is in one place.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm" data-contact={c.name}>
              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2 font-medium text-ink-900">
                  {c.name}
                  {c.isPrimary && <Badge tone="green">Primary</Badge>}
                </div>
                {c.role && <div className="text-xs text-ink-500">{c.role}</div>}
              </div>
              <div className="min-w-48 flex-1 text-ink-600">
                {c.email && <div><a href={`mailto:${c.email}`} className="hover:text-brand-700">{c.email}</a></div>}
                <div className="text-xs">{[c.mobile, c.phone].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex items-center gap-2">
                {!c.isPrimary && (
                  <form action={makePrimaryContact}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="contactId" value={c.id} />
                    <button className="text-xs font-medium text-ink-500 hover:text-brand-700">Make primary</button>
                  </form>
                )}
                <Modal title="Edit contact" trigger={(open) => <button type="button" onClick={open} className="text-xs font-medium text-brand-700 hover:underline">Edit</button>}>
                  {(close) => <ContactForm clientId={clientId} contact={c} onDone={close} />}
                </Modal>
                <form action={removeClientContact}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="contactId" value={c.id} />
                  <ConfirmSubmit confirmText="Remove?" className="px-2 py-0.5 text-xs">Remove</ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ContactForm({ clientId, contact, onDone }: { clientId: string; contact?: ClientContactRow; onDone: () => void }) {
  const [state, action] = useActionState(saveClientContact, {} as FormState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, state.savedAt, onDone]);
  const v = (k: keyof ClientContactRow) => {
    const s = state.values?.[k];
    if (s !== undefined) return Array.isArray(s) ? s[0] : s;
    const x = contact?.[k];
    return typeof x === "string" ? x : "";
  };
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate aria-label={contact ? "Edit contact" : "Add contact"}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="contactId" value={contact?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Name *" error={e.name}><Input name="name" defaultValue={v("name")} autoFocus /></F>
        <F label="Role" error={e.role}><Input name="role" defaultValue={v("role")} placeholder="e.g. Partner, Site contact" /></F>
        <F label="Email" error={e.email} className="sm:col-span-2"><Input name="email" type="email" defaultValue={v("email")} /></F>
        <F label="Mobile"><Input name="mobile" type="tel" defaultValue={v("mobile")} /></F>
        <F label="Phone"><Input name="phone" type="tel" defaultValue={v("phone")} /></F>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-800">
        <input type="checkbox" name="isPrimary" defaultChecked={state.values ? state.values.isPrimary === "on" : contact?.isPrimary ?? false} className="size-4 accent-brand-600" />
        Primary contact
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100">Cancel</button>
        <SubmitButton>{contact ? "Save contact" : "Add contact"}</SubmitButton>
      </div>
    </form>
  );
}
