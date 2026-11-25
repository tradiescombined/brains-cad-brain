<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## TC Quoting Estimate conventions (read before coding)

- Product spec: `docs/SPEC.md`. Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind v4,
  Drizzle ORM + libsql (SQLite file `data/bcb.db`). `cacheComponents` is OFF; pages are dynamic.
- `params` / `searchParams` are Promises: `const { id } = await params;`
- All app pages live under `src/app/(app)/` (gets the sidebar shell). Public pages (e.g. `/q/[token]`)
  go directly under `src/app/`.
- Data writes: Server Actions in an `actions.ts` next to the route (`"use server"`), then
  `revalidatePath(...)` and/or `redirect(...)`. Reads: query `db` directly in Server Components.
- DB: `import { db, schema } from "@/db"`. Schema files in `src/db/schema/`. If your module needs a
  new column/table, add it ONLY in the schema file for your module, then `npm run db:push`.
- Estimate maths: ONLY via `src/lib/calc.ts` / `src/lib/estimates.ts` (`recalcEstimate`). Never
  duplicate the maths. Formula parsing: `src/lib/expr.ts`.
- Shared helpers: `@/lib/format` (money, date, num, cx, addDays), `@/lib/settings` (getSettings,
  nextNumber, getLookups, getTaxRates, getDefaultTaxRate, logActivity).
- UI kit: `@/components/ui` (Button, LinkButton, PageHeader, Card, Field, Input, Textarea, Select,
  Checkbox, Badge, statusTone, Table/Th/Td, EmptyState, Stat, TabNav, DescList) and
  `@/components/ui/client` (SubmitButton, ConfirmButton, Modal). Never use window.alert/confirm/prompt.
- Look & feel: clean, dense, white cards on `ink-50` background, brand teal (`brand-600`). Money right
  aligned with `tabular-nums`. Australian English and AUD.
- Permissions: every new Server Action must start with a permission check from `@/lib/permissions`
  (`denied("…")` for actions returning state, `requirePermission("…")` for void form actions); gate new
  pages/sections and hide controls with `currentPermissions()`. Matrix: `docs/PERMISSIONS.md`.
- Installing on a Mac as an agent: follow `docs/INSTALL-FOR-CLAUDE.md` step by step (never `clerk init`, never read `.env`).
- Self-hosting (owner runs it on their own computer): `docs/SELF-HOSTING.md`; scripts `scripts/{setup,serve,
  update,backup,restore,service,doctor}.mjs` use Node built-ins only (they run before `npm ci`), share
  `scripts/lib/common.mjs`, and the auto-start generators in `scripts/lib/service-defs.mjs` are unit tested.
  Schema changes must stay additive: `npm run setup`/`update` apply them with `drizzle-kit push` WITHOUT
  `--force` and refuse anything that would drop data.
- Verify before finishing: `npx tsc --noEmit`, `npm test`, and `npx next build`.
