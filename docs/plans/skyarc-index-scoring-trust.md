# Skyarc Index — site-specific scoring & trust

## Intent
Every location has its **own** scoring scenario. Scores are not a shared network profile. A Ring Road unipole and a residential kiosk are configured separately because their sightlines, audience, and clutter differ.

## What you set (per site) — primary
On **Location detail → Site-specific scoring**:

| Field | Purpose |
|-------|---------|
| Scenario title | Short label for this face’s situation |
| Why this site scores this way | Site narrative shown to customers |
| Trust notes | Site-specific proof bullets |
| Factor scores (0–100) | Visibility, Awareness, Audience, Brand recall (+ supporting) |
| Evidence per factor | Data-backed notes for that site only |

Saving recomputes **this location’s** Skyarc Index only.

## What stays network-wide (secondary)
**Admin → Index weights** only holds default roll-up weights so sites remain comparable on one scale. It does **not** assign scores to sites.

## Customer view
- This site’s Index + factor bars  
- This site’s scenario + trust notes  
- Per-factor evidence for this site  

## Storage
- `Location.scoringJson` — scenario / trust notes for the site  
- `LocationAttribute` — factor score + evidence per site  
- `LocationScore` — computed Index snapshot for the site  
- `ScoringConfig.weightsJson` — optional network weight defaults only  
