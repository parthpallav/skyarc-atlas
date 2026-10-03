# Media Planner Connected Journey — Implementation & QA

**Tested at:** see `media-planner-connected-e2e-results.json`  
**Isolated QA:** API `http://127.0.0.1:3131` · DB `skyarc_atlas_qa` · Web `http://127.0.0.1:3100`  
**Roles:** `MEDIA_PLANNER` + vendors `brandalyst@` / `apex@` — no Super Admin bypass  
**Flags:** `ADTECH_BOOKING=true` on QA API only (prod defaults remain gated off)

## What was connected

1. **Campaign → proposed plan → current plan**  
   Optimize/from-selection still creates PROPOSED packs. “Set as current plan” (status APPROVED) soft-holds with expiry and `PENDING_VENDOR_APPROVAL` booking items. Does **not** mark campaign LIVE.

2. **Bookable units**  
   - `resolveBookableUnit` / `slotsConsumedForRequest` in `@skyarc/shared`  
   - Digital capacity from `Inventory.slotCapacity` only (no silent default of 6)  
   - Kiosk sides / dual-package flags on `staticSpecsJson` (`sides`, `supportsDualSidedPackage`, `pooling`)  
   - Holds accept `slotsByInventory` for multi-slot / dual packages

3. **Vendor decisions**  
   Booking `/bookings/:id/respond` and media-plan `/respond` (DRAFT **or** current APPROVED plan). Expired/missing holds cannot be restored on approve.

4. **Activation**  
   `GET /campaigns/:id/activation-readiness` · `POST /campaigns/:id/mark-live` with blockers + booking transition audit (`MARK_LIVE`). Export / plan approve / Orbit do not call mark-live.

5. **Commitment view**  
   `GET /campaigns/:id/commitment` + UI `CampaignCommitmentPanel`. Documents that vendor approval ≠ customer e-sign.

6. **Labels**  
   “Current plan” vs “Live” / “Scheduled” (ACTIVE before flight start).

## Role & state transitions

| From | Actor | Action | To |
|------|-------|--------|-----|
| PROPOSED plan | MEDIA_PLANNER | Set as current plan | Plan APPROVED (current) + HELD windows + booking PENDING_VENDOR_APPROVAL; campaign PENDING_APPROVAL |
| PENDING_VENDOR_APPROVAL item | VENDOR | APPROVE (valid hold) | Item CONFIRMED; window BOOKED |
| PENDING_VENDOR_APPROVAL item | VENDOR | APPROVE (expired/missing hold) | Item REJECTED; no capacity restore |
| PENDING_VENDOR_APPROVAL item | VENDOR | REJECT | Item REJECTED; capacity released |
| Confirmed commitments + readiness | MEDIA_PLANNER | Mark live | Campaign ACTIVE (UI: Scheduled if before startDate, else Live); booking execution IN_PROGRESS |
| Any | system | Export / Orbit / plan approve | Must not set ACTIVE |

## Genuine remaining gaps

- Browser desktop keyboard + mobile tap evidence not in this API run.  
- Customer electronic acceptance still QuoteRevision-based when issued; commitment view documents absence.  
- Full LIVE when every plan site is non-vendor-owned may require Skyarc-owned inventory or multi-vendor approve-all.  
- Phase2 proposal/ops/billing modules remain on `feat/phase2-4-booking-scenarios` worktree.  
- Replacement UX after reject reuses existing swap/alternatives — not a new substitution engine.  
- Pricing/checkout/payment gateway deferred per scope.

## Contracts touched

- Shared: `effectiveSlotCapacity`, `bookable-unit`, lifecycle display labels  
- API: commitment, activation-readiness, mark-live; plan approve hold path; location from/to ISO parsing  
- Web: Current plan labels, commitment panel + Mark live  
- Seeds: explicit `slotCapacity` + kiosk side specs  
