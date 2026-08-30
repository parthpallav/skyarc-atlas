# Skyarc Atlas

Internal DOOH Location Intelligence and AI Media Planning platform.

## Architecture

- **API**: Fastify + Prisma + PostgreSQL/PostGIS (`services/api`)
- **Mobile**: Expo field survey app (`apps/mobile`)
- **Web**: Next.js planning dashboard (`apps/web`)
- **Storage**: Cloudflare R2 (presigned direct uploads)
- **AI**: OpenRouter via replaceable `AIProvider`

## Quick start

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL with PostGIS (or use Docker Compose)

### Setup

```bash
cp .env.example .env
# Edit DATABASE_URL and secrets

pnpm install
pnpm db:generate
pnpm db:push          # or: pnpm db:migrate
pnpm db:seed

pnpm dev              # starts API (and other workspace dev scripts)
```

### API only

```bash
pnpm --filter @skyarc/api dev
```

Swagger UI: http://localhost:3001/docs

### Mobile

```bash
pnpm --filter @skyarc/mobile dev
```

Set `EXPO_PUBLIC_API_URL` to your API host.

### Web

```bash
pnpm --filter @skyarc/web dev
```

Set `NEXT_PUBLIC_API_URL` to your API host.

### Docker (production-like)

```bash
docker compose up --build
```

## Quality gates

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Default admin (seed)

- Email: `admin@skyarc.in`
- Password: `ChangeMe123!`

Override with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

## Monorepo structure

```
apps/mobile/     Expo field client
apps/web/        Next.js web client
services/api/    Fastify API
packages/        shared, validation, config, api-client
prisma/          database schema
docs/            OpenAPI specification
```

## Product plan

See **[`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md)** — single source of truth for vision, architecture, RBAC, inventory, commercial terms, PDF export, and unified roadmap.

## Phases (foundation — complete)

1. Backend + OpenAPI (complete)
2. Mobile field workflow + offline sync (complete)
3. Web dashboard + map (complete)
4. AI intelligence + media planning optimizer (complete)
5. Docker/VPS deployment scaffolding (complete)
6. Organizations + vendor RBAC (in progress on `feature/organizations-rbac`)
