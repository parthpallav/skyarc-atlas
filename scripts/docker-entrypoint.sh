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

# Fresh/empty DBs must get Prisma tables before SQL files that ALTER "Location" (0001_postgis).
# Existing DBs skip push and rely on the additive SQL ledger only.
chmod +x /app/scripts/apply-sql-migrations.sh

if [ "${DATABASE_BOOTSTRAP:-auto}" != "never" ]; then
  if should_bootstrap; then
    echo "Fresh database — prisma db push before SQL migration ledger..."
    pnpm exec prisma db push --skip-generate
  else
    echo "Existing database — skipping prisma db push (SQL migration ledger + additive SQL migrations)."
  fi
fi

# Always apply any missing additive SQL migrations (ledger-tracked, idempotent files).
/app/scripts/apply-sql-migrations.sh prisma/migrations prisma/schema.prisma

if should_bootstrap; then
  echo "Empty database detected — applying PostGIS triggers and indexes..."
  pnpm exec tsx prisma/apply-postgis.ts
else
  echo "Existing database detected — schema synced, data preserved."
fi

# Fill Screen.skyarcScreenCode when null (idempotent).
echo "Backfilling screen codes if needed..."
pnpm exec tsx prisma/backfill-screen-codes.ts

echo "Starting API..."
cd /app/services/api
exec node dist/server.js
