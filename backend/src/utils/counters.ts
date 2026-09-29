import type { ClientSession } from 'mongoose';
import type { Connection } from 'mongoose';
import type { TenantModels } from '../models/tenant/schemas.js';

interface CounterDoc {
  _id: string;
  seq: number;
}

/**
 * Atomic per-pump counters (invoice numbers, shift numbers).
 * Stored inside the pump's own database.
 */
export async function nextSequence(
  conn: Connection,
  key: string,
  session: ClientSession | null = null,
): Promise<number> {
  const collection = conn.db!.collection<CounterDoc>('counters');
  const res = await collection.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  );
  return res?.seq ?? 1;
}

export async function nextInvoiceNumber(
  models: TenantModels,
  conn: Connection,
  prefix: string,
  session: ClientSession | null = null,
  date: Date = new Date(),
): Promise<string> {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate(),
  ).padStart(2, '0')}`;
  const seq = await nextSequence(conn, `${prefix}_${ymd}`, session);
  return `${prefix}-${ymd}-${String(seq).padStart(4, '0')}`;
}
