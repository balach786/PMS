export type UserRole = 'admin' | 'manager' | 'cashier';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  active?: boolean;
  lastLoginAt?: string | null;
}

export interface PumpInfo {
  id: string;
  name: string;
  slug: string;
  databaseName: string;
  subscriptionStatus?: string;
  status?: string;
}

export interface Permissions {
  dashboard: boolean;
  sales: boolean;
  fuels: boolean;
  stock: boolean;
  shifts: boolean;
  customers: boolean;
  expenses: boolean;
  purchases: boolean;
  suppliers: boolean;
  reports: boolean;
  users: boolean;
  settings: boolean;
  manageAllShifts: boolean;
}

export interface AuthUser extends User {}

export interface Fuel {
  _id: string;
  name: string;
  code?: string;
  sellingPrice: number;
  purchasePrice: number;
  currentStock: number;
  /** Tank capacity in the fuel's unit; 0 means "not set". */
  capacity?: number;
  minStockAlert: number;
  unit: string;
  status: 'active' | 'inactive';
  color?: string;
  lowStock?: boolean;
  stockValue?: number;
}

/** Row of the daily fuel price board (section 22). */
export interface FuelPrice {
  _id: string;
  name: string;
  code?: string;
  unit: string;
  sellingPrice: number;
  purchasePrice: number;
  margin: number;
  currentStock: number;
  capacity: number;
  minStockAlert: number;
  status: 'active' | 'inactive';
  color?: string;
  lastUpdated: string;
  previousSellingPrice: number | null;
}

/** One entry of a fuel's price change audit trail. */
export interface PriceHistoryRow {
  _id: string;
  sellingPrice: number;
  purchasePrice: number;
  previousSellingPrice: number;
  previousPurchasePrice: number;
  source: 'create' | 'price-update' | 'fuel-update';
  changedByName?: string;
  changedAt: string;
}

export type PaymentMethod = 'cash' | 'card' | 'bank' | 'credit';

export interface Sale {
  _id: string;
  invoiceNumber: string;
  fuelId: string;
  fuelName: string;
  quantity: number;
  rate: number;
  total: number;
  costPrice: number;
  costTotal: number;
  paymentMethod: PaymentMethod;
  customerId?: string | null;
  customerName?: string | null;
  shiftId?: string | null;
  userId: string;
  userName: string;
  notes?: string;
  status: 'completed' | 'voided';
  voidReason?: string;
  saleAt: string;
  remainingStock?: number;
}

export interface Shift {
  _id: string;
  shiftNumber: string;
  userId: string;
  userName: string;
  openingCash: number;
  openingMeter?: number;
  closingMeter?: number | null;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string | null;
  totalSales?: number;
  totalLiters?: number;
  cashSales?: number;
  cardSales?: number;
  bankSales?: number;
  creditSales?: number;
  expenses?: number;
  expectedCash?: number;
  actualCash?: number | null;
  difference?: number | null;
  notes?: string;
  saleCount?: number;
}

export interface Customer {
  _id: string;
  name: string;
  phone?: string;
  vehicleNumber?: string;
  address?: string;
  notes?: string;
  currentBalance: number;
  status: 'active' | 'inactive';
}

export interface CustomerTransaction {
  _id: string;
  customerId: string;
  customerName: string;
  type: 'credit_sale' | 'payment' | 'adjustment';
  amount: number;
  balanceAfter: number;
  paymentMethod?: string | null;
  description?: string;
  invoiceNumber?: string | null;
  userName?: string;
  txnAt: string;
}

export interface Expense {
  _id: string;
  category: string;
  amount: number;
  description?: string;
  date: string;
  paymentMethod: PaymentMethod;
  addedByName: string;
  reference?: string;
  status: 'active' | 'voided';
}

export interface Supplier {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  status: 'active' | 'inactive';
}

export interface Purchase {
  _id: string;
  invoiceNumber?: string;
  supplierId: string;
  supplierName: string;
  fuelId: string;
  fuelName: string;
  quantity: number;
  purchaseRate: number;
  totalAmount: number;
  date: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  addedByName: string;
  status: 'active' | 'voided';
}

