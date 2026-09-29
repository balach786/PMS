import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { getTenantConnection, withTransaction } from '../../db/tenant.js';
import { nextInvoiceNumber } from '../../utils/counters.js';
import { applyStockChange } from '../../services/stock.service.js';
import { applyCustomerTransaction, reverseCreditSale } from '../../services/customer-ledger.service.js';
import { money, volume } from '../../utils/number.js';
import { parsePagination, paginateMeta, escapeRegex } from '../../utils/pagination.js';
import { resolveRange } from '../../utils/dates.js';

function buildFilter(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  else if (query.status !== 'all') filter.status = 'completed';
  if (query.fuelId) filter.fuelId = new mongoose.Types.ObjectId(String(query.fuelId));
  if (query.customerId) filter.customerId = new mongoose.Types.ObjectId(String(query.customerId));
  if (query.shiftId) filter.shiftId = new mongoose.Types.ObjectId(String(query.shiftId));
  if (query.paymentMethod && query.paymentMethod !== 'all') filter.paymentMethod = query.paymentMethod;
  if (query.from || query.to) {
    const range = resolveRange('custom', query.from as string | undefined, query.to as string | undefined);
    filter.saleAt = { $gte: range.from, $lt: range.to };
  }
  if (query.search) {
    const term = escapeRegex(String(query.search).trim());
    filter.$or = [
      { invoiceNumber: { $regex: term, $options: 'i' } },
      { fuelName: { $regex: term, $options: 'i' } },
      { customerName: { $regex: term, $options: 'i' } },
      { userName: { $regex: term, $options: 'i' } },
    ];
  }
  return filter;
}

export const listSales = asyncHandler(async (req, res) => {
  const { Sale } = req.tenant!;
  const filter = buildFilter(req.query as Record<string, unknown>);
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);

  const [items, total] = await Promise.all([
    Sale.find(filter).sort({ saleAt: -1, createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Sale.countDocuments(filter),
  ]);

  const totals = await Sale.aggregate<{ revenue: number; liters: number; cost: number }>([
    { $match: filter },
    { $group: { _id: null, revenue: { $sum: '$total' }, liters: { $sum: '$quantity' }, cost: { $sum: '$costTotal' } } },
  ]);

  res.json(
    ok({
      items,
      meta: {
        ...paginateMeta(total, pagination),
        summary: {
          revenue: money(totals[0]?.revenue ?? 0),
          liters: volume(totals[0]?.liters ?? 0),
          cost: money(totals[0]?.cost ?? 0),
        },
      },
    }),
  );
});

export const getSale = asyncHandler(async (req, res) => {
  const { Sale } = req.tenant!;
  const sale = await Sale.findById(req.params.id).lean();
  if (!sale) throw ApiError.notFound('Sale not found.');
  res.json(ok(sale));
});

export const createSale = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const { fuelId, quantity, paymentMethod, customerId, notes, saleAt } = req.body as {
    fuelId: string;
    quantity: number;
    rate?: number;
    paymentMethod: 'cash' | 'card' | 'bank' | 'credit';
    customerId?: string | null;
    notes?: string;
    saleAt?: Date;
  };

  const databaseName = auth.databaseName;
  const models = req.tenant!;

  const result = await withTransaction(databaseName, async (session) => {
    const conn = await getTenantConnection(databaseName);

    const fuel = await models.Fuel.findById(fuelId).session(session ?? null);
    if (!fuel) throw ApiError.notFound('Fuel not found.');
    if (fuel.status !== 'active') throw ApiError.badRequest(`${fuel.name} is inactive and cannot be sold.`);

    const rate = money(req.body.rate ?? fuel.sellingPrice);
    if (rate <= 0) throw ApiError.badRequest('Please set a selling price for this fuel before recording a sale.');
    const qty = volume(quantity);
    const total = money(qty * rate);
    const costPrice = money(fuel.purchasePrice);
    const costTotal = money(qty * costPrice);

    // --- shift handling -------------------------------------------------
    let shiftId: mongoose.Types.ObjectId | null = null;
    if (req.body.shiftId) {
      shiftId = new mongoose.Types.ObjectId(String(req.body.shiftId));
    } else {
      const openShift = await models.Shift.findOne({ userId: auth.userId, status: 'open' })
        .sort({ openedAt: -1 })
        .session(session ?? null)
        .lean();
      if (openShift) shiftId = openShift._id as mongoose.Types.ObjectId;
    }
    if (auth.role === 'cashier' && !shiftId) {
      throw ApiError.badRequest('You must open a shift before you can record a sale.');
    }

    // --- customer (credit) ----------------------------------------------
    let resolvedCustomerId: Schema.Types.ObjectId | null = null;
    let customerName: string | null = null;
    if (customerId) {
      const customer = await models.Customer.findById(customerId).session(session ?? null);
      if (!customer) throw ApiError.notFound('Customer not found.');
      resolvedCustomerId = customer._id as unknown as Schema.Types.ObjectId;
      customerName = customer.name;
    }

    const saleDate = saleAt ? new Date(saleAt) : new Date();
    const invoiceNumber = await nextInvoiceNumber(models, conn, 'INV', session, saleDate);

    const [sale] = await models.Sale.create(
      [
        {
          invoiceNumber,
          fuelId: fuel._id,
          fuelName: fuel.name,
          quantity: qty,
          rate,
          total,
          costPrice,
          costTotal,
          paymentMethod,
          customerId: resolvedCustomerId,
          customerName,
          shiftId,
          userId: new mongoose.Types.ObjectId(auth.userId),
          userName: auth.name,
          notes: notes || '',
          status: 'completed',
          saleAt: saleDate,
        },
      ],
      { ...(session ? { session } : {}) },
    );

    // Stock decreases for every completed fuel sale.
    const { balanceAfter } = await applyStockChange(
      models,
      {
        fuelId: String(fuel._id),
        type: 'sale',
        quantity: -qty,
        refId: String(sale._id),
        refType: 'sale',
        reference: invoiceNumber,
        notes: `Sale ${invoiceNumber}`,
        userId: auth.userId,
        userName: auth.name,
        txnAt: saleDate,
      },
      session,
    );

    // Credit sale increases the customer balance.
    let balanceAfterPayment: number | null = null;
    if (paymentMethod === 'credit' && resolvedCustomerId) {
      const ledger = await applyCustomerTransaction(
        models,
        {
          customerId: String(resolvedCustomerId),
          type: 'credit_sale',
          amount: total,
          paymentMethod: 'credit',
          description: `Credit sale ${invoiceNumber} - ${fuel.name}`,
          saleId: String(sale._id),
          invoiceNumber,
          userId: auth.userId,
          userName: auth.name,
          txnAt: saleDate,
        },
        session,
      );
      balanceAfterPayment = ledger.balanceAfter;
    }

    return { sale, balanceAfter, balanceAfterPayment };
  });

  res.status(201).json(
    ok(
      { ...result.sale.toObject(), remainingStock: result.balanceAfter },
      `Sale ${result.sale.invoiceNumber} recorded successfully.`,
    ),
  );
});

