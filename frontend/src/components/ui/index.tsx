import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X, Loader2, Inbox, Search } from 'lucide-react';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type Variant = 'primary' | 'gold' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1';
  const sizes: Record<Size, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
  };
  const variants: Record<Variant, string> = {
    primary: 'bg-navy-700 text-white hover:bg-navy-800 focus:ring-navy-500/40',
    gold: 'bg-gold-500 text-navy-900 hover:bg-gold-400 focus:ring-gold-500/40',
    secondary: 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 focus:ring-ink-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/40',
    ghost: 'text-ink-600 hover:bg-ink-100 focus:ring-ink-300',
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={clsx(base, sizes[size], variants[variant], className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Field / Input / Select / Textarea
// ---------------------------------------------------------------------------
export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input {...props} className={clsx('input', error && 'input-error', className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('input min-h-[80px] resize-y', className)} />;
}

export function Select({
  error,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select {...props} className={clsx('input appearance-none bg-white pr-8', error && 'input-error', className)}>
      {children}
    </select>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx('card', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-3 border-b border-ink-200/70 px-4 py-3.5 sm:px-5', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-navy-800 sm:text-base">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-500 sm:text-sm">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
const BADGE_TONES = {
  navy: 'bg-navy-50 text-navy-700',
  gold: 'bg-gold-100 text-gold-800',
  green: 'bg-lime-400/15 text-lime-600',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  gray: 'bg-ink-100 text-ink-600',
  blue: 'bg-blue-50 text-blue-700',
} as const;

export function Badge({
  children,
  tone = 'gray',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return <span className={clsx('badge', BADGE_TONES[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: keyof typeof BADGE_TONES; label: string }> = {
    active: { tone: 'green', label: 'Active' },
    inactive: { tone: 'gray', label: 'Inactive' },
    open: { tone: 'green', label: 'Open' },
    closed: { tone: 'gray', label: 'Closed' },
    completed: { tone: 'green', label: 'Completed' },
    voided: { tone: 'red', label: 'Voided' },
    trial: { tone: 'gold', label: 'Trial' },
    expired: { tone: 'red', label: 'Expired' },
    suspended: { tone: 'red', label: 'Suspended' },
  };
  const item = map[status] ?? { tone: 'gray' as const, label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function PaymentBadge({ method }: { method: string }) {
  const map: Record<string, keyof typeof BADGE_TONES> = {
    cash: 'green',
    card: 'blue',
    bank: 'navy',
    credit: 'gold',
  };
  const labels: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    bank: 'Bank',
    credit: 'Credit',
  };
  return <Badge tone={map[method] ?? 'gray'}>{labels[method] ?? method}</Badge>;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={clsx(
          'relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop animate-fade-in sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200/70 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-navy-800">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-500 sm:text-sm">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200/70 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-600">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// States: loading / empty
// ---------------------------------------------------------------------------
export function EmptyState({
  title = 'No records yet',
  message,
  action,
  icon,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>
      <h3 className="text-sm font-semibold text-navy-800">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
        <X className="h-7 w-7" />
      </div>
      <h3 className="text-sm font-semibold text-navy-800">Could not load data</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-ink-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-4 flex-1', c === 0 ? 'max-w-[160px]' : c === cols - 1 ? 'max-w-[80px]' : '')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('card p-5', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
}) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-200/70 px-4 py-3 sm:flex-row">
      <p className="text-xs text-ink-500">
        Showing <span className="font-semibold text-ink-700">{from}</span>–
        <span className="font-semibold text-ink-700">{to}</span> of{' '}
        <span className="font-semibold text-ink-700">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-2 text-xs font-semibold text-ink-700">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'navy',
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: 'navy' | 'gold' | 'green' | 'red';
  loading?: boolean;
}) {
  const tones = {
    navy: 'bg-navy-800 text-gold-400',
    gold: 'bg-gold-500/20 text-gold-400',
    green: 'bg-lime-400/20 text-lime-400',
    red: 'bg-red-500/20 text-red-400',
  };
  return (
    <div className="rounded-xl border border-navy-800 bg-navy-900 p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300 break-words">{label}</p>
          {loading ? (
            <>
              <Skeleton className="mt-2.5 h-7 w-28 opacity-20" />
              <Skeleton className="mt-2 h-3 w-20 opacity-20" />
            </>
          ) : (
            <>
              <p className="mt-1.5 text-xl font-bold text-white sm:text-2xl break-words">{value}</p>
              {sub && <p className="mt-1 text-xs text-ink-400 break-words">{sub}</p>}
            </>
          )}
        </div>
        {icon && <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>{icon}</div>}
      </div>
    </div>
  );
}
