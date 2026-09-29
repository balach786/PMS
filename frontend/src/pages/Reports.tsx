import { useEffect, useMemo, useState } from 'react';
import { FileBarChart, Printer, Table2 } from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
} from '../components/ui';
import { DateRangeFilter, type RangeValue } from '../components/DateRangeFilter';
import { ExportMenu } from '../components/ExportMenu';
import { useApi } from '../lib/useApi';
import { useQueryAction, useQueryScroll, useQueryValue } from '../lib/useQueryParams';
import { http } from '../lib/api';
import { currency, dateShort, dateTime, number } from '../lib/format';
import { useAuth } from '../lib/auth';
import type { ReportResponse } from '../lib/types';

const REPORT_TYPES = [
  { key: 'sales', label: 'Sales Report', description: 'Revenue, liters, payment methods and estimated profit' },
  { key: 'expenses', label: 'Expense Report', description: 'Expenses by category, date and payment method' },
  { key: 'fuel', label: 'Fuel Report', description: 'Fuel-wise sales, purchases and current stock' },
  { key: 'stock', label: 'Stock Report', description: 'Opening, purchases, sales, adjustments and closing' },
  { key: 'customers', label: 'Customer Credit Report', description: 'Credit sales, payments and outstanding balances' },
  { key: 'shifts', label: 'Shift Report', description: 'Cashier shifts with expected vs actual cash' },
  { key: 'profit', label: 'Profit & Loss Summary', description: 'Revenue, fuel cost, expenses and estimated profit' },
];

function Cell({ column, row }: { column: ReportResponse['columns'][number]; row: Record<string, unknown> }) {
  const raw = row[column.key];

  if (raw === null || raw === undefined || raw === '') {
    return <span className="text-ink-300">—</span>;
  }

  const align = column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left';

  switch (column.type) {
    case 'money': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return <span className={align}>{String(raw)}</span>;
      return (
        <span className={`${align} font-semibold ${n < 0 ? 'text-red-600' : 'text-navy-800'}`}>
          {currency(n)}
        </span>
      );
    }
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return <span className={align}>{String(raw)}</span>;
      return <span className={`${align} tabular-nums`}>{number(n, 3)}</span>;
    }
    case 'date':
      return <span className={align}>{dateShort(String(raw))}</span>;
    case 'datetime':
      return <span className={align}>{dateTime(String(raw))}</span>;
    default:
      return <span className={align}>{String(raw)}</span>;
  }
}

