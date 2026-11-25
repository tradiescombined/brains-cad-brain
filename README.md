# TC Quoting Estimate

**Download (Mac server kit):** https://github.com/tradiescombined/brains-cad-brain/releases/latest/download/BrainsCadBrain-Server-Kit.zip  
Unzip it, open `START HERE.txt`, then double-click `Install on this Mac.command`.

Estimating, takeoffs, quotes and job management for builders and trades.

Lead → Estimate (plans & takeoffs, costings, specifications) → Quote (print or online acceptance)
→ Job (budget, schedule, purchase orders, variations, invoices, cost tracking, timesheets, selections).

## Run it

```bash
npm install
npm run db:reset      # creates data/bcb.db with sample data
npm run dev           # http://localhost:3000
```

**Run it as a server** on your own Mac, Windows PC or Linux box (install from GitHub, sign-in, auto-start,
updates, backups): see **[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)**. Claude Code installing it: **[docs/INSTALL-FOR-CLAUDE.md](docs/INSTALL-FOR-CLAUDE.md)**. In short:

```bash
npm run setup     # install, .env, database (never wipes data), build — safe to re-run
npm run serve     # production server on PORT (default 3000), logs in logs/
npm run doctor    # health check
npm run update    # backup, git pull, migrate, rebuild
npm run backup    # snapshot to backups/  (npm run restore -- <file> to restore)
npm run service:install   # auto-start on boot + nightly backup (launchd / systemd / Task Scheduler)
```

## Sign-in (Google and Apple via Clerk)

