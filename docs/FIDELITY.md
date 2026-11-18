# Feature fidelity vs the reference app

Systematic comparison of every screen, field, option and setting captured from the reference app
(teardown + crawl of 18 Nov 2026: `research/BUILDXACT-TEARDOWN.md`, `research/crawl/pages/*`,
`research/crawl/api/*`) against Brains Cad Brain. We match **functionality**, not wording, branding
or catalogue data.

Status key: **Match** — equivalent exists · **Partial** — exists with a narrower scope ·
**Missing** — not built · **Out of scope** — needs an external service, a paid add-on (AI),
multi-tenant auth, or is the vendor's own marketing/billing.

Items marked ★ were added or completed in the fidelity pass (see "Closed in this pass" at the end).

## Summary

| Area | Match | Partial | Missing | Out of scope |
|---|---:|---:|---:|---:|
| Navigation & dashboard | 9 | 1 | 0 | 4 |
| Leads | 5 | 0 | 0 | 0 |
| Estimates (list, create, header, details) | 26 | 2 | 1 | 3 |
| Costings | 25 | 2 | 1 | 2 |
| Plans & takeoffs | 13 | 1 | 1 | 1 |
| Quote options & client acceptance | 22 | 1 | 0 | 0 |
| Clients | 17 | 0 | 0 | 2 |
| Contacts (suppliers & trades) | 12 | 3 | 0 | 2 |
| Catalogues | 12 | 2 | 1 | 2 |
| Settings / advanced setup | 22 | 2 | 0 | 5 |
| Integrations | 0 | 1 | 0 | 8 |
| **Total (211 rows)** | **163** | **15** | **4** | **29** |

Jobs, schedule, invoices, selections and orders were not visible on the captured (Foundation)
plan; they are covered by our Jobs & money modules (see `docs/SPEC.md`) and not scored here.

## Navigation & dashboard

| Reference feature / field | Ours (route / field) | Status | Note |
|---|---|---|---|
| Top-level nav: Dashboard, Leads, Estimates, more (Jobs, Schedule, Catalogues, Clients, Contacts, Material orders, Reminders) | Sidebar `src/app/(app)/layout.tsx` | Match | Material orders → `/orders` |
| Quick-start guide with steps, hideable | `/dashboard` "Getting started" + `/settings/display` | Match | |
| "Show dashboard quick start" profile setting | `businessSettings.showDashboardQuickStart` | Match | |
| Estimate summary: create new, view status, recent & updated estimates with client, status, total | `/dashboard` recent estimates + "Estimates by status" | Match | |
| "Show estimate summary" setting | `businessSettings.showDashboardEstimateSummary` | Match | |
| Insight: win rate after 3 estimates accepted/rejected | `/dashboard` KPI `kpi-winrate` (`metrics.ts`) | Match | |
| Insight: average win value | ★ `estimateKpis().averageWinValue`, shown in the win-rate tile | Match | Unlocks with the win rate |
| Reminders | `/reminders` + dashboard panel | Match | |
| Recent activity / notifications count | Dashboard activity feed | Partial | No unread-message counter |
| Mobile "quick dashboard" (recent estimates, Create) | Responsive `/dashboard` | Match | |
| Trial banner, plan picker, subscription page | — | Out of scope | Vendor billing |
| Training / booking promo, community, partners, watch & learn | — | Out of scope | Vendor marketing |
| Preview features / labs (AI estimator) | — | Out of scope | AI |
| Onboarding questionnaire | Quick-start checklist | Out of scope | Single-tenant app, no sign-up flow |

## Leads

| Reference feature / field | Ours | Status | Note |
|---|---|---|---|
| Leads list with filter + search | `/leads` (stage chips, search, list/board) | Match | Ours adds a kanban board |
| Create new lead | `/leads/new` | Match | |
| Link estimate to a lead ("Link to a lead") | Estimate details → Lead select (`estimates.leadId`) | Match | |
| Lead shown in estimate header ("Lead: Unassigned") | Details tab lead link | Match | |
| Lead → estimate conversion, won/lost | `/leads/[id]` convert + won/lost reason; lead stage follows estimate status | Match | |

