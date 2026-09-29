import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/http.js';
import { resolveRange, formatRangeLabel, type DateRange } from '../../utils/dates.js';
import { money, volume } from '../../utils/number.js';
import { calculateEstimatedProfit } from '../../services/profit.service.js';
import type { TenantModels } from '../../models/tenant/schemas.js';

/** Start of the day N days ago (local server time). */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

/** One millisecond before midnight tonight. */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

async function salesAgg(models: TenantModels, range: DateRange) {
  const [agg] = await models.Sale.aggregate<{
    revenue: number;
    liters: number;
    cost: number;
    count: number;
    cash: number;
    card: number;
    bank: number;
    credit: number;
  }>([
    { $match: { status: 'completed', saleAt: { $gte: range.from, $lt: range.to } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$total' },
        liters: { $sum: '$quantity' },
        cost: { $sum: '$costTotal' },
        count: { $sum: 1 },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$total', 0] } },
        bank: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'bank'] }, '$total', 0] } },
        credit: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'credit'] }, '$total', 0] } },
      },
    },
  ]);
  return {
    revenue: money(agg?.revenue ?? 0),
    liters: volume(agg?.liters ?? 0),
    cost: money(agg?.cost ?? 0),
    count: agg?.count ?? 0,
    cash: money(agg?.cash ?? 0),
    card: money(agg?.card ?? 0),
    bank: money(agg?.bank ?? 0),
    credit: money(agg?.credit ?? 0),
  };
}

