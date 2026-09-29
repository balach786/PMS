import mongoose from 'mongoose';
import type { TenantModels } from '../../models/tenant/schemas.js';
import type { DateRange } from '../../utils/dates.js';
import { formatRangeLabel } from '../../utils/dates.js';
import { money, volume } from '../../utils/number.js';
import { calculateEstimatedProfit, calculateEstimatedProfitForRange } from '../../services/profit.service.js';
import type { ReportColumn, ReportTable } from '../../utils/report.js';

export type ReportType = 'sales' | 'expenses' | 'fuel' | 'stock' | 'customers' | 'shifts' | 'profit';

export function groupFormat(groupBy: string): string {
  switch (groupBy) {
    case 'day':
      return '%Y-%m-%d';
    case 'week':
      return '%G-W%V';
    case 'month':
      return '%Y-%m';
    case 'year':
      return '%Y';
    default:
      return '%Y-%m-%d';
  }
}

export function defaultGroupBy(rangeKey: string): string {
  if (rangeKey === 'this_year' || rangeKey === 'last_year' || rangeKey === 'all') return 'month';
  return 'day';
}

interface Meta {
  pumpName: string;
  pumpAddress?: string;
  range: DateRange;
}

function base(meta: Meta, title: string, columns: ReportColumn[], rows: Array<Record<string, unknown>>, note?: string): ReportTable {
  return {
    title,
    pumpName: meta.pumpName,
    pumpAddress: meta.pumpAddress,
    rangeLabel: formatRangeLabel(meta.range),
    generatedAt: new Date(),
    columns,
    rows,
    ...(note ? { note } : {}),
  };
}

// ---------------------------------------------------------------------------
// SALES
// ---------------------------------------------------------------------------
/**
 * Profit summary block shared by every report and every export. It is produced
 * by the ONE centralized profit calculation (sections 27-30), so the dashboard,
 * each report and each export of the same period always agree.
 */
async function profitSummary(models: TenantModels, from: Date, to: Date): Promise<Array<{ label: string; value: string }>> {
  const p = await calculateEstimatedProfitForRange(models, from, to);
  return [
    { label: 'Sales Revenue', value: `PKR ${money(p.revenue).toLocaleString('en-US')}` },
    { label: 'Less: Cost of Fuel Sold', value: `-PKR ${money(p.fuelCost).toLocaleString('en-US')}` },
    { label: 'Gross Profit', value: `PKR ${money(p.grossProfit).toLocaleString('en-US')}` },
    { label: 'Less: Operating Expenses', value: `-PKR ${money(p.expenses).toLocaleString('en-US')}` },
    { label: p.label, value: `PKR ${money(p.estimatedProfit).toLocaleString('en-US')}` },
    { label: 'Estimated Margin', value: `${p.marginPercent.toFixed(1)}%` },
  ];
}

