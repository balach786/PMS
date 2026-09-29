import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ApiError, zodErrors } from '../utils/http.js';

type Source = 'body' | 'query' | 'params';

/** Validate one part of the request with a Zod schema. */
export function validate(schema: ZodType, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // req.query is read-only in Express 5, assign defensively
      Object.defineProperty(req, source, { value: parsed, writable: true, configurable: true });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(ApiError.validation('Please check the form for errors.', zodErrors(err)));
      }
      next(err);
    }
  };
}

/** Validate several parts of the request at once. */
export function validateAll(schemas: Partial<Record<Source, ZodType>>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      for (const [source, schema] of Object.entries(schemas)) {
        if (!schema) continue;
        const parsed = schema.parse(req[source as Source]);
        Object.defineProperty(req, source, { value: parsed, writable: true, configurable: true });
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(ApiError.validation('Please check the form for errors.', zodErrors(err)));
      }
      next(err);
    }
  };
}