export interface StockTransaction {
  _id: string;
  fuelId: string;
  fuelName: string;
  type: 'opening' | 'purchase' | 'sale' | 'adjustment' | 'void';
  quantity: number;
  balanceAfter: number;
  reference?: string;
  notes?: string;
  userName?: string;
  txnAt: string;
}

export interface Paginated<T> {
  items: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    [key: string]: unknown;
  };
}

/** One row of the dashboard activity feed (section 16). */
export interface ActivityRow {
  id: string;
  type: 'sale' | 'purchase' | 'expense' | 'payment' | 'adjustment';
  details: string;
  amount: number;
  direction: 'in' | 'out';
  at: string;
}

export interface DashboardData {
  range: { key: string; label: string; display: string; from: string; to: string };
  kpis: {
    totalSales: number;
    totalLiters: number;
    transactionCount: number;
    costOfSales: number;
    grossProfit: number;
    expenses: number;
    /** Today's operating expenses, whatever range is selected (section 11) */
    expensesToday: number;
    estimatedProfit: number;
    profitLabel: string;
    marginPercent: number;
    creditOutstanding: number;
    byPayment: { cash: number; card: number; bank: number; credit: number };
  };
  today: {
    totalSales: number;
    totalLiters: number;
    transactionCount: number;
    expenses: number;
    grossProfit: number;
    estimatedProfit: number;
  };
  /** The single estimated-profit figure shared by every screen (sections 27-30) */
  profit: {
    label: string;
    revenue: number;
    fuelCost: number;
    grossProfit: number;
    expenses: number;
    estimatedProfit: number;
    marginPercent: number;
  };
  /** Section 20 */
  quickInfo: {
    creditOutstanding: number;
    totalCustomers: number;
    activeSuppliers: number;
    totalFuelTypes: number;
    lowStockFuels: number;
  };
  /** Section 19 - last 7 days against the 7 days before */
  last7Days: {
    total: number;
    previousTotal: number;
    changePercent: number;
    series: Array<{ day: string; revenue: number }>;
  };
  recentActivity: ActivityRow[];
  fuelBreakdown: Array<{ fuelName: string; liters: number; revenue: number; cost: number }>;
  salesTrend: Array<{ day: string; revenue: number; liters: number }>;
  /** Real per-day expense totals, so sales-vs-expenses is never fabricated. */
  expenseTrend: Array<{ day: string; amount: number }>;
  expenseBreakdown: Array<{ category: string; amount: number }>;
  stock: Array<{
    _id: string;
    name: string;
    unit: string;
    code?: string;
    currentStock: number;
    capacity: number;
    fillPercent: number | null;
    minStockAlert: number;
    /** Computed once by the backend (section 15) — never re-derived in the UI. */
    status: 'Normal' | 'Low Stock' | 'Critical';
    lowStock: boolean;
    sellingPrice: number;
    value: number;
  }>;
  openShift: (Shift & { expectedCash?: number; totalSales?: number; totalLiters?: number; cashSales?: number; expenses?: number }) | null;
  recentSales: Sale[];
  note: string;
}

/**
 * Dashboard notification (section 9). Alerts are derived from live data by the
 * backend - they are never stored as stale rows, so fixing the underlying
 * condition (refuelling, opening a shift) makes the alert disappear.
 */
export interface NotificationItem {
  key: string;
  level: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  link: string;
  at: string;
  dismissed: boolean;
}

export interface NotificationResponse {
  items: NotificationItem[];
  meta: { total: number; unreadCount: number };
}

/** GET /notifications response body (`http.get` already unwraps `data`). */
export interface NotificationList {
  items: NotificationItem[];
}

export interface ReportResponse {
  type: string;
  title: string;
  range: { key: string; label: string; from: string; to: string };
  groupBy: string;
  columns: Array<{ key: string; header: string; type?: string; align?: string; total?: boolean }>;
  rows: Array<Record<string, unknown>>;
  summary: Array<{ label: string; value: string }>;
  totals: Record<string, unknown> | null;
  note: string | null;
  pumpName: string;
  generatedAt: string;
}
