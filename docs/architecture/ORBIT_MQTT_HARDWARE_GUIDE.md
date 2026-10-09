# Orbit MQTT — Hardware & Partner Guide

**Audience:** Orbit Edge / partner firmware teams  
**Status:** Implemented in `services/orbit-cloud` (MQTT bridge + HTTPS parity)  
**Related:** [ORBIT_FOUNDATION_RUNBOOK.md](./ORBIT_FOUNDATION_RUNBOOK.md), [ATLAS_ORBIT_READINESS.md](./ATLAS_ORBIT_READINESS.md)

Atlas never speaks MQTT. Devices talk to **Orbit Cloud** (or a broker that Orbit Cloud subscribes to). Atlas only receives summarized signed events.

---

## Architecture

```text
Orbit Edge / partner device
    │  1) HTTPS enroll (claim code → deviceSecret)  [required once]
    │  2a) HTTPS POST /ingest/v1/heartbeat|telemetry
    │  2b) MQTT publish  orbit/{tenant}/{deviceId}/heartbeat|telemetry
    ▼
MQTT broker (your HiveMQ / EMQX / Mosquitto / free cloud)
    │  Orbit Cloud service account subscribes orbit/{tenant}/+/+
    ▼
Orbit Cloud  →  stores telemetry  →  signed events  →  Atlas
```

HTTPS and MQTT are **equivalent ingest paths**. Prefer MQTT for field devices; keep HTTPS for labs and fallback.

---

## 1. Provision (HTTPS — unchanged)

1. Skyarc ops attaches Orbit to a screen in Atlas (claim code).
2. Device calls Orbit:

```http
POST /provision/v1/enroll
Content-Type: application/json

{ "claimCode": "<from Atlas / ops>" }
```

Response includes:

```json
{
  "orbitDeviceId": "uuid",
  "deviceSecret": "shown-once",
  "skyarcScreenCode": "SKY-…",
  "atlasScreenId": "uuid",
  "mqtt": {
    "topics": {
      "heartbeat": "orbit/skyarc/<deviceId>/heartbeat",
      "telemetry": "orbit/skyarc/<deviceId>/telemetry",
      "cmd": "orbit/skyarc/<deviceId>/cmd"
    },
    "auth": {
      "username": "<orbitDeviceId>",
      "password": "<deviceSecret>"
    }
  }
}
```

Store `orbitDeviceId` + `deviceSecret` in secure device storage. Secret is not retrievable again.

---

## 2. Broker you stand up (testing)

Any MQTT 3.1.1+ broker works. Examples:

| Option | Notes |
|--------|--------|
| [HiveMQ Cloud](https://www.hivemq.com/mqtt-cloud-broker/) | Free tier, TLS (`mqtts://…:8883`) |
| [EMQX Cloud](https://www.emqx.com/en/cloud) | Free tier |
| Mosquitto (Docker / VPS) | `mqtt://host:1883` or TLS |

### Device ACL (required)

| Client | Username | Password | Publish | Subscribe |
|--------|----------|----------|---------|-----------|
| Device | `orbitDeviceId` | `deviceSecret` | `orbit/skyarc/{deviceId}/heartbeat`, `…/telemetry` | `orbit/skyarc/{deviceId}/cmd` (optional) |
| Orbit Cloud | service user | service password | — | `orbit/skyarc/+/+` |

Deny all other topics. Devices must **not** publish under another device’s prefix.

### Orbit Cloud env (staging)

```bash
ORBIT_MQTT_ENABLED=true
ORBIT_MQTT_URL=mqtts://xxxx.s1.eu.hivemq.cloud:8883
ORBIT_MQTT_USERNAME=orbit-cloud-ingest
ORBIT_MQTT_PASSWORD=<broker service password>
ORBIT_MQTT_CLIENT_ID=orbit-cloud-ingest
ORBIT_MQTT_TENANT_ID=skyarc
```

Restart Orbit Cloud after setting these. `/health` stays up even if the broker is down; check Orbit logs for `MQTT bridge subscribed`.

---

## 3. Device publish contract

### Heartbeat

- **Topic:** `orbit/skyarc/{orbitDeviceId}/heartbeat`
- **QoS:** 1 recommended  
- **Payload (JSON):**

```json
{ "at": "2026-10-07T12:00:00.000Z" }
```

Empty `{}` is accepted; Orbit stamps server time.

### Telemetry

- **Topic:** `orbit/skyarc/{orbitDeviceId}/telemetry`
- **Payload:**

```json
{
  "samples": [
    {
      "kind": "power",
      "observedAt": "2026-10-07T12:00:01.000Z",
      "payload": { "volts": 230.1 }
    }
  ]
}
```

Same shape as HTTPS `POST /ingest/v1/telemetry`. Max 100 samples per message.

### Commands (reserved)

- **Topic:** `orbit/skyarc/{orbitDeviceId}/cmd`
- Orbit may publish commands later. Device may subscribe; **do not publish** on `cmd`.

---

## 4. HTTPS fallback (same semantics)

```http
POST /ingest/v1/heartbeat
X-Orbit-Device-Id: <orbitDeviceId>
X-Orbit-Device-Secret: <deviceSecret>
```

```http
POST /ingest/v1/telemetry
X-Orbit-Device-Id: <orbitDeviceId>
X-Orbit-Device-Secret: <deviceSecret>
Content-Type: application/json

{ "samples": [ { "kind": "power", "payload": { "volts": 230 } } ] }
```

---

## 5. Ops helper API

With Orbit service token:

```http
GET /mqtt/v1/devices/{orbitDeviceId}/connection
Authorization: Bearer <ORBIT_SERVICE_TOKEN>
```

Returns topic map + ACL cheat-sheet for that device (no secret).

---

## 6. What partners implement (checklist)

- [ ] Persist claim → enroll over HTTPS once  
- [ ] Connect MQTT with `username=orbitDeviceId`, `password=deviceSecret`  
- [ ] Publish heartbeat every ≤ 60s (Orbit offline timeout default 90s)  
- [ ] Publish telemetry batches as needed  
- [ ] TLS to broker in production  
- [ ] Do not embed Atlas user JWTs or Atlas DB URLs  
- [ ] Do not subscribe to other devices’ topics  

---

## 7. Smoke test (manual)

1. Enroll a device (or use `pnpm orbit:e2e` for HTTPS path).  
2. Point a MQTT client (MQTTX / mosquitto_pub) at your broker with device credentials.  
3. Publish to `…/heartbeat`.  
4. Confirm Atlas screen Orbit status shows online (UI flag `NEXT_PUBLIC_ORBIT_UI=true`).  

Shared helpers live in `@skyarc/shared` (`orbitMqttTopic`, `parseOrbitMqttTopic`, `orbitMqttAclHints`).
