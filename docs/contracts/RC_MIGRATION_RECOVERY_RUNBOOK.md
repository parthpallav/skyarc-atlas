# RC Migration & Recovery Runbook

**Branch:** `feat/phase2-4-booking-scenarios`  
**Scope:** Atlas / Pulse / Orbit schema changes required from a representative deployed baseline that already includes through `0015_phase7b_orbit_mappings` (or earlier).

## Migrations required (Atlas `prisma/migrations`)

Do **not** assume only `0016`. From a baseline at or before Phase 7B:

| Migration | Purpose | Destructive? |
|-----------|---------|--------------|
| `0001`–`0015` | Historical platform (inventory → 7B mappings) | Follow prior runbooks |
| `0016_google_identity_invitations` | `ExternalIdentity`, `OrganizationInvitation`, nullable `User.passwordHash` | **No** (additive; passwordHash nullability is reversible with care) |
| `0017_oauth_pending_state` | `OAuthPendingState` encrypted OIDC pending rows | **No** (additive; safe to drop table on rollback of app that no longer writes it) |

### Orbit (`services/orbit-cloud/prisma`)

Orbit uses its own `ORBIT_DATABASE_URL` / `orbit` schema. Fresh install: `pnpm --filter @skyarc/orbit-cloud db:push` (or migrate when migrations are introduced). No Atlas SQL migration covers Orbit.

### Pulse (`services/pulse/prisma`)

Pulse `pulse` schema: ConversationSession / ConversationAction / etc. via `db:push`. Ensure Pulse DB exists before enabling WhatsApp orchestration.

## Fresh installation

```bash
# Atlas
psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
pnpm --filter @skyarc/api exec prisma migrate deploy --schema=prisma/schema.prisma
# or apply SQL in order under prisma/migrations/

# Orbit
ORBIT_DATABASE_URL=… pnpm --filter @skyarc/orbit-cloud db:push

# Pulse
PULSE_DATABASE_URL=… pnpm --filter @skyarc/pulse db:push
```

## Upgrade from representative existing data

1. Take a logical backup (see below).
2. Apply `0016` then `0017` on Atlas.
3. Run API integration suite against a clone: `INTEGRATION_DATABASE_URL=… pnpm --filter @skyarc/api test:integration`.
4. Confirm existing bookings/quotes still accept/list (reservation + pulse-quote suites).

## Backup / restore

```bash
pg_dump -Fc "$DATABASE_URL" -f atlas-$(date +%Y%m%d).dump
pg_dump -Fc "$ORBIT_DATABASE_URL" -f orbit-$(date +%Y%m%d).dump
# restore
pg_restore --clean --if-exists -d "$DATABASE_URL" atlas-YYYYMMDD.dump
```

Verify row counts for `Booking`, `QuoteRevision`, `ExternalIdentity`, `orbit.OrbitIngestInbox`.

## Application restart & job recovery

| Component | Recovery mechanism | Verified |
|-----------|--------------------|----------|
| Atlas quote accept | Idempotency key | Integration |
| Pulse ConversationAction | `actionResultsJson` / priorActions | Integration |
| Orbit ingest | `processPendingInbox` | Integration |
| OAuth pending | Postgres store survives process restart | Integration |

## Rolling back application code after schema changes

1. **Preferred:** keep schema forward; disable Google / MQTT live env flags; redeploy previous app build.
2. **`0017`:** App builds before `0017` ignore `OAuthPendingState`. Table may remain. Dropping it deletes only in-flight OAuth attempts (<10 min TTL).
3. **`0016`:** Rolling back app that does not read `ExternalIdentity` is safe. **Do not** drop `ExternalIdentity` if any production Google links exist — irreversible user association loss.
4. Nullable `passwordHash`: restoring NOT NULL requires all Google-only users to have passwords or be deleted first (**destructive**).

## MQTT credential remediation (payload secret retirement)

Historical messages may have carried `__mqttSecret`. Procedure:

1. Deploy Orbit consumer that **rejects** payload secrets and trusts broker ACL + topic identity.
2. For each enrolled device, rotate HTTPS device secret via existing enroll/claim rotation (`credentialVersion` increment) — issue new secret out-of-band to the device; never embed in MQTT payloads.
3. Update broker password files / ACL to match `mqttUsername` per device.
4. Scrub any logs/exports that may contain old secrets (rotate log retention).
5. Confirm `OrbitIngestFailure` reasons for `secret_in_payload` drop to zero under normal traffic.

## Practical recovery procedure (incident)

1. Freeze deploys; disable Google/Meta/MQTT live flags.
2. Restore DB from last known-good dump to a side database; compare booking/quote counts.
3. If corrupt only OAuth pending: `TRUNCATE "OAuthPendingState";`
4. If Orbit inbox stuck: run `processPendingInbox` after consumer restart.
5. Re-enable gated features only after integration suite green on the restored clone.
