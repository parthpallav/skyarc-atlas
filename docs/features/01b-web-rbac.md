# Feature 1b: Web RBAC & Vendor Portal

> **Master plan:** [`docs/PRODUCT_PLAN.md`](../PRODUCT_PLAN.md)

**Branch:** `feature/organizations-rbac` (same branch as Feature 1 API)  
**Depends on:** Feature 1 API (organizations, JWT `organizationId`, location scoping)  
**Estimated effort:** 1–2 focused days (web only; mobile deferred)

---

## Goal

Apply the same RBAC rules from the API to the **web app** so that:

- Internal users (Admin, Planner, Sales, Viewer) see the full Skyarc workspace
- Vendor users see a **scoped vendor portal** (their locations only)
- UI hides routes and actions the API would reject anyway
- API remains the security boundary — UI is UX, not authorization

---

## Principle

```
UI hides  →  better experience
API enforces  →  actual security
```

Never skip API checks. Frontend RBAC prevents confusion and failed requests.

---

## Prerequisites (do first thing tomorrow)

```bash
git checkout feature/organizations-rbac
pnpm install
pnpm db:generate

# Use local Postgres (not Supabase pooler)
export DATABASE_URL='postgresql://postgres@localhost:5432/postgres'
pnpm db:push && pnpm db:seed

# Terminal 1 — API
pnpm --filter @skyarc/api dev

# Terminal 2 — Web
pnpm --filter @skyarc/web dev
```

**Smoke test before coding:**

| Account | Password | Expected |
|---------|----------|----------|
| admin@skyarc.in | ChangeMe123! | Login works, sees all locations via API |
| vendor@skyarc.in | ChangeMe123! | Login works, sees only vendor org locations |

---

## Architecture

### New shared package layer

Extract permission logic from `services/api/src/lib/rbac.ts` + `org-scope.ts` into **`packages/shared/src/rbac.ts`** so web, mobile, and API share one source of truth.

```
packages/shared/src/rbac.ts     ← isInternalUser, isVendorUser, canAccessCampaigns, isReadOnly, …
services/api/src/lib/rbac.ts    ← re-export or thin wrapper (avoid drift)
apps/web/src/lib/permissions.ts ← web-specific: nav items, route access, landing paths
```

### Auth state

Replace ad-hoc `getStoredUser()` reads with a small **AuthProvider**:

```
apps/web/src/components/auth-provider.tsx   ← React context
apps/web/src/hooks/use-auth.ts              ← { user, role, organizationId, permissions }
```

Extend `StoredUser` in `apps/web/src/lib/api.ts`:

```ts
interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;  // NEW — from login response + JWT
}
```

Update `storeUser()` and JWT fallback decode to include `organizationId`.

Wrap app in `apps/web/src/components/providers.tsx` → add `<AuthProvider>`.

---

## Portal matrix (who sees what)

| Surface | ADMIN | MEDIA_PLANNER | SALES | VIEWER | VENDOR_ADMIN | VENDOR_OPS | CLIENT_VIEWER |
|---------|:-----:|:-------------:|:-----:|:------:|:------------:|:----------:|:-------------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ❌ → redirect | ❌ | ❌ |
| Locations (list/detail) | ✅ all | ✅ all | ✅ all | ✅ read | ✅ own org | ✅ read own | ❌ |
| Location edit/delete | ✅ | ✅ | ✅ | ❌ | ✅ own | ❌ | ❌ |
| Photo/video upload | ✅ | ✅ | ✅ | ❌ | ✅ own | ❌ | ❌ |
| Campaigns | ✅ | ✅ | ✅ | ✅ read | ❌ | ❌ | ❌ |
| Map | ✅ all pins | ✅ | ✅ | ✅ | ✅ own pins | ✅ read | ❌ |
| Admin → Organizations | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Org profile (`/organization`) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ read | ❌ |

**Landing after login:**

| Role | Redirect to |
|------|-------------|
| Internal | `/dashboard` |
| Vendor | `/locations` (or `/organization` if zero locations) |
| Client viewer | `/campaigns` (future — stub forbidden page for now) |

---

## Implementation phases

### Phase 1 — Foundation (~2–3 hrs)

**Files to create/modify:**

