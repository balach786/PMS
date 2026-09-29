import { useState } from 'react';
import { Building2, Database, ShieldCheck, KeyRound, Check } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input } from '../components/ui';
import { useApi } from '../lib/useApi';
import { http, toErrorMessage } from '../lib/api';
import { dateShort } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export default function Settings() {
  const { user, pump, permissions } = useAuth();
  const toast = useToast();

  const { data: isolation } = useApi<{
    currentPump: string;
    currentDatabase: string;
    pumpCount: number;
  }>(() => http.get('/fuels/isolation-check'), []);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function changePassword() {
    setError('');
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (passwords.newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await http.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      toast.success('Password updated successfully.');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(toErrorMessage(err, 'Could not change the password.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pump details" subtitle="Your organisation" />
          <dl className="space-y-3 p-5 text-sm">
            <Row icon={<Building2 className="h-4 w-4" />} label="Business name" value={pump?.name ?? '—'} />
            <Row icon={<Database className="h-4 w-4" />} label="Dedicated database" value={<code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{pump?.databaseName}</code>} />
            <Row icon={<ShieldCheck className="h-4 w-4" />} label="Subscription" value={<Badge tone="gold">{pump?.subscriptionStatus ?? 'trial'}</Badge>} />
            <Row icon={<KeyRound className="h-4 w-4" />} label="Your role" value={<span className="capitalize">{user?.role}</span>} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Data isolation" subtitle="Multi-tenant check" />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-ink-600">
              Your account is bound to{' '}
              <strong className="font-mono text-navy-800">{isolation?.currentDatabase ?? pump?.databaseName}</strong>.
              Every query made while you are signed in runs against this database only.
            </p>
            <ul className="space-y-1.5 text-xs text-ink-500">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-500" />
                The pump database is resolved from your signed-in session, never from a request parameter.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-500" />
                Sales, customers, expenses, stock and users are stored per pump.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-500" />
                Passwords are hashed with bcrypt and never returned by the API.
              </li>
            </ul>
            <p className="text-xs text-ink-400">
              Pumps registered on this platform: {isolation?.pumpCount ?? '—'}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Your permissions" subtitle="Role-based access" />
          <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-3">
            {Object.entries(permissions).map(([key, value]) => (
              <div
                key={key}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                  value ? 'bg-lime-400/10 text-lime-700' : 'bg-ink-100 text-ink-400'
                }`}
              >
                <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                {value ? <Check className="h-3.5 w-3.5" /> : null}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Change password" subtitle="Update your sign-in credentials" />
          <div className="space-y-4 p-5">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Field label="Current password" required>
              <Input
                type="password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              />
            </Field>
            <Field label="New password" required hint="At least 8 characters with a letter and a number">
              <Input
                type="password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              />
            </Field>
            <Field label="Confirm new password" required>
              <Input
                type="password"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
              />
            </Field>
            <Button onClick={changePassword} loading={saving} disabled={!passwords.currentPassword || !passwords.newPassword}>
              Update password
            </Button>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-center text-xs text-ink-400">
        Account created for {pump?.name} · member since {user?.lastLoginAt ? dateShort(user.lastLoginAt) : 'today'}
      </p>
    </>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
      <dt className="flex items-center gap-2 text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </dt>
      <dd className="text-right font-medium text-navy-800">{value}</dd>
    </div>
  );
}
