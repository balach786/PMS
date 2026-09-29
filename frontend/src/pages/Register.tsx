import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Check, X, Database } from 'lucide-react';
import clsx from 'clsx';
import { AuthShell } from '../components/AuthShell';
import { Button, Field, Input, Textarea } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fieldErrors, toErrorMessage } from '../lib/api';

interface FormState {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
}

const EMPTY: FormState = {
  businessName: '',
  ownerName: '',
  email: '',
  phone: '',
  address: '',
  password: '',
  confirmPassword: '',
};

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rules = useMemo(
    () => [
      { label: 'At least 8 characters', ok: form.password.length >= 8 },
      { label: 'Contains a letter', ok: /[A-Za-z]/.test(form.password) },
      { label: 'Contains a number', ok: /[0-9]/.test(form.password) },
      { label: 'Passwords match', ok: form.password.length > 0 && form.password === form.confirmPassword },
    ],
    [form.password, form.confirmPassword],
  );

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setErrors({});

    const localErrors: Record<string, string> = {};
    if (form.businessName.trim().length < 2) localErrors.businessName = 'Petrol pump name must be at least 2 characters';
    if (form.ownerName.trim().length < 2) localErrors.ownerName = 'Owner name must be at least 2 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) localErrors.email = 'Enter a valid email address';
    if (form.phone.trim().length < 7) localErrors.phone = 'Enter a valid phone number';
    if (rules.some((r) => !r.ok)) localErrors.password = 'Please meet all password requirements';

    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setLoading(true);
    try {
      await register(form);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else setError(toErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Register your petrol pump"
      subtitle="We create a dedicated database for your station automatically."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-navy-700 hover:underline">
            Sign in
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

        <Field label="Petrol pump / business name" required error={errors.businessName}>
          <Input
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            placeholder="Ali Filling Station"
            error={Boolean(errors.businessName)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Owner name" required error={errors.ownerName}>
            <Input
              value={form.ownerName}
              onChange={(e) => set('ownerName', e.target.value)}
              placeholder="Ali Raza"
              error={Boolean(errors.ownerName)}
            />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="0300-1234567"
              error={Boolean(errors.phone)}
            />
          </Field>
        </div>

        <Field label="Email address" required error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="admin@yourpump.com"
            error={Boolean(errors.email)}
          />
        </Field>

        <Field label="Address">
          <Textarea
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Main Shahrah-e-Faisal, Karachi"
            className="min-h-[68px]"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Password" required error={errors.password}>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="••••••••"
                className="pr-11"
                error={Boolean(errors.password)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-ink-400 transition hover:text-ink-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Confirm password" required>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={(e) => set('confirmPassword', e.target.value)}
              placeholder="••••••••"
            />
          </Field>
        </div>

        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {rules.map((rule) => (
            <li
              key={rule.label}
              className={clsx('flex items-center gap-1.5 text-xs', rule.ok ? 'text-lime-600' : 'text-ink-400')}
            >
              {rule.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {rule.label}
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-2.5 rounded-lg border border-navy-100 bg-navy-50 px-3.5 py-3">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" />
          <p className="text-xs leading-relaxed text-navy-800">
            On registration we create your own isolated MongoDB database
            (<span className="font-mono font-semibold">petrolpump_your_pump_001</span>) and your admin
            account inside it. No other pump can ever read your data.
          </p>
        </div>

        <Button type="submit" className="w-full" loading={loading} disabled={loading}>
          Create my pump account
        </Button>
      </form>
    </AuthShell>
  );
}
