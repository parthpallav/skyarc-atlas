# Local browser RC verification evidence

**Distinct from staging verification.**

| Field | Value |
|-------|--------|
| Environment | Local macOS; Atlas API `:3001` (tsx dev); web **production** `next start` on `:3000` |
| Commit under test | `f7504ca2741960dc9c1334a2db4aa6be6baccae2` (RC branch); hardening `4677c26` |
| Date | 2026-10-02 (recovery pass) |
| Web mode | `NODE_ENV=production` build + start (no file watchers) |
| Proxy env | `API_PROXY_TARGET=http://127.0.0.1:3001`, `PULSE_PROXY_TARGET=http://127.0.0.1:3003` |

## Server recovery (2026-10-02)

| Process | Finding | Action |
|---------|---------|--------|
| PID 96526 | Cursor Helper — **not** the web server | No action |
| PID 98462 / 98449 | `next dev` for this repo on `:3000` | Stopped with SIGTERM |
| PID 14066 | `@skyarc/api` tsx watch on `:3001` | **Kept** — healthy `/health` |
| EMFILE failure | Aborted `next dev` in sandbox; separate recovery shell used `ulimit -n 10240` + one dev instance | Root cause: **dev watcher** under constrained session, not system-wide limit (shell `ulimit -n` 1048575) |
| Verification web | `pnpm --filter @skyarc/web build` + `next start -H 0.0.0.0 -p 3000` | Running (production, no Watchpack) |

## Proxy verification (curl)

| Target | Result |
|--------|--------|
| `GET /api/v1/auth/google/status` via `:3000` proxy | `configured: false` |
| Direct API `:3001/health` | 200 |
| Pulse `:3003` | **Not running** — `BRIDGE_SERVICE_TOKEN` missing from local `.env`; Pulse proxy not exercised |

## Browser automation

Cursor IDE browser tab returns `chrome-error://chromewebdata/` for `127.0.0.1:3000` and `:3010` in this session — **desktop/mobile UI flows not re-run here**.

Prior session evidence (dev web, same API/seed) remains below for flows not re-validated on production web.

## Flows checklist

| Flow | Desktop | Mobile | Notes |
|------|---------|--------|-------|
| Login + unavailable Google when unset | **PENDING** (browser) / API PASS | **PENDING** | Proxy + API login OK |
| Inventory availability / location panel | **PENDING** | **PENDING** | API locations list OK |
| Scenario comparison | Prior PASS (dev) | Prior PASS (dev) | Not re-run on prod web |
| Customer proposal review / share | Prior PASS (dev) | Prior PASS (dev) | Not re-run on prod web |
| Quote accept + booking status | Prior PASS (dev) | Prior PASS (dev) | Not re-run on prod web |
| Creative upload / approval / proof | PARTIAL | PARTIAL | Empty-state only |
| Invoice + partial payment | Prior PASS (dev + API) | Prior PASS | Not re-run on prod web |
| Customer data filtering | API PASS (cross-tenant FORBIDDEN) | **PENDING** | |
| Google onboarding (controlled) | N/A UI | N/A UI | API `configured: false` |
| Disabled integration empty states | API PASS (payment UNAVAILABLE) | **PENDING** | |

## Staging (separate)

| Target | Result |
|--------|--------|
| `https://skyarc-atlas.vercel.app` | **404** DEPLOYMENT_NOT_FOUND |
| `https://atlas.skyarcads.com` | **307** (production host — not isolated staging RC) |
| VPS `200.97.170.55:3001/health` | **200** (production API — not verified against `f7504ca`) |

**Staging browser verification: not done.** Local production-web recovery does not replace it.

## Result

**Browser verification: PENDING** — production web is up and API/proxy checks pass, but automated browser and full desktop/mobile matrix were **not** completed in this recovery pass. Do not treat RC browser sign-off as closed until manual or working browser automation re-runs the checklist on `:3000` production server.

## Build note

Production `next build` required minimal type fixes (uncommitted): `PageHeader` `action` prop on orbit-evidence + recommendations; recommendations cast via `unknown`.
