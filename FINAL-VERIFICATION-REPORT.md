# BK Petrol Pump Manager — Final Verification Report

**Date:** 2026-09-17
**Scope:** full-stack rebuild against the re-issued master build prompt
**Mode:** real local MongoDB (replica set) + real API + real headless browser. No mocks, no stubbed
responses, no placeholder numbers. Every PASS below is backed by an executed command.

---

## 1. Test runs

| Suite | Command | Result | Log |
|---|---|---|---|
| Backend typecheck | `npm run typecheck` (backend) | **PASS** (0 errors) | — |
| Frontend typecheck | `npm run typecheck` (frontend) | **PASS** (0 errors) | — |
| Backend production build | `npm run build` (backend) | **PASS** (exit 0) | `verification-logs/backend-build.log` |
| Frontend production build | `npm run build` (frontend) | **PASS** — 4.69 s, 857.64 kB / 234.43 kB gzip | `verification-logs/frontend-build.log` |
| End-to-end API suite | `npm run e2e` | **174 passed · 0 failed** | `verification-logs/e2e.log` |
| Deep verification suite | `npm run verify` | **212 passed · 0 failed** | `verification-logs/verify.log` |
| Browser UI smoke | `npm run ui:smoke` | **82 passed · 0 failed** | `verification-logs/ui-smoke.log` |
| **Total** | | **468 assertions passed · 0 failed** | |

Sample export files produced by the runs: `backend/tmp-verify/` and `backend/tmp-exports/`
(CSV, XLSX, PDF for each report type, both the demo pump and the throwaway verification pump).

---

## 2. Multi-tenancy — one database per petrol pump

| # | Feature | Result | Evidence |
|---|---|---|---|
| 2 | Separate database per pump, created on registration | **PASS** | verify §3, §4 — new pump gets a fresh `databaseName` that did not exist before |
| 3 | Complete data isolation between pumps | **PASS** | e2e §14 (14 checks) — pump B sees 0 of pump A's customers/sales/expenses, cross-tenant reads by id return 404, cross-tenant sale with a foreign fuel id returns 404 |
| 4 | Master database holds only pumps / subscriptions / masterAdminUsers | **PASS** | verify §2 |
| 5 | Every tenant database has the full collection set | **PASS** | verify §2 — 11 collections incl. `priceHistory` and lazily-created `counters` |
| 6 | No shared collections leak into a tenant | **PASS** | verify §2 |

**Pumps currently provisioned:** `petrolpump_ali_filling_station_001`,
`petrolpump_city_filling_station_001` (seeded demo data) plus throwaway pumps created by the
verification runs.

---

## 3. Authentication, roles and security

| # | Feature | Result | Evidence |
|---|---|---|---|
| 7 | JWT login issues a token scoped to one pump | **PASS** | verify §5 — logged-in user resolves to the correct tenant database |
| 8 | Roles enforced server-side (admin / manager / cashier) | **PASS** | e2e §13 — manager can create fuel types, cannot manage users (403) or delete a fuel (403) |
| 9 | Passwords stored as bcrypt hashes, never returned by the API | **PASS** | e2e §13 — "user list never returns a password hash" |
| 10 | Error responses never leak a stack trace; bad ids return a clean 400 | **PASS** | e2e §15 |
| 11 | Registration creates owner + default fuel types + its own DB | **PASS** | verify §4 |

---

## 4. Centralized Estimated Profit (§27–30) — the headline fix

There is now **exactly one** profit formula in the system:
`backend/src/services/profit.service.ts`.

```
Estimated Profit = Total Sales Revenue
                 − Fuel Cost of Sold Fuel (purchase rate captured at the moment of sale)
                 − Operating Expenses
```

* The label is the constant `PROFIT_LABEL = 'Estimated Profit'` — never "Net Profit",
  "Final Profit" or "Accounting Profit".
* `calculateEstimatedProfit()` (pure) and `calculateEstimatedProfitForRange()` (aggregates a
  tenant DB over a window) are the only entry points.
* The dashboard, the sales report, the fuel report, the profit & loss report, every date range
  and every CSV / XLSX / PDF export read from here.
* The frontend never recomputes profit — it renders `kpis.estimatedProfit`, `kpis.profitLabel`
  and `kpis.marginPercent` exactly as the API returns them.

| # | Check | Result | Evidence |
|---|---|---|---|
| 27 | One shared profit calculation, used by dashboard + all reports | **PASS** | verify §10 |
| 28 | Same number across dashboard, daily report, profit report, exports | **PASS** | verify §10 |
| 29 | Label is exactly "Estimated Profit" in UI, reports and exports | **PASS** | verify §10 (6 sources checked, forbidden variants asserted absent) |
| 30 | Consistent across all date ranges and filters | **PASS** | verify §10 — `today / this_week / this_month / this_year` each assert dashboard = report and profit = revenue − cost − expenses |
| 55 | **Worked example: 5,500 − 5,200 − 100 = 200 appears identically everywhere** | **PASS** | verify §10 |

