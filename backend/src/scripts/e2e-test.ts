/**
 * END-TO-END TEST SUITE
 * ---------------------
 * Runs the full feature list against a live API + MongoDB and asserts the real
 * responses. Run with:  npm run e2e   (backend and mongod must be running)
 *
 * It creates throwaway pumps prefixed with "E2E" so demo data is untouched.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { cleanE2E } from './cleanup-e2e.js';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000/api/v1';
const OUT_DIR = path.resolve(process.cwd(), 'tmp-exports');

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSection = '';

function section(name: string) {
  currentSection = name;
  console.log(`\n\x1b[1m\x1b[36m${name}\x1b[0m`);
}

function ok(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✔\x1b[0m ${label}`);
  } else {
    failed += 1;
    failures.push(`${currentSection} → ${label}`);
    console.log(`  \x1b[31m✘\x1b[0m ${label}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}

function closeTo(a: number, b: number, tolerance = 0.011): boolean {
  return Math.abs(a - b) <= tolerance;
}

interface ApiResult<T> {
  status: number;
  body: T;
  headers: Headers;
}

async function call<T = any>(
  method: string,
  url: string,
  options: { token?: string; body?: unknown; params?: Record<string, string | undefined>; raw?: boolean } = {},
): Promise<ApiResult<T>> {
  const query = options.params
    ? Object.entries(options.params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const full = `${BASE}${url}${query ? `?${query}` : ''}`;

  const res = await fetch(full, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (options.raw) {
    return { status: res.status, body: (await res.arrayBuffer()) as unknown as T, headers: res.headers };
  }

  let body: unknown;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T, headers: res.headers };
}

const get = <T = any>(url: string, token?: string, params?: Record<string, string | undefined>) =>
  call<T>('GET', url, { token, params });
const post = <T = any>(url: string, body?: unknown, token?: string) => call<T>('POST', url, { token, body });
const patch = <T = any>(url: string, body?: unknown, token?: string) => call<T>('PATCH', url, { token, body });
const del = <T = any>(url: string, token?: string) => call<T>('DELETE', url, { token });

const data = <T>(r: ApiResult<{ success: boolean; data: T }>): T => r.body.data;
/** Rows of a `{ items, meta }` list response. */
const items = (r: ApiResult<any>): any[] => r.body?.data?.items ?? [];

/** Inflates the PDF content streams so the rendered text can be asserted. */
function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const chunks: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    const slice = buf.subarray(start, end);
    let text: string;
    try {
      text = zlib.inflateSync(slice).toString('latin1');
    } catch {
      text = slice.toString('latin1');
    }
    // pdfkit writes text as hex strings inside TJ arrays -> decode them
    let decoded = text.replace(/<([0-9a-fA-F]+)>/g, (_all, hex: string) => Buffer.from(hex, 'hex').toString('latin1'));
    // kerning adjustments (e.g. "Sales Repor -20 t") sit between word fragments
    decoded = decoded.replace(/\s+-?\d+(?:\.\d+)?\s*/g, '');
    chunks.push(decoded);
  }
  return chunks.join(' ');
}

