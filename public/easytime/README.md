# EasyTime

Open the private website: https://easytime-15-day.allup-pegasian.chatgpt.site

## Included

- Private cloud accounts using secure ChatGPT sign-in.
- Autosaved timesheets, cross-device sync, save-conflict detection, and the ten most recent account backups.
- 7-day, 14-day, 15-day, twice-monthly (1–15 and 16–month end), calendar-month, and custom date-range cycles. Choose start and end dates with calendars under Paycheck checks → Choose dates on calendar → Custom period → Use this period. Custom ranges include both dates, support 1–366 days, and keep separate records when the same start date has different end dates. The linked timesheet, CSV, balance and spending chart use the selected range. Next period keeps the same length. Existing 30-day records remain importable.
- Normal Mode and Overtime Mode, a fixed workweek, configurable overtime threshold and multiplier, manual overtime, effective-date rate history, and optional paid/unpaid breaks.
- Expected gross pay versus paycheck gross, deductions, and actual take-home pay. The current period is selectable before any timesheet is saved. Choose dates on calendar directly on Paycheck checks using its start date, end date and cycle; paycheck amounts and deductions stay in place. Saving the paycheck also saves its linked period. Add shifts later with Edit timesheet; expected pay comparison stays unavailable until valid hours are entered.
- Budget buttons on Timesheet, Overview, Paycheck checks, and Expenses & bills. Create custom categories, allocate optional category limits, and save separate budgets for each selected pay cycle. Custom categories also appear in expense entry, CSV exports and spending pie charts. Track allocated amounts, spending, remaining limits and over-budget amounts. Blank or zero means no limit. Drag a category grip to reorder the list; order saves automatically across cycles and devices. Up/Down buttons and Arrow keys, Home and End on a grip also move categories. Reordering keeps limits, spending and pending limit edits attached to each category. Categories are shared across cycles; limits are specific to the selected period. Earlier category limits are retained as starting values until a cycle is saved.
- Expense categories, recurring bills, and money remaining based on actual take-home.
- Spending pie charts for every recorded paycheck: select a paycheck or use View spending beside it. Category amounts and percentages use expense dates within its linked timesheet pay cycle. Several paychecks sharing one cycle display that shared cycle’s spending and combined take-home pay; individual expenses are not allocated to separate checks. Removed timesheets and empty spending have clear messages.
- Available Balance buttons on Timesheet, Overview, Paycheck checks, and Expenses & bills. The breakdown uses actual paycheck take-home received during the selected cycle minus expenses dated within that cycle. Negative balances are shown clearly.
- Pay history with an in-app Delete confirmation: choose Delete beside a period, then Delete record. The record and its cycle budget are removed only after the cloud save succeeds; failed saves keep the record and offer Retry delete. Paychecks and expenses are kept. Cancel or click outside to leave the record in place. Recent cloud backups allow recovery.
- Click outside a Budget, balance, spending, reminder or record-confirmation window to close it. Clicks inside keep it open; Budget dragging and saves in progress are protected.
- Pay history, searchable records, in-app reminders, browser notifications while the website is open, and downloadable calendar reminders.
- All workspace features are included without a subscription. Saving records, editing budgets and tracking finances have no paid-plan or trial-expiry restrictions.
- Timesheet and expense CSV downloads, print/save PDF, readable HTML account backup and restore (with earlier JSON backups supported), legacy-record import, backup restoration, data deletion, and private support requests.

Employee ID and profile hourly rate are optional. Break fields start blank. Normal Mode pays every worked hour at the regular rate; Overtime Mode applies the selected weekly rules and manual overtime.

## Open the downloaded folder

`index.html`, `login.html`, and `profile.html` are the updated cloud-workspace pages. Their cloud features require the hosted EasyTime API and database; opening the files alone does not create a cloud service. Open `index.html` for a link to the private website, or open `calculator.html` for the preserved standalone calculator and browser-local records. Keep the HTML, CSS, and JavaScript files together.

