# Roles & permissions

Code: `src/lib/permissions.ts` (matrix + helpers), tests: `src/lib/permissions.test.ts`,
`e2e/permissions.e2e.mjs`. The signed-in user comes from `getCurrentUser()` in `src/lib/auth.ts`.

**Server Actions are the security boundary.** Every mutating Server Action checks a permission
before touching the database. Hiding buttons and sidebar entries is convenience only.

## Matrix

✓ = allowed. Owner and Admin have every permission.

| Action | What it covers | Owner | Admin | Estimator | Project Manager | Site Supervisor | Read Only |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `settings.manage` | Settings pages, tax rates, numbering, lists, spec library | ✓ | ✓ | | | | |
| `users.manage` | Settings → Users | ✓ | ✓ | | | | |
| `estimates.view` | Estimates list and tabs | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `estimates.edit` | Create/edit estimates, takeoffs, costings, specs, estimate schedule, quote options, templates, versions; convert lead → estimate | ✓ | ✓ | ✓ | | | |
| `estimates.delete` | Delete estimates/templates | ✓ | ✓ | ✓ | | | |
| `quotes.send` | Mark as sent, create/revoke the client link | ✓ | ✓ | ✓ | | | |
| `catalogues.edit` | Catalogues, items, recipes, CSV import, bulk price changes | ✓ | ✓ | ✓ | | | |
| `leads.edit` | Leads (stage, won/lost, archive) | ✓ | ✓ | ✓ | | | |
| `clients.edit` | Clients, client contacts, client CSV import | ✓ | ✓ | ✓ | | | |
| `contacts.edit` | Suppliers & trades | ✓ | ✓ | ✓ | ✓ | | |
| `jobs.view` | Jobs list, job overview, schedule, timesheets, selections, notes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `jobs.edit` | Create/edit/archive jobs, budget lines, actual costs | ✓ | ✓ | | ✓ | | |
| `schedule.edit` | Tasks, progress, shifting the schedule | ✓ | ✓ | | ✓ | ✓ | |
| `orders.view` | Purchase orders (they are cost documents) | ✓ | ✓ | | ✓ | | |
| `orders.edit` | Create/edit POs, record bills | ✓ | ✓ | | ✓ | | |
| `variations.edit` | Create/edit/delete draft variations | ✓ | ✓ | | ✓ | | |
| `variations.approve` | Approve / un-approve (changes the contract value); delete an approved variation | ✓ | ✓ | | ✓ | | |
| `invoices.view` | Contract money: contract value, variations, invoices, payments | ✓ | ✓ | | ✓ | | ✓ |
| `invoices.edit` | Create/edit/void/delete invoices | ✓ | ✓ | | | | |
| `invoices.payments` | Record/remove payments | ✓ | ✓ | | | | |
| `costs.view` | Costs & margins: cost/markup columns, job budget/actuals/margin/WIP, catalogues | ✓ | ✓ | ✓ | ✓ | | |
| `timesheets.edit` | Timesheets | ✓ | ✓ | | ✓ | ✓ | |
| `selections.edit` | Job selections | ✓ | ✓ | | ✓ | ✓ | |
| `notes.edit` | Notes and documents on any record | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `reminders.edit` | Reminders | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `records.delete` | Delete leads, clients, suppliers/trades (archive is `*.edit`) | ✓ | ✓ | | | | |

Notes on the defaults:

- **Estimator** builds estimates, so it sees costs and margins (`costs.view`), including on job
  overviews, but has no job money (`invoices.*`, `orders.*`, variation approval) and no settings.
- **Project Manager** sees estimates read-only (costings render as a read-only table with costs),
  runs jobs end-to-end and sees invoices without being able to change them.
- **Site Supervisor** has no money at all: no contract value, costs, margins, orders, variations or invoices.
- **Read Only** sees estimates (sell prices only), jobs, contract value and invoices, but never costs,
  margins, catalogues or purchase orders, and can't change anything.
- Leads, clients, suppliers and reminders are visible to every signed-in user.

## Owner protection (Settings → Users)

- Only an **Owner** can create, edit or delete an Owner, or give someone the Owner role
  (`canManageUser`). Admins don't see Edit/Delete on Owner rows.
- The **last active Owner** can never be deleted, demoted or deactivated (`lastOwnerError`).

## Helpers

| Helper | Use |
|---|---|
| `can(role, action)` | Pure check (no I/O) |
| `denied(action)` → `string \| null` | Server Actions that return an error state: `const denial = await denied("x"); if (denial) return { error: denial };` |
| `checkPermission(action)` | Same, but also returns the acting user |
| `requirePermission(action)` | Pages, layouts and void form actions: redirects to `/forbidden?need=x` (or `/forbidden?reason=signin`) |
| `assertPermission(action)` | Throws a typed `PermissionError` |
| `routeDenied(action \| null)` | Route Handlers: 401/403 `Response` or null |
| `currentPermissions()` | `{ user, role, [action]: boolean }` for hiding UI |

Section gates live in small `layout.tsx` files (`estimates`, `jobs`, `schedule`, `orders`,
`invoices`, `catalogues`, `settings`, and the job `costs`/`orders`/`variations`/`invoices` tabs).
The sidebar (`src/components/shell/nav.ts`) lists the permission for each entry and the server
layout passes only allowed entries to `<Sidebar>`.

## No signed-in user

`getCurrentUser()` returning `null` (or an inactive user) means no permissions. The app shell
redirects to `/forbidden?reason=signin` ("Sign in required"), Server Actions return
"Please sign in to continue.", and exports return 401. `/forbidden` lives outside the app shell.
The public quote page `/q/[token]` and its accept action never require a user.
