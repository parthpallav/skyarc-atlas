# Media Planner E2E audit — isolated QA

**Date:** 2026-10-02  
**Role:** `MEDIA_PLANNER` only (`planner@skyarcads.com`) — Superadmin not used  
**Environment:** local isolated DB `skyarc_atlas_qa`, API `127.0.0.1:3101`, web `127.0.0.1:3100`  
**Seed:** `pnpm db:seed:full` synthetic catalog + campaigns  

## Commits

| Surface | SHA | Notes |
|---------|-----|--------|
| Local / frontend tip (pre-fix) | `6ad7214` | Campaign builder type fix |
| Backend API (Docker family) | `5f3816b` | Payments + availability |
| In-scope defect fix | *(this change)* | `apps/web/src/lib/api.ts` same-origin `/api` proxy in browser |

## Permissions (inspected before test)

- `isInternalUser(MEDIA_PLANNER)` → campaigns, approve plans, location write, client pricing
- `canAccessAdmin` → **false** (no Vendors / Settings nav)
- API: `POST /organizations` → **403** for planner
- Landing: `/dashboard`

## Step matrix

See canvas `media-planner-e2e-audit.canvas.tsx` and script `docs/validation/media-planner-e2e-audit.mjs`.

### Summary counts (post retest)

| PASS | PARTIAL | FAIL | BLOCKED |
|------|---------|------|---------|
| 8 | 7 | 2 | 1 |

### Confirmed defect fixed

Browser `getApiBaseUrl()` preferred `NEXT_PUBLIC_API_URL=http://localhost:3001` from root `.env`, so QA web on `:3100` calling API on `:3101` showed **Failed to fetch** / empty dashboard. Fixed: browser always uses same-origin `/api` (proxied via `API_PROXY_TARGET`).

### Missing capabilities (not empty-state theatre)

1. Pulse Excel/WhatsApp share (`:3003`)
2. PPTX export
3. Incidents + replacement recommendations
4. Invoices / profitability ledgers
5. Dashboard expiring-hold / overdue queues
6. Production/mounting/approved-proof workflows

### Edge cases

- Stale past flight availability → **PASS** (200 + breakdown)
- Duplicate quote accept → **PASS** (`idempotent: true`)
- Cross-tenant admin as client → **PASS**
- Expired share → **BLOCKED** (Pulse share not available)
- Concurrent reservation race → **PARTIAL** (sequential only)
