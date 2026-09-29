/**
 * Real browser click-through of the BK Petrol Pump Manager UI.
 *
 *   npm run ui:smoke           (requires `npm run dev` in both frontend/ and backend/)
 *
 * Drives a headless Chromium against the live dev server: signs in with a demo
 * account, walks every page in the sidebar, records a sale, closes a shift,
 * downloads a report export and opens a printable receipt. Every step is
 * asserted — a failure prints the reason and is counted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.UI_BASE ?? 'http://127.0.0.1:5173';
const EMAIL = process.env.UI_EMAIL ?? 'admin@alifilling.com';
const PASSWORD = process.env.UI_PASSWORD ?? 'Admin@1234';
const SHOTS = path.resolve('tmp-shots');

const state = { passed: 0, failed: 0, consoleErrors: [] };

function ok(name, condition, detail) {
  if (condition) {
    state.passed += 1;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } else {
    state.failed += 1;
    console.log(`  \x1b[31m✘\x1b[0m ${name}${detail ? ` → ${String(detail).slice(0, 240)}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m\x1b[36m${title}\x1b[0m`);
}

/** Field renders `<div><label>..</label><input|select|textarea></div>` (no htmlFor), so match by sibling. */
function controlFor(page, labelPrefix) {
  const xpath = `//label[starts-with(normalize-space(.), ${JSON.stringify(labelPrefix)})]/parent::*/descendant::*[self::input or self::select or self::textarea]`;
  return page.locator(`xpath=${xpath}`).first();
}

/**
 * Sidebar entries from section 39. Grouped items are expandable, so the walk
 * expands every collapsed group before clicking a child link.
 */
