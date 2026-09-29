import type { ClientSession } from 'mongoose';
import type { TenantModels, StockTxType } from '../models/tenant/schemas.js';
import { ApiError } from '../utils/http.js';
import { volume } from '../utils/number.js';

const ALLOW_NEGATIVE = String(process.env.ALLOW_NEGATIVE_STOCK || 'false').toLowerCase() === 'true';

interface StockChangeInput {
  fuelId: string;
  type: StockTxType;
  /** signed quantity: positive adds to stock, negative removes */
  quantity: number;
  refId?: string | null;
  refType?: string | null;
  reference?: string;
  notes?: string;
  userId?: string | null;
  userName?: string;
  txnAt?: Date;
}

/**
 * Single place where fuel stock moves. Updates both:
 *  - the live `fuels.currentStock` value, and
 *  - the immutable `stockTransactions` ledger (source of truth for reports).
 */
export async function applyStockChange(
  models: TenantModels,
  input: StockChangeInput,
  session: ClientSession | null = null,
): Promise<{ balanceAfter: number; fuelName: string }> {
  const fuel = await models.Fuel.findById(input.fuelId).session(session ?? null);
  if (!fuel) throw ApiError.notFound('Fuel not found.');

  const qty = volume(input.quantity);
  const balanceAfter = volume(fuel.currentStock + qty);

  if (balanceAfter < 0 && !ALLOW_NEGATIVE) {
    throw ApiError.badRequest(
      `Not enough ${fuel.name} in stock. Available: ${volume(fuel.currentStock)} ${fuel.unit}, requested: ${Math.abs(qty)} ${fuel.unit}.`,
    );
  }

  fuel.currentStock = balanceAfter;
  await fuel.save({ ...(session ? { session } : {}) });

  await models.StockTransaction.create(
    [
      {
        fuelId: fuel._id,
        fuelName: fuel.name,
        type: input.type,
        quantity: qty,
        balanceAfter,
        refId: input.refId ?? null,
        refType: input.refType ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        userId: input.userId ?? null,
        userName: input.userName ?? '',
        txnAt: input.txnAt ?? new Date(),
      },
    ],
    { ...(session ? { session } : {}) },
  );

  return { balanceAfter, fuelName: fuel.name };
}

/**
 * Stock as derived purely from the ledger. Used by reports and to detect drift
 * (e.g. when an admin edits a fuel's stock by hand).
 */
export async function computeLedgerStock(models: TenantModels, fuelId: string): Promise<number> {
  const [agg] = await models.StockTransaction.aggregate<{ total: number }>([
    { $match: { fuelId: new (models.StockTransaction.base.Types.ObjectId)(fuelId) } },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]);
  return volume(agg?.total ?? 0);
}

export function isNegativeStockAllowed(): boolean {
  return ALLOW_NEGATIVE;
}
