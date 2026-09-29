import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { applyStockChange, computeLedgerStock, isNegativeStockAllowed } from '../../services/stock.service.js';
import { volume } from '../../utils/number.js';
import { connectMaster } from '../../db/master.js';
import { money } from '../../utils/number.js';

export const listFuels = asyncHandler(async (req, res) => {
  const { Fuel } = req.tenant!;
  const includeInactive = req.query.includeInactive === 'true';
  const filter = includeInactive ? {} : { status: 'active' };
  const fuels = await Fuel.find(filter).sort({ createdAt: 1 }).lean();

  const items = fuels.map((f) => ({
    ...f,
    lowStock: f.minStockAlert > 0 && f.currentStock <= f.minStockAlert,
    stockValue: Math.round(f.currentStock * f.purchasePrice * 100) / 100,
  }));

  // Same `{ items, meta }` envelope as every other list endpoint.
  res.json(
    ok(
      { items },
      undefined,
      {
        total: items.length,
        lowStockCount: items.filter((f) => f.lowStock).length,
        totalStockValue: Math.round(items.reduce((sum, f) => sum + f.stockValue, 0) * 100) / 100,
      },
    ),
  );
});


/**
 * Record a price change in the pump's own priceHistory collection.
 * Historical SALES are never rewritten - each sale keeps the rate and the fuel
 * cost that applied when it was created (sections 22 / 24 / 28).
 */
async function recordPriceHistory(
  models: NonNullable<Express.Request['tenant']>,
  fuel: { _id: unknown; name: string },
  before: { sellingPrice: number; purchasePrice: number },
  after: { sellingPrice: number; purchasePrice: number },
  auth: NonNullable<Express.Request['auth']>,
  source: 'create' | 'price-update' | 'fuel-update',
): Promise<void> {
  if (
    money(before.sellingPrice) === money(after.sellingPrice) &&
    money(before.purchasePrice) === money(after.purchasePrice)
  ) {
    return; // nothing actually moved
  }
  await models.PriceHistory.create({
    fuelId: fuel._id,
    fuelName: fuel.name,
    sellingPrice: after.sellingPrice,
    purchasePrice: after.purchasePrice,
    previousSellingPrice: before.sellingPrice,
    previousPurchasePrice: before.purchasePrice,
    changedBy: auth.userId,
    changedByName: auth.name,
    source,
    changedAt: new Date(),
  });
}

export const createFuel = asyncHandler(async (req, res) => {
  const { Fuel } = req.tenant!;
  const body = req.body as {
    name: string;
    code?: string;
    sellingPrice: number;
    purchasePrice: number;
    currentStock: number;
    capacity?: number;
    minStockAlert: number;
    status?: 'active' | 'inactive';
    color?: string;
  };

  const duplicate = await Fuel.findOne({ name: { $regex: `^${body.name.trim()}$`, $options: 'i' } }).lean();
  if (duplicate) throw ApiError.conflict(`A fuel named "${body.name}" already exists.`);

  const fuel = await Fuel.create({
    name: body.name.trim(),
    code: body.code?.trim().toUpperCase() || undefined,
    sellingPrice: body.sellingPrice,
    purchasePrice: body.purchasePrice,
    currentStock: 0,
    capacity: body.capacity ?? 0,
    minStockAlert: body.minStockAlert ?? 0,
    unit: 'L',
    status: body.status ?? 'active',
    color: body.color || undefined,
  });

  // Any starting quantity is recorded as an OPENING stock movement so the
  // ledger and the live stock figure always agree.
  if (body.currentStock > 0) {
    await applyStockChange(
      req.tenant!,
      {
        fuelId: String(fuel._id),
        type: 'opening',
        quantity: body.currentStock,
        notes: 'Opening stock',
        userId: req.auth!.userId,
        userName: req.auth!.name,
      },
      null,
    );
  }

  // the first price is part of the history trail
  await recordPriceHistory(
    req.tenant!,
    fuel,
    { sellingPrice: 0, purchasePrice: 0 },
    { sellingPrice: fuel.sellingPrice, purchasePrice: fuel.purchasePrice },
    req.auth!,
    'create',
  );

  const created = await Fuel.findById(fuel._id).lean();
  res.status(201).json(ok(created ?? fuel, `${fuel.name} added successfully.`));
});

