import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, Printer, Ban, Pencil, Eye, Fuel as FuelIcon, Search, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Pagination,
  PaymentBadge,
  SearchInput,
  Select,
  StatusBadge,
  TableSkeleton,
} from '../components/ui';
import { DateRangeFilter, type RangeValue } from '../components/DateRangeFilter';
import { ExportMenu } from '../components/ExportMenu';
import { useApi } from '../lib/useApi';
import { useQueryAction, useQueryScroll, useQueryValue } from '../lib/useQueryParams';
import { fieldErrors, http, toErrorMessage, list } from '../lib/api';
import { currency, dateTime, liters, number, paymentLabel, toDateInput } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { Customer, Fuel, Sale } from '../lib/types';

interface SalesResponse {
  items: Sale[];
  meta: { page: number; limit: number; total: number; totalPages: number; summary?: { revenue: number; liters: number } };
}

interface NewSale {
  fuelId: string;
  quantity: string;
  rate: string;
  paymentMethod: 'cash' | 'card' | 'bank' | 'credit';
  customerId: string;
  notes: string;
  saleAt: string;
}

const EMPTY_SALE: NewSale = {
  fuelId: '',
  quantity: '',
  rate: '',
  paymentMethod: 'cash',
  customerId: '',
  notes: '',
  saleAt: toDateInput(new Date()),
};

