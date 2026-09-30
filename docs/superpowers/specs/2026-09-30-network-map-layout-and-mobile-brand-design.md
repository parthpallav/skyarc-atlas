# Network Map layout + mobile ATLAS brand (design)

**Date:** 2026-09-30  
**Status:** Approved for implementation planning  
**Surfaces:** `apps/web` Network Map (`map/page.tsx`), AppShell mobile header (`app-shell.tsx`)  
**Constraint:** Stay inside existing Skyarc/Atlas visual language (violet primary, glass overlays). No new map vendor; keep MapLibre.

## Goal

1. **Map:** Reclaim viewport space — map is the primary surface. Compact top chrome + collapsible side rail; branded translucent overlays; hoarding/inventory photos on pins and popups.
2. **Mobile shell:** Sticky top header always shows the **full ATLAS wordmark lockup** (not mark-only icon).

## Decisions locked

| Topic | Choice |
|--------|--------|
| Layout | **1 + 3 hybrid** — slim top toolbar + left side rail (desktop); rail → drawer/sheet on mobile |
| Corridor list | Lives in the side rail only (remove tall “Corridor coverage” card above the map) |
| Inventory counts | Inline in top toolbar (`30 sites · 28 open · …`), not a large “Visible inventory” block |
| Overlays | Frosted glass: `bg-white/80` + `border-primary/20` + `backdrop-blur`; light `primary/10` rail wash |
| Pins | Circular **cover thumbnail** + status-colored ring; selected = larger + violet glow |
| No photo | Branded monogram pin (site-code / name initials) — not a plain green dot |
| Popups | Keep existing hover/detail HTML cards; restyle to glass + larger photo |
| Mobile brand | Sticky header: **full** `ATLAS_LOGO_SRC` lockup (`SkyarcLogo` without `collapsed`) |
| Page header | Drop or collapse the large `PageHeader` description on map — title optional in toolbar or omit on map to save height |

## Out of scope

- Changing MapLibre / basemap provider  
- New photo upload pipeline (use existing `coverImageUrl` on map pins)  
- Desktop sidebar brand changes (already full lockup when expanded)  
- Competitive Easy Outdoor / Excel media-plan export (§D / §E backlog)

---

## A. Network Map layout

### Desktop structure

```
┌─────────────────────────────────────────────────────────────┐
│ [Network Map]  dates │ city │ status chips │ 30 · 28 open… │  ← ~44–52px toolbar
├──────────┬──────────────────────────────────────────────────┤
│ Rail     │                                                  │
│ search   │              MAP (flex-1, full remaining height) │
│ corridors│   search can stay map-overlay OR move into rail  │
│ legend   │   photo pins + glass popups                      │
│ Reset    │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

- **Toolbar:** single row, wrap only on narrow widths. Controls: flight dates, city select, availability chips, compact coverage summary.
- **Rail (~260–280px):** corridor list (clickable, same toggle behavior as today), pin legend, Reset. Collapsible via chevron; collapsed width ~40px icon strip or fully hidden with floating “Corridors” control.
- **Map height:** `calc(100dvh - shell chrome - toolbar)` — target **≥70–80%** of content viewport (vs today’s stacked cards + `100vh-18rem`).

### Mobile structure

- Same sticky **toolbar** (wrapped, denser).
- Rail becomes a **bottom sheet / slide-over** opened by “Corridors” (or menu) control on the map; does not permanently steal map height.
- Map fills remaining height above bottom nav; account for `pb` from `MobileBottomNav`.

### Brand / opacity treatment

- Map chrome (toolbar, rail, floating controls): glass + violet tint — not opaque white slabs.
- Status colors unchanged: emerald Open, sky Partial, amber Hold, rose Booked.
- Selected pin ring uses primary / violet glow consistent with existing highlight.

### Photo pins (data already available)

- `MapLocationPin.coverImageUrl` already returned for map list; popups already render images via `buildMapLocationCardHtml`.
- Marker element becomes a small circular `<img>` (or CSS background) with `border` colored by `pinColorForStatus`; fallback monogram when URL missing.
- Cluster behavior: none for this pass (current density ~30 sites is fine).

### Behavior preserved

- Soft city match, corridor road match, All/Reset clearing corridor + setting avail to ALL (or document if Reset stays as today).
- Hover popup + click detail popup with “View details →”.
- Fit bounds when filters change and nothing selected.

---

## B. Mobile sticky ATLAS lockup

### Problem

`app-shell.tsx` mobile header uses:

```tsx
<SkyarcLogo height={28} collapsed />
```

`collapsed` forces `ATLAS_MARK_SRC` (triangular mark only). Users see an icon, not the ATLAS product name.

### Fix

- Mobile sticky header: render **full lockup** — `<SkyarcLogo height={28–32} />` (no `collapsed`), left of actions, still sticky `top-0` with glass bar.
- Keep hamburger + full logo + optional PWA install on one row; logo must remain legible (min ~28px height, width from `ATLAS_LOGO_ASPECT`).
- Drawer header already uses full lockup (`onDark`) — leave as-is.
- Do **not** pass `collapsed` on mobile top bar.

### Acceptance

- On viewport `< md`, sticky top bar shows ATLAS wordmark (readable “ATLAS”), not mark-only.
- Logo remains sticky while scrolling map / inventory pages.

---

## Files (expected)

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/map/page.tsx` | Toolbar + rail layout; map height; photo markers |
| `apps/web/src/lib/map-popup.ts` (+ CSS if any) | Glass popup polish if needed |
| `apps/web/src/components/app-shell.tsx` | Mobile header: full ATLAS lockup |
| Optional: small CSS in `globals.css` for map marker / popup glass | Only if marker HTML needs shared styles |

---

## Acceptance criteria

1. Map page: no tall dual-card filter/stats stack; corridor list not above the map on desktop.
2. Map occupies majority of viewport height on desktop and mobile.
3. Pins show cover thumbnails with status rings when `coverImageUrl` exists; monogram otherwise.
4. Hover/click still show inventory photo + status.
5. Mobile sticky header shows full ATLAS logo lockup at all times.
6. Existing filter semantics (city, corridor, availability, Reset) unchanged unless noted in implementation plan.

## Implementation next step

After user confirms this spec file, write `docs/superpowers/plans/2026-09-30-network-map-layout-and-mobile-brand.md` and implement.
