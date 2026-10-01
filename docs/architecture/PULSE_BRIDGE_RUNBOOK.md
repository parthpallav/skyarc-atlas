# Pulse + Bridge runbook

Additive services for advanced capabilities (Excel export, WhatsApp share) without changing Atlas core API behavior.

## Services

| Service | Port | Package | Purpose |
|---------|------|---------|---------|
| **Pulse** | 3003 | `@skyarc/pulse` | Product capabilities: plan Excel export, share orchestration |
| **Bridge** | 3004 | `@skyarc/bridge` | External integrations: WhatsApp Cloud API (future: SMS, AI gateway) |

Atlas API (`services/api`, port 3001) remains the system of record for campaigns, plans, PDF export, and optimization.

## Data

- Postgres schemas: `pulse` (ShareJob, ExportArtifact), `bridge` (OutboundMessage, InboundEvent)
- Set `PULSE_DATABASE_URL` and `BRIDGE_DATABASE_URL` to the same database as Atlas (different Prisma schemas), mirroring Orbit.

## Auth

- **Pulse** — verifies Atlas JWT (`JWT_ACCESS_SECRET`); user-facing routes only.
- **Bridge** — `BRIDGE_SERVICE_TOKEN` for Pulse → Bridge; WhatsApp webhook is public with optional signature verify.

## Web

- Next.js proxies `/pulse/*` → `PULSE_PROXY_TARGET` (see `apps/web/src/app/pulse/[...path]/route.ts`).
- Plan detail: **Excel** and **WhatsApp** call Pulse; **PDF** still uses Atlas `/api`.

## WhatsApp (Bridge)

Env:

- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN` (webhook GET challenge)
- `WHATSAPP_APP_SECRET` (webhook POST signature)

Webhook URL (public HTTPS): `https://<your-bridge-host>/webhooks/whatsapp`

When WhatsApp credentials are unset, Bridge runs in **dry-run** mode (messages logged, no Meta API calls).

## Local dev

```bash
pnpm install
pnpm --filter @skyarc/bridge db:generate && pnpm --filter @skyarc/pulse db:generate
pnpm --filter @skyarc/bridge dev   # :3004
pnpm --filter @skyarc/pulse dev    # :3003
```

Or `docker compose up` with `BRIDGE_SERVICE_TOKEN`, `PULSE_DATABASE_URL`, `BRIDGE_DATABASE_URL` in `.env`.

## Deploy

Add `pulse` and `bridge` services from `docker-compose.prod.yaml`. Open firewall ports 3003/3004 or reverse-proxy Bridge webhooks only.
