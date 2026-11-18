# Brains Cad Brain

Estimating, takeoffs, quotes and job management for builders and trades.

Lead → Estimate (plans & takeoffs, costings, specifications) → Quote (print or online acceptance)
→ Job (budget, schedule, purchase orders, variations, invoices, cost tracking, timesheets, selections).

## Run it

```bash
npm install
npm run db:reset      # creates data/bcb.db with sample data
npm run dev           # http://localhost:3000
```

Production: `npx next build && npx next start -p 3000`.

## Tests

```bash
npm run typecheck     # TypeScript
npm test              # unit tests (vitest)
# browser tests (real Chrome, headless), one command: build, fresh temp DB, next start on a free
# port, every suite twice (alphabetical, then reversed) to prove order-independence, summary table:
npm run e2e:all                      # add -- --skip-build to reuse .next, or -- leads quote to filter
# or against a running server (pass the same DATABASE_URL the server uses):
BASE_URL=http://localhost:3000 npm run e2e
```

`npm run e2e:all` never touches `data/bcb.db` (it uses `DATABASE_URL=file:<tmp>/bcb.db`). Suites share
one database, so each creates its own uniquely named records (`RUN` in `e2e/helpers.mjs`), never mutates
seed records (it clones them with `cloneEstimate` instead), and purges what it created. No route stubs or
console-error filters.

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
| Catalogues & recipes | `/catalogues` | `src/app/(app)/catalogues` |
| Jobs, schedule, costs, timesheets, selections | `/jobs`, `/schedule` | `src/app/(app)/jobs`, `src/lib/scheduling.ts`, `src/lib/job-finance.ts` |
| Orders, variations, invoices | `/orders`, `/invoices`, job tabs | `src/lib/money-docs.ts` |
| Clients, suppliers & trades | `/clients`, `/contacts` | `src/app/(app)/clients`, `contacts` |
| Settings | `/settings` | `src/app/(app)/settings` |

Estimate maths lives only in `src/lib/calc.ts` (category → item → sub-item tree, quantity formulas
with `[M1]` takeoff references and `[W10]` wastage, named markup lines, GST, PC/PS markup
redistribution, rounding). Call `recalcEstimate(id)` after any change.

Conventions for contributors (human or AI): `AGENTS.md`. Product spec: `docs/SPEC.md`.

## Data

Local SQLite file `data/bcb.db` via Drizzle + libSQL. Set `DATABASE_URL` (and
`DATABASE_AUTH_TOKEN`) to point at a hosted libSQL/Turso database for deployment.
`jobs.contractValue` is the revised contract (inc GST, approved variations included).