export const updateSale = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const models = req.tenant!;
  const { quantity, rate, paymentMethod, customerId, notes } = req.body as {
    quantity?: number;
    rate?: number;
    paymentMethod?: 'cash' | 'card' | 'bank' | 'credit';
    customerId?: string | null;
    notes?: string;
  };

  const updated = await withTransaction(auth.databaseName, async (session) => {
    const sale = await models.Sale.findById(req.params.id).session(session ?? null);
    if (!sale) throw ApiError.notFound('Sale not found.');
    if (sale.status === 'voided') throw ApiError.badRequest('A voided sale cannot be edited.');

    const fuel = await models.Fuel.findById(sale.fuelId).session(session ?? null);
    if (!fuel) throw ApiError.notFound('Fuel linked to this sale no longer exists.');

    const prevQty = volume(sale.quantity);
    const newQty = quantity !== undefined ? volume(quantity) : prevQty;
    const newRate = money(rate ?? sale.rate);
    const newMethod = paymentMethod ?? sale.paymentMethod;

    // 1. reverse the old stock movement, 2. apply the new one
    const delta = volume(prevQty - newQty); // positive -> stock comes back
    if (delta !== 0) {
      await applyStockChange(
        models,
        {
          fuelId: String(fuel._id),
          type: 'adjustment',
          quantity: delta,
          refId: String(sale._id),
          refType: 'sale_edit',
          reference: sale.invoiceNumber,
          notes: `Sale ${sale.invoiceNumber} edited (${prevQty} -> ${newQty} ${fuel.unit})`,
          userId: auth.userId,
          userName: auth.name,
        },
        session,
      );
    }

    // 2. settle the credit ledger: undo the previous credit entry
    if (sale.paymentMethod === 'credit' && sale.customerId) {
      await reverseCreditSale(models, String(sale._id), session);
    }

    let resolvedCustomerId: Schema.Types.ObjectId | null = (sale.customerId as Schema.Types.ObjectId | null) ?? null;
    let customerName = sale.customerName;
    if (customerId !== undefined) {
      if (customerId) {
        const customer = await models.Customer.findById(customerId).session(session ?? null);
        if (!customer) throw ApiError.notFound('Customer not found.');
        resolvedCustomerId = customer._id as unknown as Schema.Types.ObjectId;
        customerName = customer.name;
      } else {
        resolvedCustomerId = null;
        customerName = null;
      }
    }

    if (newMethod === 'credit' && !resolvedCustomerId) {
      throw ApiError.badRequest('Select a customer for credit sales.');
    }

    sale.quantity = newQty;
    sale.rate = newRate;
    sale.total = money(newQty * newRate);
    sale.costPrice = money(fuel.purchasePrice);
    sale.costTotal = money(newQty * fuel.purchasePrice);
    sale.paymentMethod = newMethod;
    sale.customerId = resolvedCustomerId ?? null;
    sale.customerName = customerName ?? null;
    if (notes !== undefined) sale.notes = notes;
    await sale.save({ ...(session ? { session } : {}) });

    if (newMethod === 'credit' && resolvedCustomerId) {
      await applyCustomerTransaction(
        models,
        {
          customerId: String(resolvedCustomerId),
          type: 'credit_sale',
          amount: sale.total,
          paymentMethod: 'credit',
          description: `Credit sale ${sale.invoiceNumber} - ${sale.fuelName}`,
          saleId: String(sale._id),
          invoiceNumber: sale.invoiceNumber,
          userId: auth.userId,
          userName: auth.name,
          txnAt: sale.saleAt,
        },
        session,
      );
    }

    return sale;
  });

  res.json(ok(updated, `Sale ${updated.invoiceNumber} updated.`));
});

