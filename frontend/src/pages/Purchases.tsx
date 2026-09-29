import { useMemo, useState } from 'react';
import { Plus, Truck, Ban, Droplets } from 'lucide-react';
import {
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
import { currency, dateShort, liters, number, toDateInput } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Fuel, Purchase, Supplier } from '../lib/types';

interface PurchaseResponse {
  items: Purchase[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    totalAmount?: number;
    totalQuantity?: number;
  };
}

const EMPTY = {
  supplierId: '',
  fuelId: '',
  quantity: '',
  purchaseRate: '',
  invoiceNumber: '',
  date: toDateInput(new Date()),
  notes: '',
  paymentMethod: 'bank' as 'cash' | 'card' | 'bank' | 'credit',
};

export default function Purchases() {
  const toast = useToast();
  const [range, setRange] = useState<RangeValue>({ range: 'this_month' });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [fuelId, setFuelId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  useQueryAction('new', () => { setForm(EMPTY); setErrors({}); setModalOpen(true); });
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<Purchase | null>(null);
  const [voiding, setVoiding] = useState(false);

  const timer = useMemo(() => ({ id: 0 as unknown as ReturnType<typeof setTimeout> }), []);

  const { data, loading, error, reload } = useApi<PurchaseResponse>(
    () =>
      http.get<PurchaseResponse>('/purchases', {
        page,
        limit: 20,
        search: debounced || undefined,
        fuelId: fuelId || undefined,
        supplierId: supplierId || undefined,
        range: range.range,
        from: range.from,
        to: range.to,
      }),
    [page, debounced, fuelId, supplierId, range.range, range.from, range.to],
  );

  const { data: suppliers } = useApi<Supplier[]>(() => list<Supplier>('/suppliers', { limit: 100 }), []);
  const { data: fuels } = useApi<Fuel[]>(() => list<Fuel>('/fuels'), []);

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout(timer.id);
    timer.id = setTimeout(() => {
      setDebounced(v);
      setPage(1);
    }, 350);
  }

  const total = useMemo(() => {
    const q = Number(form.quantity) || 0;
    const r = Number(form.purchaseRate) || 0;
    return Math.round(q * r * 100) / 100;
  }, [form.quantity, form.purchaseRate]);

  async function submit() {
    setErrors({});
    const local: Record<string, string> = {};
    if (!form.supplierId) local.supplierId = 'Select a supplier';
    if (!form.fuelId) local.fuelId = 'Select a fuel';
    if (!Number(form.quantity) || Number(form.quantity) <= 0) local.quantity = 'Enter a quantity greater than zero';
    if (Number(form.purchaseRate) < 0) local.purchaseRate = 'Purchase rate cannot be negative';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      const res = await http.post<Purchase & { newStock?: number }>('/purchases', {
        supplierId: form.supplierId,
        fuelId: form.fuelId,
        quantity: Number(form.quantity),
        purchaseRate: Number(form.purchaseRate),
        invoiceNumber: form.invoiceNumber || undefined,
        date: new Date(`${form.date}T12:00:00`).toISOString(),
        notes: form.notes || undefined,
        paymentMethod: form.paymentMethod,
      });
      toast.success(`Purchase recorded. ${res.fuelName} stock is now ${liters(res.newStock ?? 0)}.`);
      setModalOpen(false);
      setForm(EMPTY);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not record the purchase.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await http.post(`/purchases/${voidTarget._id}/void`, {});
      toast.success('Purchase voided and stock reversed.');
      setVoidTarget(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not void the purchase.'));
    } finally {
      setVoiding(false);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search invoice, supplier, fuel..." className="min-w-[200px] flex-1" />
          <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPage(1); }} className="w-auto min-w-[150px]">
            <option value="">All suppliers</option>
            {suppliers?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
          <Select value={fuelId} onChange={(e) => { setFuelId(e.target.value); setPage(1); }} className="w-auto min-w-[130px]">
            <option value="">All fuels</option>
            {fuels?.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
          </Select>
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />
          <Button onClick={() => { setForm(EMPTY); setErrors({}); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> Record purchase
          </Button>
        </div>
        {data?.meta?.totalAmount !== undefined && (
          <div className="border-t border-ink-200/70 px-4 py-2.5 text-xs text-ink-500">
            Filtered total: <strong className="text-navy-800">{currency(data.meta.totalAmount)}</strong> ·{' '}
            <strong className="text-navy-800">{liters(data.meta.totalQuantity ?? 0)}</strong> purchased
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Fuel purchases"
          subtitle="Tanker deliveries — each purchase adds stock"
          action={<ExportMenu reportType="fuel" params={{ range: range.range, from: range.from, to: range.to }} label="Export fuel" />}
        />

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : (data?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[820px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Invoice</th>
                    <th className="th">Date</th>
                    <th className="th">Supplier</th>
                    <th className="th">Fuel</th>
                    <th className="th text-right">Quantity</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Amount</th>
                    <th className="th">Payment</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data!.items.map((p) => (
                    <tr key={p._id} className={`transition hover:bg-ink-50/60 ${p.status === 'voided' ? 'opacity-60' : ''}`}>
                      <td className="td font-mono text-xs">{p.invoiceNumber || '—'}</td>
                      <td className="td text-xs">{dateShort(p.date)}</td>
                      <td className="td">{p.supplierName}</td>
                      <td className="td font-medium text-navy-800">{p.fuelName}</td>
                      <td className="td text-right">{number(p.quantity, 2)} L</td>
                      <td className="td text-right">{currency(p.purchaseRate)}</td>
                      <td className="td text-right font-semibold text-navy-900">{currency(p.totalAmount)}</td>
                      <td className="td"><PaymentBadge method={p.paymentMethod} /></td>
                      <td className="td"><StatusBadge status={p.status} /></td>
                      <td className="td text-right">
                        {p.status === 'active' && (
                          <button
                            onClick={() => setVoidTarget(p)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                            title="Void"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data?.meta.page ?? 1}
              totalPages={data?.meta.totalPages ?? 1}
              total={data?.meta.total ?? 0}
              limit={20}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="No purchases found"
            message="Record a tanker delivery to add fuel to your stock."
            icon={<Truck className="h-7 w-7" />}
            action={<Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Record purchase</Button>}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record fuel purchase"
        description="Saving this purchase adds the quantity straight to your fuel stock."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Save purchase</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier" required error={errors.supplierId}>
              <Select value={form.supplierId} onChange={(e) => setForm((p) => ({ ...p, supplierId: e.target.value }))} error={Boolean(errors.supplierId)}>
                <option value="">Select supplier</option>
                {suppliers?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Fuel" required error={errors.fuelId}>
              <Select
                value={form.fuelId}
                onChange={(e) => {
                  const f = fuels?.find((x) => x._id === e.target.value);
                  setForm((p) => ({ ...p, fuelId: e.target.value, purchaseRate: String(f?.purchasePrice ?? '') }));
                }}
                error={Boolean(errors.fuelId)}
              >
                <option value="">Select fuel</option>
                {fuels?.map((f) => <option key={f._id} value={f._id}>{f.name} ({number(f.currentStock, 0)} {f.unit} in stock)</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity (L)" required error={errors.quantity}>
              <Input type="number" min="0" step="0.001" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} error={Boolean(errors.quantity)} />
            </Field>
            <Field label="Purchase rate (Rs./L)" required error={errors.purchaseRate}>
              <Input type="number" min="0" step="0.01" value={form.purchaseRate} onChange={(e) => setForm((p) => ({ ...p, purchaseRate: e.target.value }))} error={Boolean(errors.purchaseRate)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice number">
              <Input value={form.invoiceNumber} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} placeholder="PO-2026-1001" />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </Field>
          </div>

          <Field label="Payment method" required>
            <Select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as typeof p.paymentMethod }))}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank">Bank Transfer</option>
              <option value="credit">Credit</option>
            </Select>
          </Field>

          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Tanker delivery details" />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-navy-100 bg-navy-50 px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm font-medium text-ink-600">
              <Droplets className="h-4 w-4 text-navy-700" /> Total amount
            </span>
            <span className="text-2xl font-bold text-navy-900">{currency(total)}</span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(voidTarget)}
        title="Void this purchase?"
        message="The fuel quantity will be removed from stock again and the purchase excluded from totals."
        confirmLabel="Void purchase"
        danger
        loading={voiding}
        onConfirm={confirmVoid}
        onCancel={() => setVoidTarget(null)}
      />
    </>
  );
}
