import { useMemo, useState } from 'react';
import { UserPlus, Pencil, Trash2, ShieldCheck, UserCog } from 'lucide-react';
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
  SearchInput,
  Select,
  StatusBadge,
  TableSkeleton,
} from '../components/ui';
import { useApi } from '../lib/useApi';
import { fieldErrors, http, toErrorMessage } from '../lib/api';
import { dateTime } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { User } from '../lib/types';

interface UserResponse {
  items: User[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const EMPTY = { name: '', email: '', password: '', role: 'cashier' as 'admin' | 'manager' | 'cashier', phone: '' };

const ROLE_TONE: Record<string, 'navy' | 'gold' | 'gray'> = { admin: 'navy', manager: 'gold', cashier: 'gray' };

export default function Users() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const timer = useMemo(() => ({ id: 0 as unknown as ReturnType<typeof setTimeout> }), []);

  const { data, loading, error, reload } = useApi<UserResponse>(
    () => http.get<UserResponse>('/users', { page, limit: 20, search: debounced || undefined, role: role || undefined }),
    [page, debounced, role],
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

  function openEdit(u: User) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, phone: u.phone ?? '' });
    setErrors({});
    setModalOpen(true);
  }

  async function submit() {
    setErrors({});
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Name must be at least 2 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) local.email = 'Enter a valid email address';
    if (!editing && form.password.length < 8) local.password = 'Password must be at least 8 characters';
    if (!editing && !/[0-9]/.test(form.password)) local.password = 'Password must contain a number';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await http.patch(`/users/${editing.id}`, {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success(`${form.name} updated.`);
      } else {
        await http.post('/users', form);
        toast.success(`${form.name} added.`);
      }
      setModalOpen(false);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else toast.error(toErrorMessage(err, 'Could not save the user.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await http.del<{ deactivated?: boolean }>(`/users/${deleteTarget.id}`);
      toast.success(res.deactivated ? `${deleteTarget.name} deactivated (has recorded sales).` : `${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not delete the user.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search name or email..." className="min-w-[200px] flex-1" />
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="w-auto min-w-[140px]">
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
          </Select>
          <Button onClick={openCreate}><UserPlus className="h-4 w-4" /> Add user</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Users"
          subtitle="Everyone who can sign in to this pump"
          action={
            <Badge tone="navy">
              <ShieldCheck className="h-3 w-3" /> Admin only
            </Badge>
          }
        />

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : (data?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[680px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Email</th>
                    <th className="th">Role</th>
                    <th className="th">Phone</th>
                    <th className="th">Status</th>
                    <th className="th">Last login</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data!.items.map((u) => (
                    <tr key={u.id} className="transition hover:bg-ink-50/60">
                      <td className="td font-medium text-navy-800">
                        {u.name}
                        {u.id === currentUser?.id && <span className="ml-2 text-xs text-ink-400">(you)</span>}
                      </td>
                      <td className="td text-xs">{u.email}</td>
                      <td className="td"><Badge tone={ROLE_TONE[u.role] ?? 'gray'}>{u.role}</Badge></td>
                      <td className="td text-xs">{u.phone || '—'}</td>
                      <td className="td"><StatusBadge status={u.active ? 'active' : 'inactive'} /></td>
                      <td className="td text-xs">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-navy-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
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
              page={data?.meta.page ?? 1}
              totalPages={data?.meta.totalPages ?? 1}
              total={data?.meta.total ?? 0}
              limit={20}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="No users found"
            message="Add managers and cashiers so your team can use the system."
            icon={<UserCog className="h-7 w-7" />}
            action={<Button onClick={openCreate}><UserPlus className="h-4 w-4" /> Add user</Button>}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add user'}
        description={
          editing
            ? 'Leave the password blank to keep the current one.'
            : 'The new user signs in with this email and password on this pump only.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Update user' : 'Create user'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} error={Boolean(errors.name)} />
            </Field>
            <Field label="Email" required error={errors.email}>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} error={Boolean(errors.email)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={editing ? 'New password (optional)' : 'Password'} required={!editing} error={errors.password}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                error={Boolean(errors.password)}
                placeholder="Min 8 chars, include a number"
              />
            </Field>
            <Field label="Role" required>
              <Select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as typeof p.role }))}>
                <option value="admin">Admin — full access</option>
                <option value="manager">Manager — operations & reports</option>
                <option value="cashier">Cashier — sales, customers, own shift</option>
              </Select>
            </Field>
          </div>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this user?"
        message="If the user has recorded sales they will be deactivated instead so their history stays intact."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
