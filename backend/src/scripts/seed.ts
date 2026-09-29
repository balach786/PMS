/**
 * DEMO / SEED DATA
 * ----------------
 * Creates two completely separate demo petrol pumps, each with its own
 * MongoDB database, so the multi-pump data isolation can be verified.
 *
 *   npm run seed
 *
 * Pump A : Ali Filling Station  -> admin@alifilling.com   / Admin@1234
 * Pump B : City Filling Station -> admin@cityfilling.com  / Admin@1234
 *
 * Both pumps also get a manager and a cashier account.
 * Demo data is namespaced by these pump emails so it never touches real data.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMaster } from '../db/master.js';
import { getTenant, getTenantConnection } from '../db/tenant.js';
import { hashPassword } from '../utils/password.js';
import { nextInvoiceNumber, nextSequence } from '../utils/counters.js';
import { applyStockChange } from '../services/stock.service.js';
import { applyCustomerTransaction } from '../services/customer-ledger.service.js';
import { money, volume } from '../utils/number.js';

const PASSWORD = 'Admin@1234';

// deterministic pseudo random so demo data is reproducible
let seedValue = 987654321;
function rnd(): number {
  seedValue = (seedValue * 1103515245 + 12345) % 2147483648;
  return seedValue / 2147483648;
}
function between(min: number, max: number): number {
  return min + rnd() * (max - min);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

interface PumpSpec {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  scale: number; // how much demo data
}

const PUMPS: PumpSpec[] = [
  {
    businessName: 'Ali Filling Station',
    ownerName: 'Ali Raza',
    email: 'admin@alifilling.com',
    phone: '0300-1234567',
    address: 'Main Shahrah-e-Faisal, Karachi',
    scale: 1,
  },
  {
    businessName: 'City Filling Station',
    ownerName: 'Bilal Khan',
    email: 'admin@cityfilling.com',
    phone: '0321-9876543',
    address: 'Korangi Industrial Area, Karachi',
    scale: 0.6,
  },
];

const FUELS = [
  { name: 'Petrol', code: 'PET', sellingPrice: 280.5, purchasePrice: 268.2, minStockAlert: 3000, capacity: 30000, color: '#B69952' },
  { name: 'Diesel', code: 'DSL', sellingPrice: 285.75, purchasePrice: 272.4, minStockAlert: 2500, capacity: 40000, color: '#1D3B61' },
  { name: 'Hi-Octane', code: 'HOC', sellingPrice: 305.0, purchasePrice: 291.5, minStockAlert: 1200, capacity: 25000, color: '#639C14' },
];

const CUSTOMERS = [
  { name: 'ABC Transport', phone: '0301-1112233', vehicle: 'KAR-4521', address: 'SITE Town, Karachi', notes: 'Fleet customer - weekly settlement' },
  { name: 'Zahid Goods Carrier', phone: '0333-4455667', vehicle: 'KAR-8890', address: 'Baldia Town', notes: 'Prefers diesel' },
  { name: 'Sara Logistics', phone: '0345-7788990', vehicle: 'LEA-1122', address: 'Clifton', notes: '' },
  { name: 'Imran Tours', phone: '0312-3344556', vehicle: 'KAR-3311', address: 'Gulshan-e-Iqbal', notes: 'Monthly invoice' },
  { name: 'Rehman Builders', phone: '0300-9988776', vehicle: 'KHI-7721', address: 'North Nazimabad', notes: 'Generator diesel' },
];

const SUPPLIERS = [
  { name: 'Pakistan State Oil', phone: '021-111222333', email: 'sales@psopk.com', address: 'PSO House, Karachi', notes: 'Primary supplier' },
  { name: 'Shell Pakistan', phone: '021-111444555', email: 'supply@shell.pk', address: 'Clifton, Karachi', notes: '' },
  { name: 'Total Parco', phone: '021-111666777', email: 'ops@parco.pk', address: 'Korangi, Karachi', notes: 'Backup supplier' },
];

const EXPENSE_CATS = ['Electricity', 'Salary', 'Maintenance', 'Cleaning', 'Generator', 'Transport', 'Office', 'Other'];

async function seedPump(spec: PumpSpec, index: number) {
  const { Pump, Subscription } = await connectMaster();

  // --- reset existing demo pump -----------------------------------------
  const existing = await Pump.findOne({ email: spec.email }).lean();
  if (existing) {
    const conn = await getTenantConnection(existing.databaseName);
    await conn.dropDatabase().catch(() => undefined);
    await Subscription.deleteMany({ pumpId: existing._id });
    await Pump.deleteOne({ _id: existing._id });
    console.log(`  - removed previous demo pump "${existing.name}"`);
  }

  const slugBase = spec.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dbToken = spec.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/g, '');
  const databaseName = `petrolpump_${dbToken}_00${index + 1}`;

  const pump = await Pump.create({
    name: spec.businessName,
    slug: slugBase,
    databaseName,
    ownerName: spec.ownerName,
    email: spec.email,
    phone: spec.phone,
    address: spec.address,
    status: 'active',
    subscriptionStatus: 'active',
    plan: 'starter',
    loginEmails: [spec.email, `manager@${spec.email.split('@')[1]}`, `cashier@${spec.email.split('@')[1]}`],
  });
  await Subscription.create({
    pumpId: pump._id,
    plan: 'starter',
    status: 'active',
    amount: 2500,
    currency: 'PKR',
    startDate: new Date(),
  });

  const models = await getTenant(databaseName);
  const conn = await getTenantConnection(databaseName);
  const domain = spec.email.split('@')[1];

  // --- users -------------------------------------------------------------
  const passwordHash = await hashPassword(PASSWORD);
  const admin = await models.User.create({ name: spec.ownerName, email: spec.email, passwordHash, role: 'admin', active: true });
  const manager = await models.User.create({ name: `${spec.ownerName.split(' ')[0]} Manager`, email: `manager@${domain}`, passwordHash, role: 'manager', active: true });
  const cashier = await models.User.create({ name: `${spec.ownerName.split(' ')[0]} Cashier`, email: `cashier@${domain}`, passwordHash, role: 'cashier', active: true });

  // --- fuels -------------------------------------------------------------
  const fuels = [];
  for (const f of FUELS) {
    const fuel = await models.Fuel.create({ ...f, currentStock: 0, unit: 'L', status: 'active' });
    // Opening level is a fraction of the tank so the demo data is always
    // self-consistent: stock can never exceed the configured capacity.
    const capacity = Number(f.capacity ?? 0);
    const opening = capacity > 0
      ? Math.round(capacity * between(0.45, 0.65) * spec.scale)
      : Math.round(between(8000, 14000) * spec.scale);
    await applyStockChange(models, {
      fuelId: String(fuel._id),
      type: 'opening',
      quantity: opening,
      notes: 'Opening stock',
      userId: String(admin._id),
      userName: admin.name,
    });
    fuels.push(await models.Fuel.findById(fuel._id));
  }

  // --- suppliers & customers ---------------------------------------------
  const suppliers = [];
  for (const s of SUPPLIERS) suppliers.push(await models.Supplier.create({ ...s, status: 'active' }));

  const customers = [];
  for (const c of CUSTOMERS) {
    customers.push(
      await models.Customer.create({
        name: c.name,
        phone: c.phone,
        vehicleNumber: c.vehicle,
        address: c.address,
        notes: c.notes,
        currentBalance: 0,
        status: 'active',
      }),
    );
  }

  // --- 45 days of trade ---------------------------------------------------
  const DAYS = 45;
  const today = new Date();
  let totalSales = 0;
  let totalLiters = 0;

  for (let d = DAYS; d >= 1; d--) {
    const day = new Date(today);
    day.setDate(day.getDate() - d);
    day.setHours(0, 0, 0, 0);

    // two shifts per day (morning / evening)
    const shiftDefs = [
      { start: 6, end: 14, user: cashier, name: 'Morning' },
      { start: 14, end: 22, user: manager, name: 'Evening' },
    ];

    for (const def of shiftDefs) {
      const openedAt = new Date(day);
      openedAt.setHours(def.start, 0, 0, 0);
      if (d === 0 && def.start > new Date().getHours()) continue; // future shift today

      const closedAt = new Date(day);
      closedAt.setHours(def.end, 0, 0, 0);
      if (closedAt > new Date()) continue;

      const seq = await nextSequence(conn, 'shift', null);
      const shift = await models.Shift.create({
        shiftNumber: `SH-${openedAt.getFullYear()}-${String(seq).padStart(4, '0')}`,
        userId: def.user._id,
        userName: def.user.name,
        openingCash: money(between(3000, 8000)),
        openingMeter: Math.round(between(120000, 180000)),
        status: 'open',
        openedAt,
      });

      const saleCount = Math.max(3, Math.round(between(6, 16) * spec.scale));
      for (let s = 0; s < saleCount; s++) {
        const fuel = fuels[Math.floor(rnd() * fuels.length)]!;
        const saleAt = new Date(openedAt.getTime() + rnd() * (closedAt.getTime() - openedAt.getTime()));
        const quantity = volume(between(8, 65));
        const rate = money(fuel!.sellingPrice + between(-1, 1));
        const total = money(quantity * rate);
        const roll = rnd();
        let paymentMethod: 'cash' | 'card' | 'bank' | 'credit' = 'cash';
        let customer: (typeof customers)[number] | null = null;
        if (roll > 0.86) paymentMethod = 'credit';
        else if (roll > 0.68) paymentMethod = 'card';
        else if (roll > 0.58) paymentMethod = 'bank';
        if (paymentMethod === 'credit') customer = pick(customers);

        const invoiceNumber = await nextInvoiceNumber(models, conn, 'INV', null, saleAt);
        const sale = await models.Sale.create({
          invoiceNumber,
          fuelId: fuel!._id,
          fuelName: fuel!.name,
          quantity,
          rate,
          total,
          costPrice: money(fuel!.purchasePrice),
          costTotal: money(quantity * fuel!.purchasePrice),
          paymentMethod,
          customerId: customer?._id ?? null,
          customerName: customer?.name ?? null,
          shiftId: shift._id,
          userId: def.user._id,
          userName: def.user.name,
          notes: '',
          status: 'completed',
          saleAt,
        });

        await applyStockChange(models, {
          fuelId: String(fuel!._id),
          type: 'sale',
          quantity: -quantity,
          refId: String(sale._id),
          refType: 'sale',
          reference: invoiceNumber,
          notes: `Sale ${invoiceNumber}`,
          userId: String(def.user._id),
          userName: def.user.name,
          txnAt: saleAt,
        });

        if (paymentMethod === 'credit' && customer) {
          await applyCustomerTransaction(models, {
            customerId: String(customer._id),
            type: 'credit_sale',
            amount: total,
            paymentMethod: 'credit',
            description: `Credit sale ${invoiceNumber} - ${fuel!.name}`,
            saleId: String(sale._id),
            invoiceNumber,
            userId: String(def.user._id),
            userName: def.user.name,
            txnAt: saleAt,
          });
        }

        totalSales += total;
        totalLiters += quantity;
      }

      // a couple of customer payments per week
      if (rnd() > 0.7) {
        const customer = pick(customers);
        const amount = money(between(2000, 12000));
        await applyCustomerTransaction(models, {
          customerId: String(customer._id),
          type: 'payment',
          amount,
          paymentMethod: pick(['cash', 'bank'] as const),
          description: 'Payment received',
          userId: String(manager._id),
          userName: manager.name,
          txnAt: new Date(closedAt.getTime() - 3600_000),
        });
      }

      // expenses
      const expenseCount = Math.round(between(0, 2) * spec.scale);
      for (let e = 0; e < expenseCount; e++) {
        await models.Expense.create({
          category: pick(EXPENSE_CATS),
          amount: money(between(500, 6500)),
          description: pick(['Routine expense', 'Paid in cash', 'Monthly bill', 'Emergency repair', '']),
          date: new Date(openedAt.getTime() + rnd() * (closedAt.getTime() - openedAt.getTime())),
          paymentMethod: pick(['cash', 'cash', 'bank'] as const),
          addedBy: manager._id,
          addedByName: manager.name,
          shiftId: shift._id,
          status: 'active',
        });
      }

      // close the shift using live totals
      const [salesAgg] = await models.Sale.aggregate<{ revenue: number; liters: number; cash: number }>([
        { $match: { shiftId: shift._id, status: 'completed' } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total' },
            liters: { $sum: '$quantity' },
            cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
          },
        },
      ]);
      const [expAgg] = await models.Expense.aggregate<{ total: number }>([
        { $match: { status: 'active', paymentMethod: 'cash', shiftId: shift._id } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const cashSales = money(salesAgg?.cash ?? 0);
      const expenses = money(expAgg?.total ?? 0);
      const expectedCash = money(shift.openingCash + cashSales - expenses);
      const actualCash = money(expectedCash + between(-350, 350));

      shift.status = 'closed';
      shift.closedAt = closedAt;
      shift.closingMeter = shift.openingMeter + volume(salesAgg?.liters ?? 0);
      shift.totalSales = money(salesAgg?.revenue ?? 0);
      shift.totalLiters = volume(salesAgg?.liters ?? 0);
      shift.cashSales = cashSales;
      shift.cardSales = 0;
      shift.bankSales = 0;
      shift.creditSales = 0;
      shift.expenses = expenses;
      shift.expectedCash = expectedCash;
      shift.actualCash = actualCash;
      shift.difference = money(actualCash - expectedCash);
      shift.notes = def.name;
      await shift.save();
    }

    // weekly fuel purchase
    if (d % 7 === 0) {
      const index = Math.floor(rnd() * fuels.length);
      const supplier = pick(suppliers);
      // Re-read the fuel: the cached document's stock is stale after sales and
      // earlier deliveries, and a tanker can never fill more than the tank holds.
      const fuel = await models.Fuel.findById(fuels[index]!._id);
      if (!fuel) continue;
      const tankCapacity = Number(fuel.capacity ?? 0);
      const headroom =
        tankCapacity > 0 ? Math.max(0, tankCapacity - Number(fuel.currentStock ?? 0)) : Number.POSITIVE_INFINITY;
      const wanted = volume(between(6000, 12000) * spec.scale);
      const quantity = Math.min(wanted, volume(headroom));
      if (quantity <= 0) continue;
      const rate = money(fuel.purchasePrice + between(-2, 2));
      const purchase = await models.Purchase.create({
        invoiceNumber: `PO-${day.getFullYear()}-${String(1000 + d).slice(-4)}`,
        supplierId: supplier._id,
        supplierName: supplier.name,
        fuelId: fuel._id,
        fuelName: fuel.name,
        quantity,
        purchaseRate: rate,
        totalAmount: money(quantity * rate),
        date: new Date(day.setHours(9, 0, 0, 0)),
        notes: 'Tanker delivery',
        paymentMethod: 'bank',
        addedBy: admin._id,
        addedByName: admin.name,
        status: 'active',
      });
      await applyStockChange(models, {
        fuelId: String(fuel._id),
        type: 'purchase',
        quantity,
        refId: String(purchase._id),
        refType: 'purchase',
        reference: purchase.invoiceNumber,
        notes: `Purchase from ${supplier.name}`,
        userId: String(admin._id),
        userName: admin.name,
        txnAt: purchase.date,
      });
    }
  }

  // one open shift today so the dashboard shows a live shift
  const openShift = await models.Shift.findOne({ status: 'open' }).lean();
  if (!openShift) {
    const seq = await nextSequence(conn, 'shift', null);
    const openedAt = new Date();
    openedAt.setHours(Math.max(0, new Date().getHours() - 2), 0, 0, 0);
    const shift = await models.Shift.create({
      shiftNumber: `SH-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`,
      userId: cashier._id,
      userName: cashier.name,
      openingCash: 5000,
      openingMeter: 190000,
      status: 'open',
      openedAt,
      notes: 'Current shift',
    });
    // a few sales in the open shift
    for (let i = 0; i < 5; i++) {
      const fuel = fuels[Math.floor(rnd() * fuels.length)]!;
      const quantity = volume(between(10, 50));
      const rate = money(fuel.sellingPrice);
      const total = money(quantity * rate);
      const invoiceNumber = await nextInvoiceNumber(models, conn, 'INV', null);
      const sale = await models.Sale.create({
        invoiceNumber,
        fuelId: fuel._id,
        fuelName: fuel.name,
        quantity,
        rate,
        total,
        costPrice: money(fuel.purchasePrice),
        costTotal: money(quantity * fuel.purchasePrice),
        paymentMethod: 'cash',
        shiftId: shift._id,
        userId: cashier._id,
        userName: cashier.name,
        status: 'completed',
        saleAt: new Date(),
      });
      await applyStockChange(models, {
        fuelId: String(fuel._id),
        type: 'sale',
        quantity: -quantity,
        refId: String(sale._id),
        refType: 'sale',
        reference: invoiceNumber,
        notes: `Sale ${invoiceNumber}`,
        userId: String(cashier._id),
        userName: cashier.name,
      });
    }
  }

  console.log(`  + ${spec.businessName} -> ${databaseName}`);
  console.log(`      sales: ${(await models.Sale.countDocuments()).toLocaleString()}, customers: ${await models.Customer.countDocuments()}, expenses: ${await models.Expense.countDocuments()}, shifts: ${await models.Shift.countDocuments()}`);
}

async function main() {
  console.log('\nBK Petrol Pump Manager - demo seed\n');
  await connectMaster();
  for (const [i, spec] of PUMPS.entries()) {
    await seedPump(spec, i);
  }
  console.log('\nDemo accounts (password for all): %s', PASSWORD);
  console.log('  Pump A admin  : admin@alifilling.com');
  console.log('  Pump A manager: manager@alifilling.com');
  console.log('  Pump A cashier: cashier@alifilling.com');
  console.log('  Pump B admin  : admin@cityfilling.com');
  console.log('  Pump B manager: manager@cityfilling.com');
  console.log('  Pump B cashier: cashier@cityfilling.com');
  console.log('\nDone.\n');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
