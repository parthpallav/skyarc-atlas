# Location Detail Declutter + Tabbed Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make location detail view-only with one Edit CTA, and rebuild `/locations/[id]/edit` as a Photos-first tabbed workspace with strict role gates (no vendor Orbit UI; no vendor-rate leaks).

**Architecture:** Pure web UX. Shared `resolveLocationUiGates()` drives detail + edit tab lists. Detail drops Index tab and inline score editor; edit hosts Photos → Site → Faces → Index → Pricing → Orbit → Danger.

**Tech Stack:** Next.js App Router, React Query, Vitest (`apps/web`), existing location panels/editors.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-01-location-detail-edit-declutter-design.md`
- Edit tab order fixed: Photos, Site, Faces, Index, Pricing, Orbit, Danger
- Orbit UI: internal/admin + `NEXT_PUBLIC_ORBIT_UI` only — **never vendors/clients**
- Vendor rates: never clients or network vendors; own vendor only; internal only if `showVendorDetails`
- No score in tab labels; no API/Orbit Cloud auth changes in this slice

---

### Task 1: Shared location UI gates + unit tests

**Files:**
- Create: `apps/web/src/lib/location-ui-gates.ts`
- Create: `apps/web/src/lib/location-ui-gates.test.ts`

**Interfaces:**
- Produces: `resolveLocationUiGates(input) → LocationUiGates`
- Produces: `EDIT_TAB_ORDER`, `resolveEditTab(requested, gates)`, `DetailTabId`, `EditTabId`

- [ ] **Step 1: Write failing tests** for vendor never sees Orbit; client never sees vendor commercial; Photos first allowed tab; forbidden `?tab=orbit` for vendor falls back to photos

- [ ] **Step 2: Implement `location-ui-gates.ts`**

- [ ] **Step 3: Run** `pnpm --filter @skyarc/web test -- location-ui-gates`

- [ ] **Step 4: Commit** `feat(web): add shared location UI role gates`

---

### Task 2: Tabbed edit page

**Files:**
- Modify: `apps/web/src/app/(app)/locations/[id]/edit/page.tsx`
- Optionally create: `apps/web/src/components/location-edit-workspace.tsx` if page gets too large

**Interfaces:**
- Consumes: `resolveLocationUiGates`, `resolveEditTab`, `EDIT_TAB_ORDER`
- Uses existing: `LocationPhotoEditor`, `LocationInventoryWizard` (site-only), `LocationInventoryPanel`, `LocationScoreEditor`, `LocationScoreIntel`, `LocationCommercialPanel`, `LocationSkyarcPricingPanel`, `LocationOrbitTab`

- [ ] **Step 1: Rebuild edit page** with tab chrome; default `photos`; `useSearchParams` for `?tab=`
- [ ] **Step 2: Wire panels per tab**; Site tab = wizard site-only (no face create required); Faces = inventory panel; Pricing panels gated; Orbit internal-only; Danger = delete (move from detail primary for editors who had delete on detail — keep delete on Danger for canEdit)
- [ ] **Step 3: Typecheck** `pnpm --filter @skyarc/web typecheck`
- [ ] **Step 4: Commit** `feat(web): tabbed location edit Photos-first`

---

### Task 3: Declutter detail page

**Files:**
- Modify: `apps/web/src/app/(app)/locations/[id]/page.tsx`

- [ ] **Step 1: Use shared gates**; remove `index` from detail tabs; Orbit only when `gates.showOrbit`
- [ ] **Step 2: Add `availability` tab** moving slot/booking blocks from hero if needed (or keep slots on hero + availability tab summarizing live status — prefer move detailed SlotIndicators + booking copy to Availability tab; keep compact badge on hero)
- [ ] **Step 3: Remove** `LocationScoreEditor`, Index tab section, “Edit Index score” button, overview “Open Index tab…” button; replace with optional link to `/edit?tab=index` when `canEditScoreInputs`
- [ ] **Step 4: Rates tab read-only** (`canWrite={false}` on commercial/skyarc panels) — editing only on edit Pricing tab
- [ ] **Step 5: Faces tab read-only** (`canWrite={false}`) when shown on detail
- [ ] **Step 6: Move Delete** off primary action row into Admin tab (admins) / remove from vendor detail primary (Danger on edit instead)
- [ ] **Step 7: Typecheck + commit** `refactor(web): view-only location detail with one Edit CTA`

---

### Task 4: Verify gates against Orbit flag helper

**Files:**
- Modify if needed: `apps/web/src/lib/feature-flags.ts` usage sites
- Modify: `apps/web/src/components/location-orbit-tab.tsx` only if it assumes vendor write

- [ ] Confirm `showOrbitUi() && isInternal` (not vendor) at every Orbit mount
- [ ] Commit if any fix: `fix(web): hide Orbit UI from vendors`

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Detail view-only / one Edit | 3 |
| No Index tab / no score in labels | 3 |
| Photos → Site order | 2 |
| Role gates / vendor rates | 1, 2, 3 |
| Orbit internal-only | 1, 2, 3, 4 |
| `?tab=` deep link | 2 |
| Index only on edit | 2, 3 |
