# Local browser RC verification evidence

**Distinct from staging verification.** This pass does not claim staging readiness.

| Field | Value |
|-------|--------|
| Environment | Local macOS; Atlas API `:3001` + Next.js web `:3000`; seed demo tenants |
| Commit under test | hardening `4677c26` / tip `3efc66a` |
| Date | 2026-10-02 |
| Roles exercised | Media Planner (`planner@skyarcads.com`); admin used for partial payment API; public share (unauthenticated) |
| Viewports | Mobile ~390×844; Desktop ~1280×800 |

## Protocol

1. Local API + web already running against local Postgres seed data.
2. Authenticated Media Planner session in browser tooling.
3. Invoice draft/issue + partial payment exercised via `/api/v1` then confirmed in UI (billing UI is read-oriented).
4. Record pass/fail per flow. No staging credentials used.

## Flows checklist

| Flow | Desktop | Mobile | Notes |
|------|---------|--------|-------|
| Login + unavailable Google when unset | PASS | PASS | Demo login; `GET /api/v1/auth/google/status` → `configured: false` |
| Inventory availability / location panel | PASS | PASS | `/locations` bookable list; detail `SKY-U-02` with availability/status |
| Scenario comparison | PASS | PASS | Luxury Towers `/campaigns/…031/scenarios` Coverage vs Concentration |
| Customer proposal review / share | PASS | PASS | Issued proposal UI; public `/share/proposals/{token}` view-only; Accept/Pay false; no margin leakage in public API |
| Quote accept + booking status | PASS | PASS | Accept & reserve → booking `confirmed` with 3 inventory items |
| Creative upload / approval / proof | PARTIAL | PARTIAL | Ops UI loads (0 creatives / proof pending empty states). Full upload not exercised — location had 0 UPLOADED assets; authorization path covered by unit tests |
| Invoice + partial payment | PASS | PASS | `INV-00001` ISSUED → PARTIALLY_PAID (₹500 of ₹11,22,180); UI shows outstanding; payment-intent `UNAVAILABLE` without provider |
| Customer data filtering | PASS | PASS | Public share customer-safe; cross-tenant customer invoice GET FORBIDDEN; no margin/cost terms in share payload |
| Google onboarding (controlled) | N/A UI | N/A UI | Live Google disabled; protocol integration in API suite |
| Disabled integration empty states | PASS | PASS | Billing copy: live checkout blocked; Google status not configured; Orbit telemetry disclaimer on scenarios |

## Representative artifacts (local)

- Proposal (accepted): `0bb5c858-bfef-43b6-bd81-7b918cce7997`
- Booking: `ddf41851-be34-48d2-b9f0-6e542a034a66`
- Invoice: `85d16051-87fe-4d20-b0b1-a738c6aea764` / `INV-00001`
- Share proposal (issued, view-only): `f70ff2c7-5892-4f17-88a1-1133347a0260`

## Result

**Local browser RC: PASS with noted creative-upload partial** (empty-state verified; asset upload requires seeded UPLOADED LocationAsset). Staging browser verification remains **not done**.
