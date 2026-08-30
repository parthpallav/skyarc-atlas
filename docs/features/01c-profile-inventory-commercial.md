# Feature 1c → 2 → 6: Profile, Vendor Inventory & Commercial Config

> **Note (2026-08-28):** All product planning is consolidated in [`docs/PRODUCT_PLAN.md`](../PRODUCT_PLAN.md). This doc is historical implementation notes for Feature 1c only.

**Branch:** continue on `feature/organizations-rbac` or split after 1b merge  
**Depends on:** Feature 1 (orgs/RBAC), Feature 1b (web vendor portal)

---

## What you're asking for

1. **Every user edits their own profile** (name, password — not role/email without admin)
2. **Vendors manage additional inventory** (screens, products, rates on their locations)
3. **Skyarc margin % is configurable** (platform default + per-vendor override)
4. **Commercial terms flow into planning** (internal sees margin math; client sees ticks later)

None of item 2–4 exists in the UI yet. Item 1 is partially blocked in the API.

---

## Current gaps (today)

| Area | Status |
|------|--------|
| `GET /users/:id` | ✅ User can read **own** record |
| `PATCH /users/:id` | ❌ **Admin only** — vendor cannot change name/password |
| `/organization` page | Read-only org summary — no edit, no commercial fields |
| `Organization` model | `name`, `type`, `status` only — **no margin %** |
| `Inventory` + `RateCard` | Schema exists — **no vendor UI, no API routes** |
| Media plan optimizer | Uses `rateAmount` — **no margin layer** |

---

## Proposed data model

### A. User profile (no schema change)

Add API routes:

```
GET  /users/me          → current user
PATCH /users/me         → { name?, currentPassword?, newPassword? }
```

Rules:
- Any authenticated user can update **own** `name`
- Password change requires `currentPassword` + `newPassword` (min 8)
- **Cannot** change `role`, `email`, or `organizationId` via self-service
- Admin keeps `PATCH /users/:id` for full user management

### B. Organization commercial settings

Extend `Organization`:

```prisma
model Organization {
  // existing fields…
  commercialJson Json @default("{}")
}
```

`commercialJson` shape (validated in `@skyarc/validation`):

```ts
{
  skyarcMarginPercent: number;      // e.g. 15 — Skyarc take on vendor rate
  currency: "INR";
  paymentTermsDays?: number;        // e.g. 30
  notes?: string;
}
```

**Platform default** (new singleton or env + DB):

```prisma
model PlatformConfig {
  id    String @id @default("default")
  data  Json   // { defaultSkyarcMarginPercent: 15, … }
}
```

| Who sets | What |
|----------|------|
| **Skyarc ADMIN** | Platform default margin %, per-vendor override on org |
| **VENDOR_ADMIN** | View margin % (read-only), edit org display name/contact (optional later) |
| **VENDOR_OPS** | Read-only |

### C. Vendor inventory (uses existing tables)

```
Location (vendor org)
  └── Screen (label, inventoryStatus, loop/slot)
        └── Inventory (productCode, status)
              └── RateCard (amount, period, effectiveFrom/To)
```

Vendor portal flows:
- **My Inventory** → location → **Add screen** → **Add product/rate**
- Rate = **vendor net rate** (what media owner charges Skyarc)

### D. Price math (commercial engine — Feature 6 core)

```
vendorRate        = RateCard.amount (vendor → Skyarc)
skyarcMarginPct   = org.skyarcMarginPercent ?? platform.default
clientRate        = vendorRate / (1 - skyarcMarginPct/100)   // or vendorRate * (1 + margin)
skyarcRevenue     = clientRate - vendorRate
```

Store **provenance** on computed client rates (`DERIVED`) — never let vendor or client edit margin.

| Viewer | Sees |
|--------|------|
| Vendor | Own `vendorRate` only |
| Skyarc internal | Vendor rate + margin % + client rate |
| Client (later) | Ticks / fit bands — **not** % or margin |

