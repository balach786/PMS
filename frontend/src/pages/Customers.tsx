import { useMemo, useState } from 'react';
import { Plus, Users, Wallet, Phone, Car, ArrowRight, CreditCard } from 'lucide-react';
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
  SearchInput,
  Select,
  StatusBadge,
  TableSkeleton,
  Textarea,
} from '../components/ui';
import { ExportMenu } from '../components/ExportMenu';
import { DateRangeFilter, type RangeValue } from '../components/DateRangeFilter';
import { useApi } from '../lib/useApi';
import { useQueryAction, useQueryScroll, useQueryValue } from '../lib/useQueryParams';
import { fieldErrors, http, toErrorMessage } from '../lib/api';
import { currency, dateTime, signedCurrency } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { Customer, CustomerTransaction } from '../lib/types';

interface CustomerResponse {
  items: Customer[];
  meta: { page: number; limit: number; total: number; totalPages: number; totalOutstanding?: number };
}

interface CustomerDetail extends Customer {
  transactions: CustomerTransaction[];
  totals: { credit: number; payments: number; outstanding: number };
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

type CustomerForm = {
  name: string;
  phone: string;
  vehicleNumber: string;
  address: string;
  notes: string;
  status: 'active' | 'inactive';
};

const EMPTY: CustomerForm = { name: '', phone: '', vehicleNumber: '', address: '', notes: '', status: 'active' };

export default function Customers() {
  const { user } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [withBalance, setWithBalance] = useState(false);
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<RangeValue>({ range: 'this_month' });

  const [createOpen, setCreateOpen] = useState(false);
  useQueryAction('new', () => setCreateOpen(true));
  // ?tab=credit and ?tab=payments both target the credit-ledger table below;
  // recording a payment is the per-row action inside that table.
  useQueryScroll('tab', 'credit');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'bank'>('cash');
  const [paying, setPaying] = useState(false);

  const timer = useMemo(() => ({ id: 0 as unknown as ReturnType<typeof setTimeout> }), []);

  const { data, loading, error, reload } = useApi<CustomerResponse>(
    () =>
      http.get<CustomerResponse>('/customers', {
        page,
        limit: 20,
        search: debounced || undefined,
        status: status || undefined,
        withBalance: withBalance || undefined,
      }),
    [page, debounced, status, withBalance],
  );

  const { data: detail, loading: detailLoading, reload: reloadDetail } = useApi<CustomerDetail>(
    () => http.get<CustomerDetail>(`/customers/${detailId}`, { page: detailPage, limit: 20 }),
    [detailId, detailPage],
    { enabled: Boolean(detailId) },
  );

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout(timer.id);
    timer.id = setTimeout(() => {
      setDebounced(v);
      setPage(1);
    }, 350);
  }

  async function submit() {
    setErrors({});
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Customer name must be at least 2 characters';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      await http.post('/customers', form);
      toast.success(`${form.name} added.`);
      setCreateOpen(false);
      setForm(EMPTY);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not save the customer.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment() {
    if (!payFor) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter an amount greater than zero.');
      return;
    }
    setPaying(true);
    try {
      const res = await http.post<{ balanceAfter: number }>(`/customers/${payFor._id}/payments`, {
        amount,
        paymentMethod: payMethod,
        description: 'Payment received',
      });
      toast.success(`Payment recorded. New balance: ${currency(res.balanceAfter)}`);
      setPayFor(null);
      setPayAmount('');
      reload();
      if (detailId) reloadDetail();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not record the payment.'));
    } finally {
      setPaying(false);
    }
  }

