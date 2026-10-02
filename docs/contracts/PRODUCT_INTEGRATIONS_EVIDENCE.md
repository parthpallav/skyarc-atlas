/**
 * Integration evidence — product integrations (Pulse quote loop + Google OIDC + Orbit MQTT).
 * Do not treat unit-test counts as release proof.
 *
 * Hardened RC commit: filled after commit on `feat/phase2-4-booking-scenarios`.
 * Prior baseline: `52a817d`.
 *
 * Status legend:
 * - Implemented
 * - Integration verified (API/DB / isolated broker against INTEGRATION_DATABASE_URL / ORBIT_DATABASE_URL / PULSE_DATABASE_URL)
 * - Provider/hardware live verified
 * - Pending configuration or partner decision
 */

## Evidence matrix (RC)

| Flow | Commit | Test environment | Result | Remaining blocker |
|------|--------|------------------|--------|-------------------|
| Pulse→Atlas quote→booking (PG) | hardened RC | `INTEGRATION_DATABASE_URL` local Postgres | **PASS** — `pulse-quote-orchestrate.integration.test.ts` + reservation suite | Live Meta WhatsApp delivery |
| Pulse ConversationAction recovery | hardened RC | Pulse schema | **PASS** — `conversation-action.integration.test.ts` | Live Meta; paired HTTP process e2e |
| Pulse inbound identity binding | hardened RC | Unit + Pulse app | **PASS** — JWT / Bridge token + server-resolved WhatsApp link; rejects caller-supplied atlasUserId (`inbound-identity.test.ts`) | Live Bridge channel in staging |
| Google OIDC protocol (controlled) | hardened RC | Controlled RSA JWKS + PG `OAuthPendingState` | **PASS** — shared expiring store, session-bound state/nonce/PKCE, atomic consume, restart-safe (`oauth-pending*.test.ts`, `google-oidc.protocol.integration.test.ts`) | Live Google credentials |
| Orbit MQTT broker → ingest → PG | hardened RC | Embedded Aedes (**MQTT 3.1.1**) + Orbit PG | **PASS** — auth/ACL/topic identity; **rejects payload `__mqttSecret`**; scrub logs/DLQ (`mqtt-broker.integration.test.ts`) | Physical Lunar; production broker TLS/ACL |
| Orbit MQTT 5.0 protocol claim | hardened RC | Mosquitto suite gated on `MQTT5_BROKER_URL` | **DOCUMENTED** — Aedes = 3.1.1; MQTT5 suite ready; image pull may be blocked locally | Mosquitto + Lunar firmware session/expiry |
| Fresh install / upgrade migrations | `0016` + `0017` | Local Atlas DB (`OAuthPendingState` present) | **PASS** local; see `RC_MIGRATION_RECOVERY_RUNBOOK.md` | Staging clone dry-run |
| Booking/quote data compatibility | same | Reservation + quote accept paths | **PASS** | Staging restore drill |
| Background job / restart recovery | same | Atlas idempotency; Pulse priorActions; Orbit inbox; OAuth PG store | **PASS** (integration) | Multi-replica job leader election |
| Customer-safe exports / tenant access | same | Unit + public share + cross-tenant FORBIDDEN | **PASS** | — |
| Critical browser flows (desktop/mobile) | hardened RC | Local only — `RC_BROWSER_VERIFICATION.md` | **PASS (local)**; creative upload partial (no seeded assets) | **Staging browser not done** |
| Security review | hardened RC | OIDC store; MQTT broker trust; Pulse inbound authz | **CLOSED for documented gaps** (see Security below); live enablement still gated | Formal sign-off; live provider checks |
| Backup/restore + rollback | docs | `RC_MIGRATION_RECOVERY_RUNBOOK.md` | **DOCUMENTED** + local migration presence | Execute restore drill on staging |

## Security findings → resolutions

