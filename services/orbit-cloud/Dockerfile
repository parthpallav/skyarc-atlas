FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services/orbit-cloud ./services/orbit-cloud
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @skyarc/shared build \
 && pnpm --filter @skyarc/orbit-cloud db:generate \
 && pnpm --filter @skyarc/orbit-cloud build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/orbit-cloud ./services/orbit-cloud
COPY services/orbit-cloud/docker-entrypoint.sh /app/services/orbit-cloud/docker-entrypoint.sh
RUN chmod +x /app/services/orbit-cloud/docker-entrypoint.sh
EXPOSE 3002
ENTRYPOINT ["/app/services/orbit-cloud/docker-entrypoint.sh"]
