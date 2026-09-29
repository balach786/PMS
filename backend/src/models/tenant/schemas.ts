import mongoose, { Schema, type Model, type Connection } from 'mongoose';

/**
 * SCHEMA DEFINITIONS FOR A PUMP (TENANT) DATABASE
 * -----------------------------------------------
 * Schemas are declared once and compiled onto each pump's own mongoose
 * Connection. That guarantees every pump reads/writes only its own database.
 */

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'manager' | 'cashier';
  phone?: string;
  active: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'cashier'], default: 'cashier' },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'users' },
);

// ---------------------------------------------------------------------------
// fuels
// ---------------------------------------------------------------------------
export interface IFuel {
  name: string;
  code?: string;
  sellingPrice: number;
  purchasePrice: number;
  currentStock: number;
  /** Storage tank capacity in the fuel's unit (0 = not set). */
  capacity: number;
  minStockAlert: number;
  unit: string;
  status: 'active' | 'inactive';
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

const fuelSchema = new Schema<IFuel>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    sellingPrice: { type: Number, required: true, min: 0, default: 0 },
    purchasePrice: { type: Number, required: true, min: 0, default: 0 },
    currentStock: { type: Number, required: true, default: 0 },
    capacity: { type: Number, default: 0, min: 0 },
    minStockAlert: { type: Number, default: 0 },
    unit: { type: String, default: 'L' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    color: { type: String },
  },
  { timestamps: true, collection: 'fuels' },
);

// ---------------------------------------------------------------------------
// price history
// Every change to a fuel's selling / purchase price is recorded here, so the
// owner can see exactly when a price moved. Historical SALES are never touched:
// each sale stores the rate and cost that applied at the moment it was made.
// ---------------------------------------------------------------------------
export interface IPriceHistory {
  fuelId: Schema.Types.ObjectId;
  fuelName: string;
  sellingPrice: number;
  purchasePrice: number;
  previousSellingPrice: number;
  previousPurchasePrice: number;
  changedBy?: string;
  changedByName?: string;
  source: 'create' | 'price-update' | 'fuel-update';
  changedAt: Date;
}

const priceHistorySchema = new Schema<IPriceHistory>(
  {
    fuelId: { type: Schema.Types.ObjectId, ref: 'Fuel', required: true, index: true },
    fuelName: { type: String, required: true },
    sellingPrice: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    previousSellingPrice: { type: Number, default: 0 },
    previousPurchasePrice: { type: Number, default: 0 },
    changedBy: { type: String },
    changedByName: { type: String },
    source: { type: String, enum: ['create', 'price-update', 'fuel-update'], default: 'price-update' },
    changedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false, collection: 'priceHistory' },
);

// ---------------------------------------------------------------------------
// notifications (dismissed-alert bookkeeping for the dashboard bell)
// ---------------------------------------------------------------------------
/**
 * Alerts themselves are DERIVED from live data (stock levels, shifts, credit,
 * price changes) - they are never stored as stale rows. This collection only
 * records which alerts a user has dismissed, so the bell can show an honest
 * unread count without inventing a notification queue.
 */
export interface INotification {
  userId: mongoose.Types.ObjectId;
  /** stable key for the alert, e.g. "stock-critical:<fuelId>" */
  key: string;
  dismissedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    key: { type: String, required: true },
    dismissedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false, collection: 'notifications' },
);

notificationSchema.index({ userId: 1, key: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// sales
// ---------------------------------------------------------------------------
export type PaymentMethod = 'cash' | 'card' | 'bank' | 'credit';

export interface ISale {
  invoiceNumber: string;
  fuelId: Schema.Types.ObjectId;
  fuelName: string;
  quantity: number;
  rate: number;
  total: number;
  /** unit purchase price captured at sale time -> used for estimated profit */
  costPrice: number;
  costTotal: number;
  paymentMethod: PaymentMethod;
  customerId?: Schema.Types.ObjectId | null;
  customerName?: string | null;
  shiftId?: Schema.Types.ObjectId | null;
  userId: Schema.Types.ObjectId;
  userName: string;
  notes?: string;
  status: 'completed' | 'voided';
  voidedAt?: Date;
  voidedBy?: Schema.Types.ObjectId | null;
  voidReason?: string;
  saleAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const saleSchema = new Schema<ISale>(
  {
    invoiceNumber: { type: String, required: true, index: true },
    fuelId: { type: Schema.Types.ObjectId, ref: 'Fuel', required: true, index: true },
    fuelName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0 },
    costTotal: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'bank', 'credit'],
      default: 'cash',
      index: true,
    },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customerName: { type: String, default: null },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    notes: { type: String },
    status: { type: String, enum: ['completed', 'voided'], default: 'completed', index: true },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String },
    saleAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true, collection: 'sales' },
);

