# DreamCRM — Project context for Claude

Multi-tenant SaaS for dental clinics. Dream Create (platform owner) runs the
platform; clinics are tenant orgs; patients are users with `role='patient'`
in a clinic org; referral **partners** are a fourth persona with their own
portal. The Mosaic Next.js admin template provided the original dashboard
bones; the v2 design system re-skinned it — wire logic into the existing
system, don't replace it.

**The doc set (read in this order for a new module):**

| Doc | What it is |
|---|---|
| [`DESIGN.md`](./DESIGN.md) | Durable strategy + design principles — what we're building, who for, positioning, module roadmap. Read before designing anything new. |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | The binding dashboard UI system (v2 "Instrument Panel, Liquid Soul") — semantic tones, glyphs, motion, components. Read before touching dashboard UI. |
| **This file** | Current implementation state: architecture, module map, subsystem reference, conventions, ops. |
| [`docs/HISTORY.md`](./docs/HISTORY.md) | The chronological session-by-session build log (moved out of this file 2026-07-02). Per-session implementation detail lives there. |
| [`docs/FINISHING.md`](./docs/FINISHING.md) | The living "finishing pass" punch list — known seam bugs + polish gaps, by class. |
| [`docs/COMPETITIVE-GAPS.md`](./docs/COMPETITIVE-GAPS.md) | The module-deepening roadmap: per-module feature gaps vs NexHealth/RevenueWell/Weave/etc., prioritized. **The current focus** — working module by module, Appointments first. |
| `docs/zernio-google-integration.md` · `docs/intake-forms-overhaul.md` · `docs/custom-domains.md` | Deep-dive specs for those systems. |

## Stack

- **Next.js 16** (App Router, Turbopack), TypeScript, Tailwind 4, React 19
- **Drizzle ORM** on **AWS RDS Postgres** (`us-east-1`; node-postgres, private/VPC-only)
- **better-auth** with Organizations plugin (multi-tenant) + magic-link (patients)
- **Stripe** — platform billing (Checkout + Customer Portal + webhooks), **Stripe
  Connect** Standard for clinic shop/membership/balance payments, Connect
  **Express** for partner payouts
