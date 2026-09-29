import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { parsePagination, paginateMeta, escapeRegex } from '../../utils/pagination.js';
import { resolveRange } from '../../utils/dates.js';
import { money } from '../../utils/number.js';

export const listExpenses = asyncHandler(async (req, res) => {
  const { Expense } = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};

  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  else filter.status = 'active';
  if (req.query.category && req.query.category !== 'all') filter.category = req.query.category;
  if (req.query.paymentMethod && req.query.paymentMethod !== 'all') filter.paymentMethod = req.query.paymentMethod;
  if (req.query.from || req.query.to) {
    const range = resolveRange('custom', req.query.from as string, req.query.to as string);
    filter.date = { $gte: range.from, $lt: range.to };
  }
  if (req.query.search) {
    const term = escapeRegex(String(req.query.search).trim());
    filter.$or = [
      { description: { $regex: term, $options: 'i' } },
      { category: { $regex: term, $options: 'i' } },
      { addedByName: { $regex: term, $options: 'i' } },
      { reference: { $regex: term, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Expense.countDocuments(filter),
  ]);

  const [agg] = await Expense.aggregate<{ total: number }>([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  res.json(ok({ items, meta: { ...paginateMeta(total, pagination), totalAmount: money(agg?.total ?? 0) } }));
});

export const createExpense = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const auth = req.auth!;
  const body = req.body as {
    category: string;
    amount: number;
    description?: string;
    date?: Date;
    paymentMethod: 'cash' | 'card' | 'bank' | 'credit';
    reference?: string;
  };

  // attach to the user's currently open shift when there is one
  const openShift = await models.Shift.findOne({ userId: auth.userId, status: 'open' }).sort({ openedAt: -1 }).lean();

  const expense = await models.Expense.create({
    category: body.category,
    amount: money(body.amount),
    description: body.description?.trim() || '',
    date: body.date ? new Date(body.date) : new Date(),
    paymentMethod: body.paymentMethod,
    addedBy: new mongoose.Types.ObjectId(auth.userId),
    addedByName: auth.name,
    shiftId: openShift?._id ?? null,
    reference: body.reference?.trim() || '',
    status: 'active',
  });

  res.status(201).json(ok(expense, 'Expense recorded.'));
});

export const updateExpense = asyncHandler(async (req, res) => {
  const { Expense } = req.tenant!;
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw ApiError.notFound('Expense not found.');
  if (expense.status === 'voided') throw ApiError.badRequest('A voided expense cannot be edited.');

  const body = req.body as Record<string, string | number | Date>;
  if (body.category !== undefined) expense.category = String(body.category);
  if (body.amount !== undefined) expense.amount = money(Number(body.amount));
  if (body.description !== undefined) expense.description = String(body.description);
  if (body.date !== undefined) expense.date = new Date(body.date);
  if (body.paymentMethod !== undefined) expense.paymentMethod = body.paymentMethod as 'cash' | 'card' | 'bank' | 'credit';
  if (body.reference !== undefined) expense.reference = String(body.reference);

  await expense.save();
  res.json(ok(expense, 'Expense updated.'));
});

export const voidExpense = asyncHandler(async (req, res) => {
  const { Expense } = req.tenant!;
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw ApiError.notFound('Expense not found.');
  if (expense.status === 'voided') return res.json(ok(expense, 'Expense was already voided.'));

  expense.status = 'voided';
  expense.voidedAt = new Date();
  await expense.save();
  res.json(ok(expense, 'Expense voided. It no longer counts towards totals.'));
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const { Expense } = req.tenant!;
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw ApiError.notFound('Expense not found.');
  await expense.deleteOne();
  res.json(ok({ id: String(expense._id), deleted: true }, 'Expense deleted.'));
});

export const expenseCategories = asyncHandler(async (_req, res) => {
  const { EXPENSE_CATEGORIES } = await import('../../models/tenant/schemas.js');
  res.json(ok(EXPENSE_CATEGORIES));
});
