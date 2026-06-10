# DreamCRM

A unified **CRM + CMS + commerce + portal** platform for dental clinics, sold as the **operating layer that wraps a clinic's existing practice management system (PMS)**.

We are **not a PMS** — we don't manage treatment plans, charts, procedures, or insurance claims. We're the **relationship layer** (leads, bookings, intake, communications, portal, marketing, reviews, products) on top of whatever PMS the clinic already runs.

See [`DESIGN.md`](./DESIGN.md) for the durable strategy + design principles.
See [`CLAUDE.md`](./CLAUDE.md) for current implementation context + module status.

## Stack

- **Next.js 16** (App Router, Turbopack) · **TypeScript** · **Tailwind 4**
- **Drizzle ORM** on **AWS RDS Postgres** (private/VPC-only)
- **better-auth** with Organizations plugin (multi-tenant) + magic-link sign-in
- **Stripe** (Checkout + Customer Portal + Connect + webhooks)
- **Resend** for transactional + patient-facing email (per-clinic sender identity)
- **AWS S3** for uploads · **Anthropic API** for AI features
- **Gmail OAuth** (staff inbox + clinic-side sends)
- Deployed on **AWS App Runner** (`us-east-1`); merge to `main` auto-deploys
  via GitHub Actions → CodeBuild → ECR

Canonical URL: **https://www.dreamcreatestudio.com** (public marketing site;
signed-in users land on their dashboard). Clinic public sites serve at
`{slug}.dreamcreatestudio.com`.

## Quickstart

```bash
# Install
pnpm install

# Env vars — copy template, fill in DATABASE_URL + auth secret + integration keys
cp .env.example .env.local

# Apply migrations (local dev)
pnpm db:push

# Run dev server
pnpm dev
```

Open http://localhost:3000.

## Common commands

```bash
pnpm dev                  # local dev (Turbopack)
pnpm build                # next build
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest run (full suite)
pnpm test:watch           # vitest watch mode
pnpm db:generate          # drizzle-kit generate (after schema changes)
pnpm db:push              # apply schema directly (local dev only)
```

## Repo layout

```
app/
  (default)/         Authenticated app surface (dashboard, settings, modules)
  (auth)/            sign-in / sign-up / reset-password / accept-invite
  (onboarding)/      4-step clinic signup → Stripe Checkout
  (double-sidebar)/  Inbox + Messages (Patient Communications)
  (alternative)/     Mosaic-template component library + finance demos
  site/[slug]/       Public clinic homepage + /book + intake forms
  r/[token]/         Public review-request landing
  api/auth/[...all]  better-auth handler
  api/webhooks/      Stripe, Resend, Gmail (Pub/Sub), (Phase B) Twilio
  api/cron/          Scheduled jobs (gmail-watch-renew)
  api/track/         Marketing email open + click tracking
  api/upload         Vercel Blob upload

lib/
  db/schema/         Drizzle schemas: auth, platform, clinic, domain, email
  db/migrations/     Drizzle-generated SQL (0000–0023 currently)
  auth/              better-auth server + client + getTenantContext
  services/          Per-entity server-only modules (server-only)
  modules/           Sidebar/module registries (platform, clinic, patient)
  marketing/         Email render + signed tokens + tenant terminology
  blob.ts            @vercel/blob wrapper (swap target for AWS S3)
  email.ts           Resend wrapper for transactional sends
  stripe.ts          Lazy Proxy Stripe client

components/ui/       Shared chrome (DashboardShell, TenantSidebar, ComingSoon, etc.)
middleware.ts        Auth gate + public-path allowlist + subdomain rewrite
tests/               Vitest unit + integration (happy-dom env)
```

## Multi-tenancy

Every tenant-scoped read filters by `organizationId`, every insert sets it. `getTenantContext()` resolves the current request into `{ tenantType, role, planTier, organizationId, patientId, ... }`. Three tenant types:

- `platform` — Dream Create staff (the platform owner org)
- `clinic` — Each dental clinic (one org per clinic)
- `patient` — Patients logged into the portal at `/patient/*`

Plan tiers (per CLAUDE.md):
- **Basic** ($99): Overview + Settings + Website Editor — the trunk
- **Pro** ($149): Daily-cockpit + Reviews + Blog + SEO
- **Premium** ($199): Recall + Analytics + Shop + Integrations + Careers

## Conventions

- Service modules live in `lib/services/` and are `import 'server-only'`. Client-safe enums + types in `lib/types/` or `lib/modules/types.ts`.
- Server actions live next to the route as `actions.ts` (user CRUD) or `admin-actions.ts` (platform-admin-only).
- All authenticated layouts use `<DashboardShell>` — don't render `<TenantSidebar>` directly elsewhere.
- After mutating session state (e.g. `activeOrganizationId`), navigate via `window.location.assign()` so middleware sees the new state.
- Stripe / Resend / Twilio / Anthropic clients are lazy `Proxy` instances so `next build` runs without runtime envs.
- **No fake content.** Every UI surface must read from a real DB column; every demo seed populates every column shown anywhere in the UI. "Coming soon" placeholders are the only honest exception (gated via `status: 'soon'` in the module registry).

## Documentation

- [`DESIGN.md`](./DESIGN.md) — strategy + design principles (durable; re-read before designing any new module)
- [`CLAUDE.md`](./CLAUDE.md) — implementation context, module status, what's wired vs what's deferred, deployment workflow
