import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthPrincipal } from '../types/express.js';
import { ApiError } from './http.js';

export interface AccessTokenPayload extends AuthPrincipal {
  typ: 'access';
}

export function signAccessToken(principal: AuthPrincipal): string {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign({ ...principal, typ: 'access' }, env.jwtSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload;
  } catch {
    throw ApiError.unauthorized('Session expired or invalid. Please sign in again.');
  }
}
