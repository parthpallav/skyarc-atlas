# Location detail declutter + tabbed edit (Slice 2)

**Date:** 2026-10-01  
**Status:** Approved for planning  
**Scope:** Web location detail + edit UX only (no catalog availability, campaigns, or media-plan mix changes)

## Problem

`/locations/[id]` mixes view and edit, duplicates Skyarc Index (overview chip, Index tab with score in the label, “Edit Index score”, and `/edit`), and scatters edit surfaces. Users want one Edit entry, tabbed editing, and no duplicate display/edit of the same fields.

## Goals

1. Detail page is **view-first**: no inline editors for the same data shown as read-only.
2. **One primary Edit** CTA when the user may edit; opens a single edit workspace.
3. Edit workspace uses **tabs**, ordered **Photos → Site → …**, each tab owns a clear slice of data.
4. **Role gates** preserved and tightened: vendor rates never leak to clients or network vendors; **Orbit UI hidden from vendors** (APIs remain for MQTT readiness).
5. Tab labels never embed live scores (no `Index 72`).

## Non-goals (later slices)

- Booked → Available admin force-free, confirmation modals for destroy, catalog search/filter redesign, carousel on list cards, campaigns brief panel, Skyarc mix %, multi-city map data.

## Architecture

```
/locations/[id]          → LocationDetailPage (read-only tabs + one Edit CTA)
/locations/[id]/edit     → LocationEditPage (tabbed workspace; ?tab= deep-link)
```

Shared gate helpers (web): derive booleans once from `usePermissions` + location ownership + platform `showVendorDetails` — reuse on detail and edit so gates cannot drift.

## Detail page (view)

### Tabs (role-gated)

| Tab id | Label | Who sees it |
|--------|-------|-------------|
| `overview` | Overview | Everyone who can open the location |
| `availability` | Availability | Everyone (flight-aware status / slots — display only; computation truth may improve in Slice 1) |
| `rates` | Rates | See Pricing visibility below (read-only panels) |
| `faces` | Faces | Owned site for vendor/internal; not clients |
| `orbit` | Orbit | **Internal/admin only** when `NEXT_PUBLIC_ORBIT_UI`; **never vendors or clients** |
| `admin` | Admin | Admin only |

**Removed:** dedicated `index` tab on detail.

### Overview content

- Gallery (existing `ImageGallery`; list-card carousel is Slice 1).
- Identity (name, Skyarc site code, address/road, format).
- Flight window + live status badge (read-only).
- **Skyarc Index once:** metric chip + optional read-only intel summary when score exists or viewer is internal.
- No `LocationScoreEditor` on detail.
- No second “Edit Index score” button beside Edit.
- Optional deep link: “Edit Index” text control → `/locations/[id]/edit?tab=index` **only** if `canEditScoreInputs`.

### Primary actions

- **Edit** (single primary when `canEdit`) → `/locations/[id]/edit` (default tab `photos`).
- Campaign/request actions remain separate secondary CTAs (not a second edit path).
- Delete/hide remain admin/danger paths; prefer confirmation modal when Slice 1 lands — for Slice 2, keep existing confirm behavior on Admin/Danger only if already present; do not add new alert-based flows.

## Edit page (workspace)

### Tab order (fixed)

1. **Photos** — default landing tab (`?tab=photos` or bare `/edit`).
2. **Site** — name, geo, market, mounting (inventory wizard site-only / existing site fields).
3. **Faces** — screens + inventory faces (existing panel/wizard face flows).
4. **Index** — manual score editor + read-only summary for context (internal only).
5. **Pricing** — vendor commercial and/or Skyarc client pricing panels, each gated.
6. **Orbit** — device/status wiring UI (**internal/admin + Orbit flag only**).
7. **Danger** — hide / delete (admin or existing owner hide rules); no silent destroy.

Unknown `?tab=` falls back to `photos`. If the requested tab is not allowed for the role, fall back to the first allowed tab (Photos if allowed, else first visible).

### Role gates (authoritative for Slice 2)

| Capability | Client | Vendor (own) | Vendor (network) | Internal | Admin |
|------------|--------|--------------|------------------|----------|-------|
| Open Edit page | no | yes | no | yes (owned or internal access) | yes |
| Photos / Site / Faces tabs | — | yes | — | yes | yes |
| Index tab | — | no | — | yes | yes |
| Pricing: **vendor rates** panel | **never** | own inventory rates only | **never** | only if `showVendorDetails` | same |
| Pricing: **Skyarc client pricing** panel | never on edit | **never** | **never** | if `canViewClientPricing` | yes |
| Orbit tab | **never** | **never** | **never** | if Orbit UI flag | if Orbit UI flag |
| Danger tab | — | hide own if already allowed today | — | — | hide + delete |

Clients who opened detail keep request/campaign CTAs only; they must not see Edit or vendor rate amounts in Rates tab beyond existing API stripping (detail Rates tab for clients: Skyarc/client-facing numbers only if `canViewClientPricing` / API already allows — **never vendor cost**).

### Pricing tab structure

Single **Pricing** tab; internally two optional panels:

- `LocationCommercialPanel` — vendor rates — mount only when `showVendorCommercial`.
- `LocationSkyarcPricingPanel` — mount only when `canEditSkyarcPricing` (edit) or view equivalent on detail.

If neither panel mounts, hide the Pricing tab entirely.

## Component / file plan

| Change | Intent |
|--------|--------|
| `apps/web/src/app/(app)/locations/[id]/page.tsx` | Drop Index tab + inline score editor; add Availability tab shell if missing; Orbit gate = internal only; single Edit CTA; Index chip only on Overview |
| `apps/web/src/app/(app)/locations/[id]/edit/page.tsx` | Replace long stacked sections with tab chrome; order Photos → Site → …; `?tab=` support; role-gated tab list |
| Optional `location-edit-tabs.tsx` / `location-role-gates.ts` | Shared tab config + gate helpers to avoid detail/edit drift |
| `LocationScoreEditor` | Used **only** on edit Index tab |
| `LocationOrbitTab` | Detail + edit only when internal/admin + flag; remove vendor paths |

No API contract changes required for Slice 2. Do not change Orbit Cloud service auth for this slice.

## Data flow

- Detail and edit continue to use existing React Query keys (`location`, `location-assets`, `location-score`, screens/inventories).
- After successful edits, invalidate the same keys so detail stays fresh on back navigation.

## Error handling

- Unauthorized edit URL → redirect to detail (existing pattern).
- Forbidden tab in query string → silent fallback to first allowed tab.
- Mutation errors surface inline on the active edit tab (existing toast/inline patterns).

## Testing

1. **Internal:** detail has no Index tab; Index chip on Overview; Edit opens on Photos; Site second; Index/Pricing/Orbit visible per flags; vendor rates panel only with `showVendorDetails`.
2. **Vendor own:** Edit Photos → Site → Faces → Pricing (own rates only); **no** Index, **no** Orbit; no Skyarc pricing panel.
3. **Vendor network:** no Edit; no vendor rates.
4. **Client:** no Edit; no vendor rates; no Orbit.
5. **Admin:** Danger + Orbit (flag) + Index; deep link `?tab=index` works.
6. Regression: score editor unreachable from detail DOM (no duplicate controls).

## Success criteria

- One Edit entry from detail; no parallel “Edit Index” primary beside it.
- No score embedded in tab labels.
- Photos is the first edit tab; Site is second.
- Vendors never see Orbit UI; clients never see vendor rates.
- Index editable only under Edit → Index (internal/admin).
