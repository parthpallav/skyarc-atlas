#!/bin/sh
set -e
cd /app/services/pulse
pnpm exec prisma db push --skip-generate --schema=prisma/schema.prisma
exec node dist/server.js
