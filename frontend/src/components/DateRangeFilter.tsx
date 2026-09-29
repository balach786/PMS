import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { toDateInput } from '../lib/format';

export interface RangeValue {
  range: string;
  from?: string;
  to?: string;
}

export const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

export function DateRangeFilter({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: RangeValue;
  onChange: (next: RangeValue) => void;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const label = RANGE_OPTIONS.find((o) => o.value === value.range)?.label ?? 'This Month';

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50',
          !compact && 'w-full justify-between sm:w-56',
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-ink-400" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-ink-200 bg-white p-2 shadow-pop animate-fade-in">
          <div className="max-h-64 overflow-y-auto">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange({ range: option.value, from: undefined, to: undefined });
                  if (option.value !== 'custom') setOpen(false);
                }}
                className={clsx(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
                  value.range === option.value ? 'bg-navy-50 font-semibold text-navy-700' : 'text-ink-600 hover:bg-ink-50',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {value.range === 'custom' && (
            <div className="mt-2 border-t border-ink-200/70 pt-3">
              <div className="grid grid-cols-2 gap-2 px-1">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-500">From</span>
                  <input
                    type="date"
                    value={value.from ?? toDateInput(new Date())}
                    onChange={(e) => onChange({ ...value, from: e.target.value })}
                    className="input py-2 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-500">To</span>
                  <input
                    type="date"
                    value={value.to ?? toDateInput(new Date())}
                    onChange={(e) => onChange({ ...value, to: e.target.value })}
                    className="input py-2 text-xs"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-3 w-full rounded-lg bg-navy-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
