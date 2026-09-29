/**
 * Removes throwaway databases created by the automated test suite.
 *   npm run clean:e2e
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMaster } from '../db/master.js';
import { getTenantConnection } from '../db/tenant.js';

export async function cleanE2E(quiet = false): Promise<number> {
  const { Pump, Subscription } = await connectMaster();
  const pumps = await Pump.find({ name: { $regex: /^(E2E |Verify )/ } }).lean();
  for (const pump of pumps) {
    const conn = await getTenantConnection(pump.databaseName);
    await conn.dropDatabase().catch(() => undefined);
    await Subscription.deleteMany({ pumpId: pump._id });
    await Pump.deleteOne({ _id: pump._id });
  }
  if (!quiet) console.log(`Cleaned up ${pumps.length} E2E pump database(s).`);
  return pumps.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cleanE2E()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await mongoose.disconnect().catch(() => undefined);
      process.exit(1);
    });
}
