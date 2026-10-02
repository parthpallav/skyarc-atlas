# Empty staging database — full migration sequence

Target DB name only: `skyarc_atlas_staging` (never production `skyarc_atlas`).

## 1. Volume init (first Postgres start)

Image `postgres-staging` runs `01-postgis.sql` → `CREATE EXTENSION IF NOT EXISTS postgis`.

**Not** applied on staging: `02-orbit-db.sql` (separate `skyarc_orbit` DB). Orbit/Pulse/Bridge share `skyarc_atlas_staging` via their `*_DATABASE_URL`.

## 2. Atlas API entrypoint (`DATABASE_BOOTSTRAP=always` on empty volume)

1. `apply-sql-migrations.sh` over **all** of:

   `0001_postgis` → `0002_location_geo` → `0003_campaign_lifecycle` → `0004_scoring_methodology` → `0005_location_scoring_json` → `0006_orbit_foundation` → `0007_availability_release_audit` → `0008_bookings` → `0009_quote_revisions` → `0010_phase2_inventory_booking` → `0011_phase4_proposals` → `0012_phase5_ops_billing` → `0013_phase6_whatsapp_link` → `0014_phase7a_recommendations` → `0015_phase7b_orbit_mappings` → `0016_google_identity_invitations` → `0017_oauth_pending_state`

   Ledger table: `_skyarc_sql_migrations`.

2. If user count = 0: `prisma db push --skip-generate` (**staging DSN only**).
3. `apply-postgis.ts`, `backfill-screen-codes.ts`.

After first successful boot, set `DATABASE_BOOTSTRAP=never` on subsequent deploys (SQL ledger still applies additive files).

## 3. Satellite services (same staging DB)

| Service | URL env | Mechanism |
|---------|---------|-----------|
| Orbit | `ORBIT_DATABASE_URL` → staging | Service docker-entrypoint `db:push` / migrate |
| Pulse | `PULSE_DATABASE_URL` → staging | Service docker-entrypoint |
| Bridge | `BRIDGE_DATABASE_URL` → staging | Service docker-entrypoint |

Document each push in the deploy log with DB name `skyarc_atlas_staging` and image digest. Abort if DSN host/db does not match staging.

## 4. Seed

```bash
STAGING_SEED_CONFIRM=1 STAGING_USER_PASSWORD=… \
  pnpm exec tsx prisma/seed-staging.ts
```

Creates two client tenants (Alpha/Beta), vendors, Skyarc internal ops, and representative roles. Refuses non-staging DB names unless `STAGING_ALLOW_NON_STAGING_DB=1`.

## 5. Provider flags (disabled)

Leave unset: Google OIDC, WhatsApp/Meta, live payments, Tally. `AI_PROVIDER=stub`.
