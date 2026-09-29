import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/http.js';
import { money, volume } from '../../utils/number.js';
import { computeLedgerStock } from '../../services/stock.service.js';
import { startOfDay } from '../../utils/dates.js';
import type { TenantModels } from '../../models/tenant/schemas.js';

/**
 * DASHBOARD NOTIFICATIONS (build spec section 9)
 * ==============================================
 * Every alert here is DERIVED FROM LIVE DATA at request time - nothing is
 * pre-generated, seeded or faked. If the underlying condition is fixed (stock
 * refuelled, shift opened, price change ages past 24 h) the alert disappears
 * on the next request.
 *
 * The `notifications` collection only stores which alerts a user has dismissed,
 * so the bell can show an honest unread count.
 */

export type AlertLevel = 'danger' | 'warning' | 'info';

export interface Alert {
  /** stable key, used for dismissal: e.g. "stock-critical:<fuelId>" */
  key: string;
  level: AlertLevel;
  title: string;
  message: string;
  /** in-app route this alert points at */
  link: string;
  /** when the underlying condition was observed */
  at: Date;
  dismissed: boolean;
}

const HOURS = 60 * 60 * 1000;

/** Low-stock threshold as a fraction of tank capacity (20%). */
const LOW_STOCK_FRACTION = 0.2;
/** A shift left open longer than this is flagged. */
const LONG_SHIFT_HOURS = 12;
/** How long a price change stays in the feed. */
const PRICE_CHANGE_WINDOW_HOURS = 24;

/**
 * Builds the alert list for one pump. Pure with respect to the request: same
 * database state in -> same alerts out.
 */
