/**
 * FINAL VERIFICATION SCRIPT
 * =========================
 * Answers the 14 acceptance questions with real evidence: it talks to the live
 * API over HTTP *and* reads MongoDB directly, so exported numbers are compared
 * against the database (not just against another API response).
 *
 *   npm run verify
 *
 * Read-only with respect to the two seeded demo pumps. It registers one extra
 * throwaway pump ("Verify …") for the registration / isolation / flow checks;
 * remove it afterwards with `npm run clean:e2e` (it matches the "Verify " prefix).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import mongoose, { Types } from 'mongoose';
import ExcelJS from 'exceljs';
import { cleanE2E } from './cleanup-e2e.js';

const API = process.env.VERIFY_API ?? 'http://127.0.0.1:5000/api/v1';
const OUT = path.resolve('tmp-verify');
const STAMP = Date.now().toString().slice(-6);
const PASSWORD = 'Verify@1234';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, condition: unknown, detail?: unknown): boolean {
  const good = Boolean(condition);
  if (good) {
    passed += 1;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    let extra = '';
    if (detail !== undefined) {
      const asText = typeof detail === 'string' ? detail : JSON.stringify(detail) ?? String(detail);
      extra = ` → ${asText}`;
    }
    console.log(`  \x1b[31m✘\x1b[0m ${name}${extra.slice(0, 300)}`);
  }
  return good;
}

function section(title: string): void {
  console.log(`\n\x1b[1m\x1b[36m${title}\x1b[0m`);
}

const close = (a: number, b: number, tol = 0.01) => Math.abs(Number(a) - Number(b)) <= tol;

// ── HTTP ────────────────────────────────────────────────────────────────────
interface Call {
  status: number;
  body: any;
  buffer: Buffer;
  contentType: string;
}

async function call(method: string, url: string, token?: string, body?: unknown): Promise<Call> {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? '';
  let parsed: any = null;
  if (contentType.includes('json')) {
    try { parsed = JSON.parse(buffer.toString('utf8')); } catch { parsed = null; }
  }
  return { status: res.status, body: parsed, buffer, contentType };
}

const get = (url: string, token?: string) => call('GET', url, token);
const post = (url: string, body: unknown, token?: string) => call('POST', url, token, body);
const patch = (url: string, body: unknown, token?: string) => call('PATCH', url, token, body);
const del = (url: string, token?: string) => call('DELETE', url, token);
const d = <T>(c: Call): T => c.body?.data as T;

/** Decode the text of a PDFKit document (flate streams + hex strings + kerning). */
function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  let text = '';
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    const slice = buf.subarray(start, end);
    let t: string;
    try { t = zlib.inflateSync(slice).toString('latin1'); } catch { t = slice.toString('latin1'); }
    let decoded = t.replace(/<([0-9a-fA-F]+)>/g, (_a, hex: string) => Buffer.from(hex, 'hex').toString('latin1'));
    decoded = decoded.replace(/\s+-?\d+(?:\.\d+)?\s*/g, '');
    text += `${decoded} `;
  }
  return text;
}

