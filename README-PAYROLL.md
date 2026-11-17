# EasyTime business payroll

The Site root opens `/easytime/payroll.html`. The original personal calculator remains at `/easytime/index.html`; existing personal records are retained separately.

Business records persist in D1 through `/api/easytime/payroll`. Every request requires authenticated identity. Writes require same-origin JSON, optimistic revisions and a validated command. All calculations and state transitions run on the server; activity records capture the authenticated reviewer, original and updated values, reason and timestamp. No client-provided audit actor is trusted.

The owner operates time entry and manager review within this owner-private Site. Employee directory records are not separate employee or manager accounts. Sample workspace actions run in tab memory and cannot modify the saved workspace.

Features: stores, employees and captured pay rates; current punches and manual entries; explicit unpaid breaks; overnight shifts; shift scheduling and saved schedule baselines; early/late timing; daily, weekly, biweekly and custom summaries; submit, approve, return, reopen and correction flows; Excel and PDF exports; activity history.

Payroll uses actual elapsed time, including daylight-saving changes. Each employee's overtime is determined across all stores using the configured workweek. Store and date filters are applied after workweek overtime allocation. Reports retain historical entry rates. Break minutes are allocated at shift end when splitting days; the product does not capture the precise break interval. Changing rules is blocked while approved entries exist. Gross payroll preparation excludes tax calculations, withholding, direct deposit and filing. Multiple-rate statutory regular-rate calculations, daily overtime and jurisdiction-specific pay rules are not implemented; configurable weekly threshold/multiplier applies to each entry's captured rate.

Validation:

- `node --test tests/payroll-business.test.mjs`: independent pay examples, cross-store context, workweek/date boundaries, daylight-saving time, schedule baselines, approval locks, audit history, rate changes and clock punches.
- `node tests/payroll-worker.test.mjs` after build: actual isolated Worker and D1 save/read, stale revision rejection, identity isolation, anonymous denial, CSRF origin check and invalid-pay-rate rejection. No hosted user records are touched.
- Browser QA: sample approvals, employee creation, manual entry, blank breaks, corrections, schedule linking, exact arrival/departure differences, clock in/out, location filters and report actions.
- Export QA: generated XLSX reopened with openpyxl; PDF reopened, reconciled and rasterized for visual inspection.

Database migrations are append-only. Local preview and hosted records are separate.

## Workforce expansion (October 25, 2026)

The same D1 workspace now also saves:

- Employee job roles, multiple store assignments, email/WhatsApp/phone contacts, notification permission and manually allocated PTO.
- Dated staffing requirements, overnight templates, template application, and automatic assignment based on store assignments, availability, approved leave, overlap checks, job roles and the configured planned-hours threshold. Unfilled staffing requirements remain visible; generation does not promise an optimal schedule.
- Weekly availability, leave requests, manager decisions, cancellation and PTO reservations. PTO is separate from worked-time gross pay; automatic accrual and statutory leave-pay calculation are not implemented.
- Open shifts, cover and swap requests, employee acceptance and manager approval. Attendance-linked shifts cannot be reassigned; modified shifts require a new request. Schedule baselines remain preserved.
- Store labor budgets, entered sales estimates, base scheduled cost, actual gross cost, labor/sales ratios and staffing-hour estimates. Scheduled cost excludes overtime premiums, employer taxes and benefits; actual gross includes provisional completed attendance unless approved-only is selected in Reports.
- Versioned schedule publication, individual private previews, email/WhatsApp/SMS composer links and sharing-opened history. Messages are not marked sent or delivered. Store/team messages remain in the app. Background push alerts and automatic email/SMS/WhatsApp delivery are not configured.
- In-app attendance, missing-punch, review, overtime and approved-leave conflict alerts.
- Candidate pipeline and employee onboarding checklists. No public recruiting publication, legal forms or applicant messaging.
- Owner-managed business memberships matched to the authenticated account email. Managers are limited to assigned stores; employees receive their own time/leave/task data and can submit their own hours. Employee access includes a minimal shift-swap directory for their allowed stores. Every saved command is authorized on the server; scoped payroll preserves overtime allocation from all-store context without exposing other-store attendance.
- Server-checked GPS clock-in geofences, fresh/accurate position validation and evidence on the event. GPS can be spoofed and is not proof of attendance. Clock-out is not geofenced. PIN/photo kiosks and dedicated clock hardware are not supported.
- Provider-neutral approved payroll CSV, plus the existing Excel/PDF reports. Live POS, payroll and HR integrations require specific provider APIs, credentials and separately verified mappings; the Connections page does not claim they are connected.

