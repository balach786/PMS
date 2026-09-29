import { useState } from 'react';
import { Droplets, Plus, AlertTriangle, History } from 'lucide-react';
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
  Pagination,
  Select,
  Skeleton,
  TableSkeleton,
} from '../components/ui';
import { ExportMenu } from '../components/ExportMenu';
import { DateRangeFilter, type RangeValue } from '../components/DateRangeFilter';
import { useApi } from '../lib/useApi';
import { useQueryAction, useQueryScroll, useQueryValue } from '../lib/useQueryParams';
import { fieldErrors, http, toErrorMessage } from '../lib/api';
import { currency, dateTime, liters, number } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { Fuel, StockTransaction } from '../lib/types';

interface StockOverview {
  rows: Array<{
    _id: string;
    name: string;
    code: string;
    unit: string;
    currentStock: number;
    minStockAlert: number;
    sellingPrice: number;
    purchasePrice: number;
    lowStock: boolean;
    stockValue: number;
    status: string;
  }>;
  totals: { totalStock: number; totalValue: number; lowStockCount: number };
}

interface LedgerResponse {
  items: StockTransaction[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const TYPE_LABEL: Record<string, string> = {
  opening: 'Opening',
  purchase: 'Purchase',
  sale: 'Sale',
  adjustment: 'Adjustment',
  void: 'Void',
};

const TYPE_TONE: Record<string, 'green' | 'gold' | 'navy' | 'gray' | 'red'> = {
  opening: 'gray',
  purchase: 'green',
  sale: 'navy',
  adjustment: 'gold',
  void: 'red',
};

export default function Stock() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = user?.role !== 'cashier';
  const [range, setRange] = useState<RangeValue>({ range: 'this_month' });
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [fuelFilter, setFuelFilter] = useState('');

  useQueryScroll('tab');

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ fuelId: '', type: 'adjustment', quantity: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: overview, loading, error, reload } = useApi<StockOverview>(() => http.get<StockOverview>('/stock/overview'), []);
  const { data: ledger, loading: ledgerLoading, reload: reloadLedger } = useApi<LedgerResponse>(
    () =>
      http.get<LedgerResponse>('/stock/ledger', {
        page,
        limit: 20,
        type: type || undefined,
        fuelId: fuelFilter || undefined,
        range: range.range,
        from: range.from,
        to: range.to,
      }),
    [page, type, fuelFilter, range.range, range.from, range.to],
  );

