import mongoose, { Schema, type Connection, type Model } from 'mongoose';
import { env } from '../config/env.js';

/**
 * MASTER (SaaS-level) DATABASE
 * ---------------------------
 * Holds only platform level information:
 *   pumps, subscriptions, masterAdminUsers
 *
 * It NEVER holds a pump's operational data (sales, expenses, customers ...).
 * Those live in one dedicated database per pump (see ./tenant.ts).
 */

export interface IPump {
  name: string;
  slug: string;
  databaseName: string;
  ownerName: string;
  email: string;
  phone?: string;
  address?: string;
  status: 'active' | 'suspended';
  subscriptionStatus: 'trial' | 'active' | 'expired';
  plan: string;
  trialEndsAt?: Date;
  /** Normalised login emails of users belonging to this pump (lookup index only). */
  loginEmails: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscription {
  pumpId: mongoose.Types.ObjectId;
  plan: string;
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  amount: number;
  currency: string;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMasterAdminUser {
  name: string;
  email: string;
  passwordHash: string;
  role: 'superadmin';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pumpSchema = new Schema<IPump>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    databaseName: { type: String, required: true, unique: true, lowercase: true, index: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    subscriptionStatus: { type: String, enum: ['trial', 'active', 'expired'], default: 'trial' },
    plan: { type: String, default: 'starter' },
    trialEndsAt: { type: Date },
    loginEmails: { type: [String], default: [], index: true },
  },
  { timestamps: true, collection: 'pumps' },
);

const subscriptionSchema = new Schema<ISubscription>(
  {
    pumpId: { type: Schema.Types.ObjectId, ref: 'Pump', required: true, index: true },
    plan: { type: String, default: 'starter' },
    status: { type: String, enum: ['trial', 'active', 'expired', 'cancelled'], default: 'trial' },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'PKR' },
    startDate: { type: Date, default: () => new Date() },
    endDate: { type: Date },
  },
  { timestamps: true, collection: 'subscriptions' },
);

const masterAdminUserSchema = new Schema<IMasterAdminUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['superadmin'], default: 'superadmin' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'masterAdminUsers' },
);

let masterConnection: Connection | null = null;
let ready: Promise<MasterModels> | null = null;

export interface MasterModels {
  conn: Connection;
  Pump: Model<IPump>;
  Subscription: Model<ISubscription>;
  MasterAdminUser: Model<IMasterAdminUser>;
}

export async function connectMaster(): Promise<MasterModels> {
  if (ready) return ready;
  ready = (async () => {
    const conn = await mongoose
      .createConnection(env.mongoUri, {
        dbName: env.masterDbName,
        serverSelectionTimeoutMS: 15000,
      })
      .asPromise();

    masterConnection = conn;
    conn.on('error', (err) => {
      console.error('[master db] connection error:', err.message);
    });

    return {
      conn,
      Pump: conn.model<IPump>('Pump', pumpSchema),
      Subscription: conn.model<ISubscription>('Subscription', subscriptionSchema),
      MasterAdminUser: conn.model<IMasterAdminUser>('MasterAdminUser', masterAdminUserSchema),
    };
  })();
  return ready;
}

export function getMasterConnection(): Connection {
  if (!masterConnection) throw new Error('Master database is not connected yet');
  return masterConnection;
}
