# Draft PR #7 — release candidate text

> Saved locally because GitHub API auth may be unavailable (`gh` Forbidden).
> Paste into draft PR #7 when repository access is available. Do **not** merge or deploy automatically.

**Branch:** `feat/phase2-4-booking-scenarios`  
**Hardened RC SHA:** *(fill after commit)*  
**Prior baseline:** `52a817d`  
**Title:**

```
RC: Harden OIDC/MQTT/Pulse authz; local browser + MQTT 3.1.1/5 matrix; migration runbook
```

## Summary

- Closes security gaps without new product features: shared expiring Google OIDC pending store (session-bound, atomic consume); Orbit MQTT rejects payload `__mqttSecret` and trusts broker ACL + topic identity; Pulse inbound binds user/tenant via JWT or Bridge→Atlas link resolve.
- MQTT protocol claim: local Aedes suite = **MQTT 3.1.1**; MQTT 5.0 Mosquitto suite gated on `MQTT5_BROKER_URL`; Lunar firmware MQTT 5 expiry still partner-dependent.
- Local desktop/mobile browser verification recorded in `RC_BROWSER_VERIFICATION.md` (distinct from staging).
- Migrations `0016` + `0017` + recovery/remediation in `RC_MIGRATION_RECOVERY_RUNBOOK.md`.

## Migration notes

- Apply Atlas `0016_google_identity_invitations` then `0017_oauth_pending_state` before enabling Google routes.
- Orbit / Pulse remain on their own DB URLs (`db:push`).
- MQTT payload-secret retirement: rotate device broker passwords and HTTPS secrets per runbook — **does not wait for mTLS**.
- Rollback: prefer forward schema + disable gated env flags. Do not drop `ExternalIdentity` if Google links exist.

## Validation summary

```bash
# On committed RC SHA:
pnpm --filter @skyarc/api build && pnpm --filter @skyarc/api test:unit
INTEGRATION_DATABASE_URL=… pnpm --filter @skyarc/api test:integration

pnpm --filter @skyarc/pulse test:unit
PULSE_DATABASE_URL=… pnpm --filter @skyarc/pulse test:integration

pnpm --filter @skyarc/orbit-cloud test:unit
ORBIT_DATABASE_URL=… pnpm --filter @skyarc/orbit-cloud test:integration
# Optional: MQTT5_BROKER_URL=… for Mosquitto MQTT 5 suite
```

Ensure CI includes the three integration suites **or** attach their evidence separately to the PR.

## Test plan

- [ ] Re-run integration suites on staging-isolated DBs
- [ ] Apply `0016`+`0017` on staging clone
- [ ] Keep Google/Meta/paid checkout/live Tally/prod Orbit disabled until live checks
- [ ] Staging desktop/mobile browser smoke (separate from local RC)
- [ ] Staging backup/restore drill
- [ ] Formal security sign-off for live enablement

## Body (for `gh pr edit 7`)

```markdown
## Summary
- Harden RC: Postgres OAuth pending store; MQTT broker-trust ingest (no payload secrets); Pulse inbound identity binding.
- Local browser RC evidence; MQTT 3.1.1 Aedes + MQTT 5 gated suite; migration/recovery runbook.
- No new product features. Not production-ready while live providers/staging remain open.

## Migration notes
- Apply `0016` then `0017`. See `RC_MIGRATION_RECOVERY_RUNBOOK.md`.

## Validation
- API / Pulse / Orbit unit + integration on committed SHA (fill counts after run)
- Local browser: `RC_BROWSER_VERIFICATION.md`
- CI: include integration suites or attach separate evidence

## Remaining blockers
- Live Google / Meta / payment / Tally / production Orbit + Lunar MQTT 5 firmware
- Staging browser + staging restore drill
- Formal security sign-off for enablement

## Test plan
- [ ] Staging integration re-run
- [ ] Migrations on staging clone
- [ ] Gated features stay off without credentials
- [ ] Staging browser smoke
```
