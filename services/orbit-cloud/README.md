# Orbit Cloud

Separate Fastify service for device provisioning, HTTPS/MQTT telemetry ingest, and summarized events to Atlas.

Atlas owns screens, effective-dated device mappings, campaigns, and bookings. Orbit owns device credentials and telemetry. Pulse may snapshot operational risk from Atlas evidence APIs.

## Local

```bash
# DB — prefer a dedicated database; sharing Atlas DB is OK because Orbit
# tables live in the Postgres schema `orbit` (never `public`).
createdb skyarc_orbit   # optional dedicated DB

export ORBIT_DATABASE_URL=postgresql://skyarc:skyarc@127.0.0.1:5432/skyarc_orbit
export ORBIT_SERVICE_TOKEN=local-orbit-service-token-32c
export ORBIT_WEBHOOK_SECRET=local-orbit-webhook-secret-32
export ATLAS_INTERNAL_URL=http://127.0.0.1:3001
# Optional live MQTT (simulator/HTTPS works without this):
# export ORBIT_MQTT_URL=mqtts://user:pass@broker:8883

pnpm --filter @skyarc/orbit-cloud db:push
pnpm orbit:dev
```

Atlas migration for mappings: `prisma/migrations/0015_phase7b_orbit_mappings/migration.sql`

## Flow (Phase 7B)

1. Atlas `POST /api/v1/screens/:id/devices` `{ provider: "orbit" }` → Orbit claim (tenant from location org)
2. Device `POST /provision/v1/enroll` with claim code → device secret
3. Device `POST /ingest/v1/events` (or MQTT `orbit/{tenant}/{device}/telemetry`) with versioned `7b.v1` payload
4. Durable inbox → raw dedupe → measurements / separated state / incidents / aggregates
5. Orbit posts signed connectivity events to Atlas `/api/v1/internal/orbit/events`
6. Atlas `GET /api/v1/campaigns/:id/orbit-evidence` staff evidence view

Simulator: `buildSimulatedTelemetry` / `buildOfflineReplayBatch` — same contracts, no hardware.

Unit tests (no DB): `pnpm --filter @skyarc/orbit-cloud test`

Smoke: `LOCATION_ID=... pnpm orbit:e2e`

## Durable handoff

Broker/HTTP acceptance after `OrbitIngestInbox` insert. Normalized persistence is a separate step; crash recovery reprocesses unprocessed inbox rows. See `docs/contracts/ORBIT_TELEMETRY_API.md`.
