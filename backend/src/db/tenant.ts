import mongoose, { type Connection, type ClientSession } from 'mongoose';
import { env } from '../config/env.js';
import { compileTenantModels, type TenantModels } from '../models/tenant/schemas.js';

/**
 * TENANT (per-pump) DATABASE LAYER
 * --------------------------------
 * Every petrol pump owns its own MongoDB database. This module:
 *   1. keeps one pooled mongoose connection to the cluster,
 *   2. hands out a per-database Connection (cached),
 *   3. compiles the tenant models onto that connection,
 *   4. exposes a transaction helper (falls back gracefully on standalone servers).
 *
 * The database name is ALWAYS resolved from the authenticated user's pump record
 * in the master DB - never from a client supplied value.
 */

let baseConnection: Connection | null = null;
let basePromise: Promise<Connection> | null = null;

async function getBaseConnection(): Promise<Connection> {
  if (baseConnection) return baseConnection;
  if (!basePromise) {
    basePromise = mongoose
      .createConnection(env.mongoUri, {
        serverSelectionTimeoutMS: 20000,
        maxPoolSize: 10,
        minPoolSize: 0,
      })
      .asPromise()
      .then((conn) => {
        baseConnection = conn;
        conn.on('error', (err) => console.error('[tenant base] connection error:', err.message));
        return conn;
      });
  }
  return basePromise;
}

interface TenantEntry {
  conn: Connection;
  models: TenantModels;
}

const tenantCache = new Map<string, Promise<TenantEntry>>();

const REQUIRED_COLLECTIONS = [
  'users',
  'fuels',
  'sales',
  'shifts',
  'customers',
  'customerTransactions',
  'expenses',
  'purchases',
  'suppliers',
  'stockTransactions',
];

async function buildTenant(databaseName: string): Promise<TenantEntry> {
  const base = await getBaseConnection();
  const conn = base.useDb(databaseName, { useCache: true });
  const models = compileTenantModels(conn);

  // Explicitly create the collections so a brand new pump database is fully
  // provisioned before the first write.
  const existing = new Set((await conn.db!.listCollections().toArray()).map((c) => c.name));
  await Promise.all(
    REQUIRED_COLLECTIONS.filter((c) => !existing.has(c)).map((c) =>
      conn.db!.createCollection(c).catch(() => undefined),
    ),
  );

  // Build indexes once per tenant database (needed for unique email etc.).
  // These run sequentially: MongoDB only allows a few concurrent index builds
  // and index creation touches a lot of file handles.
  for (const model of Object.values(models) as Array<{ init?: () => Promise<unknown> }>) {
    if (model.init) await model.init().catch(() => undefined);
  }

  return { conn, models };
}

/** Returns the models bound to a pump's own database (cached). */
export async function getTenant(databaseName: string): Promise<TenantModels> {
  if (!databaseName) throw new Error('getTenant() called without a databaseName');
  let entry = tenantCache.get(databaseName);
  if (!entry) {
    entry = buildTenant(databaseName);
    tenantCache.set(databaseName, entry);
    // If provisioning fails, do not cache the failure forever.
    entry.catch(() => tenantCache.delete(databaseName));
  }
  const resolved = await entry;
  return resolved.models;
}

export async function getTenantConnection(databaseName: string): Promise<Connection> {
  let entry = tenantCache.get(databaseName);
  if (!entry) {
    entry = buildTenant(databaseName);
    tenantCache.set(databaseName, entry);
    entry.catch(() => tenantCache.delete(databaseName));
  }
  return (await entry).conn;
}

/**
 * Run `fn` inside a transaction on the pump database when the server supports
 * it (replica set / Atlas). Standalone servers fall back to non-transactional
 * execution so the app still works in local development.
 *
 * IMPORTANT: `fn` must never issue concurrent operations on the session -
 * MongoDB requires operations sharing a session to be sequential.
 */
let transactionsAvailable: boolean | null = null;

const TRANSIENT_CODES = new Set([251 /* NoSuchTransaction */, 262 /* transaction aborted */]);
const TRANSIENT_LABELS = new Set(['TransientTransactionError', 'UnknownTransactionCommitResult']);

function isTransient(err: unknown): boolean {
  const e = err as { code?: number; codeName?: string; errorLabels?: string[]; hasErrorLabel?: (l: string) => boolean };
  if (!e) return false;
  if (e.code && TRANSIENT_CODES.has(e.code)) return true;
  if (e.codeName === 'NoSuchTransaction') return true;
  if (Array.isArray(e.errorLabels) && e.errorLabels.some((l) => TRANSIENT_LABELS.has(l))) return true;
  try {
    if (typeof e.hasErrorLabel === 'function' && e.hasErrorLabel('TransientTransactionError')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function isUnsupported(err: unknown): boolean {
  const e = err as { code?: number; codeName?: string; message?: string };
  if (e?.codeName === 'IllegalOperation') return true;
  if (e?.code === 20) return true;
  return /Transaction|replica set/i.test(String(e?.message ?? '')) && /not supported|standalone|no repl/i.test(String(e?.message ?? ''));
}

export async function withTransaction<T>(
  databaseName: string,
  fn: (session: ClientSession | null) => Promise<T>,
  attempt = 1,
): Promise<T> {
  if (transactionsAvailable === false) return fn(null);

  const conn = await getTenantConnection(databaseName);
  const session = await conn.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    transactionsAvailable = true;
    return result;
  } catch (err) {
    await session.abortTransaction().catch(() => undefined);

    // Transactions need a replica set. Standalone servers (local dev without
    // --replSet) simply run the callback without a transaction.
    if (isUnsupported(err) && transactionsAvailable === null) {
      console.warn('[db] Transactions unavailable on this server - continuing without them.');
      transactionsAvailable = false;
      return fn(null);
    }

    // Transient errors are safe to retry (MongoDB driver behaviour).
    if (isTransient(err) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 25 * attempt));
      return withTransaction(databaseName, fn, attempt + 1);
    }

    throw err;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Database naming
// ---------------------------------------------------------------------------
export function sanitiseDbToken(input: string, max = 32): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .slice(0, max)
      .replace(/_+$/g, '') || 'pump'
  );
}

/** petrolpump_ali_filling_001 */
export function buildDatabaseName(businessName: string, sequence: number): string {
  const token = sanitiseDbToken(businessName);
  const suffix = String(sequence).padStart(3, '0');
  return `petrolpump_${token}_${suffix}`;
}

export async function generateUniqueDatabaseName(
  businessName: string,
  isTaken: (name: string) => Promise<boolean>,
): Promise<string> {
  // fast path: sequential attempt, then append a short random suffix
  for (let seq = 1; seq <= 999; seq++) {
    const candidate = buildDatabaseName(businessName, seq);
    if (!(await isTaken(candidate))) return candidate;
  }
  const rand = Math.random().toString(36).slice(2, 8);
  return `petrolpump_${sanitiseDbToken(businessName, 24)}_${rand}`;
}

export async function dropTenantCache(databaseName: string): Promise<void> {
  tenantCache.delete(databaseName);
}

export async function listPumpDatabases(masterConn: Connection): Promise<string[]> {
  const admin = masterConn.db!.admin();
  const { databases } = await admin.listDatabases();
  return databases.map((d: { name: string }) => d.name).filter((n: string) => n.startsWith('petrolpump_'));
}

export async function closeAllConnections(): Promise<void> {
  await mongoose.disconnect();
}

export type { TenantModels };
