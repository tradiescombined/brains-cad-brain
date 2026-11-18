"use client";
import { useActionState } from "react";
import type { AcceptState } from "./actions";

export function AcceptForm({ action, total, number, accepted }: { action: (p: AcceptState, fd: FormData) => Promise<AcceptState>; total: string; number: string; accepted: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state?.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900" role="status" data-testid="accept-confirmation">
        <div className="text-base font-semibold">Quote accepted</div>
        <p className="mt-1 text-sm">{state.message} We’ll be in touch shortly to confirm next steps.</p>
      </div>
    );
  }
  if (accepted) return null;
  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-ink-200 bg-white p-5 shadow-xs" data-testid="accept-form">
      <div>
        <h2 className="text-base font-semibold text-ink-900">Accept this quote</h2>
        <p className="mt-0.5 text-sm text-ink-500">Accepting quote {number} for {total} (inc tax). Typing your name below acts as your signature.</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Full name</span>
        <input
          name="signatureName" required minLength={2} maxLength={120} autoComplete="name" defaultValue={state?.fields?.name ?? ""}
          className="block w-full rounded-md border border-ink-200 px-3 py-2 font-serif text-lg italic text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          placeholder="Your full name"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-ink-800">
        <input type="checkbox" name="agree" className="mt-0.5 size-4 accent-brand-600" />
        <span>I accept the quote and terms</span>
      </label>
      {state && !state.ok && <p className="text-sm font-medium text-red-700" role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto">
        {pending ? "Submitting…" : "Accept quote"}
      </button>
    </form>
  );
}