// ---------------------------------------------------------------------------
// shifts
// ---------------------------------------------------------------------------
export interface IShift {
  shiftNumber: string;
  userId: Schema.Types.ObjectId;
  userName: string;
  openingCash: number;
  openingMeter: number;
  closingMeter?: number | null;
  status: 'open' | 'closed';
  openedAt: Date;
  closedAt?: Date | null;
  /** derived on close */
  totalSales: number;
  totalLiters: number;
  cashSales: number;
  cardSales: number;
  bankSales: number;
  creditSales: number;
  expenses: number;
  expectedCash: number;
  actualCash?: number | null;
  difference?: number | null;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const shiftSchema = new Schema<IShift>(
  {
    shiftNumber: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, required: true },
    openingCash: { type: Number, required: true, min: 0, default: 0 },
    openingMeter: { type: Number, default: 0 },
    closingMeter: { type: Number, default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    openedAt: { type: Date, default: () => new Date(), index: true },
    closedAt: { type: Date, default: null },
    totalSales: { type: Number, default: 0 },
    totalLiters: { type: Number, default: 0 },
    cashSales: { type: Number, default: 0 },
    cardSales: { type: Number, default: 0 },
    bankSales: { type: Number, default: 0 },
    creditSales: { type: Number, default: 0 },
    expenses: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    actualCash: { type: Number, default: null },
    difference: { type: Number, default: null },
    notes: { type: String },
  },
  { timestamps: true, collection: 'shifts' },
);

// ---------------------------------------------------------------------------
// customers
// ---------------------------------------------------------------------------
export interface ICustomer {
  name: string;
  phone?: string;
  vehicleNumber?: string;
  address?: string;
  notes?: string;
  currentBalance: number;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, index: true },
    vehicleNumber: { type: String, trim: true, uppercase: true },
    address: { type: String, trim: true },
    notes: { type: String },
    currentBalance: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, collection: 'customers' },
);

// ---------------------------------------------------------------------------
// customerTransactions (credit ledger)
// ---------------------------------------------------------------------------
export interface ICustomerTransaction {
  customerId: Schema.Types.ObjectId;
  customerName: string;
  type: 'credit_sale' | 'payment' | 'adjustment';
  /** positive = customer owes more, negative = customer paid / owes less */
  amount: number;
  balanceAfter: number;
  paymentMethod?: PaymentMethod | null;
  description?: string;
  saleId?: Schema.Types.ObjectId | null;
  invoiceNumber?: string | null;
  userId?: Schema.Types.ObjectId | null;
  userName?: string;
  txnAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerTransactionSchema = new Schema<ICustomerTransaction>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerName: { type: String, required: true },
    type: { type: String, enum: ['credit_sale', 'payment', 'adjustment'], required: true, index: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['cash', 'card', 'bank', 'credit'], default: null },
    description: { type: String },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', default: null },
    invoiceNumber: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String },
    txnAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true, collection: 'customerTransactions' },
);

// ---------------------------------------------------------------------------
// expenses
// ---------------------------------------------------------------------------
export const EXPENSE_CATEGORIES = [
  'Electricity',
  'Salary',
  'Maintenance',
  'Cleaning',
  'Generator',
  'Transport',
  'Office',
  'Other',
] as const;

export interface IExpense {
  category: string;
  amount: number;
  description?: string;
  date: Date;
  paymentMethod: PaymentMethod;
  addedBy: Schema.Types.ObjectId | null;
  addedByName: string;
  shiftId?: Schema.Types.ObjectId | null;
  reference?: string;
  status: 'active' | 'voided';
  voidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    category: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String },
    date: { type: Date, default: () => new Date(), index: true },
    paymentMethod: { type: String, enum: ['cash', 'card', 'bank', 'credit'], default: 'cash' },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    addedByName: { type: String, default: '' },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', default: null, index: true },
    reference: { type: String },
    status: { type: String, enum: ['active', 'voided'], default: 'active', index: true },
    voidedAt: { type: Date },
  },
  { timestamps: true, collection: 'expenses' },
);

// ---------------------------------------------------------------------------
// suppliers
// ---------------------------------------------------------------------------
export interface ISupplier {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    notes: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, collection: 'suppliers' },
);