export async function salesReport(
  models: TenantModels,
  meta: Meta,
  groupBy: string,
): Promise<{ table: ReportTable; totals: Record<string, unknown> | null; summary: Array<{ label: string; value: string }> }> {
  const { from, to } = meta.range;
  const match = { status: 'completed', saleAt: { $gte: from, $lt: to } };

  if (groupBy === 'none') {
    const rows = await models.Sale.aggregate<Record<string, unknown>>([
      { $match: match },
      { $sort: { saleAt: -1 } },
      {
        $project: {
          _id: 0,
          date: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$saleAt' } },
          invoice: '$invoiceNumber',
          fuel: '$fuelName',
          liters: '$quantity',
          rate: '$rate',
          total: '$total',
          cost: '$costTotal',
          profit: { $subtract: ['$total', '$costTotal'] },
          payment: '$paymentMethod',
          customer: { $ifNull: ['$customerName', '-'] },
          cashier: '$userName',
        },
      },
    ]);
    const columns: ReportColumn[] = [
      { key: 'date', header: 'Date / Time', width: 18 },
      { key: 'invoice', header: 'Invoice', width: 20 },
      { key: 'fuel', header: 'Fuel', width: 14 },
      { key: 'liters', header: 'Liters', type: 'number', align: 'right', total: true, width: 12 },
      { key: 'rate', header: 'Rate', type: 'money', align: 'right', width: 12 },
      { key: 'total', header: 'Amount', type: 'money', align: 'right', total: true, width: 14 },
      { key: 'cost', header: 'Cost', type: 'money', align: 'right', total: true, width: 14 },
      { key: 'profit', header: 'Gross Profit', type: 'money', align: 'right', total: true, width: 14 },
      { key: 'payment', header: 'Payment', width: 12 },
      { key: 'customer', header: 'Customer', width: 18 },
      { key: 'cashier', header: 'Cashier', width: 16 },
    ];
    const table = base(meta, `Sales Report (${meta.range.label})`, columns, rows, 'Line profit is gross (amount - fuel cost). Estimated Profit below also deducts operating expenses.');
    // centralized estimated profit for the same window (sections 27-30)
    return { table, totals: null, summary: await profitSummary(models, from, to) };
  }

  const fmt = groupFormat(groupBy);
  const rows = await models.Sale.aggregate<Record<string, unknown>>([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$saleAt' } },
        liters: { $sum: '$quantity' },
        revenue: { $sum: '$total' },
        cost: { $sum: '$costTotal' },
        transactions: { $sum: 1 },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$total', 0] } },
        bank: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'bank'] }, '$total', 0] } },
        credit: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'credit'] }, '$total', 0] } },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        period: '$_id',
        transactions: 1,
        liters: 1,
        revenue: 1,
        cost: 1,
        profit: { $subtract: ['$revenue', '$cost'] },
        cash: 1,
        card: 1,
        bank: 1,
        credit: 1,
      },
    },
  ]);

  const columns: ReportColumn[] = [
    { key: 'period', header: groupBy === 'week' ? 'Week' : groupBy === 'month' ? 'Month' : groupBy === 'year' ? 'Year' : 'Date', width: 16 },
    { key: 'transactions', header: 'Sales', type: 'number', align: 'right', total: true, width: 10 },
    { key: 'liters', header: 'Liters', type: 'number', align: 'right', total: true, width: 12 },
    { key: 'revenue', header: 'Revenue', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'cost', header: 'Fuel Cost', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'profit', header: 'Gross Profit', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'cash', header: 'Cash', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'card', header: 'Card', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'bank', header: 'Bank', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'credit', header: 'Credit', type: 'money', align: 'right', total: true, width: 14 },
  ];

  const table = base(meta, `Sales Report (${meta.range.label})`, columns, rows, 'Line profit is gross (revenue - fuel cost). Estimated Profit below also deducts operating expenses.');
  return { table, totals: null, summary: await profitSummary(models, from, to) };
}

// ---------------------------------------------------------------------------
// EXPENSES
// ---------------------------------------------------------------------------
export async function expensesReport(models: TenantModels, meta: Meta, groupBy: string) {
  const { from, to } = meta.range;
  const match = { status: 'active', date: { $gte: from, $lt: to } };

  if (groupBy === 'none') {
    const rows = await models.Expense.aggregate<Record<string, unknown>>([
      { $match: match },
      { $sort: { date: -1 } },
      {
        $project: {
          _id: 0,
          date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          category: 1,
          description: { $ifNull: ['$description', '-'] },
          amount: 1,
          payment: '$paymentMethod',
          reference: { $ifNull: ['$reference', '-'] },
          addedBy: '$addedByName',
        },
      },
    ]);
    const columns: ReportColumn[] = [
      { key: 'date', header: 'Date', type: 'date', width: 14 },
      { key: 'category', header: 'Category', width: 16 },
      { key: 'description', header: 'Description', width: 30 },
      { key: 'amount', header: 'Amount', type: 'money', align: 'right', total: true, width: 14 },
      { key: 'payment', header: 'Payment', width: 12 },
      { key: 'reference', header: 'Reference', width: 16 },
      { key: 'addedBy', header: 'Added By', width: 16 },
    ];
    return { table: base(meta, `Expense Report (${meta.range.label})`, columns, rows), totals: null, summary: [] };
  }

  const rows = await models.Expense.aggregate<Record<string, unknown>>([
    { $match: match },
    { $group: { _id: { $dateToString: { format: groupFormat(groupBy), date: '$date' } }, amount: { $sum: '$amount' }, entries: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: '$_id', entries: 1, amount: 1 } },
  ]);
  const columns: ReportColumn[] = [
    { key: 'period', header: groupBy === 'month' ? 'Month' : groupBy === 'year' ? 'Year' : groupBy === 'week' ? 'Week' : 'Date', width: 16 },
    { key: 'entries', header: 'Entries', type: 'number', align: 'right', total: true, width: 12 },
    { key: 'amount', header: 'Amount', type: 'money', align: 'right', total: true, width: 16 },
  ];
  return { table: base(meta, `Expense Report (${meta.range.label})`, columns, rows), totals: null, summary: [] };
}

