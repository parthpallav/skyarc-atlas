# Phase 7B — Orbit MQTT / Telemetry Contracts

**Partner wire baseline:** [Skyarc Orbit MQTT Spec v1.0](./ORBIT_MQTT_LUNAR_COMPATIBILITY.md) (Lunar Embedded draft).  
**Internal processing schema:** `7b.v1` (normalized). Firmware is **not** required to rename Lunar fields to 7b names.

## Verification modes (report separately)

| Mode | Status |
|------|--------|
| **Backend implemented** | Lunar topics/envelope, durable ingest, commands/config, mappings, evidence |
| **Simulator verified** | Unit tests + HTTPS `/ingest/v1/lunar` using Lunar envelope (no hardware) |
| **Physical-device verified** | **Blocked** — no Lunar hardware session in this workstream |
| **Pending Lunar decisions** | Spec §10 + proposed additions in compatibility matrix |
| **Pending production configuration** | Broker host/CA, per-device ACL + session kill on revoke |

## Ownership (ADR-0003)

| Concern | Owner |
|---------|--------|
| Telemetry, device identity, measurement state, aggregates, incidents, commands/config | Orbit Cloud |
| Screen/location mappings, campaigns, bookings, campaign associations | Atlas |
| Operational-risk snapshots from authorized evidence | Pulse/Atlas (versioned; not forecasts) |
| External messaging | Bridge |

No booking or quote ledger duplication. Commercial availability ≠ operational evidence.

## Lunar MQTT Spec v1.0 (wire)

| Item | Value |
|------|--------|
| Topic prefix | `skyarc/v1/orbit/{physicalDeviceId}/` |
| Device publish | `telemetry`, `heartbeat`, `status`, `events`, `command-ack` |
| Device subscribe | `commands`, `config` |
| Envelope | `messageId`, `deviceId`, `timestamp`, `type`, `version`, `payload` |
| QoS | 1 |
| TLS | Required; fail closed |
| Dedup | `messageId` per device; commands also by `commandId` |
| Offline baseline | Queue **events + acks** only — **not** telemetry/heartbeat |
| MVP commands | `capture_status`, `request_diagnostics`, `sync_config`, `restart` |
| Config | Increasing integer `configVersion` |

Physical id (e.g. `ORBIT-0001`) maps to internal UUID + tenant via registry (`physicalDeviceId`).

**Do not** interpret example `voltage` / `signalStrength` as screen power or a specific cellular metric without agreed definitions.

## Internal `7b.v1` (normalized)

Used after Lunar normalize and for HTTPS `/ingest/v1/events`. Fields: eventId (= messageId when from Lunar), internal device UUID, bootId/sessionId/sequence (optional proposed — may be `unknown`), observedAt, firmwareVersion, measurementType, value, typedValues, qualityFlags.

Server adds: `receivedAt`, `authenticatedTenantId`, `ingestResult`.

## Device capabilities

| Profile | Supported (registered) | Unsupported by default |
|---------|------------------------|------------------------|
| Orbit Edge | heartbeat, connectivity, GPS, power, diagnostic, sensor_health, screen_power | traffic_count, audience_obs, playback |
| Orbit Edge Sense | Edge + traffic_count, audience_obs | playback |
| CMS / media player | heartbeat, connectivity, playback (with creative/campaign ids) | traffic/audience/GPS |

Unsupported → **unknown**. Raw camera images not enabled by default. Camera/OTA/player control **not** MVP.

## MQTT consumer

- Subscribes `skyarc/v1/orbit/+/{device-publish-channel}` at QoS 1
- Directional ACL helpers reject device publish on commands/config and cross-device topics
- Topic + envelope `deviceId` must match registered `physicalDeviceId`
- Tenant from registry — no fixed-tenant delivery
- App-layer device secret required until broker ACL/mTLS verified as sole auth (secret scrubbed before persist)
- Revocation clears credential hash (ingest rejected); **production must also kill broker sessions / ACLs**

### Durable handoff

1. Persist `OrbitIngestInbox` unique `(deviceId, messageId/eventId)` — secrets stripped
2. Process → raw / measurements / state / incidents / aggregates / command acks
3. Crash recovery: replay `processedAt IS NULL`
4. **Broker PUBACK ≠ DB persistence.** Prefer manual ACK after inbox once live.

## Offline behavior (baseline faithful to Spec §7)

- Missing historical telemetry/heartbeat → **unknown** / coverage gap
- Replayed **events** retain observation time
- Stale observations do **not** mark device online now
- Missing connectivity does **not** prove display lost power
- Optional historical telemetry summaries: **off** until Lunar confirms

## Status / LWT

- Retained/LWT status applied only if not older than current state
- LWT timestamp is preconfigured — **not** actual disconnect time
- Separated state: connectivity ≠ sensor health ≠ screen power ≠ playback

## Commands / config

| Command | Notes |
|---------|--------|
| capture_status | Expect ACCEPTED → COMPLETED |
| request_diagnostics | ACCEPTED → COMPLETED/FAILED |
| sync_config | COMPLETED only when applied `configVersion` matches intended |
| restart | ACCEPTED before reboot; COMPLETED after boot via saved `commandId` |

PUBACK ≠ execution. Expiry support is feature-flagged (proposed). Camera/OTA/player **not** implemented as MVP.

## Atlas mappings & evidence

`DeviceScreenMapping` effective-dated. Observations join bookings via mapping at observation time, flight, schedule, capability.

`GET /campaigns/:id/orbit-evidence` — freshness, coverage, connectivity incidents, affected booking items, limitations. No auto cancel/credit/replacement. No playback/impressions/reach inference from heartbeat/temp/battery.

## Retention

| Store | Default | Env |
|-------|---------|-----|
| Raw / 5m / processed inbox | 14 days | `ORBIT_TELEMETRY_RETENTION_DAYS` |
| Hourly/daily aggregates | 365 days | `ORBIT_AGGREGATE_RETENTION_DAYS` |

Volume planning: heartbeat 60s + telemetry ~300s (spec defaults) → order ~1.4k+ evt/device/day. Helper: `estimateStorageBytes`.

## Endpoints (Orbit)

| Path | Auth | Notes |
|------|------|-------|
| `POST /provision/v1/claim` | Service | Assigns `physicalDeviceId` |
| `POST /provision/v1/enroll` | Claim code | Returns secret + physical id |
| `POST /devices/v1/:id/revoke` | Service | Clears creds; broker kill pending prod |
| `POST /ingest/v1/events` | Device | Internal 7b.v1 |
| `POST /ingest/v1/events/batch` | Device | Offline 7b replay |
| `POST /ingest/v1/lunar` | Device | **Lunar envelope** simulator/HTTPS |
| `POST /devices/v1/:id/commands` | Service | MVP commands |
| `POST /devices/v1/:id/config` | Service | Increasing configVersion |
| `GET /devices/v1/:id/state` | Service | Separated state + limitations |
| `POST /admin/v1/inbox/process` | Service | Crash recovery |
| `POST /admin/v1/retention/run` | Service | Retention |

## First working slice (simulator)

Registered sim device (`ORBIT-0001` → UUID) → Lunar envelope on HTTPS/MQTT contract → durable inbox → normalized state/incident → historical mapping → campaign evidence.

Demonstrate offline **event** replay + relocate. Telemetry/heartbeat offline queue is **not** claimed.

## Deferred

- Physical Lunar hardware verification
- Production broker ACL/mTLS + session revoke API
- Audience / Edge Sense validated contract
- CMS verified playback metrics
- Proposed additions in compatibility matrix (bootId/sequence required, offline telemetry summaries, command expiry defaults, etc.)