export default function Sales() {
  const { can, user } = useAuth();
  const toast = useToast();

  const [range, setRange] = useState<RangeValue>({ range: 'this_month' });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [fuelId, setFuelId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  // sidebar "New Sale" lands on /app/sales?new=1
  useQueryAction('new', () => setCreateOpen(true));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NewSale>(EMPTY_SALE);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [voidSale, setVoidSale] = useState<Sale | null>(null);
  const [voiding, setVoiding] = useState(false);

  // debounce search
  const searchTimer = useMemo(() => ({ id: 0 as unknown as ReturnType<typeof setTimeout> }), []);

  const params = {
    page,
    limit: 20,
    search: debounced || undefined,
    fuelId: fuelId || undefined,
    paymentMethod: paymentMethod || undefined,
    range: range.range,
    from: range.from,
    to: range.to,
  };

  const { data: sales, loading, error, reload } = useApi<SalesResponse>(
    () => http.get<SalesResponse>('/sales', params),
    [page, debounced, fuelId, paymentMethod, range.range, range.from, range.to],
  );

  const { data: fuels } = useApi<Fuel[]>(() => list<Fuel>('/fuels'), []);
  const { data: customers } = useApi<Customer[]>(() => list<Customer>('/customers', { limit: 100 }), []);
  const { data: openShift } = useApi<{ _id: string; shiftNumber: string } | null>(
    () => http.get<{ _id: string; shiftNumber: string } | null>('/shifts/current'),
    [],
  );

  function onSearch(value: string) {
    setSearch(value);
    clearTimeout(searchTimer.id);
    searchTimer.id = setTimeout(() => {
      setDebounced(value);
      setPage(1);
    }, 350);
  }

  const selectedFuel = fuels?.find((f) => f._id === form.fuelId);
  const computedTotal = useMemo(() => {
    const q = Number(form.quantity);
    const r = Number(form.rate || selectedFuel?.sellingPrice || 0);
    if (!q || !r) return 0;
    return Math.round(q * r * 100) / 100;
  }, [form.quantity, form.rate, selectedFuel]);

  function openCreate() {
    setForm({
      ...EMPTY_SALE,
      fuelId: fuels?.[0]?._id ?? '',
      rate: String(fuels?.[0]?.sellingPrice ?? ''),
      saleAt: toDateInput(new Date()),
    });
    setErrors({});
    setCreateOpen(true);
  }

  async function submit() {
    setErrors({});
    const local: Record<string, string> = {};
    if (!form.fuelId) local.fuelId = 'Select a fuel type';
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) local.quantity = 'Enter a quantity greater than zero';
    const rate = Number(form.rate);
    if (!rate || rate < 0) local.rate = 'Enter a valid rate';
    if (form.paymentMethod === 'credit' && !form.customerId) local.customerId = 'Select a customer for credit sales';
    if (selectedFuel && qty > selectedFuel.currentStock) {
      local.quantity = `Only ${number(selectedFuel.currentStock, 2)} ${selectedFuel.unit} available`;
    }
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    setSaving(true);
    try {
      const created = await http.post<Sale>('/sales', {
        fuelId: form.fuelId,
        quantity: qty,
        rate,
        paymentMethod: form.paymentMethod,
        customerId: form.customerId || null,
        notes: form.notes || undefined,
        saleAt: form.saleAt ? new Date(`${form.saleAt}T${new Date().toTimeString().slice(0, 8)}`).toISOString() : undefined,
      });
      toast.success(`Sale ${created.invoiceNumber} recorded. Remaining stock: ${liters(created.remainingStock ?? 0)}`);
      setCreateOpen(false);
      setPage(1);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not record the sale.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmVoid() {
    if (!voidSale) return;
    setVoiding(true);
    try {
      await http.post(`/sales/${voidSale._id}/void`, { reason: 'Voided from sales screen' });
      toast.success(`Sale ${voidSale.invoiceNumber} voided and stock returned.`);
      setVoidSale(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not void this sale.'));
    } finally {
      setVoiding(false);
    }
  }

  const exportParams = { range: range.range, from: range.from, to: range.to, groupBy: 'none' };

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search invoice, fuel, customer..." className="min-w-[200px] flex-1" />
          <Select value={fuelId} onChange={(e) => { setFuelId(e.target.value); setPage(1); }} className="w-auto min-w-[140px]">
            <option value="">All fuels</option>
            {fuels?.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }} className="w-auto min-w-[140px]">
            <option value="">All payments</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank">Bank Transfer</option>
            <option value="credit">Credit</option>
          </Select>
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New sale
          </Button>
        </div>
        {(sales?.meta?.summary || search || fuelId || paymentMethod) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-200/70 px-4 py-2.5 text-xs text-ink-500">
            {sales?.meta?.summary && (
              <>
                <span>
                  Filtered revenue: <strong className="text-navy-800">{currency(sales.meta.summary.revenue)}</strong>
                </span>
                <span>·</span>
                <span>
                  Liters: <strong className="text-navy-800">{number(sales.meta.summary.liters, 2)}</strong>
                </span>
                <span>·</span>
              </>
            )}
            <span>
              {sales?.meta.total ?? 0} record{sales?.meta.total === 1 ? '' : 's'}
            </span>
            {(search || fuelId || paymentMethod) && (
              <button
                onClick={() => {
                  setSearch('');
                  setDebounced('');
                  setFuelId('');
                  setPaymentMethod('');
                  setPage(1);
                }}
                className="ml-auto inline-flex items-center gap-1 font-medium text-navy-700 hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </div>
        )}
      </Card>

      {user?.role === 'cashier' && !openShift && (
        <div className="mb-4 rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          You need an open shift before you can record a sale.{' '}
          <Link to="/app/shifts" className="font-semibold underline">
            Open a shift
          </Link>
          .
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Sales"
          subtitle="Every completed fuel sale with stock and credit effects"
          action={<ExportMenu reportType="sales" params={exportParams} label="Export sales" />}
        />

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : (sales?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[860px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Invoice</th>
                    <th className="th">Date</th>
                    <th className="th">Fuel</th>
                    <th className="th text-right">Liters</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Amount</th>
                    <th className="th">Payment</th>
                    <th className="th">Customer</th>
                    <th className="th">Cashier</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sales!.items.map((sale) => (
                    <tr key={sale._id} className="transition hover:bg-ink-50/60">
                      <td className="td font-mono text-xs">{sale.invoiceNumber}</td>
                      <td className="td text-xs">{dateTime(sale.saleAt)}</td>
                      <td className="td font-medium text-navy-800">{sale.fuelName}</td>
                      <td className="td text-right">{number(sale.quantity, 2)}</td>
                      <td className="td text-right">{currency(sale.rate)}</td>
                      <td className="td text-right font-semibold text-navy-900">{currency(sale.total)}</td>
                      <td className="td"><PaymentBadge method={sale.paymentMethod} /></td>
                      <td className="td">{sale.customerName || <span className="text-ink-300">—</span>}</td>
                      <td className="td text-xs">{sale.userName}</td>
                      <td className="td"><StatusBadge status={sale.status} /></td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailSale(sale)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <Link
                            to={`/app/sales/${sale._id}/receipt`}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                            title="Print receipt"
                          >
                            <Printer className="h-4 w-4" />
                          </Link>
                          {can('sales') && sale.status === 'completed' && user?.role !== 'cashier' && (
                            <button
                              onClick={() => setVoidSale(sale)}
                              className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                              title="Void sale"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={sales?.meta.page ?? 1}
              totalPages={sales?.meta.totalPages ?? 1}
              total={sales?.meta.total ?? 0}
              limit={sales?.meta.limit ?? 20}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="No sales found"
            message="Record your first fuel sale, or adjust the filters and date range."
            icon={<Receipt className="h-7 w-7" />}
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> New sale
              </Button>
            }
          />
        )}
      </Card>

      {/* New sale modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record a fuel sale"
        description="Quantity × rate is calculated automatically. Stock reduces as soon as the sale is saved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Save sale
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fuel" required error={errors.fuelId}>
              <Select
                value={form.fuelId}
                onChange={(e) => {
                  const fuel = fuels?.find((f) => f._id === e.target.value);
                  setForm((p) => ({ ...p, fuelId: e.target.value, rate: String(fuel?.sellingPrice ?? '') }));
                }}
                error={Boolean(errors.fuelId)}
              >
                <option value="">Select fuel</option>
                {fuels?.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} — {currency(f.sellingPrice)}/{f.unit} ({number(f.currentStock, 0)} {f.unit} in stock)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Payment method" required>
              <Select
                value={form.paymentMethod}
                onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as NewSale['paymentMethod'] }))}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank Transfer</option>
                <option value="credit">Credit</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Quantity (${selectedFuel?.unit ?? 'L'})`}
              required
              error={errors.quantity}
              hint={selectedFuel ? `Available: ${number(selectedFuel.currentStock, 2)} ${selectedFuel.unit}` : undefined}
            >
              <Input
                type="number"
                step="0.001"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                placeholder="0.00"
                error={Boolean(errors.quantity)}
              />
            </Field>

            <Field label={`Rate per ${selectedFuel?.unit ?? 'L'} (Rs.)`} required error={errors.rate}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.rate}
                onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                placeholder="0.00"
                error={Boolean(errors.rate)}
              />
            </Field>
          </div>

          {form.paymentMethod === 'credit' && (
            <Field label="Customer" required error={errors.customerId}>
              <Select
                value={form.customerId}
                onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}
                error={Boolean(errors.customerId)}
              >
                <option value="">Select customer</option>
                {customers?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} — balance {currency(c.currentBalance)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Date">
            <Input type="date" value={form.saleAt} onChange={(e) => setForm((p) => ({ ...p, saleAt: e.target.value }))} />
          </Field>

          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
          </Field>

          <div className="rounded-lg border border-navy-100 bg-navy-50 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink-600">Total amount</span>
              <span className="text-2xl font-bold text-navy-900">{currency(computedTotal)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {form.quantity || '0'} × {currency(Number(form.rate || 0))}
            </p>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={Boolean(detailSale)} onClose={() => setDetailSale(null)} title="Sale details" size="sm">
        {detailSale && (
          <dl className="space-y-2.5 text-sm">
            <DetailRow label="Invoice" value={<span className="font-mono">{detailSale.invoiceNumber}</span>} />
            <DetailRow label="Date" value={dateTime(detailSale.saleAt)} />
            <DetailRow label="Fuel" value={detailSale.fuelName} />
            <DetailRow label="Quantity" value={`${number(detailSale.quantity, 3)} L`} />
            <DetailRow label="Rate" value={currency(detailSale.rate)} />
            <DetailRow label="Total" value={<strong>{currency(detailSale.total)}</strong>} />
            <DetailRow label="Fuel cost" value={currency(detailSale.costTotal)} />
            <DetailRow label="Est. profit" value={<strong className="text-lime-600">{currency(detailSale.total - detailSale.costTotal)}</strong>} />
            <DetailRow label="Payment" value={paymentLabel(detailSale.paymentMethod)} />
            <DetailRow label="Customer" value={detailSale.customerName || '—'} />
            <DetailRow label="Cashier" value={detailSale.userName} />
            <DetailRow label="Status" value={<StatusBadge status={detailSale.status} />} />
            {detailSale.voidReason && <DetailRow label="Void reason" value={detailSale.voidReason} />}
          </dl>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(voidSale)}
        title="Void this sale?"
        message={`Sale ${voidSale?.invoiceNumber ?? ''} will be cancelled, the fuel will be returned to stock and any credit will be removed from the customer's balance. This cannot be undone.`}
        confirmLabel="Void sale"
        danger
        loading={voiding}
        onConfirm={confirmVoid}
        onCancel={() => setVoidSale(null)}
      />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink-100 pb-2.5 last:border-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-navy-800">{value}</dd>
    </div>
  );
}
