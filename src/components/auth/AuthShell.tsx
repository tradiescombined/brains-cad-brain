import { Brand } from "@/components/shell/Brand";

/** Centered, branded frame for the sign-in / sign-up / no-access pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand size="lg" href="/" />
          <div>
            <h1 className="text-base font-semibold text-ink-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-ink-400">Estimating, quotes and job management for builders and trades.</p>
      </div>
    </div>
  );
}