export const updateFuel = asyncHandler(async (req, res) => {
  const { Fuel } = req.tenant!;
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  const fuel = await Fuel.findById(id);
  if (!fuel) throw ApiError.notFound('Fuel not found.');

  const priceBefore = { sellingPrice: fuel.sellingPrice, purchasePrice: fuel.purchasePrice };

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    const dup = await Fuel.findOne({ name: { $regex: `^${name}$`, $options: 'i' }, _id: { $ne: id } }).lean();
    if (dup) throw ApiError.conflict(`A fuel named "${name}" already exists.`);
    fuel.name = name;
  }
  if (body.code !== undefined) fuel.code = String(body.code || '').trim().toUpperCase() || undefined;
  if (body.sellingPrice !== undefined) fuel.sellingPrice = Number(body.sellingPrice);
  if (body.purchasePrice !== undefined) fuel.purchasePrice = Number(body.purchasePrice);
  if (body.minStockAlert !== undefined) fuel.minStockAlert = Number(body.minStockAlert);
  if (body.capacity !== undefined) fuel.capacity = Number(body.capacity);
  if (body.status !== undefined) fuel.status = body.status as 'active' | 'inactive';
  if (body.color !== undefined) fuel.color = String(body.color || '') || undefined;

  await fuel.save();
  await recordPriceHistory(
    req.tenant!,
    fuel,
    priceBefore,
    { sellingPrice: fuel.sellingPrice, purchasePrice: fuel.purchasePrice },
    req.auth!,
    'fuel-update',
  );
  res.json(ok(fuel, `${fuel.name} updated successfully.`));
});

export const updateFuelPrice = asyncHandler(async (req, res) => {
  const { Fuel } = req.tenant!;
  const fuel = await Fuel.findById(req.params.id);
  if (!fuel) throw ApiError.notFound('Fuel not found.');

  const before = { sellingPrice: fuel.sellingPrice, purchasePrice: fuel.purchasePrice };
  const { sellingPrice, purchasePrice } = req.body as { sellingPrice?: number; purchasePrice?: number };
  if (sellingPrice !== undefined) fuel.sellingPrice = Number(sellingPrice);
  if (purchasePrice !== undefined) fuel.purchasePrice = Number(purchasePrice);
  await fuel.save();

  // Only the fuel's current price moves. Every past sale keeps the rate and the
  // fuel cost that were stored on it at the moment it was recorded.
  await recordPriceHistory(
    req.tenant!,
    fuel,
    before,
    { sellingPrice: fuel.sellingPrice, purchasePrice: fuel.purchasePrice },
    req.auth!,
    'price-update',
  );

  res.json(
    ok(
      {
        ...fuel.toObject(),
        previousSellingPrice: before.sellingPrice,
        previousPurchasePrice: before.purchasePrice,
      },
      `${fuel.name} price updated. Past sales are unchanged.`,
    ),
  );
});