---

## UI plan

### Phase 1c — Account settings (~½ day) **← start here**

| Surface | Who | Route |
|---------|-----|-------|
| My Account | All users | `/account` |
| Fields | | Name, email (read-only), change password |
| Sidebar link | | Bottom of sidebar → "Account" |

API: `GET/PATCH /users/me`  
Fix: allow self `PATCH` without admin role.

### Phase 2 — Vendor inventory CRUD (~1–2 days)

| Surface | Who | Route |
|---------|-----|-------|
| Location detail | Vendor admin | Add/manage screens |
| Screen detail | Vendor admin | Inventory products + rate card |
| API | | `POST/PATCH /locations/:id/screens`, `…/inventories`, `…/rate-cards` |

Scoped by existing org RBAC (`canWriteLocation`).

### Phase 3 — Commercial config (~1 day)

| Surface | Who | Route |
|---------|-----|-------|
| Vendor org settings | Vendor | `/organization` — add contact + **read-only margin %** |
| Vendor commercial admin | Skyarc ADMIN | `/admin/organizations/[id]` — edit margin %, payment terms |
| Platform defaults | Skyarc ADMIN | `/admin/settings` — default Skyarc margin % |

### Phase 4 — Planner integration (~1 day)

- Optimizer pulls `vendorRate` from active `RateCard`
- Applies org margin for **internal** plan totals
- Plan detail page: show vendor vs client rate columns (internal only)

### Phase 5 — Availability calendar (Feature 2, separate)

- Date ranges on `Inventory` or new `InventoryAvailability` table
- Vendor marks booked / available dates

---

## API sketch (1c + 3)

```http
GET  /api/v1/users/me
PATCH /api/v1/users/me
  { "name": "New Name" }
  { "currentPassword": "…", "newPassword": "…" }

GET  /api/v1/organizations/me/commercial
PATCH /api/v1/organizations/:id/commercial   # ADMIN only
  { "skyarcMarginPercent": 18, "paymentTermsDays": 45 }

GET  /api/v1/platform/config                 # ADMIN read
PATCH /api/v1/platform/config                # ADMIN write
  { "defaultSkyarcMarginPercent": 15 }
```

---

## Suggested build order

| Step | Feature | Why first |
|------|---------|-------------|
| **1** | User profile self-edit (1c) | Small, unblocks every user; fixes real API gap |
| **2** | Org commercial fields + admin UI | Margin % configurable before inventory rates matter |
| **3** | Vendor screen/inventory/rate CRUD | "Additional inventory" |
| **4** | Margin in media plan optimizer | Commercial engine hook |
| **5** | Availability calendar | Feature 2 |

---

## Definition of done (for 1c + commercial config MVP)

### User profile
- [ ] Vendor can change name and password from `/account`
- [ ] Admin can still manage all users from admin tools
- [ ] Password change fails without correct current password

### Commercial config
- [ ] Admin sets default Skyarc margin % (e.g. 15%)
- [ ] Admin overrides margin per vendor org
- [ ] Vendor sees margin % on org page (read-only)
- [ ] Internal plan view shows vendor rate + client rate with margin applied

### Vendor inventory
- [ ] Vendor admin adds screen to own location
- [ ] Vendor admin sets rate card on inventory
- [ ] Vendor cannot see or edit other orgs' inventory

---

## Not in this scope

- Email change / invite flow
- Excel rate sheet import (Feature 6 stretch)
- Client-facing ticks UI (Feature 3)
- Mobile account screen (Feature 1c-mobile)

---

## Reference

- **Master plan:** `docs/PRODUCT_PLAN.md`
- **Next feature:** `docs/features/02-inventory-commercial-pdf-rbac.md`
- Existing schema: `Organization`, `Screen`, `Inventory`, `RateCard` in `prisma/schema.prisma`
- Roadmap: Feature 2 availability calendar (after inventory types)
