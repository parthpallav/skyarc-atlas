# Staging verification record

**Status: INCOMPLETE — isolated staging not verified.**

**Distinct from local RC browser evidence** (`RC_BROWSER_VERIFICATION.md`).

| Field | Value |
|-------|--------|
| Verification outcome | **INCOMPLETE** (not PASS) |
| Deployment candidate SHA | `c4dd197e9a6b1eee413a42178e90ddc38beda7e5` |
| Type-fix commit | `fc5ef75` |
| Hardening baseline | `4677c2628ea224a516ce4bccedfb7bb149067f8e` |
| Branch | `feat/phase2-4-booking-scenarios` |
| Backend SHA on isolated staging | **not deployed** |
| Image digests (staging) | **none** — images not published |
| Vercel READY frontend | `dpl_AAvb9JxeFat3nBzFh6RaYcc5uYAV` @ `c4dd197` |
| Working preview URL | `https://skyarc-atlas-git-feat-phase2-4-boo-3f64d0-parthpallavs-projects.vercel.app` |
| Production alias `skyarc-atlas.vercel.app` | **404** `DEPLOYMENT_NOT_FOUND` |
| Isolated staging API | **missing** (`:3101` timeout) |
| Date | 2026-10-02 |

## Evidence classes (do not mix)

| Class | Meaning | Completes staging sign-off? |
|-------|---------|------------------------------|
| **A — Local** | Local API/web on developer machine | No |
| **B — Mixed preview** | RC **frontend** `c4dd197` + **production** VPS backend | **No** |
| **C — Isolated staging** | RC frontend + RC images backend + staging DB/MQTT | **Required** |

Browser results below are **Class B only** unless marked otherwise.

## Vercel environment audit (no production edits)

Prior-value evidence recorded by env **id / targets / timestamps** (secrets not written here).

| Key | Env id | Targets | Updated | Comment / note |
|-----|--------|---------|---------|----------------|
| `API_PROXY_TARGET` | `yUXBihGrGzQBcnAu` | production, preview | 1790785723050 | Shared build/runtime proxy — **points both envs at same origin** (production VPS historically). Do **not** edit blindly. |
| `API_PROXY_TARGET` | `9Jhi7AnoKuaQKAVB` | preview only | 1790785451204 | Comment: “Hostinger public hostname for Atlas API previews”. Value type sensitive; list response showed **empty** decrypted field — treat as **unset / unknown prior**. Safe target for preview-only staging URL once staging is up. |
| `PULSE_PROXY_TARGET` | `eta2MXJhUNSsXg8v` | production, preview | 1790867670817 | Shared Pulse proxy — currently production+preview. Preview-only override needed; **do not change production target**. |
| `NEXT_PUBLIC_ORBIT_UI` | `YqwbLzzVFHHfVdq0` | production, preview, development | 1790779543231 | Plain `true` |
| `NEXT_PUBLIC_API_URL` | `muoAMwF95LdAmJP5` / `8zwgpAq0klnyTiHa` | preview / production | older | Separate per target |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | preview + production ids | split | older | Unrelated to staging proxy |

**Audit conclusion:** Preview currently inherits production API/Pulse proxies via shared env rows. No restore performed (prior plaintext of shared rows not committed to evidence files). Production env values left unchanged.

## Class B browser matrix (RC frontend + production backend)

| # | Flow | Desktop | Mobile | Notes |
|---|------|---------|--------|-------|
| 1 | Login | PASS | PASS | planner@skyarcads.com |
| 1b | Google disabled | PARTIAL | PARTIAL | No Google CTA in UI; prod `GET /api/v1/auth/google/status` → **404** (route absent on prod API) |
| 2 | Inventory / calendar | PASS | PASS | 50 sites / 47 bookable |
| 3 | Scenario generation | **FAIL** | **FAIL** | UI: “Could not generate scenarios.” **Cause unconfirmed** (mixed env; not reproduced on matching RC services) |
| 4 | Proposal share / exports | PARTIAL | PARTIAL | Share “Copied”; PDF/Excel controls present; file bytes not asserted |
| 5–11 | Quote, creative, invoice, Pulse, MQTT, cross-tenant | PENDING | PENDING | Not run against production |
| 12 | Responsive chrome | PASS | PASS | |

## Class C isolated staging matrix

All flows **PENDING** — stack not deployed.

## Migration sequence (empty staging DB)

Do **not** assume only `0016`/`0017`. Full ledger for Atlas SQL:

`0001` … `0017` via `scripts/apply-sql-migrations.sh` (API entrypoint).

On empty DB with `DATABASE_BOOTSTRAP=always|auto`:

1. Postgres volume init: PostGIS extension (`prisma/docker-init/01-postgis.sql`) + any orbit init SQL.
2. API entrypoint: apply **all** `prisma/migrations/*/migration.sql` in order into `_skyarc_sql_migrations`.
3. If user count = 0: `prisma db push --skip-generate` (Atlas schema only — **staging DB name `skyarc_atlas_staging` only**).
4. `prisma/apply-postgis.ts`, `prisma/backfill-screen-codes.ts`.
5. Orbit / Pulse / Bridge: each service entrypoint `db:push` / migrate against **same isolated** `*_DATABASE_URL` pointing at staging DB only — document in deploy log; never production DSN.
6. Seed: `pnpm exec tsx prisma/seed-staging.ts` with `STAGING_SEED_CONFIRM=1` (two tenants + roles).

## Hostinger capability vs image deploy

| Capability | Available |
|------------|-----------|
| `vps_docker_create` / start / update / logs | Yes |
| Separate project name (e.g. `skyarc-atlas-staging`) | Yes |
| Env vars on project | Yes |
| Named volumes in compose | Yes |
| SSH / remote shell / arbitrary file sync | **No** via MCP |
| Compose `build: context: .` without monorepo on VM | **Unsupported** for raw YAML URL |
| Pull pre-built `image:` from registry | **Supported** if VPS can pull |

Preferred path: CI → immutable images → `docker-compose.staging.images.yaml` → Hostinger create. Fallback SSH package: `docs/deploy/staging/SSH_DEPLOY_PACKAGE.md`.

## Remaining blockers

1. Registry publish + Hostinger pull of RC images (GH Packages write / valid token / Docker daemon for local build).
2. HTTPS (or intentional IP:port) for staging API/Pulse without colliding with production `:3001–:3004`.
3. Preview-only `API_PROXY_TARGET` / `PULSE_PROXY_TARGET` (leave production shared rows untouched).
4. Class C matrix after SHA/digest verify.

**Not done:** merge, production routing changes, production promotion.
