# Orbit Foundation Runbook (feat/orbit-foundation)

HTTP REST only. Atlas and Orbit Cloud are separate processes.

## What shipped

- Phase 0: ACL fixes (assets/survey/client campaigns), safer proxy default, JWT default TTL, no unsigned reset tokens
- Phase 1: `Screen.skyarcScreenCode` + backfill
- Phase 2: Atlas `Device` + `ScreenExternalId`
- Phases 3–7: `services/orbit-cloud` provision → enroll → heartbeat → signed events → Atlas orbit-status

## Local

```bash
# terminal 1 — Atlas
pnpm --filter @skyarc/api dev

# terminal 2 — Orbit
pnpm orbit:dev

# one-time
psql "$DATABASE_URL" -f prisma/migrations/0006_orbit_foundation/migration.sql
pnpm db:backfill-screen-codes
createdb skyarc_orbit   # if needed
pnpm orbit:db:push

# e2e
pnpm exec tsx scripts/create-orbit-smoke-user.ts
LOCATION_ID=<uuid> ATLAS_EMAIL=orbit-smoke@skyarc.in ATLAS_PASSWORD='ChangeMe123!' pnpm orbit:e2e
```

Atlas remains usable with Orbit down. Screens without devices show “No Orbit device”.

## UI flag

The location **Orbit** tab is hidden by default.

```bash
# apps/web .env.local or deployment env
NEXT_PUBLIC_ORBIT_UI=true
```

Restart the web app after changing the flag.
