# BK Petrol Pump Manager

A complete, working multi-tenant Petrol Pump Management SaaS. Every petrol pump that
registers gets its **own MongoDB database** — no shared tables, no `pumpId` filters to
forget, and no way for one pump's data to leak into another's queries.

Built and verified end-to-end: real auth, real database writes, real stock movements,
real reports, real CSV / Excel / PDF file exports, and two real automated test suites
(171 API assertions + 57 browser assertions) that both pass.

---

## 1. Quick start

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # set MONGODB_URI + JWT_SECRET
npm run seed                  # optional: 2 demo pumps with ~45 days of data
npm run dev                   # http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Open <http://localhost:5173>, sign in with a demo account, and everything is live.

### Demo credentials (password `Admin@1234` for all)

| Pump | Admin | Manager | Cashier |
| --- | --- | --- | --- |
| **Ali Filling Station** (`petrolpump_ali_filling_station_001`) | `admin@alifilling.com` | `manager@alifilling.com` | `cashier@alifilling.com` |
| **City Filling Station** (`petrolpump_city_filling_station_002`) | `admin@cityfilling.com` | `manager@cityfilling.com` | `cashier@cityfilling.com` |

Sign in to both pumps in two browser profiles to see the isolation for yourself — the
same URLs return completely different data, and the pump name / database name are shown
in the sidebar and on the Settings page.

### MongoDB requirement

The app uses MongoDB **transactions** for multi-document writes (a sale writes the sale
*and* the stock movement *and* the customer ledger entry). Transactions require a
**replica set**, so a plain standalone `mongod` is not enough.

* Local: start `mongod --replSet rs0` and run `rs.initiate()` once.
  `backend/scripts/init-replset.mjs` does this for you if `mongosh` isn't available.
* Atlas: any cluster (including M0 free tier) is already a replica set.
  Set `MONGODB_URI=mongodb+srv://…` in `backend/.env` and re-run `npm run seed`.

If transactions are unavailable the app falls back to sequential writes and logs a
warning — it will not crash, but multi-document operations are then not atomic.

---

## 2. Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, TypeScript (strict), React Router 6, Tailwind CSS 3, Axios, Recharts, Lucide icons |
| Backend | Node 20, Express 4, TypeScript, Mongoose 8, Zod validation, JWT, bcryptjs |
| Exports | **ExcelJS** (real `.xlsx` workbooks), **PDFKit** (real A4 PDFs), streaming CSV |
| Database | MongoDB (one database per pump + one master database) |
| Testing | `backend/src/scripts/e2e-test.ts` (HTTP suite) + `frontend/scripts/ui-smoke.mjs` (Playwright/Chromium) |

No mocks, no fixtures, no static dashboards: every number on screen comes from an
aggregation on that pump's own database.

---

## 3. Database architecture

```
petrol_saas_master                     ← the ONLY shared database
├── pumps                              name, slug, databaseName, owner, plan, status
├── subscriptions                      plan / billing state per pump
└── masterAdminUsers                   SaaS-level operators (not pump staff)

petrolpump_ali_filling_station_001     ← one database per pump, created on registration
├── users                              admin / manager / cashier (bcrypt hashes)
├── fuels                              name, code, selling & purchase price, stock, tank capacity, alert level
├── priceHistory                       every price change (fuel, old → new, who, when)
├── notifications                      which dashboard alerts a user has dismissed
├── sales                              qty, rate, total, cost, payment method, shift, status
├── shifts                             opening/closing cash, meter readings, totals
├── customers                          credit customers + running balance
├── customerTransactions               credit ledger (sales, payments, reversals)
├── expenses                           categorised daily expenses
├── purchases                          fuel received from suppliers
├── suppliers                          supplier master + purchase history
├── stockTransactions                  append-only movement ledger (source of truth)
└── counters                           per-pump invoice / receipt number sequences
```

**How isolation is enforced**

1. `POST /auth/register` creates a pump row in the master DB **and** provisions a brand
   new database `petrolpump_<slug>_<seq>`, then seeds its collections and indexes.
2. The JWT carries only `userId` and `pumpId`.
3. Every request passes through `resolveTenant`, which re-reads the pump document from
   the **master** database and resolves its `databaseName`. A pump or database id is
   never accepted from the client, so a tampered token or body cannot cross tenants.
