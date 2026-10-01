# Mobile-friendly Atlas — design

## Problem

Campaign detail and media plan detail (and similar “workspace” screens) used a **fixed viewport height** (`100dvh` minus header and bottom nav) with **nested scroll regions**. That pattern works on desktop master–detail layouts but often fails on mobile Safari/Chrome: the outer frame does not scroll, inner panes do not receive a bounded height, and content feels “stuck.”

## Principles

1. **Mobile: app chrome** — fixed top bar + bottom tab bar; **scroll inside `<main>`** (not nested viewport locks). Avoid inner `overflow-y-auto` traps below `md` on workspace pages.
2. **No install prompts** — in-browser mobile UX only; PWA “Install App” UI removed.
3. **Desktop (md+): keep master–detail** — fixed workspace height and independent list/detail panes.
4. **Shared tokens** — `apps/web/src/lib/page-layout.ts` (`workspacePageRoot`, `workspaceBodyGrid`, `workspacePanel`, etc.).
5. **Touch targets** — minimum 44×44px; bottom tab bar with safe-area insets.

## Phased rollout

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Campaign + plan detail scroll fix | Done |
| **0b** | Remove Install App UI; app chrome shell | Done |
| **0c** | Map full-bleed + filter sheet on mobile | Done |
| **1** | Lists: campaigns, locations, media-plans — responsive tables/cards, filter bars wrap | Todo |
| **2** | Forms (edit campaign, location wizard) — single column, sticky footers for primary CTA | Todo |
| **4** | Client/vendor request flows — parity with internal campaign UX | Todo |
| **5** | QA matrix: iOS Safari, Android Chrome, PWA standalone | Todo |

## Success criteria

- On a 390×844 viewport, campaign and plan pages scroll from header through generate pack, plan list, and brief toggle without trapping scroll.
- Tapping a plan site opens the bottom sheet; sheet content scrolls through Index, swap, and add sections.
- No horizontal overflow on primary app routes (except intentional table scroll).

## Out of scope (for now)

- Native apps, separate mobile-only IA, or hiding desktop sidebar patterns on tablet.
