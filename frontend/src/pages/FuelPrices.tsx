import { useState } from 'react';
import { Tag, History, Pencil, Check, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  StatusBadge,
  TableSkeleton,
} from '../components/ui';
import { useApi } from '../lib/useApi';
import { fieldErrors, http, list, toErrorMessage } from '../lib/api';
import { currency, dateTime, liters } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { FuelPrice, PriceHistoryRow } from '../lib/types';

/**
 * Daily fuel price board (sections 21 / 22).
 *
 * Updating a price writes the new rate to the fuel and appends a row to that
 * pump's price history. Sales are never rewritten - every sale keeps the rate
 * and fuel cost that applied when it was recorded (sections 24 / 28).
 */
export default function FuelPrices() {
  const { permissions, user } = useAuth();
  const toast = useToast();
  const canManage = permissions.fuels && user?.role !== 'cashier';

  const { data, loading, error, reload } = useApi<FuelPrice[]>(() => list<FuelPrice>('/fuel-prices'), []);

  const [editing, setEditing] = useState<FuelPrice | null>(null);
  const [form, setForm] = useState({ sellingPrice: '', purchasePrice: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [historyFuel, setHistoryFuel] = useState<FuelPrice | null>(null);
  const { data: history, loading: historyLoading } = useApi<{ items: PriceHistoryRow[] } | null>(
    () =>
      historyFuel
        ? http.get<{ items: PriceHistoryRow[] }>(`/fuels/${historyFuel._id}/price-history`)
        : Promise.resolve(null),
    [historyFuel?._id],
  );

  function openEdit(fuel: FuelPrice) {
    setEditing(fuel);
    setForm({ sellingPrice: String(fuel.sellingPrice), purchasePrice: String(fuel.purchasePrice) });
    setErrors({});
  }

  async function submit() {
    if (!editing) return;
    setErrors({});
    setSaving(true);
    try {
      const res = await http.patch<{ previousSellingPrice: number }>(`/fuels/${editing._id}/price`, {
        sellingPrice: Number(form.sellingPrice),
        purchasePrice: Number(form.purchasePrice),
      });
      toast.success(
        `${editing.name} price updated from ${currency(res.previousSellingPrice)} to ${currency(Number(form.sellingPrice))}. Past sales are unchanged.`,
      );
      setEditing(null);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not update the price.'));
    } finally {
      setSaving(false);
    }
  }

  const rows = data ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Fuel prices</h2>
          <p className="text-sm text-ink-500">
            Today&apos;s selling prices and purchase cost for every fuel. Changes apply to new sales only.
          </p>
        </div>
      </div>

      <Card className="mb-4 border-gold-200 bg-gold-50">
        <div className="flex items-start gap-3 p-4">
          <Tag className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
          <p className="text-sm text-gold-800">
            Updating a price <strong>never</strong> changes sales that were already recorded. Each sale permanently
            stores the selling rate and fuel cost that applied at the moment it was created, so historical reports
            stay accurate.
          </p>
        </div>
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : loading ? (
        <Card>
          <TableSkeleton rows={4} cols={6} />
        </Card>
      ) : rows.length ? (
        <Card className="overflow-hidden">
          <CardHeader title="Current prices" subtitle={`${rows.length} fuel type(s)`} />
          <div className="table-wrap">
            <table className="w-full min-w-[880px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className="th">Fuel</th>
                  <th className="th text-right">Selling Price</th>
                  <th className="th text-right">Purchase Cost</th>
                  <th className="th text-right">Margin</th>
                  <th className="th text-right">Stock / Capacity</th>
                  <th className="th">Last Updated</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((f) => {
                  const pct = f.capacity > 0 ? (f.currentStock / f.capacity) * 100 : null;
                  return (
                    <tr key={f._id} className="transition hover:bg-ink-50/60">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-7 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: f.color ?? '#1D3B61' }}
                          />
                          <div>
                            <p className="font-medium text-navy-800">{f.name}</p>
                            {f.code && <p className="text-xs text-ink-400">{f.code}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="td text-right">
                        <span className="font-semibold text-navy-900">
                          {currency(f.sellingPrice)}
                        </span>
                        <span className="text-xs text-ink-400">/{f.unit}</span>
                        {f.previousSellingPrice !== null && f.previousSellingPrice !== f.sellingPrice && (
                          <p className="text-xs text-ink-400 line-through">{currency(f.previousSellingPrice)}</p>
                        )}
                      </td>
                      <td className="td text-right text-ink-600">
                        {currency(f.purchasePrice)}
                        <span className="text-xs text-ink-400">/{f.unit}</span>
                      </td>
                      <td className="td text-right">
                        <Badge tone={f.margin > 0 ? 'green' : 'red'}>{currency(f.margin)}</Badge>
                      </td>
                      <td className="td text-right text-xs">
                        <span className="font-medium text-navy-800">{liters(f.currentStock)}</span>
                        {f.capacity > 0 && (
                          <>
                            <span className="text-ink-400"> / {liters(f.capacity)}</span>
                            <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-ink-100 ml-auto">
                              <div
                                className={cls2(pct)}
                                style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
                              />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="td text-xs text-ink-500">{dateTime(f.lastUpdated)}</td>
                      <td className="td">
                        <StatusBadge status={f.status} />
                      </td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setHistoryFuel(f)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                            title="View price history"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => openEdit(f)}
                              className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                              title="Update price"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title="No fuel types yet" message="Add a fuel type first, then set its price here." />
        </Card>
      )}

      {/* Update price modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Update ${editing?.name ?? ''} price`}
        description="The new rate applies to sales recorded from now on. Existing sales keep their original rate."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              <Check className="h-4 w-4" /> Save price
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={`Selling price (Rs. per ${editing?.unit ?? 'L'})`} required error={errors.sellingPrice}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.sellingPrice}
              onChange={(e) => setForm((p) => ({ ...p, sellingPrice: e.target.value }))}
              error={Boolean(errors.sellingPrice)}
            />
          </Field>
          <Field label={`Purchase cost (Rs. per ${editing?.unit ?? 'L'})`} error={errors.purchasePrice}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.purchasePrice}
              onChange={(e) => setForm((p) => ({ ...p, purchasePrice: e.target.value }))}
              error={Boolean(errors.purchasePrice)}
            />
          </Field>
          {editing && (
            <div className="rounded-lg border border-navy-100 bg-navy-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-600">Current selling price</span>
                <span className="font-semibold text-navy-900">
                  {currency(editing.sellingPrice)}/{editing.unit}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-ink-600">New margin per {editing.unit}</span>
                <span className="font-semibold text-navy-900">
                  {currency(Number(form.sellingPrice || 0) - Number(form.purchasePrice || 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Price history modal */}
      <Modal
        open={Boolean(historyFuel)}
        onClose={() => setHistoryFuel(null)}
        title={`${historyFuel?.name ?? ''} price history`}
        description="Every price change recorded on this pump."
        footer={
          <Button variant="secondary" onClick={() => setHistoryFuel(null)}>
            <X className="h-4 w-4" /> Close
          </Button>
        }
      >
        {historyLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : (history?.items ?? []).length ? (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-ink-50">
                <tr>
                  <th className="th">When</th>
                  <th className="th text-right">Selling</th>
                  <th className="th text-right">Purchase</th>
                  <th className="th">Changed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {history!.items.map((h) => (
                  <tr key={h._id}>
                    <td className="td text-xs text-ink-500">{dateTime(h.changedAt)}</td>
                    <td className="td text-right">
                      <span className="font-semibold text-navy-900">{currency(h.sellingPrice)}</span>
                      {h.previousSellingPrice !== h.sellingPrice && (
                        <span className="ml-1.5 text-xs text-ink-400 line-through">
                          {currency(h.previousSellingPrice)}
                        </span>
                      )}
                    </td>
                    <td className="td text-right text-ink-600">{currency(h.purchasePrice)}</td>
                    <td className="td text-xs text-ink-500">{h.changedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No price changes yet" message="Prices you update will be listed here." />
        )}
      </Modal>
    </>
  );
}

function cls2(pct: number | null): string {
  if (pct === null) return 'h-full bg-navy-700';
  if (pct <= 15) return 'h-full bg-red-500';
  if (pct <= 35) return 'h-full bg-gold-500';
  return 'h-full bg-lime-600';
}
