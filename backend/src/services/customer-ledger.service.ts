import type { ClientSession } from 'mongoose';
import type { TenantModels } from '../models/tenant/schemas.js';
import { ApiError } from '../utils/http.js';
import { money } from '../utils/number.js';

export interface LedgerInput {
  customerId: string;
  type: 'credit_sale' | 'payment' | 'adjustment';
  /** Always positive magnitude; direction is derived from `type`. */
  amount: number;
  paymentMethod?: string | null;
  description?: string;
  saleId?: string | null;
  invoiceNumber?: string | null;
  userId?: string | null;
  userName?: string;
  txnAt?: Date;
}

/**
 * The single entry point for moving a customer's balance.
 * credit_sale -> balance increases, payment -> balance decreases,
 * adjustment -> uses the signed amount you pass.
 */
export async function applyCustomerTransaction(
  models: TenantModels,
  input: LedgerInput,
  session: ClientSession | null = null,
): Promise<{ balanceAfter: number; customerName: string }> {
  const amount = money(Math.abs(input.amount));
  if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero.');

  const customer = await models.Customer.findById(input.customerId).session(session ?? null);
  if (!customer) throw ApiError.notFound('Customer not found.');

  let signed: number;
  if (input.type === 'credit_sale') signed = amount;
  else if (input.type === 'payment') signed = -amount;
  else signed = money(input.amount); // adjustment keeps the caller's sign

  const balanceAfter = money(customer.currentBalance + signed);
  customer.currentBalance = balanceAfter;
  await customer.save({ ...(session ? { session } : {}) });

  await models.CustomerTransaction.create(
    [
      {
        customerId: customer._id,
        customerName: customer.name,
        type: input.type,
        amount: signed,
        balanceAfter,
        paymentMethod: input.paymentMethod ?? null,
        description: input.description ?? null,
        saleId: input.saleId ?? null,
        invoiceNumber: input.invoiceNumber ?? null,
        userId: input.userId ?? null,
        userName: input.userName ?? '',
        txnAt: input.txnAt ?? new Date(),
      },
    ],
    { ...(session ? { session } : {}) },
  );

  return { balanceAfter, customerName: customer.name };
}

/** Reverse a credit sale when the sale is voided. */
export async function reverseCreditSale(
  models: TenantModels,
  saleId: string,
  session: ClientSession | null = null,
): Promise<void> {
  const ledgerEntry = await models.CustomerTransaction.findOne({ saleId, type: 'credit_sale' }).session(session ?? null);
  if (!ledgerEntry) return;
  await applyCustomerTransaction(
    models,
    {
      customerId: String(ledgerEntry.customerId),
      type: 'payment',
      amount: Math.abs(ledgerEntry.amount),
      description: `Reversal of voided sale ${ledgerEntry.invoiceNumber ?? saleId}`,
      paymentMethod: ledgerEntry.paymentMethod,
    },
    session,
  );
}
