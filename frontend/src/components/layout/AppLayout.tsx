import { useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, Building2 } from 'lucide-react';
import { Sidebar, NAV_ITEMS } from './Sidebar';
import { Logo } from '../Logo';
import { NotificationBell } from '../NotificationBell';
import { useAuth } from '../../lib/auth';

/** Best-matching sidebar label for the current path (groups included). */
function titleFor(pathname: string): string {
  const flat = NAV_ITEMS.flatMap((i) => [
    ...(i.to ? [{ to: i.to, label: i.label }] : []),
    ...(i.children ?? []).map((c) => ({ to: c.to.split('?')[0], label: c.label })),
  ]);
  const match = flat
    .filter((i) => pathname.startsWith(i.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? 'Dashboard';
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user, pump } = useAuth();

  return (
    <div className="flex h-full min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="hidden shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 animate-fade-in">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <Logo className="h-8 w-8" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-navy-900 sm:text-lg">{titleFor(location.pathname)}</h1>
              <p className="hidden truncate text-xs text-ink-500 sm:block">{pump?.name}</p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/app/settings"
                className="hidden items-center gap-2 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50 sm:flex"
              >
                <Building2 className="h-4 w-4" />
                <span className="max-w-[140px] truncate">{pump?.databaseName}</span>
              </Link>
              {/* section 9: real notifications, derived from live data */}
              <NotificationBell />
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-700 text-sm font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children ?? <Outlet />}
        </main>

        <footer className="border-t border-ink-200/70 px-4 py-4 text-center text-xs text-ink-400 sm:px-6">
          BK Petrol Pump Manager &middot; Every pump runs on its own isolated database
        </footer>
      </div>
    </div>
  );
}