export const getDashboard = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const auth = req.auth!;

  const range = resolveRange(
    req.query.range as string | undefined,
    req.query.from as string | undefined,
    req.query.to as string | undefined,
  );
  const todayRange = resolveRange('today');

  // rolling 7-day windows for the "Last 7 days" card, plus the 7 days before it
  const last7 = { from: daysAgo(6), to: endOfToday() };
  const prev7 = { from: daysAgo(13), to: daysAgo(6) };

  const [
    salesSummary, todaySummary, expenseAgg, todayExpenseAgg, creditAgg, fuels, openShiftDoc,
    recentSales, byFuel, trend, expenseByCategory, expenseTrend,
    last7Series, prev7Agg,
    customerCount, supplierCount, fuelTypeCount,
    recentPurchases, recentExpenses, recentPayments, recentAdjustments,
  ] =
    await Promise.all([
      salesAgg(models, range),
      salesAgg(models, todayRange),
      models.Expense.aggregate<{ total: number }>([
        { $match: { status: 'active', date: { $gte: range.from, $lt: range.to } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      models.Expense.aggregate<{ total: number }>([
        { $match: { status: 'active', date: { $gte: todayRange.from, $lt: todayRange.to } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      models.Customer.aggregate<{ outstanding: number }>([
        { $group: { _id: null, outstanding: { $sum: '$currentBalance' } } },
      ]),
      models.Fuel.find({ status: 'active' }).sort({ name: 1 }).lean(),
      models.Shift.findOne({ userId: new mongoose.Types.ObjectId(auth.userId), status: 'open' })
        .sort({ openedAt: -1 })
        .lean(),
      models.Sale.find({ status: 'completed' }).sort({ saleAt: -1 }).limit(8).lean(),
      models.Sale.aggregate<{ fuelName: string; liters: number; revenue: number; cost: number }>([
        { $match: { status: 'completed', saleAt: { $gte: range.from, $lt: range.to } } },
        { $group: { _id: '$fuelName', liters: { $sum: '$quantity' }, revenue: { $sum: '$total' }, cost: { $sum: '$costTotal' } } },
        { $project: { _id: 0, fuelName: '$_id', liters: 1, revenue: 1, cost: 1 } },
        { $sort: { revenue: -1 } },
      ]),
      models.Sale.aggregate<{ day: string; revenue: number; liters: number }>([
        { $match: { status: 'completed', saleAt: { $gte: range.from, $lt: range.to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleAt' } },
            revenue: { $sum: '$total' },
            liters: { $sum: '$quantity' },
          },
        },
        { $project: { _id: 0, day: '$_id', revenue: 1, liters: 1 } },
        { $sort: { day: 1 } },
      ]),
      models.Expense.aggregate<{ category: string; amount: number }>([
        { $match: { status: 'active', date: { $gte: range.from, $lt: range.to } } },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } },
        { $project: { _id: 0, category: '$_id', amount: 1 } },
        { $sort: { amount: -1 } },
      ]),
      // Real per-day expenses (section 14) so sales vs expenses is never faked.
      models.Expense.aggregate<{ day: string; amount: number }>([
        { $match: { status: 'active', date: { $gte: range.from, $lt: range.to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, amount: { $sum: '$amount' } } },
        { $project: { _id: 0, day: '$_id', amount: 1 } },
        { $sort: { day: 1 } },
      ]),
      // ---- last 7 days vs the 7 days before (§19) ----
      models.Sale.aggregate<{ day: string; revenue: number }>([
        { $match: { status: 'completed', saleAt: { $gte: last7.from, $lt: last7.to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleAt' } }, revenue: { $sum: '$total' } } },
        { $project: { _id: 0, day: '$_id', revenue: 1 } },
        { $sort: { day: 1 } },
      ]),
      models.Sale.aggregate<{ revenue: number }>([
        { $match: { status: 'completed', saleAt: { $gte: prev7.from, $lt: prev7.to } } },
        { $group: { _id: null, revenue: { $sum: '$total' } } },
      ]),
      // ---- quick info counts (§20) ----
      models.Customer.countDocuments({ status: 'active' }),
      models.Supplier.countDocuments({ status: 'active' }),
      models.Fuel.countDocuments({ status: 'active' }),
      // ---- recent activity feed (§16) ----
      models.Purchase.find({ status: 'active' }).sort({ date: -1 }).limit(2).lean(),
      models.Expense.find({ status: 'active' }).sort({ date: -1 }).limit(2).lean(),
      models.CustomerTransaction.find({ type: 'payment' }).sort({ createdAt: -1 }).limit(2).lean(),
      // dip corrections and opening balances - plain sales/purchases already appear above
      models.StockTransaction.find({ type: { $in: ['adjustment', 'opening'] } })
        .sort({ createdAt: -1 })
        .limit(2)
        .lean(),
    ]);

  const expenses = money(expenseAgg[0]?.total ?? 0);
  const todayExpenses = money(todayExpenseAgg[0]?.total ?? 0);

  // Shift totals are always computed live from the pump database.
  let openShift = null as null | Record<string, unknown>;
  if (openShiftDoc) {
    const [shiftSales] = await models.Sale.aggregate<{ revenue: number; liters: number; cash: number }>([
      { $match: { shiftId: openShiftDoc._id, status: 'completed' } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          liters: { $sum: '$quantity' },
          cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
        },
      },
    ]);
    const [shiftExpenses] = await models.Expense.aggregate<{ total: number }>([
      {
        $match: {
          status: 'active',
          paymentMethod: 'cash',
          $or: [
            { shiftId: openShiftDoc._id },
            { shiftId: null, date: { $gte: openShiftDoc.openedAt, $lte: new Date() } },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const cashSales = money(shiftSales?.cash ?? 0);
    const shiftExpenseTotal = money(shiftExpenses?.total ?? 0);
    openShift = {
      ...openShiftDoc,
      totalSales: money(shiftSales?.revenue ?? 0),
      totalLiters: volume(shiftSales?.liters ?? 0),
      cashSales,
      expenses: shiftExpenseTotal,
      expectedCash: money(openShiftDoc.openingCash + cashSales - shiftExpenseTotal),
    };
  }

  // Stock table (section 15): current stock AND tank capacity, with the
  // Normal / Low Stock / Critical status the UI renders as a badge.
  const stock = fuels.map((f) => {
    const capacity = volume(Number(f.capacity ?? 0));
    const current = volume(f.currentStock);
    const critical = f.minStockAlert > 0 && current <= f.minStockAlert;
    const low = !critical && ((capacity > 0 && current / capacity <= 0.2) || (f.minStockAlert > 0 && current <= f.minStockAlert * 1.5));

    return {
      _id: String(f._id),
      name: f.name,
      unit: f.unit,
      code: f.code,
      currentStock: current,
      capacity,
      fillPercent: capacity > 0 ? Math.round((current / capacity) * 1000) / 10 : null,
      minStockAlert: volume(f.minStockAlert),
      status: (critical ? 'Critical' : low ? 'Low Stock' : 'Normal') as 'Normal' | 'Low Stock' | 'Critical',
      lowStock: critical || low,
      sellingPrice: money(f.sellingPrice),
      value: money(f.currentStock * f.purchasePrice),
    };
  });

  // ---- THE one profit calculation (sections 27-30) ------------------------
  const profit = calculateEstimatedProfit({
    revenue: salesSummary.revenue,
    fuelCost: salesSummary.cost,
    expenses,
  });
  const todayProfit = calculateEstimatedProfit({
    revenue: todaySummary.revenue,
    fuelCost: todaySummary.cost,
    expenses: todayExpenses,
  });

  // last 7 days against the 7 days before it (section 19)
  const last7Total = money((last7Series ?? []).reduce((sum, d) => sum + (d.revenue ?? 0), 0));
  const prev7Total = money(prev7Agg[0]?.revenue ?? 0);
  const last7Card = {
    total: last7Total,
    previousTotal: prev7Total,
    changePercent: prev7Total > 0
      ? money(((last7Total - prev7Total) / prev7Total) * 100)
      : (last7Total > 0 ? 100 : 0),
    series: (last7Series ?? []).map((d) => ({ day: d.day, revenue: money(d.revenue) })),
  };

  // Activity feed: two of every operational transaction type (section 16), so
  // sales, purchases, expenses, payments and stock adjustments all show up.

  const recentActivity = [
    ...recentSales.slice(0, 2).map((s) => ({
      id: `sale-${String(s._id)}`,
      type: 'sale' as const,
      details: `${s.invoiceNumber} · ${s.fuelName} · ${volume(s.quantity)} L`,
      amount: money(s.total),
      direction: 'in' as const,
      at: s.saleAt,
    })),
    ...recentPurchases.map((x) => ({
      id: `purchase-${String(x._id)}`,
      type: 'purchase' as const,
      details: `${x.supplierName ?? 'Supplier'} · ${x.fuelName ?? 'Fuel'} · ${volume(x.quantity)} L`,
      amount: money(x.totalAmount ?? 0),
      direction: 'out' as const,
      at: x.date,
    })),
    ...recentExpenses.map((x) => ({
      id: `expense-${String(x._id)}`,
      type: 'expense' as const,
      details: `${x.category}${x.description ? ` · ${x.description}` : ''}`,
      amount: money(x.amount),
      direction: 'out' as const,
      at: x.date,
    })),
    ...recentPayments.map((x: any) => ({
      id: `payment-${String(x._id)}`,
      type: 'payment' as const,
      details: `${x.customerName ?? 'Customer'} · payment received`,
      amount: money(Math.abs(Number(x.amount ?? 0))),
      direction: 'in' as const,
      at: x.createdAt ?? x.date,
    })),
    ...recentAdjustments.map((x: any) => ({
      id: `adjustment-${String(x._id)}`,
      type: 'adjustment' as const,
      details: `${x.fuelName ?? 'Fuel'} · ${x.type} ${volume(x.quantity)} L`,
      amount: 0,
      direction: Number(x.quantity) >= 0 ? ('in' as const) : ('out' as const),
      at: x.createdAt,
    })),
  ]
    .filter((row) => Boolean(row.at))
    .sort((a, b) => new Date(b.at as Date).getTime() - new Date(a.at as Date).getTime())
    .slice(0, 10);

  return res.json(
    ok({
      range: {
        key: range.key,
        label: range.label,
        display: formatRangeLabel(range),
        from: range.from,
        to: range.to,
      },
      kpis: {
        totalSales: profit.revenue,
        totalLiters: salesSummary.liters,
        transactionCount: salesSummary.count,
        costOfSales: profit.fuelCost,
        grossProfit: profit.grossProfit,
        expenses: profit.expenses,
        // section 11 "Today's Expenses" - always today, whatever range is selected
        expensesToday: todayExpenses,
        estimatedProfit: profit.estimatedProfit,
        profitLabel: profit.label,
        marginPercent: profit.marginPercent,
        creditOutstanding: money(creditAgg[0]?.outstanding ?? 0),
        byPayment: {
          cash: salesSummary.cash,
          card: salesSummary.card,
          bank: salesSummary.bank,
          credit: salesSummary.credit,
        },
      },
      today: {
        totalSales: todayProfit.revenue,
        totalLiters: todaySummary.liters,
        transactionCount: todaySummary.count,
        expenses: todayExpenses,
        grossProfit: todayProfit.grossProfit,
        estimatedProfit: todayProfit.estimatedProfit,
      },
      profit: {
        label: profit.label,
        revenue: profit.revenue,
        fuelCost: profit.fuelCost,
        grossProfit: profit.grossProfit,
        expenses: profit.expenses,
        estimatedProfit: profit.estimatedProfit,
        marginPercent: profit.marginPercent,
      },
      // section 20 quick info
      quickInfo: {
        creditOutstanding: money(creditAgg[0]?.outstanding ?? 0),
        totalCustomers: customerCount ?? 0,
        activeSuppliers: supplierCount ?? 0,
        totalFuelTypes: fuelTypeCount ?? 0,
        lowStockFuels: stock.filter((f) => f.lowStock).length,
      },
      // section 19 last 7 days with previous-period comparison
      last7Days: last7Card,
      recentActivity,
      fuelBreakdown: byFuel.map((f) => ({ ...f, liters: volume(f.liters), revenue: money(f.revenue), cost: money(f.cost) })),
      salesTrend: trend.map((t) => ({ ...t, revenue: money(t.revenue), liters: volume(t.liters) })),
      /** Real per-day expense totals for the sales-vs-expenses chart (§14). */
      expenseTrend: expenseTrend.map((e) => ({ day: e.day, amount: money(e.amount) })),
      expenseBreakdown: expenseByCategory.map((e) => ({ ...e, amount: money(e.amount) })),
      stock,
      openShift,
      recentSales: recentSales.map((s) => ({
        _id: String(s._id),
        invoiceNumber: s.invoiceNumber,
        fuelName: s.fuelName,
        quantity: volume(s.quantity),
        rate: money(s.rate),
        total: money(s.total),
        paymentMethod: s.paymentMethod,
        customerName: s.customerName,
        userName: s.userName,
        saleAt: s.saleAt,
        status: s.status,
      })),
      note: 'Profit figures are estimated: they use the purchase price captured at the time of each sale.',
    }),
  );
});
