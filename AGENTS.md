# Atlas development contract

Read `docs/releases/ATLAS_LEAN_LAUNCH_PLAN.md` before changing product behaviour.
Use `docs/releases/PRE_MERGE_REVIEW_PROMPT.md` for every pre-merge review.

- Preserve the main baseline recorded in `docs/LEAN_LAUNCH_AUDIT.md`. Refactor existing capabilities; do not silently remove them.
- Record discovered product gaps in `docs/audit/ATLAS_JOURNEY_GAP_DOC.md`, retaining existing IDs. Add evidence before marking a gap DONE. This user-authorized lean release programme permits the documentation and review automation introduced here; it does not authorise unrelated product changes.
- Use short feature/fix branches targeting the active release branch. Keep main changes and release fixes reconciled.
- Use the group IDs in `config/feature-groups.json`. This is a design registry until runtime enforcement is implemented and verified. Do not claim its profile selections currently change the app.
- Feature availability never replaces API authentication, role permissions, ownership checks or customer-safe serialization.
- Do not gate mandatory authorization, pricing integrity, availability integrity, audit writes or tenant boundaries.
- Hide disabled features across navigation, routes, API mutations, exports and jobs according to their documented off behaviour. Preserve existing records and necessary lifecycle cleanup.
- Keep manual planning available when AI, traffic or messaging providers fail. Never pass off simulated data or congestion as measured audience counts.
- Update the feature registry, plan and integration contracts when their behaviour changes.
- Add a changed `.github/feature-reviews/<change-name>.json` record using the plan's example. Run `node scripts/check-feature-review.mjs` and relevant application checks.
- Review the exact final PR head with the prompt. A new code push invalidates earlier review evidence. The contract validator checks completeness, not reviewer honesty or functional correctness.
- Never claim GitHub enforcement or deployment is live without remote evidence. Do not deploy database changes to a shared main environment for release testing.
