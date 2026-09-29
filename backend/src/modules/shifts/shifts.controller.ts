import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { getTenantConnection, withTransaction } from '../../db/tenant.js';
import { nextSequence } from '../../utils/counters.js';
import { money, volume } from '../../utils/number.js';
import { parsePagination, paginateMeta, escapeRegex } from '../../utils/pagination.js';
import { resolveRange } from '../../utils/dates.js';
import type { TenantModels } from '../../models/tenant/schemas.js';

/** Aggregate the live totals for a shift straight from the pump database. */
async function computeShiftTotals(models: TenantModels, shiftId: string, openedAt: Date, closedAt: Date) {
  const sid = new mongoose.Types.ObjectId(shiftId);
  const [salesAgg] = await models.Sale.aggregate<{
    totalSales: number;
    totalLiters: number;
    cash: number;
    card: number;
    bank: number;
    credit: number;
    cost: number;
    count: number;
  }>([
    { $match: { shiftId: sid, status: 'completed' } },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$total' },
        totalLiters: { $sum: '$quantity' },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$total', 0] } },
        bank: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'bank'] }, '$total', 0] } },
        credit: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'credit'] }, '$total', 0] } },
        cost: { $sum: '$costTotal' },
        count: { $sum: 1 },
      },
    },
  ]);

  const [expenseAgg] = await models.Expense.aggregate<{ total: number }>([
    {
      $match: {
        status: 'active',
        paymentMethod: 'cash',
        $or: [{ shiftId: sid }, { shiftId: null, date: { $gte: openedAt, $lte: closedAt } }],
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return {
    totalSales: money(salesAgg?.totalSales ?? 0),
    totalLiters: volume(salesAgg?.totalLiters ?? 0),
    cashSales: money(salesAgg?.cash ?? 0),
    cardSales: money(salesAgg?.card ?? 0),
    bankSales: money(salesAgg?.bank ?? 0),
    creditSales: money(salesAgg?.credit ?? 0),
    saleCount: salesAgg?.count ?? 0,
    costOfSales: money(salesAgg?.cost ?? 0),
    expenses: money(expenseAgg?.total ?? 0),
  };
}

export const listShifts = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};

  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.userId) filter.userId = new mongoose.Types.ObjectId(String(req.query.userId));
  if (req.query.from || req.query.to) {
    const range = resolveRange('custom', req.query.from as string, req.query.to as string);
    filter.openedAt = { $gte: range.from, $lt: range.to };
  }
  if (req.query.search) {
    const term = escapeRegex(String(req.query.search));
    filter.$or = [{ shiftNumber: { $regex: term, $options: 'i' } }, { userName: { $regex: term, $options: 'i' } }];
  }
  // Cashiers only ever see their own shifts
  if (req.auth!.role === 'cashier') filter.userId = new mongoose.Types.ObjectId(req.auth!.userId);

  const [items, total] = await Promise.all([
    models.Shift.find(filter).sort({ openedAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    models.Shift.countDocuments(filter),
  ]);

  res.json(ok({ items, meta: paginateMeta(total, pagination) }));
});

export const currentShift = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  let shift = await models.Shift.findOne({ userId: req.auth!.userId, status: 'open' }).sort({ openedAt: -1 }).lean();

  // Admins/managers get visibility of any open shift on the pump
  if (!shift && req.auth!.role !== 'cashier') {
    shift = await models.Shift.findOne({ status: 'open' }).sort({ openedAt: -1 }).lean();
  }
  if (!shift) return res.json(ok(null));

  const totals = await computeShiftTotals(models, String(shift._id), shift.openedAt, new Date());
  res.json(ok({ ...shift, ...totals, expectedCash: money(shift.openingCash + totals.cashSales - totals.expenses) }));
});

