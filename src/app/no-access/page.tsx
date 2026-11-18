import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";
import { getAccessStatus } from "@/lib/auth";
import { authBypassEnabled } from "@/lib/auth-bypass";

export const metadata = { title: "No access yet" };

/** Only same-site relative paths (no protocol-relative "//evil.com"). */
function safeNext(next: string | string[] | undefined): string {
  const n = Array.isArray(next) ? next[0] : next;
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") && !n.startsWith("/no-access") ? n : "/dashboard";
}

const btn =
  "inline-flex items-center justify-center rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs hover:bg-brand-700";

/**
 * Where the proxy sends a signed-in person who isn't (yet) linked to an active team member.
 * Resolving access here links invited users on their first sign-in, then sends them on to `next`.
 */
export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const access = await getAccessStatus();
  if (access.status === "ok") redirect(safeNext(next));

  if (access.status === "signed-out") {
    return (
      <AuthShell title="You're not signed in" subtitle="Sign in with the Google or Apple account your business owner invited.">
        <div className="rounded-lg border border-ink-200 bg-white p-5 text-center shadow-xs" data-testid="no-access">
          <Link href="/sign-in" className={btn}>Sign in</Link>
        </div>
      </AuthShell>
    );
  }

  const email = access.email;
  const inactive = access.status === "inactive";
  return (
    <AuthShell title={inactive ? "Your access is turned off" : "You don't have access yet"}>
      <div className="space-y-4 rounded-lg border border-ink-200 bg-white p-5 text-sm text-ink-700 shadow-xs" data-testid="no-access">
        {inactive ? (
          <p>
            The login for <strong className="text-ink-900">{email ?? "this account"}</strong> has been made inactive. Ask the
            business owner to turn it back on in <strong>Settings → Users</strong>.
          </p>
        ) : (
          <p>
            Ask the business owner to add <strong className="text-ink-900">{email ?? "your email address"}</strong> in{" "}
            <strong>Settings → Users</strong>, then sign in again with Google or Apple using that email.
          </p>
        )}
        <p className="text-xs text-ink-500">
          Signed in with a different account than the one you were invited with? Sign out and choose the right one.
        </p>
        {!authBypassEnabled() && (
          <div className="flex justify-center">
            <SignOutButton redirectUrl="/sign-in">
              <button type="button" className={btn}>Sign out</button>
            </SignOutButton>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
