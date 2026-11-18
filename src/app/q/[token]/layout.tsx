export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

/** Public client-facing layout: no app chrome. */
export default function PublicQuoteLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink-100 px-3 py-6 sm:px-6 sm:py-10 print:bg-white print:p-0">{children}</div>;
}
