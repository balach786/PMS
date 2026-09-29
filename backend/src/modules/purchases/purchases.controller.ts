import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { getTenantConnection, withTransaction } from '../../db/tenant.js';
import { applyStockChange } from '../../services/stock.service.js';
import { money, volume } from '../../utils/number.js';
import { parsePagination, paginateMeta, escapeRegex } from '../../utils/pagination.js';
import { resolveRange } from '../../utils/dates.js';

export const listPurchases = asyncHandler(async (req, res) => {
  const { Purchase } = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};

  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  else filter.status = 'active';
  if (req.query.supplierId) filter.supplierId = new mongoose.Types.ObjectId(String(req.query.supplierId));
  if (req.query.fuelId) filter.fuelId = new mongoose.Types.ObjectId(String(req.query.fuelId));
  if (req.query.from || req.query.to) {
    const range = resolveRange('custom', req.query.from as string, req.query.to as string);
    filter.date = { $gte: range.from, $lt: range.to };
  }
  if (req.query.search) {
    const term = escapeRegex(String(req.query.search).trim());
    filter.$or = [
      { invoiceNumber: { $regex: term, $options: 'i' } },
      { supplierName: { $regex: term, $options: 'i' } },
      { fuelName: { $regex: term, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Purchase.find(filter).sort({ date: -1, createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Purchase.countDocuments(filter),
  ]);

  const [agg] = await Purchase.aggregate<{ totalAmount: number; totalQuantity: number }>([
    { $match: filter },
    { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, totalQuantity: { $sum: '$quantity' } } },
  ]);

  res.json(
    ok({
      items,
      meta: {
        ...paginateMeta(total, pagination),
        totalAmount: money(agg?.totalAmount ?? 0),
        totalQuantity: volume(agg?.totalQuantity ?? 0),
      },
    }),
  );
});

export const createPurchase = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const models = req.tenant!;
  const body = req.body as {
    supplierId: string;
    fuelId: string;
    quantity: number;
    purchaseRate: number;
    invoiceNumber?: string;
    date?: Date;
    notes?: string;
    paymentMethod: 'cash' | 'card' | 'bank' | 'credit';
  };

  const result = await withTransaction(auth.databaseName, async (session) => {
    const conn = await getTenantConnection(auth.databaseName);

    // NOTE: a MongoDB session must never be used for concurrent operations,
    // so these reads are awaited one after another (not Promise.all).
    const supplier = await models.Supplier.findById(body.supplierId).session(session ?? null);
    const fuel = await models.Fuel.findById(body.fuelId).session(session ?? null);
    if (!supplier) throw ApiError.notFound('Supplier not found.');
    if (!fuel) throw ApiError.notFound('Fuel not found.');

    const qty = volume(body.quantity);
    const rate = money(body.purchaseRate);
    const totalAmount = money(qty * rate);
    const date = body.date ? new Date(body.date) : new Date();

    const purchase = await models.Purchase.create(
      [
        {
          invoiceNumber: body.invoiceNumber?.trim() || '',
          supplierId: supplier._id,
          supplierName: supplier.name,
          fuelId: fuel._id,
          fuelName: fuel.name,
          quantity: qty,
          purchaseRate: rate,
          totalAmount,
          date,
          notes: body.notes?.trim() || '',
          paymentMethod: body.paymentMethod,
          addedBy: new mongoose.Types.ObjectId(auth.userId),
          addedByName: auth.name,
          status: 'active',
        },
      ],
      { ...(session ? { session } : {}) },
    );
    const doc = purchase[0];

    // Purchasing fuel increases stock and writes a stock transaction.
    const { balanceAfter } = await applyStockChange(
      models,
      {
        fuelId: String(fuel._id),
        type: 'purchase',
        quantity: qty,
        refId: String(doc._id),
        refType: 'purchase',
        reference: doc.invoiceNumber || String(doc._id),
        notes: `Purchase from ${supplier.name}`,
        userId: auth.userId,
        userName: auth.name,
        txnAt: date,
      },
      session,
    );

    // Keep the fuel's reference purchase price in sync
    fuel.purchasePrice = rate;
    await fuel.save({ ...(session ? { session } : {}) });

    void conn;
    return { doc, balanceAfter };
  });

  res.status(201).json(
    ok(
      { ...result.doc.toObject(), newStock: result.balanceAfter },
      `Purchase recorded. ${result.doc.fuelName} stock is now ${result.balanceAfter} L.`,
    ),
  );
});

export const voidPurchase = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const models = req.tenant!;

  const purchase = await withTransaction(auth.databaseName, async (session) => {
    const p = await models.Purchase.findById(req.params.id).session(session ?? null);
    if (!p) throw ApiError.notFound('Purchase not found.');
    if (p.status === 'voided') throw ApiError.badRequest('This purchase is already voided.');

    // remove the stock that this purchase added
    await applyStockChange(
      models,
      {
        fuelId: String(p.fuelId),
        type: 'void',
        quantity: -volume(p.quantity),
        refId: String(p._id),
        refType: 'purchase_void',
        reference: p.invoiceNumber || String(p._id),
        notes: `Voided purchase from ${p.supplierName}`,
        userId: auth.userId,
        userName: auth.name,
      },
      session,
    );

    p.status = 'voided';
    p.voidedAt = new Date();
    await p.save({ ...(session ? { session } : {}) });
    return p;
  });

  res.json(ok(purchase, 'Purchase voided and stock reversed.'));
});