The current Site audience is preserved. Business membership does not grant Site-level access: the owner must explicitly grant that separately in Site sharing settings. No invitation email is sent. The business dropdown lists owned and invited business workspaces. Existing personal records remain separate. Workforce collections are added lazily when loading existing JSON workspaces; no database deletion or migration is needed.

New tests: `tests/workforce.test.mjs` covers scheduling, templates, consent, PTO, location validation, coverage approvals, role restrictions and scoped overtime. `tests/payroll-worker.test.mjs` now also covers real Worker/D1 shared access, self-service requests, outsider rejection and denied self-approval. Browser QA used sample data only and exercised every new page, contact saving, schedule generation, PTO review, open-shift approval, budget entry, private message previews, onboarding, memberships, CSV downloads and mobile layout. No external messages were sent by QA.

## Assigned stock-order reminders
Ordering now supports owner/manager assignment to an active employee at a store, an order title, supplier, instructions, a due date/time and 0–168 hours' lead time. Repeats can be one-time, daily or weekly. Employees can see and complete their own assigned reminders; managers remain scoped to their stores. Edits and pause/resume/reopen actions require reasons. Due reminders appear in Ordering, Alerts, a navigation count and an attention banner.

Completion requires a note/reference and stores the authenticated actor and timestamp. One-time reminders finish; repeats move to the next future due date in the saved store timezone. Missed repeat dates are counted separately, never represented as completed orders. UTC offset changes retain the local due time. A spring-forward gap moves that occurrence to its next valid local minute and is identified on the reminder. Pausing stops alerts; resuming retains the original due date. The saved-revision check and expected due occurrence reject stale or duplicate completion.

Visible workspaces refresh shared records approximately every minute and on window focus when no editor is open. Alerts are in-app only: no background delivery, push notifications, email/WhatsApp/SMS transmission, supplier ordering or inventory-level tracking is performed. The completion action records a user's confirmation; it does not validate a supplier transaction.

BDD v1.5 is included under public/downloads in Markdown, Word and PDF formats. Tests/order-reminders.test.mjs covers recurrence/DST, lead-time boundaries, duplicate protection, paused/completed states and role/store restrictions. Worker tests cover persistence and authenticated employee completion.

## Modular business feature plans
Owners can now open Features & billing and save a selection of business modules. The required Business workspace covers employee/store setup, saved records and access controls. Optional modules cover time/payroll, scheduling, coverage, leave, labor, communication, hiring, ordering, GPS and report exports. Coverage/communication include scheduling; report exports include time/payroll. Disabling a dependency in the selector also clears its dependents. Existing data and current access are preserved: a saved selection is not a paid subscription or an entitlement change.

Module prices are controlled by the service operator in server-only EASYTIME_BUSINESS_PRICING, never by the purchasing business owner or client input. JSON fields are `version`, lowercase ISO `currency`, and `features` keyed by canonical feature ID; each configured feature has nonnegative integer `monthlyCents`. An optional provider price identifier is not returned to the browser. Every selected dependency needs an explicit price; missing prices produce a null total and Pricing pending, never an assumed zero/free quote. No production rates were chosen for this update. Pricing is per business per month for selected modules, not metered usage or per-employee billing.

The separate /api/easytime/business-billing surface authenticates the owner, enforces origin on writes, and calculates quotes on the server. The existing optimistic-revision payroll command saves selections and authenticated audit history. Managers/employees cannot save a plan; their projections omit private selections/billing metadata. Existing personal billing endpoints remain retired.