| File | Change |
|------|--------|
| `packages/shared/src/rbac.ts` | **NEW** — shared permission helpers |
| `packages/shared/src/index.ts` | Export rbac |
| `services/api/src/lib/rbac.ts` | Import from `@skyarc/shared` (thin re-export) |
| `services/api/src/lib/org-scope.ts` | Import `isInternalUser`, `isVendorUser` from shared |
| `packages/api-client/src/index.ts` | Add `organizationId` to login user type; add `getOrganizationMe()` |
| `apps/web/src/lib/api.ts` | Extend `StoredUser`, persist `organizationId` |
| `apps/web/src/components/auth-provider.tsx` | **NEW** |
| `apps/web/src/hooks/use-auth.ts` | **NEW** |
| `apps/web/src/hooks/use-permissions.ts` | **NEW** — `can(path)`, `canEditLocation`, etc. |
| `apps/web/src/components/providers.tsx` | Wrap with AuthProvider |

**Shared helpers to implement:**

```ts
isInternalUser(role)
isVendorUser(role)
isClientUser(role)
isReadOnly(role)           // VIEWER, VENDOR_OPS, CLIENT_VIEWER
canAccessCampaigns(role)   // internal only
canAccessAdmin(role)       // ADMIN only
canWriteLocations(role)    // not VIEWER / VENDOR_OPS / CLIENT_VIEWER
```

**Tests:** `packages/shared/src/rbac.test.ts` — mirror API org-scope tests.

---

### Phase 2 — Navigation & route guards (~2–3 hrs)

**Files:**

| File | Change |
|------|--------|
| `apps/web/src/lib/navigation.ts` | **NEW** — `getNavLinks(user)` returns role-filtered links |
| `apps/web/src/components/sidebar.tsx` | Use `getNavLinks()`, show org name for vendors |
| `apps/web/src/components/route-guard.tsx` | **NEW** — client component, redirects if `!canAccess(path)` |
| `apps/web/src/app/(app)/layout.tsx` | Wrap children in `<RouteGuard>` |
| `apps/web/src/app/login/page.tsx` | Role-based redirect after login |

**Nav structure:**

```ts
// Internal
[{ href: "/dashboard", … }, { href: "/locations", … }, { href: "/campaigns", … }, { href: "/map", … }]

// Vendor
[{ href: "/locations", label: "My Inventory", … }, { href: "/organization", label: "My Organization", … }, { href: "/map", … }]

// Admin extra (in sidebar footer or separate section)
[{ href: "/admin/organizations", label: "Vendors", … }]
```

**Route guard rules:**

```
/campaigns/*     → internal roles only
/admin/*         → ADMIN only
/locations/*/edit → canWriteLocations(role)
/organization    → vendor roles + ADMIN
```

On forbidden: redirect to user's default landing + toast "You don't have access to this page."

---

### Phase 3 — Action-level UI (~2 hrs)

Hide buttons the user cannot use. API still enforces if bypassed.

| File | Hide when |
|------|-----------|
| `apps/web/src/app/(app)/locations/[id]/page.tsx` | Edit, Delete if `!canWriteLocation(user, location)` |
| `apps/web/src/app/(app)/locations/[id]/edit/page.tsx` | Entire page guarded |
| `apps/web/src/components/location-photo-editor.tsx` | Upload UI if read-only |
| `apps/web/src/app/(app)/locations/page.tsx` | "Add location" if vendor can't create |
| `apps/web/src/app/(app)/campaigns/**` | Create/delete if not internal write role |

**Pattern:**

```tsx
const { canEditLocation } = usePermissions();
{canEditLocation && <Link href={`/locations/${id}/edit`}>Edit</Link>}
```

For location detail, `canEditLocation` needs the location record (check `organizationId` + role via shared helper).

---

### Phase 4 — Vendor org page (~2 hrs)

**New page:** `apps/web/src/app/(app)/organization/page.tsx`

Shows data from `GET /api/v1/organizations/me`:

- Org name, type, status
- Member count, location count
- Read-only for VENDOR_OPS

**Admin org management (stretch / day 2):**

| File | Purpose |
|------|---------|
| `apps/web/src/app/(app)/admin/organizations/page.tsx` | List vendors |
| `apps/web/src/app/(app)/admin/organizations/new/page.tsx` | Create vendor org + admin user |