// ---------------------------------------------------------------------------
// FUEL (fuel-wise sales + purchases + stock)
// ---------------------------------------------------------------------------
export async function fuelReport(models: TenantModels, meta: Meta) {
  const { from, to } = meta.range;

  const [salesByFuel, purchaseByFuel, fuels] = await Promise.all([
    models.Sale.aggregate<{ _id: string; liters: number; revenue: number; cost: number; transactions: number }>([
      { $match: { status: 'completed', saleAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: '$fuelName',
          liters: { $sum: '$quantity' },
          revenue: { $sum: '$total' },
          cost: { $sum: '$costTotal' },
          transactions: { $sum: 1 },
        },
      },
    ]),
    models.Purchase.aggregate<{ _id: string; quantity: number; amount: number }>([
      { $match: { status: 'active', date: { $gte: from, $lt: to } } },
      { $group: { _id: '$fuelName', quantity: { $sum: '$quantity' }, amount: { $sum: '$totalAmount' } } },
    ]),
    models.Fuel.find().sort({ name: 1 }).lean(),
  ]);

  const salesMap = new Map(salesByFuel.map((s) => [s._id, s]));
  const purchaseMap = new Map(purchaseByFuel.map((p) => [p._id, p]));

  const rows = fuels.map((f) => {
    const s = salesMap.get(f.name);
    const p = purchaseMap.get(f.name);
    const revenue = money(s?.revenue ?? 0);
    const cost = money(s?.cost ?? 0);
    return {
      fuel: f.name,
      transactions: s?.transactions ?? 0,
      litersSold: volume(s?.liters ?? 0),
      revenue,
      cost,
      profit: money(revenue - cost),
      purchasedQty: volume(p?.quantity ?? 0),
      purchaseAmount: money(p?.amount ?? 0),
      currentStock: volume(f.currentStock),
      minStockAlert: volume(f.minStockAlert),
      stockValue: money(f.currentStock * f.purchasePrice),
      lowStock: f.minStockAlert > 0 && f.currentStock <= f.minStockAlert ? 'Yes' : 'No',
    };
  });

  const columns: ReportColumn[] = [
    { key: 'fuel', header: 'Fuel', width: 16 },
    { key: 'transactions', header: 'Sales', type: 'number', align: 'right', total: true, width: 10 },
    { key: 'litersSold', header: 'Liters Sold', type: 'number', align: 'right', total: true, width: 13 },
    { key: 'revenue', header: 'Revenue', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'cost', header: 'Fuel Cost', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'profit', header: 'Gross Profit', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'purchasedQty', header: 'Purchased (L)', type: 'number', align: 'right', total: true, width: 14 },
    { key: 'purchaseAmount', header: 'Purchase Amt', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'currentStock', header: 'Current Stock', type: 'number', align: 'right', total: true, width: 14 },
    { key: 'minStockAlert', header: 'Min Alert', type: 'number', align: 'right', width: 12 },
    { key: 'stockValue', header: 'Stock Value', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'lowStock', header: 'Low Stock', width: 12 },
  ];

  return {
    table: base(meta, `Fuel Report (${meta.range.label})`, columns, rows, 'Line profit is gross (revenue - fuel cost). Estimated Profit below also deducts operating expenses.'),
    totals: null,
    summary: await profitSummary(models, from, to),
  };
}

