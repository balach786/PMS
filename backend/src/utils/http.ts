/**
 * Consistent JSON API envelope + typed application errors.
 */

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
  code?: string;
}

export function ok<T>(data: T, message?: string, meta?: ApiMeta): ApiSuccess<T> {
  return { success: true, data, ...(message ? { message } : {}), ...(meta ? { meta } : {}) };
}

export const HTTP = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY: 429,
  INTERNAL: 500,
} as const;

export class ApiError extends Error {
  public status: number;
  public code: string;
  public errors?: Array<{ field?: string; message: string }>;

  constructor(
    status: number,
    message: string,
    code?: string,
    errors?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'ERROR';
    this.errors = errors;
  }

  static badRequest(message = 'Bad request', errors?: Array<{ field?: string; message: string }>) {
    return new ApiError(HTTP.BAD_REQUEST, message, 'BAD_REQUEST', errors);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(HTTP.UNAUTHORIZED, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(HTTP.FORBIDDEN, message, 'FORBIDDEN');
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(HTTP.NOT_FOUND, message, 'NOT_FOUND');
  }
  static conflict(message = 'Resource already exists') {
    return new ApiError(HTTP.CONFLICT, message, 'CONFLICT');
  }
  static validation(message = 'Validation failed', errors?: Array<{ field?: string; message: string }>) {
    return new ApiError(HTTP.UNPROCESSABLE, message, 'VALIDATION_ERROR', errors);
  }
  static internal(message = 'Something went wrong') {
    return new ApiError(HTTP.INTERNAL, message, 'INTERNAL_ERROR');
  }
}

/** Field-level errors coming from a Zod parse. */
export function zodErrors(error: {
  issues: Array<{ path: Array<string | number>; message: string }>;
}): Array<{ field: string; message: string }> {
  return error.issues.map((i) => ({
    field: i.path.join('.') || 'body',
    message: i.message,
  }));
}