### §55 worked example, verbatim from the run

A dedicated pump was registered for this test so the arithmetic is exact:

```
control sale records revenue 5,500                     ✔   (20 L × 275/L)
control sale records fuel cost 5,200                   ✔   (20 L × 260/L)
dashboard estimated profit : 200 (label "Estimated Profit")
  ✔ dashboard Estimated Profit = 5,500 − 5,200 − 100 = 200
daily sales report         : Estimated Profit PKR 200
  ✔ daily sales report summary shows Estimated Profit = 200
profit & loss report       : Estimated Profit 200
  ✔ profit report shows Estimated Profit = 200
  ✔ exported profit CSV contains the Estimated Profit line 200
  ✔ exported profit XLSX contains the Estimated Profit 200 as a number
  ✔ exported profit PDF contains the label "Estimated Profit" and the value 200
  ✔ exported daily sales CSV carries the same 200 Estimated Profit summary
```

Files: `backend/tmp-verify/verify-profit.{csv,xlsx,pdf}`, `verify-sales.{csv,xlsx,pdf}`.

---

## 5. Fuel price history (§21, §22, §54)

| # | Feature | Result | Evidence |
|---|---|---|---|
| 21 | Price history recorded on every price change | **PASS** | verify §11 |
| 22 | Changing today's price never alters historical sales | **PASS** | verify §11 |
| 54 | Price board with current/previous price, margin, capacity | **PASS** | verify §11 + ui-smoke §10 |

**The 275 → sale → 280 → sale test, verbatim:**

```
  ✔ sale #1 recorded at the old price 275
  ✔ PATCH /fuels/:id/price returns 200
  ✔ price update echoes the previous selling price (275)
  ✔ sale #2 recorded at the new price 280
  rates on file: 275, 275, 280
  ✔ both 275 and 280 persist in the sales history
  price history entries: 2
  ✔ price history has at least 2 entries (create + update)
  ✔ price history entry records 275 → 280
  ✔ price history entry records the change source
  ✔ price board shows the current price 280 and previous 275
  ✔ the earlier sale still reports 2,750 (10 L × 275) after the price change
```

Implementation: every sale stores its own `rate` and `purchasePrice` at creation, so a price
change only moves `fuels.sellingPrice` and appends a `priceHistory` row. New endpoints
`GET /fuel-prices` (board) and `GET /fuels/:id/price-history` (audit trail) feed the new
**Fuel Prices** page (`/app/fuel-prices`).

---

## 6. Dashboard (§9–20)

| # | Feature | Result | Evidence |
|---|---|---|---|
| 9 | Header: pump name, Online status, current date, **Notifications**, Settings, logged-in user + role | **PASS** | ui-smoke §3 (6 assertions) + §11 (6 assertions) + verify §13 (21 assertions) |
| 10 | Date filter (Today / Yesterday / Week / Month / Year / Custom) drives real data | **PASS** | verify §12 — all 6 ranges return a full KPI set |
| 11 | KPI cards: total sales, liters sold, petrol sales, diesel sales, today's expenses, Estimated Profit | **PASS** | ui-smoke §3 (6 assertions) |
| 12 | Sales overview chart with filters | **PASS** | ui-smoke §3 — "charts render (recharts svg surfaces)" |
| 13 | Fuel distribution from the pump's real fuel types (not hardcoded) | **PASS** | verify §12 — `fuelBreakdown` matches the tenant's actual fuels |
| 14 | Sales vs expenses comparison | **PASS** | verify §12 + live check: per-day `expenseTrend` sums to `kpis.expenses` (105,227.38) |
| 15 | Stock table with Fuel Type, Current Stock, **Capacity**, Selling Price, Status | **PASS** | verify §12 + ui-smoke §3 — capacity column and Normal/Low Stock/Critical badges |
| 16 | Recent transactions across sales, purchases, expenses, payments, adjustments | **PASS** | verify §12 — feed returns all 5 types (observed: `sale, payment, adjustment, expense, purchase`) |
| 17 | Quick actions open their real forms (no dead buttons) | **PASS** | ui-smoke §9 — New Sale / Add Expense / New Customer each open their modal |
| 18 | Today's shift block | **PASS** | ui-smoke §5 + verify §12 |
| 19 | Last 7 days with previous-period comparison | **PASS** | verify §12 — total, previousTotal, change %, 7-point series |
| 20 | Quick info: credit outstanding, customers, suppliers, fuel types | **PASS** | verify §12 |

