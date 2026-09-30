# Network Map layout + mobile ATLAS brand — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Compact map chrome (toolbar + side rail), photo pins with branded glass overlays, and mobile sticky full ATLAS lockup.

**Architecture:** Restructure `map/page.tsx` into toolbar + collapsible rail + full-height MapLibre canvas; marker DOM uses cover thumbnails; `app-shell.tsx` drops `collapsed` on mobile header logo.

**Tech Stack:** Next.js App Router, MapLibre GL, Tailwind, existing `map-popup.ts` / `SkyarcLogo`.

## Global Constraints

- Keep MapLibre; use existing `coverImageUrl`
- Preserve city / corridor / availability / Reset semantics
- Glass: `bg-white/80`, `border-primary/20`, `backdrop-blur`; rail wash `primary/10`
- Mobile header: full ATLAS lockup (never mark-only)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/src/components/app-shell.tsx` | Mobile sticky full logo |
| `apps/web/src/app/(app)/map/page.tsx` | Toolbar, rail, map height, photo markers |
| `apps/web/src/app/globals.css` | Marker + glass popup polish |
| `apps/web/src/lib/map-popup.ts` | Optional helper for monogram initials |

---

### Task 1: Mobile ATLAS lockup

- [ ] In `app-shell.tsx`, change `<SkyarcLogo height={28} collapsed />` → `<SkyarcLogo height={30} />` (no `collapsed`)
- [ ] Verify sticky header still one row with hamburger + logo + PWA

### Task 2: Map toolbar + rail layout

- [ ] Remove `PageHeader` and tall dual-card filter/stats block
- [ ] Add glass toolbar: title, dates, city, status chips, inline `N sites · open · partial · hold · booked`
- [ ] Add left rail (desktop): search, corridors, legend, Reset; collapse toggle
- [ ] Mobile: rail as overlay panel toggled by “Corridors” button; map full remaining height
- [ ] Map container: `h-[calc(100dvh-…)]` targeting majority viewport (account for mobile header + bottom nav + toolbar)

### Task 3: Photo / monogram pins + glass

- [ ] Marker element: circular cover image + status border; selected scale + violet ring
- [ ] Fallback: initials monogram on violet/status fill
- [ ] Polish popup CSS toward glass if needed

### Task 4: Verify

- [ ] Typecheck / lint map + app-shell
- [ ] Manual: filters still work; Reset clears; mobile logo readable

---

**Spec:** `docs/superpowers/specs/2026-09-30-network-map-layout-and-mobile-brand-design.md`
