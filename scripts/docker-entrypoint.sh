#!/bin/sh
set -e

cd /app

should_bootstrap() {
  if [ "${DATABASE_BOOTSTRAP:-auto}" = "never" ]; then
    return 1
  fi
  if [ "${DATABASE_BOOTSTRAP:-auto}" = "always" ]; then
    return 0
  fi
  COUNT=$(node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.user.count()
      .then((c) => { console.log(c); return p.\$disconnect(); })
      .catch(() => { console.log(0); return p.\$disconnect(); });
  " 2>/dev/null || echo "0")
  [ "$COUNT" = "0" ]
}

if should_bootstrap; then
  echo "Empty database detected — applying Prisma schema..."
  pnpm exec prisma db push --skip-generate
  echo "Applying PostGIS triggers and indexes..."
  pnpm exec tsx prisma/apply-postgis.ts
else
  echo "Existing database detected — skipping schema bootstrap (data preserved)."
fi

echo "Starting API..."
cd /app/services/api
exec node dist/server.js
