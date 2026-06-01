# syntax=docker/dockerfile:1

FROM public.ecr.aws/docker/library/node:22-slim AS base
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
# NEXT_PUBLIC_* values are inlined into the bundle at build time (App Runner
# runtime env vars are too late), so they must be present as build args here.
# Without NEXT_PUBLIC_APP_URL, invite links + Stripe return URLs fall back to
# localhost. Defaults keep a no-arg build working locally.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_DOMAIN=dreamcreatestudio.com
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SITE_DOMAIN=$NEXT_PUBLIC_SITE_DOMAIN
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=cacert,target=/tmp/proxy-ca.crt \
    sh -c '[ -s /tmp/proxy-ca.crt ] && export NODE_EXTRA_CA_CERTS=/tmp/proxy-ca.crt; pnpm build'

# ---- runtime ----
FROM public.ecr.aws/docker/library/node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
# Standalone output bundles a minimal server + traced node_modules. The
# migration SQL files are traced in via next.config outputFileTracingIncludes
# (the /api/admin/migrate route needs them), so they ship inside .next/standalone.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The auto-migrate trigger — a tiny built-in-fetch script (no external deps) that
# calls the app's own migrate route once the server is up. The resync-demo
# script is the same idiom for the Acme Dental Demo self-heal — runs after
# migrate so any newly-added columns + their defaults are seeded.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/resync-demo.mjs ./scripts/resync-demo.mjs
USER nextjs
EXPOSE 3000
# App Runner / ECS inject their own HOSTNAME env; Next standalone binds to it,
# so force 0.0.0.0 at exec time or the health check can't reach the server.
# Start the server, then auto-apply pending migrations via its own route, then
# walk the Acme demo through its self-heal so any new columns shipped in this
# deploy get backfilled. Both scripts are idempotent; failures are logged but
# don't take the server down (App Runner has already marked it healthy).
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js & (node scripts/db-migrate.mjs && node scripts/resync-demo.mjs) || true; wait"]