export default function Reports() {
  const { user, pump } = useAuth();
  const [type, setType] = useState('sales');
  // sidebar report links land on /app/reports?type=profit etc.
  const queryType = useQueryValue('type');
  useEffect(() => {
    if (queryType && REPORT_TYPES.some((r) => r.key === queryType) && queryType !== type) setType(queryType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryType]);
  const [range, setRange] = useState<RangeValue>({ range: 'this_month' });
  const [groupBy, setGroupBy] = useState('day');

  const allowed = useMemo(() => {
    if (user?.role === 'cashier') return ['sales', 'shifts', 'customers'];
    return REPORT_TYPES.map((r) => r.key);
  }, [user]);

  const activeType = allowed.includes(type) ? type : allowed[0]!;
  const showGroupBy = activeType === 'sales' || activeType === 'expenses';

  const { data, loading, error, reload } = useApi<ReportResponse>(
    () =>
      http.get<ReportResponse>(`/reports/${activeType}`, {
        range: range.range,
        from: range.from,
        to: range.to,
        groupBy: showGroupBy ? groupBy : undefined,
      }),
    [activeType, range.range, range.from, range.to, groupBy, showGroupBy],
  );

  const exportParams = {
    range: range.range,
    from: range.from,
    to: range.to,
    groupBy: showGroupBy ? groupBy : undefined,
  };

  const meta = REPORT_TYPES.find((r) => r.key === activeType);

  return (
    <>
      <div className="no-print mb-4 grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader title="Reports" subtitle="Pick a report type" />
          <div className="p-2">
            {REPORT_TYPES.map((r) => {
              const disabled = !allowed.includes(r.key);
              return (
                <button
                  key={r.key}
                  disabled={disabled}
                  onClick={() => setType(r.key)}
                  className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition ${
                    activeType === r.key
                      ? 'bg-navy-700 text-white'
                      : disabled
                        ? 'cursor-not-allowed text-ink-300'
                        : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  <span className="block text-sm font-semibold">{r.label}</span>
                  <span className={`block text-[11px] ${activeType === r.key ? 'text-white/60' : 'text-ink-400'}`}>
                    {disabled ? 'Admin / manager only' : r.description}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title={meta?.label ?? 'Report'}
            subtitle={meta?.description}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <ExportMenu reportType={activeType} params={exportParams} variant="primary" />
              </div>
            }
          />
          <div className="flex flex-wrap items-end gap-3 p-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-700">Date range</p>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            {showGroupBy && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-700">Group by</p>
                <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="w-auto min-w-[150px]">
                  <option value="none">Individual records</option>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </Select>
              </div>
            )}
            <div className="ml-auto text-right text-xs text-ink-500">
              <p>{data?.rows.length ?? 0} rows</p>
              {data && <p>Generated {dateTime(data.generatedAt)}</p>}
            </div>
          </div>
        </Card>
      </div>

      <Card className="print-area overflow-hidden">
        {/* printable header */}
        <div className="hidden border-b border-ink-200 px-6 py-5 print:block">
          <h1 className="text-xl font-bold text-navy-900">{pump?.name}</h1>
          <p className="text-sm text-ink-500">{data?.title}</p>
          <p className="text-xs text-ink-400">
            {data ? dateShort(data.range.from) : ''} — {data ? dateShort(data.range.to) : ''} · Generated {dateTime(new Date())}
          </p>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <div className="p-5">
            <Skeleton className="mb-3 h-6 w-56" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="mb-2 h-9 w-full" />
            ))}
          </div>
        ) : data && data.rows.length ? (
          <>
            {data.summary?.length ? (
              <div className="grid grid-cols-2 gap-3 border-b border-ink-200/70 p-4 sm:grid-cols-3 lg:grid-cols-4">
                {data.summary.map((s) => (
                  <div key={s.label} className="rounded-lg bg-ink-50 px-3.5 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-ink-400">{s.label}</p>
                    <p className="mt-0.5 text-sm font-bold text-navy-800">{s.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="table-wrap">
              <table className="w-full min-w-[640px]">
                <thead className="bg-ink-50">
                  <tr>
                    {data.columns.map((c) => (
                      <th
                        key={c.key}
                        className={`th ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                      >
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.rows.map((row, idx) => (
                    <tr key={idx} className="transition hover:bg-ink-50/60">
                      {data.columns.map((c) => (
                        <td key={c.key} className="td">
                          <Cell column={c} row={row} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {data.totals && (
                    <tr className="bg-navy-700 text-white">
                      {data.columns.map((c) => {
                        const raw = data.totals?.[c.key];
                        if (raw === undefined || raw === null || raw === '') {
                          return <td key={c.key} className="td text-white/60">—</td>;
                        }
                        if (c.type === 'money' || c.type === 'number') {
                          const n = Number(raw);
                          return (
                            <td key={c.key} className={`td font-bold ${c.align === 'right' ? 'text-right' : ''} text-white`}>
                              {c.type === 'money' ? currency(n) : number(n, 3)}
                            </td>
                          );
                        }
                        return <td key={c.key} className="td font-bold">{String(raw)}</td>;
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {data.note && (
              <p className="border-t border-ink-200/70 px-4 py-3 text-xs italic text-ink-400">{data.note}</p>
            )}
          </>
        ) : data ? (
          <EmptyState
            title="No records in this range"
            message="Try a wider date range or a different report type."
            icon={<Table2 className="h-7 w-7" />}
          />
        ) : (
          <div className="p-5">
            <Skeleton className="h-6 w-56" />
          </div>
        )}
      </Card>

      <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200/70 bg-white px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-ink-500">
          <FileBarChart className="h-4 w-4 text-navy-700" />
          Exports are generated on the server from your live pump database and include your pump name,
          date range, headers and totals.
        </p>
        <ExportMenu reportType={activeType} params={exportParams} variant="gold" label="Download" align="right" />
      </div>
    </>
  );
}
