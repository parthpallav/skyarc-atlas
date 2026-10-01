FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services/bridge ./services/bridge
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @skyarc/bridge db:generate \
 && pnpm --filter @skyarc/bridge build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/bridge ./services/bridge
COPY services/bridge/docker-entrypoint.sh /app/services/bridge/docker-entrypoint.sh
RUN chmod +x /app/services/bridge/docker-entrypoint.sh
EXPOSE 3004
ENTRYPOINT ["/app/services/bridge/docker-entrypoint.sh"]
