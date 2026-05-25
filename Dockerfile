# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- dependencies ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# The optional cacert secret lets a proxied/sandboxed CI inject a TLS CA so
# package fetches succeed. No-op in a clean build (no secret -> skipped).
RUN --mount=type=secret,id=cacert,target=/tmp/proxy-ca.crt \
    sh -c '[ -s /tmp/proxy-ca.crt ] && export NODE_EXTRA_CA_CERTS=/tmp/proxy-ca.crt; pnpm install --frozen-lockfile'

# ---- build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=cacert,target=/tmp/proxy-ca.crt \
    sh -c '[ -s /tmp/proxy-ca.crt ] && export NODE_EXTRA_CA_CERTS=/tmp/proxy-ca.crt; pnpm build'

# ---- runtime ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
# Standalone output bundles a minimal server + traced node_modules.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
# App Runner / ECS inject their own HOSTNAME env; Next standalone binds to it,
# so force 0.0.0.0 at exec time or the health check can't reach the server.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
