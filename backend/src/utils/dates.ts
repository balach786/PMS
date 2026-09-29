import dayjs from 'dayjs';

export type RangeKey =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface DateRange {
  from: Date;
  /** exclusive end of range */
  to: Date;
  key: RangeKey | string;
  label: string;
}

const LABELS: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_year: 'This Year',
  last_year: 'Last Year',
  all: 'All Time',
};

/**
 * Build an inclusive-from / exclusive-to date range.
 */
export function resolveRange(
  key: string | undefined,
  from?: string | null,
  to?: string | null,
  now: Date = new Date(),
): DateRange {
  const d = dayjs(now);
  switch (key) {
    case 'today':
      return { from: d.startOf('day').toDate(), to: d.add(1, 'day').startOf('day').toDate(), key, label: LABELS.today };
    case 'yesterday': {
      const y = d.subtract(1, 'day');
      return { from: y.startOf('day').toDate(), to: y.add(1, 'day').startOf('day').toDate(), key, label: LABELS.yesterday };
    }
    case 'this_week':
      return { from: d.startOf('week').toDate(), to: d.add(1, 'day').startOf('day').toDate(), key, label: LABELS.this_week };
    case 'last_week': {
      const lw = d.subtract(1, 'week');
      return {
        from: lw.startOf('week').toDate(),
        to: lw.endOf('week').add(1, 'ms').toDate(),
        key,
        label: LABELS.last_week,
      };
    }
    case 'this_month':
      return { from: d.startOf('month').toDate(), to: d.add(1, 'day').startOf('day').toDate(), key, label: LABELS.this_month };
    case 'last_month': {
      const lm = d.subtract(1, 'month');
      return { from: lm.startOf('month').toDate(), to: lm.endOf('month').add(1, 'ms').toDate(), key, label: LABELS.last_month };
    }
    case 'this_year':
      return { from: d.startOf('year').toDate(), to: d.add(1, 'day').startOf('day').toDate(), key, label: LABELS.this_year };
    case 'last_year': {
      const ly = d.subtract(1, 'year');
      return { from: ly.startOf('year').toDate(), to: ly.endOf('year').add(1, 'ms').toDate(), key, label: LABELS.last_year };
    }
    case 'all':
      return { from: new Date(0), to: d.add(1, 'day').startOf('day').toDate(), key, label: LABELS.all };
    case 'custom':
    default: {
      const f = from ? dayjs(from) : d.startOf('month');
      const t = to ? dayjs(to) : d.endOf('day');
      return {
        from: f.startOf('day').toDate(),
        to: t.endOf('day').add(1, 'ms').toDate(),
        key: from || to ? 'custom' : 'this_month',
        label: from || to ? 'Custom Range' : LABELS.this_month,
      };
    }
  }
}

export function formatRangeLabel(range: { from: Date; to: Date }): string {
  const a = dayjs(range.from).format('DD MMM YYYY');
  // `to` is exclusive
  const b = dayjs(range.to).subtract(1, 'ms').format('DD MMM YYYY');
  return a === b ? a : `${a} - ${b}`;
}

export function startOfDay(date: Date): Date {
  return dayjs(date).startOf('day').toDate();
}