export const voidSale = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const models = req.tenant!;
  const { reason } = (req.body ?? {}) as { reason?: string };

  const sale = await withTransaction(auth.databaseName, async (session) => {
    const s = await models.Sale.findById(req.params.id).session(session ?? null);
    if (!s) throw ApiError.notFound('Sale not found.');
    if (s.status === 'voided') throw ApiError.badRequest('This sale is already voided.');

    // return the fuel to stock
    await applyStockChange(
      models,
      {
        fuelId: String(s.fuelId),
        type: 'void',
        quantity: volume(s.quantity),
        refId: String(s._id),
        refType: 'sale_void',
        reference: s.invoiceNumber,
        notes: `Voided sale ${s.invoiceNumber}${reason ? ` - ${reason}` : ''}`,
        userId: auth.userId,
        userName: auth.name,
      },
      session,
    );

    // remove the credit from the customer balance
    if (s.paymentMethod === 'credit' && s.customerId) {
      await reverseCreditSale(models, String(s._id), session);
    }

    s.status = 'voided';
    s.voidedAt = new Date();
    s.voidedBy = new mongoose.Types.ObjectId(auth.userId) as unknown as Schema.Types.ObjectId;
    s.voidReason = reason || 'Voided by user';
    await s.save({ ...(session ? { session } : {}) });
    return s;
  });

  res.json(ok(sale, `Sale ${sale.invoiceNumber} voided and stock returned.`));
});

/** Printable receipt payload (pump info + sale + totals). */
export const getReceipt = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const sale = await models.Sale.findById(req.params.id).lean();
  if (!sale) throw ApiError.notFound('Sale not found.');

  const { Pump } = await (await import('../../db/master.js')).connectMaster();
  const pump = await Pump.findById(req.auth!.pumpId).lean();

  res.json(
    ok({
      pump: {
        name: pump?.name ?? req.auth!.pumpName,
        address: pump?.address ?? '',
        phone: pump?.phone ?? '',
        ownerName: pump?.ownerName ?? '',
      },
      sale: {
        invoiceNumber: sale.invoiceNumber,
        date: sale.saleAt,
        fuelName: sale.fuelName,
        quantity: sale.quantity,
        rate: sale.rate,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        customerName: sale.customerName ?? null,
        cashier: sale.userName,
        notes: sale.notes ?? '',
        status: sale.status,
      },
      printedAt: new Date(),
    }),
  );
});