Uses existing admin APIs from Feature 1.

---

### Phase 5 — Polish (~1 hr)

- Sidebar: show org name under user ("Demo Media Owner")
- Login page: neutral copy (not "Rajkot internal only")
- 403-friendly empty states on location list for vendor with 0 sites
- Handle API 403 gracefully (toast + redirect)

---

## File tree (new/changed)

```
packages/shared/src/
  rbac.ts                          NEW
  rbac.test.ts                     NEW

apps/web/src/
  components/
    auth-provider.tsx              NEW
    route-guard.tsx                NEW
    sidebar.tsx                    MODIFIED
    providers.tsx                  MODIFIED
  hooks/
    use-auth.ts                    NEW
    use-permissions.ts             NEW
  lib/
    api.ts                         MODIFIED (organizationId)
    navigation.ts                  NEW
    permissions.ts                 NEW
  app/
    login/page.tsx                 MODIFIED (role redirect)
    (app)/layout.tsx               MODIFIED (RouteGuard)
    (app)/organization/page.tsx    NEW
    (app)/admin/organizations/     NEW (stretch)
    (app)/locations/[id]/page.tsx  MODIFIED (hide actions)
    (app)/locations/[id]/edit/     MODIFIED (guard)
```

---

## Testing checklist (definition of done)

### Manual — login as admin@skyarc.in

- [ ] Lands on `/dashboard`
- [ ] Sees Dashboard, Locations, Campaigns, Map in sidebar
- [ ] Locations list shows all orgs' sites
- [ ] Can open, edit, delete any location
- [ ] Can access `/campaigns`
- [ ] Can access `/admin/organizations` (if built)

### Manual — login as vendor@skyarc.in

- [ ] Lands on `/locations` (not dashboard)
- [ ] Sidebar shows "My Inventory", "My Organization", Map — **no** Campaigns, **no** Dashboard
- [ ] Locations list shows **only** vendor org sites (API-scoped)
- [ ] Can edit own locations; Edit/Delete hidden on others (or 403 if URL typed)
- [ ] `/campaigns` redirects away
- [ ] `/organization` shows "Demo Media Owner"

### Manual — edge cases

- [ ] Logged out → any `(app)` route redirects to `/login`
- [ ] Expired token → refresh or redirect to login
- [ ] Direct URL `/locations/{skyarc-id}` as vendor → 403 page or redirect

### Automated

- [ ] `packages/shared` rbac unit tests pass
- [ ] `pnpm --filter @skyarc/api test` still passes (shared import refactor)
- [ ] `pnpm --filter @skyarc/web build` succeeds

---

## Out of scope (tomorrow)

- Mobile app RBAC (same shared package later — Feature 1c)
- Client viewer portal / shared plan links (Feature 3+)
- VPS production deploy (separate step after local sign-off)
- Date-based availability (Feature 2 — after 1b is done)

---

## Suggested day plan

| Block | Task | Done when |
|-------|------|-----------|
| **Morning 1** | Prerequisites + Phase 1 (shared rbac, auth context) | Unit tests green, `organizationId` in stored user |
| **Morning 2** | Phase 2 (nav + route guards) | Vendor login shows different sidebar; `/campaigns` blocked |
| **Afternoon 1** | Phase 3 (hide edit/delete/upload) | Vendor can't see Edit on others' sites |
| **Afternoon 2** | Phase 4 (org page) + Phase 5 polish | `/organization` works; manual checklist complete |
| **Stretch** | Admin organizations UI | Admin can list/create vendors from web |

---

## After sign-off

1. Run full manual checklist above
2. Merge `feature/organizations-rbac` → `main`
3. Deploy API + web to VPS/Vercel
4. `db push` + `db seed` on VPS Postgres
5. Re-run admin vs vendor smoke tests on production
6. Then start **Feature 2: Date-based availability**

---

## Reference

- Feature 1 API doc: `docs/features/01-organizations-rbac.md`
- API rbac source: `services/api/src/lib/rbac.ts`, `org-scope.ts`
- Web auth today: `apps/web/src/lib/api.ts`, `sidebar.tsx`
- Verified locally: admin sees 5 locations, vendor sees 3, cross-access 403