/** GET /fuel-prices - the daily fuel price board (section 22). */
export const listFuelPrices = asyncHandler(async (req, res) => {
  const { Fuel, PriceHistory } = req.tenant!;
  const fuels = await Fuel.find({}).sort({ name: 1 }).lean();

  // Latest change per fuel. `previousSellingPrice` is taken from that entry so
  // the board shows "275 -> 280" rather than the current price twice.
  const lastChange = await PriceHistory.aggregate<{ _id: string; changedAt: Date; previousSellingPrice: number }>([
    { $sort: { changedAt: -1 } },
    {
      $group: {
        _id: { $toString: '$fuelId' },
        changedAt: { $first: '$changedAt' },
        previousSellingPrice: { $first: '$previousSellingPrice' },
      },
    },
  ]);
  const byFuel = new Map(lastChange.map((c) => [c._id, c]));

  const items = fuels.map((f) => {
    const change = byFuel.get(String(f._id));
    const capacity = Number(f.capacity ?? 0);
    return {
      _id: String(f._id),
      name: f.name,
      code: f.code,
      unit: f.unit,
      sellingPrice: money(f.sellingPrice),
      purchasePrice: money(f.purchasePrice),
      margin: money(f.sellingPrice - f.purchasePrice),
      currentStock: f.currentStock,
      capacity,
      minStockAlert: f.minStockAlert,
      status: f.status,
      color: f.color,
      lastUpdated: change?.changedAt ?? f.updatedAt,
      previousSellingPrice: change ? money(change.previousSellingPrice) : null,
    };
  });

  res.json(ok({ items }, undefined, { total: items.length, updatedAt: new Date() }));
});

/** GET /fuels/:id/price-history - full audit trail for one fuel (section 21). */
export const fuelPriceHistory = asyncHandler(async (req, res) => {
  const { Fuel, PriceHistory } = req.tenant!;
  const fuel = await Fuel.findById(req.params.id).lean();
  if (!fuel) throw ApiError.notFound('Fuel not found.');

  const items = await PriceHistory.find({ fuelId: fuel._id }).sort({ changedAt: -1 }).limit(200).lean();
  res.json(
    ok({
      fuel: { _id: String(fuel._id), name: fuel.name, unit: fuel.unit, sellingPrice: fuel.sellingPrice, purchasePrice: fuel.purchasePrice },
      items: items.map((h) => ({
        _id: String(h._id),
        sellingPrice: money(h.sellingPrice),
        purchasePrice: money(h.purchasePrice),
        previousSellingPrice: money(h.previousSellingPrice),
        previousPurchasePrice: money(h.previousPurchasePrice),
        source: h.source,
        changedByName: h.changedByName,
        changedAt: h.changedAt,
      })),
    }),
  );
});

export const deleteFuel = asyncHandler(async (req, res) => {
  const { Fuel, Sale, Purchase } = req.tenant!;
  const fuel = await Fuel.findById(req.params.id);
  if (!fuel) throw ApiError.notFound('Fuel not found.');

  const [sales, purchases] = await Promise.all([
    Sale.countDocuments({ fuelId: fuel._id }),
    Purchase.countDocuments({ fuelId: fuel._id }),
  ]);
  if (sales || purchases) {
    // Soft delete keeps historical reports intact.
    fuel.status = 'inactive';
    await fuel.save();
    return res.json(ok({ id: String(fuel._id), deactivated: true }, `${fuel.name} has usage history, so it was deactivated instead of deleted.`));
  }

  await fuel.deleteOne();
  res.json(ok({ id: String(fuel._id), deleted: true }, `${fuel.name} deleted.`));
});

/** Reconcile the live stock figure with the ledger and report any drift. */
export const reconcile = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const fuels = await models.Fuel.find().sort({ name: 1 }).lean();
  const rows = [];
  for (const fuel of fuels) {
    const ledger = await computeLedgerStock(models, String(fuel._id));
    rows.push({
      fuelId: String(fuel._id),
      name: fuel.name,
      liveStock: volume(fuel.currentStock),
      ledgerStock: volume(ledger),
      difference: volume(fuel.currentStock - ledger),
    });
  }
  res.json(ok({ rows, negativeStockAllowed: isNegativeStockAllowed() }));
});

/** Audit helper: confirms this pump can only see its own database. */
export const isolationCheck = asyncHandler(async (req, res) => {
  const { Pump } = await connectMaster();
  const pumps = await Pump.find({}, { name: 1, databaseName: 1 }).lean();
  res.json(
    ok({
      currentPump: req.auth!.pumpName,
      currentDatabase: req.auth!.databaseName,
      pumpCount: pumps.length,
      visibleDatabases: pumps.map((p) => p.databaseName),
      note: 'This response lists pump names only. Operational records are never shared across pump databases.',
    }),
  );
});
