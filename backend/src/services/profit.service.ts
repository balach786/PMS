/**
 * CENTRALIZED ESTIMATED PROFIT SERVICE
 * ====================================
 * There is exactly ONE profit formula in the whole system. The dashboard, every
 * report, every date range and every export (CSV / XLSX / PDF) call into this
 * module, so the same period always produces the same number everywhere.
 *
 *   ESTIMATED PROFIT
 *     = TOTAL SALES REVENUE
 *     − FUEL COST OF SOLD FUEL   (purchase rate captured at the moment of sale)
 *     − OPERATING EXPENSES
 *
 * This is deliberately NOT double-entry accounting: no chart of accounts, no
 * depreciation, no tax. The figure is therefore always labelled
 * "Estimated Profit" — never "Net Profit" or "Accounting Profit".
 */
import type { TenantModels } from '../models/tenant/schemas.js';
import { money, volume } from '../utils/number.js';

/** The only label the product uses for this figure. */
export const PROFIT_LABEL = 'Estimated Profit';

export interface ProfitInput {
  /** Total sales revenue for the period (sum of sale.total). */
  revenue: number;
  /** Cost of the fuel that was actually sold (sum of sale.costTotal). */
  fuelCost: number;
  /** Operating expenses for the period. */
  expenses: number;
}

export interface ProfitResult {
  /** Revenue − fuelCost − expenses. The one number used everywhere. */
  estimatedProfit: number;
  /** Revenue − fuelCost (before operating expenses). */
  grossProfit: number;
  revenue: number;
  fuelCost: number;
  expenses: number;
  /** Estimated profit as a percentage of revenue (0 when there is no revenue). */
  marginPercent: number;
  label: typeof PROFIT_LABEL;
}

/**
 * The single profit calculation. Pure and side-effect free so it can be unit
 * tested and reused by every caller.
 */
export function calculateEstimatedProfit({ revenue, fuelCost, expenses }: ProfitInput): ProfitResult {
  const rev = money(revenue);
  const cost = money(fuelCost);
  const exp = money(expenses);
  const grossProfit = money(rev - cost);
  const estimatedProfit = money(grossProfit - exp);

  return {
    estimatedProfit,
    grossProfit,
    revenue: rev,
    fuelCost: cost,
    expenses: exp,
    marginPercent: rev > 0 ? money((estimatedProfit / rev) * 100) : 0,
    label: PROFIT_LABEL,
  };
}

export interface RangeProfit extends ProfitResult {
  liters: number;
  transactionCount: number;
}

/**
 * Aggregate a pump's database over a date window and run the ONE profit
 * calculation on it. `from` is inclusive, `to` is exclusive — the same window
 * convention the report service uses.
 */
export async function calculateEstimatedProfitForRange(
  models: TenantModels,
  from: Date,
  to: Date,
): Promise<RangeProfit> {
  const [salesAgg, expenseAgg] = await Promise.all([
    models.Sale.aggregate<{ revenue: number; cost: number; liters: number; count: number }>([
      { $match: { status: 'completed', saleAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          cost: { $sum: '$costTotal' },
          liters: { $sum: '$quantity' },
          count: { $sum: 1 },
        },
      },
    ]),
    models.Expense.aggregate<{ total: number }>([
      { $match: { status: 'active', date: { $gte: from, $lt: to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const result = calculateEstimatedProfit({
    revenue: salesAgg[0]?.revenue ?? 0,
    fuelCost: salesAgg[0]?.cost ?? 0,
    expenses: expenseAgg[0]?.total ?? 0,
  });

  return {
    ...result,
    liters: volume(salesAgg[0]?.liters ?? 0),
    transactionCount: salesAgg[0]?.count ?? 0,
  };
}
