import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../lib/auth';
import { toErrorMessage } from '../lib/api';
import { getRememberPreference } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(getRememberPreference());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim()) return setError('Please enter your email address.');
    if (!password) return setError('Please enter your password.');

    setLoading(true);
    try {
      await login(email.trim(), password, remember);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(toErrorMessage(err, 'Unable to sign in. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in to your pump"
      subtitle="Use the account created for your petrol pump."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-navy-700 hover:underline">
            Register your petrol pump
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Field label="Email address" required>
          <Input
            type="email"
            autoComplete="email"
            placeholder="admin@yourpump.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={Boolean(error) && !email.trim()}
          />
        </Field>

        <Field label="Password" required>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11"
              error={Boolean(error) && !password}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-ink-400 transition hover:text-ink-700"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-navy-700 focus:ring-navy-500/40"
            />
            Remember me
          </label>
        </div>

        <Button type="submit" className="w-full" loading={loading} disabled={loading}>
          {!loading && <Loader2 className="hidden" />}
          Sign in
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-3.5">
        <p className="text-xs font-semibold text-ink-600">Demo accounts (password: Admin@1234)</p>
        <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-ink-500">
          <button
            type="button"
            onClick={() => {
              setEmail('admin@alifilling.com');
              setPassword('Admin@1234');
            }}
            className="text-left hover:text-navy-700 hover:underline"
          >
            Admin — admin@alifilling.com
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('manager@alifilling.com');
              setPassword('Admin@1234');
            }}
            className="text-left hover:text-navy-700 hover:underline"
          >
            Manager — manager@alifilling.com
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('cashier@alifilling.com');
              setPassword('Admin@1234');
            }}
            className="text-left hover:text-navy-700 hover:underline"
          >
            Cashier — cashier@alifilling.com
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
