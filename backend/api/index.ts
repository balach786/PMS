import { createApp } from '../src/app.js';
import { connectMaster } from '../src/db/master.js';

const app = createApp();

export default async function handler(req: any, res: any) {
  try {
    // connectMaster() internally caches the promise, so this is very fast on warm invocations
    await connectMaster();
  } catch (err) {
    console.error('[vercel] db connection error:', err);
    return res.status(500).json({ success: false, message: 'Database connection failed' });
  }
  
  // Forward the request to the express app
  return app(req, res);
}