## Estimates — list, create, header, details

| Reference feature / field | Ours | Status | Note |
|---|---|---|---|
| List columns: Ref #, Description, Type, Status, Client, Date, Quote total | `/estimates` Number, Name, Building type, Status, Client, Date, Quote total | Match | |
| Filter by status, search | Status chips + search | Match | |
| Sample estimates badged | `isSample` badge | Match | |
| Manage templates | `/estimates/templates` | Match | |
| Create blank estimate | `/estimates/new` → Blank | Match | |
| Use default template (configurable) | ★ Templates → "Make default"; `/estimates/new` preselects it (`businessSettings.defaultTemplateId`) | Match | `?template=blank` still starts blank |
| Start from a template | `/estimates/new?template=` | Match | Our templates are the user's own; no vendor template library |
| Built-in starter template library (12) | — | Missing | Would need original content; not copied |
| AI estimate generator | — | Out of scope | AI |
| Import estimate from Excel | — | Partial | Catalogue CSV import exists; no estimate import |
| Header: name, status (changeable), ref no, quote total | `src/app/(app)/estimates/[id]/layout.tsx` + status select | Match | |
| Header: Create job | "Create job" / "View job" | Match | |
| Header: Email | ★ "Email" → composer (to, subject, message with total, valid-until, online quote link) → `mailto:`; "Mark as sent" | Match | No email service; opens the user's mail app |
| Header: Prepare quote | "Prepare quote" | Match | |
| Header: AI assistant | — | Out of scope | AI |
| Tabs: Details, Plans & Takeoffs, Costings, Specifications | Same tabs + Quote | Match | |
| Estimate-level "Schedule" tab | `/estimates/[id]/schedule` (`estimate_tasks`) | Match | Tasks, start date, duration, assignee, dependencies, Gantt; generate from costing categories; "Set start date" shifts all; optional schedule summary on the quote; copied into the job schedule on job creation (ids/links remapped, offset to the job start) |
| Reference number | `estimates.number` | Match | |
| Name / description | `estimates.name` | Match | |
| Created date | `datePrepared` | Match | |
| Building type | `buildingType` (lookup) | Match | |
| Default markup redistribution for PC/PS (None / Across estimate / Within category) | `pcpsRedistribution` | Match | |
| Tax profile (customise per estimate) | `taxRateId` per estimate + ★ tax profile name/code | Match | |
| Client: name, address, city/town, state, postcode, email, source | `client*` snapshot fields + picker | Match | |
| Client mobile / phone with country code | ★ `PhoneField` with dialling-code picker | Match | Home-country numbers stored as typed |
| Work location: address, city, state, postcode | `site*` fields (+ "same as client") | Match | |
| Work location map image | — | Out of scope | Needs a maps API |
| Documents: upload/drop, folders | `DocumentsPanel` with folder lookup | Match | |
| Estimate versioning (capture, restore) | `VersionsPanel` / `estimate_versions` | Match | |
| Notes | `NotesPanel` | Match | |
| Digital signatures (accepted quotes) | `/q/[token]` typed signature, `acceptanceSignatureName` | Match | |
| Rounding of quote total | `rounding` none/$1/$10/$100/$1000 | Match | |
| Duplicate, archive, save as template | Header overflow menu | Match | |

## Costings

