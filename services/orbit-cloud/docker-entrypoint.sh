#!/bin/sh
set -e
cd /app/services/orbit-cloud
# Push only the `orbit` Postgres schema (see prisma/schema.prisma).
# Never use --accept-data-loss here — that would risk Atlas tables if misconfigured.
pnpm exec prisma db push --skip-generate --schema=prisma/schema.prisma
exec node dist/server.js
