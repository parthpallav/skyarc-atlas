#!/bin/sh
# Apply every prisma/migrations/*/migration.sql that is not yet recorded.
# Safe for production: tracks applied IDs; SQL files should be idempotent (IF NOT EXISTS).
# Usage: apply-sql-migrations.sh [migrations_dir] [schema_path]
set -e

MIGRATIONS_DIR="${1:-prisma/migrations}"
SCHEMA_PATH="${2:-prisma/schema.prisma}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No migrations directory at $MIGRATIONS_DIR — skipping."
  exit 0
fi

LEDGER_SQL="$(mktemp)"
trap 'rm -f "$LEDGER_SQL"' EXIT

cat > "$LEDGER_SQL" <<'SQL'
CREATE TABLE IF NOT EXISTS "_skyarc_sql_migrations" (
  "id" TEXT PRIMARY KEY,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

echo "Ensuring SQL migration ledger..."
pnpm exec prisma db execute --file "$LEDGER_SQL" --schema "$SCHEMA_PATH"

applied_count=0
skipped_count=0

for dir in $(ls -1 "$MIGRATIONS_DIR" | sort); do
  sql_file="$MIGRATIONS_DIR/$dir/migration.sql"
  if [ ! -f "$sql_file" ]; then
    continue
  fi

  already=$(
    MIG_ID="$dir" node -e '
      const { PrismaClient } = require("@prisma/client");
      const id = process.env.MIG_ID;
      const p = new PrismaClient();
      p.$queryRawUnsafe(
        "SELECT 1 AS ok FROM \"_skyarc_sql_migrations\" WHERE id = $1 LIMIT 1",
        id
      )
        .then((rows) => {
          process.stdout.write(rows.length ? "1" : "0");
          return p.$disconnect();
        })
        .catch(async () => {
          process.stdout.write("0");
          try { await p.$disconnect(); } catch (_) {}
        });
    ' 2>/dev/null || echo "0"
  )

  if [ "$already" = "1" ]; then
    echo "SQL migration $dir already applied — skip"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  echo "Applying SQL migration $dir..."
  pnpm exec prisma db execute --file "$sql_file" --schema "$SCHEMA_PATH"

  MIG_ID="$dir" node -e '
    const { PrismaClient } = require("@prisma/client");
    const id = process.env.MIG_ID;
    const p = new PrismaClient();
    p.$executeRawUnsafe(
      "INSERT INTO \"_skyarc_sql_migrations\" (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
      id
    )
      .then(() => p.$disconnect())
      .catch(async (err) => {
        console.error(err);
        try { await p.$disconnect(); } catch (_) {}
        process.exit(1);
      });
  '

  echo "Recorded SQL migration $dir"
  applied_count=$((applied_count + 1))
done

echo "SQL migrations done (applied=$applied_count, skipped=$skipped_count)."