| Reference feature / field | Ours | Status | Note |
|---|---|---|---|
| Tree: category → item → sub-item, numbered 5.2.6 | `estimate_items` + `calc.ts` numbering | Match | |
| Description, units (qty), UOM, unit cost, total | Grid columns | Match | |
| Quantity formula (`[M1]`, `[W10]`, spacing maths) | `quantityExpr` + `expr.ts` | Match | 3 dp quantities |
| Measurement link (ID_PlanMeasurement) | `measurementId` + "link to costing" | Match | |
| Item markup %, markup total, total inc markup | `markupPercent` + calc | Match | |
| Taxable flag, tax, total inc tax | `taxable` + calc | Match | |
| Default tax per cost type for new items | ★ `taxRates.defaultCostTypes`; new rows / catalogue / takeoff items take `taxable` from it; changing cost type follows the default unless overridden | Match | |
| Cost item types Material, Labour, MatLab, Equipment, Subcontractor | Material, Labour, ★ MatLab ("Mat + Lab"), Equipment, Subcontractor, Other | Match | |
| PC / PS toggle | `allowanceType` | Match | |
| PC/PS markup redistribution (display) | `calc.ts` | Match | |
| Status Incomplete / Complete | `status` | Match | |
| Notes | `notes` | Match | |
| Show in schedule | — | Missing | Estimate schedule exists (see above) but tasks are per category / manual, not flagged per costing item |
| Show in specifications | `showInSpecification` (row menu in Costings, or include/remove on the Specifications tab) | Match | |
| Show in schedule | — | Missing | No estimate schedule (see above) |
| Item specifications text | ★ `spec_item_details` (detail text + image per item), shown under the item's costing-category section | Match | Internal costing notes are never printed |
| Specifications tab by costing category | ★ Sections linked via `specifications.categoryItemId`; Sync with costings, Match costings order, drag/collapse, search, Presets (spec library), Export (print `/specifications/print` + Markdown) | Match | Custom sections keep their position |
| Supplier (contact) | `supplierId` | Match | |
| Item code | `itemCode` | Match | |
| Catalogue link (ID_CostItem) | `catalogueItemId` | Match | |
| Recipes (parent qty × child per-unit qty) | Sub-items + `catalogueToRows` | Match | Matches $4,209.30 reference |
| Named markup lines (Markup 18; Contingency 2) | `markupLines` editor | Match | Totals match reference to the cent |
| Rounding / rounding adjustment | `rounding` | Match | |
| Summary by cost type | `SummaryPanel` | Match | |
| Add from catalogue (search, recipes expand) | `CatalogueModal` (multi-select) | Match | |
| Docked Catalogues / Recipes side panel: search, catalogue → category drill-down, "+" add, drag onto a category/row | `CataloguePanel` (drawer on narrow screens; open state remembered) | Match | Shares `addCatalogueItems` with the dialog |
| Totals bar: Sub total (ex), Markup, Total ex GST, GST, Quote total | Sticky totals bar in `CostingsGrid` (live `calculate` result) | Match | |
| Inline edit, reorder, indent/outdent, duplicate, delete, collapse, bulk edit | `CostingsGrid` (+ drag-and-drop row reorder, `src/lib/costings-dnd.ts`) | Match | Move up/down stays as the keyboard alternative |
| Hidden on quote | `hiddenOnQuote` | Match | |
| Alternative UOM / order increments / min order qty on items | — | Partial | Not on items or catalogue (see Catalogues) |
| Franchise fee, calculation method | — | Out of scope | Franchise-only / internal |
| Live supplier pricing, supplier quote requests | — | Out of scope | Supplier integrations |

## Plans & takeoffs

| Reference feature / field | Ours | Status | Note |
|---|---|---|---|
| Plan label, description, image, order | `plans` | Match | |
| Horizontal and vertical scale | Scale by known-length line | Partial | One uniform scale per plan |
| PDF plan pages | pdf.js render to image | Match | |
| Measurement description, value, colour, unit (m, m2, m3, ea) | `measurements` | Match | |
| Shapes: polygon, line, point, rectangle, ellipse, polyline | `geometry.ts` SHAPES | Match | |
| Pitch (and pitch ratio) | `pitchDegrees` | Match | Degrees only, no ratio entry |
| Depth (→ volume) | `depthMm` | Match | |
| Height (length → wall area) | `heightMm` | Match | |
| Negative (deduction) | `isNegative` | Match | |
| Codes M1..Mn feed formulas | `nextMeasurementCode` | Match | |
| Rename, delete, colour | Measurement panel | Match | |
| Zoom / pan | `PlanViewer` | Match | |
| Link measurement to new costing item | `linkMeasurementToItem` | Match | |
| Line thickness | — | Missing | Cosmetic |
| Angle / pitch helper tool | Pitch field on each measurement | Match | Pitch input covers roof angles |
| AI takeoff assistant | — | Out of scope | AI |

