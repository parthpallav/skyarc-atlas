# Mobile-friendly Atlas — design

## Problem

Campaign detail and media plan detail (and similar “workspace” screens) used a **fixed viewport height** (`100dvh` minus header and bottom nav) with **nested scroll regions**. That pattern works on desktop master–detail layouts but often fails on mobile Safari/Chrome: the outer frame does not scroll, inner panes do not receive a bounded height, and content feels “stuck.”

## Principles

1. **Mobile: one scroll surface** — the document (`<main>` + safe-area padding). Avoid nested `overflow-y-auto` below `md`.
2. **Desktop (md+): keep master–detail** — fixed workspace height and independent list/detail panes.
3. **Shared tokens** — `apps/web/src/lib/page-layout.ts` (`workspacePageRoot`, `workspaceBodyGrid`, `workspacePanel`, etc.).
4. **Touch targets** — minimum 44×44px for primary actions; bottom nav already fixed with safe-area.
5. **Map exception** — map page still needs a bounded map canvas on mobile; use flex `min-h` for map only, allow sheet/panel scroll separately (phase 2).

## Phased rollout

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Campaign + plan detail scroll fix | In progress (this change) |
| **1** | Lists: campaigns, locations, media-plans — responsive tables/cards, filter bars wrap | Todo |
| **2** | Forms (edit campaign, location wizard) — single column, sticky footers for primary CTA | Todo |
| **3** | Map — collapsible filters, full-width map height `min(55dvh, 420px)` + scrollable site drawer | Todo |
| **4** | Client/vendor request flows — parity with internal campaign UX | Todo |
| **5** | QA matrix: iOS Safari, Android Chrome, PWA standalone | Todo |

## Success criteria

- On a 390×844 viewport, campaign and plan pages scroll from header through generate pack, plan list, and brief toggle without trapping scroll.
- Tapping a plan site opens the bottom sheet; sheet content scrolls through Index, swap, and add sections.
- No horizontal overflow on primary app routes (except intentional table scroll).

## Out of scope (for now)

- Native apps, separate mobile-only IA, or hiding desktop sidebar patterns on tablet.
