# Staging verification record

**Status: INCOMPLETE — isolated staging partially deployed; Class C matrix not complete.**

**Distinct from local RC browser evidence** (`RC_BROWSER_VERIFICATION.md`).

| Field | Value |
|-------|--------|
| Verification outcome | **INCOMPLETE** (not PASS) |
| Frontend candidate (prior) | `c4dd197` |
| Staging deploy branch tip | `96d4d05` (bootstrap + MQTT protocol fixes) |
| Image build SHA (in progress / pending redeploy) | `96d4d05` workflow `37012120177` |
| Prior image digests (ba68fa9) | See `docs/contracts/staging-image-digests.txt` |
| Hostinger project | `skyarc-atlas-staging` (separate from production `skyarc-atlas`) |
| Production project | **untouched** — still running on `:3001–:3004` |
| Date | 2026-10-02 |

## Evidence classes

| Class | Meaning | Completes staging sign-off? |
|-------|---------|------------------------------|
| **A — Local** | Local API/web | No |
| **B — Mixed preview** | RC frontend + **production** backend | **No** |
| **C — Isolated staging** | Preview frontend + staging images/DB/MQTT | **Required** |

## Vercel environment audit (no production value restores)

| Key | Env id | Targets | Note |
|-----|--------|---------|------|
| `API_PROXY_TARGET` | `yUXBihGrGzQBcnAu` | production, preview | Shared — **not edited** |
| `API_PROXY_TARGET` | `9Jhi7AnoKuaQKAVB` | preview only | Prior list showed empty; reserved for staging URL |
| `PULSE_PROXY_TARGET` | `eta2MXJhUNSsXg8v` | production, preview | Shared — **not edited** yet |
| Fail-closed proxy | code in `apps/web` @ `3a93a5c+` | — | Explicit `503 STAGING_*_UNAVAILABLE` / isolation |

Preview proxies **not** switched to staging until API `:3101` healthy after bootstrap fix redeploy.

## Class B browser matrix (RC frontend + production backend)

| Flow | Result | Notes |
|------|--------|-------|
| Login / inventory / responsive | PASS | Mixed env |
| Scenario generation | **FAIL** | Cause **unconfirmed** (not reproduced on matching RC services) |
| Mutating / Pulse / MQTT / exports bytes | PENDING | Not run against production |

## Class C isolated staging — deploy progress

| Step | Result |
|------|--------|
| Image-based compose (no VPS `build:`) | Done — `docker-compose.staging.images.yaml` + pinned digests |
| GHCR publish via Actions (`packages:write`) | Done — anonymous pull of manifests works |
| Hostinger `vps_docker_create` `skyarc-atlas-staging` | Done — project exists alongside production |
| Firewall TCP 3101 / 3103 | Added + synced on firewall `350834` |
| Postgres + Mosquitto + Bridge + Pulse | Came up; Pulse `:3103` returned **200** |
| API | **Crash loop** on first deploy — SQL `0001_postgis` before Prisma tables (`P1014` Location missing). **Fixed in** `96d4d05` entrypoint order; redeploy pending |
| Orbit | **Crash loop** — MQTT `Missing protocol`. **Fixed in** `96d4d05` connect options; redeploy pending |
| Seed two tenants | PENDING (needs healthy API) |
| Preview-only proxy cutover + `STAGING_PROXY_ISOLATION=1` | PENDING |
| Full Class C browser matrix | PENDING |
| HTTPS TLS hostname | **Not provisioned** (no SSH/certs via MCP); using IP:port like production HTTP pattern |

## Migration sequence (empty staging)

Documented in `docs/deploy/staging/MIGRATION_SEQUENCE.md` — full `0001`–`0017`, not only `0016`/`0017`. Entrypoint now **db push then SQL ledger** on fresh DB.

## Remaining blockers

1. Finish image rebuild `96d4d05` and recreate/update `skyarc-atlas-staging` (wipe empty broken volume if needed).
2. Confirm `:3101` health + seed.
3. Preview-only Vercel proxy + isolation flag; leave production env rows unchanged.
4. Class C matrix including scenario generation on matching RC services.
5. Managed HTTPS for staging (SSH/cert capability still missing via Hostinger MCP).

**Not done:** merge, production routing changes, production promotion.
