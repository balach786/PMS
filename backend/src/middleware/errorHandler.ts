import type { NextFunction, Request, Response } from 'express';
import { ApiError, type ApiFailure } from '../utils/http.js';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

function normalise(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.validation(
      'Please check the form for errors.',
      err.issues.map((i) => ({ field: i.path.join('.') || 'body', message: i.message })),
    );
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.validation(
      'Please check the form for errors.',
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    );
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${err.path}".`);
  }

  const mongoErr = err as { code?: number; keyValue?: Record<string, unknown>; message?: string };
  if (mongoErr?.code === 11000) {
    const keys = Object.keys(mongoErr.keyValue || {});
    return ApiError.conflict(`A record with this ${keys.join(', ') || 'value'} already exists.`);
  }

  return ApiError.internal('Something went wrong while processing your request.');
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiFailure = { success: false, message: `Route ${req.method} ${req.path} not found`, code: 'NOT_FOUND' };
  res.status(404).json(body);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const apiErr = normalise(err);

  if (apiErr.status >= 500) {
    // Log server-side detail, never send it to the client.
    console.error(`[${req.requestId || '-'}] ${req.method} ${req.path} ->`, err);
  }

  const body: ApiFailure = {
    success: false,
    message: apiErr.message,
    code: apiErr.code,
    ...(apiErr.errors ? { errors: apiErr.errors } : {}),
  };
  res.status(apiErr.status).json(body);
}
