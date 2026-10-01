# Locations catalog + window-scoped availability (Slice 1)

**Date:** 2026-10-01  
**Status:** Approved for planning  
**Scope:** Locations list/catalog UX, flight-window availability truth, admin force-available with impact preview + reason, confirmation modals, multi-media list carousel  
**Depends on:** Slice 2 detail/edit declutter (shipped)

## Problem

1. Catalog defaults and filters make Open / Partial / Hold / Full feel equal; default should prefer **Open**.
2. “Mark available” only flips inventory status and ignores **BOOKED/HELD windows**, so fully booked sites stay Booked for the selected flight.
3. Bulk govern uses `window.confirm` and does not show **which campaigns/plans** would be affected.
4. Search does not reliably hit Skyarc / public / vendor codes.
5. List cards show a single cover image; multi image/video should carousel on hover with arrows.

## Goals

1. Availability badges and filters reflect the **selected flight window** (`from`/`to`).
2. Default availability chip: **Open** (`BOOKABLE`).
3. Admin-only force free for sites that are fully booked (static exclusive or digital full) **in that window**, with:
   - Preview of affected campaigns + media plans
   - Required reason
   - Clear **only overlapping** availability windows for that window
4. Confirmation **modals** for Mark available / unavailable / Hide / Unhide (no browser `alert`/`confirm`).
5. Search indexes name + Skyarc site code + public id + vendor media code.
6. List thumbnails support multi media carousel (hover auto-advance + prev/next).
7. Slimmer top strip: search + flight + availability chips; type/corridor/sort in secondary drawer.

## Non-goals

- Campaigns brief panel / live-vs-proposed plan UX (Slice 3)
- Premium + ≥60% Skyarc mix (Slice 4)
- Multi-city seed data (Slice 5)
- Changing Orbit MQTT APIs
- Replacing confirmation modals elsewhere beyond locations catalog govern actions (may reuse modal component later)

## Architecture

```
Browser locations page
  ├─ flight from/to (existing)
  ├─ filters (default BOOKABLE)
  ├─ search q → API widened match
  ├─ cards ← previewMedia[] + liveInventory for window
  └─ govern modal
        ├─ preview API (affected campaigns/plans for window)
        └─ execute API (clear overlapping windows + reason audit)
```

API remains source of truth for occupancy via existing `liveInventory` / window intersection. New endpoints (or extend bulk action) for **preview** and **admin force-available**.

## Availability truth

- List and badges continue to use `liveInventory.status` for the request’s `from`/`to`.
- Changing flight dates re-fetches; no sticky “booked forever” from inventory status alone.
- Fully booked **in window** = `liveInventory.status === "UNAVAILABLE"` (static exclusive booked or digital capacity full for that window).

## Admin force-available (window-scoped)

### Who

- Only **admin** (or existing `isAdminRole` / superadmin — same as platform admin on locations) may force-clear fully booked sites for the window.
- Vendors/internal non-admin: “Mark available” applies only to sites that are not fully booked in window (inventory AVAILABLE path); if selection includes fully booked, show modal explaining only admin can free them (or exclude those ids and proceed on eligible only — **prefer block with clear message** rather than silent partial).

### Preview

`POST /api/v1/locations/availability/preview-release` (name flexible)

Body: `{ locationIds: string[], from: string, to: string }`

Response: per location:

- `liveStatus`
- `overlappingWindows: [{ id, status, startDate, endDate, inventoryId }]`
- `affectedCampaigns: [{ id, name, lifecycleStatus }]`
- `affectedMediaPlans: [{ id, name/status, campaignId }]`

Derived from availability windows overlapping `[from, to]` with status in `BOOKED | HELD | BLOCKED`, joined through inventory → plan items / campaign links already used in booking flows.

### Execute

`POST /api/v1/locations/availability/release` (admin only)

Body: `{ locationIds, from, to, reason: string }` — `reason` trimmed min length 8.

