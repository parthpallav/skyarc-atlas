# Staging deploy runbook (Vercel + VPS)

**RC branch:** `feat/phase2-4-booking-scenarios`  
**Security hardening:** Postgres OAuth pending store (`0017`), MQTT payload-secret rejection, Pulse inbound identity binding (commits from `4677c26` onward).

Staging success does **not** verify live Google, Meta, payments, Tally, or physical Orbit hardware.

---

## Architecture

| Surface | Host | Notes |
|---------|------|--------|
| Atlas web | **Vercel** | Next.js; browser calls same-origin `/api/*` and `/pulse/*` |
| Atlas API | **VPS** (loopback + HTTPS reverse proxy) | Fastify `:3001` → public `https://api-staging…` |
| Pulse | VPS `:3003` | Proxied by Vercel `PULSE_PROXY_TARGET` |
| Bridge | VPS `:3004` | Internal + Bridge dry-run when Meta unset |
| Orbit Cloud | VPS `:3002` | MQTT consumer + HTTPS ingest; `ORBIT_MQTT_URL` → internal Mosquitto |
| PostgreSQL | VPS compose **only** | No host port; database `skyarc_atlas_staging` |
| MQTT | Mosquitto on compose network | Not published to public internet |

---

## Migrations from deployment baseline

Apply in order on **empty or backed-up** staging DB (not production customer data):

| Step | Artifact |
|------|----------|
| PostGIS | `prisma/docker-init` on first postgres start |
| Atlas SQL | `0001` … `0017` via API `scripts/apply-sql-migrations.sh` on container boot |
| Orbit schema | `pnpm --filter @skyarc/orbit-cloud exec prisma db push` (orbit schema) |
| Pulse schema | `pnpm --filter @skyarc/pulse exec prisma db push` (pulse schema) |
| Bridge schema | `pnpm --filter @skyarc/bridge exec prisma db push` if applicable |

See also `docs/contracts/RC_MIGRATION_RECOVERY_RUNBOOK.md`.

### Backup before migrate (existing staging VPS data)

```bash
chmod +x scripts/staging-backup.sh
./scripts/staging-backup.sh .env.staging
```

---

## VPS deploy

1. Clone/checkout **committed RC SHA** (see `docs/contracts/STAGING_VERIFICATION.md`).
2. `cp docs/deploy/env.staging.example .env.staging` — fill secrets (unique staging tokens).
3. Generate Mosquitto passwords (do not commit hashes):

   ```bash
   docker run --rm -v "$PWD/deploy/staging:/mosquitto/config" eclipse-mosquitto:2 \
     mosquitto_passwd -c -b /mosquitto/config/mosquitto.passwd orbit-staging-consumer 'YOUR_MQTT_PASSWORD'
   ```

4. Build and start:

   ```bash
   docker compose --env-file .env.staging -f docker-compose.staging.yaml up -d --build
   ```

5. Push satellite schemas (once per fresh DB):

   ```bash
   docker compose --env-file .env.staging -f docker-compose.staging.yaml exec api \
     sh -c 'cd /app && pnpm --filter @skyarc/orbit-cloud exec prisma db push --schema=services/orbit-cloud/prisma/schema.prisma'
   # Repeat for pulse/bridge from host or one-off containers.
   ```

6. Seed staging tenants (never production dump):

   ```bash
   STAGING_SEED_CONFIRM=1 DATABASE_URL=postgresql://... tsx prisma/seed-staging.ts
   STAGING_SEED_CONFIRM=1 DATABASE_URL=... tsx prisma/seed-rajkot-hoardings.ts
   STAGING_SEED_CONFIRM=1 DATABASE_URL=... tsx prisma/seed-demo-campaign.ts
   ```

7. Configure nginx/Caddy using `deploy/staging/reverse-proxy.example.conf` (TLS, 55m body, 300s proxy timeout for large uploads).

8. Open firewall: **443 only** to API/Orbit public hostnames. Do **not** expose 5432, 1883, or raw 3101–3104 publicly.

---

## Vercel (Atlas frontend)

Project: `apps/web` (root install via `vercel.json`).

### Required environment variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `API_PROXY_TARGET` | `https://api-staging.example.com` | Runtime proxy for `/api/*` |
| `PULSE_PROXY_TARGET` | `https://pulse-staging.example.com` or `http://VPS_IP:3103` via tunnel | `/pulse/*` proxy |
| `NODE_ENV` | `production` | Disables dev-only defaults |

### Do not set on staging (keep live integrations off)

- `GOOGLE_CLIENT_*` on API (not Vercel) — leave empty
- `NEXT_PUBLIC_SHOW_DEMO_LOGINS` — **false/unset** (use staging seed accounts)
- Meta / payment keys on Bridge/API

### CORS (API `.env.staging`)

Must include exact Vercel URL:

```env
CORS_ORIGINS=https://your-project.vercel.app,https://*.vercel.app
WEB_APP_URL=https://your-project.vercel.app
```

### Cookies / OIDC (when Google is enabled later)

- OAuth browser cookie: HttpOnly `skyarc_oauth_sid`, SameSite=Lax (API).
- `GOOGLE_REDIRECT_URI` must be **HTTPS API** callback, e.g. `https://api-staging.example.com/api/v1/auth/google/callback`.

### Proxy limits

- API Fastify `bodyLimit`: 50MB.
- Vercel route handlers: `maxDuration` on `/api` and `/pulse` proxies (see `apps/web/src/app/**/route.ts`).
- Hobby plan max duration may be 10s — use Pro for large Excel/import flows or call API HTTPS directly from trusted networks during QA.

---

## Disabled integrations (staging policy)

| Integration | Staging behavior |
|-------------|------------------|
| Google OIDC | Unconfigured → `/auth/google/status` `configured: false` |
| Meta WhatsApp | Bridge dry-run (no `WHATSAPP_TOKEN`) |
| Paid checkout | `payment-intent` → `UNAVAILABLE` |
| Tally live | File export only |
| Orbit hardware | Simulated MQTT/HTTPS ingest; no Lunar production broker |

---

## Simulated Orbit device (MQTT)

1. Enroll device via Orbit/Atlas admin APIs (staging).
2. Publish to `skyarc/v1/orbit/{physicalDeviceId}/heartbeat` with **broker username/password** — never `__mqttSecret` in JSON.
3. Confirm inbox row + campaign evidence UI.

---

## Access required to execute deploy (blockers if missing)

| Access | Why |
|--------|-----|
| Vercel project admin | Env vars, deploy hook, domain |
| VPS SSH + Docker | Compose staging stack |
| DNS for `api-staging` / optional `orbit-staging` | HTTPS callbacks and proxies |
| TLS (Let’s Encrypt) | Secure cookies and tokens |
| GitHub push / Hostinger deploy token | Pull RC commit on VPS |
| Optional: R2 staging bucket | Creative upload tests |

**Current blocker:** GitHub CLI token invalid in agent environment; VPS deploy not executed from this session without operator credentials.

---

## Post-deploy verification

Fill `docs/contracts/STAGING_VERIFICATION.md` with commit SHA, migration list, pass/fail, screenshots.

Do **not** promote to production automatically.
