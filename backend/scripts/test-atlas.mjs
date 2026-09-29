/**
 * Atlas connectivity probe - tests ONE exact configuration and, on failure,
 * prints the raw MongoDB error verbatim (name / code / codeName / message and
 * any nested cause) so nothing is lost to interpretation.
 */
import { MongoClient } from 'mongodb';

// Exactly as supplied (the chat renderer had turned the password@host into a
// mailto link and escaped & as &amp;, so it is reconstructed here):
//   mongodb+srv://PMS:Khan@cluster0.3mpjmll.mongodb.net/PMS?retryWrites=true&w=majority&appName=Cluster0&authSource=admin
const HOST = 'cluster0.3mpjmll.mongodb.net';
const USER = 'PMS';
const PASSWORD = 'Khan';
const DEFAULT_DB = 'PMS';
const AUTH_SOURCE = 'admin';

const URI =
  `mongodb+srv://${USER}:${encodeURIComponent(PASSWORD)}@${HOST}/${DEFAULT_DB}` +
  `?retryWrites=true&w=majority&appName=Cluster0&authSource=${AUTH_SOURCE}`;

function mask(uri) {
  return uri.replace(/\/\/([^:/@]+):([^@]*)@/, '//$1:***@');
}

console.log('Testing one exact configuration\n');
console.log('  username        :', USER);
console.log('  password        :', PASSWORD);
console.log('  cluster         :', HOST);
console.log('  default database:', DEFAULT_DB);
console.log('  authSource      :', AUTH_SOURCE);
console.log('  uri (masked)    :', mask(URI));
console.log('');

const client = new MongoClient(URI, {
  serverSelectionTimeoutMS: 20000,
  connectTimeoutMS: 20000,
});

try {
  await client.connect();
  console.log('RESULT: AUTHENTICATED\n');

  const hello = await client.db('admin').command({ hello: 1 });
  console.log('  server            :', hello.msg ?? '?', hello.version ?? '');
  console.log('  replica set       :', hello.setName ?? 'NONE (standalone - transactions unavailable)');
  console.log('  writablePrimary   :', hello.isWritablePrimary);

  const dbs = await client.db().admin().listDatabases();
  console.log('  visible databases :', dbs.databases.map((d) => d.name).join(', ') || '(none)');

  // can we actually write?
  const probe = client.db('__bk_connect_probe__');
  await probe.collection('probe').insertOne({ at: new Date(), ok: true });
  const back = await probe.collection('probe').findOne({ ok: true });
  console.log('  write/read test   :', back ? 'OK' : 'FAILED');
  await probe.dropDatabase();

  console.log('\nThis configuration works.');
  await client.close();
  process.exit(0);
} catch (err) {
  console.log('RESULT: FAILED\n');
  console.log('----- RAW MONGODB ERROR (verbatim) -----');
  console.log('name      :', err?.name);
  console.log('code      :', err?.code);
  console.log('codeName  :', err?.codeName);
  console.log('message   :', err?.message);
  if (err?.cause) {
    console.log('cause.name :', err.cause.name);
    console.log('cause.code :', err.cause.code);
    console.log('cause.codeName :', err.cause.codeName);
    console.log('cause.message  :', err.cause.message);
  }
  const topology = err?.reason?.servers
    ? [...err.reason.servers.values()].map((s) => `${s.address} type=${s.type} error=${s.error?.message ?? 'none'}`)
    : null;
  if (topology) {
    console.log('topology  :');
    for (const t of topology) console.log('   ', t);
  }
  console.log('----- END RAW ERROR -----');
  await client.close().catch(() => {});
  process.exit(1);
}
