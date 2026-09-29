import { useMemo, useState } from 'react';
import { Plus, Truck, Pencil, Trash2, Package } from 'lucide-react';
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
  SearchInput,
  Select,
  StatusBadge,
  TableSkeleton,
  Textarea,
} from '../components/ui';
import { useApi } from '../lib/useApi';
import { fieldErrors, http, toErrorMessage } from '../lib/api';
import { currency, dateShort, liters } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Supplier } from '../lib/types';

interface SupplierResponse {
  items: Supplier[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface SupplierDetail extends Supplier {
  purchases: Array<{ _id: string; invoiceNumber?: string; fuelName: string; quantity: number; purchaseRate: number; totalAmount: number; date: string }>;
  totals: { totalAmount: number; totalQuantity: number; purchases: number };
}

type SupplierForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: 'active' | 'inactive';
};

const EMPTY: SupplierForm = { name: '', phone: '', email: '', address: '', notes: '', status: 'active' };

export default function Suppliers() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const timer = useMemo(() => ({ id: 0 as unknown as ReturnType<typeof setTimeout> }), []);

  const { data, loading, error, reload } = useApi<SupplierResponse>(
    () => http.get<SupplierResponse>('/suppliers', { page, limit: 20, search: debounced || undefined }),
    [page, debounced],
  );

  const { data: detail, loading: detailLoading } = useApi<SupplierDetail>(
    () => http.get<SupplierDetail>(`/suppliers/${detailId}`),
    [detailId],
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

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      notes: s.notes ?? '',
      status: s.status,
    });
    setErrors({});
    setModalOpen(true);
  }

  async function submit() {
    setErrors({});
    if (form.name.trim().length < 2) {
      setErrors({ name: 'Supplier name must be at least 2 characters' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await http.patch(`/suppliers/${editing._id}`, form);
        toast.success(`${form.name} updated.`);
      } else {
        await http.post('/suppliers', form);
        toast.success(`${form.name} added.`);
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not save the supplier.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await http.del<{ deactivated?: boolean }>(`/suppliers/${deleteTarget._id}`);
      toast.success(res.deactivated ? `${deleteTarget.name} deactivated (has purchase history).` : `${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not delete the supplier.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search suppliers..." className="min-w-[200px] flex-1" />
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add supplier</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Suppliers" subtitle="Companies you buy fuel from" />

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (data?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[700px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Phone</th>
                    <th className="th">Email</th>
                    <th className="th">Address</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data!.items.map((s) => (
                    <tr key={s._id} className="transition hover:bg-ink-50/60">
                      <td className="td font-medium text-navy-800">{s.name}</td>
                      <td className="td text-xs">{s.phone || '—'}</td>
                      <td className="td text-xs">{s.email || '—'}</td>
                      <td className="td max-w-[200px] truncate text-xs">{s.address || '—'}</td>
                      <td className="td"><StatusBadge status={s.status} /></td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailId(s._id)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                            title="Purchase history"
                          >
                            <Package className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(s)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(s)}
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
            title="No suppliers yet"
            message="Add the companies you buy fuel from so purchases can be tracked."
            icon={<Truck className="h-7 w-7" />}
            action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add supplier</Button>}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit supplier' : 'Add supplier'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Update' : 'Save supplier'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} error={Boolean(errors.name)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></Field>
          </div>
          <Field label="Address"><Textarea value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} className="min-h-[60px]" /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail?.name ?? 'Supplier'}
        description="Purchase history"
        size="lg"
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Purchases" value={String(detail.totals.purchases)} />
              <Stat label="Total quantity" value={liters(detail.totals.totalQuantity)} />
              <Stat label="Total amount" value={currency(detail.totals.totalAmount)} />
            </div>
            {detail.purchases.length ? (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-ink-200/70">
                <table className="w-full">
                  <thead className="sticky top-0 bg-ink-50">
                    <tr>
                      <th className="th">Invoice</th>
                      <th className="th">Date</th>
                      <th className="th">Fuel</th>
                      <th className="th text-right">Quantity</th>
                      <th className="th text-right">Rate</th>
                      <th className="th text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {detail.purchases.map((p) => (
                      <tr key={p._id}>
                        <td className="td font-mono text-xs">{p.invoiceNumber || '—'}</td>
                        <td className="td text-xs">{dateShort(p.date)}</td>
                        <td className="td">{p.fuelName}</td>
                        <td className="td text-right">{liters(p.quantity)}</td>
                        <td className="td text-right">{currency(p.purchaseRate)}</td>
                        <td className="td text-right font-semibold">{currency(p.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No purchases yet" message="Fuel purchases from this supplier will be listed here." />
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete supplier?"
        message="If this supplier has purchase history they will be deactivated instead of deleted, so your reports stay accurate."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 text-base font-bold text-navy-800">{value}</p>
    </div>
  );
}
