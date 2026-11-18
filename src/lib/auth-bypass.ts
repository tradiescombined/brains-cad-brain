/**
 * Test-only sign-in bypass. When `BCB_AUTH_BYPASS=1` is set on the server, the proxy does not require
 * a Clerk session and `getCurrentUser()` returns the first active Owner (the old single-user
 * behaviour), so the Playwright suites can run without real Google/Apple OAuth.
 *
 * It must be impossible to switch on by accident on a real server, so it is honoured only when:
 *   - `BCB_AUTH_BYPASS=1`, AND
 *   - the app is not a production build (`next dev`), OR `BCB_ALLOW_TEST_BYPASS=1` is ALSO set
 *     (`next start` always runs with NODE_ENV=production; `scripts/e2e-all.mjs` sets both), AND
 *   - it is not a deployed Vercel production site (NODE_ENV=production AND VERCEL), whatever the env says.
 * `npm run serve` (scripts/serve.mjs) additionally refuses to start while either variable is set.
 * No `server-only` import: this is used by `src/proxy.ts` as well as server components.
 */
export function authBypassEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.BCB_AUTH_BYPASS !== "1") return false;
  const production = env.NODE_ENV === "production";
  if (production && env.VERCEL) return false;
  if (production && env.BCB_ALLOW_TEST_BYPASS !== "1") return false;
  return true;
}