The stock status (Normal / Low Stock / Critical) is computed **once, in the backend**, and the
UI renders it verbatim — the frontend no longer re-derives it.

---

## 6b. Notifications (§9)

The header bell is fed by `GET /notifications`, which **derives its alerts from live data
on every request** — nothing is pre-generated, seeded or faked. If the underlying
condition is resolved (tank refuelled, shift opened, price change ages past 24 h) the
alert disappears on the next request.

| Alert | Level | Trigger |
|---|---|---|
| Fuel critically low | danger | `currentStock <= minStockAlert` |
| Fuel running low | warning | `<= 20%` of tank capacity, or `<= 1.5 × minStockAlert` |
| Stock vs ledger mismatch | danger | live level ≠ movement ledger |
| No shift open | warning | no `status: 'open'` shift |
| Shift open too long | warning | open for more than 12 hours |
| Credit outstanding | info | any customer balance `> 0` |
| Price changed | info | price update within the last 24 hours |

Each alert carries a title, a specific message, a timestamp and an in-app deep link
(`/app/stock`, `/app/shifts`, `/app/customers?tab=credit`, `/app/fuel-prices`). Dismissals
are stored per user in the tenant's `notifications` collection, so the unread badge is
honest across reloads and devices.

| # | Check | Result | Evidence |
|---|---|---|---|
| 9a | `GET /notifications` returns live, well-formed alerts | **PASS** | verify §13 |
| 9b | Empty pump warns "no shift is open" | **PASS** | verify §13 |
| 9c | Critical stock raises danger; topping up downgrades it to warning | **PASS** | verify §13 |
| 9d | Healthy fuel raises no stock alert | **PASS** | verify §13 |
| 9e | Price change within 24 h raises an info alert with old → new rate | **PASS** | verify §13 |
| 9f | Credit outstanding raises an info alert linking to the credit tab | **PASS** | verify §13 |
| 9g | Alerts ordered danger → warning → info | **PASS** | verify §13 |
| 9h | Dismiss decrements unread by exactly 1; dismiss-all leaves 0; restore works | **PASS** | verify §13 |
| 9i | Alerts never leak between pumps | **PASS** | verify §13 |
| 9j | No placeholder / lorem / "coming soon" content anywhere | **PASS** | verify §13 + ui-smoke §11 |
| 9k | Bell badge matches the API's unread count in a real browser | **PASS** | ui-smoke §11 — `API unread: 1 of 1 alerts · bell badge "1"` |
| 9l | Clicking an alert's title navigates to the right page; dismiss decrements the badge live | **PASS** | ui-smoke §11 |

## 7. Core business operations

| # | Feature | Result | Evidence |
|---|---|---|---|
| 23 | Sales — cash / card / bank / credit, stock drops immediately | **PASS** | e2e §6, §7; ui-smoke §6 |
| 24 | Voids return stock and reverse credit | **PASS** | e2e §7 |
| 25 | Purchases raise stock and update supplier totals | **PASS** | e2e §8, verify §7 |
| 26 | Expenses by category | **PASS** | e2e §9, verify §12 |
| 31 | Credit sales, customer ledgers, payments, outstanding balances | **PASS** | e2e §10 — API balances reconciled against MongoDB |
| 32 | Shifts — open/close, expected vs actual cash, shift-scoped totals | **PASS** | e2e §11; ui-smoke §5 |
| 33 | Stock movement ledger reconciles to live stock (difference = 0) | **PASS** | verify §7 |
| 34 | Fuel types, low-stock alerts, reconciliation view | **PASS** | e2e §4 |
| 35 | Suppliers | **PASS** | e2e §12; ui-smoke §4 |
| 36 | Users & roles management | **PASS** | e2e §13 |
| 37 | Settings | **PASS** | ui-smoke §4 |
| 38 | Landing page, login, registration | **PASS** | ui-smoke §1, §2; verify §4 |

---

## 8. Reports & exports (§39–47, §56–58)

| # | Feature | Result | Evidence |
|---|---|---|---|
| 40 | All 7 report types return rows | **PASS** | verify §8 — sales, expenses, fuel, stock, customers, shifts, profit |
| 41 | All date ranges (today / yesterday / week / month / year / custom) | **PASS** | verify §8 — each range cross-checked against a MongoDB aggregate |
| 42 | CSV export — values match the database | **PASS** | verify §9 — row count and TOTAL match; verified for both the demo pump (361 rows) and the throwaway pump |
| 43 | XLSX export — opens as a real workbook, totals stored as numbers | **PASS** | verify §9 — parsed with ExcelJS; OOXML `PK` signature asserted |
| 44 | PDF export — title, pump name, date range, TOTAL row, every invoice | **PASS** | verify §9 |
| 45 | Printable sale receipt | **PASS** | ui-smoke §7 |
| 46 | Grouping by day / week / month / year | **PASS** | verify §8, e2e §11 |
| 47 | Reports respect the same date filter as the dashboard | **PASS** | verify §10 |

