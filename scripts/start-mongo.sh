#!/usr/bin/env bash
# Starts the local MongoDB replica set with a raised file-descriptor limit.
#
# Self-provisioning: /opt is NOT part of the persisted workspace, so after a
# sandbox reset the mongod binary is gone. This script re-downloads it,
# (re)creates the data directory and re-initiates the replica set as needed,
# so recovery is always a single command:
#
#     bash /home/user/scripts/start-mongo.sh
#
set -e
ulimit -n 65536 || true

MONGO_VERSION=8.0.4
MONGOD=/opt/mongo/bin/mongod
DATA=/opt/mongo/data
LOG=/opt/mongo/log

# 1. Install the server if the binary is missing -------------------------------
if [ ! -x "$MONGOD" ]; then
  echo "[mongo] mongod not found at $MONGOD - installing $MONGO_VERSION"
  TARBALL="mongodb-linux-x86_64-debian12-${MONGO_VERSION}.tgz"
  TMP=/tmp/mongo-install
  mkdir -p "$TMP"
  if [ ! -f "$TMP/$TARBALL" ]; then
    curl -fsSL -o "$TMP/$TARBALL" \
      "https://fastdl.mongodb.org/linux/$TARBALL"
  fi
  tar xzf "$TMP/$TARBALL" -C "$TMP"
  sudo mkdir -p /opt/mongo
  sudo cp -r "$TMP/mongodb-linux-x86_64-debian12-${MONGO_VERSION}/." /opt/mongo/
  sudo chmod +x /opt/mongo/bin/*
fi

# 2. Start the daemon ---------------------------------------------------------
if pgrep -f "mongod --dbpath $DATA" >/dev/null; then
  echo "[mongo] mongod already running"
else
  sudo mkdir -p "$DATA" "$LOG"
  sudo chown -R "$USER" "$DATA" "$LOG"
  "$MONGOD" \
    --dbpath "$DATA" \
    --bind_ip 127.0.0.1 \
    --port 27017 \
    --replSet rs0 \
    --wiredTigerCacheSizeGB 0.4 \
    --logpath "$LOG/mongod.log" \
    --fork
fi

# 3. Initiate the replica set once (transactions require it) ------------------
# Run the initiate snippet from inside backend/ so `require('mongodb')` resolves
# (that dependency lives in backend/node_modules, not at the workspace root).
INITIATE=$(cat <<'JS'
const { MongoClient } = require('mongodb');
(async () => {
  const c = new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true');
  await c.connect();
  try {
    await c.db('admin').command({
      replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] },
    });
    console.log('initiated');
  } catch (e) {
    console.log(e.codeName === 'AlreadyInitialized' ? 'already initiated' : 'initiate: ' + (e.codeName || e.message));
  }
  await c.close();
})().catch((e) => { console.log('initiate failed: ' + e.message); process.exit(0); });
JS
)
INITIATE_DIR=/home/user/backend
if [ -d "$INITIATE_DIR/node_modules/mongodb" ]; then
  (cd "$INITIATE_DIR" && node -e "$INITIATE")
else
  # fall back: point NODE_PATH at wherever the mongodb driver is installed
  MONGODB_DIR=$(find /home/user -maxdepth 4 -type d -path "*/node_modules/mongodb" -print -quit 2>/dev/null)
  if [ -n "$MONGODB_DIR" ]; then
    NODE_PATH="$(dirname "$MONGODB_DIR")" node -e "$INITIATE"
  else
    echo "[mongo] mongodb driver not installed yet - run 'npm install' in backend/ then re-run this script"
  fi
fi

echo "[mongo] mongod ready on 127.0.0.1:27017 (replica set rs0)"
