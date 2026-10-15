# Orbit MQTT — setup & self-test (later)

Short checklist when we stand up a broker and verify ingest ourselves.  
Partner contract details: [ORBIT_MQTT_HARDWARE_GUIDE.md](./ORBIT_MQTT_HARDWARE_GUIDE.md).

## Prerequisites

- Orbit Cloud running (`pnpm orbit:dev`, port **3002**)
- Atlas API running (for claim / orbit-status)
- One enrolled device (`orbitDeviceId` + `deviceSecret` from `POST /provision/v1/enroll`)

## 1. Broker (pick one)

| Option | Typical URL |
|--------|-------------|
| HiveMQ Cloud free | `mqtts://….s1.eu.hivemq.cloud:8883` |
| EMQX Cloud free | `mqtts://….emqxsl.com:8883` |
| Local Mosquitto | `mqtt://127.0.0.1:1883` |

Create two broker users:

1. **Device** — username = `orbitDeviceId`, password = `deviceSecret`  
   Publish only: `orbit/skyarc/{deviceId}/heartbeat`, `…/telemetry`
2. **Orbit Cloud** — service user that can **subscribe** `orbit/skyarc/+/+`

## 2. Orbit Cloud env

Add to `.env` (or orbit process env), then restart Orbit:

```bash
ORBIT_MQTT_ENABLED=true
ORBIT_MQTT_URL=mqtts://YOUR_BROKER:8883
ORBIT_MQTT_USERNAME=orbit-cloud-ingest
ORBIT_MQTT_PASSWORD=YOUR_SERVICE_PASSWORD
ORBIT_MQTT_CLIENT_ID=orbit-cloud-ingest
ORBIT_MQTT_TENANT_ID=skyarc
```

Log line to expect: `MQTT bridge subscribed`.

## 3. Smoke publish (MQTTX / mosquitto_pub)

```text
Topic:   orbit/skyarc/<orbitDeviceId>/heartbeat
QoS:     1
Payload: {"at":"2026-10-07T12:00:00.000Z"}
Auth:    username=<orbitDeviceId>  password=<deviceSecret>
```

Optional telemetry:

```text
Topic:   orbit/skyarc/<orbitDeviceId>/telemetry
Payload: {"samples":[{"kind":"power","payload":{"volts":230}}]}
```

## 4. Confirm

- Orbit logs accept the message (no “rejected” / “ingest failed”)
- Atlas: screen **Orbit** status online (`NEXT_PUBLIC_ORBIT_UI=true`)
- Or: `GET /api/v1/screens/:id/orbit-status` after a heartbeat

## 5. If it fails

| Symptom | Check |
|---------|--------|
| No `MQTT bridge subscribed` | `ORBIT_MQTT_ENABLED`, URL, service user password, TLS port |
| Publish OK, Orbit ignores | Topic spelling / tenant (`skyarc`) / device enrolled not revoked |
| Broker rejects device connect | ACL username/password = enroll credentials |
| Atlas still offline | Heartbeat timeout (90s); events webhook `ORBIT_WEBHOOK_SECRET` / `ATLAS_INTERNAL_URL` |

## Done when

One heartbeat over MQTT → device shows online in Atlas. HTTPS enroll + ingest still work without MQTT.