  async function submitAdjust() {
    setErrors({});
    const local: Record<string, string> = {};
    if (!adjustForm.fuelId) local.fuelId = 'Select a fuel';
    const qty = Number(adjustForm.quantity);
    if (!qty || qty === 0) local.quantity = 'Enter a non-zero quantity';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      const res = await http.post<{ fuelName: string; balanceAfter: number }>('/stock/adjust', {
        fuelId: adjustForm.fuelId,
        type: adjustForm.type,
        quantity: qty,
        notes: adjustForm.notes || undefined,
      });
      toast.success(`${res.fuelName} stock is now ${liters(res.balanceAfter)}.`);
      setAdjustOpen(false);
      setAdjustForm({ fuelId: '', type: 'adjustment', quantity: '', notes: '' });
      reload();
      reloadLedger();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not adjust the stock.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Overview cards */}
      {loading ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5"><Skeleton className="h-16 w-full" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="mb-4"><ErrorState message={error} onRetry={reload} /></Card>
      ) : (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Total fuel in stock</p>
            <p className="mt-1.5 text-2xl font-bold text-navy-900">{number(overview?.totals.totalStock ?? 0, 2)} L</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Stock value (at cost)</p>
            <p className="mt-1.5 text-2xl font-bold text-navy-900">{currency(overview?.totals.totalValue ?? 0)}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Low stock alerts</p>
            <p className={`mt-1.5 text-2xl font-bold ${overview?.totals.lowStockCount ? 'text-red-600' : 'text-lime-600'}`}>
              {overview?.totals.lowStockCount ?? 0}
            </p>
          </Card>
        </div>
      )}

      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title="Current stock by fuel"
          subtitle="Live levels with minimum-stock alerts"
          action={
            canManage ? (
              <Button size="sm" onClick={() => { setErrors({}); setAdjustOpen(true); }}>
                <Plus className="h-4 w-4" /> Adjust stock
              </Button>
            ) : undefined
          }
        />
        {loading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : (overview?.rows ?? []).length ? (
          <div className="table-wrap">
            <table className="w-full min-w-[640px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className="th">Fuel</th>
                  <th className="th text-right">Current stock</th>
                  <th className="th text-right">Min alert</th>
                  <th className="th text-right">Selling price</th>
                  <th className="th text-right">Stock value</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {overview!.rows.map((r) => (
                  <tr key={r._id} className="transition hover:bg-ink-50/60">
                    <td className="td font-medium text-navy-800">{r.name}</td>
                    <td className="td text-right font-semibold text-navy-900">
                      {number(r.currentStock, 2)} {r.unit}
                    </td>
                    <td className="td text-right text-ink-500">{number(r.minStockAlert, 0)} {r.unit}</td>
                    <td className="td text-right">{currency(r.sellingPrice)}</td>
                    <td className="td text-right">{currency(r.stockValue)}</td>
                    <td className="td">
                      {r.lowStock ? (
                        <Badge tone="red"><AlertTriangle className="h-3 w-3" /> Low</Badge>
                      ) : (
                        <Badge tone="green">Healthy</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No fuels configured" message="Add fuel types first to track stock." icon={<Droplets className="h-7 w-7" />} />
        )}
      </Card>

      <Card id="ledger" className="overflow-hidden">
        <CardHeader
          title="Stock movement history"
          subtitle="Every opening, purchase, sale, adjustment and void"
          action={
            <ExportMenu
              reportType="stock"
              params={{ range: range.range, from: range.from, to: range.to }}
              label="Export stock"
            />
          }
        />
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200/70 p-4">
          <Select value={fuelFilter} onChange={(e) => { setFuelFilter(e.target.value); setPage(1); }} className="w-auto min-w-[150px]">
            <option value="">All fuels</option>
            {overview?.rows.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </Select>
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-auto min-w-[150px]">
            <option value="">All movements</option>
            <option value="opening">Opening</option>
            <option value="purchase">Purchase</option>
            <option value="sale">Sale</option>
            <option value="adjustment">Adjustment</option>
            <option value="void">Void</option>
          </Select>
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />
        </div>

        {ledgerLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (ledger?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[720px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Fuel</th>
                    <th className="th">Type</th>
                    <th className="th text-right">Quantity</th>
                    <th className="th text-right">Balance after</th>
                    <th className="th">Reference / notes</th>
                    <th className="th">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {ledger!.items.map((t) => (
                    <tr key={t._id} className="transition hover:bg-ink-50/60">
                      <td className="td text-xs">{dateTime(t.txnAt)}</td>
                      <td className="td font-medium text-navy-800">{t.fuelName}</td>
                      <td className="td"><Badge tone={TYPE_TONE[t.type] ?? 'gray'}>{TYPE_LABEL[t.type] ?? t.type}</Badge></td>
                      <td className={`td text-right font-semibold ${t.quantity >= 0 ? 'text-lime-600' : 'text-red-600'}`}>
                        {t.quantity >= 0 ? '+' : ''}{number(t.quantity, 3)}
                      </td>
                      <td className="td text-right font-semibold text-navy-900">{number(t.balanceAfter, 3)}</td>
                      <td className="td max-w-[240px] truncate text-xs text-ink-500">{t.reference || t.notes || '—'}</td>
                      <td className="td text-xs">{t.userName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={ledger?.meta.page ?? 1}
              totalPages={ledger?.meta.totalPages ?? 1}
              total={ledger?.meta.total ?? 0}
              limit={20}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="No stock movements found"
            message="Movements appear when you record opening stock, purchases, sales or adjustments."
            icon={<History className="h-7 w-7" />}
          />
        )}
      </Card>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust stock"
        description="Use a positive quantity to add fuel (dip correction) and a negative one to remove it."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submitAdjust} loading={saving}>Save adjustment</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Fuel" required error={errors.fuelId}>
            <Select value={adjustForm.fuelId} onChange={(e) => setAdjustForm((p) => ({ ...p, fuelId: e.target.value }))} error={Boolean(errors.fuelId)}>
              <option value="">Select fuel</option>
              {overview?.rows.map((r) => (
                <option key={r._id} value={r._id}>{r.name} ({number(r.currentStock, 2)} {r.unit})</option>
              ))}
            </Select>
          </Field>
          <Field label="Movement type" required>
            <Select value={adjustForm.type} onChange={(e) => setAdjustForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="adjustment">Adjustment</option>
              <option value="opening">Opening stock</option>
            </Select>
          </Field>
          <Field label="Quantity (L)" required error={errors.quantity} hint="Positive adds stock, negative removes it">
            <Input
              type="number"
              step="0.001"
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm((p) => ({ ...p, quantity: e.target.value }))}
              error={Boolean(errors.quantity)}
            />
          </Field>
          <Field label="Notes">
            <Input value={adjustForm.notes} onChange={(e) => setAdjustForm((p) => ({ ...p, notes: e.target.value }))} placeholder="e.g. Dip reading correction" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
