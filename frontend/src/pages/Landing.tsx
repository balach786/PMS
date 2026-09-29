import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Database,
  BarChart3,
  FileSpreadsheet,
  FileText,
  FileDown,
  Fuel as FuelIcon,
  Clock,
  Users,
  Wallet,
  Truck,
  Droplets,
  ShieldCheck,
  Smartphone,
  Printer,
  Menu,
  X,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { LogoWordmark } from '../components/Logo';

const FEATURES = [
  {
    icon: FuelIcon,
    title: 'Fuel & pricing',
    text: 'Configure Petrol, Diesel, Hi-Octane or any fuel type. Update selling prices and low-stock alerts in seconds.',
  },
  {
    icon: BarChart3,
    title: 'Live dashboard',
    text: "Today's sales, liters, expenses, estimated profit, stock levels and open shift — all read live from your database.",
  },
  {
    icon: Clock,
    title: 'Daily shifts',
    text: 'Open a shift with cash and meter readings, sell through it, then close with expected vs actual cash and variance.',
  },
  {
    icon: Users,
    title: 'Customers & credit',
    text: 'Credit sales raise a customer balance automatically; payments reduce it. Full ledger per customer.',
  },
  {
    icon: Wallet,
    title: 'Expenses',
    text: 'Record electricity, salary, maintenance and more. Filter by date, category and payment method.',
  },
  {
    icon: Truck,
    title: 'Suppliers & purchases',
    text: 'Log tanker deliveries from suppliers. Every purchase adds stock and writes a stock transaction.',
  },
  {
    icon: Droplets,
    title: 'Stock that stays accurate',
    text: 'Opening, purchase, sale and adjustment movements are recorded in a ledger you can audit at any time.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles & isolation',
    text: 'Admin, manager and cashier permissions, backed by a separate database for every petrol pump.',
  },
];

const STEPS = [
  { n: '01', title: 'Register your pump', text: 'Enter your pump details. We create a dedicated MongoDB database and your admin account automatically.' },
  { n: '02', title: 'Set up fuel & stock', text: 'Add your fuel types with prices, then record opening stock or your first tanker purchase.' },
  { n: '03', title: 'Run daily operations', text: 'Open a shift, record sales, take credit, log expenses and receive supplier deliveries.' },
  { n: '04', title: 'Report & export', text: 'Generate sales, expense, fuel, stock, credit, shift and profit reports. Export to CSV, Excel or PDF.' },
];

const BENEFITS = [
  'Every number comes from your own database — no mock data anywhere',
  'Separate database per pump means complete data isolation',
  'Works on desktop, tablet and mobile',
  'Printable receipts for every fuel sale',
  'Estimated profit calculated on each sale',
  'Clean, simple UI your pump staff can learn in minutes',
];