// ---------------------------------------------------------------------------
// purchases (fuel bought from a supplier)
// ---------------------------------------------------------------------------
export interface IPurchase {
  invoiceNumber?: string;
  supplierId: Schema.Types.ObjectId | null;
  supplierName: string;
  fuelId: Schema.Types.ObjectId;
  fuelName: string;
  quantity: number;
  purchaseRate: number;
  totalAmount: number;
  date: Date;
  notes?: string;
  paymentMethod: PaymentMethod;
  addedBy: Schema.Types.ObjectId | null;
  addedByName: string;
  status: 'active' | 'voided';
  voidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseSchema = new Schema<IPurchase>(
  {
    invoiceNumber: { type: String, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
    supplierName: { type: String, default: '' },
    fuelId: { type: Schema.Types.ObjectId, ref: 'Fuel', required: true, index: true },
    fuelName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    purchaseRate: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: () => new Date(), index: true },
    notes: { type: String },
    paymentMethod: { type: String, enum: ['cash', 'card', 'bank', 'credit'], default: 'cash' },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    addedByName: { type: String, default: '' },
    status: { type: String, enum: ['active', 'voided'], default: 'active', index: true },
    voidedAt: { type: Date },
  },
  { timestamps: true, collection: 'purchases' },
);

// ---------------------------------------------------------------------------
// stockTransactions (every movement of fuel)
// ---------------------------------------------------------------------------
export type StockTxType = 'opening' | 'purchase' | 'sale' | 'adjustment' | 'void';

export interface IStockTransaction {
  fuelId: Schema.Types.ObjectId;
  fuelName: string;
  type: StockTxType;
  /** signed: + incoming, - outgoing */
  quantity: number;
  balanceAfter: number;
  refId?: Schema.Types.ObjectId | null;
  refType?: string | null;
  reference?: string;
  notes?: string;
  userId?: Schema.Types.ObjectId | null;
  userName?: string;
  txnAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stockTransactionSchema = new Schema<IStockTransaction>(
  {
    fuelId: { type: Schema.Types.ObjectId, ref: 'Fuel', required: true, index: true },
    fuelName: { type: String, required: true },
    type: { type: String, enum: ['opening', 'purchase', 'sale', 'adjustment', 'void'], required: true, index: true },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    refId: { type: Schema.Types.ObjectId, default: null },
    refType: { type: String, default: null },
    reference: { type: String },
    notes: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String },
    txnAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true, collection: 'stockTransactions' },
);

// ---------------------------------------------------------------------------
// Model factory
// ---------------------------------------------------------------------------
export interface TenantModels {
  User: Model<IUser>;
  Fuel: Model<IFuel>;
  PriceHistory: Model<IPriceHistory>;
  Sale: Model<ISale>;
  Shift: Model<IShift>;
  Customer: Model<ICustomer>;
  CustomerTransaction: Model<ICustomerTransaction>;
  Expense: Model<IExpense>;
  Supplier: Model<ISupplier>;
  Purchase: Model<IPurchase>;
  StockTransaction: Model<IStockTransaction>;
  Notification: Model<INotification>;
}

export function compileTenantModels(conn: Connection): TenantModels {
  return {
    User: (conn.models.User as Model<IUser>) || conn.model<IUser>('User', userSchema),
    Fuel: (conn.models.Fuel as Model<IFuel>) || conn.model<IFuel>('Fuel', fuelSchema),
    PriceHistory:
      (conn.models.PriceHistory as Model<IPriceHistory>) ||
      conn.model<IPriceHistory>('PriceHistory', priceHistorySchema),
    Sale: (conn.models.Sale as Model<ISale>) || conn.model<ISale>('Sale', saleSchema),
    Shift: (conn.models.Shift as Model<IShift>) || conn.model<IShift>('Shift', shiftSchema),
    Customer: (conn.models.Customer as Model<ICustomer>) || conn.model<ICustomer>('Customer', customerSchema),
    CustomerTransaction:
      (conn.models.CustomerTransaction as Model<ICustomerTransaction>) ||
      conn.model<ICustomerTransaction>('CustomerTransaction', customerTransactionSchema),
    Expense: (conn.models.Expense as Model<IExpense>) || conn.model<IExpense>('Expense', expenseSchema),
    Supplier: (conn.models.Supplier as Model<ISupplier>) || conn.model<ISupplier>('Supplier', supplierSchema),
    Purchase: (conn.models.Purchase as Model<IPurchase>) || conn.model<IPurchase>('Purchase', purchaseSchema),
    StockTransaction:
      (conn.models.StockTransaction as Model<IStockTransaction>) ||
      conn.model<IStockTransaction>('StockTransaction', stockTransactionSchema),
    Notification:
      (conn.models.Notification as Model<INotification>) ||
      conn.model<INotification>('Notification', notificationSchema),
  };
}

export { userSchema, fuelSchema, priceHistorySchema, notificationSchema, saleSchema, shiftSchema, customerSchema, customerTransactionSchema, expenseSchema, supplierSchema, purchaseSchema, stockTransactionSchema };
