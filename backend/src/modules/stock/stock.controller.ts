import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { withTransaction } from '../../db/tenant.js';
import { applyStockChange, computeLedgerStock, isNegativeStockAllowed } from '../../services/stock.service.js';
import { money, volume } from '../../utils/number.js';
import { parsePagination, paginateMeta } from '../../utils/pagination.js';
import { resolveRange } from '../../utils/dates.js';

export const overview = asyncHandler(async (req, res) => {
  const { Fuel } = req.tenant!;
  const fuels = await Fuel.find().sort({ name: 1 }).lean();

  const rows = fuels.map((f: (typeof fuels)[number]) => ({
    _id: String(f._id),
    name: f.name,
    code: f.code ?? '',
    unit: f.unit,
    currentStock: volume(f.currentStock),
    minStockAlert: volume(f.minStockAlert),
    sellingPrice: money(f.sellingPrice),
    purchasePrice: money(f.purchasePrice),
    lowStock: f.minStockAlert > 0 && f.currentStock <= f.minStockAlert,
    stockValue: money(f.currentStock * f.purchasePrice),
    status: f.status,
  }));

  const totals = rows.reduce(
    (acc: { totalStock: number; totalValue: number; lowStockCount: number }, r: { currentStock: number; stockValue: number; lowStock: boolean }) => ({
      totalStock: volume(acc.totalStock + r.currentStock),
      totalValue: money(acc.totalValue + r.stockValue),
      lowStockCount: acc.lowStockCount + (r.lowStock ? 1 : 0),
    }),
    { totalStock: 0, totalValue: 0, lowStockCount: 0 },
  );

  res.json(ok({ rows, totals, negativeStockAllowed: isNegativeStockAllowed() }));
});

export const ledger = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};
  if (req.query.fuelId) filter.fuelId = new mongoose.Types.ObjectId(String(req.query.fuelId));
  if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
  if (req.query.from || req.query.to) {
    const range = resolveRange('custom', req.query.from as string, req.query.to as string);
    filter.txnAt = { $gte: range.from, $lt: range.to };
  }

  const [items, total] = await Promise.all([
    models.StockTransaction.find(filter)
      .sort({ txnAt: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    models.StockTransaction.countDocuments(filter),
  ]);

  res.json(ok({ items, meta: paginateMeta(total, pagination) }));
});

export const adjustStock = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const models = req.tenant!;
  const { fuelId, type, quantity, notes } = req.body as {
    fuelId: string;
    type: 'opening' | 'adjustment';
    quantity: number;
    notes?: string;
  };

  const result = await withTransaction(auth.databaseName, async (session) => {
    return applyStockChange(
      models,
      {
        fuelId,
        type,
        quantity: volume(quantity),
        notes: notes || (type === 'opening' ? 'Opening stock' : 'Manual adjustment'),
        userId: auth.userId,
        userName: auth.name,
      },
      session,
    );
  });

  res.status(201).json(ok(result, `${result.fuelName} stock is now ${result.balanceAfter} L.`));
});

export const fuelHistory = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const fuel = await models.Fuel.findById(req.params.id).lean();
  if (!fuel) throw ApiError.notFound('Fuel not found.');

  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter = { fuelId: new mongoose.Types.ObjectId(String(fuel._id)) };

  const [items, total, ledgerStock] = await Promise.all([
    models.StockTransaction.find(filter).sort({ txnAt: -1, createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    models.StockTransaction.countDocuments(filter),
    computeLedgerStock(models, String(fuel._id)),
  ]);

  res.json(
    ok(
      { fuel, ledgerStock: volume(ledgerStock), items },
      undefined,
      paginateMeta(total, pagination),
    ),
  );
});
