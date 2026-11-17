# EasyTime

Private workforce, timesheet and gross-pay preparation app with a redesigned dashboard.

## Features

- Employee clock-in/out, unpaid breaks and recorded attendance
- Daily, weekly and biweekly hours, overtime and captured hourly rates
- Schedules versus actual hours, manager approvals and correction history
- Multiple stores, team access, date filters and Excel/PDF reporting
- Personal pay-period calculator, saved records, budgets and expenses

## Run locally

Requires Node.js 22.13.0 or newer and pnpm 11.25.0.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install
pnpm dev
```

Open the URL printed by the server. The root opens `/easytime/payroll.html`; the personal calculator is `/easytime/index.html`. Use **Try sample workspace** to explore without live records. For local account simulation, see README-RUNTIME.md. Production sign-in and database bindings require hosting configuration.

## Checks

```sh
node --test tests/payroll-business.test.mjs tests/workforce.test.mjs tests/easytime-record-save.test.mjs
pnpm build
node --test tests/payroll-worker.test.mjs
```

## Design

`public/easytime/workforce-design.css` contains the shared visual system. `public/easytime/payroll.mjs` renders business navigation, the dashboard and payroll workflows. Server routes are under `app/api/easytime/`.

The hosting manifest deliberately omits the private deployment identity. Generated output, credentials, account records and historical download archives are excluded. See README-PAYROLL.md and public/easytime/README.md for details. This application prepares gross-pay estimates; it does not execute payments or file payroll taxes.