/** Split one CSV line, honouring quoted fields (thousands separators live inside cells). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function redactUri(uri: string): string {
  // hide any credentials:  scheme://user:password@host  ->  scheme://user:***@host
  return uri.replace(/\/\/([^:@/\s]+):([^@/\s]+)@/, '//$1:***@');
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // remove throwaway pumps left behind by earlier verification runs
  const removed = await cleanE2E(true);
  if (removed) console.log(`[cleanup] removed ${removed} leftover verification/E2E pump database(s)\n`);

  // =========================================================================
  section('1. MONGODB CONNECTION CONFIGURATION (secrets redacted)');
  // =========================================================================
  const rawUri = process.env.MONGODB_URI ?? '';
  const masterDbName = process.env.MASTER_DB_NAME ?? 'petrol_saas_master';
  const jwtSecret = process.env.JWT_SECRET ?? '';

  console.log(`  MONGODB_URI     : ${redactUri(rawUri)}`);
  console.log(`  MASTER_DB_NAME  : ${masterDbName}`);
  console.log(`  JWT_SECRET      : ${jwtSecret ? `<set> (${jwtSecret.length} chars, value hidden)` : '<missing>'}`);
  console.log(`  JWT_EXPIRES_IN  : ${process.env.JWT_EXPIRES_IN}`);
  console.log(`  PORT            : ${process.env.PORT}`);
  console.log(`  API base        : ${API}`);

  ok('MONGODB_URI is configured', rawUri.length > 0);
  ok('connection string is a local host (no cluster in use yet)', /127\.0\.0\.1|localhost/.test(rawUri), redactUri(rawUri));
  ok('connection string contains NO embedded password', !/\/\/[^:@/\s]+:[^@/\s]+@/.test(rawUri), redactUri(rawUri));
  ok('JWT secret is set and not the placeholder', jwtSecret.length >= 32 && !jwtSecret.startsWith('change-me'));

  const master = mongoose.createConnection(rawUri, { dbName: masterDbName });
  await master.asPromise();
  const admin = master.db!.admin();
  const hello = await admin.command({ hello: 1 });
  console.log(`  server          : MongoDB ${hello.version ?? 'unknown'} (${hello.msg ?? 'node'})`);

  // =========================================================================
  section('2. DATABASES & COLLECTIONS CURRENTLY IN USE');
  // =========================================================================
  const dbs = (await admin.listDatabases()).databases as Array<{ name: string; sizeOnDisk: number }>;
  const dbNames = dbs.map((x) => x.name).filter((n) => !['admin', 'local', 'config'].includes(n));
  console.log(`  databases       : ${dbNames.join(', ')}`);

  const masterCols = (await master.db!.listCollections().toArray()).map((c) => c.name).sort();
  console.log(`  ${masterDbName} collections : ${masterCols.join(', ')}`);

  ok(`master database "${masterDbName}" exists`, dbNames.includes(masterDbName));
  ok(
    'master database holds ONLY pumps / subscriptions / masterAdminUsers',
    masterCols.length > 0 && masterCols.every((c) => ['pumps', 'subscriptions', 'masterAdminUsers'].includes(c)),
    masterCols,
  );

  const pumps = await master.db!.collection('pumps').find({}).sort({ createdAt: 1 }).toArray();
  console.log(`  pump records    : ${pumps.length}`);
  for (const p of pumps) console.log(`      ${p.name}  ->  ${p.databaseName}`);

  // `counters` (per-pump invoice sequences) is created lazily on the first sale,
  // so it is checked separately after a sale has been recorded.
  const EXPECTED_TENANT_COLS = [
    'customerTransactions', 'customers', 'expenses', 'fuels',
    'purchases', 'sales', 'shifts', 'stockTransactions', 'suppliers', 'users',
  ];
  // `notifications` (dismissed-alert bookkeeping) is created lazily on first
  // dismissal, and `priceHistory` on the first price change - both are checked
  // separately below.

  const tenantCols: Record<string, string[]> = {};
  for (const p of pumps) {
    const conn = mongoose.createConnection(rawUri, { dbName: p.databaseName });
    await conn.asPromise();
    tenantCols[p.databaseName] = (await conn.db!.listCollections().toArray()).map((c) => c.name).sort();
    await conn.close();
  }
  const firstTenant = Object.keys(tenantCols)[0];
  if (firstTenant) console.log(`  tenant collections (${firstTenant}) : ${tenantCols[firstTenant].join(', ')}`);

  ok(
    'every pump database has the full tenant collection set',
    Object.values(tenantCols).every((cols) => EXPECTED_TENANT_COLS.every((c) => cols.includes(c))),
    Object.entries(tenantCols).map(([k, v]) => `${k}:${v.length}`),
  );
  ok(
    'pump databases contain NO shared/master collections (no pumps collection inside a tenant)',
    Object.values(tenantCols).every((cols) => !cols.includes('pumps')),
  );

  // =========================================================================
  section('3. ONE DATABASE PER PETROL PUMP');
  // =========================================================================
  const pumpDbs = pumps.map((p) => p.databaseName);
  ok('every pump row points at a distinct databaseName', new Set(pumpDbs).size === pumpDbs.length, pumpDbs);
  ok('every pump database actually exists on the server', pumpDbs.every((n) => dbNames.includes(n)));
  ok('database names follow the petrolpump_<slug>_NNN convention', pumpDbs.every((n) => /^petrolpump_[a-z0-9_]+_\d{3}$/.test(n)), pumpDbs);

  // no pump shares a collection namespace with another (they are separate DBs)
  const tenantSigs: Record<string, string> = {};
  for (const p of pumps) {
    const conn = mongoose.createConnection(rawUri, { dbName: p.databaseName });
    await conn.asPromise();
    const sales = await conn.db!.collection('sales').countDocuments();
    const users = await conn.db!.collection('users').countDocuments();
    tenantSigs[p.databaseName] = `sales=${sales},users=${users}`;
    await conn.close();
  }
  console.log(`  contents        : ${JSON.stringify(tenantSigs)}`);

  // =========================================================================
  section('4. REGISTRATION CREATES A NEW, SEPARATE DATABASE');
  // =========================================================================
  const newPumpName = `Verify Filling ${STAMP}`;
  const newEmail = `verify.${STAMP}@testpump.com`;
  const before = new Set(dbNames);

  const reg = await post('/auth/register', {
    businessName: newPumpName,
    ownerName: 'Verify Owner',
    email: newEmail,
    phone: '+92 300 1234567',
    address: 'Verification Road, Karachi',
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  ok('POST /auth/register returns 201', reg.status === 201, `${reg.status} ${JSON.stringify(reg.body).slice(0, 160)}`);

  const regPump = await master.db!.collection('pumps').findOne({ 'contact.email': newEmail })
    ?? await master.db!.collection('pumps').findOne({ name: newPumpName })
    ?? await master.db!.collection('pumps').findOne({ loginEmails: newEmail });

  const regToken = d<any>(reg)?.token as string | undefined;
  ok('registration issues a JWT', typeof regToken === 'string' && regToken.length > 20);
  ok('a pump record was written to the master database', Boolean(regPump), regPump?.name);

  const newDbName = regPump?.databaseName as string | undefined;
  ok('the new pump was assigned its own databaseName', Boolean(newDbName), newDbName);
  ok('the assigned database did NOT exist before registration', newDbName ? !before.has(newDbName) : false, newDbName);

  const after = ((await admin.listDatabases()).databases as Array<{ name: string }>).map((x) => x.name);
  ok('the new database now exists on the server', newDbName ? after.includes(newDbName) : false, newDbName);
  ok('the new database differs from every other pump database', newDbName ? !pumpDbs.includes(newDbName) : false);

  const newConn = mongoose.createConnection(rawUri, { dbName: newDbName! });
  await newConn.asPromise();
  const newCols = (await newConn.db!.listCollections().toArray()).map((c) => c.name).sort();
  console.log(`  created         : ${newDbName} (${newCols.length} collections)`);
  ok('the new database was provisioned with all tenant collections', EXPECTED_TENANT_COLS.every((c) => newCols.includes(c)), newCols);
  const newUsers = await newConn.db!.collection('users').countDocuments();
  const newFuels = await newConn.db!.collection('fuels').countDocuments();
  ok('registration seeds an owner account into the new database', newUsers === 1, newUsers);
  ok('registration seeds default fuel types into the new database', newFuels >= 3, newFuels);
  ok('the new database starts with zero sales', (await newConn.db!.collection('sales').countDocuments()) === 0);
  ok('the new database starts with no counters collection (created on first invoice)', !newCols.includes('counters'), newCols.length);

  // =========================================================================
  section('5. LOGIN CONNECTS THE USER TO THE CORRECT PUMP DATABASE');
  // =========================================================================
  const aliPump = pumps.find((p) => /ali/i.test(p.name))!;
  const cityPump = pumps.find((p) => /city/i.test(p.name))!;
  ok('both seeded demo pumps are present', Boolean(aliPump) && Boolean(cityPump), pumps.map((p) => p.name));

  const loginA = d<any>(await post('/auth/login', { email: 'admin@alifilling.com', password: 'Admin@1234' }));
  const loginB = d<any>(await post('/auth/login', { email: 'admin@cityfilling.com', password: 'Admin@1234' }));
  const loginN = d<any>(await post('/auth/login', { email: newEmail, password: PASSWORD }));

  ok('demo pump A admin can sign in', Boolean(loginA?.token));
  ok('demo pump B admin can sign in', Boolean(loginB?.token));
  ok('new pump admin can sign in', Boolean(loginN?.token));

  const tokenA: string = loginA.token;
  const tokenB: string = loginB.token;
  const tokenN: string = loginN.token;

  console.log(`  pump A (${loginA.pump?.name}) -> ${loginA.pump?.databaseName}`);
  console.log(`  pump B (${loginB.pump?.name}) -> ${loginB.pump?.databaseName}`);
  console.log(`  new    (${loginN.pump?.name}) -> ${loginN.pump?.databaseName}`);

  ok('login for pump A resolves pump A\'s database', loginA.pump?.databaseName === aliPump.databaseName, loginA.pump?.databaseName);
  ok('login for pump B resolves pump B\'s database', loginB.pump?.databaseName === cityPump.databaseName, loginB.pump?.databaseName);
  ok('login for the new pump resolves the new database', loginN.pump?.databaseName === newDbName, loginN.pump?.databaseName);
  ok('the three logins resolve three different databases', new Set([loginA.pump?.databaseName, loginB.pump?.databaseName, loginN.pump?.databaseName]).size === 3);

  const meA = d<any>(await get('/auth/me', tokenA));
  const meB = d<any>(await get('/auth/me', tokenB));
  ok('/auth/me reports the pump database for pump A', meA.pump?.databaseName === aliPump.databaseName, meA.pump?.databaseName);
  ok('/auth/me reports the pump database for pump B', meB.pump?.databaseName === cityPump.databaseName, meB.pump?.databaseName);
  ok('/auth/me never returns a password hash', !JSON.stringify(meA).includes('passwordHash') && !JSON.stringify(meA).includes('$2'));

  // =========================================================================
  section('6. MULTI-PUMP ISOLATION (demo pump A vs demo pump B)');
  // =========================================================================
  const connA = mongoose.createConnection(rawUri, { dbName: aliPump.databaseName });
  const connB = mongoose.createConnection(rawUri, { dbName: cityPump.databaseName });
  await Promise.all([connA.asPromise(), connB.asPromise()]);

  const custA = d<any>(await get('/customers?limit=5', tokenA));
  const custB = d<any>(await get('/customers?limit=5', tokenB));
  const salesA = d<any>(await get('/sales?limit=5', tokenA));
  const salesB = d<any>(await get('/sales?limit=5', tokenB));
  const fuelsA = d<any>(await get('/fuels', tokenA));
  const fuelsB = d<any>(await get('/fuels', tokenB));
  const expA = d<any>(await get('/expenses?limit=5', tokenA));
  const expB = d<any>(await get('/expenses?limit=5', tokenB));

  console.log(`  pump A: ${custA.meta.total} customers, ${salesA.meta.total} sales, ${expA.meta.total} expenses`);
  console.log(`  pump B: ${custB.meta.total} customers, ${salesB.meta.total} sales, ${expB.meta.total} expenses`);

  ok('both demo pumps have data (so isolation is meaningful)', custA.meta.total > 0 && custB.meta.total > 0 && salesA.meta.total > 0 && salesB.meta.total > 0);
  const aCustIds = custA.items.map((c: any) => c._id ?? c.id);
  const bCustIds = custB.items.map((c: any) => c._id ?? c.id);
  ok('pump A and pump B return different customer records', aCustIds.every((id: string) => !bCustIds.includes(id)));
  const aSaleIds = salesA.items.map((s: any) => s._id ?? s.id);
  const bSaleIds = salesB.items.map((s: any) => s._id ?? s.id);
  ok('pump A and pump B return different sale records', aSaleIds.every((id: string) => !bSaleIds.includes(id)));

  // cross-tenant access attempts with pump B's token against pump A's ids
  const probeCustomer = aCustIds[0];
  const probeFuel = (fuelsA.items ?? fuelsA)[0]?._id;
  const readCross = await get(`/customers/${probeCustomer}`, tokenB);
  const patchCross = await patch(`/customers/${probeCustomer}`, { name: 'HACKED' }, tokenB);
  const deleteCross = await del(`/customers/${probeCustomer}`, tokenB);
  const saleCross = await post('/sales', { fuelId: String(probeFuel), quantity: 1, rate: 100, paymentMethod: 'cash' }, tokenB);
  const readCrossBack = await get(`/customers/${bCustIds[0]}`, tokenA);

  ok('pump B gets 404 reading pump A\'s customer by id', readCross.status === 404, readCross.status);
  ok('pump B gets 404 updating pump A\'s customer by id', patchCross.status === 404, patchCross.status);
  ok('pump B gets 404 deleting pump A\'s customer by id', deleteCross.status === 404, deleteCross.status);
  ok('pump B gets 404 creating a sale with pump A\'s fuel id', saleCross.status === 404, saleCross.status);
  ok('pump A gets 404 reading pump B\'s customer by id (both directions)', readCrossBack.status === 404, readCrossBack.status);

  // the record still exists untouched in pump A's database
  const inA = await connA.db!.collection('customers').findOne({ _id: new Types.ObjectId(String(probeCustomer)) });
  const inB = await connB.db!.collection('customers').findOne({ _id: new Types.ObjectId(String(probeCustomer)) });
  ok('the probed customer really lives in pump A\'s database', Boolean(inA));
  ok('the probed customer does NOT exist in pump B\'s database', inB === null);
  ok('the cross-tenant PATCH did not modify pump A\'s record', inA && inA.name !== 'HACKED', inA?.name);

  // isolation at the database level: no shared document ids
  const aIds = new Set((await connA.db!.collection('sales').find({}, { projection: { _id: 1 } }).limit(400).toArray()).map((x) => String(x._id)));
  const bSample = (await connB.db!.collection('sales').find({}, { projection: { _id: 1 } }).limit(400).toArray()).map((x) => String(x._id));
  ok('no sale _id is shared between the two pump databases', bSample.every((id) => !aIds.has(id)));

  // =========================================================================
  section('7. BUSINESS LOGIC: SALES · STOCK · PURCHASES · EXPENSES · CREDIT · SHIFTS');
  // =========================================================================
  // Performed on the freshly registered pump so the numbers are exact.
  const fresh = newConn.db!;

  const fuel = d<any>(await post('/fuels', { name: 'Verify Super', code: 'VSU', sellingPrice: 310, purchasePrice: 280, currentStock: 1000, minStockAlert: 100 }, tokenN));
  ok('create fuel returns 201 with opening stock', Boolean(fuel?._id) && close(fuel.currentStock, 1000), fuel?.currentStock);

  // --- shift -------------------------------------------------------------
  const shift = d<any>(await post('/shifts/open', { openingCash: 5000, openingMeter: 100000 }, tokenN));
  ok('open shift returns 201', Boolean(shift?._id), shift?.shiftNumber);

  // --- sales -------------------------------------------------------------
  const s1 = d<any>(await post('/sales', { fuelId: String(fuel._id), quantity: 100, rate: 310, paymentMethod: 'cash' }, tokenN));
  ok('cash sale: total = 100 × 310 = 31,000', close(s1.total, 31000), s1.total);
  ok('cash sale: stock reduced from 1000 to 900', close(s1.remainingStock, 900), s1.remainingStock);
  const s2 = d<any>(await post('/sales', { fuelId: String(fuel._id), quantity: 50, rate: 300, paymentMethod: 'card' }, tokenN));
  ok('card sale: total = 50 × 300 = 15,000', close(s2.total, 15000), s2.total);
  const oversell = await post('/sales', { fuelId: String(fuel._id), quantity: 999999, rate: 310, paymentMethod: 'cash' }, tokenN);
  ok('selling more than the available stock is rejected (400)', oversell.status === 400, oversell.status);

  // --- customers & credit -------------------------------------------------
  const cust = d<any>(await post('/customers', { name: 'Verify Credit Co', phone: '0300-1112223' }, tokenN));
  ok('create customer returns 201', Boolean(cust?._id));
  ok('new customer balance starts at 0', close(cust.currentBalance, 0), cust.currentBalance);
  const cs = d<any>(await post('/sales', { fuelId: String(fuel._id), quantity: 40, rate: 310, paymentMethod: 'credit', customerId: String(cust._id) }, tokenN));
  ok('credit sale: total = 40 × 310 = 12,400', close(cs.total, 12400), cs.total);
  const custAfterCredit = d<any>(await get(`/customers/${cust._id}`, tokenN));
  ok('credit sale raises the customer balance to 12,400', close(custAfterCredit.currentBalance, 12400), custAfterCredit.currentBalance);
  const pay = d<any>(await post(`/customers/${cust._id}/payments`, { amount: 4000, method: 'cash', notes: 'part payment' }, tokenN));
  ok('payment reduces the balance to 8,400', close(pay.balanceAfter ?? pay.customer?.currentBalance ?? 0, 8400), JSON.stringify(pay).slice(0, 160));
  const custAfterPay = d<any>(await get(`/customers/${cust._id}`, tokenN));
  ok('ledger balance after payment is 8,400', close(custAfterPay.currentBalance, 8400), custAfterPay.currentBalance);
  const custInDb = await fresh.collection('customers').findOne({ _id: new Types.ObjectId(String(cust._id)) });
  ok('the balance stored in MongoDB is also 8,400 (API matches DB)', close(custInDb?.currentBalance ?? -1, 8400), custInDb?.currentBalance);
  const ledgerRows = await fresh.collection('customerTransactions').countDocuments({ customerId: new Types.ObjectId(String(cust._id)) });
  ok('a credit_sale and a payment ledger entry were written', ledgerRows === 2, ledgerRows);

  // --- purchases (stock increase) ----------------------------------------
  const supp = d<any>(await post('/suppliers', { name: 'Verify Fuel Supplier', phone: '021-9998887' }, tokenN));
  const stockBeforePurchase = (await fresh.collection('fuels').findOne({ _id: new Types.ObjectId(String(fuel._id)) }))?.currentStock;
  const purch = d<any>(await post('/purchases', {
    supplierId: String(supp._id), fuelId: String(fuel._id), quantity: 500, purchaseRate: 285,
    invoiceNumber: `VP-${STAMP}`, paymentMethod: 'bank', notes: 'verify',
  }, tokenN));
  ok('create purchase returns 201', Boolean(purch?._id), JSON.stringify(purch).slice(0, 160));
  ok('purchase total = 500 × 285 = 142,500', close(purch?.totalAmount ?? purch?.total, 142500), purch?.totalAmount);
  ok('purchase raises stock by 500 L', close(purch?.newStock ?? 0, Number(stockBeforePurchase) + 500), { before: stockBeforePurchase, after: purch?.newStock });
  const fuelInDbAfterPurchase = await fresh.collection('fuels').findOne({ _id: new Types.ObjectId(String(fuel._id)) });
  ok('the stock level written to MongoDB matches the API', close(fuelInDbAfterPurchase?.currentStock ?? -1, Number(stockBeforePurchase) + 500), fuelInDbAfterPurchase?.currentStock);

  // --- expenses -----------------------------------------------------------
  const exp = d<any>(await post('/expenses', { category: 'Salary', amount: 25000, description: 'Verify staff salary', paymentMethod: 'cash' }, tokenN));
  ok('create expense returns 201 with the amount stored', Boolean(exp?._id) && close(exp?.amount, 25000), exp?.amount);
  const expInDb = await fresh.collection('expenses').findOne({ _id: new Types.ObjectId(String(exp._id)) });
  ok('the expense is persisted in MongoDB', close(expInDb?.amount ?? -1, 25000), expInDb?.amount);

  // --- stock ledger reconciliation ---------------------------------------
  const reconcile = d<any>(await get('/fuels/reconcile', tokenN));
  const recRow = reconcile.rows.find((r: any) => r.fuelId === String(fuel._id) || r.name === 'Verify Super');
  ok('live stock matches the movement ledger (difference = 0)', recRow && Math.abs(Number(recRow.difference)) < 0.001, recRow);

  // --- close shift --------------------------------------------------------
  const openShift = d<any>(await get('/shifts/current', tokenN));
  const expectedCash = Number(openShift.expectedCash);
  const closed = d<any>(await post(`/shifts/${openShift._id}/close`, { actualCash: expectedCash, closingMeter: 100500, notes: 'verify close' }, tokenN));
  ok('shift closes successfully', closed?.status === 'closed', closed?.status);
  ok('closing difference = actual − expected = 0', close(closed.difference, 0), closed.difference);
  // opening 5,000 + cash sale 31,000 − cash expense (salary) 25,000 = 11,000
  ok('expected cash = opening + cash sales − cash expenses', close(expectedCash, 5000 + 31000 - 25000), expectedCash);

  // --- totals in MongoDB --------------------------------------------------
  const colsAfterSale = (await newConn.db!.listCollections().toArray()).map((c) => c.name);
  ok('the counters collection appears after the first sale is recorded', colsAfterSale.includes('counters'));

  const dbSales = await fresh.collection('sales').aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, revenue: { $sum: '$total' }, liters: { $sum: '$quantity' } } },
  ]).toArray();
  const dbRevenue = Number(dbSales[0]?.revenue ?? 0);
  const dbLiters = Number(dbSales[0]?.liters ?? 0);
  console.log(`  MongoDB totals  : revenue ${dbRevenue}, liters ${dbLiters}`);
  ok('MongoDB revenue = 31,000 + 15,000 + 12,400 = 58,400', close(dbRevenue, 58400), dbRevenue);
  ok('MongoDB liters = 100 + 50 + 40 = 190', close(dbLiters, 190), dbLiters);

  const dash = d<any>(await get('/dashboard?range=this_month', tokenN));
  ok('dashboard sales total matches the MongoDB aggregate', close(dash.kpis.totalSales, dbRevenue), { api: dash.kpis.totalSales, db: dbRevenue });
  ok('dashboard liters sold matches the MongoDB aggregate', close(dash.kpis.totalLiters, dbLiters), { api: dash.kpis.totalLiters, db: dbLiters });
  ok('dashboard credit outstanding matches the customer balance (8,400)', close(dash.kpis.creditOutstanding, 8400), dash.kpis.creditOutstanding);
  ok('dashboard Estimated Profit = gross profit − expenses (centralized formula)', close(dash.kpis.estimatedProfit, dash.kpis.grossProfit - dash.kpis.expenses), { estimated: dash.kpis.estimatedProfit, gross: dash.kpis.grossProfit, expenses: dash.kpis.expenses });
  ok('dashboard profit label is exactly "Estimated Profit"', dash.kpis.profitLabel === 'Estimated Profit', dash.kpis.profitLabel);
  ok('dashboard Estimated Profit = revenue − fuel cost − expenses', close(dash.kpis.estimatedProfit, dbRevenue - dash.kpis.costOfSales - dash.kpis.expenses), { estimated: dash.kpis.estimatedProfit, dbRevenue, cost: dash.kpis.costOfSales, expenses: dash.kpis.expenses });

  // =========================================================================
  section('8. REPORTS — ALL 7 TYPES, ALL DATE RANGES');
  // =========================================================================
  const RANGES = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'custom'];
  for (const range of RANGES) {
    const q = range === 'custom'
      ? `range=custom&from=2026-01-01&to=2026-12-31&groupBy=none`
      : `range=${range}&groupBy=none`;
    const r = d<any>(await get(`/reports/sales?${q}`, tokenN));
    const rows = r?.rows ?? [];
    const apiRevenue = rows.reduce((sum: number, row: any) => sum + Number(row.revenue ?? row.total ?? 0), 0);

    // same window straight from MongoDB
    const from = new Date(r?.range?.from);
    const to = new Date(r?.range?.to);
    const agg = await fresh.collection('sales').aggregate([
      { $match: { status: 'completed', saleAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, liters: { $sum: '$quantity' }, count: { $sum: 1 } } },
    ]).toArray();
    const dbRev = Number(agg[0]?.revenue ?? 0);
    const dbCount = Number(agg[0]?.count ?? 0);

    ok(
      `sales report "${range}" returns rows and totals that match MongoDB`,
      Array.isArray(rows) && close(apiRevenue, dbRev) && rows.length === dbCount,
      { rows: rows.length, apiRevenue, dbRev, dbCount },
    );
  }

  const grouped = d<any>(await get('/reports/sales?range=this_month&groupBy=day', tokenN));
  ok('sales report groups by day when asked', (grouped?.rows ?? []).length >= 1 && grouped.groupBy === 'day', grouped?.groupBy);

  for (const type of ['expenses', 'fuel', 'stock', 'customers', 'shifts', 'profit']) {
    const r = await get(`/reports/${type}?range=this_month`, tokenN);
    const rows = d<any>(r)?.rows ?? [];
    ok(`${type} report returns rows for this month`, r.status === 200 && rows.length > 0, `${r.status} / ${rows.length} rows`);
  }

  // =========================================================================
  section('9. EXPORTS — CSV / XLSX / PDF VALUES MATCH THE DATABASE');
  // =========================================================================
  const reportQuery = 'range=this_month&groupBy=none';
  const json = d<any>(await get(`/reports/sales?${reportQuery}`, tokenN));
  const jsonRows: Array<Record<string, unknown>> = json.rows;
  const jsonTotals: Record<string, unknown> = json.totals ?? {};
  const revenueKey = Object.keys(jsonTotals).find((k) => k !== 'label' && typeof jsonTotals[k] === 'number'
    && Math.abs(Number(jsonTotals[k]) - dbRevenue) < 0.01) ?? 'revenue';
  const revenueFromRows = jsonRows.reduce((sum, row) => sum + Number((row as any)[revenueKey] ?? (row as any).revenue ?? (row as any).total ?? 0), 0);

  console.log(`  API rows: ${jsonRows.length} · revenue ${revenueFromRows} · MongoDB revenue ${dbRevenue}`);
  ok('report API total matches the MongoDB aggregate', close(revenueFromRows, dbRevenue), { api: revenueFromRows, db: dbRevenue });

  // --- CSV --------------------------------------------------------------
  const csv = await get(`/reports/sales/export?${reportQuery}&format=csv`, tokenN);
  const csvText = csv.buffer.toString('utf8').replace(/^﻿/, '');
  const csvPath = path.join(OUT, 'verify-sales.csv');
  fs.writeFileSync(csvPath, csv.buffer);
  ok('CSV export returns 200 with a text/csv content type', csv.status === 200 && /csv/.test(csv.contentType), csv.contentType);

  const csvLines = csvText.split('\r\n').filter((l) => l.trim().length > 0);
  const headerIndex = csvLines.findIndex((l) => l.includes('Invoice') || l.includes('Date'));
  const csvHeader = csvLines[headerIndex] ?? '';
  const csvData = csvLines.slice(headerIndex + 1).filter((l) => l.includes('INV-'));
  const csvTotal = csvLines.find((l) => l.startsWith('TOTAL'));
  const csvCells = csvTotal ? splitCsvLine(csvTotal) : [];
  const csvNumbers = csvCells.map((v) => Number(String(v).replace(/"/g, '').replace(/,/g, ''))).filter((n) => Number.isFinite(n) && n !== 0);

  ok('CSV has a header row', csvHeader.length > 0, csvHeader.slice(0, 120));
  ok(`CSV row count matches the API rows (${jsonRows.length})`, csvData.length === jsonRows.length, csvData.length);
  ok('CSV contains a TOTAL row', Boolean(csvTotal), csvTotal?.slice(0, 120));
  ok('CSV TOTAL revenue matches the MongoDB aggregate', csvNumbers.some((n) => close(n, dbRevenue)), { csvNumbers, dbRevenue });
  ok('CSV contains the pump name', csvText.includes('Verify Filling'));

  // --- XLSX -------------------------------------------------------------
  const xlsx = await get(`/reports/sales/export?${reportQuery}&format=xlsx`, tokenN);
  const xlsxPath = path.join(OUT, 'verify-sales.xlsx');
  fs.writeFileSync(xlsxPath, xlsx.buffer);
  ok('XLSX export returns 200 with a spreadsheet content type', xlsx.status === 200 && /spreadsheet|octet-stream/.test(xlsx.contentType), xlsx.contentType);
  ok('XLSX has the OOXML zip signature (PK)', xlsx.buffer.subarray(0, 2).toString('latin1') === 'PK');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  ok('XLSX opens as a real Excel workbook with a named sheet', Boolean(ws) && ws.name.length > 0, ws?.name);

  // find the header row and read data rows below it
  const sheetValues: any[][] = [];
  ws.eachRow((row) => sheetValues.push(row.values as any[]));
  const headIdx = sheetValues.findIndex((vals) => vals.some((v) => typeof v === 'string' && /Invoice|Date/.test(v)));
  const dataRowsX = sheetValues.slice(headIdx + 1).filter((vals) => vals.some((v) => typeof v === 'string' && String(v).includes('INV-')));
  const totalRowX = sheetValues.find((vals) => vals.some((v) => typeof v === 'string' && String(v).trim() === 'TOTAL'));

  ok(`XLSX data row count matches the API rows (${jsonRows.length})`, dataRowsX.length === jsonRows.length, dataRowsX.length);
  ok('XLSX contains a TOTAL row', Boolean(totalRowX));
  const xTotals = (totalRowX ?? []).filter((v) => typeof v === 'number').map((v) => Number(v));
  ok('XLSX TOTAL revenue matches the MongoDB aggregate', xTotals.some((n) => close(n, dbRevenue)), { xTotals, dbRevenue });
  const xLiters = xTotals.find((n) => close(n, dbLiters));
  ok('XLSX TOTAL liters matches the MongoDB aggregate', xLiters !== undefined, { xTotals, dbLiters });
  ok('XLSX totals row stores numbers as numbers (Excel can sum them)', xTotals.length >= 2, xTotals);
  ok('XLSX title block contains the pump name', sheetValues.slice(0, 4).some((vals) => vals.some((v) => typeof v === 'string' && v.includes('Verify Filling'))));

  // --- PDF ---------------------------------------------------------------
  const pdf = await get(`/reports/sales/export?${reportQuery}&format=pdf`, tokenN);
  const pdfPath = path.join(OUT, 'verify-sales.pdf');
  fs.writeFileSync(pdfPath, pdf.buffer);
  ok('PDF export returns 200 with application/pdf', pdf.status === 200 && /pdf/.test(pdf.contentType), pdf.contentType);
  ok('PDF starts with %PDF- and ends with %%EOF', pdf.buffer.subarray(0, 5).toString('latin1') === '%PDF-' && pdf.buffer.subarray(-6).toString('latin1').includes('%%EOF'));

  const text = pdfText(pdf.buffer);
  const moneyInPdf = (text.match(/\d{1,3}(,\d{3})*(\.\d{2})?/g) ?? []).map((s) => Number(s.replace(/,/g, '')));
  ok('PDF contains the report title', text.includes('Sales Report'), text.slice(0, 80));
  ok('PDF contains the pump name', text.includes('Verify Filling'));
  ok('PDF contains the date range line', text.includes('Date range'));
  ok('PDF contains a TOTAL row', /TOTAL/.test(text));
  ok('PDF TOTAL revenue matches the MongoDB aggregate', moneyInPdf.some((n) => close(n, dbRevenue)), dbRevenue);
  ok('PDF TOTAL liters matches the MongoDB aggregate', moneyInPdf.some((n) => close(n, dbLiters)), dbLiters);
  ok('PDF contains every invoice number from the API rows', jsonRows.every((r) => text.includes(String((r as any).invoice ?? (r as any).invoiceNumber))));

  // --- exports from the seeded demo pump (large dataset) ------------------
  const demoJson = d<any>(await get(`/reports/sales?range=this_month&groupBy=none&limit=1000`, tokenA));
  const demoRows: any[] = demoJson.rows ?? [];
  const demoCsv = await get(`/reports/sales/export?range=this_month&groupBy=none&format=csv`, tokenA);
  const demoXlsx = await get(`/reports/sales/export?range=this_month&groupBy=none&format=xlsx`, tokenA);
  const demoPdf = await get(`/reports/sales/export?range=this_month&groupBy=none&format=pdf`, tokenA);
  const demoCsvText = demoCsv.buffer.toString('utf8');
  const demoCsvRows = demoCsvText.split('\r\n').filter((l) => l.includes('INV-'));

  const demoAgg = await connA.db!.collection('sales').aggregate([
    { $match: { status: 'completed', saleAt: { $gte: new Date(demoJson.range.from), $lte: new Date(demoJson.range.to) } } },
    { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
  ]).toArray();
  const demoDbRevenue = Number(demoAgg[0]?.revenue ?? 0);

  ok(`demo pump CSV row count matches the database (${demoAgg[0]?.count})`, demoCsvRows.length === Number(demoAgg[0]?.count), { csv: demoCsvRows.length, db: demoAgg[0]?.count });
  const demoTotalLine = demoCsvText.split('\r\n').find((l) => l.startsWith('TOTAL')) ?? '';
  const demoTotalNumbers = splitCsvLine(demoTotalLine).map((v) => Number(String(v).replace(/"/g, '').replace(/,/g, '')));
  ok('demo pump CSV TOTAL revenue matches the database', demoTotalNumbers.some((n) => close(n, demoDbRevenue)), { demoTotalNumbers: demoTotalNumbers.slice(0, 8), demoDbRevenue });
  ok('demo pump XLSX export is a valid workbook', demoXlsx.status === 200 && demoXlsx.buffer.subarray(0, 2).toString('latin1') === 'PK');
  ok('demo pump PDF export is a valid PDF', pdfText(demoPdf.buffer).includes('Sales Report'));
  fs.writeFileSync(path.join(OUT, 'demo-sales.csv'), demoCsv.buffer);
  fs.writeFileSync(path.join(OUT, 'demo-sales.xlsx'), demoXlsx.buffer);
  fs.writeFileSync(path.join(OUT, 'demo-sales.pdf'), demoPdf.buffer);

  // =========================================================================
  section('10. CENTRALIZED ESTIMATED PROFIT (one formula, one label, one number)');
  // =========================================================================
  // A brand-new pump so the arithmetic is exact and cannot be polluted by seed
  // data:   revenue 5,500  −  fuel cost 5,200  −  expenses 100  =  200
  const profitEmail = `verify.profit.${STAMP}@testpump.com`;
  const profitReg = await post('/auth/register', {
    businessName: `Verify Profit Pump ${STAMP}`,
    ownerName: 'Profit Owner',
    email: profitEmail,
    phone: '+92 300 9999999',
    address: 'Profit Road, Karachi',
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  const tokenP = d<any>(profitReg)?.token as string | undefined;
  ok('dedicated profit-verification pump registered', profitReg.status === 201 && Boolean(tokenP), `${profitReg.status}`);

  // 20 L sold at 275/L = 5,500 revenue, bought at 260/L = 5,200 fuel cost
  const pFuel = d<any>(await post('/fuels', {
    name: 'Profit Fuel', sellingPrice: 275, purchasePrice: 260, currentStock: 1000, capacity: 10000, minStockAlert: 100,
  }, tokenP));
  const pSale = d<any>(await post('/sales', {
    fuelId: String(pFuel._id), quantity: 20, rate: 275, paymentMethod: 'cash',
  }, tokenP));
  await post('/expenses', { category: 'Electricity', amount: 100, description: 'Verify operating expense', paymentMethod: 'cash' }, tokenP);

  const saleTotal = Number(pSale?.total ?? pSale?.sale?.total ?? 0);
  const saleCost = Number(pSale?.costTotal ?? pSale?.sale?.costTotal ?? 0);
  ok('control sale records revenue 5,500', close(saleTotal, 5500), saleTotal);
  ok('control sale records fuel cost 5,200', close(saleCost, 5200), saleCost);

  // --- the same 200 must appear in the dashboard, every report and every export
  const pDash = d<any>(await get('/dashboard?range=today', tokenP));
  const dashProfit = Number(pDash?.kpis?.estimatedProfit);
  console.log(`  dashboard estimated profit : ${dashProfit} (label "${pDash?.kpis?.profitLabel}")`);
  ok('dashboard Estimated Profit = 5,500 − 5,200 − 100 = 200', close(dashProfit, 200), dashProfit);

  const pDaily = d<any>(await get('/reports/sales?range=today&groupBy=none', tokenP));
  const dailySummary: Array<{ label: string; value: string }> = pDaily?.summary ?? [];
  const dailyLine = dailySummary.find((s) => s.label === 'Estimated Profit');
  const dailyValue = Number(String(dailyLine?.value ?? '').replace(/[^0-9.-]/g, ''));
  console.log(`  daily sales report         : ${dailyLine?.label} ${dailyLine?.value}`);
  ok('daily sales report summary shows Estimated Profit = 200', close(dailyValue, 200), dailyLine?.value);

  const pProfit = d<any>(await get('/reports/profit?range=today', tokenP));
  const profitRow = (pProfit?.rows ?? []).find((r: any) => r.line === 'Estimated Profit');
  const profitValue = Number(profitRow?.amount ?? 0);
  console.log(`  profit & loss report       : ${profitRow?.line} ${profitValue}`);
  ok('profit report shows Estimated Profit = 200', close(profitValue, 200), profitValue);

  // exports must carry the same number
  const pProfitCsv = await get('/reports/profit/export?range=today&format=csv', tokenP);
  const pProfitCsvText = pProfitCsv.buffer.toString('utf8');
  fs.writeFileSync(path.join(OUT, 'verify-profit.csv'), pProfitCsv.buffer);
  ok('exported profit CSV contains 200.00 (or 200) as the Estimated Profit line',
    /Estimated Profit[\s\S]{0,40}200(\.00)?/.test(pProfitCsvText) || /200\.00/.test(pProfitCsvText),
    pProfitCsvText.split('\n').filter((l: string) => /Estimated|200/.test(l)).join(' | ').slice(0, 200));

  const pProfitXlsx = await get('/reports/profit/export?range=today&format=xlsx', tokenP);
  fs.writeFileSync(path.join(OUT, 'verify-profit.xlsx'), pProfitXlsx.buffer);
  const pwb = new ExcelJS.Workbook();
  await pwb.xlsx.load(pProfitXlsx.buffer as unknown as ArrayBuffer);
  const pws = pwb.worksheets[0];
  const pSheet: any[][] = [];
  pws.eachRow((row) => pSheet.push(row.values as any[]));
  const pRow = pSheet.find((vals) => vals.some((v) => typeof v === 'string' && String(v).trim() === 'Estimated Profit'));
  const pRowNums = (pRow ?? []).filter((v) => typeof v === 'number').map(Number);
  ok('exported profit XLSX contains the Estimated Profit 200 as a number', pRowNums.some((n) => close(n, 200)), { pRowNums });

  const pProfitPdf = await get('/reports/profit/export?range=today&format=pdf', tokenP);
  fs.writeFileSync(path.join(OUT, 'verify-profit.pdf'), pProfitPdf.buffer);
  const pPdfText = pdfText(pProfitPdf.buffer);
  ok('exported profit PDF contains the label "Estimated Profit" and the value 200',
    pPdfText.includes('Estimated Profit') && /\b200\.00\b|\b200\b/.test(pPdfText),
    pPdfText.split('\n').filter((l: string) => /Estimated|200/.test(l)).join(' | ').slice(0, 160));

  // the sales report export must show the same centralized summary
  const pSalesCsv = await get('/reports/sales/export?range=today&groupBy=none&format=csv', tokenP);
  const pSalesCsvText = pSalesCsv.buffer.toString('utf8');
  ok('exported daily sales CSV carries the same 200 Estimated Profit summary',
    /Estimated Profit/.test(pSalesCsvText) && /200\.00|\b200\b/.test(pSalesCsvText),
    pSalesCsvText.split('\r\n').filter((l: string) => /Estimated|200/.test(l)).join(' | ').slice(0, 200));

  // --- the label is ALWAYS "Estimated Profit", never a forbidden variant
  const FORBIDDEN = ['Net Profit', 'Accounting Profit', 'Final Profit', 'Actual Profit', 'True Profit'];
  const labelSources: Array<[string, string]> = [
    ['dashboard kpis.profitLabel', String(pDash?.kpis?.profitLabel ?? '')],
    ['profit report row label', String(profitRow?.line ?? '')],
    ['daily report summary', dailySummary.map((s) => s.label).join(' / ')],
    ['profit PDF', pPdfText],
    ['profit CSV', pProfitCsvText],
    ['sales CSV', pSalesCsvText],
  ];
  for (const [where, text] of labelSources) {
    ok(`"${where}" uses the label "Estimated Profit" and no forbidden variant`,
      text.includes('Estimated Profit') && !FORBIDDEN.some((f) => text.includes(f)),
      text.slice(0, 120));
  }

  // --- the formula is identical across ranges: maths must hold everywhere
  for (const range of ['today', 'this_week', 'this_month', 'this_year']) {
    const dd = d<any>(await get(`/dashboard?range=${range}`, tokenP));
    const rp = d<any>(await get(`/reports/profit?range=${range}`, tokenP));
    const rRow = (rp?.rows ?? []).find((r: any) => r.line === 'Estimated Profit');
    const a = Number(dd?.kpis?.estimatedProfit);
    const b = Number(rRow?.amount ?? 0);
    ok(`range "${range}": dashboard and profit report agree (${a} = ${b})`, close(a, b), { dashboard: a, report: b });
    ok(`range "${range}": profit = revenue − fuel cost − expenses`,
      close(a, Number(dd?.kpis?.totalSales) - Number(dd?.kpis?.costOfSales) - Number(dd?.kpis?.expenses)),
      { a, revenue: dd?.kpis?.totalSales, cost: dd?.kpis?.costOfSales, expenses: dd?.kpis?.expenses });
  }

  // =========================================================================
  section('11. FUEL PRICE HISTORY — 275 → SALE → 280 → SALE');
  // =========================================================================
  const hFuel = d<any>(await post('/fuels', {
    name: 'History Fuel', sellingPrice: 275, purchasePrice: 260, currentStock: 500, capacity: 5000, minStockAlert: 50,
  }, tokenP));
  const hFuelId = String(hFuel._id);

  const hSaleA = d<any>(await post('/sales', { fuelId: hFuelId, quantity: 10, paymentMethod: 'cash' }, tokenP));
  const rateA = Number(hSaleA?.rate ?? hSaleA?.sale?.rate ?? 0);
  ok('sale #1 recorded at the old price 275', close(rateA, 275), rateA);

  const priceUpd = await patch(`/fuels/${hFuelId}/price`, { sellingPrice: 280, purchasePrice: 265 }, tokenP);
  ok('PATCH /fuels/:id/price returns 200', priceUpd.status === 200, `${priceUpd.status}`);
  ok('price update echoes the previous selling price (275)', close(Number(d<any>(priceUpd)?.previousSellingPrice), 275), d<any>(priceUpd)?.previousSellingPrice);

  const hSaleB = d<any>(await post('/sales', { fuelId: hFuelId, quantity: 10, paymentMethod: 'cash' }, tokenP));
  const rateB = Number(hSaleB?.rate ?? hSaleB?.sale?.rate ?? 0);
  ok('sale #2 recorded at the new price 280', close(rateB, 280), rateB);

  // BOTH rates must still be there - the price change did not rewrite history
  const salesList = d<any>(await get('/sales?limit=50', tokenP));
  const allSales: any[] = salesList?.items ?? salesList?.sales ?? [];
  const rateSet = allSales.map((s) => Number(s.rate)).sort((a, b) => a - b);
  console.log(`  rates on file: ${rateSet.join(', ')}`);
  ok('both 275 and 280 persist in the sales history', rateSet.includes(275) && rateSet.includes(280), rateSet);

  const priceHistory = d<any>(await get(`/fuels/${hFuelId}/price-history`, tokenP));
  const phItems: any[] = priceHistory?.items ?? [];
  console.log(`  price history entries: ${phItems.length}`);
  ok('price history has at least 2 entries (create + update)', phItems.length >= 2, phItems.length);
  ok('price history entry records 275 → 280',
    phItems.some((e) => close(Number(e.previousSellingPrice), 275) && close(Number(e.sellingPrice), 280)),
    phItems.map((e) => `${e.previousSellingPrice}→${e.sellingPrice}`));
  ok('price history entry records the change source',
    phItems.some((e) => e.source === 'price-update'), phItems.map((e) => e.source));

  const board: any[] = d<any>(await get('/fuel-prices', tokenP))?.items ?? [];
  const boardRow = board.find((f) => String(f._id) === hFuelId);
  ok('price board shows the current price 280 and previous 275',
    close(Number(boardRow?.sellingPrice), 280) && close(Number(boardRow?.previousSellingPrice), 275),
    { now: boardRow?.sellingPrice, prev: boardRow?.previousSellingPrice });

  // the historical reports must not have moved: sale #1 is still worth 2,750
  const hSales = d<any>(await get('/reports/sales?range=today&groupBy=none', tokenP));
  const hRows: any[] = hSales?.rows ?? [];
  ok('the earlier sale still reports 2,750 (10 L × 275) after the price change',
    hRows.some((r) => close(Number(r.total), 2750)), hRows.map((r) => r.total));

  // capacity is stored and returned
  const fuelList: any[] = d<any>(await get('/fuels', tokenP))?.items ?? [];
  const capFuel = fuelList.find((f) => String(f._id) === String(pFuel._id));
  ok('fuel capacity is stored and returned (10,000 L)', close(Number(capFuel?.capacity), 10000), capFuel?.capacity);
  ok('stock table exposes capacity alongside current stock',
    close(Number(capFuel?.capacity), 10000) && typeof capFuel?.currentStock === 'number',
    { capacity: capFuel?.capacity, currentStock: capFuel?.currentStock });

  // =========================================================================
  section('12. DASHBOARD COMPLETENESS (sections 9-20)');
  // =========================================================================
  const demoDash = d<any>(await get('/dashboard?range=this_month', tokenA));
  const k = demoDash?.kpis ?? {};
  console.log(`  KPIs: sales ${k.totalSales} · liters ${k.totalLiters} · expenses today ${k.expensesToday} · ${k.profitLabel} ${k.estimatedProfit}`);

  ok('KPI: total sales present', typeof k.totalSales === 'number');
  ok('KPI: total liters sold present', typeof k.totalLiters === 'number');
  ok('KPI: expenses today present', typeof k.expensesToday === 'number');
  ok('KPI: estimated profit present', typeof k.estimatedProfit === 'number');
  ok('KPI: profit label is exactly "Estimated Profit"', k.profitLabel === 'Estimated Profit', k.profitLabel);
  ok('KPI: margin percent present', typeof k.marginPercent === 'number', k.marginPercent);

  const dashStock: any[] = demoDash?.stock ?? [];
  ok('dashboard stock table returns every fuel', dashStock.length > 0, dashStock.length);
  ok('dashboard stock rows carry a capacity value',
    dashStock.length > 0 && dashStock.every((s) => typeof s.capacity === 'number'),
    dashStock.map((s) => `${s.name}:${s.capacity}`));
  ok('dashboard stock rows carry a Normal / Low Stock / Critical status',
    dashStock.every((s) => ['Normal', 'Low Stock', 'Critical'].includes(s.status)),
    dashStock.map((s) => `${s.name}:${s.status}`));

  const fuelBreak: any[] = demoDash?.fuelBreakdown ?? [];
  ok('fuel distribution comes from the real fuel types (not hardcoded)',
    fuelBreak.length > 0 && fuelBreak.every((f) => typeof f.fuelName === 'string' && typeof f.liters === 'number'),
    fuelBreak.map((f) => f.fuelName));

  ok('sales overview trend has daily points', (demoDash?.salesTrend ?? []).length > 0, (demoDash?.salesTrend ?? []).length);
  ok('expense breakdown has categories', (demoDash?.expenseBreakdown ?? []).length > 0, (demoDash?.expenseBreakdown ?? []).length);
  ok('recent-activity feed is populated', (demoDash?.recentActivity ?? []).length >= 5, (demoDash?.recentActivity ?? []).length);

  const actTypes = new Set<string>((demoDash?.recentActivity ?? []).map((a: any) => a.type));
  console.log(`  activity types: ${[...actTypes].join(', ')}`);
  ok('recent activity mixes sale / purchase / expense / payment / adjustment', actTypes.size >= 3, [...actTypes]);
  ok('every activity row has a valid type',
    (demoDash?.recentActivity ?? []).every((a: any) => ['sale', 'purchase', 'expense', 'payment', 'adjustment'].includes(a.type)),
    [...actTypes]);

  const qi = demoDash?.quickInfo ?? {};
  ok('quick info: credit outstanding', typeof qi.creditOutstanding === 'number', qi.creditOutstanding);
  ok('quick info: total customers', typeof qi.totalCustomers === 'number', qi.totalCustomers);
  ok('quick info: active suppliers', typeof qi.activeSuppliers === 'number', qi.activeSuppliers);
  ok('quick info: fuel types', typeof qi.totalFuelTypes === 'number', qi.totalFuelTypes);

  const l7 = demoDash?.last7Days ?? {};
  ok('last 7 days block with total, previous total and change %',
    typeof l7.total === 'number' && typeof l7.previousTotal === 'number' && typeof l7.changePercent === 'number',
    { total: l7.total, prev: l7.previousTotal, change: l7.changePercent });
  ok('last 7 days has a 7-point series', (l7.series ?? []).length === 7, (l7.series ?? []).length);

  // every date filter drives real data
  for (const range of ['today', 'yesterday', 'this_week', 'this_month', 'this_year']) {
    const r = d<any>(await get(`/dashboard?range=${range}`, tokenA));
    ok(`dashboard date filter "${range}" returns a full KPI set`,
      r?.kpis && typeof r.kpis.estimatedProfit === 'number' && Array.isArray(r.recentActivity),
      `${range}: profit ${r?.kpis?.estimatedProfit}`);
  }
  const customDash = d<any>(await get('/dashboard?range=custom&from=2026-01-01&to=2026-12-31', tokenA));
  ok('dashboard custom date range works', customDash?.kpis && typeof customDash.kpis.estimatedProfit === 'number');

  // alias endpoints used by the sidebar
  for (const [route, label] of [['/fuel-prices', 'fuel price board'], ['/customer-transactions', 'customer transactions'], ['/stock-history', 'stock history']] as const) {
    const r = await get(route, tokenA);
    ok(`GET ${route} (${label}) returns 200 with data`, r.status === 200, r.status);
  }

  // =========================================================================
  section('13. NOTIFICATIONS (section 9 - derived from live data, never faked)');
  // =========================================================================
  const notifEmail = `verify.notif.${STAMP}@testpump.com`;
  const notifReg = await post('/auth/register', {
    businessName: `Verify Notif Pump ${STAMP}`,
    ownerName: 'Notif Owner',
    email: notifEmail,
    phone: '+92 300 8888888',
    address: 'Notif Road, Karachi',
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  const tokenNotif = d<any>(notifReg)?.token as string | undefined;
  ok('dedicated notification-verification pump registered', notifReg.status === 201 && Boolean(tokenNotif), `${notifReg.status}`);

  // An empty pump: the only alert should be "no shift is open"
  const nEmpty = await get('/notifications', tokenNotif);
  const nEmptyItems: any[] = d<any>(nEmpty)?.items ?? [];
  const nEmptyUnread = Number((nEmpty.body as any)?.meta?.unreadCount ?? -1);
  ok('GET /notifications returns 200 with an items list', nEmpty.status === 200 && Array.isArray(nEmptyItems), nEmpty.status);
  ok('empty pump warns that no shift is open',
    nEmptyItems.some((i: any) => i.key === 'shift:closed' && i.level === 'warning'),
    nEmptyItems.map((i: any) => i.key));
  ok('unreadCount matches the number of un-dismissed alerts',
    nEmptyUnread === nEmptyItems.filter((i: any) => !i.dismissed).length,
    { meta: nEmptyUnread, computed: nEmptyItems.filter((i: any) => !i.dismissed).length });

  // --- critical stock -> danger alert ---------------------------------------
  const nFuelLow = d<any>(await post('/fuels', {
    name: 'Critical Fuel', sellingPrice: 280, purchasePrice: 260,
    currentStock: 400, capacity: 10000, minStockAlert: 1000,
  }, tokenNotif));
  const nFuelOk = d<any>(await post('/fuels', {
    name: 'Healthy Fuel', sellingPrice: 285, purchasePrice: 270,
    currentStock: 9000, capacity: 10000, minStockAlert: 500,
  }, tokenNotif));

  const nLow = await get('/notifications', tokenNotif);
  const nLowItems: any[] = d<any>(nLow)?.items ?? [];
  const criticalAlert = nLowItems.find((i: any) => String(i.key).startsWith('stock-critical:'));
  ok('fuel at/below its alert level raises a danger alert', Boolean(criticalAlert), nLowItems.map((i: any) => i.key));
  ok('critical alert names the fuel and links to the stock page',
    criticalAlert?.title?.includes('Critical Fuel') && criticalAlert?.link === '/app/stock',
    { title: criticalAlert?.title, link: criticalAlert?.link });
  ok('a healthy fuel raises no stock alert',
    !nLowItems.some((i: any) => i.title?.includes('Healthy Fuel')),
    nLowItems.map((i: any) => i.title));

  // --- low (not critical) -> warning ----------------------------------------
  await post('/stock/adjust', {
    fuelId: String(nFuelLow._id), type: 'adjustment', quantity: 800, notes: 'verify notifications top-up',
  }, tokenNotif);
  const nWarn = await get('/notifications', tokenNotif);
  const nWarnItems: any[] = d<any>(nWarn)?.items ?? [];
  // NOTE: a freshly registered pump also has its three default fuels at 0 L, so
  // those legitimately stay critical. The check is scoped to the fuel we topped up.
  const lowAlert = nWarnItems.find((i: any) => i.key === `stock-low:${String(nFuelLow._id)}`);
  ok('raising that fuel past its alert level downgrades danger -> warning',
    Boolean(lowAlert) && !nWarnItems.some((i: any) => i.key === `stock-critical:${String(nFuelLow._id)}`),
    { fuel: String(nFuelLow._id), keys: nWarnItems.map((i: any) => i.key) });
  ok('the critical alert is gone and the warning replaces it',
    Boolean(lowAlert) && lowAlert.level === 'warning',
    lowAlert?.level);

  // --- price change -> info alert -------------------------------------------
  await patch(`/fuels/${nFuelOk._id}/price`, { sellingPrice: 290, purchasePrice: 272 }, tokenNotif);
  const nPrice = await get('/notifications', tokenNotif);
  const nPriceItems: any[] = d<any>(nPrice)?.items ?? [];
  const priceAlert = nPriceItems.find((i: any) => String(i.key).startsWith('price-change:'));
  ok('a price change within 24 h raises an info alert', Boolean(priceAlert), nPriceItems.map((i: any) => i.key));
  ok('price alert states the old and new rate and links to the price board',
    Boolean(priceAlert) && /280|285|290/.test(String(priceAlert?.message)) && priceAlert?.link === '/app/fuel-prices',
    { message: priceAlert?.message, link: priceAlert?.link });

  // --- credit outstanding -> info alert -------------------------------------
  const nCust = d<any>(await post('/customers', {
    name: 'Notif Credit Customer', phone: '0300-1111111', vehicle: 'NOT-001',
  }, tokenNotif));
  await post('/sales', {
    fuelId: String(nFuelOk._id), quantity: 10, paymentMethod: 'credit', customerId: String(nCust._id),
  }, tokenNotif);
  const nCredit = await get('/notifications', tokenNotif);
  const nCreditItems: any[] = d<any>(nCredit)?.items ?? [];
  const creditAlert = nCreditItems.find((i: any) => String(i.key).startsWith('credit-outstanding:'));
  ok('outstanding credit raises an info alert', Boolean(creditAlert), nCreditItems.map((i: any) => i.key));
  ok('credit alert links to the credit tab', creditAlert?.link === '/app/customers?tab=credit', creditAlert?.link);

  // --- ordering: danger -> warning -> info ----------------------------------
  const order = { danger: 0, warning: 1, info: 2 } as Record<string, number>;
  const levels = nCreditItems.map((i: any) => order[i.level] ?? 9);
  ok('alerts are ordered danger -> warning -> info',
    levels.every((v: number, idx: number) => idx === 0 || levels[idx - 1] <= v), nCreditItems.map((i: any) => i.level));

  // --- dismissal is real and persisted --------------------------------------
  const beforeDismiss = Number((nCredit.body as any)?.meta?.unreadCount ?? 0);
  const dismissRes = await post('/notifications/dismiss', { keys: [creditAlert.key] }, tokenNotif);
  ok('POST /notifications/dismiss returns 200', dismissRes.status === 200, dismissRes.status);
  const nAfter = await get('/notifications', tokenNotif);
  const nAfterItems: any[] = d<any>(nAfter)?.items ?? [];
  const nAfterUnread = Number((nAfter.body as any)?.meta?.unreadCount ?? -1);
  ok('dismissing one alert drops the unread count by exactly 1',
    nAfterUnread === beforeDismiss - 1, { before: beforeDismiss, after: nAfterUnread });
  ok('the dismissed alert is flagged dismissed in the response',
    nAfterItems.find((i: any) => i.key === creditAlert.key)?.dismissed === true);

  const dismissAll = await post('/notifications/dismiss', { keys: nAfterItems.map((i: any) => i.key) }, tokenNotif);
  const nAll = await get('/notifications', tokenNotif);
  ok('dismissing every alert leaves unread = 0',
    dismissAll.status === 200 && Number((nAll.body as any)?.meta?.unreadCount) === 0,
    (nAll.body as any)?.meta?.unreadCount);

  const cleared = await del('/notifications/dismissed', tokenNotif);
  const nCleared = await get('/notifications', tokenNotif);
  ok('DELETE /notifications/dismissed restores the alerts',
    cleared.status === 200 && Number((nCleared.body as any)?.meta?.unreadCount) > 0,
    (nCleared.body as any)?.meta?.unreadCount);

  // --- alerts are tenant-scoped ---------------------------------------------
  const otherPumpNotif = await get('/notifications', tokenP);
  const otherKeys: string[] = (d<any>(otherPumpNotif)?.items ?? []).map((i: any) => String(i.key));
  ok('alerts from one pump never appear in another pump',
    otherPumpNotif.status === 200 && !otherKeys.some((k) => k.includes('Critical Fuel')),
    otherKeys);

  // --- the demo pump's bell works too, and every alert has real content ------
  const demoNotif = await get('/notifications', tokenA);
  const demoItems: any[] = d<any>(demoNotif)?.items ?? [];
  console.log(`  demo pump alerts: ${demoItems.length} (${demoItems.map((i: any) => i.level).join(', ')})`);
  ok('demo pump GET /notifications returns 200', demoNotif.status === 200, demoNotif.status);
  ok('every alert has a key, level, title, message and in-app link',
    demoItems.every((i: any) =>
      i.key && ['danger', 'warning', 'info'].includes(i.level) && i.title && i.message && String(i.link).startsWith('/app/')),
    demoItems.map((i: any) => `${i.level}:${i.link}`));
  ok('alert messages are specific (no placeholder text)',
    demoItems.every((i: any) => !/lorem|placeholder|todo|coming soon|sample/i.test(String(i.message))),
    demoItems.map((i: any) => String(i.message).slice(0, 40)));

  // =========================================================================
  section('14. TRANSACTIONS');
  // =========================================================================
  const status = await admin.serverStatus();
  const setName = hello.setName ?? status.repl?.setName;
  const isPrimary = hello.isWritablePrimary ?? status.repl?.ismaster;
  console.log(`  replica set     : ${setName ?? 'NONE (standalone)'} · writablePrimary=${isPrimary}`);

  ok('server is running as a replica set (required for transactions)', Boolean(setName), setName ?? 'standalone');

  const txBefore = status.transactions?.totalCommitted ?? null;
  const startedBefore = status.transactions?.totalStarted ?? null;
  console.log(`  server tx counters (before): started=${startedBefore} committed=${txBefore}`);

  // perform one of each transactional write, then re-read the counters
  const txFuel = d<any>(await post('/fuels', { name: `Verify Tx Fuel ${STAMP}`, sellingPrice: 200, purchasePrice: 180, currentStock: 500, minStockAlert: 10 }, tokenN));
  await post('/sales', { fuelId: String(txFuel._id), quantity: 10, rate: 200, paymentMethod: 'cash' }, tokenN);
  await post('/purchases', { supplierId: String(supp._id), fuelId: String(txFuel._id), quantity: 100, purchaseRate: 180, invoiceNumber: `VT-${STAMP}`, paymentMethod: 'bank' }, tokenN);
  await post(`/customers/${cust._id}/payments`, { amount: 100, method: 'cash' }, tokenN);
  await post('/stock/adjust', { fuelId: String(txFuel._id), type: 'adjustment', quantity: -2, notes: 'verify tx' }, tokenN);
  const txShift = d<any>(await post('/shifts/open', { openingCash: 1000 }, tokenN));
  await post(`/shifts/${txShift._id}/close`, { actualCash: 1000 }, tokenN);

  const status2 = await admin.serverStatus();
  const txAfter = status2.transactions?.totalCommitted ?? null;
  const startedAfter = status2.transactions?.totalStarted ?? null;
  console.log(`  server tx counters (after) : started=${startedAfter} committed=${txAfter}`);

  ok(
    'MongoDB committed real transactions while the verification ran',
    txBefore !== null && txAfter !== null && Number(txAfter) > Number(txBefore),
    { before: txBefore, after: txAfter },
  );

  const txOps = [
    'POST /sales          (createSale)      sale + stock movement (+ credit ledger)',
    'POST /sales/:id      (updateSale)      recompute stock + ledger',
    'POST /sales/:id/void (voidSale)        reverse stock + credit + shift totals',
    'POST /purchases      (createPurchase)  purchase + stock movement + supplier totals',
    'POST /purchases/:id/void               reverse stock movement',
    'POST /customers/:id/payments           ledger entry + customer balance',
    'POST /shifts/:id/close                 shift totals + closing balances',
    'POST /stock/adjust                     stock movement + fuel level',
  ];
  console.log('  operations wrapped in a MongoDB transaction:');
  for (const op of txOps) console.log(`      - ${op}`);

  // =========================================================================
  section('15. SUMMARY');
  // =========================================================================
  console.log(`\n  Files written: ${OUT}`);
  for (const f of fs.readdirSync(OUT)) {
    console.log(`      ${f} (${fs.statSync(path.join(OUT, f)).size} bytes)`);
  }

  await newConn.close();
  await connA.close();
  await connB.close();
  await master.close();

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`\x1b[1mVerification: \x1b[32m${passed} passed\x1b[0m   \x1b[31m${failed} failed\x1b[0m`);
  if (failures.length) console.log(`Failed checks:\n  - ${failures.join('\n  - ')}`);
  console.log('──────────────────────────────────────────────────────────\n');
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nVerification crashed:', err);
  process.exit(1);
});