export async function buildAlerts(models: TenantModels): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();

  // ---- stock: critical and low levels (§15) --------------------------------
  const fuels = await models.Fuel.find({ status: 'active' }).sort({ name: 1 }).lean();
  for (const fuel of fuels) {
    const capacity = Number(fuel.capacity ?? 0);
    const current = Number(fuel.currentStock ?? 0);
    const minAlert = Number(fuel.minStockAlert ?? 0);

    const critical = minAlert > 0 && current <= minAlert;
    const low =
      !critical &&
      ((capacity > 0 && current / capacity <= LOW_STOCK_FRACTION) ||
        (minAlert > 0 && current <= minAlert * 1.5));

    if (!critical && !low) continue;

    alerts.push({
      key: `stock-${critical ? 'critical' : 'low'}:${String(fuel._id)}`,
      level: critical ? 'danger' : 'warning',
      title: critical ? `${fuel.name} is critically low` : `${fuel.name} is running low`,
      message:
        `${volume(current)} ${fuel.unit} left` +
        (capacity > 0 ? ` of ${volume(capacity)} ${fuel.unit} capacity` : '') +
        (minAlert > 0 ? ` (alert level ${volume(minAlert)} ${fuel.unit})` : '') +
        '. Book a purchase before the tank runs dry.',
      link: '/app/stock',
      at: now,
      dismissed: false,
    });
  }

  // ---- stock ledger mismatch (integrity) -----------------------------------
  for (const fuel of fuels) {
    const ledger = await computeLedgerStock(models, String(fuel._id));
    const difference = volume(fuel.currentStock - ledger);
    if (Math.abs(difference) < 0.001) continue;

    alerts.push({
      key: `stock-mismatch:${String(fuel._id)}`,
      level: 'danger',
      title: `${fuel.name} stock does not match its ledger`,
      message: `Live level ${volume(fuel.currentStock)} ${fuel.unit} vs ledger ${volume(ledger)} ${fuel.unit} (difference ${difference}). Open Stock and reconcile it.`,
      link: '/app/stock',
      at: now,
      dismissed: false,
    });
  }

  // ---- shifts (§18 / §32) ---------------------------------------------------
  const openShift = await models.Shift.findOne({ status: 'open' }).sort({ openedAt: -1 }).lean();
  if (!openShift) {
    alerts.push({
      key: 'shift:closed',
      level: 'warning',
      title: 'No shift is open',
      message: 'Open a shift before recording sales so cash totals are tracked against a cashier.',
      link: '/app/shifts',
      at: now,
      dismissed: false,
    });
  } else {
    const ageHours = (now.getTime() - new Date(openShift.openedAt).getTime()) / HOURS;
    if (ageHours > LONG_SHIFT_HOURS) {
      alerts.push({
        key: `shift:long:${String(openShift._id)}`,
        level: 'warning',
        title: 'Shift has been open a long time',
        message: `${openShift.userName} opened this shift ${Math.floor(ageHours)} hours ago. Close it and open a fresh one so the day's cash reconciles.`,
        link: '/app/shifts',
        at: new Date(openShift.openedAt),
        dismissed: false,
      });
    }
  }

  // ---- credit outstanding (§31) --------------------------------------------
  const creditCutoff = startOfDay(now);
  const creditAgg = await models.Customer.aggregate<{ outstanding: number; customers: number }>([
    { $match: { status: 'active', currentBalance: { $gt: 0 } } },
    { $group: { _id: null, outstanding: { $sum: '$currentBalance' }, customers: { $sum: 1 } } },
  ]);
  const outstanding = money(creditAgg[0]?.outstanding ?? 0);
  const creditCustomers = creditAgg[0]?.customers ?? 0;

  if (outstanding > 0) {
    const top = await models.Customer.find({ status: 'active', currentBalance: { $gt: 0 } })
      .sort({ currentBalance: -1 })
      .limit(3)
      .lean();
    const names = top.map((c) => `${c.name} (Rs. ${money(c.currentBalance).toLocaleString('en-US')})`);
    alerts.push({
      key: `credit-outstanding:${creditCutoff.toISOString().slice(0, 10)}`,
      level: 'info',
      title: `Rs. ${outstanding.toLocaleString('en-US')} outstanding on credit`,
      message: `${creditCustomers} customer(s) owe this pump. Largest: ${names.join(', ')}.`,
      link: '/app/customers?tab=credit',
      at: now,
      dismissed: false,
    });
  }

  // ---- price changes in the last 24 h (§21 / §22) ---------------------------
  const since = new Date(now.getTime() - PRICE_CHANGE_WINDOW_HOURS * HOURS);
  const recentPrices = await models.PriceHistory.find({ changedAt: { $gte: since }, source: { $ne: 'create' } })
    .sort({ changedAt: -1 })
    .limit(5)
    .lean();

  for (const change of recentPrices) {
    if (Math.abs(money(change.sellingPrice) - money(change.previousSellingPrice)) < 0.001) continue;
    alerts.push({
      key: `price-change:${String(change._id)}`,
      level: 'info',
      title: `${change.fuelName} price changed`,
      message: `Rs. ${money(change.previousSellingPrice)} → Rs. ${money(change.sellingPrice)} per unit${
        change.changedByName ? ` by ${change.changedByName}` : ''
      }. Sales already recorded keep their original rate.`,
      link: '/app/fuel-prices',
      at: change.changedAt,
      dismissed: false,
    });
  }

  // danger first, then warnings, then info; newest first within a level
  const order: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };
  return alerts.sort(
    (a, b) =>
      order[a.level] - order[b.level] || new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

/** GET /notifications - live alerts for the signed-in user. */
export const listNotifications = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const userId = new mongoose.Types.ObjectId(req.auth!.userId);

  const [alerts, dismissed] = await Promise.all([
    buildAlerts(models),
    models.Notification.find({ userId }).lean(),
  ]);

  const dismissedKeys = new Set(dismissed.map((d) => d.key));
  const items = alerts.map((a) => ({ ...a, dismissed: dismissedKeys.has(a.key) }));
  const unreadCount = items.filter((a) => !a.dismissed).length;

  res.json(
    ok(
      { items },
      undefined,
      { total: items.length, unreadCount },
    ),
  );
});

/** POST /notifications/dismiss - body: { keys: string[] } */
export const dismissNotifications = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const userId = new mongoose.Types.ObjectId(req.auth!.userId);
  const keys: unknown = (req.body as { keys?: unknown })?.keys;

  const list = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
  if (!list.length) {
    res.json(ok({ dismissed: 0 }));
    return;
  }

  const ops = list.map((key) => ({
    updateOne: {
      filter: { userId, key },
      update: { $set: { userId, key, dismissedAt: new Date() } },
      upsert: true,
    },
  }));
  const result = await models.Notification.bulkWrite(ops);

  res.json(ok({ dismissed: result.upsertedCount + result.modifiedCount }));
});

/** DELETE /notifications/dismissed - clears dismissals so alerts come back. */
export const clearDismissed = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const result = await models.Notification.deleteMany({
    userId: new mongoose.Types.ObjectId(req.auth!.userId),
  });
  res.json(ok({ cleared: result.deletedCount ?? 0 }));
});
