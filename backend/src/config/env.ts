import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Load .env from the backend root (works for both tsx and compiled dist runs)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(process.env.PORT || 5000),
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017'),
  masterDbName: process.env.MASTER_DB_NAME || 'petrol_saas_master',
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me-32chars'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  rateLimit: {
    // Set RATE_LIMIT_DISABLED=true for automated test runs
    disabled: String(process.env.RATE_LIMIT_DISABLED || 'false').toLowerCase() === 'true',
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX || 30),
    registerMax: Number(process.env.RATE_LIMIT_REGISTER_MAX || 25),
    apiMax: Number(process.env.RATE_LIMIT_API_MAX || 5000),
  },
};
const rateLimitMax = 0x7fffffff;

export const corsOrigins = env.clientUrl
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
