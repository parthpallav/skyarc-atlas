# Feature 1: Organizations & RBAC

> **Master plan:** [`docs/PRODUCT_PLAN.md`](../PRODUCT_PLAN.md)

Branch: `feature/organizations-rbac`

## What this adds

- **Organization** model (INTERNAL / VENDOR / CLIENT) with ACTIVE / SUSPENDED / BLACKLISTED
- New roles: `VENDOR_ADMIN`, `VENDOR_OPS`, `CLIENT_VIEWER`
- Users linked to an organization; locations scoped to vendor org
- JWT includes `organizationId`
- Vendor users only see/edit their org's locations
- Skyarc internal roles (Admin, Planner, Sales, Viewer) see all locations
- Admin APIs: list/create vendors, suspend/blacklist org
- Block login for suspended/blacklisted vendor orgs

## Local setup

```bash
git checkout feature/organizations-rbac
pnpm install
pnpm db:generate
pnpm db:push          # applies schema to local Postgres
pnpm db:seed          # creates Skyarc org + demo vendor user
pnpm --filter @skyarc/api dev
```

## Test accounts (after seed)

| Email | Password | Role |
|-------|----------|------|
| admin@skyarc.in | ChangeMe123! | ADMIN (all locations) |
| vendor@skyarc.in | ChangeMe123! | VENDOR_ADMIN (own org only) |

## Run tests

```bash
pnpm --filter @skyarc/api test
```

## Manual API checks

```bash
# Admin — all locations
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/api/v1/locations

# Vendor — only their org's locations
curl -H "Authorization: Bearer $VENDOR_TOKEN" http://localhost:3001/api/v1/locations

# Vendor org info
curl -H "Authorization: Bearer $VENDOR_TOKEN" http://localhost:3001/api/v1/organizations/me
```

## Next feature (after this is tested)

Feature 2: Date-based availability calendar