/** Stylised preview of the real dashboard UI (same components and brand palette). */
function DashboardPreview() {
  const cards = [
    { label: "Today's Sales", value: 'Rs. 412,860', sub: '38 transactions', tone: 'bg-navy-50 text-navy-700' },
    { label: 'Liters Sold', value: '1,482 L', sub: 'Across 3 fuels', tone: 'bg-gold-100 text-gold-700' },
    { label: 'Expenses', value: 'Rs. 18,400', sub: '6 entries today', tone: 'bg-red-50 text-red-600' },
    { label: 'Est. Profit', value: 'Rs. 24,910', sub: 'Estimated margin', tone: 'bg-lime-400/15 text-lime-600' },
  ];

  const bars = [42, 58, 35, 72, 64, 88, 51, 76, 60, 92, 48, 70];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-navy-950 shadow-pop">
      <div className="flex items-center gap-2 border-b border-white/10 bg-navy-900 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-gold-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-lime-400/70" />
        <span className="ml-3 text-xs text-white/40">app.bkpetrol.com / dashboard</span>
      </div>

      <div className="grid grid-cols-12">
        {/* sidebar */}
        <div className="col-span-3 hidden bg-navy-900 p-3 sm:block">
          <div className="mb-4 px-2 pt-1 text-[11px] font-bold tracking-wider text-white/90">BK</div>
          {['Dashboard', 'Sales', 'Shifts', 'Customers', 'Expenses', 'Purchases', 'Fuel', 'Stock', 'Reports'].map(
            (item, i) => (
              <div
                key={item}
                className={`mb-1 rounded-md px-2.5 py-2 text-[11px] ${
                  i === 0 ? 'bg-gold-500 font-semibold text-navy-900' : 'text-white/55'
                }`}
              >
                {item}
              </div>
            ),
          )}
        </div>

        {/* main */}
        <div className="col-span-12 bg-ink-50 p-4 sm:col-span-9">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-navy-900">Ali Filling Station</p>
              <p className="text-[11px] text-ink-400">This Month · live data</p>
            </div>
            <span className="rounded-md bg-navy-700 px-2.5 py-1.5 text-[10px] font-semibold text-white">
              Export
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-lg border border-ink-200/70 bg-white p-3">
                <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-md ${c.tone}`}>
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">{c.label}</p>
                <p className="mt-0.5 text-sm font-bold text-navy-900">{c.value}</p>
                <p className="text-[10px] text-ink-400">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-ink-200/70 bg-white p-3.5">
            <p className="mb-3 text-[11px] font-semibold text-navy-800">Sales trend</p>
            <div className="flex h-24 items-end gap-1.5">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-navy-700/85" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2.5">
            <div className="col-span-3 rounded-lg border border-ink-200/70 bg-white p-3.5">
              <p className="mb-2 text-[11px] font-semibold text-navy-800">Recent transactions</p>
              {[
                ['INV-0012', 'Petrol', 'Rs. 11,220'],
                ['INV-0011', 'Diesel', 'Rs. 15,713'],
                ['INV-0010', 'Hi-Octane', 'Rs. 8,540'],
              ].map(([inv, fuel, amount]) => (
                <div key={inv} className="flex items-center justify-between border-b border-ink-100 py-1.5 last:border-0">
                  <span className="font-mono text-[10px] text-ink-500">{inv}</span>
                  <span className="text-[10px] text-ink-600">{fuel}</span>
                  <span className="text-[10px] font-semibold text-navy-800">{amount}</span>
                </div>
              ))}
            </div>
            <div className="col-span-2 rounded-lg border border-ink-200/70 bg-white p-3.5">
              <p className="mb-2 text-[11px] font-semibold text-navy-800">Fuel split</p>
              {[
                ['Petrol', '52%', '#B69952'],
                ['Diesel', '34%', '#1D3B61'],
                ['Hi-Octane', '14%', '#639C14'],
              ].map(([name, pct, color]) => (
                <div key={name} className="mb-2">
                  <div className="mb-1 flex justify-between text-[10px] text-ink-500">
                    <span>{name}</span>
                    <span className="font-semibold text-navy-800">{pct}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100">
                    <div className="h-1.5 rounded-full" style={{ width: pct as string, background: color as string }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <LogoWordmark />
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-sm font-medium text-ink-600 transition hover:text-navy-700">
              Features
            </a>
            <a href="#how" className="text-sm font-medium text-ink-600 transition hover:text-navy-700">
              How it works
            </a>
            <a href="#reports" className="text-sm font-medium text-ink-600 transition hover:text-navy-700">
              Reports
            </a>
            <a href="#benefits" className="text-sm font-medium text-ink-600 transition hover:text-navy-700">
              Benefits
            </a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login" className="text-sm font-semibold text-navy-700 hover:underline">
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800"
            >
              Register your pump
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-ink-700 transition hover:bg-ink-100 md:hidden"
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-ink-200/70 px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              {[
                ['#features', 'Features'],
                ['#how', 'How it works'],
                ['#reports', 'Reports'],
                ['#benefits', 'Benefits'],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  {label}
                </a>
              ))}
              <Link
                to="/login"
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-700 hover:bg-ink-50"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="mt-1 rounded-lg bg-navy-700 px-3 py-2.5 text-center text-sm font-semibold text-white"
              >
                Register your pump
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(900px 460px at 12% -12%, rgba(182,153,82,0.30), transparent 60%), radial-gradient(760px 420px at 92% 108%, rgba(99,156,20,0.24), transparent 62%)',
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-3.5 py-1.5 text-xs font-semibold text-gold-300">
              <Layers className="h-3.5 w-3.5" />
              Isolated MongoDB database for every pump
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              Manage your petrol pump operations in one place.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/65">
              Fuel sales, daily shifts, customer credit, expenses, supplier purchases, stock and reports —
              a simple, professional system your whole team can use from the counter or on a phone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-6 py-3.5 text-sm font-bold text-navy-900 transition hover:bg-gold-400"
              >
                Register your pump
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-lime-400" /> No credit card to register
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-lime-400" /> CSV, Excel & PDF exports
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-lime-400" /> Works on mobile
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gold-500/10 blur-2xl" />
            <div className="relative">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-600">Everything you need</p>
          <h2 className="mt-3 text-2xl font-bold text-navy-900 sm:text-3xl">
            One simple system for the whole station
          </h2>
          <p className="mt-3 text-sm text-ink-500 sm:text-base">
            No RFID, no IoT hardware, no accounting jargon. Just the tools a petrol pump uses every single day.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-xl border border-ink-200/70 bg-white p-5 transition hover:border-navy-300 hover:shadow-card"
              >
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-navy-50 text-navy-700 transition group-hover:bg-navy-700 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-sm font-semibold text-navy-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{f.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-ink-50 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-600">How it works</p>
            <h2 className="mt-3 text-2xl font-bold text-navy-900 sm:text-3xl">Running in four steps</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="relative rounded-xl border border-ink-200/70 bg-white p-6">
                <span className="font-mono text-3xl font-bold text-navy-100">{step.n}</span>
                <h3 className="mt-3 text-sm font-semibold text-navy-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reports / export */}
      <section id="reports" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-600">Reports & exports</p>
            <h2 className="mt-3 text-2xl font-bold text-navy-900 sm:text-3xl">
              Real reports, exported as real files
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500 sm:text-base">
              Pick a report, choose a date range, download it. Every export is generated on the server from
              your live records and includes your pump name, the date range, column headers and totals.
            </p>

            <ul className="mt-6 space-y-2.5">
              {[
                'Sales — daily, weekly, monthly, yearly or custom range',
                'Expenses — by category, payment method and date',
                'Fuel — liters sold, revenue, purchases and stock per fuel',
                'Stock — opening, purchases, sales, adjustments, closing',
                'Customer credit — credit sales, payments, outstanding',
                'Shifts — expected vs actual cash and variance',
                'Profit & loss summary — clearly labelled as estimated',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ink-600">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime-500" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700">
                <FileText className="h-4 w-4 text-navy-700" /> CSV
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700">
                <FileSpreadsheet className="h-4 w-4 text-lime-600" /> Excel (XLSX)
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700">
                <FileDown className="h-4 w-4 text-gold-600" /> PDF
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700">
                <Printer className="h-4 w-4 text-ink-500" /> Print
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-ink-200/70 bg-white p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Export panel</p>
            <div className="mt-4 space-y-3">
              {['Sales Report', 'Fuel Report', 'Stock Report', 'Customer Credit Report', 'Shift Report'].map(
                (name, i) => (
                  <div
                    key={name}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      i === 0 ? 'border-navy-300 bg-navy-50' : 'border-ink-200/70'
                    }`}
                  >
                    <span className="text-sm font-medium text-navy-900">{name}</span>
                    <span className="text-xs text-ink-400">This Month ↓</span>
                  </div>
                ),
              )}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {['CSV', 'Excel', 'PDF'].map((f) => (
                <div
                  key={f}
                  className="rounded-lg bg-navy-700 py-2.5 text-center text-xs font-bold text-white"
                >
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="bg-navy-900 py-16 text-white lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-400">Why BK</p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Built simple, built properly</h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
              Each pump runs on its own MongoDB database with role-based access, hashed passwords and
              JWT-secured APIs. You get a system that is easy to run today and ready to grow tomorrow.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <Database className="mb-3 h-6 w-6 text-gold-400" />
                <p className="text-sm font-semibold">Database per pump</p>
                <p className="mt-1 text-xs text-white/55">True isolation, easy backups, per-tenant scaling.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <ShieldCheck className="mb-3 h-6 w-6 text-lime-400" />
                <p className="text-sm font-semibold">Secure by default</p>
                <p className="mt-1 text-xs text-white/55">bcrypt hashing, JWT auth, role guards, rate limits.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <Smartphone className="mb-3 h-6 w-6 text-gold-400" />
                <p className="text-sm font-semibold">Responsive</p>
                <p className="mt-1 text-xs text-white/55">Use it at the counter, in the office or on a phone.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <BarChart3 className="mb-3 h-6 w-6 text-lime-400" />
                <p className="text-sm font-semibold">Honest numbers</p>
                <p className="mt-1 text-xs text-white/55">No mock data — everything is read from MongoDB.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
            <ul className="space-y-3.5">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-white/75">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500 text-navy-900">
                    <Check className="h-3 w-3" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-6 py-3.5 text-sm font-bold text-navy-900 transition hover:bg-gold-400"
            >
              Create your pump workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-ink-200/70 bg-gradient-to-br from-navy-800 to-navy-900 px-6 py-12 text-center shadow-card sm:px-12">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Ready to manage your petrol pump properly?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">
            Register your station and get a fully isolated workspace with demo data to explore, or start
            clean and add your own fuels, suppliers and customers.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-7 py-3.5 text-sm font-bold text-navy-900 transition hover:bg-gold-400"
            >
              Register your pump
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sign in to demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-200/70 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <LogoWordmark />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500">
              A simple, professional petrol pump management system with a dedicated MongoDB database for
              every station.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Product</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-600">
              <li><a href="#features" className="hover:text-navy-700">Features</a></li>
              <li><a href="#how" className="hover:text-navy-700">How it works</a></li>
              <li><a href="#reports" className="hover:text-navy-700">Reports & exports</a></li>
              <li><a href="#benefits" className="hover:text-navy-700">Benefits</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Get started</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-600">
              <li><Link to="/register" className="hover:text-navy-700">Register a pump</Link></li>
              <li><Link to="/login" className="hover:text-navy-700">Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-ink-200/70 px-4 py-5 text-center text-xs text-ink-400 sm:px-6">
          © {new Date().getFullYear()} BK Petrol Pump Manager. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