- **Email: Resend (LIVE)** from the verified `dreamcreatestudio.com` domain
  (`EMAIL_DRIVER=resend`). SES driver kept as inert fallback (prod access was
  denied twice). Per-clinic sender identity Tier 1 (platform domain, clinic name)
  + Tier 2 (clinic's connected Gmail) — see `lib/email-identity.ts` +
  `lib/services/clinic-sender.ts`; `deliver()` in `lib/email.ts` routes it.
- **Storage: AWS S3** (`STORAGE_DRIVER=s3`, bucket `dreamcrm-uploads-prod`); Vercel
  Blob kept as fallback driver
- **AI: Anthropic API (direct)** — `lib/ai.ts` (+ inert Bedrock driver
  `lib/ai-bedrock.ts`, `AI_DRIVER=bedrock` for a future single-BAA move)
- **Zernio** — Google Business + social (IG/FB/TikTok/YouTube/LinkedIn) hosted
  OAuth, reviews, GBP listing sync, posting, metrics (`lib/zernio.ts`)
- **SMS: not wired** (future: AWS End User Messaging + A2P 10DLC). Gmail OAuth
  for the staff inbox.
- **Deployed on AWS App Runner** (`us-east-1`). Canonical
  **https://www.dreamcreatestudio.com**; clinic public sites at
  `{slug}.dreamcreatestudio.com` (wildcard DNS + cert live) + optional custom
  domains. Merge to `main` auto-deploys (GitHub Actions → CodeBuild → ECR →
  App Runner).

## Repo layout

```
app/
  (default)/         Authenticated app surface — most modules live here; page
                     bodies branch on getTenantContext().tenantType
  (double-sidebar)/  /inbox + /messages (two-pane surfaces w/ inner sidebar)
  (auth)/            signin / signup / reset-password / accept-invite
                     (shared components/auth/auth-shell.tsx, v2 brand)
  (onboarding)/      4-step onboarding → clinic org + Stripe Checkout; /welcome
                     AI interview; /onboarding-complete
  (marketing)/       Public B2B marketing site at the root of www (/, /product,
                     /pricing, /compare, /docs, /blog)
  (portal)/          Patient portal /patient/* — clinic-branded chrome
  (partner)/         Referral-partner portal /partner (minimal single-column)
  (partner-accept)/  /partner/accept — public token-auth invite acceptance
  (pay)/             /ecommerce/pay (bare checkout page)
  (preview)/         /settings/portal/preview (watermarked portal replica)
  site/[slug]/       Public clinic sites (Tend-style template; /book, /services,
                     /intake, /shop, /careers, /blog, /team, …). Fraunces via a
                     runtime <link>, NOT next/font (build env can't reach Google)
  r/[token]/         Patient review landing — token IS the auth; Google-first
                     (+ optional star-gate triage). Siblings on the same
                     token-IS-auth pattern: w/ (fast-pass claim), c/ (one-click
                     visit confirm), b/ (email-to-pay balance page)
  api/               auth handler · webhooks (stripe, stripe-connect, gmail OIDC,
                     resend/svix) · 13 CRON_SECRET-gated /api/cron/* routes ·
                     3 /api/admin/* (migrate, seed-platform, resync-demo) ·
                     oauth (gmail, gsc) + connect (shop) + zernio connect/callback ·
                     token-auth publics (/api/calendar/[token], track, unsub) ·
                     /api/internal/custom-domains (host→slug map for middleware)

lib/
  db/schema/         auth.ts, platform.ts, clinic.ts (bulk), domain.ts, email.ts,
                     referrals.ts, index.ts
  db/migrations/     drizzle; 0000–0116 applied to prod (auto-apply on deploy)
  auth/              server.ts, client.ts, context.ts (getTenantContext,
                     requireTenant/requireRole/requirePlan/requirePartner)
  services/          ~135 server-only modules (import 'server-only') — one per
                     entity/subsystem; demo-clinic.ts is the demo seeder
  modules/           Sidebar registries per tenant type (clinic/platform/patient/
                     partner) — ModuleDef w/ minPlan + roles + requiresBundle +
                     pinned/shortcut gating
  integrations/      catalog.ts (pure IntegrationDef registry) · resolve.ts (pure
                     runtime status) · bundles.ts (feature bundles → sidebar)
  types/             Client-safe types/enums/registries
  ui/encodings.ts    THE semantic tone/glyph/aging registry (see DESIGN-SYSTEM)
  clinic-timezone.ts Pure tz helpers: resolveClinicTimeZone, clinicDayStart/
                     WeekStart/MonthStart (clinic-local day boundaries)
  format-datetime.ts Pure tz-aware formatters: formatClinicDateTime/DayTime/
                     Time/DayHeader, clinicDayKey
  email.ts           deliver() + templates (authEmailShell — Outlook-safe VML)
  stripe.ts / stripe-config.ts   Lazy Stripe client + PLANS/add-on price config
  zernio.ts          Lazy Zernio client (all GBP/social wrappers, defensive parse)
  trial.ts           No-card 7-day trial state (resolveTrialState)

components/ui/       dashboard-shell.tsx (all authed layouts go through it),
                     tenant-sidebar.tsx, the 10 v2 primitives (PageHeader,
                     ActionButton, StatusPill, FilterChip, GlyphCluster,
                     EncodingLegend, EmptyState, BulkBar, KpiStat, FlashToast)
middleware.ts        Auth gate + public-path allowlist + {slug} subdomain rewrite
                     + custom-domain host→slug routing + app./apex → www redirect
tests/               Vitest (happy-dom), ~460 files / 4,200+ tests; pnpm test
scripts/             db-migrate.mjs + resync-demo.mjs (run on container boot),
                     migrate.mjs (direct), setup-cron-schedules.sh (EventBridge)
```

## Multi-tenancy model

- `organization.type: 'platform' | 'clinic'`; `member.role: 'owner' | 'admin' |
  'member' | 'patient'`; `session.activeOrganizationId` carries the active org.
- `getTenantContext()` (`lib/auth/context.ts`) resolves every request into
  `{ tenantType: 'platform'|'clinic'|'patient'|'partner', role, planTier,
  organizationId, patientId, isDemo, billing/trial state, … }`. Precedence:
  demo cookie (platform admins) → active-org membership → first membership →
  partner derivation (only when no membership exists).
- **Partners** are NOT org members: `requirePartner()` looks up
  `referral_partner.user_id` directly so a user can be platform admin AND
  partner. Partner surfaces live in `app/(partner)/`.
- Every tenant-scoped table carries `organization_id`. **Every read filters by
  it, every insert sets it** — see `tests/tenant-scoping/`.
- `lib/modules/` registries + `getVisibleModules` (plan + role) +
  `applyBundleGate` (integration bundles) drive the sidebar per tenant type.
- **Platform org**: `Dream Create` (slug `dream-create`), owner
  `dustin@dreamcreateweb.com` (`platformAdmin: true` on the user row).
- **Demo mode**: platform admin "View as clinic" sets a `demo_context` cookie;
  `getTenantContext` synthesizes the clinic/patient context. The demo clinic
  ("Dream Dental", slug `acme-dental-demo`) auto-resyncs on every deploy.

## Timezone rules (critical — the server runs in UTC)

The prod server's clock is UTC; clinics live in US timezones
(`clinic_profile.timezone`, default `America/New_York`). Two hard rules:

1. **Any time string built server-side** (server component, server action,
   service, email, comm-log note) **must format against the clinic timezone** —
   use `formatClinicDayTime`/`formatClinicTime`/`formatClinicDayHeader`/
   `formatClinicDateTime` from `lib/format-datetime.ts` (they REQUIRE a tz), with
   the tz from `getClinicTimeZone(orgId)` (`lib/services/clinic-timezone.ts`) or
   `sender.timeZone` when a ClinicSender is already loaded. A bare
   `toLocaleString` on the server renders 1 PM Central as 6 PM.
2. **Any "today"/day-window/day-bucketing computed server-side must use
   clinic-local day boundaries** — `clinicDayStart`/`clinicWeekStart`/
   `clinicMonthStart` (`lib/clinic-timezone.ts`), never `startOfDay(new Date())`
   (a 7:30 PM Central visit is already "tomorrow" in UTC). The appointments
   window resolver, `groupByDay`, and the Overview today-window all follow this.

Client components (`'use client'`) format in the viewer's browser tz — generally
acceptable for staff (they sit in the clinic), but public/patient-facing slot
times should still be clinic-local (see `docs/FINISHING.md`).

## Demo-org data rules (critical — real patients exist in the demo org)

The demo org contains REAL patients (the owner tests booking/portal flows).
`lib/services/demo-clinic.ts` therefore anchors every seeded artifact to the
15 seeded personas **by identity** — their deterministic
`first.last@example.com` emails via `getPersonaAlignedPatientIds` — never by
positional index or arbitrary query. Persona missing → skip the seed (never
fall back to a real patient). `cleanupMisattributedDemoArtifacts` sweeps
legacy misattributions (seeder-minted review requests carry `demo…` tokens;
threads are recognized by seed bodies) on every resync. When you add a new
seeded artifact type: attach it via the persona-aligned array, give it a
recognizable seed marker, and extend the cleanup sweep.

## Module status snapshot (clinic dashboard)

Sidebar groups: **Daily** / **Growth** / **Website** / **Business** + a pinned
**Settings** entry (card-grid home). All modules are **live** — there are no
`status:'soon'` placeholders left. Deep implementation history per module:
`docs/HISTORY.md`.

| Section | Module | Path | Notes |
|---|---|---|---|
| Daily | Overview | `/` → `/dashboard` | Morning-huddle: today's chair, attention cards, trends, activity feed, integrations-health banner, follow-up summary. Clinic-tz day windows. |
| Daily | My Day | `/my-day` | Per-staff cockpit: my/unclaimed follow-ups, my conversations, today's schedule, collections nudge. Mirrored by the opt-in morning digest email (per-staff opt-out). |
| Daily | Messages | `/messages` (double-sidebar) | Front-style unified patient inbox (in_app + email; SMS deferred). Receipts, attachments, AI draft, quick-book, scheduled send, star/unread, auto-reply after hours. Gmail mailbox at `/inbox`. |
| Daily | Appointments | `/appointments` | Agenda grouped by clinic-local day; window chips; aging borders; drawer (confirm/reschedule/cancel/no-show + review request); bulk actions; saved views; CSV call-sheet export. |
| Daily | Patients | `/patients` + `/patients/[id]` | Relationship record: glyphs, filters, saved views (promote-to-audience), tags, documents, merge, CSV import/export, bulk email/portal-invite. Detail: timeline (clinic-tz), needs-attention, notes, follow-ups. |
| Daily | Follow-ups | `/followups` | Assignable patient reminders board + smart rules (balance/recall/unconfirmed; hourly cron) + auto-rebook on no-show; sidebar due badge; ⌘K quick-add. |
| Daily | Leads | `/leads` | Contact-form triage: status chips, rot borders, convert-to-patient (dedupe), UTM attribution, CSV export. |
| Daily | Intake Forms | `/intake-forms` | v2: photo/insurance-card/conditional fields, OCR autofill, AI pre-visit summary, return-visit pre-fill, smart auto-send, completion reminders, Spanish, OD chart mirror, packets. |
| Growth | Recall & Outreach | `/marketing` | Patient-segment audiences, campaigns w/ funnel attribution (sent→opened→clicked→booked), outreach queue, birthday/reactivation auto-sends (retention-automation crons), templates. |
| Growth | Reviews | `/reviews` + `/received` | **Google-first auto-loop**: completed visit → auto review request → Google; synced Google reviews auto-feature at `feature_min_stars` (default 4★+); per-review hide; private-feedback path; Facebook reviews read-only. Reviews is the ONLY testimonial manager. 1–2★ escalation. |
| Growth | Social Posts | `/social-posts` | Multi-platform composer (GBP + connected socials) w/ preview studio, video, calendar ⇄ list ⇄ showcase views, comment manager. Gated by what's connected, not plan. |
| Growth | Analytics | `/analytics` | Premium. Scorecard hero + trends vs previous window + funnels + proof panels (retention/reputation/social) + GSC + GBP local actions + social performance. Honest PMS-deferral block. |
| Website | Website Editor | `/website` | Full-screen in-place Studio (iframe of the real site, EditBridge, per-section modals, AI bar). `/settings/clinic` is the deep-edit fallback. |
| Website | Blog Posts | `/posts` | Clinic blog manager (platform org authors the marketing blog through the same system). |
| Website | SEO | `/seo` | Site health, GSC (shared platform Domain-property connection, per-clinic scoped reads), GBP local metrics + top keywords. |
| Website | Careers | `/careers` | Premium. Roles + ATS pipeline; public postings w/ JobPosting JSON-LD + jobs.xml. |
| Business | Shop | `/shop` | Premium. Catalog, Stripe Connect storefront + checkout, orders/fulfillment, payments reconciliation, memberships (subscription checkout), coupons + birthday codes, low-stock nudge, CSV exports. |
| Business | Integrations | `/integrations` | Catalog-driven marketplace + **feature bundles** (activating one surfaces its modules in the sidebar). PMS: Open Dental two-way (detail page = full sync dashboard); GBP + socials via Zernio; Gmail; Stripe. Social caps + paid add-on live here. |
| Settings | Settings | `/settings` | Card-grid home → 14 focused pages (clinic, practice, locations, portal, automations/emails, message-templates, team, apps, seo, billing, account, notifications, security, feedback) + 2 redirect stubs (plans, reminders). |

**Platform tenant** (`lib/modules/platform.ts`): overview, clinics (+ managed
provisioning + demo entry), client messaging, MRR/subscriptions (`/ecommerce/
invoices`), **partners** (`/partners`), sales pipeline, **prospecting**
(`/platform/prospecting` — Dream Create's own outbound engine: NPPES dental-
clinic discovery → enrichment/scoring → AI outreach → call list; schema
`lib/db/schema/prospecting.ts` is platform-global, NO organizationId by
design; ships behind kill switch + dry-run; say "prospect", never "lead"),
service library (`/platform/service-library`), platform blog, developer,
settings.

**Patient tenant**: the clinic-branded portal (`app/(portal)/patient/*`) —
next-visit card, reschedule/cancel w/ notice windows, booking, forms, billing
(PMS balance + online balance payments via Connect), records, messages,
family access, magic-link sign-in, per-clinic feature toggles + preview.

**Public clinic sites** (`app/site/[slug]/`): Tend-style template — home,
services (+AI-customized detail pages), insurance, payment-financing,
dental-plans, about/team/blog/careers/faq, booking w/ slot picker, intake
(+packets), shop, review landing `/r/[token]`. Brand-derived palette
(`lib/clinic-site-theme.ts`, WCAG-checked), JSON-LD suite, per-clinic
sitemap/robots/OG.

## Key subsystem reference

- **Stripe (platform billing)**: `lib/stripe-config.ts` PLANS (Basic $150 /
  Pro $250 / Premium $500 mo; annual = 2 months free — repriced 2026-07-02,
  new Stripe Prices must be created + env ids swapped; beta users lock in via
  coupons) + Stripe Tax (automatic_tax on every platform checkout + plan
  swap; activate Tax + registrations in the Stripe dashboard) + the social
  add-on
  prices (Pro $30/mo · Premium $20/mo, live). Webhook
  `/api/webhooks/stripe` (idempotency ledger `stripe_webhook_event`) syncs
  `clinic_profile` plan/subscription state + accrues partner commissions.
  Managed provisioning: platform adds a clinic w/ reserved plan + custom coupon
  or comped; owner accepts invite → `/billing/activate`.
- **Trial**: every new clinic starts a no-card 7-day full-Premium trial
  (`lib/trial.ts`; `TrialBanner`/`TrialEndedWall` in dashboard-shell; escalating
  reminder emails via the `trial-reminders` cron, recorded on
  `clinic_profile.trialRemindersSent`).
- **Referral partners**: `lib/services/referrals.ts` (+ `referral-payouts.ts`,
  Stripe Express, $25 floor). Commission accrues per paid invoice
  (unique on `stripe_invoice_id`). Platform manages at `/partners`; partners
  see `/partner`.
- **PMS (Open Dental, two-way)**: `lib/services/pms/` — provider abstraction,
  sync engine (entity map, DateTStamp delta, write-back queue + retry,
  health monitor), CommLog mirroring from 6+ send sites, recall sync, hourly
  cron. Clinic-tz wall-clock conversion in `pms/datetime.ts`. Blocked item:
  schedule-driven availability awaits OD vendor-portal approval.
- **Zernio (GBP + social)**: `lib/zernio.ts` + services (`zernio.ts`,
  `google-reviews.ts`, `facebook-reviews.ts`, `gbp-sync.ts`, `gbp-metrics.ts`,
  `social-posts.ts`, `social-comments.ts`, `social-metrics.ts`,
  `social-billing.ts`). Per-plan social caps (basic 0 · pro 1→3 · premium 2→5
  w/ add-on); GBP free/uncapped. All demo-safe (isDemo never networks) +
  best-effort (never throw to the UI).
- **Email identity**: Tier 1 `"Clinic Name" <slug@dreamcreatestudio.com>` w/
  deliverable Reply-To; Tier 2 sends as the clinic's connected Gmail with
  Tier-1 fallback. Automated patient-email copy is clinic-editable
  (`lib/services/email-automations.ts`, 7 keys, deviations in
  `clinic_profile.email_automations`).
- **AI surfaces**: website copy rewrite (tier allowance via `ai_usage_counter`),
  service customization, welcome-interview site generation, message draft
  replies, intake summaries + insurance OCR + Spanish translation, blog drafts,
  mailbox triage. All metered per org/month; all review-before-save.
- **Search**: ⌘K palette (`lib/services/global-search.ts`) — searches patients/
  visits/leads/threads/campaigns/applicants/products/reviews/saved views/pages
  and ACTS (add follow-up, tag patient, quick-create).
- **Crons — 15 routes, all `Authorization: Bearer $CRON_SECRET`:**
  `pms-sync` (hourly) · `send-reminders` (30m, incl. forms reminders) ·
  `send-scheduled-campaigns` (15m, also flushes scheduled messages) ·
  `auto-send-reviews` (hourly) · `customize-services` (hourly) ·
  `sync-google-reviews` (hourly, Google + Facebook) · `sync-gbp` (hourly) ·
  `retention-automations` (daily) · `followup-rules` (hourly) · `daily-digest`
  (daily) · `trial-reminders` (daily) · `prospect-discovery` (6h) ·
  `prospect-enrich` (30m) — 13 EventBridge rules managed by
  `scripts/setup-cron-schedules.sh` (re-run it when adding a job) + 2
  pre-existing out-of-band rules (`publish-scheduled-posts`,
  `gmail-watch-renew`).

## Conventions

- Stay on `main`; merge PRs the assistant opens; no long-running branches.
  (Current phase: the user has OK'd committing directly to `main` — one beta
  user with no data, one demo clinic.)
- Service modules in `lib/services/` are `import 'server-only'`; client-safe
  types in `lib/types/`. Server actions live next to their route (`actions.ts`
  user-facing, `admin-actions.ts` platform-admin w/ `requireTenant` + role check).
- All authenticated layouts go through `<DashboardShell>`.
- After mutating a session field, navigate via `window.location.assign()` (not
  `router.push()`) so middleware + tenant context see the new state.
- Stripe / DB / better-auth / Zernio clients are lazy Proxies so `next build`
  runs keyless.
- **Timezone rules above are conventions** — new server-side time renders and
  day windows must use the clinic-tz helpers.
- **Demo persona anchoring above is a convention** — new seeded artifacts ride
  `getPersonaAlignedPatientIds` + a cleanup marker.
- **For UI / public-site / font / next-config PRs run `pnpm build`, not just
  tests** — happy-dom misses build-only failures (fonts, turbopack resolution,
  server/client boundary slips). `next/font/google` is banned (build env can't
  reach Google Fonts; use runtime `<link>` or the npm `geist` package).
- **No fake content.** Every UI placeholder reads a real DB column; the demo
  seeder populates every column shown anywhere (empty/common/edge covered);
  self-heal backfills legacy demos. Ship wiring + seed + self-heal in one PR.
- Vertical slices: schema + service + UI + tests in one PR. Tenant scoping is
  non-negotiable. Tests before merge (`pnpm test` <4 min).
- Voice: warm, plain, anti-shame ("3 still need a text", never "3 records
  pending confirmation"). See DESIGN.md for the full copy rules.

## Deployment & operations

- **Prod**: App Runner service `dreamcrm` (us-east-1) serving ECR `:latest`;
  VPC connector → private RDS + NAT egress; health check `/api/health`.
- **Deploy = merge to `main`**: GitHub Actions (`deploy.yml`, OIDC role
  `DreamCRMGitHubActionsDeploy`) → CodeBuild `dreamcrm-image-build` (buildx +
  registry cache tag `:buildcache`) → ECR → `start-deployment`. ~4-5 min
  end-to-end; watch the Actions tab. `NEXT_PUBLIC_*` bake at build time.
- **Migrations auto-apply on boot** (`scripts/db-migrate.mjs` → POST
  `/api/admin/migrate`; failure keeps the previous version serving). Latest
  migration: **0114**. Workflow: `pnpm db:generate`, commit, merge.
- **Demo auto-resync on boot** (`scripts/resync-demo.mjs` → `createDemoClinic()`
  self-heal; idempotent; scoped to the isDemo org).
- **Secrets**: Secrets Manager `dreamcrm/app-secrets` → App Runner runtime
  secrets; driver switches are plain env vars. Secret changes need a redeploy.
- **DNS**: name.com. `www` canonical; `app.` + apex redirect; `*` wildcard CNAME
  → App Runner (+ ACM validation records). Custom clinic domains associate via
  the App Runner API (runbook `docs/custom-domains.md`).
- **Monitoring**: CloudWatch alarms (RDS + App Runner) → SNS `dreamcrm-alerts`;
  30-day log retention.
- **AWS facts**: account `952078552817`; RDS `dreamcrm-db` (t4g.micro,
  encrypted, PI on, deletion protection); S3 `dreamcrm-uploads-prod` +
  `dreamcrm-codebuild-952078552817`; EventBridge connection `dreamcrm-cron` +
  role `DreamCRMEventBridgeCron`; VPC `vpc-066acff3800b34067`. App Runner is
  closing to new customers (Apr 2026) — existing workloads keep running; plan
  an eventual ECS move.
- Vercel now hosts ONLY the bare-apex→www redirect (retire when the domain
  moves off Replit to a registrar with apex flattening).

## Open items (priority order)

1. **ROTATE / REVOKE secrets shared in chat** (user's action item): the Stripe
   restricted key `rk_live_…` (revoke — no longer needed); AWS keys
   `AKIA53LCNZ3YTC3H5M55` (rotate), `AKIA53LCNZ3Y2IP4CWFS` (dead — delete),
   `AKIA53LCNZ3Y66OJGLOI` (rotate); Resend key `re_BZDw…` (mint fresh, swap in
   Secrets Manager, delete dead `re_T8fyc…`).
2. **The finishing pass is CLEAR** (2026-07-02) — every item in
   `docs/FINISHING.md` is fixed, decided, or accepted. Log NEW seam bugs
   there as they surface (hunting method at the bottom of that doc).
3. **Inbound email replies → `/messages`** for Tier-1 senders (Gmail Tier 2
   already loops back; a dedicated inbound-parse path is the full fix).
4. **OD vendor portal approval** (in flight) — unblocks schedule-driven booking
   availability (`/schedules`) + real-office Customer Keys. On approval: swap
   `PMS_OPEN_DENTAL_DEVELOPER_KEY`, generate per-office Customer Keys, office
   installs eConnector.
5. **Phase B — SMS** (AWS End User Messaging + A2P 10DLC): unlocks Recall,
   Messages, and Reviews SMS. Schema stubs exist (`clinic_sms_config`,
   `twilio_*`-named columns kept, channel enum in place).
6. **Platform webhook idempotency** shipped; remaining billing nicety: review
   auto-send timing anchored to `completedAt` vs visit time.
7. Misc deferred: Zernio review webhooks (hourly cron covers today), FB reply
   (no Zernio endpoint), per-staff booking widgets, patient-view audit log, 2FA,
   per-location booking, `notification_prefs.push_everything` drop.

## Working in a new session (Claude Code on the web)

- Deps auto-install via the SessionStart hook (`.claude/hooks/session-start.sh`);
  `pnpm dev` / `test` / `typecheck` work immediately.
- AWS CLI is not preinstalled — install on demand (see HISTORY.md for the
  one-liner); credentials come from the environment settings (never paste keys
  into chat; rotate anything that was).
- GitHub goes through the MCP tools; deploys are merge-to-main.

## Useful commands

```bash
pnpm dev                  # local dev
pnpm build                # next build (REQUIRED for UI/font/config changes)
pnpm db:generate          # drizzle-kit generate (after schema changes)
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest run (~4,200 tests)
pnpm test:watch
```

## Test account

- `dustin@dreamcreateweb.com` — platform admin (Dream Create org owner).
  Password rotates via Settings → Account.
