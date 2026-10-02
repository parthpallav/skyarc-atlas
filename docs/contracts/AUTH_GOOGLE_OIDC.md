# Auth — Google OIDC + invitations

## Status

| Mode | Status |
|------|--------|
| Implemented | Google start/callback/link, ExternalIdentity by `sub`, invitations, logout revoke, disabled accounts |
| Integration verified | Unit helpers; no production Google credentials in CI |
| Provider live verified | **Pending** — configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and run credentialed test |
| Pending configuration | Live Google verification |

Email/password login remains supported. Google-only users have `passwordHash = null`.

## Endpoints

| Path | Notes |
|------|--------|
| `GET /auth/google/status` | Whether OIDC env is configured |
| `GET /auth/google/start` | Returns authorize URL; optional `inviteToken`, `mode=login\|link` |
| `GET /auth/google/callback` | Server-validated code exchange + ID token (JWKS) |
| `POST /auth/google/link` | Authenticated link of Google `sub` to existing account |
| `POST /auth/invitations` | Internal staff; join existing org or create CLIENT org when explicitly flagged |
| `POST /auth/logout` | Revokes refresh token(s) |

## Rules

- Associate identity by stable OpenID **subject**, not email alone
- Existing password account with same email → must authenticate then **link** (no silent merge)
- Self-serve Google sign-up → `CLIENT_VIEWER`, **no** automatic SaaS tenant
- Advertising customers are not auto-provisioned as tenants; use invitations
- Preserve existing RBAC / tenant checks

Migration: `0016_google_identity_invitations`