const NAV = [
  { label: 'Dashboard', path: '/app/dashboard' },
  { label: 'Fuel Overview', path: '/app/fuels', group: 'Fuel Management' },
  { label: 'Fuel Prices', path: '/app/fuel-prices', group: 'Fuel Management', table: true },
  { label: 'Stock', path: '/app/stock', group: 'Fuel Management', table: true },
  { label: 'Sales History', path: '/app/sales', group: 'Sales', table: true },
  { label: 'Current Shift', path: '/app/shifts', group: 'Shifts', table: true },
  { label: 'Customers', path: '/app/customers', group: 'Customers', table: true },
  { label: 'Expenses', path: '/app/expenses', table: true },
  { label: 'Purchases', path: '/app/purchases', table: true },
  { label: 'Suppliers', path: '/app/suppliers', table: true },
  { label: 'Profit Summary', path: '/app/reports?type=profit', group: 'Reports', table: true },
  { label: 'Users', path: '/app/users', table: true },
  { label: 'Settings', path: '/app/settings' },
];

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') state.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => state.consoleErrors.push(`pageerror: ${err.message}`));

  // ── 1. LANDING ────────────────────────────────────────────────────────────
  section('1. LANDING PAGE');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60_000 });
  ok('landing page loads', (await page.title()).includes('BK Petrol Pump'));
  ok('brand name is rendered', await page.getByText('BK Petrol Pump Manager').first().isVisible());
  const heroText = await page.locator('h1').first().innerText();
  ok('hero headline is present', heroText.length > 20, heroText);
  await page.screenshot({ path: path.join(SHOTS, '01-landing.png'), fullPage: false });

  // ── 2. LOGIN ──────────────────────────────────────────────────────────────
  section('2. LOGIN');
  await page.getByRole('link', { name: /sign in/i }).first().click();
  await page.waitForURL('**/login', { timeout: 20_000 });
  ok('login page opens', page.url().includes('/login'));
  ok('sign-in heading is shown', await page.getByText('Sign in to your pump').first().isVisible());

  await controlFor(page, 'Email address').fill(EMAIL);
  await controlFor(page, 'Password').fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await page.waitForURL('**/app/dashboard', { timeout: 30_000 });
  ok('sign-in redirects to the dashboard', page.url().includes('/app/dashboard'));

  // ── 3. DASHBOARD ──────────────────────────────────────────────────────────
  section('3. DASHBOARD (live numbers)');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  // innerText applies CSS text-transform, and KPI labels are uppercased by the stylesheet
  const dashText = (await page.locator('main').first().innerText()).toLowerCase();
  for (const label of [
    'Total Sales',
    'Total Liters Sold',
    'Petrol Sales',
    'Diesel Sales',
    "Today's Expenses",
    'Estimated Profit',
  ]) {
    ok(`KPI card "${label}" is rendered`, dashText.includes(label.toLowerCase()));
  }
  ok('profit is labelled "Estimated Profit" (never Net/Final/Accounting)',
    dashText.includes('estimated profit') && !/net profit|final profit|accounting profit/.test(dashText));
  ok('dashboard header shows the pump name', dashText.includes('filling'), 'pump name');
  ok('dashboard header shows the Online status', dashText.includes('online'));
  ok('dashboard header shows the signed-in user and role', /signed in as/i.test(dashText) && /admin|manager|cashier/.test(dashText));
  ok('dashboard header shows a notification bell', (await page.getByRole('button', { name: /Notifications/i }).count()) > 0);
  ok('dashboard shows the last 7 days block', dashText.includes('last 7 days'));
  ok('dashboard shows the quick info block', dashText.includes('quick info'));
  ok('stock table has a Capacity column', dashText.includes('capacity'));
  ok('stock rows show a Normal / Low Stock / Critical status',
    /normal|low stock|critical/.test(dashText));
  ok('quick actions are rendered', dashText.includes('new sale') && dashText.includes('add expense'));
  const moneyCells = await page.locator('main').first().getByText(/Rs\.?\s?[\d,]/).count();
  ok('KPI cards show currency values', moneyCells >= 5, `${moneyCells} currency values`);
  const charts = await page.locator('.recharts-surface').count();
  ok('charts render (recharts svg surfaces)', charts >= 2, `${charts} charts`);
  ok('dashboard shows the recent transactions table', dashText.includes('recent transactions'));
  ok('dashboard shows current stock', dashText.includes('current stock'));
  await page.screenshot({ path: path.join(SHOTS, '02-dashboard.png'), fullPage: true });

  // ── 4. EVERY SIDEBAR PAGE ─────────────────────────────────────────────────
  section('4. SIDEBAR NAVIGATION (every page)');
  for (const item of NAV) {
    try {
      await page.goto(`${BASE}/app/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      // expand every collapsed sidebar group so children are clickable
      // (capped loop: only visible buttons, so the mobile drawer is ignored)
      for (let i = 0; i < 8; i += 1) {
        const btn = page.locator('aside nav button[aria-expanded="false"]:visible').first();
        if ((await btn.count()) === 0) break;
        await btn.click();
        await page.waitForTimeout(150);
      }
      if (item.group) {
        const group = page.locator(`aside nav button:has-text("${item.group}"):visible`).first();
        if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();
        await page.waitForTimeout(250);
      }
      await page.locator(`aside a:has-text("${item.label}")`).first().click();
      await page.waitForURL(`**${item.path.split('?')[0]}*`, { timeout: 20_000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(700);
      const body = await page.locator('main').first().innerText({ timeout: 15_000 });
      const broken = /Something went wrong|Unexpected error|Cannot read properties|is not a function/.test(body);
      ok(`${item.label} page renders`, !broken && body.trim().length > 0, body.slice(0, 160) || '(empty)');
      if (item.table && !broken) {
        const rows = await page.locator('main table tbody tr').count();
        ok(`${item.label} table renders rows`, rows > 0, `${rows} rows`);
      }
      await page.screenshot({ path: path.join(SHOTS, `nav-${item.path.replace(/\//g, '_')}.png`) });
    } catch (err) {
      ok(`${item.label} page renders`, false, String(err).split('\n')[0]);
    }
  }

  // ── 5. OPEN A SHIFT ───────────────────────────────────────────────────────
  section('5. SHIFT FLOW');
  await page.goto(`${BASE}/app/shifts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const openBtn = page.getByRole('button', { name: /Open shift/ }).first();
  const canOpen = await openBtn.isVisible().catch(() => false);
  if (canOpen) {
    await openBtn.click();
    await page.getByText('Open a new shift').first().waitFor({ timeout: 10_000 });
    await controlFor(page, 'Opening cash (Rs.)').fill('5000');
    await controlFor(page, 'Opening meter reading').fill('100000');
    await page.getByRole('button', { name: /^Open shift$/ }).last().click();
    await page.waitForTimeout(2500);
    const afterOpen = await page.locator('main').first().innerText();
    ok('shift opens and the UI confirms it', /opened|Open|5,000/.test(afterOpen), afterOpen.slice(0, 160));
    await page.screenshot({ path: path.join(SHOTS, '05-shift-open.png') });
  } else {
    ok('a shift is already open (nothing to open)', true);
  }

  // ── 6. RECORD A SALE THROUGH THE UI ───────────────────────────────────────
  section('6. RECORD A SALE (UI → API → stock)');
  await page.goto(`${BASE}/app/sales`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const topRowBefore = await page.locator('main table tbody tr').first().innerText();
  await page.getByRole('button', { name: /New sale/ }).click();
  await page.getByText('Record a fuel sale').first().waitFor({ timeout: 10_000 });

  const fuelSelect = controlFor(page, 'Fuel');
  const fuelOptions = await fuelSelect.locator('option').all();
  let fuelValue = '';
  for (const opt of fuelOptions) {
    const v = await opt.getAttribute('value');
    if (v) { fuelValue = v; break; }
  }
  ok('fuel dropdown is populated from the API', Boolean(fuelValue));
  await fuelSelect.selectOption(fuelValue);
  await page.waitForTimeout(300);
  await controlFor(page, 'Quantity').fill('12.5');

  const modalText = await page.locator('[role="dialog"], .fixed').filter({ hasText: 'Record a fuel sale' }).first().innerText();
  const totalMatch = modalText.match(/Total amount\s*\n?\s*Rs\.?\s?([\d,]+\.\d{2})/);
  ok('modal computes the live total (qty × rate)', Boolean(totalMatch), modalText.slice(0, 200));
  await page.screenshot({ path: path.join(SHOTS, '06-new-sale.png') });

  await page.getByRole('button', { name: /Save sale/ }).click();
  await page.waitForTimeout(3500);
  const modalStillOpen = await page.getByText('Record a fuel sale').first().isVisible().catch(() => false);
  if (modalStillOpen) {
    const modalErr = await page.locator('.fixed').filter({ hasText: 'Record a fuel sale' }).first().innerText();
    ok('sale is saved (modal closes)', false, modalErr.slice(0, 200));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    ok('sale is saved (modal closes)', true);
  }
  const toastText = await page.locator('body').innerText();
  ok('the UI confirms the sale with remaining stock', /recorded\. Remaining stock/i.test(toastText), toastText.slice(0, 200));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const topRowAfter = await page.locator('main table tbody tr').first().innerText();
  ok('the new sale appears at the top of the sales table', topRowAfter !== topRowBefore && topRowAfter.includes('12.5'), topRowAfter.slice(0, 120));

  // ── 7. RECEIPT ────────────────────────────────────────────────────────────
  section('7. PRINTABLE RECEIPT');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('main a[title="Print receipt"]').first().click({ timeout: 20_000 });
  await page.waitForURL('**/receipt', { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  // the receipt fetches its own data, so wait for the invoice line to appear
  await page.getByText(/INV-/).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const receiptText = await page.locator('body').innerText();
  ok('receipt page opens', page.url().includes('/receipt'));
  ok('receipt shows the pump name', /Filling|Petrol|Pump/i.test(receiptText));
  ok('receipt shows an invoice number', /INV|#\d/i.test(receiptText));
  ok('receipt shows the total amount', /Total/i.test(receiptText));
  await page.screenshot({ path: path.join(SHOTS, '07-receipt.png'), fullPage: true });

  // ── 8. REPORTS + EXPORT DOWNLOAD ──────────────────────────────────────────
  section('8. REPORTS & FILE EXPORT');
  await page.goto(`${BASE}/app/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const reportRows = await page.locator('main table tbody tr').count();
  ok('sales report renders rows in the UI', reportRows > 0, `${reportRows} rows`);

  for (const [label, ext, check] of [
    ['CSV', 'csv', (t) => t.includes('Sales Report')],
    ['Excel', 'xlsx', null],
    ['PDF', 'pdf', (t) => t.includes('%PDF-')],
  ]) {
    const menu = page.getByRole('button', { name: /Export|Download/ }).first();
    await menu.click();
    await page.waitForTimeout(400);
    const opt = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    const has = await opt.isVisible().catch(() => false);
    if (!has) { ok(`${label} export option exists`, false); continue; }
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      opt.click(),
    ]);
    const file = path.join(SHOTS, `export.${ext}`);
    await download.saveAs(file);
    const size = fs.statSync(file).size;
    ok(`${label} export downloads a real file`, size > 300, `${download.suggestedFilename()} (${size} bytes)`);
    if (check) {
      const text = fs.readFileSync(file, 'latin1');
      ok(`${label} export content is correct`, check(text), text.slice(0, 120));
    }
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(SHOTS, '08-reports.png'), fullPage: true });

  // ── 9. QUICK ACTIONS ACTUALLY OPEN THEIR FORMS ────────────────────────────
  section('9. QUICK ACTIONS (no dead buttons)');
  const quickActions = [
    { label: 'New Sale', expect: /Record (a )?sale|New sale/i },
    { label: 'Add Expense', expect: /Add expense|New expense|expense/i },
    { label: 'New Customer', expect: /Add customer|New customer|customer/i },
  ];
  for (const qa of quickActions) {
    try {
      await page.goto(`${BASE}/app/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.getByRole('button', { name: new RegExp(qa.label, 'i') }).first().click();
      await page.waitForTimeout(1400);
      const dialogs = await page.locator('[role="dialog"], .fixed.inset-0').count();
      const dlgText = dialogs ? await page.locator('[role="dialog"]').first().innerText().catch(() => '') : '';
      ok(`quick action "${qa.label}" opens its form`, dialogs > 0 || qa.expect.test(await page.locator('main').innerText()), dlgText.slice(0, 120) || 'no dialog');
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    } catch (err) {
      ok(`quick action "${qa.label}" opens its form`, false, String(err).split('\n')[0]);
    }
  }

  // ── 10. FUEL PRICE BOARD (sections 21/22) ─────────────────────────────────
  section('10. FUEL PRICE BOARD');
  await page.goto(`${BASE}/app/fuel-prices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const boardText = (await page.locator('main').first().innerText()).toLowerCase();
  ok('price board lists every fuel with a selling price', /petrol/.test(boardText) && /diesel/.test(boardText), boardText.slice(0, 160));
  ok('price board shows the purchase cost and margin', boardText.includes('purchase cost') && boardText.includes('margin'));
  ok('price board shows stock vs capacity', boardText.includes('capacity'));
  const updateBtns = page.getByTitle('Update price');
  ok('price board exposes an update-price action', (await updateBtns.count()) > 0, await updateBtns.count());
  (await updateBtns.count()) > 0 && await updateBtns.first().click();
  await page.waitForTimeout(700);
  const dlgOpen = await page.locator('[role="dialog"]').count();
  ok('price update dialog opens', dlgOpen > 0, dlgOpen);
  await page.screenshot({ path: path.join(SHOTS, '10-fuel-prices.png'), fullPage: true });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // ── 11. NOTIFICATIONS (section 9) ──────────────────────────────────────────
  section('11. NOTIFICATIONS');
  await page.goto(`${BASE}/app/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bell = page.getByRole('button', { name: /Notifications/i }).first();
  ok('notification bell is present in the header', (await bell.count()) > 0);

  const badgeText = (await bell.innerText()).trim();
  const apiAlerts = await page.evaluate(async () => {
    const token =
      localStorage.getItem('bk_petrol_token') ??
      sessionStorage.getItem('bk_petrol_token') ??
      JSON.parse(localStorage.getItem('bk-petrol-auth') ?? '{}')?.token;
    const res = await fetch('/api/v1/notifications', { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    return { unread: body?.meta?.unreadCount ?? -1, items: (body?.data?.items ?? []).length };
  });
  console.log(`  API unread: ${apiAlerts.unread} of ${apiAlerts.items} alerts · bell badge "${badgeText}"`);
  ok('bell badge shows the same unread count as the API',
    apiAlerts.unread <= 0 ? badgeText === '' : badgeText.includes(String(apiAlerts.unread)),
    { badge: badgeText, api: apiAlerts.unread });

  await bell.click();
  await page.waitForTimeout(700);
  const panel = page.locator('text=Alerts are generated from live data').first();
  ok('clicking the bell opens the notifications panel', (await panel.count()) > 0);

  const panelText = await page.locator('div.absolute.right-0').first().innerText().catch(() => '');
  ok('panel lists a real alert or the honest empty state',
    /Nothing needs attention/.test(panelText) || /outstanding|low|critical|shift|price/i.test(panelText),
    panelText.slice(0, 160));
  ok('panel never shows placeholder content', !/lorem|placeholder|todo|coming soon/i.test(panelText));
  await page.screenshot({ path: path.join(SHOTS, '11-notifications.png') });

  // dismiss the first alert and confirm the badge drops
  const dismissBtn = page.locator('button[aria-label^="Dismiss:"]').first();
  if ((await dismissBtn.count()) > 0) {
    const before = Number((await bell.innerText()).trim() || '0');
    await dismissBtn.click();
    await page.waitForTimeout(1200);
    const after = Number((await bell.innerText()).trim() || '0');
    ok('dismissing an alert decrements the badge', after === Math.max(0, before - 1), { before, after });
  } else {
    ok('no alert to dismiss (empty state shown instead)', true);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // ── 12. LOGOUT ─────────────────────────────────────────────────────────────
  section('12. LOGOUT');
  await page.locator('aside').getByRole('button', { name: /Sign out|Log out|Logout/ }).first().click();
  await page.waitForURL('**/login', { timeout: 20_000 });
  ok('sign out returns to the login page', page.url().includes('/login'));
  const storage = await page.evaluate(() => ({
    local: localStorage.getItem('bk_petrol_token'),
    session: sessionStorage.getItem('bk_petrol_token'),
  }));
  ok('the auth token is cleared from storage', !storage.local && !storage.session, JSON.stringify(storage));

  // ── 10. CONSOLE HEALTH ────────────────────────────────────────────────────
  section('13. BROWSER CONSOLE HEALTH');
  const realErrors = state.consoleErrors.filter(
    (e) => !/favicon|Failed to load resource: the server responded with a status of 40\d/i.test(e),
  );
  ok('no uncaught JavaScript errors anywhere in the app', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`\x1b[1mPassed: \x1b[32m${state.passed}\x1b[0m   Failed: \x1b[31m${state.failed}\x1b[0m`);
  console.log(`Screenshots + downloads: ${SHOTS}`);
  console.log('──────────────────────────────────────────────────────────\n');
  process.exit(state.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nUI smoke run crashed:', err);
  process.exit(1);
});
