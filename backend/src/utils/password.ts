import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.bcryptRounds);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Basic password strength gate used by both register and user-invite flows. */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Password must be at least 8 characters long');
  if (!/[A-Za-z]/.test(password)) issues.push('Password must contain at least one letter');
  if (!/[0-9]/.test(password)) issues.push('Password must contain at least one number');
  return issues;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