Effects (transaction):

1. Delete or mark released **only** overlapping windows in that date range (prefer status → `AVAILABLE` soft or delete HELD; for BOOKED overlapping the window: end/split/delete overlap — **implementation: delete or set status AVAILABLE only for windows that intersect `[from,to]`**; do not touch windows fully outside the range).
2. Set related inventory `status` to `AVAILABLE` when no remaining blocking windows for that inventory after the change (or always set AVAILABLE when admin force-frees — prefer: set inventory AVAILABLE).
3. Insert audit row: actor user id, location ids, from, to, reason, timestamp, snapshot of affected campaign/plan ids.
4. Invalidate location caches; optionally sync campaign lifecycle if plans become empty of holds (reuse existing sync helpers if cheap).

### Modal UX

1. User selects sites → Mark available.
2. If any selected is fully booked in window and user is admin → open **Release availability** modal:
   - Flight label
   - List of affected campaigns / plans (grouped by location)
   - Required reason textarea
   - Confirm / Cancel
3. If user is not admin and selection has fully booked → modal: cannot free; deselect or ask admin.
4. If none fully booked → simpler confirm modal (still modal, not `window.confirm`) then existing inventory AVAILABLE bulk (or same release endpoint with empty overlaps).

## Other govern actions

| Action | Modal | Notes |
|--------|-------|-------|
| Mark unavailable | Confirm modal | Existing inventory UNAVAILABLE update |
| Hide (archive) | Confirm modal | Existing archive + release soft holds |
| Unhide | Confirm modal | Existing unarchive |

Reuse one `ConfirmModal` / `GovernModal` component pattern (title, body, optional reason, primary danger/secondary).

## Catalog UX

### Default filter

`availFilter` initial state: `"BOOKABLE"` (Open).

### Top strip

- Row 1: search + flight date range
- Row 2: availability chips (Open default highlighted)
- Secondary: “Filters” opens drawer/popover for type, corridor, sort, city — reduce always-visible clutter

### Search

Widen API `q` matching to:

- `name` (existing)
- `skyarcSiteCode`
- `vendorMediaCode` / public-facing codes already on Location
- UUID `id` exact match when query looks like UUID

Document fields in OpenAPI briefly.

### List carousel

- Extend list serializer with `previewMedia: Array<{ id, url, contentType, kind, sortOrder }>` (cap ~6 assets: photos + videos).
- Card component: hover starts interval rotate; pause on leave; prev/next buttons; keyboard optional later.
- Fallback: single `coverImageUrl` if no assets.

## Data / audit

Prefer table `LocationAvailabilityRelease` (or append to existing audit/event log if one exists):

- `id`, `actorUserId`, `locationIds` (json), `from`, `to`, `reason`, `affectedJson`, `createdAt`

If a generic audit table already exists, use it instead of inventing a second system.

## File plan (indicative)

| Area | Likely touch |
|------|----------------|
| Web | `locations/page.tsx`, new confirm/release modals, `LocationCardMedia` carousel |
| API | locations routes bulk/preview/release; list query `q`; list DTO `previewMedia` |
| Shared/validation | zod bodies for preview/release |
| Tests | availability overlap release; gate admin-only; search fields |

## Testing

1. Flight A booked → badge Full; change flight B free → Open without DB rewrite of other windows.
2. Non-admin Mark available on Full → blocked with message.
3. Admin preview lists correct campaigns/plans; empty reason → cannot submit.
4. Admin release clears only overlapping windows; outside-window BOOKED remains.
5. Search by SKY- code and vendor code returns site.
6. Carousel advances on hover; arrows work; video poster/playback sane.
7. Hide/Unhide/Unavailable use modal, not `window.confirm`.

## Success criteria

- Default Open filter.
- Window-scoped roster + admin release with reason + impact list.
- No browser confirm dialogs on locations govern.
- Search hits Skyarc/vendor/public ids.
- Multi-media carousel on list cards.