---

## 9. Engineering quality

| # | Feature | Result | Evidence |
|---|---|---|---|
| 48 | Clean, documented API routes (incl. `/fuel-prices`, `/customer-transactions`, `/stock-history` aliases) | **PASS** | verify §12 — all three return 200 with data |
| 49–53 | Transactions: every multi-document write runs in a MongoDB transaction | **PASS** | verify §13 — server tx counters increase (115 → 120 committed) across 8 transactional operations |
| 59 | Responsive layout | **PASS** | ui-smoke §4 (every page renders at 1440 px; mobile drawer + responsive grids) |
| 60 | README documents setup, architecture and limitations | **PASS** | `README.md` updated with the profit service, `priceHistory` collection and the new dashboard |

**Browser console health:** no uncaught JavaScript errors on any page (ui-smoke §12).

---

## 10. What was changed in this pass

**Backend**
* `src/services/profit.service.ts` — the single profit formula and the `Estimated Profit` label.
* `src/modules/reports/reports.service.ts` — sales and fuel reports now attach a centralized
  profit summary; per-line columns honestly labelled "Gross Profit".
* `src/models/tenant/schemas.ts` — `Fuel.capacity`, plus the new `priceHistory` collection.
* `src/modules/fuels/fuels.controller.ts` — price changes append history; new
  `GET /fuel-prices` and `GET /fuels/:id/price-history`.
* `src/modules/dashboard/dashboard.controller.ts` — `estimatedProfit` / `profitLabel` /
  `marginPercent` / `expensesToday`, new `profit`, `quickInfo`, `last7Days`, `recentActivity`
  and real per-day `expenseTrend`; stock rows carry `capacity`, `fillPercent` and `status`.
* `src/routes/index.ts` — dedicated alias routers for `/fuel-prices`, `/customer-transactions`,
  `/stock-history`.

* `src/modules/notifications/notifications.controller.ts` (new) + routes — `GET /notifications`,
  `POST /notifications/dismiss`, `DELETE /notifications/dismissed`; alerts derived live from
  stock, shifts, credit and price history.
* `src/modules/dashboard/dashboard.controller.ts` — real per-day `expenseTrend` (removed the
  earlier evenly-spread placeholder), so sales-vs-expenses is built from actual daily totals.
* `src/scripts/seed.ts` — opening stock is now a fraction of tank capacity and tanker
  deliveries respect remaining headroom, so seeded stock can never exceed capacity.

**Frontend**
* New **NotificationBell** component in the app-shell header: unread badge, dropdown with
  danger/warning/info styling, per-alert dismiss, "mark all read", restore, and deep links
  into the page that resolves each alert. It replaced a bell icon that merely linked to
  Reports. (§9)
* New **Fuel Prices** page (`/app/fuel-prices`) with the price board, an update-price modal and
  a per-fuel price-history audit trail.
* `Dashboard.tsx` rewritten for §9–20: pump header with Online status and user + role, six KPI
  cards, sales overview area chart, fuel donut, real sales-vs-expenses bars, stock table with
  capacity and status badges, quick actions, shift block, last-7-days sparkline with comparison,
  quick info and a mixed activity feed.
* Sidebar links that carry a query parameter (`?new=1`, `?tab=ledger|history|credit|payments`,
  `?type=profit`) are now handled by `src/lib/useQueryParams.ts`, so no sidebar entry dead-ends.
* `Fuels.tsx` — tank capacity added to the form and the fuel cards.

**Docs** — `README.md` updated (collections, dashboard description, profit-service note,
price-history guarantee).

---

## 11. Known limitations (unchanged, deliberate)

1. **Profit is estimated, not accounting.** No chart of accounts, depreciation, tax or balance
   sheet. One pump-wide formula: revenue − fuel cost at time of sale − operating expenses.
2. **MongoDB replica set required** for multi-document transactions (sales, purchases, voids,
   payments, shift close). A standalone server falls back to non-atomic writes.
3. **No subscription billing gateway** — each pump has a `subscription` document but no payment
   integration is wired in.
4. **Notifications are informational, not push.** The bell refreshes on navigation and every
   60 seconds while the app is open; it does not use websockets or deliver email/SMS.
5. **Local MongoDB is in use.** The code reads `MONGODB_URI` from the environment; no Atlas URI
   has been supplied yet, so the runs above are against the local replica set. Repointing
   `MONGODB_URI` at an Atlas cluster is the only change needed.
