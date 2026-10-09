# Orbit Cloud

Separate Fastify service for device provisioning, heartbeat/telemetry ingest, and summarized events to Atlas.

Atlas owns screens. Orbit owns device credentials and raw telemetry.

## Local

```bash
# DB — prefer a dedicated database; sharing Atlas DB is OK because Orbit
# tables live in the Postgres schema `orbit` (never `public`).
createdb skyarc_orbit   # optional dedicated DB

export ORBIT_DATABASE_URL=postgresql://skyarc:skyarc@127.0.0.1:5432/skyarc_orbit
# or shared: postgresql://skyarc:skyarc@127.0.0.1:5432/skyarc_atlas
export ORBIT_SERVICE_TOKEN=local-orbit-service-token-32c
export ORBIT_WEBHOOK_SECRET=local-orbit-webhook-secret-32
export ATLAS_INTERNAL_URL=http://127.0.0.1:3001

pnpm --filter @skyarc/orbit-cloud db:push
pnpm orbit:dev
```

## Flow

1. Atlas `POST /api/v1/screens/:id/devices` `{ provider: "orbit" }` → Orbit claim
2. Device `POST /provision/v1/enroll` with claim code → device secret
3. Device `POST /ingest/v1/heartbeat` with device headers
4. Orbit posts signed event to Atlas `/api/v1/internal/orbit/events`
5. Atlas `GET /api/v1/screens/:id/orbit-status` shows summary

Smoke: `LOCATION_ID=... pnpm orbit:e2e`


## MQTT

Optional. Set `ORBIT_MQTT_ENABLED=true` and `ORBIT_MQTT_URL` so Orbit Cloud subscribes to your broker.

Devices: username = `orbitDeviceId`, password = `deviceSecret` from enroll.

Topics: `orbit/skyarc/{deviceId}/heartbeat` · `…/telemetry`

Partner guide: `docs/architecture/ORBIT_MQTT_HARDWARE_GUIDE.md`
