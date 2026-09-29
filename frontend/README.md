# BK Petrol Pump Manager — Frontend

React 18 + Vite 5 + TypeScript (strict) + Tailwind CSS SPA for the BK Petrol Pump API.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on `0.0.0.0:5173`, proxies `/api` and `/health` to `http://127.0.0.1:5000` |
| `npm run build` | `tsc --noEmit` then a production build into `dist/` |
| `npm run preview` | Serve the production build on port 4173 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run ui:smoke` | 57-assertion Playwright click-through (needs both servers running) |

## Environment

There is no `.env` requirement — the app calls the relative path `/api/v1`, which the dev
server proxies to the backend.

* `VITE_API_TARGET` — override the proxy target (default `http://127.0.0.1:5000`).
* `VITE_HMR_TLS=true` — only needed when the dev server is reached through a TLS proxy on
  port 443; otherwise Vite derives the HMR socket from the page URL, which is correct for
  both `http://localhost:5173` and a proxied host.

## Layout

```
src/
├── main.tsx / App.tsx        router: / · /login · /register · /app/* · /app/sales/:id/receipt
├── index.css                 Tailwind layers + reusable component classes + print styles
├── lib/
│   ├── api.ts                axios instance, token storage (remember-me), http verbs, list()
│   ├── auth.tsx              AuthProvider, useAuth, permission map, can()
│   ├── useApi.ts             data hook with loading / error / reload
│   ├── export.ts             authenticated blob download honouring Content-Disposition
│   ├── format.ts             currency, number, date helpers (PK locale)
│   ├── toast.tsx             toast provider
│   └── types.ts              shared API types
├── components/
│   ├── ui/index.tsx          Button Field Input Select Card Badge Modal Pagination StatCard …
│   ├── layout/               Sidebar, AppLayout, ProtectedRoute
│   ├── DateRangeFilter.tsx   today / week / month / year / custom
│   ├── ExportMenu.tsx        CSV · Excel · PDF
│   └── Logo.tsx · AuthShell.tsx
└── pages/                    Landing Login Register Dashboard Sales Shifts Customers
                              Expenses Purchases Suppliers Fuels Stock Reports Users
                              Settings Receipt
```

## Notes

* The JWT is stored in `localStorage` when "Remember me" is checked, otherwise in
  `sessionStorage`, under `bk_petrol_token`.
* Sidebar items are filtered by the permission set that comes back from
  `GET /auth/permissions`, so a cashier simply never sees the pages they may not open.
* Lookup dropdowns call `list(url, params)` from `lib/api.ts`, which unwraps the
  `{ items, meta }` envelope and returns the rows.
* The receipt route (`/app/sales/:id/receipt`) is print-ready — `index.css` hides the
  app chrome under `@media print`.

## Testing

`npm run ui:smoke` drives a real headless Chromium: it signs in, checks the dashboard KPIs
and charts, walks all 12 pages, opens a shift, records a sale through the modal, opens the
receipt, downloads and validates CSV / XLSX / PDF exports, signs out and asserts a clean
console. Current result: **57 passed / 0 failed**.
