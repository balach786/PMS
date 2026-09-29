import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoWordmark } from './Logo';
import { ArrowLeft, ShieldCheck, Database, BarChart3, FileDown } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: Database, title: 'Isolated database per pump', text: 'Your sales, customers and stock never mix with another station.' },
  { icon: BarChart3, title: 'Live dashboard & reports', text: 'Every number is read straight from your own database.' },
  { icon: FileDown, title: 'CSV, Excel & PDF exports', text: 'Generate real report files with your pump name and totals.' },
  { icon: ShieldCheck, title: 'Roles & permissions', text: 'Admin, manager and cashier get exactly the access they need.' },
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  backTo = '/',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  backTo?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50 lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-navy-900 lg:flex lg:w-[46%] lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(1000px 500px at 15% -10%, rgba(182,153,82,0.28), transparent 60%), radial-gradient(700px 400px at 90% 110%, rgba(99,156,20,0.22), transparent 60%)',
          }}
        />
        <div className="relative p-10">
          <Link to={backTo}>
            <LogoWordmark light />
          </Link>
        </div>

        <div className="relative px-10">
          <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
            Manage your petrol pump operations in one place.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
            Sales, shifts, credit, expenses, fuel purchases and stock — connected to a dedicated MongoDB
            database for your station.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <li key={h.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-300">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{h.title}</p>
                    <p className="text-xs text-white/55">{h.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative p-10 text-xs text-white/40">
          © {new Date().getFullYear()} BK Petrol Pump Manager. Built for single and multi-station operators.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link
            to={backTo}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-navy-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to website
          </Link>

          <div className="mb-7 lg:hidden">
            <LogoWordmark />
          </div>

          <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-sm text-ink-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
