# Campaign + media plan detail UI refresh

**Date:** 2026-09-30  
**Goal:** Cohesive with Locations / Network Map — presentation-first main stage, admin tools in a side rail (not a hidden Scoring tab with chip swaps).

## Media plan detail (primary)

- Sticky glass toolbar: back · title · status · Share / PDF / delete
- **Main column:** Site cards (photo-first, Index, why, demand) — always visible
- **Right rail (internal only):** Budget meter · mix · selected-site swaps as cards (not pill chips) · Add sites catalog
- Remove Presentation / Scoring toggle; scoring factors stay as expandable on each site card
- Clients: full-width presentation only (no rail)

## Campaign detail

- Wider layout, sticky compact header
- Summary as compact stat strip + chip rows (less nested cards)
- Media plans as clearer primary list with status pills
- Ready-for-requests banner stays glass, not heavy slab

Ship with Vercel push; VPS sync for repo consistency.
