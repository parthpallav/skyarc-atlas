# Location taxonomy, production specs, multi-market geo

## Locked decisions (2026-09-25)

1. **Geo filters:** **State + City** (plus corridor multi-select). District is stored on Location for data only — not a user filter.
2. **Specs UX:** Multi-step **New / Modify Location** wizard: site → class/subtype → type-specific specs.
3. **Digital production fields** (Classic Hub LED PDF): physical size, resolution, static formats (jpg/png, RGB, DPI, max MB), motion (mp4/mov H.264, fps, bitrate), loop/slot timeline, submission lead time.

## Status

| Phase | Status |
|-------|--------|
| Overview densify (score + campaign proof) | Done |
| Shared taxonomy + production defaults | Done (`packages/shared/src/inventory-taxonomy.ts`, `markets.ts`) |
| Multi-step New Location wizard | Done (`location-inventory-wizard.tsx` → `/locations/new`) |
| Location `city` / `district` / `state` + API filters + geo-facets | Done (DB columns applied + backfilled) |
| List filters (city / district / state / corridor) | Done |
| Soften Rajkot hardcoding (map, site codes, fallbacks) | Done (dashboard + importer + campaign UI market-aware) |
| Network Map: flight availability pins + geo coverage | Done (`/map` — dates, Open/Partial/Hold/Booked, city/corridor, coverage summary) |
| Edit Location multi-step wizard parity | Done (`/locations/[id]/edit` → `LocationInventoryWizard` + site-only save) |
| Seed writes `city` / `district` / `state` | Done (`seed-full`, `seed-rajkot-hoardings`) |
| Campaign brief structured cities / districts / states + goal-fit | Done — **State + City only** (+ corridors); district dropped from UX |

## Taxonomy

- Classes: **Digital | Static | Conceptual**
- Digital subtypes: **LED | Kiosk**
- Static: lighting (backlit / frontlit / non-lit)
- Conceptual: notes + optional dims

## How to verify

1. Restart API after pull (Prisma client regenerated).
2. **Add** location → wizard: pick city → class/subtype → digital specs → create.
3. Locations list → **More** → multi-select City / District / State / Corridors.
4. Open Faces on a wizard-created digital site → production line (resolution / formats / max MB).