Everyone signs in with **Google** or **Apple** through [Clerk](https://clerk.com). Access is
invite-only and lives in the `users` table:

- **Owner adds people** in Settings → Users (name, email, role). That is the invite: the person opens
  the site, chooses *Continue with Google* / *Continue with Apple* with that email, and their login is
  linked to the row (`users.clerk_user_id`). The Users page shows "Signed in via Google on …" or
  "Invited — not signed in yet".
- **Fresh install:** the first person to sign in becomes the Owner (claims the seeded
  `owner@example.com` placeholder). Set `BCB_OWNER_EMAIL` to restrict who can do that — sign in
  straight after deploying either way.
- Anyone else (or an inactive user) gets `/no-access`: "ask the business owner to add <email> in
  Settings → Users". The proxy (`src/proxy.ts`) also refuses server actions and API routes to them.
- Code: `src/proxy.ts` (gate), `src/lib/auth.ts` (`getCurrentUser()`), `src/lib/user-resolution.ts`
  (linking policy, unit tested), `src/app/sign-in`, `src/app/sign-up`, `src/app/no-access`.

**Local development** needs no Clerk account. In `@clerk/nextjs` 7 (Core 3) "keyless" temporary
dev keys come from the Clerk CLI, not the package at runtime — the proxy refuses to start without
keys. Get them once (needs internet; writes an unclaimed dev instance's keys into `.env.local`,
which is gitignored):

```bash
npx -y clerk@latest init --accountless --framework next --pm npm --no-skills
```

That command also scaffolds files Clerk thinks are missing (it may add `src/proxy.js`, sign-in pages
and env vars) — keep only the two `*_CLERK_*_KEY` lines it adds to `.env.local` and discard the rest
(`git checkout -- . && git clean -n` to review). Alternatively run it in an empty scratch folder and
copy the two key lines across. Claim the instance later with `npx clerk auth login`. Without keys,
use the test bypass below.

**Production / self-hosting:** the Clerk production instance, Google and Apple setup checklist,
domain + HTTPS (Cloudflare Tunnel) and the `.env` settings are in
[`docs/SELF-HOSTING.md` → Sign-in](docs/SELF-HOSTING.md#6-sign-in-choose-option-a-or-b).
Never set `BCB_AUTH_BYPASS` (or `BCB_ALLOW_TEST_BYPASS`) on a server.

## Tests

```bash
npm run typecheck     # TypeScript
npm test              # unit tests (vitest)
# browser tests (real Chrome, headless), one command: build, fresh temp DB, next start on a free
# port, every suite twice (alphabetical, then reversed) to prove order-independence, summary table:
npm run e2e:all                      # add -- --skip-build to reuse .next, or -- leads quote to filter
# or against a running server (pass the same DATABASE_URL the server uses):
# browser tests (real Chrome, headless) against a running server started with the test bypass:
npx next build && BCB_AUTH_BYPASS=1 BCB_ALLOW_TEST_BYPASS=1 npx next start -p 3000
BASE_URL=http://localhost:3000 npm run e2e
# sign-in gate test, against a server WITHOUT the bypass, with Clerk dev keys in .env.local (see above):
npx next dev -p 3402 & BASE_URL=http://localhost:3402 node e2e/auth.e2e.mjs
```

`npm run e2e:all` never touches `data/bcb.db` (it uses `DATABASE_URL=file:<tmp>/bcb.db`). Suites share
one database, so each creates its own uniquely named records (`RUN` in `e2e/helpers.mjs`), never mutates
seed records (it clones them with `cloneEstimate` instead), and purges what it created. No route stubs or
console-error filters.
`BCB_AUTH_BYPASS=1` (server env) turns sign-in off and makes `getCurrentUser()` return the first
active Owner, so the suites run without real Google/Apple OAuth. Under `next dev` that one variable is
enough; a production build (`next start`, NODE_ENV=production) also needs `BCB_ALLOW_TEST_BYPASS=1`, so
it can't be switched on by accident on a server (`npm run e2e:all` sets both). It is always ignored on a
deployed Vercel site (`NODE_ENV=production` + `VERCEL`), and `npm run serve` refuses to start if either
variable is set. `e2e/auth.e2e.mjs`
skips itself, with a message, when the bypass is on or Clerk is unreachable.

`e2e/integration.e2e.mjs` crawls every page and fails on any 404/500 or console error;
`e2e/workflow.e2e.mjs` walks the whole lead-to-paid-invoice workflow.

## Where things are

| Area | Route | Code |
|---|---|---|
| Dashboard, reminders | `/dashboard`, `/reminders` | `src/app/(app)/dashboard`, `reminders` |
| Leads | `/leads` | `src/app/(app)/leads` |
| Estimates, templates, versions | `/estimates` | `src/app/(app)/estimates` |
| Plans & takeoffs | `/estimates/[id]/takeoffs` | `.../takeoffs`, `src/lib/geometry.ts` |
| Costings | `/estimates/[id]/costings` | `.../costings`, `src/lib/calc.ts`, `src/lib/expr.ts` |
| Specifications & quote, client acceptance | `/estimates/[id]/specifications`, `/quote`, `/q/[token]` | `src/components/quote` |
| Estimate schedule (quote-stage plan → job schedule) | `/estimates/[id]/schedule` | `.../schedule`, `src/app/(app)/schedule/_lib/TaskEditor.tsx`, `src/lib/scheduling.ts` |
| Catalogues & recipes | `/catalogues` | `src/app/(app)/catalogues` |
| Jobs, schedule, costs, timesheets, selections | `/jobs`, `/schedule` | `src/app/(app)/jobs`, `src/lib/scheduling.ts`, `src/lib/job-finance.ts` |
| Orders, variations, invoices | `/orders`, `/invoices`, job tabs | `src/lib/money-docs.ts` |
| Clients, suppliers & trades | `/clients`, `/contacts` | `src/app/(app)/clients`, `contacts` |
| Settings | `/settings` | `src/app/(app)/settings` |

Estimate maths lives only in `src/lib/calc.ts` (category → item → sub-item tree, quantity formulas
with `[M1]` takeoff references and `[W10]` wastage, named markup lines, GST, PC/PS markup
redistribution, rounding). Call `recalcEstimate(id)` after any change.

Conventions for contributors (human or AI): `AGENTS.md`. Product spec: `docs/SPEC.md`.
Feature-by-feature comparison with the reference app: `docs/FIDELITY.md`.
Roles & permissions (every Server Action must check one): `docs/PERMISSIONS.md`, `src/lib/permissions.ts`.

## Data

Local SQLite file `data/bcb.db` via Drizzle + libSQL. Set `DATABASE_URL` (and
`DATABASE_AUTH_TOKEN`) to point at a hosted libSQL/Turso database for deployment.
`jobs.contractValue` is the revised contract (inc GST, approved variations included).
