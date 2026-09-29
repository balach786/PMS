import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Fuel as FuelIcon,
  Receipt,
  Clock,
  Users,
  Wallet,
  Truck,
  Droplets,
  FileBarChart,
  UserCog,
  X,
  LogOut,
  Settings,
  Tag,
  History,
  Plus,
  ChevronDown,
  CreditCard,
} from 'lucide-react';
import { LogoWordmark } from '../Logo';
import { useAuth } from '../../lib/auth';

export interface NavChild {
  to: string;
  label: string;
  permission: keyof ReturnType<typeof useAuth>['permissions'];
}

export interface NavItem {
  to?: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: keyof ReturnType<typeof useAuth>['permissions'];
  exact?: boolean;
  children?: NavChild[];
}

/** Sidebar structure from section 39 of the build spec. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard', exact: true },

  {
    label: 'Fuel Management',
    icon: FuelIcon,
    permission: 'fuels',
    children: [
      { to: '/app/fuels', label: 'Fuel Overview', permission: 'fuels' },
      { to: '/app/fuel-prices', label: 'Fuel Prices', permission: 'fuels' },
      { to: '/app/stock', label: 'Stock', permission: 'stock' },
      { to: '/app/stock?tab=ledger', label: 'Stock History', permission: 'stock' },
    ],
  },

  {
    label: 'Sales',
    icon: Receipt,
    permission: 'sales',
    children: [
      { to: '/app/sales?new=1', label: 'New Sale', permission: 'sales' },
      { to: '/app/sales', label: 'Sales History', permission: 'sales' },
    ],
  },

  {
    label: 'Shifts',
    icon: Clock,
    permission: 'shifts',
    children: [
      { to: '/app/shifts', label: 'Current Shift', permission: 'shifts' },
      { to: '/app/shifts?tab=history', label: 'Shift History', permission: 'shifts' },
    ],
  },

  {
    label: 'Customers',
    icon: Users,
    permission: 'customers',
    children: [
      { to: '/app/customers', label: 'Customers', permission: 'customers' },
      { to: '/app/customers?tab=credit', label: 'Credit Accounts', permission: 'customers' },
      { to: '/app/customers?tab=payments', label: 'Payments', permission: 'customers' },
    ],
  },

  { to: '/app/expenses', label: 'Expenses', icon: Wallet, permission: 'expenses' },
  { to: '/app/purchases', label: 'Purchases', icon: Truck, permission: 'purchases' },
  { to: '/app/suppliers', label: 'Suppliers', icon: Truck, permission: 'suppliers' },

  {
    label: 'Reports',
    icon: FileBarChart,
    permission: 'reports',
    children: [
      { to: '/app/reports?type=sales', label: 'Sales', permission: 'reports' },
      { to: '/app/reports?type=fuel', label: 'Fuel', permission: 'reports' },
      { to: '/app/reports?type=expenses', label: 'Expenses', permission: 'reports' },
      { to: '/app/reports?type=stock', label: 'Stock', permission: 'reports' },
      { to: '/app/reports?type=shifts', label: 'Shifts', permission: 'reports' },
      { to: '/app/reports?type=customers', label: 'Credit', permission: 'reports' },
      { to: '/app/reports?type=profit', label: 'Profit Summary', permission: 'reports' },
    ],
  },

  { to: '/app/users', label: 'Users', icon: UserCog, permission: 'users' },
  { to: '/app/settings', label: 'Settings', icon: Settings, permission: 'settings' },
];

const CHILD_ICONS: Record<string, typeof Tag> = {
  'Fuel Prices': Tag,
  'Stock History': History,
  'New Sale': Plus,
  'Credit Accounts': CreditCard,
};

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, pump, permissions, logout } = useAuth();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<string[]>(() =>
    NAV_ITEMS.filter((i) => i.children?.some((c) => location.pathname.startsWith(c.to.split('?')[0]))).map((i) => i.label),
  );

  const items = NAV_ITEMS.filter((item) => permissions[item.permission]);

  const toggle = (label: string) =>
    setOpenGroups((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));

  const isGroupActive = (item: NavItem) =>
    Boolean(item.children?.some((c) => {
      const path = c.to.split('?')[0];
      return location.pathname === path || location.pathname.startsWith(`${path}/`);
    }));

  return (
    <div className="flex h-full w-64 flex-col bg-navy-900 text-white">
      <div className="flex items-center justify-between px-4 py-4">
        <LogoWordmark light />
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const Icon = item.icon;

          if (!item.children) {
            return (
              <NavLink
                key={item.to}
                to={item.to!}
                onClick={onClose}
                end={item.exact}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                    isActive ? 'bg-gold-500 text-navy-900' : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          }

          const open = openGroups.includes(item.label);
          const active = isGroupActive(item);

          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() => toggle(item.label)}
                aria-expanded={open}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown
                  className={clsx('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
                />
              </button>

              {open && (
                <div className="mt-0.5 space-y-0.5 pl-4">
                  {item.children
                    .filter((child) => permissions[child.permission])
                    .map((child) => {
                      const ChildIcon = CHILD_ICONS[child.label];
                      const childPath = child.to.split('?')[0];
                      const isActive =
                        location.pathname === childPath ||
                        location.pathname.startsWith(`${childPath}/`);
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={onClose}
                          className={clsx(
                            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition',
                            isActive && !child.to.includes('?')
                              ? 'bg-gold-500 font-semibold text-navy-900'
                              : isActive
                                ? 'bg-white/10 font-semibold text-white'
                                : 'text-white/60 hover:bg-white/10 hover:text-white',
                          )}
                        >
                          {ChildIcon ? (
                            <ChildIcon className="h-4 w-4 shrink-0" />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                          )}
                          <span>{child.label}</span>
                        </NavLink>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-3 flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500 text-sm font-bold text-navy-900">
            {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="truncate text-xs capitalize text-white/50">{user?.role}</p>
          </div>
        </div>
        <p className="mb-2 truncate px-1 text-[11px] text-white/40" title={pump?.databaseName}>
          {pump?.name}
        </p>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
