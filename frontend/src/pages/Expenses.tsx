import { useMemo, useState } from 'react';
import { Plus, Wallet, Ban, Pencil, Trash2 } from 'lucide-react';
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
import { fieldErrors, http, toErrorMessage } from '../lib/api';
import { currency, dateShort, toDateInput } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Expense } from '../lib/types';

interface ExpenseResponse {
  items: Expense[];
  meta: { page: number; limit: number; total: number; totalPages: number; totalAmount?: number };
}

const CATEGORIES = ['Electricity', 'Salary', 'Maintenance', 'Cleaning', 'Generator', 'Transport', 'Office', 'Other'];

const EMPTY = {
  category: 'Electricity',
  amount: '',
  description: '',
  date: toDateInput(new Date()),
  paymentMethod: 'cash' as 'cash' | 'card' | 'bank' | 'credit',
  reference: '',
};

export default function Expenses() {
  const toast = useToast();
  const [range, setRange] = useState<RangeValue>({ range: 'this_month' });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  useQueryAction('new', () => setModalOpen(true));
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const timer = useMemo(() => ({ id: 0 as unknown as ReturnType<typeof setTimeout> }), []);

  const { data, loading, error, reload } = useApi<ExpenseResponse>(
    () =>
      http.get<ExpenseResponse>('/expenses', {
        page,
        limit: 20,
        search: debounced || undefined,
        category: category || undefined,
        paymentMethod: paymentMethod || undefined,
        range: range.range,
        from: range.from,
        to: range.to,
      }),
    [page, debounced, category, paymentMethod, range.range, range.from, range.to],
  );

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout(timer.id);
    timer.id = setTimeout(() => {
      setDebounced(v);
      setPage(1);
    }, 350);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setForm({
      category: expense.category,
      amount: String(expense.amount),
      description: expense.description ?? '',
      date: toDateInput(expense.date),
      paymentMethod: expense.paymentMethod,
      reference: expense.reference ?? '',
    });
    setErrors({});
    setModalOpen(true);
  }

  async function submit() {
    setErrors({});
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrors({ amount: 'Enter an amount greater than zero' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category: form.category,
        amount,
        description: form.description || undefined,
        date: new Date(`${form.date}T12:00:00`).toISOString(),
        paymentMethod: form.paymentMethod,
        reference: form.reference || undefined,
      };
      if (editing) {
        await http.patch(`/expenses/${editing._id}`, payload);
        toast.success('Expense updated.');
      } else {
        await http.post('/expenses', payload);
        toast.success('Expense recorded.');
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not save the expense.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await http.post(`/expenses/${voidTarget._id}/void`, {});
      toast.success('Expense voided. It no longer counts towards totals.');
      setVoidTarget(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not void the expense.'));
    } finally {
      setVoiding(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await http.del(`/expenses/${deleteTarget._id}`);
      toast.success('Expense deleted.');
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not delete the expense.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search description, category..." className="min-w-[200px] flex-1" />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-auto min-w-[140px]">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }} className="w-auto min-w-[150px]">
            <option value="">All payments</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank">Bank Transfer</option>
            <option value="credit">Credit</option>
          </Select>
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        </div>
        {data?.meta?.totalAmount !== undefined && (
          <div className="border-t border-ink-200/70 px-4 py-2.5 text-xs text-ink-500">
            Filtered total: <strong className="text-navy-800">{currency(data.meta.totalAmount)}</strong> · {data.meta.total ?? 0} entries
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Expenses"
          subtitle="Operating costs recorded against this pump"
          action={<ExportMenu reportType="expenses" params={{ range: range.range, from: range.from, to: range.to, groupBy: 'none' }} label="Export expenses" />}
        />

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : (data?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[760px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Category</th>
                    <th className="th">Description</th>
                    <th className="th text-right">Amount</th>
                    <th className="th">Payment</th>
                    <th className="th">Added by</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data!.items.map((e) => (
                    <tr key={e._id} className={`transition hover:bg-ink-50/60 ${e.status === 'voided' ? 'opacity-60' : ''}`}>
                      <td className="td text-xs">{dateShort(e.date)}</td>
                      <td className="td font-medium text-navy-800">{e.category}</td>
                      <td className="td max-w-[220px] truncate text-xs">{e.description || '—'}</td>
                      <td className="td text-right font-semibold text-navy-900">{currency(e.amount)}</td>
                      <td className="td"><PaymentBadge method={e.paymentMethod} /></td>
                      <td className="td text-xs">{e.addedByName}</td>
                      <td className="td"><StatusBadge status={e.status} /></td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1">
                          {e.status === 'active' && (
                            <>
                              <button
                                onClick={() => openEdit(e)}
                                className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setVoidTarget(e)}
                                className="rounded-md p-1.5 text-ink-400 transition hover:bg-amber-50 hover:text-amber-600"
                                title="Void"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setDeleteTarget(e)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
            title="No expenses found"
            message="Record your operating costs to keep profit figures accurate."
            icon={<Wallet className="h-7 w-7" />}
            action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add expense</Button>}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit expense' : 'Add expense'}
        description="Cash expenses reduce the expected cash in the current shift."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Update expense' : 'Save expense'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" required>
              <Select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (Rs.)" required error={errors.amount}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                error={Boolean(errors.amount)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" required>
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </Field>
            <Field label="Payment method" required>
              <Select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as typeof p.paymentMethod }))}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank Transfer</option>
                <option value="credit">Credit</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="e.g. Monthly electricity bill" />
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} placeholder="Bill / voucher number (optional)" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(voidTarget)}
        title="Void this expense?"
        message="The expense stays in the history but is excluded from all totals and reports."
        confirmLabel="Void expense"
        danger
        loading={voiding}
        onConfirm={confirmVoid}
        onCancel={() => setVoidTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this expense?"
        message="The expense will be permanently removed from the pump database. Consider voiding instead if you only want to exclude it from totals."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