4. Controllers only ever touch `req.tenant` — a Mongoose connection scoped to that
   pump's database. There is no shared collection to filter wrongly.

The automated suite proves this: pump B gets `404` (not `403`) when it asks for pump A's
customer id, and `404` when it tries to sell fuel using pump A's fuel id.

---

## 4. Features

**Auth & access** — register (creates the pump + its database), login, logout, `/me`,
JWT in `Authorization: Bearer`, bcrypt password hashing, remember-me, role-based routes,
password change, account activation/deactivation.

**Dashboard** — 8 live KPI cards (sales, liters, expenses, estimated net profit, petrol
total liters sold, petrol sales, diesel sales, today's expenses, Estimated Profit with
margin %), a revenue trend area chart, a fuel-split donut driven by the pump's real fuel
types, a sales-vs-expenses bar chart built from real per-day expense totals, the current
fuel stock table (current stock, tank capacity, selling price, Normal / Low Stock /
Critical status), quick actions, the open shift with expected cash, the last 7 days vs
the previous 7, quick info, and a recent-transactions feed mixing sales, purchases,
expenses, payments and stock adjustments. Every value is recomputed from the database
for the selected date range (today / yesterday / week / month / year / custom).

**Notifications** — the bell in the header is driven by `GET /notifications`, which derives
its alerts from live data on every request: fuel at or below its alert level (danger) or
below 20% of tank capacity (warning), a stock level that disagrees with the movement
ledger, no shift open, a shift left running past 12 hours, credit outstanding, and any
price change in the last 24 hours. Nothing is pre-generated or seeded, so refuelling a
tank or opening a shift makes the alert disappear on its own. Dismissals are stored per
user in the `notifications` collection, so the unread count is honest across reloads.

**Fuels** — create/edit/deactivate fuel types, opening stock, price updates, low-stock
alerts, and a reconciliation view that compares the running level against the stock
movement ledger (difference must be 0).

**Sales** — record cash / card / bank / credit sales; quantity × rate is computed and
shown before saving; stock drops immediately; the sale is stamped with the current open
shift and the signed-in cashier; search, filter by fuel/payment/date, pagination; detail
modal; void (which returns the stock and reverses any credit); printable receipt.
Cashiers cannot sell outside an open shift.

**Shifts** — open with opening cash + meter reading; the system totals cash/card/bank/credit
sales and expenses for the shift; on close it computes
`expectedCash = openingCash + cashSales − cashExpenses` and stores the difference
(short/over) with the counted cash and closing meter reading.

**Customers & credit** — customer master, credit sales that raise the balance, payments
that lower it, a full ledger per customer, and automatic reversal when a credit sale is
voided. Balances are derived from the ledger, not stored independently.

**Purchases & suppliers** — record fuel received (increases stock and writes a stock
movement), supplier master with contact details, purchase history per supplier, void.

**Expenses** — categorised expenses (salary, electricity, maintenance, rent, fuel,
other), create/edit/void/delete, search + category filter, and they flow into shift cash
math and the P&L report.

**Stock** — live overview per fuel with stock value and low-stock flags, a filterable
movement ledger (sale / purchase / opening / adjustment / void), and manual dip
adjustments.

**Users** — admin-only user management, roles, activation, last-login tracking.

**Reports** — 7 report types, each with date ranges and grouping:

| Report | Shows |
| --- | --- |
| Sales | invoices, liters, revenue, cost, margin — groupable by day/week/month/year or listed line by line |
| Expenses | spend by category and by day with totals |
| Fuel | liters sold, revenue, live stock, and stock value per fuel |
| Stock | opening + purchases − sales + adjustments = closing, per fuel |
| Customer credit | opening balance, credit given, payments, closing balance per customer |
| Shifts | per-shift sales, expenses, expected cash, counted cash, difference |
| Profit & loss | revenue − fuel cost − expenses, with margin % |

**Exports** — every report exports to **CSV**, **XLSX** and **PDF**, produced server-side
by ExcelJS and PDFKit and streamed with the correct MIME type and
`Content-Disposition`. The XLSX has a styled title block, frozen header pane and
autofilter; the PDF is A4 with a title block, the pump name, the date range, zebra
striped rows, a totals row and page footers. Export endpoints require the same JWT as
the rest of the API.

---

## 5. API

