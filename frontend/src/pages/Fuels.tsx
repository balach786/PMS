import { useState } from 'react';
import { Plus, Fuel as FuelIcon, Pencil, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
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
  Select,
  StatusBadge,
  TableSkeleton,
} from '../components/ui';
import { useApi } from '../lib/useApi';
import { useQueryAction, useQueryScroll, useQueryValue } from '../lib/useQueryParams';
import { fieldErrors, http, toErrorMessage, list } from '../lib/api';
import { currency, liters, number } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { Fuel } from '../lib/types';

const EMPTY = {
  name: '',
  code: '',
  sellingPrice: '',
  purchasePrice: '',
  currentStock: '0',
  capacity: '0',
  minStockAlert: '0',
  status: 'active' as 'active' | 'inactive',
  color: '',
};

export default function Fuels() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = user?.role !== 'cashier';

  const { data: fuels, loading, error, reload } = useApi<Fuel[]>(() => list<Fuel>('/fuels', { includeInactive: true }), []);
  const { data: reconcile, reload: reloadReconcile } = useApi<{
    rows: Array<{ name: string; liveStock: number; ledgerStock: number; difference: number }>;
  }>(() => http.get('/fuels/reconcile'), []);

  const [modalOpen, setModalOpen] = useState(false);
  // sidebar "Fuel Overview > Add fuel" lands on /app/fuels?new=1
  useQueryAction('new', () => openCreate());
  const [editing, setEditing] = useState<Fuel | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [priceFuel, setPriceFuel] = useState<Fuel | null>(null);
  const [priceForm, setPriceForm] = useState({ sellingPrice: '', purchasePrice: '' });
  const [savingPrice, setSavingPrice] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Fuel | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(fuel: Fuel) {
    setEditing(fuel);
    setForm({
      name: fuel.name,
      code: fuel.code ?? '',
      sellingPrice: String(fuel.sellingPrice),
      purchasePrice: String(fuel.purchasePrice),
      currentStock: '0',
      minStockAlert: String(fuel.minStockAlert),
      capacity: String(fuel.capacity ?? 0),
      status: fuel.status,
      color: fuel.color ?? '',
    });
    setErrors({});
    setModalOpen(true);
  }

  function openPrice(fuel: Fuel) {
    setPriceFuel(fuel);
    setPriceForm({ sellingPrice: String(fuel.sellingPrice), purchasePrice: String(fuel.purchasePrice) });
  }

  async function submit() {
    setErrors({});
    if (form.name.trim().length < 2) {
      setErrors({ name: 'Fuel name must be at least 2 characters' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        code: form.code || undefined,
        sellingPrice: Number(form.sellingPrice) || 0,
        purchasePrice: Number(form.purchasePrice) || 0,
        currentStock: editing ? 0 : Number(form.currentStock) || 0,
        minStockAlert: Number(form.minStockAlert) || 0,
        capacity: Number(form.capacity) || 0,
        status: form.status,
        color: form.color || undefined,
      };
      if (editing) {
        await http.patch(`/fuels/${editing._id}`, payload);
        toast.success(`${form.name} updated.`);
      } else {
        await http.post('/fuels', payload);
        toast.success(`${form.name} added.`);
      }
      setModalOpen(false);
      reload();
      reloadReconcile();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not save the fuel type.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitPrice() {
    if (!priceFuel) return;
    setSavingPrice(true);
    try {
      await http.patch(`/fuels/${priceFuel._id}/price`, {
        sellingPrice: Number(priceForm.sellingPrice) || 0,
        purchasePrice: Number(priceForm.purchasePrice) || 0,
      });
      toast.success(`${priceFuel.name} price updated.`);
      setPriceFuel(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not update the price.'));
    } finally {
      setSavingPrice(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await http.del<{ deactivated?: boolean }>(`/fuels/${deleteTarget._id}`);
      toast.success(res.deactivated ? `${deleteTarget.name} deactivated (has history).` : `${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not delete the fuel type.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Fuel types</h2>
          <p className="text-sm text-ink-500">Prices, stock alerts and availability for each fuel</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add fuel
          </Button>
        )}
      </div>

      {error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : loading ? (
        <Card><TableSkeleton rows={4} cols={7} /></Card>
      ) : (fuels ?? []).length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fuels!.map((fuel) => (
            <Card key={fuel._id} className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-ink-200/70 p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-white"
                    style={{ background: fuel.color || '#1D3B61' }}
                  >
                    <FuelIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-navy-900">{fuel.name}</p>
                    <p className="text-xs text-ink-400">{fuel.code || '—'} · per {fuel.unit}</p>
                  </div>
                </div>
                <StatusBadge status={fuel.status} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">Selling price</dt>
                  <dd className="font-semibold text-navy-800">{currency(fuel.sellingPrice)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">Purchase price</dt>
                  <dd className="font-semibold text-navy-800">{currency(fuel.purchasePrice)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">Current stock</dt>
                  <dd className={`font-semibold ${fuel.lowStock ? 'text-red-600' : 'text-navy-800'}`}>
                    {number(fuel.currentStock, 2)} {fuel.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">Tank capacity</dt>
                  <dd className="font-semibold text-navy-800">
                    {(fuel.capacity ?? 0) > 0 ? `${number(fuel.capacity ?? 0, 0)} ${fuel.unit}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">Min alert</dt>
                  <dd className="font-semibold text-navy-800">
                    {number(fuel.minStockAlert, 0)} {fuel.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">Margin / {fuel.unit}</dt>
                  <dd className="font-semibold text-lime-600">{currency(fuel.sellingPrice - fuel.purchasePrice)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-400">Stock value</dt>
                  <dd className="font-semibold text-navy-800">{currency(fuel.stockValue ?? fuel.currentStock * fuel.purchasePrice)}</dd>
                </div>
              </dl>

              {fuel.lowStock && (
                <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4" /> Below minimum stock level
                </div>
              )}

              {canManage && (
                <div className="flex flex-wrap gap-2 border-t border-ink-200/70 px-4 py-3">
                  <Button size="sm" variant="secondary" onClick={() => openPrice(fuel)}>
                    Update price
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(fuel)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {user?.role === 'admin' && (
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(fuel)} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No fuel types configured"
            message="Add Petrol, Diesel, Hi-Octane or any other fuel you sell."
            icon={<FuelIcon className="h-7 w-7" />}
            action={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add fuel</Button> : undefined}
          />
        </Card>
      )}

      {reconcile && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader
            title="Stock reconciliation"
            subtitle="Live stock compared with the movement ledger"
            action={
              <Button size="sm" variant="secondary" onClick={reloadReconcile}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            }
          />
          <div className="table-wrap">
            <table className="w-full min-w-[480px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className="th">Fuel</th>
                  <th className="th text-right">Live stock</th>
                  <th className="th text-right">Ledger stock</th>
                  <th className="th text-right">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {reconcile.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="td font-medium text-navy-800">{r.name}</td>
                    <td className="td text-right">{liters(r.liveStock)}</td>
                    <td className="td text-right">{liters(r.ledgerStock)}</td>
                    <td className="td text-right">
                      {Math.abs(r.difference) < 0.001 ? (
                        <Badge tone="green">Matched</Badge>
                      ) : (
                        <span className="font-semibold text-amber-600">{liters(r.difference)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add fuel type'}
        description={
          editing
            ? 'Opening stock cannot be changed here — use a stock adjustment so the ledger stays accurate.'
            : 'Any starting quantity is recorded as an opening stock movement.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Update fuel' : 'Save fuel'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fuel name" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} error={Boolean(errors.name)} />
            </Field>
            <Field label="Short code">
              <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="PET" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Selling price (Rs./L)" required>
              <Input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => setForm((p) => ({ ...p, sellingPrice: e.target.value }))} />
            </Field>
            <Field label="Purchase price (Rs./L)" required>
              <Input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm((p) => ({ ...p, purchasePrice: e.target.value }))} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {!editing && (
              <Field label="Starting stock (L)" hint="Recorded as an opening stock movement">
                <Input type="number" min="0" step="0.001" value={form.currentStock} onChange={(e) => setForm((p) => ({ ...p, currentStock: e.target.value }))} />
              </Field>
            )}
            <Field label="Capacity (L)" hint="Full tank capacity, used for the stock level bars">
              <Input type="number" min="0" step="0.001" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} error={Boolean(errors.capacity)} />
            </Field>
            <Field label="Minimum stock alert (L)" hint="Shows a low-stock warning below this level" error={errors.minStockAlert}>
              <Input type="number" min="0" step="0.001" value={form.minStockAlert} onChange={(e) => setForm((p) => ({ ...p, minStockAlert: e.target.value }))} error={Boolean(errors.minStockAlert)} />
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Price update */}
      <Modal
        open={Boolean(priceFuel)}
        onClose={() => setPriceFuel(null)}
        title={`Update price — ${priceFuel?.name ?? ''}`}
        description="New sales use these prices. Existing sales keep their original rate."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPriceFuel(null)} disabled={savingPrice}>Cancel</Button>
            <Button onClick={submitPrice} loading={savingPrice}>Update price</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Selling price (Rs./L)" required>
            <Input type="number" min="0" step="0.01" value={priceForm.sellingPrice} onChange={(e) => setPriceForm((p) => ({ ...p, sellingPrice: e.target.value }))} />
          </Field>
          <Field label="Purchase price (Rs./L)" required>
            <Input type="number" min="0" step="0.01" value={priceForm.purchasePrice} onChange={(e) => setPriceForm((p) => ({ ...p, purchasePrice: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete fuel type?"
        message="If this fuel has sales or purchase history it will be deactivated instead of deleted so your reports stay accurate."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
