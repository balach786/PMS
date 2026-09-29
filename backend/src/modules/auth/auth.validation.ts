import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../../models/tenant/schemas.js';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((v) => /[A-Za-z]/.test(v), 'Password must contain at least one letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain at least one number');

export const emailSchema = z.string().trim().min(1, 'Email is required').email('Enter a valid email address').toLowerCase();

export const registerSchema = z
  .object({
    businessName: z.string().trim().min(2, 'Petrol pump name must be at least 2 characters').max(90),
    ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters').max(60),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .min(7, 'Enter a valid phone number')
      .max(25, 'Phone number is too long')
      .regex(/^[+0-9][0-9+\-\s()]*$/, 'Enter a valid phone number'),
    address: z.string().trim().max(180).optional().or(z.literal('')),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'manager', 'cashier']),
  phone: z.string().trim().max(25).optional().or(z.literal('')),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  email: emailSchema.optional(),
  role: z.enum(['admin', 'manager', 'cashier']).optional(),
  phone: z.string().trim().max(25).optional().or(z.literal('')),
  active: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const fuelSchema = z.object({
  name: z.string().trim().min(2, 'Fuel name must be at least 2 characters').max(50),
  code: z.string().trim().max(12).optional().or(z.literal('')),
  sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative'),
  purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative'),
  currentStock: z.coerce.number().min(0, 'Stock cannot be negative'),
  /** Tank capacity in litres. 0 means "not set". */
  capacity: z.coerce.number().min(0, 'Capacity cannot be negative').optional(),
  minStockAlert: z.coerce.number().min(0, 'Minimum stock cannot be negative'),
  status: z.enum(['active', 'inactive']).default('active'),
  color: z.string().trim().max(20).optional().or(z.literal('')),
});

export const updateFuelSchema = fuelSchema.partial().extend({ currentStock: z.coerce.number().min(0).optional() });

/** Dedicated daily fuel price update (section 22). */
export const fuelPriceSchema = z.object({
  sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative'),
  purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative').optional(),
  /** Free-text reason, kept in the price history log. */
  note: z.string().trim().max(200).optional().or(z.literal('')),
});

export const saleSchema = z
  .object({
    fuelId: z.string().min(1, 'Select a fuel type'),
    quantity: z.coerce.number().positive('Quantity must be greater than zero').max(1_000_000),
    rate: z.coerce.number().min(0, 'Rate cannot be negative').optional(),
    paymentMethod: z.enum(['cash', 'card', 'bank', 'credit']),
    customerId: z.string().optional().nullable(),
    notes: z.string().trim().max(300).optional().or(z.literal('')),
    saleAt: z.coerce.date().optional(),
    shiftId: z.string().optional().nullable(),
  })
  .refine((v) => v.paymentMethod !== 'credit' || !!v.customerId, {
    message: 'Select a customer for credit sales',
    path: ['customerId'],
  });

export const updateSaleSchema = z.object({
  quantity: z.coerce.number().positive().max(1_000_000).optional(),
  rate: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank', 'credit']).optional(),
  customerId: z.string().optional().nullable(),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export const openShiftSchema = z.object({
  openingCash: z.coerce.number().min(0, 'Opening cash cannot be negative'),
  openingMeter: z.coerce.number().min(0, 'Opening meter reading cannot be negative').optional(),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export const closeShiftSchema = z.object({
  closingMeter: z.coerce.number().min(0).optional(),
  actualCash: z.coerce.number().min(0, 'Actual cash cannot be negative'),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(80),
  phone: z.string().trim().max(25).optional().or(z.literal('')),
  vehicleNumber: z.string().trim().max(25).optional().or(z.literal('')),
  address: z.string().trim().max(180).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  paymentMethod: z.enum(['cash', 'card', 'bank']).default('cash'),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  txnAt: z.coerce.date().optional(),
});

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  date: z.coerce.date().optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank', 'credit']).default('cash'),
  reference: z.string().trim().max(60).optional().or(z.literal('')),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name must be at least 2 characters').max(80),
  phone: z.string().trim().max(25).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().trim().max(180).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const purchaseSchema = z.object({
  supplierId: z.string().min(1, 'Select a supplier'),
  fuelId: z.string().min(1, 'Select a fuel'),
  quantity: z.coerce.number().positive('Quantity must be greater than zero').max(10_000_000),
  purchaseRate: z.coerce.number().min(0, 'Purchase rate cannot be negative'),
  invoiceNumber: z.string().trim().max(60).optional().or(z.literal('')),
  date: z.coerce.date().optional(),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
  paymentMethod: z.enum(['cash', 'card', 'bank', 'credit']).default('cash'),
});

export const stockAdjustmentSchema = z.object({
  fuelId: z.string().min(1, 'Select a fuel'),
  type: z.enum(['opening', 'adjustment']),
  quantity: z.coerce.number().refine((v) => v !== 0, 'Quantity cannot be zero'),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export const dateRangeQuerySchema = z.object({
  range: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
