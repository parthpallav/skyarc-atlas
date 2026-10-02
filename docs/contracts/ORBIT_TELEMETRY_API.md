# Phase 7B — Orbit MQTT / Telemetry Contracts

**Verification modes**
- **Simulator-verified:** contract unit tests + HTTPS `/ingest/v1/events` using the same payload schema as MQTT (no physical hardware required).
- **Live broker / physical device:** blocked until `ORBIT_MQTT_URL` credentials and hardware are available — does **not** block simulator development.

## Ownership

| Concern | Owner |
|---------|--------|
| Telemetry, device identity, measurement state, aggregates, incidents | Orbit Cloud |
| Screen/location mappings, campaigns, bookings, campaign associations | Atlas |
| Operational-risk snapshots from authorized evidence | Pulse/Atlas (versioned; not forecasts) |
| External messaging | Bridge |

No booking or quote ledger duplication.

## Device capabilities

| Profile | Supported (registered) | Unsupported by default |
|---------|------------------------|------------------------|
| Orbit Edge | heartbeat, connectivity, GPS, power, diagnostic, sensor_health, screen_power | traffic_count, audience_obs, playback |
| Orbit Edge Sense | Edge + traffic_count, audience_obs | playback |
| CMS / media player | heartbeat, connectivity, playback (with creative/campaign ids) | traffic/audience/GPS |

Unsupported or unavailable measurements remain **unknown**. Raw camera images are **not** enabled by default (`includesImage` must be false/absent).

## Versioned payload (`7b.v1`)

Required fields: `eventId`, `deviceId`, `bootId`, `sessionId`, `sequence`, `observedAt`, `firmwareVersion`, `measurementType`, `value`.

Optional: `unit`, `typedValues`, `sensorModelVersion`, `confidence`, `qualityFlags`, `creativeId`, `campaignId`.

Server adds: `receivedAt`, `authenticatedTenantId`, `ingestResult` (`accepted` | `duplicate` | `rejected` | `deferred`).

## MQTT

- Topics: `orbit/{tenantId}/{deviceId}/telemetry|heartbeat`
- Encrypted URL (`mqtts://` preferred in production)
- Topic tenant + deviceId must match registry; payload `deviceId` must match topic
- Revoked devices rejected
- Bounded payload size (`MAX_ORBIT_TELEMETRY_BYTES` = 16KiB)
- Schema validation; failures → `OrbitIngestFailure`

### Durable handoff

1. Persist `OrbitIngestInbox` (unique `eventId`) — **secrets stripped** (`__mqttSecret` never stored)
2. Process inbox → `OrbitRawEvent` (dedupe) → measurements / state / incidents / aggregates
3. Consumer crash: replay `processedAt IS NULL` inbox rows
4. **Broker ACK ≠ normalized DB persistence.** HTTPS path is authoritative for simulator/production until MQTT manual-ACK + broker per-device ACL/mTLS are verified. MQTT app-layer **requires** device secret in `typedValues.__mqttSecret` (stripped before persist).

Capability-unsupported measurements are stored as observations with `capabilityStatus` but **do not** update `screenPower` / `playbackVerified` / `sensorHealth`.

## State correctness

Separated fields: connectivity (`online`), `sensorHealth`, `screenPower`, `playbackVerified`.

Heartbeat/connectivity **must not** imply display operating or campaign playing.

Stale / future-skew observations do **not** mark the device online now (`connectivityFromHeartbeat`).

Tenant identity comes from the device registry (claim `tenantId`), not a fixed constant on ingest.

## Atlas mappings & associations

`DeviceScreenMapping` is effective-dated with relocation history and conflict notes.

Observations join booking items using: mapping at observation time, campaign flight, operating schedule, measurement capability.

Screen traffic = **contextual** for concurrent campaigns — not measured impressions.

Trusted playback requires CMS/player creative/campaign identifiers.

## Campaign evidence

`GET /campaigns/:id/orbit-evidence` (staff) — freshness, coverage, incidents, affected booking items, limitations.

`POST .../orbit-evidence/snapshots` — versioned operational-risk snapshot. Does **not** auto-cancel, credit, or promise replacements. Audience/impressions/reach/verified delivery deferred.

## Retention (configurable)

| Store | Default | Env |
|-------|---------|-----|
| Raw events / 5m aggregates / processed inbox | 14 days | `ORBIT_TELEMETRY_RETENTION_DAYS` |
| Hourly/daily aggregates | 365 days | `ORBIT_AGGREGATE_RETENTION_DAYS` |

Estimate helper: `estimateStorageBytes` (e.g. 100 devices × 1440 evt/day × 14d × 400B ≈ raw order-of-GB planning input). Partitioning when volume justifies.

## Endpoints (Orbit)

| Path | Auth |
|------|------|
| `POST /provision/v1/claim` | Service |
| `POST /provision/v1/enroll` | Claim code |
| `POST /devices/v1/:id/revoke` | Service |
| `POST /ingest/v1/events` | Device |
| `POST /ingest/v1/events/batch` | Device (offline replay) |
| `GET /devices/v1/:id/state` | Service |
| `POST /admin/v1/inbox/process` | Service |
| `POST /admin/v1/retention/run` | Service |

## Atlas

| Path | Notes |
|------|--------|
| `POST /devices/:id/relocate` | Effective-dated remap |
| `GET /campaigns/:id/orbit-evidence` | Staff evidence |
| `POST /campaigns/:id/orbit-evidence/snapshots` | Risk snapshot |

## First working slice (simulator)

Registered sim device → authenticated HTTPS event (same contract as MQTT) → inbox → raw → normalized state → incident/aggregate → historical mapping → booking association → campaign evidence UI.

Include offline replay batch + device relocate.

## Security

- Credentials never logged (hash compare only)
- Spoofed topic/tenant/device rejected
- Cross-tenant topic mismatch rejected
- Revocation clears credential hash

## Deferred live verification

- Physical Orbit Edge / Sense hardware
- Production MQTT broker ACLs + mTLS
- CMS/player verified delivery metrics
- Audience forecasting / unique reach
