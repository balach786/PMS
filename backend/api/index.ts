import { createApp } from '../src/app.js';
import { connectMaster } from '../src/db/master.js';

let isConnected = false;
const app = createApp();

export default async function handler(req: any, res: any) {
  if (!isConnected) {
    try {
      await connectMaster();
      isConnected = true;
      console.log('[vercel] connected to master db');
    } catch (err) {
      console.error('[vercel] db connection error:', err);
      return res.status(500).json({ success: false, message: 'Database connection failed' });
    }
  }
  
  // Forward the request to the express app
  return app(req, res);
}