## Quote options & client acceptance

| Reference option | Ours (`quote_options`) | Status | Note |
|---|---|---|---|
| Print business info | `printBusinessInfo` | Match | |
| Print logo | `printLogo` | Match | |
| Use existing letterhead | Turn off business info + logo | Partial | No dedicated top-margin option |
| Valid days (30) | `validDays` (+ default in settings) | Match | |
| Body letter with merge field | `coverLetter` + `[ClientName]` etc. | Match | |
| Terms & conditions | `termsAndConditions` | Match | |
| Print categories and items | `printCategories` | Match | |
| Print category totals | `printCategoryTotals` | Match | |
| Category totals include tax | `categoryTotalsIncludeTax` | Match | |
| Print items | `printItems` | Match | |
| Print quantities | `printQuantities` | Match | |
| Print unit measures | `printUnitMeasures` | Match | |
| Print item totals | `printItemTotals` | Match | |
| Print zero-dollar items | `printZeroDollarItems` | Match | |
| Print specifications | `printSpecifications` | Match | |
| Print specification numbers | `printSpecificationNumbers` | Match | |
| Print initials area | `printInitialsArea` | Match | |
| Show markup | `showMarkup` | Match | |
| PC print option / PS print option | `pcPrintOption` / `psPrintOption` | Match | |
| Preview and print quote | `/estimates/[id]/quote` + `/quote/print` | Match | |
| Share online with client (IsSharedWithClient) | Share token, `/q/[token]` | Match | |
| Digital signature acceptance → accepted status | `/q/[token]` accept | Match | |
| Email the quote | ★ Header "Email" (mailto with link) | Match | |

## Clients

| Reference feature / field | Ours (`clients`) | Status | Note |
|---|---|---|---|
| List columns: Name, Type, Created, Email, Phone, Mobile | `/clients` Name, Type, Email, Mobile, City, Source, Estimates, Jobs | Match | Sortable; phone shown on detail |
| Filter + search | Search, type/source filters, archived toggle | Match | |
| Name, business name | `name`, `businessName` | Match | |
| Address, city/town, state, postcode | yes | Match | |
| Phone, mobile with country code | ★ `PhoneField` | Match | |
| Email | `email` | Match | |
| ABN (business number) | `businessNumber` | Match | |
| Client type Person / Business | `clientType` | Match | |
| Client category list (Archived, Business, Lead, Person) | `category` (lookup `client_type`) + `archived` flag | Match | ★ added "Lead" etc. to defaults |
| Source | `source` lookup | Match | |
| Default invoice days | `defaultInvoiceDays` | Match | |
| Contact people under a client | `client_contacts` | Match | |
| Tabs: details, leads, estimates, communications | Details, ★ Leads, Estimates, Jobs, Notes & files | Match | Communications = notes |
| Documents | `DocumentsPanel` | Match | |
| Notes | `NotesPanel` | Match | |
| Archive / delete with guard | Archive + guarded delete | Match | |
| CSV import / export | `/clients/import`, `/api/export/clients` | Match | |
| Accounting sync IDs | — | Out of scope | Accounting integrations |
| Client portal (Pro) | Online quote page only | Out of scope | Multi-tenant auth |

## Contacts (suppliers & trades)

