import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectMaster } from './db/master.js';

async function bootstrap() {
  try {
    // 1. Master (SaaS level) database
    await connectMaster();
    console.log(`[db] master database "${env.masterDbName}" connected`);

    // 2. HTTP server. Pump databases are opened lazily, on first authenticated
    //    request, by the tenant layer.
    const app = createApp();
    app.listen(env.port, '0.0.0.0', () => {
      console.log(`[api] BK Petrol Pump Manager API listening on http://0.0.0.0:${env.port}/api/v1`);
      console.log(`[api] environment: ${env.nodeEnv}`);
    });
  } catch (err) {
    console.error('[fatal] Failed to start server:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

void bootstrap();
