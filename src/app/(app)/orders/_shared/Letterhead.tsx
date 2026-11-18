/** Business letterhead + print page chrome shared by printable POs, variations and invoices. */
import type { ReactNode } from "react";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "./client";

export async function Letterhead({ docTitle, docMeta }: { docTitle: string; docMeta: [string, ReactNode][] }) {
  const s = await getSettings();
  const addr = [s.address, [s.cityTown, s.state, s.postcode].filter(Boolean).join(" ")].filter(Boolean);
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 pb-5" style={{ borderColor: s.brandColour }}>
      <div className="min-w-0">
        {s.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logoDataUrl} alt={s.businessName} className="mb-2 max-h-16 max-w-48 object-contain" />
        ) : null}
        <div className="text-lg font-semibold text-ink-900">{s.tradingName || s.businessName}</div>
        {s.tradingName && s.tradingName !== s.businessName && <div className="text-xs text-ink-500">{s.businessName}</div>}
        <div className="mt-1 space-y-0.5 text-xs text-ink-600">
          {addr.map((a) => <div key={a}>{a}</div>)}
          {(s.phone || s.email) && <div>{[s.phone, s.email].filter(Boolean).join(" · ")}</div>}
          {s.businessNumber && <div>ABN {s.businessNumber}</div>}
          {s.licenceNumber && <div>Licence {s.licenceNumber}</div>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold uppercase tracking-wide" style={{ color: s.brandColour }}>{docTitle}</div>
        <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-0.5 text-sm">
          {docMeta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-500">{k}</dt>
              <dd className="font-medium tabular-nums text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

/** Toolbar above a printable document (hidden when printing) + A4-ish sheet. */
export function PrintSheet({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Link href={back.href} className="text-sm font-medium text-ink-600 hover:text-brand-700">← {back.label}</Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-8 text-ink-900 shadow-sm ring-1 ring-ink-200 print:max-w-none print:p-0 print:shadow-none print:ring-0 sm:p-12">
        {children}
      </article>
    </div>
  );
}

export function PartyBlock({ label, lines }: { label: string; lines: (string | null | undefined)[] }) {
  const l = lines.filter(Boolean) as string[];
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</div>
      {l.length ? (
        <div className="mt-1 space-y-0.5 text-sm">
          {l.map((x, i) => <div key={i} className={i === 0 ? "font-medium" : "text-ink-700"}>{x}</div>)}
        </div>
      ) : (
        <div className="mt-1 text-sm text-ink-400">—</div>
      )}
    </div>
  );
}