| Reference feature / field | Ours (`contacts`) | Status | Note |
|---|---|---|---|
| List columns: Contact name, Business name, Type, Card status, Work phone, Mobile, Email | `/contacts` Name (+ business), Type, Trade, Email, Mobile, Insurance, Rating, Orders | Partial | "Card status" (accounting card) → Active/Archived badge |
| Search + filter | Search, type, group, trade, insurance filters | Match | |
| Contact group | `groups` (multi) | Match | |
| Contact type | `contactType` lookup | Match | |
| Contact name, business name | yes | Match | |
| Business number (ABN) | `businessNumber` | Match | |
| Registered for GST | ★ `gstRegistered` checkbox (+ CSV column) | Match | |
| Address | yes | Match | |
| Home phone / work phone / mobile | `phone`, `mobile` with ★ country code | Partial | One landline field, not two |
| Email | `email` | Match | |
| Contact person under a contact | — | Partial | Single contact person per record (name + business) |
| Documents, notes | Notes & files tab | Match | |
| Catalogues tab (supplier price lists) | Catalogues have `supplierId` | Match | Shown on catalogue, not contact |
| Purchase orders for the supplier | Orders tab | Match | |
| Contact linked to internal user | — | Match | Users are separate (`/settings/users`) |
| Accounting "cards" | — | Out of scope | Accounting integrations |
| Communications log (email) | — | Out of scope | Needs email service |

## Catalogues

| Reference feature / field | Ours | Status | Note |
|---|---|---|---|
| Price list name, short code, colour | `catalogues.name/shortCode/colour` | Match | |
| Supplier link | `supplierId` | Match | |
| Status Draft / Published / Expired / Archived | `status` | Match | |
| Effective and expiry dates | `effectiveDate`, `expiryDate` | Match | |
| Scope (public/managed/hidden) | — | Out of scope | Multi-tenant sharing |
| Supplier feed sync settings | — | Out of scope | Supplier integrations |
| Cost item: type, description, UOM, cost | `catalogue_items` | Match | ★ MatLab type |
| Category and sub-category | `catalogue_categories` (parentId) | Match | |
| Item code | `itemCode` | Match | |
| Details | `details` | Match | |
| Image URL | `imageUrl` | Match | |
| Datasheet / instructions / details URLs | — | Partial | Image only |
| Manufacturer code, description, range, RRP | — | Missing | |
| Recipe flag + components | `isRecipe` + `catalogue_recipe_lines` | Match | |
| Alternative UOMs with conversions, min order qty, order increments | — | Partial | Not modelled |
| CSV import (column mapping) / export, bulk % update | `/catalogues/[id]/import`, export, bulk update | Match | |
| Search, inline edit | `ItemGrid` | Match | Plus mapping of "Mat + Lab"/"supply & install" on import |

## Settings / advanced setup

| Reference feature / field | Ours | Status | Note |
|---|---|---|---|
| Business details | `/settings/business` | Match | |
| Users: username, communications email, name, role | `/settings/users` (name, email, mobile, role, active) | Match | |
| Business structure (multi-entity) | — | Out of scope | Multi-tenant |
| Subscriptions | — | Out of scope | Vendor billing |
| My profile: name, mobile, role | Users page | Match | Single-tenant, no login |
| 2-step verification, social login | — | Out of scope | No auth in v1 |
| Show help icon | — | Out of scope | No vendor chat widget |
| Business documents (uploads) | ★ `/settings/documents` | Match | |
| Building types (21 defaults) | `/settings/lists/building_type` | Match | ★ defaults extended to cover the reference set (granny flat, shed, joinery, insurance, office fitout, fitout, duplex, design, apartment, repairs & maintenance, commercial, shop, kitchen/bathroom renovation) |
| Contact groups (Contractors, Employee, Suppliers) | `contact_group` | Match | ★ added Contractors, Employees, Suppliers |
| Contact types (builder, plumber, supplier, tiler) | `contact_type` | Match | ★ added Builder, Plumber, Tiler and other trades |
| Client sources (Google, Referral, Repeat, Signage, Word of mouth) | `client_source` | Match | ★ added Word of mouth |
| Client types | `client_type` | Match | ★ added Lead |
| Units of measurement (24) | `unit_measure` | Match | ★ added $, allowance, bag, roll, pair, length, per 100, per 1000, per job, hour, week, month, each, lot, pt |
| Estimate statuses incl. one "accepted" status | `estimate_status` + accepted flag | Match | ★ added Not sent, Final, Awaiting approval |
| Tax profile name + short code | ★ `/settings/tax-rates` "Tax profile" | Match | |
| Tax rates: code, description, rate, income/expense | `/settings/tax-rates` | Match | |
| Exempt flag | 0% rate | Match | |
| Default rate per cost type (Material, Labour, MatLab, Equipment, Subcontractor) | ★ "Default tax by cost type" (income + expense) | Match | Income side drives new costing items |
| Expense default per cost type used on orders | Stored per rate | Partial | Orders still use the default expense rate |
| Numbering prefixes | `/settings/numbering` | Match | |
| Quote defaults (validity, T&Cs, cover letter) | `/settings/quote-defaults` | Match | |
| Default purchase-order terms (contractor) | — | Partial | PO notes only |
| Document folders | `document_folder` | Match | |
| Dashboard display toggles | `/settings/display` | Match | |
| Specification library | `/settings/spec-library` (called "Presets" on the estimate Specifications tab) | Match | |
| Default template for new estimates | ★ Templates "Make default" | Match | |
| API webhooks, event log, API keys | — | Out of scope | Public API not in v1 |
| Timesheets settings (own timesheets) | Job timesheets | Match | |

