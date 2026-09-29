/**
 * One-off helper: initiate a single-node replica set.
 * Transactions (used for stock + ledger consistency) require a replica set.
 * On MongoDB Atlas this is already the case.
 *
 * Usage: node scripts/init-replset.mjs
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';

const client = new MongoClient(uri, { directConnection: true });
try {
  await client.connect();
  const admin = client.db().admin();
  try {
    const status = await admin.command({ replSetGetStatus: 1 });
    console.log('Replica set already initialised:', status.set);
  } catch (err) {
    if (err?.codeName === 'NotYetInitialized' || err?.code === 94 || err?.code === 93) {
      const cfg = { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017', priority: 1 }] };
      // replSetInitiate must be run against the admin database
      await client.db('admin').command({ replSetInitiate: cfg });
      console.log('Replica set initiated.');
    } else {
      throw err;
    }
  }
  // wait for primary
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const hello = await client.db('admin').command({ hello: 1 });
      if (hello.isWritablePrimary) {
        console.log('Primary ready.');
        break;
      }
    } catch {
      /* keep waiting */
    }
  }
} catch (err) {
  console.error('Could not initialise replica set:', err.message);
  console.error('Transactions will be skipped by the app fallback; the app still works.');
  process.exitCode = 0;
} finally {
  await client.close();
}