const STAMP = Date.now().toString().slice(-6);
const PASSWORD = 'Test@12345';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Remove leftovers from previous runs so test databases do not pile up.
  const removed = await cleanE2E(true);
  if (removed) console.log(`Cleaned ${removed} E2E database(s) from a previous run.`);

  // ---------------------------------------------------------------------
  section('1. AUTHENTICATION');

  const pumpAName = `E2E Alpha Filling ${STAMP}`;
  const pumpAEmail = `e2e.alpha.${STAMP}@testpump.com`;
  const pumpBName = `E2E Beta Filling ${STAMP}`;
  const pumpBEmail = `e2e.beta.${STAMP}@testpump.com`;

  const regA = await post('/auth/register', {
    businessName: pumpAName,
    ownerName: 'Alpha Owner',
    email: pumpAEmail,
    phone: '0300-0000001',
    address: 'Test Road A, Karachi',
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  ok('register returns 201', regA.status === 201, regA.body);
  const regAData = data<any>(regA as any);
  const tokenA = regAData?.token as string;
  const dbA = regAData?.pump?.databaseName as string;
  ok('a JWT is issued', typeof tokenA === 'string' && tokenA.length > 40);
  ok(
    'a dedicated pump database is created (petrolpump_<slug>_NNN)',
    /^petrolpump_[a-z0-9_]+_\d{3}$/.test(dbA || ''),
    dbA,
  );

  const regB = await post('/auth/register', {
    businessName: pumpBName,
    ownerName: 'Beta Owner',
    email: pumpBEmail,
    phone: '0300-0000002',
    address: 'Test Road B, Lahore',
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  const tokenB = data<any>(regB as any)?.token as string;
  const dbB = data<any>(regB as any)?.pump?.databaseName as string;
  ok('second pump gets a DIFFERENT database', Boolean(dbB) && dbB !== dbA, { dbA, dbB });

  // duplicate registration
  const dupe = await post('/auth/register', {
    businessName: pumpAName,
    ownerName: 'Alpha Owner',
    email: pumpAEmail,
    phone: '0300-0000001',
    address: 'x',
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  ok('duplicate email registration is rejected (409)', dupe.status === 409, dupe.body?.message);

  // weak password
  const weak = await post('/auth/register', {
    businessName: 'Weak Pass Pump',
    ownerName: 'Weak',
    email: `e2e.weak.${STAMP}@testpump.com`,
    phone: '0300-0000003',
    address: 'x',
    password: '123',
    confirmPassword: '123',
  });
  ok('weak password is rejected (422)', weak.status === 422, weak.body?.message);

  // mismatched passwords
  const mismatch = await post('/auth/register', {
    businessName: 'Mismatch Pump',
    ownerName: 'M',
    email: `e2e.mismatch.${STAMP}@testpump.com`,
    phone: '0300-0000004',
    address: 'x',
    password: PASSWORD,
    confirmPassword: 'Different@123',
  });
  ok('mismatched passwords are rejected (422)', mismatch.status === 422);

  // login
  const login = await post('/auth/login', { email: pumpAEmail, password: PASSWORD });
  ok('login returns 200', login.status === 200, login.body?.message);
  const loginData = data<any>(login as any);
  ok('login resolves the correct pump database', loginData?.pump?.databaseName === dbA, loginData?.pump?.databaseName);

  const wrongPass = await post('/auth/login', { email: pumpAEmail, password: 'WrongPass@999' });
  ok('wrong password is rejected (401)', wrongPass.status === 401, wrongPass.body?.message);

  const noUser = await post('/auth/login', { email: `nobody.${STAMP}@testpump.com`, password: PASSWORD });
  ok('unknown email is rejected (401)', noUser.status === 401);

  const meUnauth = await get('/auth/me');
  ok('protected route without token returns 401', meUnauth.status === 401);

  const meBad = await get('/auth/me', 'not-a-real-token');
  ok('protected route with an invalid token returns 401', meBad.status === 401);

  const me = await get('/auth/me', tokenA);
  ok('/auth/me returns the signed-in admin', me.status === 200 && data<any>(me)?.user?.email === pumpAEmail);
  ok('password hash is never returned', !JSON.stringify(me.body).includes('passwordHash'));

  const logout = await post('/auth/logout', {}, tokenA);
  ok('logout endpoint succeeds', logout.status === 200);

  // ---------------------------------------------------------------------
  section('2. FUEL MANAGEMENT');

  const defaultFuels = items(await get('/fuels', tokenA));
  ok('registration seeds 3 configurable default fuels', Array.isArray(defaultFuels) && defaultFuels.length === 3, defaultFuels?.length);

  const fuel = data<any>(
    await post(
      '/fuels',
      { name: 'E2E Super Diesel', code: 'ESD', sellingPrice: 300, purchasePrice: 280, currentStock: 1000, minStockAlert: 200 },
      tokenA,
    ),
  );
  ok('create fuel returns 201', Boolean(fuel?._id));
  ok('opening stock is applied to the fuel', closeTo(fuel?.currentStock ?? 0, 1000), fuel?.currentStock);

  const ledgerAfterOpening = data<any>(await get('/stock/ledger', tokenA, { fuelId: String(fuel._id) }));
  ok(
    'an opening stock transaction is written to the ledger',
    ledgerAfterOpening?.items?.[0]?.type === 'opening' && closeTo(ledgerAfterOpening.items[0].quantity, 1000),
    ledgerAfterOpening?.items?.[0],
  );

  const priceUpdate = data<any>(await patch(`/fuels/${fuel._id}/price`, { sellingPrice: 310 }, tokenA));
  ok('fuel price update persists', closeTo(priceUpdate.sellingPrice, 310), priceUpdate.sellingPrice);

  const fuelUpdate = data<any>(await patch(`/fuels/${fuel._id}`, { minStockAlert: 150, name: 'E2E Super Diesel' }, tokenA));
  ok('fuel update persists', closeTo(fuelUpdate.minStockAlert, 150));

  const dupeFuel = await post(
    '/fuels',
    { name: 'e2e super diesel', sellingPrice: 100, purchasePrice: 90, currentStock: 0, minStockAlert: 0 },
    tokenA,
  );
  ok('duplicate fuel name is rejected (409)', dupeFuel.status === 409);

  // ---------------------------------------------------------------------
  section('3. SALES, CALCULATIONS & STOCK');

  const sale1 = data<any>(
    await post('/sales', { fuelId: String(fuel._id), quantity: 100, rate: 310, paymentMethod: 'cash' }, tokenA),
  );
  ok('create sale returns 201', Boolean(sale1?._id));
  ok('total = quantity × rate (100 × 310 = 31,000)', closeTo(sale1.total, 31000), sale1.total);
  ok('stock is reduced to 900 L', closeTo(sale1.remainingStock, 900), sale1.remainingStock);

  const fuelAfterSale = items(await get('/fuels', tokenA, { includeInactive: 'true' }));
  const fuelNow = fuelAfterSale.find((f: any) => f._id === String(fuel._id));
  ok('fuel currentStock reflects the sale', closeTo(fuelNow?.currentStock ?? 0, 900), fuelNow?.currentStock);

  const oversell = await post('/sales', { fuelId: String(fuel._id), quantity: 99999, rate: 310, paymentMethod: 'cash' }, tokenA);
  ok('selling more than available stock is rejected (400)', oversell.status === 400, oversell.body?.message);

  const negative = await post('/sales', { fuelId: String(fuel._id), quantity: -5, rate: 310, paymentMethod: 'cash' }, tokenA);
  ok('negative quantity is rejected (422)', negative.status === 422);

  const badMethod = await post('/sales', { fuelId: String(fuel._id), quantity: 1, rate: 310, paymentMethod: 'bitcoin' }, tokenA);
  ok('invalid payment method is rejected (422)', badMethod.status === 422);

  const cardSale = data<any>(
    await post('/sales', { fuelId: String(fuel._id), quantity: 50, rate: 310, paymentMethod: 'card' }, tokenA),
  );
  ok('card sale total = 15,500', closeTo(cardSale.total, 15500), cardSale.total);
  ok('card sale reduces stock to 850 L', closeTo(cardSale.remainingStock, 850));

  const bankSale = data<any>(
    await post('/sales', { fuelId: String(fuel._id), quantity: 10, rate: 310, paymentMethod: 'bank' }, tokenA),
  );
  ok('bank transfer sale total = 3,100', closeTo(bankSale.total, 3100));

  // ---------------------------------------------------------------------
  section('4. CUSTOMERS & CREDIT LEDGER');

  const customer = data<any>(
    await post(
      '/customers',
      { name: 'E2E ABC Transport', phone: `03${STAMP}11`, vehicleNumber: 'E2E-1234', address: 'Test address', status: 'active' },
      tokenA,
    ),
  );
  ok('create customer returns 201', Boolean(customer?._id));
  ok('new customer starts with a zero balance', closeTo(customer.currentBalance, 0));

  const creditSale = data<any>(
    await post(
      '/sales',
      { fuelId: String(fuel._id), quantity: 40, rate: 310, paymentMethod: 'credit', customerId: String(customer._id) },
      tokenA,
    ),
  );
  ok('credit sale total = 12,400', closeTo(creditSale.total, 12400), creditSale.total);

  const customerAfterCredit = data<any>(await get(`/customers/${customer._id}`, tokenA));
  ok('credit sale increases the customer balance to 12,400', closeTo(customerAfterCredit.currentBalance, 12400), customerAfterCredit.currentBalance);
  ok(
    'a credit_sale ledger entry is created',
    customerAfterCredit.transactions?.some((t: any) => t.type === 'credit_sale' && closeTo(t.amount, 12400)),
    customerAfterCredit.transactions?.[0],
  );

  const payment = data<any>(
    await post(`/customers/${customer._id}/payments`, { amount: 4000, paymentMethod: 'cash', description: 'Part payment' }, tokenA),
  );
  ok('payment reduces the balance to 8,400', closeTo(payment.balanceAfter, 8400), payment.balanceAfter);

  const customerAfterPayment = data<any>(await get(`/customers/${customer._id}`, tokenA));
  ok('ledger balance after payment is 8,400', closeTo(customerAfterPayment.currentBalance, 8400));
  ok(
    'a payment ledger entry is recorded (negative amount)',
    customerAfterPayment.transactions?.some((t: any) => t.type === 'payment' && closeTo(t.amount, -4000)),
  );

  const zeroPayment = await post(`/customers/${customer._id}/payments`, { amount: 0, paymentMethod: 'cash' }, tokenA);
  ok('zero-amount payment is rejected (422)', zeroPayment.status === 422);

  const creditNoCustomer = await post('/sales', { fuelId: String(fuel._id), quantity: 5, rate: 310, paymentMethod: 'credit' }, tokenA);
  ok('credit sale without a customer is rejected (422)', creditNoCustomer.status === 422);

  // ---------------------------------------------------------------------
  section('5. SUPPLIERS & FUEL PURCHASES');

  const supplier = data<any>(
    await post('/suppliers', { name: 'E2E Test Oil Co', phone: '021-1111111', email: 'ops@e2eoil.test', status: 'active' }, tokenA),
  );
  ok('create supplier returns 201', Boolean(supplier?._id));

  const purchaseRes = await post(
      '/purchases',
      {
        supplierId: String(supplier._id),
        fuelId: String(fuel._id),
        quantity: 500,
        purchaseRate: 285,
        invoiceNumber: `E2E-PO-${STAMP}`,
        paymentMethod: 'bank',
        notes: 'Tanker delivery',
      },
      tokenA,
    );
  const purchase = data<any>(purchaseRes);
  ok('create purchase returns 201', Boolean(purchase?._id), purchaseRes.body);
  ok('purchase total = 500 × 285 = 142,500', closeTo(purchase.totalAmount, 142500), purchase.totalAmount);
  ok('purchase increases stock from 800 to 1,300 L', closeTo(purchase.newStock, 1300), purchase.newStock);

  const purchaseNoSupplier = await post(
    '/purchases',
    { supplierId: '', fuelId: String(fuel._id), quantity: 10, purchaseRate: 100 },
    tokenA,
  );
  ok('purchase without a supplier is rejected (422)', purchaseNoSupplier.status === 422);

  const supplierDetail = data<any>(await get(`/suppliers/${supplier._id}`, tokenA));
  ok('supplier purchase history is linked', supplierDetail.totals.purchases >= 1, supplierDetail.totals);

  // ---------------------------------------------------------------------
  section('6. EXPENSES');

  const expense = data<any>(
    await post(
      '/expenses',
      { category: 'Electricity', amount: 12500, description: 'E2E monthly bill', paymentMethod: 'cash', reference: 'BILL-1' },
      tokenA,
    ),
  );
  ok('create expense returns 201', Boolean(expense?._id));

  const expenseUpdate = data<any>(await patch(`/expenses/${expense._id}`, { amount: 13000, description: 'E2E corrected bill' }, tokenA));
  ok('expense update persists', closeTo(expenseUpdate.amount, 13000));

  const expenseFilter = await get('/expenses', tokenA, { category: 'Electricity', search: 'E2E' });
  ok('expense category + search filter works', data<any>(expenseFilter).items.length >= 1, data<any>(expenseFilter)?.meta);

  const expenseFilteredOut = await get('/expenses', tokenA, { category: 'Salary' });
  ok('expense filter excludes other categories', data<any>(expenseFilteredOut).items.length === 0);

  const badExpense = await post('/expenses', { category: 'NotACategory', amount: 100 }, tokenA);
  ok('invalid expense category is rejected (422)', badExpense.status === 422);

  // ---------------------------------------------------------------------
  section('7. SHIFTS & CASH RECONCILIATION');

  // create a cashier + manager on pump A
  const cashier = data<any>(
    await post('/users', { name: 'E2E Cashier', email: `e2e.cashier.${STAMP}@testpump.com`, password: PASSWORD, role: 'cashier' }, tokenA),
  );
  const manager = data<any>(
    await post('/users', { name: 'E2E Manager', email: `e2e.manager.${STAMP}@testpump.com`, password: PASSWORD, role: 'manager' }, tokenA),
  );
  ok('admin can create a cashier account', Boolean(cashier?.id));
  ok('admin can create a manager account', Boolean(manager?.id));

  const cashierLogin = await post('/auth/login', { email: `e2e.cashier.${STAMP}@testpump.com`, password: PASSWORD });
  const tokenCashier = data<any>(cashierLogin as any)?.token as string;
  ok('cashier can sign in', cashierLogin.status === 200 && Boolean(tokenCashier));

  const managerLogin = await post('/auth/login', { email: `e2e.manager.${STAMP}@testpump.com`, password: PASSWORD });
  const tokenManager = data<any>(managerLogin as any)?.token as string;
  ok('manager can sign in', managerLogin.status === 200 && Boolean(tokenManager));

  const cashierSaleBeforeShift = await post(
    '/sales',
    { fuelId: String(fuel._id), quantity: 5, rate: 310, paymentMethod: 'cash' },
    tokenCashier,
  );
  ok('cashier cannot sell without an open shift (400)', cashierSaleBeforeShift.status === 400, cashierSaleBeforeShift.body?.message);

  const shift = data<any>(await post('/shifts/open', { openingCash: 5000, openingMeter: 1000 }, tokenCashier));
  ok('cashier can open a shift', Boolean(shift?._id) && shift.status === 'open');

  const dupeShift = await post('/shifts/open', { openingCash: 1000 }, tokenCashier);
  ok('a second open shift for the same cashier is rejected (409)', dupeShift.status === 409, dupeShift.body?.message);

  const shiftSale1 = data<any>(
    await post('/sales', { fuelId: String(fuel._id), quantity: 20, rate: 310, paymentMethod: 'cash' }, tokenCashier),
  );
  const shiftSale2 = data<any>(
    await post('/sales', { fuelId: String(fuel._id), quantity: 10, rate: 310, paymentMethod: 'cash' }, tokenCashier),
  );
  ok('cashier can record sales inside an open shift', Boolean(shiftSale1?._id) && Boolean(shiftSale2?._id));

  await post(
    '/expenses',
    { category: 'Cleaning', amount: 500, description: 'E2E shift cleaning', paymentMethod: 'cash' },
    tokenCashier,
  ).then((r) => ok('cashier cannot create expenses (403)', r.status === 403, r.status));

  const currentShift = data<any>(await get('/shifts/current', tokenCashier));
  const expectedCash = 5000 + (shiftSale1.total + shiftSale2.total) - 0;
  ok(
    'open shift totals are computed from the database',
    closeTo(currentShift.cashSales, shiftSale1.total + shiftSale2.total),
    { cashSales: currentShift.cashSales, expected: shiftSale1.total + shiftSale2.total },
  );
  ok('open shift expected cash = opening + cash sales − cash expenses', closeTo(currentShift.expectedCash, expectedCash), {
    expectedCash: currentShift.expectedCash,
    wanted: expectedCash,
  });

  const actualCash = expectedCash - 120; // simulate a 120 Rs. shortfall
  const closed = data<any>(await post(`/shifts/${shift._id}/close`, { actualCash, closingMeter: 1300 }, tokenCashier));
  ok('shift closes successfully', closed.status === 'closed');
  ok('closing difference = actual − expected', closeTo(closed.difference, -120), closed.difference);
  ok('closing actual cash is stored', closeTo(closed.actualCash, actualCash));
  ok('closing meter reading is stored', closeTo(closed.closingMeter, 1300));

  const closeAgain = await post(`/shifts/${shift._id}/close`, { actualCash: 100 }, tokenCashier);
  ok('closing an already closed shift is rejected (400)', closeAgain.status === 400);

  // ---------------------------------------------------------------------
  section('8. VOID SALE REVERSAL');

  const beforeVoidStock = items(await get('/fuels', tokenA, { includeInactive: 'true' })).find(
    (f: any) => f._id === String(fuel._id),
  ).currentStock;
  const voided = data<any>(await post(`/sales/${shiftSale1._id}/void`, { reason: 'E2E test void' }, tokenA));
  ok('sale is marked voided', voided.status === 'voided');
  const afterVoidStock = items(await get('/fuels', tokenA, { includeInactive: 'true' })).find(
    (f: any) => f._id === String(fuel._id),
  ).currentStock;
  ok(
    'voided sale returns the fuel to stock',
    closeTo(afterVoidStock, beforeVoidStock + shiftSale1.quantity),
    { beforeVoidStock, afterVoidStock, qty: shiftSale1.quantity },
  );

  const voidCredit = data<any>(await post(`/sales/${creditSale._id}/void`, { reason: 'E2E credit reversal' }, tokenA));
  ok('credit sale can be voided', voidCredit.status === 'voided');
  const customerAfterVoid = data<any>(await get(`/customers/${customer._id}`, tokenA));
  // The sale added 12,400 and the customer already paid 4,000, so reversing the
  // full sale leaves a -4,000 credit balance (the pump owes the customer).
  ok(
    'voiding a credit sale reverses the full credit amount (8,400 − 12,400 = −4,000)',
    closeTo(customerAfterVoid.currentBalance, -4000),
    customerAfterVoid.currentBalance,
  );
  ok(
    'the credit ledger records the reversal',
    customerAfterVoid.transactions?.some((t: any) => t.type === 'payment' && closeTo(t.amount, -12400)),
    customerAfterVoid.transactions?.[0],
  );

  // ---------------------------------------------------------------------
  section('9. STOCK LEDGER & ADJUSTMENTS');

  // both voids above returned fuel to stock, so read the level again
  const stockBeforeAdjust = items(await get('/fuels', tokenA, { includeInactive: 'true' })).find(
    (f: any) => f._id === String(fuel._id),
  ).currentStock;
  const adjustment = data<any>(
    await post('/stock/adjust', { fuelId: String(fuel._id), type: 'adjustment', quantity: -5, notes: 'E2E dip correction' }, tokenA),
  );
  ok('stock adjustment is applied', closeTo(adjustment.balanceAfter, stockBeforeAdjust - 5), adjustment.balanceAfter);

  const overview = data<any>(await get('/stock/overview', tokenA));
  const overviewRow = overview.rows.find((r: any) => r._id === String(fuel._id));
  ok('stock overview shows the adjusted level', closeTo(overviewRow.currentStock, stockBeforeAdjust - 5), overviewRow?.currentStock);
  ok('low-stock flag is computed from the minimum alert', typeof overviewRow.lowStock === 'boolean');

  const reconcile = data<any>(await get('/fuels/reconcile', tokenA));
  const reconcileRow = reconcile.rows.find((r: any) => r.name === 'E2E Super Diesel');
  ok('live stock matches the movement ledger', Math.abs(reconcileRow.difference) < 0.001, reconcileRow);

  // ---------------------------------------------------------------------
  section('10. DASHBOARD (live values)');

  const dash = data<any>(await get('/dashboard', tokenA, { range: 'this_month' }));
  ok('dashboard returns KPIs', typeof dash.kpis?.totalSales === 'number');
  const activeSales = [sale1, cardSale, bankSale, shiftSale2].reduce((a, s) => a + s.total, 0);
  ok(
    "dashboard total sales matches the non-voided sales created in this test",
    closeTo(dash.kpis.totalSales, activeSales, 0.5),
    { dashboard: dash.kpis.totalSales, expected: activeSales },
  );
  ok(
    'dashboard credit outstanding matches the customer ledger (−4,000 credit balance)',
    closeTo(dash.kpis.creditOutstanding, -4000),
    dash.kpis.creditOutstanding,
  );
  ok('dashboard Estimated Profit = gross profit − expenses (centralized formula)', closeTo(dash.kpis.estimatedProfit, dash.kpis.grossProfit - dash.kpis.expenses, 0.02), { estimated: dash.kpis.estimatedProfit, gross: dash.kpis.grossProfit, expenses: dash.kpis.expenses });
  ok('dashboard profit label is exactly "Estimated Profit"', dash.kpis.profitLabel === 'Estimated Profit', dash.kpis.profitLabel);
  ok('dashboard Estimated Profit = revenue − fuel cost − expenses', closeTo(dash.kpis.estimatedProfit, dash.kpis.totalSales - dash.kpis.costOfSales - dash.kpis.expenses, 0.02), { estimated: dash.kpis.estimatedProfit, revenue: dash.kpis.totalSales, cost: dash.kpis.costOfSales, expenses: dash.kpis.expenses });
  ok('dashboard stock rows carry capacity and a status', (dash.stock ?? []).every((s: any) => typeof s.capacity === 'number' && ['Normal', 'Low Stock', 'Critical'].includes(s.status)), (dash.stock ?? []).map((s: any) => `${s.name}:${s.status}:${s.capacity}`));
  ok('dashboard includes a fuel breakdown', Array.isArray(dash.fuelBreakdown) && dash.fuelBreakdown.length > 0);
  ok('dashboard includes a sales trend series', Array.isArray(dash.salesTrend));
  ok('dashboard includes an expense breakdown', Array.isArray(dash.expenseBreakdown));
  ok('dashboard stock levels come from the database', Array.isArray(dash.stock) && dash.stock.length > 0);

  // ---------------------------------------------------------------------
  section('11. REPORTS (all types, all ranges)');

  const ranges = ['today', 'yesterday', 'this_week', 'this_month', 'this_year'];
  for (const r of ranges) {
    const rep = await get('/reports/sales', tokenA, { range: r });
    ok(`sales report — ${r}`, rep.status === 200 && Array.isArray(data<any>(rep).rows));
  }
  const custom = await get('/reports/sales', tokenA, {
    range: 'custom',
    from: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  ok('sales report — custom date range', custom.status === 200 && Array.isArray(data<any>(custom).rows));

  for (const [type, label] of [
    ['expenses', 'expense report'],
    ['fuel', 'fuel report'],
    ['stock', 'stock report'],
    ['customers', 'customer credit report'],
    ['shifts', 'shift report'],
    ['profit', 'profit & loss summary'],
  ] as const) {
    const rep = await get(`/reports/${type}`, tokenA, { range: 'this_month' });
    const body = data<any>(rep);
    ok(`${label} returns rows`, rep.status === 200 && Array.isArray(body.rows), body?.rows?.length);
  }

  const grouped = await get('/reports/sales', tokenA, { range: 'this_year', groupBy: 'month' });
  ok('sales report groups by month when asked', data<any>(grouped).groupBy === 'month' && Array.isArray(data<any>(grouped).rows));

  const detailed = await get('/reports/sales', tokenA, { range: 'this_month', groupBy: 'none' });
  ok('sales report can return individual records', data<any>(detailed).columns.some((c: any) => c.key === 'invoice'));

  const profit = data<any>(await get('/reports/profit', tokenA, { range: 'this_month' }));
  const revenueLine = profit.rows.find((r: any) => r.line === 'Sales Revenue');
  const costLine = profit.rows.find((r: any) => r.line === 'Less: Cost of Fuel Sold');
  const netLine = profit.rows.find((r: any) => r.line === 'Estimated Profit');
  ok('P&L revenue matches dashboard sales', closeTo(revenueLine.amount, dash.kpis.totalSales, 0.5), {
    report: revenueLine.amount,
    dashboard: dash.kpis.totalSales,
  });
  ok('P&L net = revenue − cost − expenses', closeTo(netLine.amount, revenueLine.amount + costLine.amount - dash.kpis.expenses, 0.05), {
    net: netLine.amount,
    revenue: revenueLine.amount,
    cost: costLine.amount,
    expenses: dash.kpis.expenses,
  });

  const stockReport = data<any>(await get('/reports/stock', tokenA, { range: 'this_month' }));
  const stockRow = stockReport.rows.find((r: any) => r.fuel === 'E2E Super Diesel');
  ok(
    'stock report closing = opening + purchases − sales + adjustments',
    closeTo(stockRow.closing, stockRow.opening + stockRow.purchased - stockRow.sold + stockRow.adjustments, 0.02),
    stockRow,
  );

  const fuelReport = data<any>(await get('/reports/fuel', tokenA, { range: 'this_month' }));
  const fuelRow = fuelReport.rows.find((r: any) => r.fuel === 'E2E Super Diesel');
  ok('fuel report shows liters sold', fuelRow.litersSold > 0, fuelRow);
  ok('fuel report shows the live current stock', closeTo(fuelRow.currentStock, stockBeforeAdjust - 5), fuelRow?.currentStock);

  // ---------------------------------------------------------------------
  section('12. EXPORTS — CSV / XLSX / PDF');

  for (const format of ['csv', 'xlsx', 'pdf'] as const) {
    const res = await call<ArrayBuffer>('GET', '/reports/sales/export', {
      token: tokenA,
      params: { range: 'this_month', groupBy: 'none', format },
      raw: true,
    });
    const buf = Buffer.from(res.body);
    const file = path.join(OUT_DIR, `e2e-sales.${format}`);
    fs.writeFileSync(file, buf);
    ok(`${format.toUpperCase()} export returns 200`, res.status === 200);
    ok(`${format.toUpperCase()} export is not empty`, buf.length > 200, buf.length);

    if (format === 'csv') {
      const text = buf.toString('utf8');
      ok('CSV contains the pump name', text.includes(pumpAName), text.slice(0, 120));
      ok('CSV contains the report title', text.toLowerCase().includes('sales report'));
      ok('CSV contains a TOTAL row', text.includes('TOTAL'));
      const report = data<any>(await get('/reports/sales', tokenA, { range: 'this_month', groupBy: 'none' }));
      const dataRows = text.split('\r\n').filter((l) => l.includes('INV-'));
      ok(`CSV row count matches the API rows (${report.rows.length})`, dataRows.length === report.rows.length, {
        csv: dataRows.length,
        api: report.rows.length,
      });
      ok('CSV total matches the API revenue total', text.includes(String(Math.round(dash.kpis.totalSales * 100) / 100)) || text.includes(Math.round(dash.kpis.totalSales).toLocaleString('en-US')), dash.kpis.totalSales);
    }
    if (format === 'xlsx') {
      ok('XLSX file has the ZIP/OOXML signature', buf.subarray(0, 2).toString() === 'PK', buf.subarray(0, 4).toString());
      ok('XLSX is a valid workbook (contains [Content_Types].xml)', buf.toString('latin1').includes('[Content_Types].xml'));
    }
    if (format === 'pdf') {
      ok('PDF file has the %PDF- signature', buf.subarray(0, 5).toString() === '%PDF-', buf.subarray(0, 8).toString());
      ok('PDF file is terminated with %%EOF', buf.toString('latin1').trimEnd().endsWith('%%EOF'));
      const text = pdfText(buf);
      ok('PDF contains the report title', text.includes('Sales Report'), text.slice(0, 160));
      ok('PDF contains the pump name', text.includes('E2E Alpha Filling'), text.slice(0, 200));
      ok('PDF contains the date-range line', text.includes('Date range'));
      ok('PDF contains a TOTAL row', text.includes('TOTAL'));
    }
  }

  for (const type of ['expenses', 'fuel', 'stock', 'customers', 'shifts', 'profit'] as const) {
    const res = await call<ArrayBuffer>('GET', `/reports/${type}/export`, {
      token: tokenA,
      params: { range: 'this_month', format: 'xlsx' },
      raw: true,
    });
    const buf = Buffer.from(res.body);
    fs.writeFileSync(path.join(OUT_DIR, `e2e-${type}.xlsx`), buf);
    ok(`${type} XLSX export works`, res.status === 200 && buf.subarray(0, 2).toString() === 'PK', buf.length);
  }

  const exportNoAuth = await call<ArrayBuffer>('GET', '/reports/sales/export', { params: { format: 'csv' }, raw: true });
  ok('export without a token is rejected (401)', exportNoAuth.status === 401);

  // ---------------------------------------------------------------------
  section('13. ROLE-BASED PERMISSIONS');

  ok('cashier cannot create fuel types (403)', (await post('/fuels', { name: 'Nope', sellingPrice: 1, purchasePrice: 1, currentStock: 0, minStockAlert: 0 }, tokenCashier)).status === 403);
  ok('cashier cannot view expenses (403)', (await get('/expenses', tokenCashier)).status === 403);
  ok('cashier cannot view purchases (403)', (await get('/purchases', tokenCashier)).status === 403);
  ok('cashier cannot view suppliers (403)', (await get('/suppliers', tokenCashier)).status === 403);
  ok('cashier cannot view stock (403)', (await get('/stock/overview', tokenCashier)).status === 403);
  ok('cashier cannot manage users (403)', (await get('/users', tokenCashier)).status === 403);
  ok('cashier CAN view sales', (await get('/sales', tokenCashier)).status === 200);
  ok('cashier CAN view customers', (await get('/customers', tokenCashier)).status === 200);
  ok('cashier CAN view the sales report', (await get('/reports/sales', tokenCashier)).status === 200);
  ok('cashier cannot view the profit report (403)', (await get('/reports/profit', tokenCashier)).status === 403);

  ok('manager can create fuel types', (await post('/fuels', { name: `E2E Manager Fuel ${STAMP}`, sellingPrice: 200, purchasePrice: 180, currentStock: 100, minStockAlert: 10 }, tokenManager)).status === 201);
  ok('manager can view expenses', (await get('/expenses', tokenManager)).status === 200);
  ok('manager can view purchases', (await get('/purchases', tokenManager)).status === 200);
  ok('manager can view the profit report', (await get('/reports/profit', tokenManager)).status === 200);
  ok('manager cannot manage users (403)', (await get('/users', tokenManager)).status === 403);
  ok('manager cannot delete a fuel type (403)', (await del('/fuels/' + fuel._id, tokenManager)).status === 403);

  const userList = data<any>(await get('/users', tokenA));
  ok('user list exposes a string id for every row', userList.items.length >= 3 && userList.items.every((u: any) => typeof u.id === 'string' && u.id.length === 24), userList.items?.[0]?.id);
  ok(
    'user list never returns a password hash',
    userList.items.every((u: any) => !('passwordHash' in u) && !JSON.stringify(u).includes('$2')),
    Object.keys(userList.items?.[0] ?? {}).join(','),
  );

  // ---------------------------------------------------------------------
  section('14. MULTI-PUMP DATA ISOLATION (critical)');

  const custA = data<any>(await get('/customers', tokenA));
  const custB = data<any>(await get('/customers', tokenB));
  ok(`pump A sees only its own customer (${custA.meta.total})`, custA.items.every((c: any) => c.name.startsWith('E2E ABC')) && custA.meta.total === 1, custA.meta.total);
  ok('pump B has an empty customer list', custB.meta.total === 0, custB.meta.total);

  const salesA = data<any>(await get('/sales', tokenA));
  const salesB = data<any>(await get('/sales', tokenB));
  ok(`pump A sees only its own sales (${salesA.meta.total})`, salesA.meta.total >= 4, salesA.meta.total);
  ok('pump B sees zero sales', salesB.meta.total === 0, salesB.meta.total);

  const expA = data<any>(await get('/expenses', tokenA));
  const expB = data<any>(await get('/expenses', tokenB));
  ok('pump A expenses are not visible to pump B', expA.meta.total >= 1 && expB.meta.total === 0, { a: expA.meta.total, b: expB.meta.total });

  const fuelsA = items(await get('/fuels', tokenA, { includeInactive: 'true' }));
  const fuelsB = items(await get('/fuels', tokenB, { includeInactive: 'true' }));
  ok(
    'each pump has its own independent fuel list',
    fuelsA.some((f: any) => f.name === 'E2E Super Diesel') && !fuelsB.some((f: any) => f.name === 'E2E Super Diesel'),
  );

  const stockA = data<any>(await get('/stock/overview', tokenA));
  const stockB = data<any>(await get('/stock/overview', tokenB));
  ok('stock is isolated per pump', stockA.rows.some((r: any) => r.currentStock > 0) && stockB.totals.totalStock === 0);

  // cross-pump id probe: try to read a pump A customer with pump B's token
  const crossRead = await get(`/customers/${customer._id}`, tokenB);
  ok('pump B cannot read a pump A customer by id (404)', crossRead.status === 404, crossRead.status);

  const crossUpdate = await patch(`/customers/${customer._id}`, { name: 'Hacked' }, tokenB);
  ok('pump B cannot modify a pump A customer (404)', crossUpdate.status === 404);

  const crossSaleProbe = await post('/sales', { fuelId: String(fuel._id), quantity: 1, rate: 10, paymentMethod: 'cash' }, tokenB);
  ok('pump B cannot create a sale using a pump A fuel id (404)', crossSaleProbe.status === 404, crossSaleProbe.status);

  const dashB = data<any>(await get('/dashboard', tokenB));
  ok('pump B dashboard shows zeros', dashB.kpis.totalSales === 0 && dashB.kpis.creditOutstanding === 0, dashB.kpis);

  // also verify the demo pumps are isolated from each other
  const demoA = await post('/auth/login', { email: 'admin@alifilling.com', password: 'Admin@1234' });
  const demoB = await post('/auth/login', { email: 'admin@cityfilling.com', password: 'Admin@1234' });
  if (demoA.status === 200 && demoB.status === 200) {
    const tokenDemoA = data<any>(demoA as any).token as string;
    const tokenDemoB = data<any>(demoB as any).token as string;
    const dbDemoA = data<any>(demoA as any).pump.databaseName as string;
    const dbDemoB = data<any>(demoB as any).pump.databaseName as string;
    ok('demo pump A and B resolve to different databases', dbDemoA !== dbDemoB, { dbDemoA, dbDemoB });
    const dA = data<any>(await get('/customers', tokenDemoA));
    const dB = data<any>(await get('/customers', tokenDemoB));
    ok('demo pump A customers are distinct records from demo pump B', dA.items[0]?._id !== dB.items[0]?._id && dA.meta.total > 0 && dB.meta.total > 0, {
      a: dA.meta.total,
      b: dB.meta.total,
    });
    const salesDemoA = data<any>(await get('/sales', tokenDemoA));
    const salesDemoB = data<any>(await get('/sales', tokenDemoB));
    ok('demo pump sales totals differ (separate datasets)', salesDemoA.meta.total !== salesDemoB.meta.total, {
      a: salesDemoA.meta.total,
      b: salesDemoB.meta.total,
    });
  } else {
    ok('demo pumps are seeded and can sign in (run `npm run seed` first)', false, { demoA: demoA.status, demoB: demoB.status });
  }

  // ---------------------------------------------------------------------
  section('15. VALIDATION & ERROR HANDLING');

  ok('unknown route returns 404', (await get('/definitely-not-a-route', tokenA)).status === 404);
  ok('invalid sale id returns 404', (await get('/sales/000000000000000000000000', tokenA)).status === 404);
  const badId = await get('/sales/not-an-object-id', tokenA);
  ok('malformed id returns a clean 400 (no stack leak)', badId.status === 400, badId.body?.message);
  ok('error responses never expose a stack trace', !JSON.stringify(badId.body).includes('at '));

  const receipt = data<any>(await get(`/sales/${sale1._id}/receipt`, tokenA));
  ok('receipt includes the pump name', receipt.pump.name === pumpAName, receipt.pump?.name);
  ok('receipt includes the invoice, fuel, qty, rate and total', Boolean(receipt.sale.invoiceNumber && receipt.sale.fuelName && receipt.sale.quantity && receipt.sale.rate && receipt.sale.total));

  const paginated = data<any>(await get('/sales', tokenA, { limit: '2', page: '1' }));
  ok('pagination returns the requested page size', paginated.items.length <= 2 && paginated.meta.totalPages >= 1, paginated.meta);

  // ---------------------------------------------------------------------
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`\x1b[1mPassed: \x1b[32m${passed}\x1b[0m   Failed: \x1b[31m${failed}\x1b[0m`);
  if (failures.length) {
    console.log('\n\x1b[31mFailures:\x1b[0m');
    for (const f of failures) console.log(`  · ${f}`);
  }
  console.log(`\nExported sample files: ${OUT_DIR}`);
  console.log(`${'─'.repeat(58)}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nE2E run crashed:', err);
  process.exit(1);
});
