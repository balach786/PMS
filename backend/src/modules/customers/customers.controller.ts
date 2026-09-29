import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { withTransaction } from '../../db/tenant.js';
import { applyCustomerTransaction } from '../../services/customer-ledger.service.js';
import { money } from '../../utils/number.js';
import { parsePagination, paginateMeta, escapeRegex } from '../../utils/pagination.js';

export const listCustomers = asyncHandler(async (req, res) => {
  const { Customer } = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};

  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.search) {
    const term = escapeRegex(String(req.query.search).trim());
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { vehicleNumber: { $regex: term, $options: 'i' } },
    ];
  }
  if (req.query.withBalance === 'true') filter.currentBalance = { $gt: 0 };

  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ name: 1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Customer.countDocuments(filter),
  ]);

  const [balanceAgg] = await Customer.aggregate<{ totalOutstanding: number }>([
    { $group: { _id: null, totalOutstanding: { $sum: '$currentBalance' } } },
  ]);

  res.json(
    ok({
      items,
      meta: {
        ...paginateMeta(total, pagination),
        totalOutstanding: money(balanceAgg?.totalOutstanding ?? 0),
      },
    }),
  );
});

export const createCustomer = asyncHandler(async (req, res) => {
  const { Customer } = req.tenant!;
  const body = req.body as Record<string, string>;

  if (body.phone) {
    const dup = await Customer.findOne({ phone: body.phone.trim() }).lean();
    if (dup) throw ApiError.conflict(`A customer with phone ${body.phone} already exists.`);
  }

  const customer = await Customer.create({
    name: body.name.trim(),
    phone: body.phone?.trim() || '',
    vehicleNumber: body.vehicleNumber?.trim().toUpperCase() || '',
    address: body.address?.trim() || '',
    notes: body.notes?.trim() || '',
    status: body.status ?? 'active',
    currentBalance: 0,
  });

  res.status(201).json(ok(customer, `${customer.name} added.`));
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const { Customer } = req.tenant!;
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found.');
  const body = req.body as Record<string, string>;

  if (body.name !== undefined) customer.name = body.name.trim();
  if (body.phone !== undefined) {
    const dup = await Customer.findOne({ phone: body.phone.trim(), _id: { $ne: customer._id } }).lean();
    if (dup) throw ApiError.conflict('Another customer already uses this phone number.');
    customer.phone = body.phone.trim();
  }
  if (body.vehicleNumber !== undefined) customer.vehicleNumber = body.vehicleNumber.trim().toUpperCase();
  if (body.address !== undefined) customer.address = body.address.trim();
  if (body.notes !== undefined) customer.notes = body.notes.trim();
  if (body.status !== undefined) customer.status = body.status as 'active' | 'inactive';

  await customer.save();
  res.json(ok(customer, `${customer.name} updated.`));
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const { Customer, CustomerTransaction, Sale } = req.tenant!;
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found.');

  const [txCount, saleCount] = await Promise.all([
    CustomerTransaction.countDocuments({ customerId: customer._id }),
    Sale.countDocuments({ customerId: customer._id }),
  ]);

  if (txCount || saleCount || customer.currentBalance !== 0) {
    customer.status = 'inactive';
    await customer.save();
    return res.json(
      ok({ id: String(customer._id), deactivated: true }, `${customer.name} has history, so the account was deactivated instead of deleted.`),
    );
  }

  await customer.deleteOne();
  res.json(ok({ id: String(customer._id), deleted: true }, `${customer.name} deleted.`));
});

export const getCustomer = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const customer = await models.Customer.findById(req.params.id).lean();
  if (!customer) throw ApiError.notFound('Customer not found.');

  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter = { customerId: new mongoose.Types.ObjectId(String(customer._id)) };

  const [transactions, txTotal] = await Promise.all([
    models.CustomerTransaction.find(filter)
      .sort({ txnAt: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    models.CustomerTransaction.countDocuments(filter),
  ]);

  const [agg] = await models.CustomerTransaction.aggregate<{ credit: number; payments: number }>([
    { $match: filter },
    {
      $group: {
        _id: null,
        credit: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
        payments: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
      },
    },
  ]);

  res.json(
    ok({
      ...customer,
      totals: {
        credit: money(agg?.credit ?? 0),
        payments: money(agg?.payments ?? 0),
        outstanding: money(customer.currentBalance),
      },
      transactions,
    }, undefined, paginateMeta(txTotal, pagination)),
  );
});

/** Record a payment received from a customer (decreases their balance). */
export const receivePayment = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const models = req.tenant!;
  const { amount, paymentMethod, description, txnAt } = req.body as {
    amount: number;
    paymentMethod: 'cash' | 'card' | 'bank';
    description?: string;
    txnAt?: Date;
  };

  const result = await withTransaction(auth.databaseName, async (session) => {
    const customer = await models.Customer.findById(req.params.id).session(session ?? null);
    if (!customer) throw ApiError.notFound('Customer not found.');

    const ledger = await applyCustomerTransaction(
      models,
      {
        customerId: String(customer._id),
        type: 'payment',
        amount: Math.abs(amount),
        paymentMethod,
        description: description || `Payment received (${paymentMethod})`,
        userId: auth.userId,
        userName: auth.name,
        txnAt: txnAt ? new Date(txnAt) : new Date(),
      },
      session,
    );
    return ledger;
  });

  res.status(201).json(
    ok({ balanceAfter: result.balanceAfter }, `Payment of ${money(amount)} recorded. Remaining balance: ${result.balanceAfter}`),
  );
});

export const listTransactions = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};
  if (req.query.customerId) filter.customerId = new mongoose.Types.ObjectId(String(req.query.customerId));
  if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;

  const [items, total] = await Promise.all([
    models.CustomerTransaction.find(filter)
      .sort({ txnAt: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    models.CustomerTransaction.countDocuments(filter),
  ]);

  res.json(ok(items, undefined, paginateMeta(total, pagination)));
});
