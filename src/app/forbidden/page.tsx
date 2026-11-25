import { LinkButton } from "@/components/ui";
import { ACTION_LABELS, currentPermissions, type Action } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access denied", robots: { index: false, follow: false } };

/** Friendly 403 / sign-in-required card. Lives outside the app shell so it never loops. */
export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ need?: string; reason?: string }> }) {
  const { need, reason } = await searchParams;
  const perms = await currentPermissions();
  const signIn = reason === "signin" || !perms.user;
  const label = need && need in ACTION_LABELS ? ACTION_LABELS[need as Action] : null;
  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-4">
      <div data-testid={signIn ? "sign-in-required" : "forbidden"} className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 text-center shadow-xs">
        <div className="mx-auto grid size-10 place-items-center rounded-full bg-brand-50 text-lg text-brand-700" aria-hidden>{signIn ? "→" : "!"}</div>
        {signIn ? (
          <>
            <h1 className="mt-3 text-lg font-semibold text-ink-900">Sign in required</h1>
            <p className="mt-1 text-sm text-ink-600">Please sign in with an active team account to use TC Quoting Estimate.</p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-lg font-semibold text-ink-900">You don&apos;t have access</h1>
            <p className="mt-1 text-sm text-ink-600">
              {label ? `You don't have permission to ${label}.` : "You don't have permission to do that."} Your role is{" "}
              <strong>{perms.role}</strong>. Ask an Owner or Admin if you need access.
            </p>
            <div className="mt-4"><LinkButton href="/dashboard" variant="secondary">Back to dashboard</LinkButton></div>
          </>
        )}
      </div>
    </div>
  );
}