| Finding | Resolution | Regression |
|---------|------------|------------|
| In-memory Google OAuth PKCE/state | Postgres `OAuthPendingState` + AES-GCM; HttpOnly `skyarc_oauth_sid`; session+action bound; atomic one-time consume | `oauth-pending-store.test.ts`, `oauth-pending.integration.test.ts`, protocol integration |
| MQTT `__mqttSecret` in payloads | Reject secrets in payload; trust broker auth + topic `physicalDeviceId`; scrub previews/logs/failures | `mqtt-broker.integration.test.ts` secret reject |
| Pulse caller-supplied `atlasUserId` | Bind via JWT or Bridge service token + Atlas WhatsApp link resolve; authorize before conversation/proposal/quote/confirm | `inbound-identity.test.ts` |
| Credentials in telemetry/exports | Consumer rejects secret fields; remediation rotate procedure in runbook (independent of mTLS) | broker suite + runbook |

## Pulse → Atlas quote → booking

| Step | Status | Evidence |
|------|--------|----------|
| Linked user required (phone alone denied) | **Implemented** | Pulse inbound returns `blocked_unlinked` |
| Inbound identity not caller-trusted | **Integration / unit verified** | `inbound-identity.ts` |
| Campaign binding required | **Implemented** | `blocked_missing_campaign` |
| Structured brief → Atlas scenarios | **Integration verified** | PG |
| Scenario → Atlas proposal + QuoteRevision | **Integration verified** | no Pulse ledger |
| Confirmation bound to user/tenant/action/quote | **Integration verified** | |
| Accept → reserve with revalidation | **Integration verified** | |
| Duplicate / concurrent / expired | **Integration verified** | |
| Exactly one booking + ConversationAction | **Integration verified** | |
| Customer-safe pricing only | **Implemented** | |
| Meta transport / live Meta | **Pending** | |

## Google sign-up / onboarding

| Step | Status | Evidence |
|------|--------|----------|
| OIDC start/callback/link + PKCE | **Implemented** | `/auth/google/*` |
| Shared expiring pending store | **Integration verified** | migration `0017` |
| Protocol integration (controlled OIDC) | **Integration verified** | not live Google |
| Live Google verification | **Pending configuration** | keep disabled |

## Orbit MQTT

| Step | Status | Evidence |
|------|--------|----------|
| Protocol exercised by Aedes suite | **MQTT 3.1.1** (`protocolVersion` 4) | Documented; Lunar proposes 5.0 |
| MQTT 5.0 Mosquitto suite | **Gated** on `MQTT5_BROKER_URL` | `mqtt5-broker.integration.test.ts` |
| Broker auth + directional ACL + topic identity | **Integration verified** | Aedes |
| Reject payload secrets | **Integration verified** | |
| TLS + production ACLs | **Pending** | runbook remediation |
| Physical device / prod broker | **Pending** | |

## Release checklist

| Flow | Implemented | Integration verified | Live provider |
|------|-------------|----------------------|---------------|
| Proposal selection + quote accept | Yes | **Yes** (PG + local browser) | N/A |
| Booking approval / amend / expiry | Yes | **Yes** (PG) | N/A |
| Pulse conversation confirm + reserve | Yes | **Yes** (PG + inbound identity) | Meta pending |
| Google onboarding + tenant access | Yes | **Yes** (controlled + shared store) | Google pending |
| Orbit MQTT ingest | Yes | **Yes** (Aedes 3.1.1; no payload secret) | Prod/device pending |
| Creative/proof authorization | Yes | Unit + ops empty UI | Full browser upload partial |
| Invoice + partial manual payment | Yes | Unit + local browser/API | Payment provider pending |

## External blockers (track separately)

- Google credentials (live OIDC)
- Meta WhatsApp delivery + templates
- Payment provider
- Tally live sync
- Production Orbit broker + Lunar hardware + MQTT 5 firmware confirmation
- Staging browser smoke + staging backup/restore drill
- Formal security sign-off for live enablement

## Do not

- Manufacture audience forecasts / impressions / reach / proof of play from basic telemetry
- Label handler-only Orbit tests as broker-verified
- Label controlled OIDC as live Google verified
- Label local browser as staging verified
- Describe the platform as production-ready while gated integrations or staging validation remain open
- Merge/deploy/contact providers automatically
