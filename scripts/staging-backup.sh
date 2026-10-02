#!/usr/bin/env bash
# Logical backup before staging migration. Run on VPS with docker compose postgres service up.
set -euo pipefail
ENV_FILE="${1:-.env.staging}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"
TS=$(date +%Y%m%d-%H%M%S)
OUT="staging-backup-${POSTGRES_DB:-skyarc_atlas_staging}-${TS}.dump"
echo "Writing $OUT ..."
docker compose --env-file "$ENV_FILE" -f docker-compose.staging.yaml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -Fc "${POSTGRES_DB}" > "$OUT"
echo "Done. Restore with: pg_restore --clean --if-exists -d NEW_DB $OUT"