Base URL: `http://localhost:5000/api/v1`. All responses use
`{ "success": true, "data": …, "message"?: … }`; list endpoints return
`{ items, meta: { page, limit, total, totalPages, …summary } }`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `GET /auth/permissions` |
| Dashboard | `GET /dashboard?range=&from=&to=` |
| Fuels | `GET POST /fuels`, `GET PATCH DELETE /fuels/:id`, `PATCH /fuels/:id/price`, `GET /fuels/reconcile`, `GET /fuels/isolation-check`, `GET /fuel-prices`, `GET /fuels/:id/price-history` |
| Notifications | `GET /notifications`, `POST /notifications/dismiss`, `DELETE /notifications/dismissed` |
| Sales | `GET POST /sales`, `GET PATCH /sales/:id`, `POST /sales/:id/void`, `GET /sales/:id/receipt` |
| Shifts | `POST /shifts/open`, `GET /shifts/current`, `GET /shifts`, `GET /shifts/:id`, `POST /shifts/:id/close` |
| Customers | `GET POST /customers`, `GET PATCH DELETE /customers/:id`, `POST /customers/:id/payments`, `GET /customers/transactions` |
| Expenses | `GET POST /expenses`, `GET PATCH DELETE /expenses/:id`, `POST /expenses/:id/void`, `GET /expenses/categories` |
| Purchases | `GET POST /purchases`, `POST /purchases/:id/void` |
| Suppliers | `GET POST /suppliers`, `GET PATCH DELETE /suppliers/:id` |
| Stock | `GET /stock/overview`, `GET /stock/ledger`, `GET /stock/fuel/:id`, `POST /stock/adjust` |
| Reports | `GET /reports/types`, `GET /reports/:type`, `GET /reports/:type/export?format=csv\|xlsx\|pdf` (`:type` = `sales`, `expenses`, `fuel`, `stock`, `customers`, `shifts`, `profit`) |
| Users | `GET POST /users`, `PATCH DELETE /users/:id` (admin only) |

Report query parameters: `range` (`today|yesterday|this_week|this_month|this_year|custom`),
`from`, `to`, `groupBy` (`day|week|month|year|none`).

---

## 6. Roles & permissions

| | Admin | Manager | Cashier |
| --- | :---: | :---: | :---: |
| Dashboard | ✅ | ✅ | ✅ |
| Record sales / open & close shift | ✅ | ✅ | ✅ |
| Customers & credit ledger | ✅ | ✅ | ✅ |
| Fuel types (view) | ✅ | ✅ | ✅ |
| Create / edit fuel types | ✅ | ✅ | ❌ |
| Expenses, purchases, suppliers, stock | ✅ | ✅ | ❌ |
| Reports | ✅ | ✅ | sales only |
| Profit report | ✅ | ✅ | ❌ |
| Users & settings | ✅ | ❌ | ❌ |
| Delete fuel type | ✅ | ❌ | ❌ |

---

## 7. Testing

Both suites run against the live stack — nothing is stubbed.

```bash
# API suite — 171 assertions, 15 sections (needs backend running)
cd backend && npm run e2e
#   sample exports are written to backend/tmp-exports/

# Browser suite — 57 assertions, real Chromium clicking through the UI
cd frontend && npm run ui:smoke
#   screenshots + downloaded exports land in frontend/tmp-shots/

# Remove throwaway databases created by the API suite
cd backend && npm run clean:e2e
```

**API suite (`npm run e2e`)** — 171 passed / 0 failed. It registers two throwaway pumps
(creating two new databases), then asserts: auth and token behaviour; fuel CRUD and
opening stock; sale maths and stock reduction; credit ledger balances; purchases
increasing stock; expense filtering; shift open/close cash reconciliation; void
reversal returning stock and reversing credit; stock ledger reconciliation; dashboard
totals matching the records it created; all 7 report types across 6 date ranges plus
grouping; **byte-level** export checks (CSV row counts and totals, XLSX `PK` zip
signature and `[Content_Types].xml`, PDF `%PDF-` / `%%EOF` and decoded text content);
role permissions; **multi-pump isolation** (including the two demo pumps); and
validation/error handling (no stack traces in responses).

