# Orbit MQTT — Lunar Spec v1.0 Compatibility Matrix

**Partner document:** Skyarc Orbit MQTT Integration Spec v1.0 (Draft for Lunar Embedded)  
**Status:** Proposed contract. Placeholders are not production. Open discussions: Spec §10.  
**Backend policy:** Preserve Lunar field names and topics on the wire. Normalize internally. Do **not** treat proposed backend additions as firmware requirements until Skyarc confirms in writing with Lunar.

## Verification modes (report separately)

| Mode | Meaning |
|------|---------|
| **Backend implemented** | Code + unit tests for contract handling |
| **Simulator verified** | Lunar envelope/topics exercised without hardware |
| **Physical-device verified** | Blocked — no Lunar hardware / production broker ACL session in this workstream |
| **Pending Lunar decisions** | Spec §10 + proposed additions below |
| **Pending production configuration** | Broker host, CA, per-device ACL revoke, credentials |

---

## Compatibility matrix

| Document requirement | Backend implementation | Firmware dependency | Confirmation status | Validation |
|---------------------|------------------------|---------------------|---------------------|------------|
| Topic prefix `skyarc/v1/orbit/{deviceId}/` | Primary MQTT parse/build in `@skyarc/shared` + consumer | Mandatory | **Aligned (proposed contract)** | Unit: topic parse |
| Channels: telemetry, heartbeat, status, events, command-ack, commands, config | Consumer subscribes device-publish; command/config publish APIs | Mandatory | **Aligned** | Unit + simulator |
| Envelope: messageId, deviceId, timestamp, type, version, payload | Zod + normalize → internal storage | Mandatory | **Aligned** | Unit |
| QoS 1 | Subscribe/publish qos:1 | Recommended | **Aligned (client)** | Code path; live broker TBD |
| TLS 1.2+ / fail closed | `mqtts://`, `rejectUnauthorized` in production | Mandatory | **Aligned (client)** | Live pending prod certs |
| Per-device credentials | Registry hash + MQTT secret check; username form documented | Mandatory | **Aligned (app-layer)** | Unit; broker ACL pending |
| ACL: own topics only; no publish to commands/config | Directional ACL helpers; reject cross-device / wrong direction | Mandatory | **Aligned (app); broker ACL pending** | Unit spoof tests |
| Deduplicate messageId (per device) | Inbox `@@unique([deviceId, messageId])` | Both sides | **Aligned** | Unit |
| Command dedupe by commandId | `OrbitCommand` + ack history; re-ack without re-exec | Both sides | **Aligned** | Unit |
| Durable handoff; PUBACK ≠ DB persistence | Inbox before process; docs warn mqtt.js default ACK | Backend | **Aligned (HTTPS proven; MQTT manual-ACK residual)** | Unit + docs |
| Credential revocation | Clears hash; rejects ingest; documents broker session kill | Atlas/Orbit + broker | **Partial** — app reject yes; active broker disconnect needs prod ACL API | Unit revoke |
| Offline: queue events+acks; **not** telemetry/heartbeat | Simulator baseline matches; missing telemetry → unknown / coverage gap | Firmware | **Aligned (baseline)** | Unit |
| Replayed events keep observation time; stale ≠ online now | `connectivityFromHeartbeat` + status observedAt gating | Backend | **Aligned** | Unit |
| LWT / retained status | Status apply only if observation not older than current; LWT time ≠ disconnect clock | Firmware | **Aligned (backend rules)** | Unit |
| MVP commands: capture_status, request_diagnostics, sync_config, restart | Command issue + ack correlation | Firmware | **Aligned (backend)** | Simulator |
| PUBACK ≠ command execution | Separate ack status machine | Both | **Aligned** | Unit |
| restart COMPLETED after boot via saved commandId | Correlate post-boot COMPLETED ack | Firmware | **Aligned (backend)** | Unit |
| sync_config complete only after configVersion applied | Track intended vs applied version | Firmware | **Aligned (backend)** | Unit |
| Integer increasing configVersion | Persist + reject stale ≤ current | Both | **Aligned** | Unit |
| Physical id ORBIT-0001 → internal UUID + tenant | `physicalDeviceId` registry | Backend | **Aligned** | Unit |
| Max message 64 KB (TBD in §10) | `ORBIT_LUNAR_MAX_MESSAGE_BYTES` | TBD | **Default until decided** | Unit |
| Camera / OTA / player control | Explicitly **not** MVP | Future | **Deferred** | N/A |
| Internal 7b.v1 HTTPS schema | Continues as **internal/normalized** path | Not required of Lunar firmware | **Backend addition** | Existing 7b tests |

---

## Proposed additions (pending Lunar confirmation)

Backend may **accept and store** when present; firmware is **not** required to emit them:

| Proposal | Why | Default until decided |
|----------|-----|------------------------|
| `bootId`, `sequence`, clock-quality | Restart/session ordering, drift | Optional on envelope/payload; absent → unknown |
| Exact measurement units / sensor meaning | Avoid inventing screen-power from voltage | Store raw; do not interpret as display power |
| Bounded offline **telemetry summaries** | Spec queues events+acks only | **Off** until confirmed |
| Command expiry / execution deadlines | Reject expired when enabled | Feature flag; default disabled |
| Session expiry, queue limits, ack timeouts | Spec TBD | Documented TBD; no pretend agreement |
| Config sync completion beyond CONFIG_UPDATED | Stronger apply proof | Require applied configVersion match |

---

## Ownership (ADR-0003)

| Concern | Owner |
|---------|--------|
| Telemetry, device identity, MQTT, commands/config history, state, incidents, aggregates | Orbit Cloud |
| Device↔screen mappings, bookings, campaign associations | Atlas |
| Evidence-backed operational-risk snapshots | Pulse/Atlas |
| External messaging | Bridge |

Commercial availability stays separate from operational evidence. Do **not** infer playback, impressions, reach, or delivery from heartbeat/temperature/battery.

---

## Storage estimates (planning)

Heartbeat 60s + telemetry ~300s (spec defaults) → ~1.4k+ evt/device/day order-of-magnitude.  
`estimateStorageBytes` remains the planning helper. Raw short retention vs aggregate long retention configurable.

---

## Do not

- Redefine partner-facing field names without written confirmation
- Contact Lunar or change the partner PDF automatically
- Merge/deploy from this workstream automatically
- Treat voltage / signalStrength as screen power or a specific RAT metric without agreed definitions