Payment processing is NOT implemented in this release. Checkout intentionally remains disabled and the server returns 503 without any provider request, even when price configuration is present. Activating paid plans requires approved vendor prices, a chosen and connected merchant/provider, reachable signed webhook processing, cancellation/renewal handling and verified paid entitlements. No invoices, subscriptions, charges or usage meters are created by the new selection page. BDD v1.6 documents the implemented selector and remaining billing requirements.

Validation: tests/business-features.test.mjs exercises dependency normalization, prices in exact cents, missing/invalid prices, persistence, tampering, role restrictions and redaction. tests/business-billing-worker.test.mjs verifies real Worker/D1 owner access, saved selections, stale revisions, exact configured test quotes and blocked checkout. Local browser checks cover selection, dependencies, save/navigation persistence, pending prices, stale quote safeguards and mobile layout.

## Business name and type
Owners can now select their business name and primary type during setup, on the Business profile page, or in Settings. Types: gas station, convenience store, combined gas/convenience, grocery/supermarket, liquor store, cafe/restaurant, retail, salon/service or Other. Other requires a custom description. This is a business-wide profile; individual store records remain separate. The selected name/type appears in the workspace header and saved business names appear in the authorized business switcher.

The server validates names/types, records authenticated audit history and rejects manager/employee edits. Nonowners can see the business identity without private update metadata. Existing workspaces remain unset until their owner chooses a type; no classification is inferred from store names or user identity. Selecting a type does not alter modules, prices, pay rules or saved records and does not add industry-specific integrations.

BDD v1.7 and the latest source ZIP include this feature. Tests/business-profile.test.mjs and Worker/browser checks cover setup, all supported types, Other validation, edits, data preservation, role restrictions, persistence and the named business switcher.

## Business expense budgets and reporting
The Budgets & reporting page adds store/category/optional-employee expense budgets with exact integer-cent limits, date periods and near-limit thresholds. Overlapping scopes are rejected, including paused allocations. Edits and pause/resume actions require reasons. Employees see only explicitly assigned budgets; owners/managers see authorized stores.

Manual expenses move from Draft to Submitted and then Approved or Returned. Reopening is required before editing an approved expense; voiding retains history and excludes costs. Actual spending includes Approved records; pending commitments include Submitted records. Draft/Returned/Voided records contribute neither. Employees submit only their own expenses and cannot approve records or edit budgets. Server-origin, identity, role/store scope, validation and optimistic-revision checks apply to all saved commands. Activity captures the authenticated reviewer and before/after values.

Budget commitment utilization and alerts use complete-period approved plus submitted amounts. Remaining is the full budget limit minus complete-period approved amounts; remaining after pending subtracts submitted amounts too. Date/employee/status view filters affect selected report expense amounts but never erase authorized complete-period costs from remaining/utilization. Full limits are not prorated for partial views. Current active budgets generate near/over warnings in the page, Team alerts and the workspace banner; paused allocations remain in reports without warnings. These are soft planning alerts, not payment/card controls.

Reports include exact selected-date actual/pending totals, unbudgeted approved spending, category bars, store summaries, monthly trends and expense details. CSV, Excel and paginated PDF share the same calculations and scope. CSV neutralizes formula-like strings; Excel writes text as text. The workbook helper accepts an optional sheet name while payroll exports keep the existing Payroll sheet by default.

This is manual expense reporting. It does not import bank/card transactions, process supplier payments or reimbursements, extract receipts, reconcile a bank account or automatically include payroll costs. Existing Labor planning and payroll reports remain separate. The optional budgets module is in the owner feature selector, with no price or paid activation assigned. BDD v1.8 explains the behavior and limitations.

Validation: tests/spend-domain.test.mjs covers cent precision, overlaps, expense transitions, actual/pending totals, partial filters, zero limits, warnings and role/data scope. tests/spend-reports.test.mjs independently checks shared totals, metadata, CSV formula safety and long-report pagination. Worker/D1 tests verify employee submissions, denied budget edits/self-approval and authorized approval. Browser checks exercise budget setup, approvals, over-budget warnings, filters, pause behavior, exports, employee scope and mobile layout. Exported Excel/PDF artifacts were reopened independently to reconcile totals and inspect layout.