**Browser suite (`npm run ui:smoke`)** — 57 passed / 0 failed. Headless Chromium loads
the landing page, signs in, checks the dashboard KPIs and charts, walks all 12 sidebar
pages asserting each renders with table rows and no error state, opens a shift, records
a sale through the modal and verifies the row and the remaining-stock message, opens the
printable receipt, downloads a CSV / XLSX / PDF export and checks the file contents,
signs out, verifies the token is cleared, and finally asserts **zero** uncaught
JavaScript errors in the console for the whole session.

---

## 8. Project structure

```
.
├── README.md
├── backend/
│   ├── .env.example
│   ├── package.json                 npm run dev | build | seed | e2e | clean:e2e
│   └── src/
│       ├── server.ts                bootstrap
│       ├── app.ts                   express app, security middleware, routes
│       ├── config/env.ts            typed environment
│       ├── db/
│       │   ├── master.ts            master DB connection + Pump / Subscription models
│       │   └── tenant.ts            per-pump connection cache, provisioning, withTransaction
│       ├── middleware/              authenticate, resolveTenant, authorize, validate, errors
│       ├── modules/                 auth users fuels sales shifts customers expenses
│       │                            purchases suppliers stock reports dashboard
│       ├── services/stock.service.ts  stock movement + ledger logic
│       ├── utils/exporters/         csv.ts  xlsx.ts (ExcelJS)  pdf.ts (PDFKit)
│       └── scripts/                 seed.ts  e2e-test.ts  cleanup-e2e.ts  init-replset.mjs
└── frontend/
    ├── package.json                 npm run dev | build | preview | ui:smoke
    ├── scripts/ui-smoke.mjs         Playwright click-through
    └── src/
        ├── lib/                     api.ts auth.tsx format.ts types.ts toast.tsx
        │                            export.ts useApi.ts
        ├── components/              ui/ layout/ DateRangeFilter ExportMenu Logo …
        └── pages/                   Landing Login Register Dashboard Sales Shifts
                                     Customers Expenses Purchases Suppliers Fuels
                                     Stock Reports Users Settings Receipt
```

---

## 9. Environment variables (`backend/.env`, copy from `.env.example`)

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string (local or Atlas SRV) |
| `MASTER_DB_NAME` | Name of the SaaS master database (default `petrol_saas_master`) |
| `JWT_SECRET` | Signing secret — use a long random string in production |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `PORT` | API port (default `5000`) |
| `CLIENT_URL` | Frontend origin for CORS |
| `NODE_ENV` | `development` \| `production` |
| `RATE_LIMIT_DISABLED` | `true` only for repeated automated test runs |
| `RATE_LIMIT_AUTH_MAX` / `_REGISTER_MAX` / `_API_MAX` | Request caps per window |

The frontend talks to `/api/v1`, which the Vite dev server proxies to `http://127.0.0.1:5000`
(override with `VITE_API_TARGET`). Set `VITE_HMR_TLS=true` only if you reach the dev
server through a TLS proxy on port 443.

---

## 10. Notes & limitations

* **Profit is estimated — and calculated in exactly one place.** `Estimated Profit` is
  revenue − fuel cost at the time of sale − operating expenses, and it is produced only by
  `backend/src/services/profit.service.ts`. The dashboard, every report, every date range
  and every CSV / XLSX / PDF export call that same function, so the same period always
  reports the same number everywhere. It is not double-entry accounting: there is no chart
  of accounts, no depreciation, no tax engine and no balance sheet. Wire it to your
  accountant's method before using it for filings.
* **Changing a fuel price never rewrites history.** Each sale stores the rate and fuel
  cost that applied when it was created; a price change only moves the fuel's current
  price and appends a row to `priceHistory`. Reports for past periods are unaffected.
* **Multi-document writes need a replica set.** Sales, purchases, voids and payments run
  in a MongoDB transaction; standalone servers fall back to non-atomic writes.
* **No subscription billing integration.** Each pump has a `subscription` document with
  plan/status, and access can be gated on it, but no payment gateway is wired in.
* **Single currency, PK locale.** Amounts are plain numbers formatted as `Rs. 1,234.00`;
  there is no multi-currency layer.
* **Per-database scaling.** One database per pump keeps isolation airtight and backups
  per-pump simple, but a deployment with thousands of pumps should watch MongoDB's
  namespace/file-handle limits (the sandbox's default 1024 open-file limit needed raising
  once ~20 pump databases existed).
* **Bundle size.** The production frontend bundle is ~830 kB (228 kB gzipped) in a single
  chunk; route-level code splitting is the obvious next optimisation.
