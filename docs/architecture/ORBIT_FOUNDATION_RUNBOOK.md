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
createdb skyarc_orbit   # optional; shared Atlas DB also works (tables in schema `orbit`)
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


## MQTT ingest (optional)

HTTPS enroll stays required. Devices may then publish heartbeats/telemetry over MQTT.

See **[ORBIT_MQTT_HARDWARE_GUIDE.md](./ORBIT_MQTT_HARDWARE_GUIDE.md)** (partner contract) and **[ORBIT_MQTT_SETUP_LATER.md](./ORBIT_MQTT_SETUP_LATER.md)** (our broker setup + self-test).

```bash
ORBIT_MQTT_ENABLED=true
ORBIT_MQTT_URL=mqtts://your-broker:8883
ORBIT_MQTT_USERNAME=orbit-cloud-ingest
ORBIT_MQTT_PASSWORD=***
```

Orbit Cloud logs `MQTT bridge subscribed` when connected. Without these env vars, only HTTPS ingest runs.