// ---------------------------------------------------------------------------
// STOCK
// ---------------------------------------------------------------------------
export async function stockReport(models: TenantModels, meta: Meta) {
  const { from, to } = meta.range;
  const fuels = await models.Fuel.find().sort({ name: 1 }).lean();

  const rows = [];
  for (const fuel of fuels) {
    const fid = new mongoose.Types.ObjectId(String(fuel._id));
    const [res] = await models.StockTransaction.aggregate<{
      before: Array<{ total: number }>;
      inside: Array<{ _id: string; total: number }>;
    }>([
      { $match: { fuelId: fid } },
      {
        $facet: {
          before: [{ $match: { txnAt: { $lt: from } } }, { $group: { _id: null, total: { $sum: '$quantity' } } }],
          inside: [
            { $match: { txnAt: { $gte: from, $lt: to } } },
            { $group: { _id: '$type', total: { $sum: '$quantity' } } },
          ],
        },
      },
    ]);

    const opening = volume(res?.before?.[0]?.total ?? 0);
    const byType = new Map((res?.inside ?? []).map((i) => [i._id, i.total]));
    const purchases = volume(byType.get('purchase') ?? 0);
    const sales = volume(byType.get('sale') ?? 0); // negative
    const adjustments = volume((byType.get('adjustment') ?? 0) + (byType.get('opening') ?? 0) + (byType.get('void') ?? 0));
    const closing = volume(opening + purchases + sales + adjustments);

    rows.push({
      fuel: fuel.name,
      unit: fuel.unit,
      opening,
      purchased: purchases,
      sold: Math.abs(sales),
      adjustments,
      closing,
      liveStock: volume(fuel.currentStock),
      minStockAlert: volume(fuel.minStockAlert),
      stockValue: money(fuel.currentStock * fuel.purchasePrice),
    });
  }

  const columns: ReportColumn[] = [
    { key: 'fuel', header: 'Fuel', width: 16 },
    { key: 'unit', header: 'Unit', width: 8 },
    { key: 'opening', header: 'Opening', type: 'number', align: 'right', total: true, width: 13 },
    { key: 'purchased', header: 'Purchases', type: 'number', align: 'right', total: true, width: 13 },
    { key: 'sold', header: 'Sales', type: 'number', align: 'right', total: true, width: 13 },
    { key: 'adjustments', header: 'Adjustments', type: 'number', align: 'right', total: true, width: 13 },
    { key: 'closing', header: 'Closing', type: 'number', align: 'right', total: true, width: 13 },
    { key: 'liveStock', header: 'Live Stock', type: 'number', align: 'right', total: true, width: 13 },
    { key: 'minStockAlert', header: 'Min Alert', type: 'number', align: 'right', width: 12 },
    { key: 'stockValue', header: 'Stock Value', type: 'money', align: 'right', total: true, width: 14 },
  ];

  return {
    table: base(
      meta,
      `Stock Report (${meta.range.label})`,
      columns,
      rows,
      'Closing = Opening + Purchases - Sales + Adjustments. Derived from the immutable stock transaction ledger.',
    ),
    totals: null,
    summary: [],
  };
}

