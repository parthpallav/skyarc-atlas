# Program A: Plan-in-seconds (planner velocity)

**Date:** 2026-10-01  
**Status:** Implementing  
**Audience:** Skyarc planners / sales (Program B = clients after review gate)

## Goal

One primary **Generate plan** action on a campaign: flight-aware inventory, ≥60% Skyarc mix, premium packing, then PDF (Atlas) + Excel (Pulse). WhatsApp UI stays hidden until Program B.

## Scope

- Campaign generate UX + pre-flight checklist (budget, flight, cities, bookable count)
- Optimizer diagnostics: skipped sites (flight window, geography, no score)
- Hard geography gate when brief lists cities / geographicFocus / states
- Plan detail export group (PDF + Excel)
- Multi-city empty/partial messaging

## Non-goals

- Client approval, WhatsApp UI, PPT, Bridge AI, Orbit changes

## API

- `GET /campaigns/:id/media-plans/planning-preview` — bookable counts for campaign flight + geo
- `POST …/optimize` — extended `diagnostics` (skipped counts, city breakdown)

## Success

Planner generates mix-compliant plan in one action; full/held sites do not enter pack silently; PDF + Excel on plan detail.