  const canManage = user?.role !== 'cashier';

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search name, phone, vehicle..." className="min-w-[200px] flex-1" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-auto min-w-[130px]">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={withBalance}
              onChange={(e) => {
                setWithBalance(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-ink-300 text-navy-700 focus:ring-navy-500/40"
            />
            With balance only
          </label>
          <Button onClick={() => { setForm(EMPTY); setErrors({}); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> Add customer
          </Button>
        </div>
        {data?.meta?.totalOutstanding !== undefined && (
          <div className="border-t border-ink-200/70 px-4 py-2.5 text-xs text-ink-500">
            Total outstanding across all customers:{' '}
            <strong className="text-navy-800">{currency(data.meta.totalOutstanding)}</strong>
          </div>
        )}
      </Card>

      <Card id="credit" className="overflow-hidden">
        <CardHeader
          title="Customers"
          subtitle="Credit customers, balances and ledgers"
          action={<ExportMenu reportType="customers" params={{ range: range.range, from: range.from, to: range.to }} label="Export credit" />}
        />

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (data?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[720px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Customer</th>
                    <th className="th">Phone</th>
                    <th className="th">Vehicle</th>
                    <th className="th text-right">Outstanding</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data!.items.map((c) => (
                    <tr key={c._id} className="transition hover:bg-ink-50/60">
                      <td className="td font-medium text-navy-800">{c.name}</td>
                      <td className="td text-xs">{c.phone || <span className="text-ink-300">—</span>}</td>
                      <td className="td text-xs">{c.vehicleNumber || <span className="text-ink-300">—</span>}</td>
                      <td className="td text-right">
                        {c.currentBalance > 0 ? (
                          <span className="font-semibold text-red-600">{currency(c.currentBalance)}</span>
                        ) : (
                          <span className="text-ink-400">{currency(0)}</span>
                        )}
                      </td>
                      <td className="td"><StatusBadge status={c.status} /></td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.currentBalance > 0 && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setPayFor(c);
                                setPayAmount(String(c.currentBalance));
                              }}
                            >
                              <Wallet className="h-3.5 w-3.5" /> Receive
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { setDetailId(c._id); setDetailPage(1); }}>
                            Ledger <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
            title="No customers found"
            message="Add customers to start offering credit sales."
            icon={<Users className="h-7 w-7" />}
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Add customer
              </Button>
            }
          />
        )}
      </Card>

      {/* Add customer */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add customer"
        description="Customers can be used for credit sales and ledger tracking."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Save customer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} error={Boolean(errors.name)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="0300-1234567" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vehicle number">
              <Input value={form.vehicleNumber} onChange={(e) => setForm((p) => ({ ...p, vehicleNumber: e.target.value }))} placeholder="KAR-4521" />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <Field label="Address">
            <Textarea value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} className="min-h-[60px]" />
          </Field>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
          </Field>
        </div>
      </Modal>

      {/* Receive payment */}
      <Modal
        open={Boolean(payFor)}
        onClose={() => setPayFor(null)}
        title={`Receive payment from ${payFor?.name ?? ''}`}
        description={`Current outstanding balance: ${currency(payFor?.currentBalance ?? 0)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayFor(null)} disabled={paying}>
              Cancel
            </Button>
            <Button onClick={submitPayment} loading={paying}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Amount (Rs.)" required>
            <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </Field>
          <Field label="Payment method" required>
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'cash' | 'card' | 'bank')}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank">Bank Transfer</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Ledger */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail?.name ? `${detail.name} — ledger` : 'Customer ledger'}
        description={detail ? `${detail.phone || 'No phone'} · ${detail.vehicleNumber || 'No vehicle'}` : undefined}
        size="lg"
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Credit sales</p>
                <p className="mt-0.5 text-base font-bold text-navy-800">{currency(detail.totals.credit)}</p>
              </div>
              <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Payments</p>
                <p className="mt-0.5 text-base font-bold text-lime-600">{currency(detail.totals.payments)}</p>
              </div>
              <div className="rounded-lg bg-navy-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-navy-500">Outstanding</p>
                <p className={`mt-0.5 text-base font-bold ${detail.currentBalance > 0 ? 'text-red-600' : 'text-navy-800'}`}>
                  {currency(detail.currentBalance)}
                </p>
              </div>
            </div>

            {detail.currentBalance > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setPayFor(detail);
                  setPayAmount(String(detail.currentBalance));
                }}
              >
                <CreditCard className="h-4 w-4" /> Receive payment
              </Button>
            )}

            {detail.transactions.length ? (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-ink-200/70">
                <table className="w-full">
                  <thead className="sticky top-0 bg-ink-50">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Type</th>
                      <th className="th">Description</th>
                      <th className="th text-right">Amount</th>
                      <th className="th text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {detail.transactions.map((t) => {
                      const signed = signedCurrency(t.amount);
                      return (
                        <tr key={t._id}>
                          <td className="td text-xs">{dateTime(t.txnAt)}</td>
                          <td className="td">
                            <Badge tone={t.type === 'credit_sale' ? 'gold' : t.type === 'payment' ? 'green' : 'gray'}>
                              {t.type === 'credit_sale' ? 'Credit sale' : t.type === 'payment' ? 'Payment' : 'Adjustment'}
                            </Badge>
                          </td>
                          <td className="td max-w-[220px] truncate text-xs">{t.description || t.invoiceNumber || '—'}</td>
                          <td className={`td text-right font-semibold ${signed.className}`}>{signed.text}</td>
                          <td className="td text-right font-semibold text-navy-800">{currency(t.balanceAfter)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No transactions yet" message="Credit sales and payments will appear here." />
            )}

            {detail.meta && detail.meta.totalPages > 1 && (
              <Pagination
                page={detail.meta.page}
                totalPages={detail.meta.totalPages}
                total={detail.meta.total}
                limit={detail.meta.limit}
                onPage={setDetailPage}
              />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
