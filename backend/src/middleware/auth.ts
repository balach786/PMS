import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/http.js';
import { getTenant } from '../db/tenant.js';
import { connectMaster } from '../db/master.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { UserRole } from '../types/express.js';
import mongoose from 'mongoose';

/**
 * Reads the Bearer token, verifies it and puts the *server side* principal on
 * the request. The pump database name comes from the signed token - but is
 * re-validated against the master database on every request (see
 * `resolvePump`) so a suspended/deleted pump can never be used again.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('You must be signed in to access this resource.'));
  }
  const token = header.slice(7).trim();
  if (!token) return next(ApiError.unauthorized('You must be signed in to access this resource.'));

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.userId,
      pumpId: payload.pumpId,
      databaseName: payload.databaseName,
      pumpName: payload.pumpName,
      pumpSlug: payload.pumpSlug,
      role: payload.role,
      name: payload.name,
      email: payload.email,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Loads the pump from the master DB, confirms it is active and binds the
 * pump's own database models to the request. Data isolation is enforced here:
 * nothing downstream can reach another pump's database.
 */
export const resolveTenant = asyncHandler(async (req, _res, next) => {
  if (!req.auth) return next(ApiError.unauthorized());
  const { Pump } = await connectMaster();
  const pump = await Pump.findOne({ _id: req.auth.pumpId, databaseName: req.auth.databaseName }).lean();
  if (!pump) return next(ApiError.unauthorized('Your account is no longer linked to an active pump.'));
  if (pump.status !== 'active') {
    return next(ApiError.forbidden('This petrol pump account is suspended. Please contact support.'));
  }

  // keep the pump name fresh in case it was renamed
  req.auth.pumpName = pump.name;

  const { User } = await getTenant(pump.databaseName);
  const user = await User.findById(req.auth.userId).lean();
  if (!user || !user.active) return next(ApiError.unauthorized('This user account is inactive.'));

  // role is re-read from the database so role changes take effect immediately
  req.auth.role = user.role as UserRole;
  req.auth.name = user.name;
  req.auth.email = user.email;

  req.tenant = await getTenant(pump.databaseName);
  req.tenantUserId = new mongoose.Types.ObjectId(req.auth.userId);
  next();
});

/** Guard factory: authorize(...roles) */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden(`This action requires ${roles.join(' or ')} access.`));
    }
    next();
  };
}
