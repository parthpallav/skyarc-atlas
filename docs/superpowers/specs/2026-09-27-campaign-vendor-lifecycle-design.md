# Campaign → vendor confirm → live inventory (role clarity)

**Date:** 2026-09-27  
**Status:** Draft for review  
**Depends on:** `2026-09-27-media-plan-customer-story-design.md` (plan page + customer-safe PDF Index/why/demand)

## Goal

Give **brand**, **Skyarc planner/admin**, **vendor**, and **field** clear stages without breaking today’s request/respond/approve/book paths. Reduce “many media plans floating as equals” confusion. Add light field capture for location photos and live campaign proof.

## Locked decisions

| Topic | Choice |
|--------|--------|
| Who unlocks vendor site requests | **A — Skyarc MEDIA_PLANNER / ADMIN / SUPERADMIN only** after campaign is marked ready |
| Brand role | Can draft campaign intent and follow status; cannot send requests to media owners until Skyarc unlocks |
| PDF / plan pitch | Always customer-safe (see sibling spec) |
| Competing request auction | **Out of scope** this program — keep today’s vendor respond + Skyarc finalize |
| Implementation style | Additive: new statuses/gates + IA; do not remove working `/respond` or book-on-approve |

## Roles (what each person does)

### Brand / CLIENT_VIEWER (end user, brand analyst)

- Create or join a **campaign** (dates, brief, intent).
- See **one primary story** under that campaign (progress: draft → waiting Skyarc → awaiting owners → confirmed / live).
- After vendors confirm and Skyarc finalizes: see Index, why-this-site, calm demand, client rates when visible.
- Never see vendor margins, internal ops, or raw multi-draft plan spam as peer list items.

### Skyarc MEDIA_PLANNER / ADMIN / SUPERADMIN

- Review campaign; mark **Ready for site requests** (the gate).
- Build/select site list and **send site requests** to respective media owners for the campaign flight.
- Watch vendor confirmations on the same campaign.
- **Finalize** the winning plan (today’s APPROVED) → inventory books.
- Use redesigned plan page + customer-safe PDF for pitches.

### Vendor (VENDOR / VENDOR_ADMIN; VENDOR_OPS read/respond as today)

- Inbox = **Requests** only for sites owned by their org.
- Confirm or decline for the stated flight (“we can execute”).
- No campaign admin, no Index weight config, no other brands’ full plan internals beyond what’s needed to decide.

### Field (FIELD_OPERATOR)

- Add/update **locations** and inventory photos (survey path).
- After a site is booked/live for a campaign: upload **live proof** photos tied to that campaign + location.
- No media-plan optimization or vendor approval inbox.

## Lifecycle state machine

```text
CAMPAIGN_DRAFT
  brand / planner create campaign + brief
       │
       ▼
CAMPAIGN_READY          ← NEW gate (Skyarc planner/admin only)
  unlocks “request sites from owners”
       │
       ▼
SITE_REQUESTS_OUT       ← existing DRAFT media plan(s) with isSiteRequest
  soft-holds as today; vendors see Requests
       │
       ▼
VENDOR_PARTIAL / VENDOR_CONFIRMED
  item approvalStatus APPROVED|REJECTED via /respond (unchanged)
  planner sees confirmations on campaign
       │
       ▼
PLAN_FINALIZED          ← existing plan status APPROVED + holdInventory book
  BOOKED windows for flight
  campaign lifecycle → ACTIVE (existing sync)
       │
       ▼
LIVE / IN_PROGRESS
  map + locations + campaign + primary plan reflect booked
  field may add live proof
       │
       ▼
COMPLETED (flight end) / CANCELLED (all rejected)
```

### Mapping to existing data (non-breaking)

