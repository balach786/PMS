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

  // Temporary debug endpoint - REMOVE after fixing deployment
  app.get('/debug/db-check', async (_req, res) => {
    const report: Record<string, unknown> = {
      mongoUri: process.env.MONGODB_URI ? `${process.env.MONGODB_URI.slice(0, 25)}...` : 'NOT SET',
      masterDbName: process.env.MASTER_DB_NAME || 'NOT SET',
      nodeEnv: process.env.NODE_ENV || 'NOT SET',
      clientUrl: process.env.CLIENT_URL || 'NOT SET',
      jwtSecret: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
    };
    try {
      const { connectMaster } = await import('./db/master.js');
      const { conn, Pump } = await connectMaster();
      report.dbState = conn.readyState;
      const collections = await conn.db!.listCollections().toArray();
      report.masterCollections = collections.map((c: any) => c.name);

      // Check if any pumps exist
      const pumps = await Pump.find({}).lean();
      report.pumpCount = pumps.length;
      report.pumps = pumps.map((p: any) => ({
        name: p.name,
        slug: p.slug,
        databaseName: p.databaseName,
        email: p.email,
        loginEmails: p.loginEmails,
        status: p.status,
      }));

      // Try connecting to the first pump's tenant DB
      if (pumps.length > 0) {
        try {
          const { getTenant } = await import('./db/tenant.js');
          const models = await getTenant(pumps[0].databaseName);
          const users = await models.User.find({}).select('name email role active').lean();
          report.tenantDbConnected = true;
          report.tenantUsers = users;
        } catch (tenantErr: any) {
          report.tenantDbConnected = false;
          report.tenantError = tenantErr.message;
        }
      }

      res.json({ success: true, data: report });
    } catch (err: any) {
      report.error = err.message;
      report.code = err.code || err.codeName || 'UNKNOWN';
      res.status(500).json({ success: false, data: report });
    }
  });

  app.use('/api/v1', routes);

  app.use('/api/v1', notFoundHandler);
  app.use(errorHandler);

  return app;
}
