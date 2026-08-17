# DreamCRM

A unified **CRM + CMS + commerce + portal** platform for dental clinics, sold as the **operating layer that wraps a clinic's existing practice management system (PMS)**.

We are **not a PMS** — we don't manage treatment plans, charts, procedures, or insurance claims. We're the **relationship layer** (leads, bookings, intake, communications, portal, marketing, reviews, products) on top of whatever PMS the clinic already runs — connected two-way through the NexHealth Synchronizer (or Open Dental directly).

The product's design doctrine is **"the employee, not the tool"**: the machine does the job and asks one question, rather than handing the clinic another console to operate. See DESIGN.md → "The North Star".

## The four personas

- `platform` — Dream Create staff (the platform owner org)
- `clinic` — each dental practice (one org per clinic; staff roles owner/admin/member)
- `patient` — patients in the clinic-branded portal at `/patient/*` (magic-link sign-in)
- `partner` — referral partners with their own portal at `/partner` (not org members)

Every tenant-scoped read filters by `organizationId`, every insert sets it; `getTenantContext()` resolves each request. One purchasable plan (access to the app is access to the whole app — see CLAUDE.md's no-plan-gating convention).

## Stack

- **Next.js 16** (App Router, Turbopack) · **TypeScript** · **Tailwind 4** · React 19
- **Drizzle ORM** on **AWS RDS Postgres** (private/VPC-only)
- **better-auth** with Organizations plugin (multi-tenant) + magic-link sign-in
- **Stripe** (Checkout + Customer Portal + Connect + webhooks)
- **Resend** for transactional + patient-facing email (per-clinic sender identity, two-way)
- **AWS End User Messaging** for SMS (A2P 10DLC, per-clinic numbers)
- **NexHealth Synchronizer** for PMS sync (+ Open Dental direct)
- **Zernio** for Google Business Profile + social
- **AWS S3** for uploads · **Anthropic API** for AI features
- **Gmail OAuth** (staff inbox + clinic-side sends)
- Deployed on **AWS App Runner** (`us-east-1`); merge to `main` auto-deploys
  via GitHub Actions → CodeBuild → ECR

Canonical URL: **https://www.dreamcreatestudio.com** (public marketing site;
signed-in users land on their dashboard). Clinic public sites serve at
`{slug}.dreamcreatestudio.com` or a custom domain.

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
pnpm build                # next build (required check for UI/font/config changes)
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest run (full suite, ~6,400 tests, <4 min)
pnpm test:watch           # vitest watch mode
pnpm db:generate          # drizzle-kit generate (after schema changes)
pnpm db:push              # apply schema directly (local dev only)
```

## Documentation (the real map — read in this order)

| Doc | What it is |
|---|---|
| [`DESIGN.md`](./DESIGN.md) | Durable strategy + design principles + the North Star doctrine |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | The binding dashboard UI system (tones, glyphs, motion, components) |
| [`CLAUDE.md`](./CLAUDE.md) | **Current implementation state** — architecture, module map, subsystem reference, conventions, ops. The working manual; kept current. |
| [`docs/RELEASE.md`](./docs/RELEASE.md) | The current program of record: beta → 1.0 |
| [`docs/HISTORY.md`](./docs/HISTORY.md) | The session-by-session build log |
| [`docs/AUDITS.md`](./docs/AUDITS.md) | Phase-audit certificates + retrospectives |
| `docs/*.md` | Deep-dive specs + runbooks (onboarding/NexHealth, SMS, Zernio/GBP, inbound email, custom domains, intake forms, …) |

Details that change (module status, migration numbers, cron lists, open items)
deliberately live in **CLAUDE.md only** — this README stays a pointer so it
can't rot.
