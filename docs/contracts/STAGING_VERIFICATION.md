# Staging verification record

**Distinct from local RC browser evidence** (`RC_BROWSER_VERIFICATION.md`).

| Field | Value |
|-------|--------|
| Deployed commit SHA | *(pending deploy — staging config at `6c9892a`)* |
| RC hardening baseline | `4677c2628ea224a516ce4bccedfb7bb149067f8e` |
| Branch | `feat/phase2-4-booking-scenarios` |
| Vercel deployment URL | |
| VPS API URL (HTTPS) | |
| Postgres database | `skyarc_atlas_staging` |
| Migrations applied | `0016`, `0017`, Orbit/Pulse/Bridge `db:push` |
| Backup taken before migrate | yes / no — file: |
| Date | |

## Environment

- `API_PROXY_TARGET` / `PULSE_PROXY_TARGET` set on Vercel: yes / no
- CORS matches Vercel origin: yes / no
- Google OIDC unset (disabled): yes / no
- Meta / payment / Tally live unset: yes / no
- Mosquitto internal-only: yes / no

## Functional matrix (via Vercel frontend)

| # | Flow | Desktop | Mobile | Evidence |
|---|------|---------|--------|----------|
| 1 | Login + tenant access | | | |
| 2 | Inventory import + availability calendar | | | |
| 3 | Campaign scenarios + pricing | | | |
| 4 | Proposal share + PDF/XLSX/PPTX | | | |
| 5 | Quote accept + booking | | | |
| 6 | Concurrent booking / expiry / amendments | | | |
| 7 | Creative approval + proof | | | |
| 8 | Invoice + partial manual payment | | | |
| 9 | Pulse conversation → booking (test transport) | | | |
| 10 | Simulated MQTT ingest + campaign evidence | | | |
| 11 | Cross-tenant access denial | | | |
| 12 | Layouts (responsive) | | | |

## Platform checks

| Check | Result | Notes |
|-------|--------|-------|
| Proxy timeout (large export) | | |
| Upload limit (~50MB API) | | |
| Analysis runner / reminders after API restart | | |
| Orbit `processPendingInbox` after restart | | |
| Bridge dry-run delivery receipts | | |

## Screenshots

Store under `docs/contracts/staging-evidence/YYYY-MM-DD/` (gitignored or attached to release ticket).

## Remaining blockers

- Live Google / Meta / payments / Tally / production Orbit: **out of scope for staging sign-off**
- Production promotion: **not authorized from this checklist**

## Outcome

- [ ] Staging verification **PASS**
- [ ] Staging verification **FAIL** — see blockers above