// ---------------------------------------------------------------------------
// CUSTOMERS / CREDIT
// ---------------------------------------------------------------------------
export async function customersReport(models: TenantModels, meta: Meta) {
  const { from, to } = meta.range;

  const [ledger, customers] = await Promise.all([
    models.CustomerTransaction.aggregate<{ _id: string; credit: number; payments: number }>([
      { $match: { txnAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { $toString: '$customerId' },
          credit: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
          payments: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
        },
      },
    ]),
    models.Customer.find().sort({ name: 1 }).lean(),
  ]);

  const ledgerMap = new Map(ledger.map((l) => [l._id, l]));

  const rows = customers.map((c) => {
    const l = ledgerMap.get(String(c._id));
    const credit = money(l?.credit ?? 0);
    const payments = money(l?.payments ?? 0);
    return {
      customer: c.name,
      phone: c.phone || '-',
      vehicle: c.vehicleNumber || '-',
      creditSales: credit,
      payments,
      netChange: money(credit - payments),
      outstanding: money(c.currentBalance),
      status: c.status,
    };
  });

  const columns: ReportColumn[] = [
    { key: 'customer', header: 'Customer', width: 22 },
    { key: 'phone', header: 'Phone', width: 16 },
    { key: 'vehicle', header: 'Vehicle', width: 14 },
    { key: 'creditSales', header: 'Credit Sales', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'payments', header: 'Payments', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'netChange', header: 'Net Change', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'outstanding', header: 'Outstanding', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'status', header: 'Status', width: 10 },
  ];

  return {
    table: base(
      meta,
      `Customer Credit Report (${meta.range.label})`,
      columns,
      rows,
      'Credit sales and payments cover the selected date range. Outstanding is the live balance on the customer account.',
    ),
    totals: null,
    summary: [],
  };
}

