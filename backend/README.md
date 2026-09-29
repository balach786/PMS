# BK Petrol Pump Manager — Backend

Express + TypeScript + Mongoose API with a **separate MongoDB database per petrol pump**.

```bash
npm install
cp .env.example .env      # set MONGODB_URI and JWT_SECRET
npm run seed              # optional: 2 demo pumps, ~45 days of data each
npm run dev               # http://localhost:5000/api/v1
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the API with `tsx watch` |
| `npm run build` / `npm start` | Compile to `dist/` and run the compiled server |
| `npm run seed` | Create/reset the two demo pumps (Ali Filling Station, City Filling Station) |
| `npm run seed:multi` | Seed additional pumps for load/isolation experiments |
| `npm run e2e` | 171-assertion live HTTP test suite (`src/scripts/e2e-test.ts`) |
| `npm run clean:e2e` | Drop the throwaway databases created by the e2e suite |
| `npm run typecheck` | `tsc --noEmit` |

## Multi-tenancy in one paragraph

`petrol_saas_master` holds `pumps`, `subscriptions` and `masterAdminUsers` only. On
registration the API provisions `petrolpump_<slug>_<seq>` with its own collections and
indexes. The JWT carries `userId` + `pumpId`; `resolveTenant` re-reads the pump document
from the master DB on **every** request and attaches a Mongoose connection scoped to that
pump's database as `req.tenant`. No pump id or database name is ever taken from the
request body or query string, so controllers physically cannot reach another tenant's
data.

## Layout

```
src/
├── server.ts / app.ts        bootstrap, security middleware, route mounting
├── config/env.ts             typed, validated environment
├── db/master.ts              master connection + Pump / Subscription / MasterAdminUser
├── db/tenant.ts              per-pump connection cache, provisioning, withTransaction
├── middleware/               authenticate, resolveTenant, authorize, validate, errorHandler
├── modules/                  auth users fuels sales shifts customers expenses
│                             purchases suppliers stock reports dashboard
├── services/stock.service.ts stock movement + ledger reconciliation
├── utils/exporters/          csv.ts · xlsx.ts (ExcelJS) · pdf.ts (PDFKit)
└── scripts/                  seed.ts · e2e-test.ts · cleanup-e2e.ts · init-replset.mjs
```

Each module is `*.routes.ts` (zod validation + role guards), `*.controller.ts` (HTTP
layer) and, where the logic is substantial, `*.service.ts`.

## Conventions

* Success envelope: `{ success: true, data, message? }`.
* List envelope: `{ items, meta: { page, limit, total, totalPages, …summary } }`.
* Errors: `{ success: false, message, code, errors? }` — stack traces are never sent.
* Money is rounded to 2 decimals and volumes to 3, via `src/utils/number.ts`.
* Every multi-document write (sale, purchase, void, payment) runs through
  `withTransaction` from `src/db/tenant.ts`, which retries transient errors and falls
  back with a warning when the server has no replica set.
* Never run two queries in `Promise.all` on the same `ClientSession` — MongoDB rejects it
  with `NoSuchTransaction`. Keep session operations sequential.

## Reports & exports

`GET /reports/:type` with `range`, `from`, `to`, `groupBy` for `sales`, `expenses`,
`fuel`, `stock`, `customers`, `shifts`, `profit`.
`GET /reports/:type/export?format=csv|xlsx|pdf` streams a real file — ExcelJS workbooks
with a styled title block, frozen header row and autofilter; PDFKit A4 documents with
title block, pump name, date range, zebra rows, totals and page footers.

## Testing

`npm run e2e` registers two fresh pumps (two new databases), exercises the whole API over
HTTP and finishes **171 passed / 0 failed**. Sample exports are written to
`tmp-exports/`. Run `npm run clean:e2e` afterwards to drop those databases; the suite
also cleans up automatically at startup.
