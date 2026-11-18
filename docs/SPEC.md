# Brains Cad Brain — product spec

Estimating, takeoff, quoting and job management for residential builders and trades.
Feature scope benchmarked against the workflows of Buildxact (a subscription we hold) — we
match *what it does*, with our own UI, wording and data. **Never copy their text, images,
branding or catalogue data.**

## Core workflow
Lead → Estimate (takeoff + costings + specs) → Quote sent → Accepted → Job
(budget, schedule, orders, actual costs, variations, invoices/progress claims) → Complete.

## How the reference app calculates (implemented in `src/lib/calc.ts`, do not reimplement)
- Costings are a tree: **Category → Item → Sub-item** (recipe components). Rows are numbered
  `3`, `3.7`, `3.7.2` by position.
- Each item: description, cost type (Material/Labour/Equipment/Subcontractor/Other), UOM,
  quantity (or quantity **formula**), unit cost, optional item markup override, taxable flag,
  allowance type (normal / PC prime cost / PS provisional sum), supplier, notes.
- Formulas reference takeoff measurements: `[M1]`, wastage `[W10]` (=×1.10), parent qty `[Q]`,
  functions `ceil floor round roundup min max abs sqrt`. Quantities round to 3 dp.
- An item with sub-items: unit cost = Σ(sub qty × sub unit cost); sub totals scale by parent qty.
- Estimate markup is a list of named lines (e.g. Markup 18% + Contingency 2%) summed.
- Tax per estimate tax profile (GST 10%) on (cost + markup) of taxable items.
- PC/PS markup redistribution: None / Across estimate / Within category (display only; total unchanged).
- Quote total rounding: none / $1 / $10 / $100 / $1000 (round up).
- After ANY change to items/measurements/markup/tax call `recalcEstimate(id)` from `src/lib/estimates.ts`.

## Modules (one owner each)
1. **Dashboard & Reminders** `/dashboard`, `/reminders` — KPIs (open estimates value, win rate
   from accepted vs rejected, active jobs, invoices outstanding/overdue), recent estimates list,
   pipeline-by-stage, upcoming reminders, quick-start checklist (hideable via settings flags),
   activity feed. Reminders: CRUD, due dates, done toggle, link to a record.
2. **Leads** `/leads` — list with filter by stage + search, kanban board view by stage, lead detail
   (contact, site, source, value, probability, follow-up, assigned), notes, convert lead → estimate
   (creates estimate linked via leadId, copies client/site), mark Won/Lost (+reason).
3. **Clients & Suppliers/Trades** `/clients`, `/contacts` — lists with search, detail pages with tabs
   (details, estimates, jobs, notes), create/edit, archive, extra client contacts, contact type &
   groups, insurance expiry warning, CSV import + export.
4. **Estimates (list & details)** `/estimates`, `/estimates/new`, `/estimates/[id]` (Details tab) —
   list with status filter, search, totals; create from blank or from template (templates =
   estimates with isTemplate; "Save as template"; "Manage templates"); details tab: name, number,
   building type, status, client (pick existing or type), work location, lead link, tax profile,
   PC/PS redistribution, documents upload (folders), notes, versions (capture snapshot / restore),
   duplicate estimate, archive. Also the estimate tab bar component `EstimateTabs` and the estimate
   header (name, status selector, quote total, actions: Create job, Prepare quote).
5. **Estimate Costings** `/estimates/[id]/costings` — the spreadsheet-like grid: add category / item
   / sub-item, inline edit every column, formula entry with live result & error, drag or up/down
   reorder, indent/outdent, duplicate, delete, collapse categories, cost-type colour chips, PC/PS
   flags, add from catalogue (search modal, recipe expands to sub-items), markup lines editor,
   rounding, summary panel (cost, markup breakdown, tax, total, by cost type), measurement picker
   to insert `[Mx]`.
6. **Plans & Takeoffs** `/estimates/[id]/takeoffs` — upload plan images (PNG/JPG; PDF pages via
   pdf.js render to image if feasible), set scale by drawing a known-length line, tools: line,
   polyline (length), rectangle/polygon/ellipse (area), point (count); pitch, depth (→m3), height
   (length→wall m2), negative (deductions); measurement list with codes M1..Mn, colours, rename,
   delete; zoom/pan; values feed costing formulas (recalcEstimate after changes); "link measurement
   to new costing item".
7. **Specifications & Quote** `/estimates/[id]/specifications`, `/estimates/[id]/quote` — spec
   sections tree editor, spec library templates (insert/save); quote builder with all print
   options (see `quote_options` table), cover letter & T&Cs with merge fields
   ([ClientName], [EstimateName], [QuoteTotal], [ValidUntil], [BusinessName]), live printable
   preview (A4, browser print → PDF), mark as Sent, online client quote page
   `/q/[token]` (public, outside the app shell) where client can accept with typed signature →
   estimate status Accepted.
8. **Catalogues** `/catalogues` — catalogue list (own + supplier price lists), catalogue detail with
   categories sidebar, item grid with search, inline edit, add/edit/delete, recipes (assemblies)
   editor with component lines, CSV import (column mapping) and export, bulk % price update.
9. **Jobs & Schedule** `/jobs`, `/jobs/[id]`, `/schedule` — create job from accepted estimate
   (copies budget lines from costings, contract value = quote total) or blank; job overview (contract
   value, variations, invoiced, paid, costs to date, budget vs actual by category, margin); job tabs:
   overview, schedule (Gantt: tasks with start/duration/dependencies/progress/assignee, drag to
   move in UI optional, auto-shift dependants), cost tracking (budget vs actual, add actual costs),
   timesheets, selections, notes/documents. `/schedule` shows all jobs' tasks on one timeline.
10. **Orders, Variations & Invoices** `/orders`, `/invoices`, plus job sub-tabs
    `/jobs/[id]/orders|variations|invoices` — purchase orders (from estimate/job items grouped by
    supplier, or blank; statuses; printable PO), variations (lines, markup, tax, approve → adds to
    contract value), invoices (deposit %, progress claim by % of contract or by schedule stage,
    variation invoices, final; payments; printable tax invoice; overdue flag), aged receivables list.
11. **Settings** `/settings/*` (owned by module 1's agent or the integrator) — business details & logo,
    users & roles, tax rates, numbering prefixes, quote defaults (valid days, default T&Cs), lookups
    (estimate statuses, building types, unit measures, contact types/groups, client sources/types,
    document folders), dashboard display toggles.

Out of scope for v1: accounting sync (Xero/MYOB/QuickBooks), supplier live pricing, AI assistant,
mobile app, multi-tenant auth. Keep data model ready for them.
