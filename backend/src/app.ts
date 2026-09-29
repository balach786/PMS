import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { corsOrigins, env } from './config/env.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // allow non-browser clients (curl / server-to-server) and configured origins
        if (!origin) return callback(null, true);
        if (corsOrigins.includes('*') || corsOrigins.includes(origin)) return callback(null, true);
        // allow the e2b preview host pattern in development
        if (env.nodeEnv !== 'production' && /\.e2b\.app$/.test(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.isProd ? 'combined' : 'dev'));
  }

  // Generic API rate limit (auth routes have their own stricter limits)
  app.use(
    '/api/',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.rateLimit.disabled ? Number.MAX_SAFE_INTEGER : env.rateLimit.apiMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime(), time: new Date().toISOString() } });
  });

  app.use('/api/v1', routes);

  app.use('/api/v1', notFoundHandler);
  app.use(errorHandler);

  return app;
}
