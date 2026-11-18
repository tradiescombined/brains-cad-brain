"use client";
/**
 * Header "Email" action: composes a quote email (summary + online quote link) and opens it in the
 * builder's own email app via mailto:. Optionally marks the quote as sent.
 */
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/client";
import { mailtoHref } from "@/lib/quote-email";
import { markAsSent, prepareQuoteEmail } from "./quote/actions";

const field = "block w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function EmailQuoteButton({ estimateId, sent }: { estimateId: string; sent: boolean }) {
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);
  const [pending, start] = useTransition();

  const load = () => {
    setError(null);
    setMarked(false);
    start(async () => {
      const r = await prepareQuoteEmail(estimateId);
      if (r.ok) setDraft({ to: r.to, subject: r.subject, body: r.body });
      else setError(r.error);
    });
  };

  return (
    <Modal
      title="Email quote"
      wide
      trigger={(open) => (
        <button
          type="button"
          onClick={() => {
            load();
            open();
          }}
          className="inline-flex items-center justify-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 shadow-xs hover:bg-ink-50"
        >
          Email
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!draft ? (
            <p className="text-sm text-ink-500">{pending ? "Preparing the email…" : ""}</p>
          ) : (
            <>
              <p className="text-xs text-ink-500">
                Opens in your email app with the quote summary and the client&apos;s online quote link (they can view, print and accept it there).
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-600">To</span>
                <input className={field} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="client@example.com" aria-label="Email to" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-600">Subject</span>
                <input className={field} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} aria-label="Email subject" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-600">Message</span>
                <textarea className={field} rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="Email message" />
              </label>
              {!draft.to && <p className="text-xs text-amber-700">No client email on this estimate — add one here or on the Details tab.</p>}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {marked ? (
                  <span role="status" className="mr-auto text-sm text-emerald-700">✓ Marked as sent</span>
                ) : (
                  <button
                    type="button"
                    className="mr-auto text-sm font-medium text-brand-700 hover:underline disabled:opacity-60"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const fd = new FormData();
                        fd.set("estimateId", estimateId);
                        await markAsSent(fd);
                        setMarked(true);
                      })
                    }
                  >
                    {sent ? "Mark as sent again" : "Mark as sent"}
                  </button>
                )}
                <button type="button" onClick={close} className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50">
                  Close
                </button>
                <a
                  href={mailtoHref(draft)}
                  data-testid="email-quote-link"
                  className="inline-flex items-center rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700"
                >
                  Open in email app
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
