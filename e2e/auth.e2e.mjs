// Sign-in gate (Clerk). Needs a server running WITHOUT BCB_AUTH_BYPASS and with Clerk keys in
// .env.local — real dev keys, or keyless/accountless ones from
// `npx -y clerk@latest init --accountless` (see README → Sign-in). Needs network access to Clerk.
//   npx next dev -p 3402 &   BASE_URL=http://localhost:3402 node e2e/auth.e2e.mjs
// Skips (exit 0, with a clear message) when the bypass is on, Clerk is unreachable, or the server
// has no Clerk keys.
import { start, check, done } from "./helpers.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";

function skip(why) {
  console.log(`SKIPPED auth.e2e: ${why}`);
  process.exit(0);
}

const probe = await fetch(base + "/dashboard", { redirect: "manual" }).catch((e) => skip(`server not reachable at ${base} (${e.message})`));
if (probe.status === 200) skip("server is running with BCB_AUTH_BYPASS=1 (sign-in not enforced) — start it without the bypass to run this suite");
if (probe.status >= 500) {
  const body = await fetch(base + "/dashboard").then((r) => r.text()).catch(() => "");
  if (/Clerk keys are missing|publishableKey|Missing publishable key/i.test(body))
    skip("server has no Clerk keys — add keyless/dev keys to .env.local (README → Sign-in) or real keys");
}
const clerkUp = await fetch("https://api.clerk.com/v1/", { signal: AbortSignal.timeout(8000) }).then(() => true, () => false);
if (!clerkUp) skip("no network access to api.clerk.com — Clerk (keyless or keyed) can't run here");

const { page } = await start();

console.log("Protected routes redirect to sign-in");
await page.goto(base + "/dashboard");
await page.waitForURL(/\/sign-in/, { timeout: 30000 }).catch(() => {});
await check(Promise.resolve(new URL(page.url()).pathname.startsWith("/sign-in")), `/dashboard → /sign-in (got ${page.url()})`);

const api = await fetch(base + "/api/export/clients", { redirect: "manual" });
await check(Promise.resolve(api.status !== 200), `/api/export/clients is not served signed-out (status ${api.status})`);

const action = await fetch(base + "/settings/users", { method: "POST", redirect: "manual", headers: { "content-type": "text/plain" }, body: "x" });
await check(Promise.resolve(action.status !== 200), `POST to a protected page is refused signed-out (status ${action.status})`);

console.log("Sign-in page");
await page.goto(base + "/sign-in");
await check(page.getByText("TC Quoting Estimate", { exact: true }).first().isVisible(), "our wordmark renders");
await check(page.getByRole("heading", { name: "Sign in to your business" }).isVisible(), "our heading renders");
const clerkCard = page.locator(".cl-signIn-root, .cl-cardBox").first();
await check(clerkCard.waitFor({ state: "visible", timeout: 30000 }).then(() => true), "Clerk <SignIn/> UI renders");
const google = await page.getByRole("button", { name: /Google/ }).count();
const apple = await page.getByRole("button", { name: /Apple/ }).count();
console.log(`  · social buttons on this Clerk instance: Google=${google > 0} Apple=${apple > 0} (enable both in the Clerk dashboard)`);
await check(page.getByText("TC Quoting Estimate", { exact: true }).first().isVisible(), "branding still present after Clerk loads");
if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });

console.log("Sign-up page");
await page.goto(base + "/sign-up");
await check(page.locator(".cl-signUp-root, .cl-cardBox").first().waitFor({ state: "visible", timeout: 30000 }).then(() => true), "Clerk <SignUp/> UI renders");

console.log("Public routes");
// fetch (not page.goto) so the expected 404 doesn't count as a browser console error
const q = await fetch(base + "/q/not-a-real-token", { redirect: "manual" });
await check(Promise.resolve(q.status === 404), `/q/<invalid> is 404, not redirected to sign-in (got ${q.status} ${q.headers.get("location") ?? ""})`);

await page.goto(base + "/no-access");
await check(Promise.resolve(new URL(page.url()).pathname === "/no-access"), "/no-access is public");
await check(page.getByTestId("no-access").isVisible(), "/no-access renders");
await check(page.getByRole("link", { name: "Sign in" }).isVisible(), "/no-access offers sign in when signed out");

await done();
