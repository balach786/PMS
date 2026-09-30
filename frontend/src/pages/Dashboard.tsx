import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Fuel as FuelIcon,
  Wallet,
  PiggyBank,
  Droplets,
  CreditCard,
  Users,
  Truck,
  Clock,
  Plus,
  Receipt,
  FileBarChart,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  Settings,
  Tag,
  ShoppingCart,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, StatCard, TableSkeleton, StatusBadge } from '../components/ui';
import { DateRangeFilter, type RangeValue } from '../components/DateRangeFilter';
import { ExportMenu } from '../components/ExportMenu';
import { useApi } from '../lib/useApi';
import { http } from '../lib/api';
import { currency, currencyShort, dateShort, dateTime, liters, number, timeOnly } from '../lib/format';
import { useAuth } from '../lib/auth';
import type { ActivityRow, DashboardData } from '../lib/types';

const CHART_COLORS = ['#1D3B61', '#B69952', '#639C14', '#3C5D94', '#61522B', '#1C2E2F', '#8FA9C9'];

/** Tiny inline sparkline for the "Last 7 days" card. */
function Sparkline({ data, color }: { data: Array<{ day: string; revenue: number }>; color: string }) {
  if (!data.length) return <div className="h-10" />;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const points = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * 100;
      const y = 100 - (d.revenue / max) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const ACTIVITY_META: Record<ActivityRow['type'], { label: string; className: string }> = {
  sale: { label: 'Sale', className: 'bg-lime-400/15 text-lime-600' },
  purchase: { label: 'Purchase', className: 'bg-navy-50 text-navy-700' },
  expense: { label: 'Expense', className: 'bg-red-50 text-red-600' },
  payment: { label: 'Payment', className: 'bg-gold-100 text-gold-700' },
  adjustment: { label: 'Adjustment', className: 'bg-ink-100 text-ink-600' },
};

export default function Dashboard() {
  const { user, pump } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeValue>({ range: 'this_month' });

  const { data, loading, error, reload } = useApi<DashboardData>(
    () => http.get<DashboardData>('/dashboard', { range: range.range, from: range.from, to: range.to }),
    [range],
  );

  const exportParams = { range: range.range, from: range.from ?? '', to: range.to ?? '' };

  const trend = useMemo(
    () => (data?.salesTrend ?? []).map((t) => ({ day: dateShort(t.day), revenue: t.revenue, liters: t.liters })),
    [data],
  );

  const fuelSplit = useMemo(
    () =>
      (data?.fuelBreakdown ?? []).map((f, i) => ({
        name: f.fuelName,
        value: f.revenue,
        liters: f.liters,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [data],
  );

  const totalSplit = fuelSplit.reduce((sum, f) => sum + f.value, 0);
  const totalSplitLiters = fuelSplit.reduce((sum, f) => sum + f.liters, 0);

  /** Sales vs expenses on the same axis (section 14) — both series are real. */
  const salesVsExpenses = useMemo(() => {
    const byDay = new Map((data?.expenseTrend ?? []).map((e) => [e.day, e.amount]));
    return (data?.salesTrend ?? []).map((t) => ({
      day: dateShort(t.day),
      Sales: Math.round(t.revenue),
      Expenses: Math.round(byDay.get(t.day) ?? 0),
    }));
  }, [data]);

  const expenses = useMemo(
    () => (data?.expenseBreakdown ?? []).map((e) => ({ category: e.category, amount: e.amount })),
    [data],
  );

  const petrol = data?.fuelBreakdown.find((f) => /petrol/i.test(f.fuelName) && !/octane/i.test(f.fuelName));
  const diesel = data?.fuelBreakdown.find((f) => /diesel/i.test(f.fuelName));

  const last7 = data?.last7Days;
  const last7Up = (last7?.changePercent ?? 0) >= 0;
  const today = new Date();

  const quickActions = [
    { label: 'New Sale', icon: Receipt, to: '/app/sales?new=1', show: true },
    { label: 'Add Fuel', icon: FuelIcon, to: '/app/fuels?new=1', show: user?.role !== 'cashier' },
    { label: 'Update Price', icon: Tag, to: '/app/fuel-prices', show: user?.role !== 'cashier' },
    { label: 'Add Expense', icon: Wallet, to: '/app/expenses?new=1', show: user?.role !== 'cashier' },
    { label: 'New Customer', icon: Users, to: '/app/customers?new=1', show: true },
    { label: 'New Purchase', icon: ShoppingCart, to: '/app/purchases?new=1', show: user?.role !== 'cashier' },
    { label: 'View Reports', icon: FileBarChart, to: '/app/reports', show: true },
  ].filter((a) => a.show);

  return (
    <>
      {/* ── Header (section 9) ─────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-bold text-navy-900 sm:text-xl">{pump?.name ?? 'Petrol Pump'}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-400/15 px-2.5 py-1 text-xs font-semibold text-lime-600">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
              Online
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {dateShort(today)} · {data ? data.range.display : 'loading…'}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            Signed in as <span className="font-medium text-ink-600">{user?.name}</span>{' '}
            <span className="capitalize">({user?.role})</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <ExportMenu reportType="sales" params={exportParams} />
          <Link
            to="/app/settings"
            className="rounded-lg border border-ink-200 bg-white p-2 text-ink-500 transition hover:border-navy-200 hover:text-navy-700"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {error && (
        <Card className="mb-5">
          <ErrorState message={error} onRetry={reload} />
        </Card>
      )}

      {/* ── Quick actions (section 17) ─────────────────────────────────── */}
      <Card className="mb-5">
        <div className="flex flex-wrap gap-2 p-3">
          {quickActions.map((a) => (
            <Button key={a.label} variant="secondary" onClick={() => navigate(a.to)} className="gap-1.5">
              <a.icon className="h-4 w-4" />
              {a.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* ── KPI cards (section 11) ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Sales"
          value={loading ? '' : currency(data?.kpis.totalSales ?? 0)}
          sub={loading ? '' : `${number(data?.kpis.transactionCount ?? 0)} transactions`}
          icon={<TrendingUp className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Total Liters Sold"
          value={loading ? '' : liters(data?.kpis.totalLiters ?? 0)}
          sub={loading ? '' : `Petrol ${liters(petrol?.liters ?? 0)} · Diesel ${liters(diesel?.liters ?? 0)}`}
          icon={<FuelIcon className="h-5 w-5" />}
          tone="gold"
          loading={loading}
        />
        <StatCard
          label="Petrol Sales"
          value={loading ? '' : currency(petrol?.revenue ?? 0)}
          sub={loading ? '' : liters(petrol?.liters ?? 0)}
          icon={<Droplets className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Diesel Sales"
          value={loading ? '' : currency(diesel?.revenue ?? 0)}
          sub={loading ? '' : liters(diesel?.liters ?? 0)}
          icon={<Droplets className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Today's Expenses"
          value={loading ? '' : currency(data?.kpis.expensesToday ?? 0)}
          sub={loading ? '' : `Range total ${currency(data?.kpis.expenses ?? 0)}`}
          icon={<Wallet className="h-5 w-5" />}
          tone="red"
          loading={loading}
        />
        <StatCard
          label={data?.kpis.profitLabel ?? 'Estimated Profit'}
          value={loading ? '' : currency(data?.kpis.estimatedProfit ?? 0)}
          sub={loading ? '' : `Margin ${number(data?.kpis.marginPercent ?? 0, 1)}% · revenue − fuel cost − expenses`}
          icon={<PiggyBank className="h-5 w-5" />}
          tone="green"
          loading={loading}
        />
      </div>

      {/* ── Last 7 days + quick info (sections 19 / 20) ─────────────────── */}
      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-navy-800 bg-navy-900 p-4 sm:p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-300">Last 7 Days Sales</p>
              <p className="mt-1 text-2xl font-bold text-white break-words">
                {loading ? '—' : currency(last7?.total ?? 0)}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                last7Up ? 'bg-lime-400/20 text-lime-400' : 'bg-red-500/20 text-red-400'
              }`}
            >
              {last7Up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {number(Math.abs(last7?.changePercent ?? 0), 1)}%
            </span>
          </div>
          <div className="mt-2">
            <Sparkline data={last7?.series ?? []} color={last7Up ? '#7CBF1C' : '#EF4444'} />
          </div>
          <p className="mt-1 text-xs text-ink-400">
            Previous 7 days: {loading ? '—' : currency(last7?.previousTotal ?? 0)}
          </p>
        </div>

        <div className="rounded-xl border border-navy-800 bg-navy-900 p-4 sm:p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">Quick Info</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs text-ink-400">
                <CreditCard className="h-3.5 w-3.5" /> Credit Outstanding
              </p>
              <p className="mt-1 text-lg font-bold text-white break-words">
                {loading ? '—' : currency(data?.quickInfo.creditOutstanding ?? 0)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs text-ink-400">
                <Users className="h-3.5 w-3.5" /> Total Customers
              </p>
              <p className="mt-1 text-lg font-bold text-white break-words">
                {loading ? '—' : number(data?.quickInfo.totalCustomers ?? 0)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs text-ink-400">
                <Truck className="h-3.5 w-3.5" /> Active Suppliers
              </p>
              <p className="mt-1 text-lg font-bold text-white break-words">
                {loading ? '—' : number(data?.quickInfo.activeSuppliers ?? 0)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs text-ink-400">
                <FuelIcon className="h-3.5 w-3.5" /> Fuel Types
              </p>
              <p className="mt-1 text-lg font-bold text-white break-words">
                {loading ? '—' : number(data?.quickInfo.totalFuelTypes ?? 0)}
              </p>
              {Boolean(data?.quickInfo.lowStockFuels) && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" /> {data?.quickInfo.lowStockFuels} low
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Sales overview (section 12) ────────────────────────────────── */}
      <Card className="mt-3 sm:mt-4">
        <CardHeader
          title="Sales Overview"
          subtitle={`Revenue per day · ${data?.range.display ?? ''}`}
          action={<ExportMenu reportType="sales" params={exportParams} label="Export sales" />}
        />
        {loading ? (
          <div className="h-72 animate-pulse bg-ink-100" />
        ) : trend.length ? (
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1D3B61" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1D3B61" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6B7A90' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7A90' }} tickLine={false} axisLine={false} tickFormatter={(v) => currencyShort(Number(v))} width={62} />
                <Tooltip formatter={(v: number) => currency(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E5E9F0', fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name="Sales" stroke="#1D3B61" strokeWidth={2.5} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="No sales in this period" message="Record a sale or widen the date range to see the trend." />
        )}
      </Card>

      {/* ── Fuel split + sales vs expenses (sections 13 / 14) ──────────── */}
      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Fuel Sales Distribution"
            subtitle={loading ? '' : `Total ${liters(totalSplitLiters)} sold`}
          />
          {loading ? (
            <div className="h-64 animate-pulse bg-ink-100" />
          ) : fuelSplit.length ? (
            <div className="h-64 w-full p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fuelSplit}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {fuelSplit.map((f) => (
                      <Cell key={f.name} fill={f.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => currency(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E5E9F0', fontSize: 12 }} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => <span style={{ fontSize: 12, color: '#4A5A70' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 px-3 pb-3">
                {fuelSplit.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                    <span className="flex-1 text-ink-600">{f.name}</span>
                    <span className="text-ink-500">{liters(f.liters)}</span>
                    <span className="w-14 text-right font-semibold text-navy-800">
                      {totalSplit ? ((f.value / totalSplit) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="No fuel sales yet" />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Sales vs Expenses"
            subtitle={`Expense total ${currency(data?.kpis.expenses ?? 0)}`}
          />
          {loading ? (
            <div className="h-64 animate-pulse bg-ink-100" />
          ) : salesVsExpenses.length ? (
            <div className="h-64 w-full p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesVsExpenses} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6B7A90' }} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7A90' }} tickLine={false} axisLine={false} tickFormatter={(v) => currencyShort(Number(v))} width={62} />
                  <Tooltip formatter={(v: number) => currency(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E5E9F0', fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={30} formatter={(value: string) => <span style={{ fontSize: 12, color: '#4A5A70' }}>{value}</span>} />
                  <Bar dataKey="Sales" fill="#1D3B61" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#B69952" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Nothing to compare yet" />
          )}
        </Card>
      </div>

      {/* ── Current shift (section 18) + current stock (section 15) ─────── */}
      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Today's Shift"
            subtitle={data?.openShift ? `${data.openShift.userName} · opened ${dateTime(data.openShift.openedAt)}` : 'No open shift'}
          />
          {loading ? (
            <div className="h-40 animate-pulse bg-ink-100" />
          ) : data?.openShift ? (
            <div className="space-y-2.5 p-4 pt-0 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Status</span>
                <Badge tone="green">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Cashier</span>
                <span className="font-medium text-navy-800">{data.openShift.userName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Opening cash</span>
                <span className="font-medium text-navy-800">{currency(data.openShift.openingCash)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Total sales</span>
                <span className="font-medium text-navy-800">{currency(data.openShift.totalSales ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Total liters</span>
                <span className="font-medium text-navy-800">{liters(data.openShift.totalLiters ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Expected closing cash</span>
                <span className="font-semibold text-navy-900">{currency(data.openShift.expectedCash ?? 0)}</span>
              </div>
              <Button variant="secondary" className="mt-1 w-full" onClick={() => navigate('/app/shifts')}>
                <Clock className="h-4 w-4" /> Go to shifts
              </Button>
            </div>
          ) : (
            <div className="p-4 pt-0">
              <EmptyState
                title="No open shift"
                message="Open a shift before recording sales so the cash totals are tracked."
                action={
                  <Button onClick={() => navigate('/app/shifts')}>
                    <Plus className="h-4 w-4" /> Open shift
                  </Button>
                }
              />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Current Fuel Stock"
            subtitle="Live levels, tank capacity and selling price"
            action={
              <Button variant="secondary" onClick={() => navigate('/app/stock')}>
                Stock
              </Button>
            }
          />
          {loading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : (data?.stock ?? []).length ? (
            <div className="table-wrap">
              <table className="w-full min-w-[620px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Fuel Type</th>
                    <th className="th text-right">Current Stock</th>
                    <th className="th text-right">Capacity</th>
                    <th className="th text-right">Selling Price</th>
                    <th className="th text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data!.stock.map((s) => {
                    // status comes from the backend (one definition, section 15)
                    const status = s.status;
                    const pct = s.fillPercent;
                    return (
                      <tr key={s._id} className="transition hover:bg-ink-50/60">
                        <td className="td font-medium text-navy-800">{s.name}</td>
                        <td className="td text-right">
                          <span className="font-semibold text-navy-900">{liters(s.currentStock)}</span>
                          {pct !== null && (
                            <div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                              <div
                                className={`h-full ${status === 'Normal' ? 'bg-lime-600' : status === 'Low Stock' ? 'bg-gold-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="td text-right text-ink-600">
                          {s.capacity > 0 ? liters(s.capacity) : '—'}
                        </td>
                        <td className="td text-right font-medium text-navy-800">
                          {currency(s.sellingPrice)}/{s.unit}
                        </td>
                        <td className="td text-right">
                          <Badge tone={status === 'Normal' ? 'green' : status === 'Low Stock' ? 'gold' : 'red'}>
                            {status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No fuels configured" message="Add fuel types to start tracking stock." />
          )}
        </Card>
      </div>

      {/* ── Expenses by category ───────────────────────────────────────── */}
      {expenses.length > 0 && (
        <Card className="mt-3 sm:mt-4">
          <CardHeader title="Expenses by Category" subtitle={`Total ${currency(data?.kpis.expenses ?? 0)}`} />
          <div className="h-56 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenses} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7A90' }} tickLine={false} axisLine={false} tickFormatter={(v) => currencyShort(Number(v))} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#6B7A90' }} tickLine={false} axisLine={false} width={92} />
                <Tooltip formatter={(v: number) => currency(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E5E9F0', fontSize: 12 }} />
                <Bar dataKey="amount" name="Expenses" fill="#B69952" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Recent transactions (section 16) ───────────────────────────── */}
      <Card className="mt-3 overflow-hidden sm:mt-4">
        <CardHeader
          title="Recent Transactions"
          subtitle="Sales, purchases, expenses, customer payments and stock adjustments"
        />
        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (data?.recentActivity ?? []).length ? (
          <div className="table-wrap">
            <table className="w-full min-w-[560px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className="th">Type</th>
                  <th className="th">Details</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data!.recentActivity.map((a) => {
                  const meta = ACTIVITY_META[a.type];
                  return (
                    <tr key={a.id} className="transition hover:bg-ink-50/60">
                      <td className="td">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
                          {a.direction === 'in' ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {meta.label}
                        </span>
                      </td>
                      <td className="td text-ink-600">{a.details}</td>
                      <td className="td text-right font-medium text-navy-800">
                        {a.amount ? currency(a.amount) : '—'}
                      </td>
                      <td className="td text-right text-xs text-ink-500">{timeOnly(a.at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No activity yet" message="Transactions will appear here as you record them." />
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-ink-400">
        {data?.note ?? 'Profit figures are estimated: they use the purchase price captured at the time of each sale.'}
      </p>
    </>
  );
}
