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
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | The binding dashboard UI system (v3 "Cute Dream, Living Data" — dream blue, bubbles, Nunito, living-data law; re-skinned from v2 2026-07-17) — semantic tones, glyphs, motion, components. Read before touching dashboard UI. |
| **This file** | Current implementation state: architecture, module map, subsystem reference, conventions, ops. |
| [`docs/HISTORY.md`](./docs/HISTORY.md) | The chronological session-by-session build log (moved out of this file 2026-07-02). Per-session implementation detail lives there. |
| [`docs/FINISHING.md`](./docs/FINISHING.md) | The living "finishing pass" punch list — known seam bugs + polish gaps, by class. |
| [`docs/COMPETITIVE-GAPS.md`](./docs/COMPETITIVE-GAPS.md) | The module-deepening roadmap: per-module feature gaps vs NexHealth/RevenueWell/Weave/etc. Every P1 + P2 shipped; only the P3/SMS-gated tail remains. |
| [`docs/STRUCTURE-AUDIT.md`](./docs/STRUCTURE-AUDIT.md) | The information-architecture reference: full feature inventory by purpose, competitor IA benchmarks (NexHealth/Weave/Birdeye/Kleer/Shopify/…), placement verdicts, and the redesign log (Payments split, rejected moves). Read before moving/renaming any surface. |
| `docs/zernio-google-integration.md` · `docs/intake-forms-overhaul.md` · `docs/custom-domains.md` · `docs/inbound-email.md` | Deep-dive specs for those systems. |

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
  Inbound patient replies → /messages are LIVE (2026-07-23:
  `INBOUND_REPLY_DOMAIN=in.dreamcreatestudio.com`, Resend inbound domain +
  MX at name.com, webhook on www w/ all events incl. email.received +
  email.opened, open tracking on) — `lib/inbound-email.ts` pure helpers +
  `lib/services/inbound-reply.ts`; runbook `docs/inbound-email.md`. The
  SENDING domain receives too (apex MX, same day): fresh mail to
  `slug@dreamcreatestudio.com` rides the same clinic flow; non-slug locals
  (hello@, support@) forward to platform owners/admins. Email-auth posture:
  DMARC p=quarantine + apex SPF `-all` + registrar autorenew ON (see the
  runbook's posture section).
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
  site/[slug]/       Public clinic sites — MULTI-TEMPLATE (clinic_profile.
                     template picks the design: 'modern' Tend-style family
                     default, 'cosmetic' charcoal/cream luxury, 'pediatric'
                     playful pastels w/ the /coloring kids' corner, 'hometown'
                     no-photos-needed classic (solid brand hero + marigold
                     hours card); /book,
                     /services,
                     /intake, /shop, /careers, /blog, /team, …). Page SHELLS own
                     every read/SEO/gate and dispatch typed props to the active
                     template's renderers. Fonts via runtime <link>, NOT
                     next/font (build env can't reach Google)
  r/[token]/         Patient review landing — token IS the auth; Google-first
                     (+ optional star-gate triage). Siblings on the same
                     token-IS-auth pattern: w/ (fast-pass claim), c/ (one-click
                     visit confirm), b/ (email-to-pay balance page)
  api/               auth handler · webhooks (stripe, stripe-connect, gmail OIDC,
                     resend/svix) · 17 CRON_SECRET-gated /api/cron/* routes ·
                     3 /api/admin/* (migrate, seed-platform, resync-demo) ·
                     oauth (gmail, gsc) + connect (shop) + zernio connect/callback ·
                     token-auth publics (/api/calendar/[token], track, unsub) ·
                     /api/internal/custom-domains (host→slug map for middleware)

lib/
  db/schema/         auth.ts, platform.ts, clinic.ts (bulk), domain.ts, email.ts,
                     referrals.ts, index.ts
  db/migrations/     drizzle; 0000–0138 applied to prod (auto-apply on deploy)
  auth/              server.ts, client.ts, context.ts (getTenantContext,
                     requireTenant/requireRole/requirePartner)
  services/          ~135 server-only modules (import 'server-only') — one per
                     entity/subsystem; demo-clinic.ts is the demo seeder
  modules/           Sidebar registries per tenant type (clinic/platform/patient/
                     partner) — ModuleDef w/ roles + requiresBundle +
                     pinned/shortcut gating
  integrations/      catalog.ts (pure IntegrationDef registry) · resolve.ts (pure
                     runtime status) · bundles.ts (feature bundles → sidebar)
  site-templates/    THE public-site template system: types (SiteTemplateDef),
                     client-safe catalog, registry (unknown id → modern),
                     resolve.ts (stored template + owner preview cookie, re-
                     gated per request), per-template palette recipes emitting
                     the same --c-* vars, manifest for the scanning tests.
                     Renderers live in components/clinic-site/templates/<id>/;
                     conformance harness (tests/site-templates/) auto-enrolls
                     every registered template. Studio 🎨 Design picker
                     previews/applies; content is universal so switching is
                     instant + reversible.
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
  inbound-email.ts   Pure inbound-reply helpers (recipient slug, quoted-reply
                     strip, payload normalize) — dark behind INBOUND_REPLY_DOMAIN

components/ui/       dashboard-shell.tsx (all authed layouts go through it),
                     tenant-sidebar.tsx, the 10 v2 primitives (PageHeader,
                     ActionButton, StatusPill, FilterChip, GlyphCluster,
                     EncodingLegend, EmptyState, BulkBar, KpiStat, FlashToast)
                     + charts/ — THE chart kit (2026-07-26, Recharts):
                     TrendChart (axes + crosshair tooltip) / MiniTrend (hover
                     spark); series colors ride the validated --color-chart-*
                     tokens (fixed order, dark-aware); old Sparkline is a
                     compat wrapper; tests/ui/chart-kit.test.ts guards against
                     new hand-rolled polylines
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

Sidebar groups: **Daily** / **Growth** (workspace hub) / **Website** (workspace
hub) / **Business** (Payments · Shop · Integrations) + a pinned
**Settings** entry (card-grid home). All modules are **live** — there are no
`status:'soon'` placeholders left. Deep implementation history per module:
`docs/HISTORY.md`.

| Section | Module | Path | Notes |
|---|---|---|---|
| Daily | Overview | `/` → `/dashboard` | Morning-huddle: today's chair, attention cards, trends, activity feed, integrations-health banner, follow-up summary. Clinic-tz day windows. |
| Daily | My Day | `/my-day` | Per-staff cockpit: my/unclaimed follow-ups, my conversations, today's schedule, collections nudge. Mirrored by the opt-in morning digest email (per-staff opt-out). |
| Daily | Messages | `/messages` (double-sidebar) | Front-style unified patient inbox (in_app + email; SMS deferred). Receipts (in-app read + email Delivered/Opened/bounce via tagged Resend webhooks, 2026-07-14), attachments, AI draft, quick-book, scheduled send, star/unread, auto-reply after hours. ACTIVITY MARKERS (2026-07-23): every automated touch (reminders, campaigns+opened, bookings/cancels w/ actor, review asks, balance nudges, surveys, forms) interleaves the thread as thin gray context lines — read-time merge (`lib/services/thread-activity.ts`, no new write paths, history backfills free); LAW: markers never bump unread/reopen/reorder and never render in the patient portal; runs of 4+ collapse; open/click signals attribute per-send; pre-history older than 14d before the first message trims (the patient timeline keeps it all). Gmail mailbox at `/inbox`. |
| Daily | Appointments | `/appointments` | Agenda grouped by clinic-local day; window chips; aging borders; drawer (confirm/reschedule/cancel/no-show + review request); bulk actions; saved views; CSV call-sheet export. |
| Daily | Patients | `/patients` + `/patients/[id]` | Relationship record: glyphs, filters, saved views (promote-to-audience), tags, documents, merge, CSV import/export, bulk email/portal-invite. Detail: timeline (clinic-tz), needs-attention, notes, follow-ups. |
| Daily | Follow-ups | `/followups` | Assignable patient reminders board + smart rules (balance/recall/unconfirmed; hourly cron) + auto-rebook on no-show; sidebar due badge; ⌘K quick-add. |
| Daily | Leads | `/leads` | Contact-form triage: status chips, rot borders, convert-to-patient (dedupe), UTM attribution, CSV export. |
| Daily | Intake Forms | `/intake-forms` | v2: photo/insurance-card/conditional fields, OCR autofill, AI pre-visit summary, return-visit pre-fill, smart auto-send, completion reminders, Spanish, OD chart mirror, packets. |
| Growth | Growth (workspace) | `/growth` | ONE sidebar entry. Hub REDESIGNED 2026-07-26 (v3, "acquisition leads, two engines"): hero = New-patients scoreboard (trailing-4-week total + 12-week heartbeat via the once-unused `getNewPatientsPerWeek12` + per-channel "what's pulling them in" rows w/ honest connect states), band 2 = the reactivation funnel from `getRecallStats` (due&reachable → sent → opened → booked back + next-send/quiet-engine status line), number-first news cards w/ attention tones (leads to triage; reviews waiting on a reply — urgent when any 1–2★ via `lowStarNeedsReply`; social), utility footer (Audiences · queue · Analytics); New campaign = header primary → `/growth/outreach?new=1`. Sub-pages: `/growth/outreach` (the clinic recall dashboard — audiences/campaign funnels/auto-sends; component stays in `app/(default)/marketing/`, shared with the platform tenant), `/growth/outreach/queue` (tiered outreach queue), `/growth/campaigns/[id]` (the campaign editor; serves BOTH tenants — the clinic's campaign LIST folded into the `/growth/outreach` hub 2026-07-21, campaigns phase 3: history + funnels + the New-campaign modal live there, `/growth/campaigns` redirects clinic→hub w/ prefill params forwarded while the platform tenant keeps the standalone list), `/growth/audiences`, `/growth/reviews` + `/received` (**Google-first auto-loop**: completed visit → auto review request → Google; synced reviews auto-feature at `feature_min_stars`; private feedback; Facebook read-only; the ONLY testimonial manager; 1–2★ escalation), `/growth/social` (multi-platform composer, gated by connected channels not plan; hub door shows a connect prompt), `/growth/analytics` (scorecard + funnels + proof panels + GSC/GBP + social performance). Old paths (`/marketing/*` clinic surfaces, `/reviews(+/received)`, `/social-posts`, `/analytics`) are 308 stubs — notification-email deep links keep working. `/marketing` + `/marketing/pipeline` remain the PLATFORM tenant's marketing home (clinic hits 308 to `/growth/outreach`). Folded-area labels ride `FOLDED_AREAS` in `lib/modules/index.ts`; quick-create capability ids ('campaigns', 'blog') come from dashboard-shell. |
| Website | Website (workspace) | `/website` | ONE sidebar entry → the Shopify-style hub (v3 redesign 2026-07-24: the clinic's OWN homepage as a live scaled browser-frame hero via the beacon-free `/site/[slug]/tf/` route, setup ProgressRing + open checklist beside it — collapses to quiet quick-facts when done, SVG gradient area sparkline on the 30-day band; bottom half = three zones shaped like their contents: "What's happening" number-first news cards (Forms/Blog/SEO/Careers, no brochure copy) + a "Quick edits" dock (Hours/Services/Team/Photos — MODALS on the hub reusing the Content page's editors + scoped actions, hours live-instant / rest draft-staged) + a quiet utility footer (Design · Pages · Domain · Share links; Domain pill only off-neutral)), go-live checklist (real states only). Quick-edits UX law: the hub surfaces what a front desk changes weekly (hours, services, team, photos, ANNOUNCEMENT) as modals; day-one/rare surfaces (design, pages) demote to text links, editor stays the header primary. Announcement bar (2026-07-24, migration 0134 `clinic_profile.announcement` jsonb): a thin brand-deep strip above the header on every public page + template (rendered once in `app/site/[slug]/layout.tsx` via `components/clinic-site/announcement-bar.tsx`); LIVE-INSTANT (not a draft column) + self-expiring (inclusive clinic-local `endsAt`, resolved by pure `activeAnnouncement` in lib/types/clinic-content.ts); optional link sanitized (`sanitizeAnnouncementHref`, site-relative or http(s) only) at BOTH save and render. Sub-pages: `/website/editor` (the full-screen Studio — EditBridge, section modals, AI bar, page navigator, 🎨 Design picker; honors `?previewTemplate=`/`?page=` deep links), `/website/content` (THE plain-form home for site content — per-section forms riding the Studio's scoped actions; `CONTENT_SECTIONS` registry in `lib/website-content-sections.ts`), `/website/design` (template cards + brand color + hero media + intro video), `/website/pages` (unified page manager — `buildSitePagesIndex` live/needs-content rows, per-page copy-override editing via `saveInlineField`, Search-appearance meta editor), `/website/forms` (both LeadFormBuilders + chat-widget toggle + submissions glance), `/website/blog` (was `/posts`; platform org authors the marketing blog through it too), `/website/seo` (was `/seo`), `/website/careers` (was `/careers`; ATS + JSON-LD), `/website/domain` (auto-polling custom-domain card), `/website/share` (QR cards). Old paths 308 via route-level stubs (NEVER next.config — it would hijack public clinic-site paths pre-middleware). `/settings/clinic` is now the identity-only **Business profile** (names, contact/email sender, address, hours, timezone, logo + GBP sync/calendar feed) — `updateClinicProfile` is identity-only BY CONTRACT: a website column in its payload would be nulled on every identity save (tests/settings/clinic-actions.test.ts pins the exclusion). **Draft→Publish (2026-07-12)**: every website save STAGES to `clinic_profile.website_draft` jsonb (identity columns stay live-immediate) — pure core `lib/website-draft.ts` (WEBSITE_DRAFT_COLUMNS/merge/split/changes), server plumbing `lib/services/website-draft.ts` (`stageWebsiteValues` routes ALL writers: writeSection, AI edit, services picker, seoMeta); a verified editor sees the merged view via the overlay in `loadSite` + `getClinicThemeBySlug` (visitors never do; owner-facing DraftPreviewBanner pill on the site); Publish/Discard live on the hub (PublishCard) + Studio top bar; publish records ONE `__publish` history entry so undo-after-publish reverts live, while normal undo walks draftable columns back INSIDE the draft. Editing surfaces read `getEffectiveWebsiteProfile`; Pages/hub live-pills read the raw row on purpose. **Template gallery (2026-07-12)**: `/website/templates` — practice-type categories + style-tag filters + sort, one card per design with a LIVE scaled iframe of the clinic's own homepage in that template via the side-effect-free frame route `/site/[slug]/tf/[template]` (middleware stamps the `x-dc-template-frame` request header for that path; `resolveActiveSiteTemplate` honors it per-request for a verified editor, beating the preview cookie — six cards render six templates without clobbering; `isFrame` makes the layout suppress beacon/chat/banners/EditBridge). Catalog metadata lives on `SITE_TEMPLATE_CATALOG` (practiceTypes/styleTags/bestFor); the Design page slims to a current-design summary + gallery door; Apply stages `template` to the draft. |
| Business | Payments | `/payments` | Payments bundle. The money workspace (split out of Shop 2026-07-14; Weave/Pearly pattern): hub w/ KPI story (Outstanding → To reconcile → Payment plans → Recurring MRR) + Stripe status + doors → Online payments (`/payments/online`, reconciliation + deposits), Collections (`/payments/collections`, dunning + payment plans), Memberships (`/payments/memberships`; powers the site's /dental-plans page). Old `/shop/*` money paths 308. |
| Business | Shop | `/shop` | Pure commerce: hub w/ Orders + Coupons doors + Stripe Connect status + catalog + loyalty config. Storefront + checkout, orders/fulfillment, coupons + birthday codes, low-stock nudge, CSV exports; Recurring KPI drills into Payments. |
| Business | Integrations | `/integrations` | Catalog-driven marketplace + **feature bundles** (activating one surfaces its modules in the sidebar). PMS: Open Dental two-way (detail page = full sync dashboard); GBP + socials via Zernio; Gmail; Stripe. Social caps + paid add-on live here. |
| Settings | Settings | `/settings` | Card-grid home → 13 focused pages (clinic = the identity-only Business profile, practice, locations, portal, automations/emails, message-templates, team, apps, billing, account, notifications, security, feedback) + 3 redirect stubs (plans, reminders, seo → /website/pages). |

**Platform tenant** (`lib/modules/platform.ts`; sidebar sections Daily / Customers / Sales / Insights / Content since 2026-07-13; the redundant Marketing funnel row dropped; prospecting has a persistent sub-nav layout): overview, clinics (+ managed
provisioning + demo entry), client messaging, MRR/subscriptions (`/ecommerce/
invoices`), **partners** (`/partners`), sales pipeline, **prospecting**
(`/platform/prospecting` — Dream Create's own outbound engine, "The
Hunter": NPPES discovery (two-phase org NPI-2 → solo-dentist NPI-1 cursor
via `prospect_discovery_task.entity_phase`) → enrichment/scoring (incl.
brand capture: theme-color, icon, site name) → REACHABILITY
(`prospect_contact`: crawl finds every address on the site incl. team/about
pages, `lib/prospect-email.ts` classifies role + `prospect-email-verify.ts`
MX-verifies, best deliverable one mirrored to `prospect.email`; un-emailable
hot prospects surface in a phone-first queue) → segment-matched
AUTO-ENROLLMENT (`lib/prospect-segment.ts`: no-website / weak-website /
weak-presence → three pitch sequences; hottest-first, daily-capped, runs in
dry-run) → AI drip outreach → reply intent classification → CALL LIST with
instant bell+forced-email alerts + AI reply drafts (`prospect.reply_draft`)
→ CALL MODE (`/platform/prospecting/call-mode` — the anti-cold-call
cockpit: one card at a time, cached AI cold-call script per prospect
(`prospect.call_script` 0125, `lib/services/call-script.ts` — opener /
why-them / brush-off answers / ask / 20-sec voicemail; next card's script
prefetches during the call), email open/click warm signals, tel: +
prospect-local time, one-tap outcomes through logCallOutcome w/
auto-advance, inline demo-time booking via `bookDemoForProspectAction`,
best-time-to-call ordering + prospect-local window hints (`callWindowScore`),
and a 🎭 PRACTICE booth — rehearse against an AI playing that practice's
front desk, then get zero-shame coaching (`lib/services/practice-call.ts`))
→ SELF-BOOKING demo close (`prospect_meeting` + public `/d/[token]`,
token-IS-auth; prospect picks a slot from the owner's availability in their
OWN tz, both sides get an add-to-calendar link; reminders 24h out;
`lib/prospect-booking.ts` pure slot math, `lib/services/prospect-meetings.ts`;
ships booking OFF; when ON, every outreach touch from step 2 carries the
prospect's booking link) → AI demo prep brief (`/platform/prospecting/demo/[id]`) → CONVERT to a
managed clinic that BOOTS IN THEIR BRAND (captured theme-color/logo seeds
`clinic_profile`) → prospect-branded
presenter mode (demo_skin cookie overlay, zero DB writes: chrome branding,
8-beat keyboard panel w/ per-prospect gap callouts, `/demo/compare`
their-site-vs-ours in their brand color). A deliverability WATCHDOG
(`lib/prospect-deliverability.ts`, trailing-72h bounce/complaint) auto-pauses
live sending to dry-run on a breach; a daily hunt DIGEST
(`lib/services/prospecting-digest.ts`) + a hunt COCKPIT (`hunt-panel.tsx`,
last-24h activity + engine status) surface the machine. The DAILY WORKSPACE
layer on top (the owner's cockpit for driving sign-ups): a morning DAILY
BRIEFING (`daily-briefing.tsx`, next-best-action ladder), never-drop-a-lead
FOLLOW-UPS (`prospect.next_follow_up_at`), a per-prospect DEAL ROOM
(`lib/prospect-vendors.ts` — who we'd displace + consolidation ROI), the
editable BRAIN (`config.brain` — owner product-knowledge override + competitor
battle cards → `effectiveProductKnowledge`, fed into every prospecting AI), the
hunt COPILOT (`copilot-bar.tsx`/`lib/prospect-copilot.ts` — ⌘J natural-language
Q&A over a live snapshot; suggests engine actions, never auto-mutates), the
WIN/LOSS pipeline + learning loop (`getWinLossReport` + `lib/prospect-
learnings.ts` — captures why we lose, feeds "what's converting / top objection"
back into outreach above a min sample), and the TERRITORY map + focus mode
(`getTerritoryCoverage` + `lib/prospect-territory.ts` + `config.focus.state`).
Schema `lib/db/schema/prospecting.ts` is platform-global, NO organizationId by
design; ships behind kill switch + dry-run + auto-enroll-off; say
"prospect", never "lead"),
service library (`/platform/service-library`), platform blog, developer,
settings.

**Patient tenant**: the clinic-branded portal (`app/(portal)/patient/*`) —
next-visit card + per-visit detail pages (`appointments/[id]`: action hub,
clinic's per-type prep copy, pending-forms task, directions), reschedule/
cancel w/ notice windows, waitlist self-enroll ("notify me if something opens
sooner" → the staff fast-pass list), booking, forms, billing (PMS balance +
online balance payments via Connect + patient-started payment plans + open-
plan status + membership upsell), in-portal post-visit 0–10 survey (same NPS
rows/escalation as the email engine), records, messages (unread badge in the
chrome), family access + link requests via the message thread, magic-link
sign-in, per-clinic feature toggles (incl. waitlist + referrals) + preview.
Portal color tokens live in `components/patient-portal/ui.tsx` (PORTAL_*).

**Public clinic sites** (`app/site/[slug]/`): Tend-style template — home,
services (+AI-customized detail pages), new-patients (first-visit guide),
insurance, payment-financing, dental-plans, about/team/blog/careers/faq,
privacy/accessibility, booking w/ slot picker, intake (+packets), shop,
review landing `/r/[token]`. Brand-derived palette
(`lib/clinic-site-theme.ts`, WCAG-checked) + signature decor
(`components/clinic-site/decor.tsx`), JSON-LD suite, per-clinic
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
- **The voice (Transformation Phase 2)**: `lib/services/proposals.ts` (the
  proposal primitive — idempotent `sourceKey` filing, atomic approve-claim,
  per-capability executors, reopen-on-failure, expire-on-stale; approved
  executions ledger ONCE under the proposal's capability — sendCampaign gets
  the approver's id so campaign_send stays silent) ·
  `proposal-generators.ts` (4 generators + invalidation sweep, hourly cron;
  AI types skip when unconfigured — never a template aimed at a person) ·
  `standup.ts` (the Narrator: prior clinic-week window, plural-noun counts,
  stories, only-you list; Monday email idempotent via
  `clinic_profile.standup_last_sent_at`) · `demo-voice.ts` (seeder). UI:
  Approval Inbox + Standup card at the top of the clinic Overview
  (`app/(default)/dashboard/approval-inbox.tsx`, `standup-card.tsx`,
  `actions.ts`).
- **Search**: ⌘K palette (`lib/services/global-search.ts`) — searches patients/
  visits/leads/threads/campaigns/applicants/products/reviews/saved views/pages
  and ACTS (add follow-up, tag patient, quick-create).
- **Crons — 18 routes, all `Authorization: Bearer $CRON_SECRET`:**
  `pms-sync` (hourly) · `send-reminders` (30m, incl. forms reminders) ·
  `send-scheduled-campaigns` (15m, also flushes scheduled messages) ·
  `auto-send-reviews` (hourly) · `customize-services` (hourly) ·
  `sync-google-reviews` (hourly, Google + Facebook) · `sync-gbp` (hourly) ·
  `retention-automations` (daily) · `followup-rules` (hourly) · `daily-digest`
  (daily) · `trial-reminders` (daily) · `prospect-discovery` (6h) ·
  `prospect-enrich` (30m) · `prospect-outreach` (30m) · `domain-renewals` (daily) ·
  `generate-proposals` (hourly — the Phase-2 proposal generators + staleness
  sweep; the weekly standup email rides `daily-digest` on clinic-local
  Mondays) — 16 EventBridge rules
  managed by `scripts/setup-cron-schedules.sh`, which the **deploy re-runs on
  every merge** (idempotent self-heal — a new cron route can't ship un-fired,
  the drift that once left prospecting + 4 other jobs silently dead); the
  `tests/cron-schedule-parity.test.ts` guard fails CI if a route has no JOBS
  entry. + 2 pre-existing out-of-band rules (`publish-scheduled-posts`,
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
- **Tenant voice is a convention (2026-07-14).** Any surface serving two
  tenants (blog manager, campaigns, audiences, team/notification settings)
  must branch EVERY reader-addressed string — the platform owner must never
  read "your patients"/"your clinic". Branch on ctx.tenantType / a
  recipientNoun-style prop / marketingTerminology.
- **Orientation is a convention (structure passes, 2026-07-13/14).** Top-level
  module pages carry the `<Group> · <clinic name>` eyebrow; workspace
  sub-pages carry a `‹ Workspace` link eyebrow (Growth/Website families) or a
  "← Back to <hub>" action (Payments/Shop families); every workspace sub-page
  must have a path back to its hub. Server actions live next to their ONLY
  consumer's route (see docs/STRUCTURE-AUDIT.md for the audited system).
- **Demo persona anchoring above is a convention** — new seeded artifacts ride
  `getPersonaAlignedPatientIds` + a cleanup marker.
- **NO PLAN GATING is a convention (2026-07-25).** DreamCRM sells ONE plan
  (`PURCHASABLE_PLANS` = Premium only; every creation path provisions
  `planTier: 'premium'`; the trial is full Premium), so tier branching was
  dead code whose `?? 'basic'` fallbacks were live trapdoors — a null tier
  silently cost a clinic its booking page, the booking links in its email,
  and half its sidebar. **Access to the app IS access to the whole app.**
  `requirePlan`/`planAllows`/`minPlan` are GONE; hubs have no upsell cards.
  Still legal and NOT plan gating: **add-on entitlements** (the paid social
  connection cap), **billing STATE** (trial/past-due walls — "are you a
  customer", not "which tier"), `requiresBundle` (integration-derived), and
  the `planTier` column itself (Stripe state + platform reporting).
  `tests/settings/no-plan-gating.test.ts` fails CI if a gate creeps back;
  add genuinely-exempt files to its ALLOWLIST with a reason.
- **Family-safe identity is a convention (2026-07-22, the Maria/John
  incident).** Any flow that attaches inbound activity to a patient by
  contact info must ALSO name-match (`namesLooselyMatch`,
  `lib/patient-identity.ts` — public flows go through
  `resolvePublicPatient`); a mismatch mints a separate record flagged
  "likely family", never a thread/visit on another person's chart. And
  every path that cancels an appointment stamps `cancelledVia`
  (+ `cancelledByUserId` for staff) — phrasing via `lib/cancel-actor.ts`.
- **For UI / public-site / font / next-config PRs run `pnpm build`, not just
  tests** — happy-dom misses build-only failures (fonts, turbopack resolution,
  server/client boundary slips). `next/font/google` is banned (build env can't
  reach Google Fonts; use runtime `<link>` or the npm `geist` package).
- **Shared assets over one-off values (2026-07-06).** Meaning-colors and
  surface vars have single homes with CI guards: portal tones in
  `components/patient-portal/ui.tsx` (PORTAL_ERROR/WARN/SUCCESS/DANGER +
  the primitive kit — BrandButton/GhostButton/PortalInput/PortalErrorText/
  PortalNotice), site surfaces in `components/clinic-site/tokens.ts`
  (SITE_*), the deep-band recipe in `DeepBand` (decor.tsx), brand alpha
  tints via `brandTint()` (lib/brand-tint.ts). Don't re-declare these
  locally — the tests/a11y guards fail CI naming the file.
- **Public-site photos go through `<SiteImage>` (2026-07-25).** Clinics upload
  camera originals (a real headshot landed at 7008×4672 / 6.5 MB); a raw `<img>`
  makes the browser do a ~14× downscale in one crude step and it renders
  GRAINY. `components/clinic-site/site-image.tsx` + `lib/site-image.ts` route
  every clinic-uploaded photo through `/_next/image` with a 1x/2x srcSet sized
  from the painted BOX width (`displayWidth`) — the helper adds object-cover
  crop headroom itself (`COVER_CROP_FACTOR`; a landscape upload in a portrait
  box needs ~2× the box width or it re-blurs), and `lib/image-downscale.ts`
  caps new uploads at 2560px on the long edge. Rules: the host/width/quality
  tables MUST mirror `next.config.js` (the optimizer 400s otherwise — a broken
  public image); anything that swaps an image live must clear `srcset` first
  (it beats `src`); the hero preload uses `HERO_IMAGE_DISPLAY_WIDTH` so it
  fetches the same bytes the template does.
  `tests/clinic-site/site-image.test.ts` fails CI on a new raw `<img>` under
  `app/site`/`components/clinic-site` (documented exceptions carry a reason).
- **No fake content.** Every UI placeholder reads a real DB column; the demo
  seeder populates every column shown anywhere (empty/common/edge covered);
  self-heal backfills legacy demos. Ship wiring + seed + self-heal in one PR.
- Vertical slices: schema + service + UI + tests in one PR. Tenant scoping is
  non-negotiable. Tests before merge — the FULL `pnpm test` (<4 min), not a
  module subset: the repo-wide CI guards (legibility floor, tenant scoping,
  cron parity, token single-homes) only run in the full pass, and deploys
  don't run tests.
- **The phase-audit gate is a convention (2026-07-27; v2 re-shape same
  day).** No transformation phase (or major feature slice) is DONE until the
  `phase-audit` workflow (`.claude/workflows/phase-audit.js`) returns a CLEAN
  round: zero confirmed defects AND zero in-phase depth gaps ("perfection
  plus depth" — the depth chamber asks "would it make sense to add more?").
  v2 cost shape: all subagents run Opus (`model:'opus'`), 4 merged lenses,
  ONE skeptic + ONE judge, and the MAIN LOOP re-verifies every survivor
  against the cited code before fixing (it is the second, decisive vote).
  **HARD CAP: 3 discovery rounds** — the script refuses round 4. The cap
  semantics (owner clarification 2026-07-28): if round 3 still finds
  significant items (any critical/major or in-phase gap), discovery-by-audit
  is the wrong tool — but **the phase still has to reach a clean state, and
  the remaining discovery is the main loop's own job**: fix what round 3
  found, write the owner a root-cause retrospective ("why did this phase
  ship with this many gaps?") in docs/AUDITS.md, run the retrospective's
  lessons as a DIRECT SELF-SWEEP (sibling-sweep every fix from all rounds,
  walk the component × failure-mode matrix, check crash-consistency of
  every claim-then-act), fix what that finds, then confirm with ONE
  `{ verification: true }` round (legal past the cap, only after a
  documented sweep). A phase closes CLEAN or it is not closed — the
  retrospective is never the finish line. Certificates + the owner's
  depth-backlog menu live in docs/AUDITS.md too. (Phase 1's rounds 1–5 ran
  under v1 — 9 lenses, 3+3 voters, Fable subagents, two-consecutive-clean
  dry — which consumed ~75% of a monthly quota in one night; v2 exists so
  that never happens again.)
- **The North Star is a convention (2026-07-27).** DESIGN.md's "the employee,
  not the tool" doctrine governs every new feature: the design test is "does
  this ask the clinic to operate something, or does it do the job and
  report?" New capabilities ship as proposal types + Action Ledger entries,
  never as new pages to operate. Journey stage (inquiry → booked → patient)
  is DERIVED, never hand-stamped; "new patients" means SEATED everywhere.
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
  migration: **0138** (`proposal.original_body` — the autonomy ladder; 0137
  was `proposal` + `clinic_profile.standup_last_sent_at`, the voice). Workflow:
  `pnpm db:generate`, commit, merge.
- **Demo auto-resync on boot** (`scripts/resync-demo.mjs` → `createDemoClinic()`
  self-heal; idempotent; scoped to the isDemo org).
- **Secrets**: Secrets Manager `dreamcrm/app-secrets` → App Runner runtime
  secrets; driver switches are plain env vars. Secret changes need a redeploy.
- **DNS**: name.com. `www` canonical; `app.` + apex redirect; `*` wildcard CNAME
  → App Runner (+ ACM validation records). Custom clinic domains: NEW ones are
  CloudFront distribution tenants (multi-tenant dist `E176U1KOAVOGGO`,
  connection group endpoint `d33npqpgmkgof7.cloudfront.net`, zero-touch managed
  certs; `CUSTOM_DOMAIN_DRIVER=cloudfront`) — no cap, ~$0.10/domain/mo at
  scale; legacy App Runner associations (5-per-service hard cap) keep working
  via the driver stamped on their status (runbook `docs/custom-domains.md`).
  ECS compute move planned behind CloudFront (App Runner closes to new
  customers Apr 2026).
- **Monitoring**: CloudWatch alarms (RDS + App Runner) → SNS `dreamcrm-alerts`;
  30-day log retention.
- **AWS facts**: account `952078552817`; RDS `dreamcrm-db` (t4g.micro,
  encrypted, PI on, deletion protection); S3 `dreamcrm-uploads-prod` +
  `dreamcrm-codebuild-952078552817`; EventBridge connection `dreamcrm-cron` +
  role `DreamCRMEventBridgeCron`; VPC `vpc-066acff3800b34067`. App Runner is
  closing to new customers (Apr 2026) — existing workloads keep running; plan
  an eventual ECS move.
- The domain moved into OUR name.com account 2026-07-23 (the long-awaited
  Replit transfer): apex now ANAMEs straight to App Runner (middleware 308s
  apex→www) — the Vercel/Replit redirect hop is fully retired.

## Open items (priority order)

0. **THE TRANSFORMATION (2026-07-27, full owner approval): "the employee,
   not the tool."** Read DESIGN.md → "The North Star" FIRST. Build order:
   Phase 1 the spine (journey-stage resolver + Action Ledger + autonomy
   schema — SHIPPED 2026-07-27; phase-audit CLOSED same day under an
   owner-approved amended gate after the spend limit killed round 5's
   skeptic chamber — certificate + the amended-gate note in docs/AUDITS.md;
   future phases should use a cheaper audit shape: fewer lenses, one verify
   pass, 2–3 round cap), Phase 2 the voice — **SHIPPED 2026-07-27; audit
   CLOSED CLEAN 2026-07-28** (3 discovery rounds at the hard cap +
   retrospective + main-loop self-sweep + 6 verification rounds, the 6th
   returning ZERO findings across all four lenses; totals 58 defects
   fixed + 18 in-phase gaps shipped + 3 sweep seams; certificate, the
   "four products in a trench coat" retrospective, and the standing
   self-sweep class checklist all in docs/AUDITS.md — ship future
   executors one per slice) (migration 0137 `proposal` table; `lib/services/proposals.ts`
   file/list/approve/decline/expire + per-capability executors under the
   ledger-boundary law "an approved yes narrates ONCE, under the proposal's
   capability"; `proposal-generators.ts` four first types — review_reply
   (drafted via review-reply-ai.ts, THE single hardened-prompt home, so it
   spends the shared 'review_reply_draft' 200/mo allowance) /
   inquiry_response / social_post (AI-drafted, skip when AI off, metered
   flat via ai_usage 'proposal_draft') / outreach_campaign (quiet recall
   engine, code-owned copy, real audience + count) — hourly
   `generate-proposals` cron + invalidation sweep; the Approval Inbox +
   weekly standup card on the clinic Overview; `standup.ts` Narrator
   (prior clinic-week window via the new ledger `until` bound) + Monday
   standup email riding daily-digest; demo-voice seeder), Phase 3 the
   autonomy ladder live — **SHIPPED 2026-07-28, audit pending** (migration
   0138 `proposal.original_body`; `lib/autonomy.ts` GRANTABLE_CAPABILITIES
   = the four proposal-backed types ONLY — the auto-by-default automations
   keep their own switches and nothing unregistered can be granted;
   `lib/services/autonomy.ts` setCapabilityTrust/listTrustGrants, every
   change NARRATED in the ledger (a no-op change narrates nothing);
   `autoExecuteProposal` = the machine saying yes to its own card through
   the SAME claim → staleness → execute → narrate-once flow as a human
   approve (autonomy inherits every guard the Phase-2 audit hardened),
   driven by `autoExecuteGrantedProposals` LAST in the hourly generator
   list; the honest autonomous voice ("handled on my own, as you asked" vs
   "you approved it") threaded through every executor + the demo hedge;
   `original_body` stashes the machine's draft the first time staff edit,
   so `countConsecutiveUneditedApprovals` can earn the card's "you've said
   yes to the last N without changing a word" SUGGESTION — the machine may
   suggest, never take; the card's never-pre-ticked "always do this for
   me" grants only AFTER a successful approve; the Overview's take-it-back
   strip survives an empty inbox; `countOpenProposals` EXCLUDES granted
   capabilities so the badge/digest/standup never claim work waits on a
   human that doesn't; demo resync resets the ladder to a KNOWN
   MIXED baseline — social_post handed over (dated before the seeded cards)
   so the demo shows the granted card, the take-back chip and the "what I
   handled on my own" tell; everything else ask-first, so the review card
   still shows the earned-trust nudge and the never-pre-ticked consent box.
   `countOpenProposals` excludes demo orgs from the granted-subtraction for
   the same reason it excludes billing-walled ones: nothing will ever
   execute those cards. Plus three identity-anchored unedited approvals),
   Phase 4 guardian + shared brain, Phase 5+ new limbs proposal-first.
0b. **Dentistry-type site templates** (task #69, design-first —
   own session). The rails are live: template registry +
   `lib/clinic-site-theme.ts`, /website/templates gallery w/ per-card live
   iframes, /site/[slug]/tf/[template] preview frames, Draft→Publish.
   Read DESIGN.md + DESIGN-SYSTEM.md + docs/STRUCTURE-AUDIT.md first.
1. **ROTATE / REVOKE secrets shared in chat** (user's action item). Identify
   each by its LAST FOUR in the AWS/Stripe/Resend console — full key ids are
   deliberately NOT written here (GitHub push protection blocks them, and a
   repo is the wrong home for them regardless):
   - Stripe restricted key `rk_live_…` — revoke, no longer needed.
   - AWS access keys ending **…H5M55** (rotate), **…4CWFS** (dead — delete),
     **…OJGLOI** (rotate). All three are on the `dreamcrm` IAM user.
   - Resend key `re_BZDw…` — mint fresh, swap in Secrets Manager, delete the
     dead `re_T8fyc…`.
2. **The finishing pass is CLEAR** (2026-07-02) — every item in
   `docs/FINISHING.md` is fixed, decided, or accepted. Log NEW seam bugs
   there as they surface (hunting method at the bottom of that doc).
3. **Inbound email replies → `/messages` — LIVE (2026-07-23).** Resend
   inbound domain `in.dreamcreatestudio.com` verified, MX + DKIM at name.com,
   `INBOUND_REPLY_DOMAIN` set, webhook rebuilt on the www host with ALL
   events (the old one pointed at the bare apex and had been auto-disabled —
   delivery/opened receipts were silently dead until this repair) + open
   tracking on. Human verification still worth doing: reply to a clinic
   email, watch /messages.
4. **OD vendor portal approval** (in flight) — unblocks schedule-driven booking
   availability (`/schedules`) + real-office Customer Keys. On approval: swap
   `PMS_OPEN_DENTAL_DEVELOPER_KEY`, generate per-office Customer Keys, office
   installs eConnector.
5. **Phase B — SMS** (AWS End User Messaging + A2P 10DLC): unlocks Recall,
   Messages, and Reviews SMS. Schema stubs exist (`clinic_sms_config`,
   `twilio_*`-named columns kept, channel enum in place).
6. **Platform webhook idempotency** shipped; review auto-send is anchored to
   `completedAt` with a 7-day ask-while-fresh floor (2026-07-14) — CLOSED.
7. Misc deferred: Zernio review webhooks (hourly cron covers today), FB reply
   (no Zernio endpoint), per-staff booking widgets, patient-view audit log, 2FA,
   per-location booking. (`push_everything` was already dropped in 0114.)

## Working in a new session (Claude Code on the web)

- Deps auto-install via the SessionStart hook (`.claude/hooks/session-start.sh`);
  `pnpm dev` / `test` / `typecheck` work immediately. The hook also self-heals
  the recurring CONTAINER STALE-SNAPSHOT REVERT (HEAD silently rewinds to an
  old commit mid-session, ~15 observed): it fetches + hard-resets to
  origin/main when HEAD is strictly behind. If it happens MID-session
  (symptoms: files "missing", tests failing in untouched files, `git log`
  showing ancient commits), run
  `git fetch origin main && git reset --hard origin/main && pnpm install
  --frozen-lockfile` — save any uncommitted work first with `git diff >
  patch` and re-apply with `git apply -3`. Push early, push often.
- Verify deploys via the Actions API: the `mcp__github__actions_list` result
  is ~400KB — it auto-saves to a file; parse `workflow_runs[0]`
  head_sha/status/conclusion with python. A CodeBuild provisioning flake
  (~40s FAIL) is retried by pushing an empty commit.
- `rm -rf .next` if `pnpm typecheck` errors on `.next/types/validator.ts`
  referencing deleted routes (stale build artifacts after a route move).
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
