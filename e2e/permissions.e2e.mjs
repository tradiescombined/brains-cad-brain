// Role-based permissions e2e. Run against a server on the same data/bcb.db:
//   BASE_URL=http://localhost:3402 node e2e/permissions.e2e.mjs
// While auth is the single-user placeholder (getCurrentUser = first active Owner) we can't act as
// other roles from the browser, so this suite covers: Owner sees everything, the last-Owner guard,
// and "no signed-in user" handling (flip every Owner to Estimator → getCurrentUser() returns null).
// The role matrix itself is unit-tested in src/lib/permissions.test.ts.
// DB changes are always restored in `finally`.
import { createClient } from "@libsql/client";
import { start, check, done } from "./helpers.mjs";

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/bcb.db" });
const { page, base } = await start();
const vis = (l) => l.first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
const go = (p) => page.goto(base + p, { waitUntil: "networkidle" });

const owners = (await db.execute("SELECT id FROM users WHERE role = 'Owner' AND active = 1")).rows.map((r) => String(r.id));
const TOKEN = `perm-e2e-${Date.now()}`;
// A public quote link proves /q/[token] needs no user: reuse a quote_options row or add a temporary one.
let qo = (await db.execute("SELECT id, share_token FROM quote_options LIMIT 1")).rows[0];
let tempQo = null;
if (!qo) {
  const est = (await db.execute("SELECT id FROM estimates WHERE is_template = 0 ORDER BY created_at LIMIT 1")).rows[0];
  if (est) {
    tempQo = `perm-e2e-qo-${Date.now()}`;
    const now = new Date().toISOString();
    await db.execute({ sql: "INSERT INTO quote_options (id, estimate_id, created_at, updated_at) VALUES (?, ?, ?, ?)", args: [tempQo, est.id, now, now] });
    qo = { id: tempQo, share_token: null };
  }
}

try {
  /* ───────────── Owner (placeholder user) ───────────── */
  console.log("Owner");
  await check(Promise.resolve(owners.length > 0), "seed has an active Owner");
  await go("/dashboard");
  const nav = page.locator("aside nav");
  for (const label of ["Dashboard", "Estimates", "Catalogues", "Jobs", "Orders", "Invoices", "Settings"]) {
    await check(vis(nav.getByRole("link", { name: label, exact: true })), `sidebar shows ${label}`);
  }
  await check(vis(page.getByTestId("current-user").getByText(/Owner/)), "sidebar shows the acting user's role");
  await check(vis(page.getByTestId("kpi-invoices")), "dashboard shows invoice KPI");

  /* ───────────── Last active Owner guard ───────────── */
  console.log("Last Owner guard");
  await go("/settings/users");
  if (owners.length === 1) {
    const [{ email }] = (await db.execute({ sql: "SELECT email FROM users WHERE id = ?", args: [owners[0]] })).rows;
    const row = page.locator(`tr[data-user="${email}"]`);
    await row.getByRole("button", { name: "Edit" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator('select[name="role"]').selectOption("Admin");
    await dlg.getByRole("button", { name: "Save user" }).click();
    await check(vis(dlg.getByText("There must be at least one active Owner.")), "can't demote the last active Owner");
    const [{ role }] = (await db.execute({ sql: "SELECT role FROM users WHERE id = ?", args: [owners[0]] })).rows;
    await check(Promise.resolve(role === "Owner"), "Owner role unchanged in DB");
    await page.keyboard.press("Escape");
  } else {
    console.log("  (skipped: more than one active Owner)");
  }

  /* ───────────── Forbidden card ───────────── */
  await go("/forbidden?need=invoices.payments");
  await check(vis(page.getByTestId("forbidden").getByText("You don't have permission to record payments.")), "403 card names the missing permission");

  /* ───────────── No signed-in user ───────────── */
  console.log("Signed out (no active Owner)");
  if (qo) await db.execute({ sql: "UPDATE quote_options SET share_token = ? WHERE id = ?", args: [TOKEN, qo.id] });
  await go("/settings/business"); // form rendered while still "signed in"
  await db.execute(`UPDATE users SET role = 'Estimator' WHERE id IN (${owners.map(() => "?").join(",")})`, owners);

  // Server Actions enforce on their own, even from an already-open page.
  const form = page.getByRole("form", { name: "Business details" });
  await form.getByRole("button", { name: /Save/ }).click();
  await check(vis(form.getByText("Please sign in to continue.")), "server action refuses with a friendly message");

  for (const p of ["/dashboard", "/invoices", "/settings/users", "/jobs"]) {
    await go(p);
    await check(Promise.resolve(page.url().includes("/no-access")), `${p} → sign-in required`);
  }
  await check(vis(page.getByTestId("sign-in-required").getByText("Sign in required")), "sign-in card rendered");
  const res = await page.request.get(base + "/api/export/clients");
  await check(Promise.resolve(res.status() === 401), "CSV export → 401 when signed out");

  if (qo) {
    await go(`/q/${TOKEN}`);
    await check(vis(page.getByRole("heading", { name: /^Quote / })), "public quote page still works without a user");
    await check(Promise.resolve(!page.url().includes("/forbidden")), "public quote not redirected");
  }
} finally {
  await db.execute(`UPDATE users SET role = 'Owner' WHERE id IN (${owners.map(() => "?").join(",") || "''"})`, owners);
  if (tempQo) await db.execute({ sql: "DELETE FROM quote_options WHERE id = ?", args: [tempQo] });
  else if (qo) await db.execute({ sql: "UPDATE quote_options SET share_token = ? WHERE id = ?", args: [qo.share_token ?? null, qo.id] });
}

/* ───────────── Restored ───────────── */
console.log("Restored");
await go("/dashboard");
await check(Promise.resolve(page.url().endsWith("/dashboard")), "dashboard loads again after restoring the Owner");
await done();
