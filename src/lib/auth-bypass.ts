/**
 * Test-only sign-in bypass. When `BCB_AUTH_BYPASS=1` is set on the server, the proxy does not require
 * a Clerk session and `getCurrentUser()` returns the first active Owner (the old single-user
 * behaviour), so the Playwright suites can run without real Google/Apple OAuth.
 *
 * Never honoured on a deployed Vercel site (NODE_ENV=production AND VERCEL set), whatever the env says.
 * No `server-only` import: this is used by `src/proxy.ts` as well as server components.
 */
export function authBypassEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.BCB_AUTH_BYPASS !== "1") return false;
  if (env.NODE_ENV === "production" && env.VERCEL) return false;
  return true;
}
