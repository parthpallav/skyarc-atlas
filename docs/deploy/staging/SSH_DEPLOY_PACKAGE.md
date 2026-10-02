# SSH fallback package — use only if Hostinger image-pull deploy cannot complete

## When required

Hostinger `vps_docker_create` supports compose **content** + **environment**, named volumes, and `image:` pulls.
It does **not** provide SSH/shell or arbitrary file sync via the available MCP API.

Use this package when:

1. GHCR images cannot be published (`packages:write` / Actions failure), or
2. VPS cannot pull from `ghcr.io`, or
3. TLS / reverse-proxy files must be installed on disk.

## Missing capabilities (exact)

| Capability | Status |
|------------|--------|
| Remote shell / SSH exec via Hostinger MCP | **Missing** |
| Upload bind-mount files (nginx conf, certs) | **Missing** |
| Clone monorepo for `build: context: .` from raw compose URL | **Unsupported** (URL returns YAML only) |
| Managed TLS certificates for `api-staging.*` | **Missing** via MCP |

## SSH procedure (operator)

On VPS `1887077` (do **not** stop project `skyarc-atlas`):

```bash
sudo mkdir -p /opt/skyarc-atlas-staging
cd /opt/skyarc-atlas-staging
git clone https://github.com/parthpallav/skyarc-atlas.git .
git checkout c4dd197e9a6b1eee413a42178e90ddc38beda7e5   # or image-based compose SHA
cp docs/deploy/env.staging.example .env.staging
# edit .env.staging: unique secrets, WEB_APP_URL=Vercel preview origin, CORS_ORIGINS, ports 3101-3104
# Prefer image compose when digests exist:
docker compose --env-file .env.staging -f docker-compose.staging.images.yaml pull
docker compose --env-file .env.staging -f docker-compose.staging.images.yaml up -d
# Else build-based (needs full tree):
# docker compose --env-file .env.staging -f docker-compose.staging.yaml up -d --build
```

Migrations: API entrypoint applies `0001`–`0017`; set `DATABASE_BOOTSTRAP=always` on first empty volume only.
Seed: `docker compose exec api pnpm exec tsx prisma/seed-staging.ts` with `STAGING_SEED_CONFIRM=1`.

TLS: install nginx/Caddy from `deploy/staging/reverse-proxy.example.conf` for HTTPS; keep Postgres/MQTT unpublished.

## Preferred non-SSH path

1. Run workflow `Publish staging images` for RC SHA.
2. Hostinger create project `skyarc-atlas-staging` with `docker-compose.staging.images.yaml` + staging env.
3. Open firewall TCP `3101` and `3103` only (API + Pulse for Vercel).
4. Set **preview-only** Vercel `API_PROXY_TARGET` / `PULSE_PROXY_TARGET` to `http://<VPS>:3101` / `:3103` (or HTTPS hosts).
5. Leave production project and shared production env rows untouched.