The hosted application also contains its server routes, database schema, migrations, provider adapters, and automated tests in the EasyTime Site project. The ZIP contains the user-facing pages and assets, not provider secrets or a second copy of the hosted source repository.

## Optional sign-in setup

Email/Google sign-in and password recovery need an owner-configured Firebase project. Enable email/password and Google providers, configure authorized domains and verification/recovery email templates, and set `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, and (for Google) `GOOGLE_CLIENT_ID` in the hosted environment. Email login requires a verified email address. Passwords are sent to Firebase and are never saved in EasyTime or localStorage.

Email/Google provider credentials are not configured in this version. Secure ChatGPT sign-in and cloud features use the existing private Site access.

## Operational details

- Gross pay is an estimate using recorded shifts and selected rules. Taxes are entered as paycheck deductions; the app does not calculate jurisdiction-specific payroll taxes.
- Overnight shifts split at midnight. Unpaid break minutes are deducted from the shift end because the form does not collect the break's exact clock time.
- Adjacent saved pay periods contribute to the fixed weekly overtime calculation. Add all relevant shifts for a complete weekly total.
- Autosave failures leave the current changes in memory while the page remains open. Download an unsaved backup before reloading if a save conflict occurs.
- Browser notifications run while the app is open. Calendar reminders can run through the user's calendar; there is no background email/SMS reminder service in this version.
- Support requests are stored privately for operator review. No automatic email notification is sent to support.
- Data deletion removes EasyTime cloud data. It does not delete the user's ChatGPT or Firebase identity.

## Verification

46 automated calculation, private API, backup and interface-behavior tests passed. Checks cover normal/overtime rules, manual overtime, blank and paid/unpaid breaks, calendar cycles, adjacent workweeks, overnight shifts, rate history, CSV values and safety, paycheck deductions, spending, recurring bills, separate cycle budgets, category order, legacy imports, readable backup restoration, account isolation, save conflicts, backup retention, input validation, support ownership and data deletion.

Subscription-removal checks save five pay periods and every finance feature through the real API against an isolated test database, including an expired-trial account with an earlier subscription row. Interface logic checks save a sixth period, start a fresh blank timesheet, create a category, save its limits, reorder categories and open earlier billing links as account controls. Retired checkout and subscription-event routes cannot make payment requests or change account data. Email provider authentication still rejects unconfigured login and forged tokens.

The production build passed. Browser visual verification was unavailable for this update; the existing mobile, tablet and desktop responsive styles remain in place. Tests use synthetic data and do not read or modify your private records. Email/Google end-to-end verification still needs provider setup.

## Readable account backups

Choose Download readable backup on Pay history or Help & account controls. The downloaded HTML file opens offline in a browser with clear labels, dollar amounts, AM/PM times and tables for your profile, pay periods, daily shifts, paychecks, deductions, expenses, recurring bills, category order, cycle budgets and pay settings. Its top totals cover all recorded paychecks and expenses; upcoming unpaid bills are listed separately. Gross estimates exclude invalid shifts and show which entries need checking.

Keep the original HTML file to restore the complete saved workspace through Help & account controls → Restore a backup. Earlier JSON backups still work. More backup options offers Download data file (JSON) for other tools. Use the browser Print menu (Ctrl+P on Windows) to print or save a PDF; a printed PDF is a reading copy, and the original HTML or JSON file is the restore copy. Downloads include current unsaved changes and label them clearly. The readable export has no external assets or executable scripts.

The new backup.mjs file must stay beside app.mjs and domain.mjs. No database migration is needed. Automated readable-backup checks cover correct amounts and time labels, independent cycle budgets, full HTML/JSON restore round trips, optional fields, category order, escaped user text, malformed and oversized files, empty accounts, negative balances and invalid draft shifts. Browser layout testing for this update was unavailable; responsive and print styles are included.

## Consistent action buttons

All action buttons share the same purple background and white text, including Download CSV, Save record, Next period, Available Balance, Budget, record controls, profile, sign-in and account actions. Hover, keyboard focus and disabled states remain visible. The offline calculator uses the same colors. Normal/Overtime mode keeps its sliding selection indicator.

For an existing local copy, replace `styles.css`, `calculator.html` and this README. Keep the other files together and refresh Chrome with Ctrl+F5. This styling update does not change saved data or calculations. The production build and CSS checks passed; a browser visual check was unavailable for this update.

## Save a record and start fresh

Save record first saves the complete current timesheet. After a successful save, a blank sheet opens for the next unused pay period. Start, End, Break and Manual OT values clear; worked hours, regular hours, overtime, gross pay and progress reset to zero. Hourly rate, pay-cycle length and calculation mode stay in place. Existing and overlapping saved periods are skipped so they remain available in Pay history. Custom periods keep their length; month and twice-monthly cycles follow the calendar. Open a saved period from Pay history to review or edit its hours.

If cloud saving or browser storage fails, the entered sheet stays on screen. Saving buttons show Saving… and prevent repeated clicks while the save is pending. Incomplete clock times must be completed before saving. The cloud app remembers a blank next-period draft on this device for the same signed-in account without adding an empty cloud record. Entered shifts continue to use the existing cloud autosave. The offline calculator keeps saved records in its browser.

For an existing local installation, replace `app.mjs`, `domain.mjs`, `calculator.html` and this README, keeping the other assets together. Refresh Chrome with Ctrl+F5. No database migration is needed. All 46 automated checks passed, including save failures, conflicts, saves without paid limits, repeated clicks, edits during a pending save, preserved history, account-specific blank drafts, date transitions and offline storage failure. Browser visual verification was unavailable for this update.

## Subscription removed

EasyTime has no Pro badges, upgrade button, plan screen, trial countdown or three-record paid limit. Timesheets, saved history, paycheck checks, expenses, bills, category budgets, drag-and-drop ordering, available balance, charts, reminders, exports and backups are included. The workspace remains private and account ownership checks still apply.

Existing records and backups keep their original format. Earlier billing links open Help & account controls. Payment checkout and subscription events are disabled. Existing database columns are retained for compatibility and do not control feature access; no database migration is needed.

For a local installation, use the updated full-source ZIP, or replace `public/easytime/app.mjs`, `index.html`, `styles.css`, this README and the server routes from the full project. The earlier `lib/easytime/billing.ts` is removed. Rebuild and restart the local app. The downloaded pages ZIP contains the current frontend; cloud saving also requires the updated server. Refresh your browser to load the latest page.

## Timesheet action placement

Download CSV and Save record appear below the daily-hours table, alongside Print / save PDF. The duplicate buttons above the timesheet are removed. Next period, Available Balance and Budget remain at the top. Saving, exporting and calculations use the same behavior.

For an existing local copy, replace `public/easytime/app.mjs`, `index.html` and this README. Refresh the browser to load the updated page.

## Everyday interface

The business workspace opens with task buttons and a short hours/pay summary. Six role-aware navigation choices lead to Home, Time clock, Schedule, Team (Time off for employees), Money and More. More includes a search for all permitted tools and quick help. Detailed filters, comparisons and spending exports open on demand. Schedule cards show local dates, including overnight end dates. These presentation changes use the existing save commands, approval rules and reports.

Current business development document: [BDD v2.0](../downloads/EasyTime-BDD-v2.0.md), dated October 26, 2026. PDF and Word editions are in the same downloads folder.

## Business flow diagrams

[Four-page flow PDF](../downloads/EasyTime-Flow-Diagrams.pdf), [overview image](../downloads/EasyTime-Flow-Overview.png), and [editable diagram bundle](../downloads/EasyTime-Flow-Diagrams.zip) map the current business workspace. The diagrams cover setup, hours and corrections, expense approval, stock-order reminders and saved feature choices, based on BDD v2.0.

## Competitor research snapshot

[Vendor spreadsheet](../downloads/EasyTime-Competitor-Market-Scan-2026-10-27.csv) and [methodology/report](../downloads/EasyTime-Competitor-Market-Scan-2026-10-27.md), researched October 27, 2026. The scan documents 54 supplier counting units and directory product snapshots. It does not establish a complete worldwide company count.