| New concept | Likely storage |
|-------------|----------------|
| CAMPAIGN_READY | Prefer `Campaign.lifecycleStatus` extension **or** a boolean/`readyForSiteRequestsAt` on Campaign — choose one in implementation; do not invent parallel campaign tables |
| SITE_REQUESTS_OUT | Existing `MediaPlan` DRAFT + site-request brief flag |
| Vendor confirm | Existing `MediaPlanItem.approvalStatus` + `/respond` |
| Finalize + book | Existing patch plan status APPROVED + `holdInventoryForCampaign(..., "book")` |
| Primary / live plan | New `Campaign.primaryMediaPlanId` **or** derive: single APPROVED plan for flight; drafts nested under campaign only |

**Rule:** Top-level “Media plans” navigation for clients/planners lists **campaigns** (or plans grouped by campaign). Only the **finalized / live** plan is promoted; drafts/requests appear **inside** the campaign, labeled as requests—not as peer “media plans.”

## Inventory sync (after finalize)

On plan APPROVED (already implemented): book inventory for campaign dates.

This program **hardens and verifies** that the following all read the same booked state (no new booking engine):

- Map availability / live status
- Locations list + location detail
- Campaign lifecycle badge
- Media plan detail (primary)

Soft-holds remain for outbound requests until finalize; releasing on reject stays as today.

## Field: location add + live proof

### Location add (field)

- Ensure FIELD_OPERATOR can complete the existing location create + asset upload path used by survey/ops (permissions + landing already lean toward `/locations`).
- No new inventory type system in this program.

### Live campaign proof (new, minimal)

- Assets linked to `locationId` + `campaignId` (and optional `mediaPlanId`), kind e.g. `CAMPAIGN_LIVE_PROOF` or reuse an existing asset kind with metadata.
- Visible on location detail (and optionally campaign) as “Live on site” for roles that may see campaign proof; clients may see proof without competitor naming rules consistent with current `LocationCampaignProof` redaction.

## Customer plan page + PDF

Unchanged from sibling spec:

- Redesigned plan detail composition
- Index + why + calm demand for customers in-app and PDF
- PDF never includes admin/vendor-secret fields

## Explicitly out of scope

- Vendor choosing among multiple competing brands’ requests (auction / exclusive pick UI)
- Replacing soft-hold mechanics
- Mobile-native field app (web path only unless already present)
- Changing Index weight defaults beyond quiet admin settings

## Non-regression rules

1. Existing vendor `/respond` and planner approve/reject continue to work for campaigns already in DRAFT request state.
2. Until a campaign has CAMPAIGN_READY, **do not** expose “send to owners” for CLIENT_VIEWER; planners may still prepare draft site lists offline if needed, but vendor inbox only receives requests after Ready (implementation must not strand in-flight drafts: grandfather open DRAFT requests created before the gate).
3. PDF export path remains customer-safe regardless of exporter role.
4. No destructive schema resets; additive columns/enums only.

## Success criteria

1. Brand cannot trigger vendor site requests until Skyarc marks campaign ready.
2. Vendor Requests inbox remains the confirmation surface; Skyarc sees those confirmations on the campaign.
3. After finalize, map/locations/campaign/plan agree the site is booked for the flight.
4. Only one primary live/in-progress plan is highlighted per campaign; drafts nest under campaign.
5. Field can add location photos and attach live proof to a booked campaign site.
6. Prior customer-story plan page + PDF Index/why/demand shipped as part of the same program.
7. Existing open request/approve flows still pass current lifecycle tests.

## Suggested implementation order (single program)

1. Campaign Ready gate + role checks + grandfathering  
2. Campaign-centric plan IA (list nesting / primary plan)  
3. Plan page redesign + PDF Index/why/demand (sibling spec)  
4. Inventory sync verification / small fixes if map or list lag bookings  
5. Field live-proof asset + UI  
6. Copy/empty states per role so stages read clearly  

## Testing focus

- RBAC: client cannot send vendor requests pre-Ready; planner can after Ready  
- Lifecycle: Ready → request → respond → approve → BOOKED → ACTIVE  
- Grandfather: pre-gate DRAFT requests still visible to vendors  
- PDF sanitization + client plan view Index  
- Field proof upload permission and visibility redaction  
