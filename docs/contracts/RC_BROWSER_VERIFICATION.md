# Local browser RC verification evidence

**Distinct from staging verification** (`STAGING_VERIFICATION.md`).


| Field                                            | Value                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Environment                                      | Local macOS; Atlas API `:3001` (tsx); web production `next start` on `:3000` |
| Commit under test (local recovery)               | `f7504ca` era; hardening `4677c26`                                           |
| Deployment candidate (after type+lockfile fixes) | `c4dd197e9a6b1eee413a42178e90ddc38beda7e5`                                   |
| Date                                             | 2026-10-02                                                                   |


## Local recovery summary


| Item                                | Result                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| EMFILE / `next dev`                 | Stopped watchers; used `next build` + `next start`                                |
| API `:3001`                         | Kept healthy                                                                      |
| Cursor browser → localhost          | Failed (`chrome-error://…`) — local UI matrix not completed in browser automation |
| Proxy `google/status` via local web | Prior: `configured: false`                                                        |
| Pulse local                         | Not running without `BRIDGE_SERVICE_TOKEN`                                        |




## Local flows checklist


| Flow                       | Desktop                      | Mobile     | Notes                      |
| -------------------------- | ---------------------------- | ---------- | -------------------------- |
| Login + unavailable Google | PENDING (browser) / API PASS | PENDING    |                            |
| Inventory / calendar       | PENDING                      | PENDING    |                            |
| Scenario comparison        | Prior PASS (dev)             | Prior PASS | Not re-run on prod web     |
| Proposal share / export    | Prior PASS (dev)             | Prior PASS |                            |
| Quote accept + booking     | Prior PASS (dev)             | Prior PASS |                            |
| Creative upload / approval | PARTIAL (empty-state)        | PARTIAL    | Does not complete workflow |
| Invoice + partial payment  | Prior PASS                   | Prior PASS |                            |
| Customer / cross-tenant    | API PASS                     | PENDING    |                            |
| Disabled integrations      | API PASS                     | PENDING    |                            |




## Preview browser pass (not local, not isolated staging)

Cursor browser **can** reach Vercel HTTPS. A partial matrix was executed on:

`https://skyarc-atlas-git-feat-phase2-4-boo-3f64d0-parthpallavs-projects.vercel.app` @ SHA `c4dd197`

**Backend:** production VPS API (not RC staging). See `STAGING_VERIFICATION.md` for labeled results.

## Result

**Local browser verification: PENDING** for automated desktop/mobile on localhost.

`Preview`**+prod-API browser: PARTIAL** — login, inventory, campaigns, plan share controls, responsive chrome verified; mutating and Pulse/MQTT flows not run.

Do not treat isolated staging RC sign-off as closed.