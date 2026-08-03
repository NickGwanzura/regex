#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] running database migrations + seed…"
  node scripts/migrate-and-seed.mjs
fi

exec node server.js