// ---------------------------------------------------------------------------
// SHIFTS
// ---------------------------------------------------------------------------
export async function shiftsReport(models: TenantModels, meta: Meta) {
  const { from, to } = meta.range;
  const shifts = await models.Shift.find({ openedAt: { $gte: from, $lt: to } }).sort({ openedAt: -1 }).lean();

  const rows = [];
  for (const s of shifts) {
    const [salesAgg] = await models.Sale.aggregate<{ revenue: number; liters: number; cash: number; credit: number }>([
      { $match: { shiftId: s._id, status: 'completed' } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          liters: { $sum: '$quantity' },
          cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
          credit: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'credit'] }, '$total', 0] } },
        },
      },
    ]);
    const [expAgg] = await models.Expense.aggregate<{ total: number }>([
      {
        $match: {
          status: 'active',
          paymentMethod: 'cash',
          $or: [{ shiftId: s._id }, { shiftId: null, date: { $gte: s.openedAt, $lte: s.closedAt ?? new Date() } }],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const cashSales = money(salesAgg?.cash ?? 0);
    const expenses = money(expAgg?.total ?? 0);
    const expected = s.status === 'closed' ? money(s.expectedCash) : money(s.openingCash + cashSales - expenses);
    const actual = s.status === 'closed' ? money(s.actualCash ?? 0) : null;

    rows.push({
      shift: s.shiftNumber,
      cashier: s.userName,
      opened: s.openedAt,
      closed: s.closedAt,
      status: s.status,
      openingCash: money(s.openingCash),
      liters: volume(salesAgg?.liters ?? 0),
      sales: money(salesAgg?.revenue ?? 0),
      cashSales,
      creditSales: money(salesAgg?.credit ?? 0),
      expenses,
      expectedCash: expected,
      actualCash: actual,
      difference: actual === null ? null : money(actual - expected),
    });
  }

  const columns: ReportColumn[] = [
    { key: 'shift', header: 'Shift', width: 16 },
    { key: 'cashier', header: 'Cashier', width: 16 },
    { key: 'opened', header: 'Opened', type: 'datetime', width: 18 },
    { key: 'closed', header: 'Closed', type: 'datetime', width: 18 },
    { key: 'status', header: 'Status', width: 10 },
    { key: 'openingCash', header: 'Opening Cash', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'liters', header: 'Liters', type: 'number', align: 'right', total: true, width: 12 },
    { key: 'sales', header: 'Sales', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'cashSales', header: 'Cash Sales', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'creditSales', header: 'Credit Sales', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'expenses', header: 'Expenses', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'expectedCash', header: 'Expected', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'actualCash', header: 'Actual', type: 'money', align: 'right', total: true, width: 14 },
    { key: 'difference', header: 'Difference', type: 'money', align: 'right', total: true, width: 14 },
  ];

  return { table: base(meta, `Shift Report (${meta.range.label})`, columns, rows), totals: null, summary: [] };
}

// ---------------------------------------------------------------------------
// PROFIT / LOSS SUMMARY
// ---------------------------------------------------------------------------
export async function profitReport(models: TenantModels, meta: Meta) {
  const { from, to } = meta.range;

  const [salesAgg, expenseAgg, purchaseAgg, creditAgg, stockAgg] = await Promise.all([
    models.Sale.aggregate<{ revenue: number; cost: number; liters: number; count: number }>([
      { $match: { status: 'completed', saleAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, cost: { $sum: '$costTotal' }, liters: { $sum: '$quantity' }, count: { $sum: 1 } } },
    ]),
    models.Expense.aggregate<{ total: number }>([
      { $match: { status: 'active', date: { $gte: from, $lt: to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    models.Purchase.aggregate<{ total: number; quantity: number }>([
      { $match: { status: 'active', date: { $gte: from, $lt: to } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, quantity: { $sum: '$quantity' } } },
    ]),
    models.Customer.aggregate<{ outstanding: number }>([{ $group: { _id: null, outstanding: { $sum: '$currentBalance' } } }]),
    models.Fuel.aggregate<{ value: number; stock: number }>([
      { $group: { _id: null, value: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } }, stock: { $sum: '$currentStock' } } },
    ]),
  ]);

  // The ONE estimated-profit calculation (sections 27-30). The dashboard, every
  // report and every export read their profit number from here, so they match.
  const profit = calculateEstimatedProfit({
    revenue: salesAgg[0]?.revenue ?? 0,
    fuelCost: salesAgg[0]?.cost ?? 0,
    expenses: expenseAgg[0]?.total ?? 0,
  });

  const rows = [
    { line: 'Sales Revenue', amount: profit.revenue },
    { line: 'Less: Cost of Fuel Sold', amount: -profit.fuelCost },
    { line: 'Gross Profit', amount: profit.grossProfit },
    { line: 'Less: Operating Expenses', amount: -profit.expenses },
    { line: profit.label, amount: profit.estimatedProfit },
  ];

  const columns: ReportColumn[] = [
    { key: 'line', header: 'Line Item', width: 34 },
    { key: 'amount', header: 'Amount (PKR)', type: 'money', align: 'right', width: 20 },
  ];

  const summary = [
    { label: 'Transactions', value: String(salesAgg[0]?.count ?? 0) },
    { label: 'Liters Sold', value: volume(salesAgg[0]?.liters ?? 0).toLocaleString('en-US') },
    { label: 'Fuel Purchased', value: `${volume(purchaseAgg[0]?.quantity ?? 0).toLocaleString('en-US')} L` },
    { label: 'Purchase Value', value: `PKR ${money(purchaseAgg[0]?.total ?? 0).toLocaleString('en-US')}` },
    { label: 'Credit Outstanding', value: `PKR ${money(creditAgg[0]?.outstanding ?? 0).toLocaleString('en-US')}` },
    { label: 'Stock On Hand', value: `${volume(stockAgg[0]?.stock ?? 0).toLocaleString('en-US')} L` },
    { label: 'Stock Value', value: `PKR ${money(stockAgg[0]?.value ?? 0).toLocaleString('en-US')}` },
    { label: 'Estimated Margin', value: `${profit.marginPercent.toFixed(1)}%` },
  ];

  return {
    table: base(
      meta,
      `Profit & Loss Summary (${meta.range.label})`,
      columns,
      rows,
      'Estimated figures. Cost of fuel sold uses the purchase price captured at the time of each sale; it is not a replacement for formal accounting.',
    ),
    totals: null,
    summary,
  };
}

export async function buildReport(
  type: ReportType,
  models: TenantModels,
  meta: Meta,
  groupBy: string,
): Promise<{ table: ReportTable; totals: Record<string, unknown> | null; summary: Array<{ label: string; value: string }> }> {
  switch (type) {
    case 'expenses':
      return expensesReport(models, meta, groupBy);
    case 'fuel':
      return fuelReport(models, meta);
    case 'stock':
      return stockReport(models, meta);
    case 'customers':
      return customersReport(models, meta);
    case 'shifts':
      return shiftsReport(models, meta);
    case 'profit':
      return profitReport(models, meta);
    case 'sales':
    default:
      return salesReport(models, meta, groupBy);
  }
}
