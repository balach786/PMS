import type { TenantModels } from '../models/tenant/schemas.js';
import type { Types } from 'mongoose';

export type UserRole = 'admin' | 'manager' | 'cashier';

export interface AuthPrincipal {
  userId: string;
  pumpId: string;
  databaseName: string;
  pumpName: string;
  pumpSlug: string;
  role: UserRole;
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
      /** Models bound to the authenticated pump's own database. */
      tenant?: TenantModels;
      /** ObjectId of the authenticated user, cast once for convenience. */
      tenantUserId?: Types.ObjectId;
      requestId?: string;
    }
  }
}

export {};