export const openShift = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const { openingCash, openingMeter, notes } = req.body as { openingCash: number; openingMeter?: number; notes?: string };

  const existing = await models.Shift.findOne({ userId: req.auth!.userId, status: 'open' }).lean();
  if (existing) {
    throw ApiError.conflict(`You already have an open shift (${existing.shiftNumber}). Please close it first.`);
  }

  const conn = await getTenantConnection(req.auth!.databaseName);
  const seq = await nextSequence(conn, 'shift', null);
  const shift = await models.Shift.create({
    shiftNumber: `SH-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`,
    userId: new mongoose.Types.ObjectId(req.auth!.userId),
    userName: req.auth!.name,
    openingCash: money(openingCash),
    openingMeter: Number(openingMeter ?? 0),
    status: 'open',
    openedAt: new Date(),
    notes: notes || '',
  });

  res.status(201).json(ok(shift, `Shift ${shift.shiftNumber} opened.`));
});

export const closeShift = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const auth = req.auth!;
  const { closingMeter, actualCash, notes } = req.body as { closingMeter?: number; actualCash: number; notes?: string };

  const closed = await withTransaction(auth.databaseName, async (session) => {
    const shift = await models.Shift.findById(req.params.id).session(session ?? null);
    if (!shift) throw ApiError.notFound('Shift not found.');
    if (shift.status === 'closed') throw ApiError.badRequest('This shift is already closed.');
    if (auth.role === 'cashier' && String(shift.userId) !== auth.userId) {
      throw ApiError.forbidden('You can only close your own shift.');
    }

    const closedAt = new Date();
    const totals = await computeShiftTotals(models, String(shift._id), shift.openedAt, closedAt);
    const expectedCash = money(shift.openingCash + totals.cashSales - totals.expenses);
    const actual = money(actualCash);

    shift.closingMeter = closingMeter !== undefined ? Number(closingMeter) : shift.closingMeter;
    shift.status = 'closed';
    shift.closedAt = closedAt;
    shift.totalSales = totals.totalSales;
    shift.totalLiters = totals.totalLiters;
    shift.cashSales = totals.cashSales;
    shift.cardSales = totals.cardSales;
    shift.bankSales = totals.bankSales;
    shift.creditSales = totals.creditSales;
    shift.expenses = totals.expenses;
    shift.expectedCash = expectedCash;
    shift.actualCash = actual;
    shift.difference = money(actual - expectedCash);
    if (notes) shift.notes = [shift.notes, notes].filter(Boolean).join(' | ');
    await shift.save({ ...(session ? { session } : {}) });
    return { shift, totals };
  });

  res.json(
    ok(
      { ...closed.shift.toObject(), ...closed.totals },
      `Shift ${closed.shift.shiftNumber} closed. Difference: ${closed.shift.difference}`,
    ),
  );
});

export const getShift = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const shift = await models.Shift.findById(req.params.id).lean();
  if (!shift) throw ApiError.notFound('Shift not found.');
  if (req.auth!.role === 'cashier' && String(shift.userId) !== req.auth!.userId) {
    throw ApiError.forbidden('You can only view your own shift.');
  }

  const sid = new mongoose.Types.ObjectId(String(shift._id));
  const [totals, byFuel, sales, expenses] = await Promise.all([
    computeShiftTotals(models, String(shift._id), shift.openedAt, shift.closedAt ?? new Date()),
    models.Sale.aggregate<{ fuelName: string; liters: number; revenue: number }>([
      { $match: { shiftId: sid, status: 'completed' } },
      { $group: { _id: '$fuelName', liters: { $sum: '$quantity' }, revenue: { $sum: '$total' } } },
      { $project: { _id: 0, fuelName: '$_id', liters: 1, revenue: 1 } },
      { $sort: { revenue: -1 } },
    ]),
    models.Sale.find({ shiftId: sid }).sort({ saleAt: -1 }).limit(200).lean(),
    models.Expense.find({
      status: 'active',
      $or: [
        { shiftId: sid },
        { shiftId: null, date: { $gte: shift.openedAt, $lte: shift.closedAt ?? new Date() } },
      ],
    })
      .sort({ date: -1 })
      .lean(),
  ]);

  res.json(
    ok({
      ...shift,
      ...totals,
      expectedCash: money(shift.openingCash + totals.cashSales - totals.expenses),
      byFuel,
      sales,
      expenseLines: expenses,
    }),
  );
});