## Integrations

| Reference integration | Ours | Status | Note |
|---|---|---|---|
| Xero / MYOB / QuickBooks accounting | — | Out of scope | External services |
| Deputy, QuickBooks Time timesheets | Own timesheets | Out of scope | External services |
| Rendr floor-plan capture | — | Out of scope | External service |
| Supplier integrations (8 AU suppliers), live pricing | — | Out of scope | External services |
| Material orders via trade account ID | Purchase orders (`/orders`) | Partial | Our own POs, no supplier submission |
| Add-ons marketplace (AI estimate generator / reviewer / takeoff assistant) | — | Out of scope | AI |
| Apps with access to your data (OAuth) | — | Out of scope | |
| Supplier invitation | — | Out of scope | |
| Plan limits per feature | — | Out of scope | Single-tenant |

## Closed in this pass

- **Tax profile + default tax per cost type** — `businessSettings.taxProfileName/taxProfileCode`,
  `taxRates.defaultCostTypes`; pure logic in `src/lib/tax-defaults.ts` (tested). New costing items
  (grid, catalogue, takeoff link) get `taxable` from the income rate set for their cost type;
  switching cost type follows the new default unless the user overrode the box. Calc maths untouched.
- **Mat + Lab cost type** (`MatLab`) across costings, catalogues, CSV import, variations, job costs.
- **Email quote** — header "Email" opens a composer (`src/lib/quote-email.ts`, tested) and a
  `mailto:` link carrying the summary and online-acceptance link; creates the share link if needed;
  optional "Mark as sent".
- **Phone numbers with country code** — `PhoneField` (`src/lib/phone.ts`, tested) on client,
  contact and estimate client details; home country from business country.
- **Registered for GST** on suppliers/trades (form + CSV import/export).
- **Client Leads tab**, **default estimate template**, **business documents**,
  **average win value** insight, and reference-equivalent defaults for unit measures, building
  types, contact types/groups, client sources/types and estimate statuses (seed values only added).

## Worth doing next

1. Use the per-cost-type **expense** defaults and the supplier's GST registration when raising
   purchase orders and recording bills (data is now in place).
2. "Show in schedule" flag on costing items (the estimate schedule tab itself now exists).
3. Catalogue item **alternative UOMs / order increments / min order qty** and manufacturer fields.
4. Separate **home / work phone** and multiple contact people for suppliers.
5. "Use existing letterhead" print option (blank top margin) and default **PO terms** in settings.
6. Estimate import from spreadsheet (reuse the catalogue CSV mapper).
