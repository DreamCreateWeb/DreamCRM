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
| [`docs/FINISHING.md`](./docs/FINISHING.md) | The finishing-pass punch list — FROZEN history since the release program began (new defects go to docs/RELEASE.md Part 5). |
| [`docs/COMPETITIVE-GAPS.md`](./docs/COMPETITIVE-GAPS.md) | The module-deepening roadmap: per-module feature gaps vs NexHealth/RevenueWell/Weave/etc. Every P1 shipped; remaining: the PMS-procedure-data-gated P2s (no procedure-code entity yet), the per-clinic-registration-gated SMS tail, and P3s. |
| [`docs/STRUCTURE-AUDIT.md`](./docs/STRUCTURE-AUDIT.md) | The information-architecture reference: full feature inventory by purpose, competitor IA benchmarks (NexHealth/Weave/Birdeye/Kleer/Shopify/…), placement verdicts, and the redesign log (Payments split, rejected moves). Read before moving/renaming any surface. |
| [`docs/RELEASE.md`](./docs/RELEASE.md) | **THE CURRENT PROGRAM OF RECORD (2026-08-16, owner directive).** The product is feature-complete; the work now is beta → 1.0: phases R0–R5, the eight audit sweeps, severity bars, the defect ledger. R1 (the great audit) CLOSED 2026-08-17. Read this before starting new feature work — new ideas go to the post-1.0 backlog, not the release. |
| [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) | The honest compliance & data posture (R1·S8): TCPA/CAN-SPAM (strong, verified), the HIPAA subprocessor decision (the Bedrock-flip path — PHI to AI has no BAA), data export/deletion, retention. Read before ANY compliance claim in copy or before signing a customer BAA/DPA. |
| [`docs/AUDITS.md`](./docs/AUDITS.md) | The phase-audit certificates: per-phase round history, retrospectives, the standing self-sweep checklist, the owner's depth-backlog menu. |
| `docs/zernio-google-integration.md` · `docs/intake-forms-overhaul.md` · `docs/custom-domains.md` · `docs/inbound-email.md` · `docs/onboarding-overhaul.md` · `docs/sms-provider-evaluation.md` · `docs/outreach-go-live.md` · `docs/ai-operations.md` · `docs/marketing-engine.md` | Deep-dive specs + decision records (onboarding-overhaul = the onboarding PROJECT's research foundation AND build log — the NexHealth arc lives there; sms-provider-evaluation = the AWS-over-Twilio decision record; ai-operations = THE DREAM TEAM spec — the goal-driven agent-team program, its Paperclip decision record, the lane matrix incl. the owner's day-0 deep-sleep ruling, and its build log; marketing-engine = Dream Create's OWN growth program — the channel research foundation (buyer behavior, GTM comparables, paid economics incl. the CAC dial rules, the Resend-AUP cold-email red flag, SEO/AEO), the ranked tier strategy, and its build log). |

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
- **SMS: AWS End User Messaging + A2P 10DLC (machinery SHIPPED + ARMED;
  owner committed to AWS 2026-08-02 — docs/sms-provider-evaluation.md, incl.
  the same-day Twilio→AWS reversal record). `SMS_DRIVER=aws` is LIVE on App
  Runner; per-clinic sends unlock on that clinic's a2p_status='approved',
  so everything below waits only on the first real carrier registration.**
  Shipped: the consent spine (lib/sms-consent.ts +
  lib/services/sms-consent.ts — the ONLY writers of marketing_sms_opt_in;
  an opt-out is louder than an opt-in), lib/phone.ts E.164 (US-only,
  honest-null), the patient-keyed frequency cap (0143), and the full
  per-clinic A2P registration machine (0144; lib/sms-registration.ts pure
  state machine + lib/services/sms-registration.ts + the 6-hourly
  `sms-registration` cron + the one-form UI at /integrations/sms). Each
  clinic gets its OWN brand + campaign + 10DLC number — a shared platform
  number is carrier-prohibited shared-originator traffic. Slice 3a SHIPPED:
  lib/sms-segments.ts (pure GSM-7/UCS-2 segment math — the alphabet cliff —
  + htmlToSmsText) · lib/sms.ts deliverSms()/getClinicSmsIdentity (sibling
  of deliver(), NO platform fallback BY LAW — an unapproved clinic cannot
  send, typed refusal, unlocks on a2p_status='approved' exactly; segments
  counted into monthly_send_count, marketing labelled PROMOTIONAL) · the
  live twilio_sms branch in marketing-send (clinic-name prefix, STOP line
  when the composer didn't write one, 1.1s 10DLC pacing, org-level refusal
  short-circuits the loop, campaign_events rows carry recipient_phone).
  Slice 3b (inbound) SHIPPED: lib/services/inbound-sms.ts +
  /api/webhooks/sms (SNS envelope, ?token=$SMS_WEBHOOK_SECRET auth,
  always-200 on handled paths — SNS retries any non-2xx). STOP stops EVERY
  patient on the number + our confirmation (ops contract: pointing the SNS
  topic here happens TOGETHER with flipping SelfManagedOptOutsEnabled);
  START is the only path that clears a standing opt-out; ordinary replies
  thread into /messages via recordInboundMessage (channel 'sms', deduped on
  inboundMessageId). A bare number can't pass the family-safe name match,
  so an unknown sender is logged-and-dropped, never a minted chart; a
  shared family number threads to the liveliest existing conversation.
  The reminders CHANNEL CHOICE SHIPPED (2026-08-05): email stays the primary
  channel; the SMS fallback texts only where NO inbox exists (own email →
  guardian email → own textable phone → guardian's phone), only when the
  clinic's texting is live (getClinicSmsIdentity gates the scan, deliverSms
  re-enforces at send). A standing STOP silences even transactional texts —
  checked at the NUMBER level (numberHasStandingOptOut) to mirror how STOP
  is recorded; only START clears it. Copy is code-owned + GSM-7-safe BY
  CONTRACT (reminderSmsBody/familyReminderSmsBody in lib/types/reminders.ts
  — one smart quote flips a 160-char segment to 70); unconfirmed visits
  carry the same /c/[token] one-click confirm; a shared family phone gets
  ONE household text (the SMS twin of the email consolidation, no per-visit
  links); the manual drawer action's sms branch is live behind the same
  laws. AWS-side setup DONE (2026-08-05, scripts/setup-sms-aws.sh executed:
  IAM policy, SMS_WEBHOOK_SECRET, SMS_DRIVER=aws live on App Runner).
  DLR RECEIPTS SHIPPED (2026-08-05, migration 0145 provider_message_id on
  appointment_reminder_log + campaign_events): "sent" means handed to a
  carrier; only a DELIVERED receipt earns "delivered" (SUCCESSFUL = carrier
  acceptance = interim, never a receipt — lib/sms-dlr.ts pure
  parse/classify). Receipts ride the SAME webhook as inbound (configuration
  set `dreamcrm-sms` → SNS topic `dreamcrm-sms-events` → /api/webhooks/sms;
  deliverSms names the set when SMS_CONFIGURATION_SET is set, optional by
  design). A reminder receipt stamps deliveredAt (idempotent via the
  null-guard); a campaign receipt mints the sibling 'delivered'/'bounce'
  campaign_events row with the same attribution, deduped on the message id
  (lib/services/sms-dlr.ts, never throws). TEXTING KICKOFF AT ONBOARDING +
  THE INCLUDED BUDGET (2026-08-10): a new clinic's setup cards include
  `setup_texting` (ask-first, JSON answer → startSmsRegistration), and
  marketing texts ride an included monthly budget —
  `INCLUDED_MONTHLY_SEGMENTS = 2000` (env-overridable), `getSmsUsage`, and
  a typed 'over_budget' refusal in deliverSms that blocks MARKETING only
  (transactional reminders always send; fail-open on an unreadable count).
  Remaining: the post-approval SNS two-way wiring (printed by the setup
  script; needs a provisioned number) and the honesty flip LAST. Gmail
  OAuth for the staff inbox.
- **PMS: NexHealth Synchronizer (LIVE, THE one door — owner ruling 2026-08-19:
  the separate self-serve Open Dental connector path was REMOVED; OD practices
  ride the same bridge, and the OD-direct provider code stays INERT like the
  SES email driver).** `lib/nexhealth.ts` API
  client (reads on the v2 Accept header; ALL writes stamp
  `Nex-Api-Version: v3.0.0` — `return_existing_if_match` is silently
  ignored under v2, live-verified) + `lib/services/pms/nexhealth.ts`
  provider. Import covers patients (insurance, language, guarantor/family,
  SMS-consent signals), appointments (typed visit names), providers,
  operatories→chairCount. COST ENGINEERING: every call metered into
  `pms_api_usage` (0148) via `lib/services/pms/api-meter.ts`
  (DEFAULT_DAILY_CALL_BUDGET=60, fail-open), 105-min cadence gate in the
  pms-sync cron (~2h rhythm; pending write-ops override it; sandbox never
  budget-limited). WRITE-BACK v1 (off by default — the platform bind card
  flips syncDirection 'import'→'two_way'): slot-validated appointment
  creates (their engine picks operatory), patient creates w/ named
  missing-field refusal + duplicate-id recovery, cancel-only PATCH,
  `notify_patient=false` always, typed WAITING/NOT-SUPPORTED failure lanes
  (`settleWriteFailure`); round-trip verified against the sandbox both
  directions. REAL SLOTS: booking surfaces (public site + portal ONLY)
  offer a PMS-connected practice's actual open times —
  `getBookableSlotsForDay`/`isBookableSlot`/`insertAppointmentIfBookable`
  in `lib/services/booking.ts` (2-min cache, budget-guarded, degrades to
  the local hours+chairs engine); staff paths stay local. Demo org binds
  the NexHealth SANDBOX only; `deliver()` drops RFC-reserved test
  addresses. Economics + the whole build story: docs/onboarding-overhaul.md.
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
  (onboarding)/      4-step onboarding → clinic org + no-card trial (NO Stripe
                     call at signup — deliberate); /welcome AI interview;
                     /onboarding-complete
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
                     resend/svix, sms) · 21 CRON_SECRET-gated /api/cron/* routes ·
                     4 /api/admin/* (migrate, seed-platform, resync-demo,
                     redrive-custom-domains) ·
                     oauth (gmail, gsc) + connect (shop) + zernio connect/callback ·
                     token-auth publics (/api/calendar/[token], track, unsub) ·
                     /api/internal/custom-domains (host→slug map for middleware)

lib/
  db/schema/         auth.ts, platform.ts, clinic.ts (bulk), domain.ts, email.ts,
                     referrals.ts, index.ts
  db/migrations/     drizzle; 0000–0152 applied to prod (auto-apply on deploy)
  auth/              server.ts, client.ts, context.ts (getTenantContext,
                     requireTenant/requireRole/requirePartner)
  services/          ~190 server-only modules (import 'server-only') — one per
                     entity/subsystem (incl. pms/ — the PMS provider layer);
                     demo-clinic.ts is the demo seeder
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
                     compat wrapper; tests/ui/chart-kit.test.tsx guards against
                     new hand-rolled polylines
middleware.ts        Auth gate + public-path allowlist + {slug} subdomain rewrite
                     + custom-domain host→slug routing + app./apex → www redirect
tests/               Vitest (happy-dom), ~650 files / 6,400+ tests; pnpm test
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
times must be clinic-local — FIXED and now law: every booking path (local
engine and NexHealth real-slots alike) labels slots against the clinic tz
in `lib/services/booking.ts`.

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
| Daily | Dream Team | `/dream-team` | **THE AI STAFF (2026-08-23, docs/ai-operations.md).** The sign-here stack of finished work waiting on a yes (moved here from the Overview, which keeps only a calm summons strip), the take-it-back grants strip, the status band ("Cycles" heartbeat + waiting / going out soon / handled last week), the veto RUNWAY with per-row Stop, GOALS ("more implant patients" — flavors every generator's prompt; service focus DERIVED from the practice's own service list), SANDMAN (the chief of staff in conversation — aggregates-only snapshot, a closed navigation registry, and a closed REQUEST registry that can only ask an existing generator to run now, so everything it starts still lands as a draft needing a yes), and the ROSTER of six specialists with last week's real numbers. |
| Daily | My Day | `/my-day` | Per-staff cockpit: my/unclaimed follow-ups, my conversations, today's schedule, collections nudge. Mirrored by the opt-in morning digest email (per-staff opt-out). |
| Daily | Messages | `/messages` (double-sidebar) | Front-style unified patient inbox (in_app + email + inbound SMS — replies thread as channel 'sms' once a clinic's texting is live; the outbound SMS composer option waits on the honesty flip). Receipts (in-app read + email Delivered/Opened/bounce via tagged Resend webhooks, 2026-07-14), attachments, AI draft, quick-book, scheduled send, star/unread, auto-reply after hours. ACTIVITY MARKERS (2026-07-23): every automated touch (reminders, campaigns+opened, bookings/cancels w/ actor, review asks, balance nudges, surveys, forms) interleaves the thread as thin gray context lines — read-time merge (`lib/services/thread-activity.ts`, no new write paths, history backfills free); LAW: markers never bump unread/reopen/reorder and never render in the patient portal; runs of 4+ collapse; open/click signals attribute per-send; pre-history older than 14d before the first message trims (the patient timeline keeps it all). Gmail mailbox at `/inbox`. SUPPORT tab (2026-08-26): `/messages/support` — the clinic's one thread to Dream Create, anchored on `conversations.organization_id` (set = support marker; generic chats store NULL). Platform-authored messages render as "Support" 🎧 BY CONTRACT (never a person's name — pinned by tests/messaging/support-view.test.tsx); the platform works the same thread from Client Messaging under the clinic's name, and its New-conversation composer routes into the org thread rather than minting a parallel one. Both directions alert via the notification registry (support_message / support_reply, urgent). |
| Daily | Appointments | `/appointments` | Agenda grouped by clinic-local day; window chips; aging borders; drawer (confirm/reschedule/cancel/no-show + review request); bulk actions; saved views; CSV call-sheet export. |
| Daily | Patients | `/patients` + `/patients/[id]` | Relationship record: glyphs, filters, saved views (promote-to-audience), tags, documents, merge, CSV import/export, bulk email/portal-invite. Detail: timeline (clinic-tz), needs-attention, notes, follow-ups. |
| Daily | Follow-ups | `/followups` | Assignable patient reminders board + smart rules (balance/recall/unconfirmed; hourly cron) + auto-rebook on no-show; sidebar due badge; ⌘K quick-add. |
| Daily | Leads | `/leads` | Contact-form triage: status chips, rot borders, convert-to-patient (dedupe), UTM attribution, CSV export. |
| Daily | Intake Forms | `/intake-forms` | v2: photo/insurance-card/conditional fields, OCR autofill, AI pre-visit summary, return-visit pre-fill, smart auto-send, completion reminders, Spanish, OD chart mirror, packets. |
| Growth | Growth (workspace) | `/growth` | ONE sidebar entry. Hub REDESIGNED 2026-07-26 (v3, "acquisition leads, two engines"): hero = New-patients scoreboard (trailing-4-week total + 12-week heartbeat via the once-unused `getNewPatientsPerWeek12` + per-channel "what's pulling them in" rows w/ honest connect states), band 2 = the reactivation funnel from `getRecallStats` (due&reachable → sent → opened → booked back + next-send/quiet-engine status line), number-first news cards w/ attention tones (leads to triage; reviews waiting on a reply — urgent when any 1–2★ via `lowStarNeedsReply`; social), utility footer (Audiences · queue · Analytics); New campaign = header primary → `/growth/outreach?new=1`. Sub-pages: `/growth/outreach` (the clinic recall dashboard — audiences/campaign funnels/auto-sends; component stays in `app/(default)/marketing/`, shared with the platform tenant), `/growth/outreach/queue` (tiered outreach queue), `/growth/campaigns/[id]` (the campaign editor; serves BOTH tenants — the clinic's campaign LIST folded into the `/growth/outreach` hub 2026-07-21, campaigns phase 3: history + funnels + the New-campaign modal live there, `/growth/campaigns` redirects clinic→hub w/ prefill params forwarded while the platform tenant keeps the standalone list), `/growth/audiences`, `/growth/reviews` + `/received` (**Google-first auto-loop**: completed visit → auto review request → Google; synced reviews auto-feature at `feature_min_stars`; private feedback; Facebook read-only; the ONLY testimonial manager; 1–2★ escalation), `/growth/social` (multi-platform composer, gated by connected channels not plan; hub door shows a connect prompt), `/growth/analytics` (scorecard + funnels + proof panels + GSC/GBP + social performance). Old paths (`/marketing/*` clinic surfaces, `/reviews(+/received)`, `/social-posts`, `/analytics`) are 308 stubs — notification-email deep links keep working. `/marketing` + `/marketing/pipeline` remain the PLATFORM tenant's marketing home (clinic hits 308 to `/growth/outreach`). Folded-area labels ride `FOLDED_AREAS` in `lib/modules/index.ts`; quick-create capability ids ('campaigns', 'blog') come from dashboard-shell. |
| Website | Website (workspace) | `/website` | ONE sidebar entry → the Shopify-style hub (v3 redesign 2026-07-24: the clinic's OWN homepage as a live scaled browser-frame hero via the beacon-free `/site/[slug]/tf/` route, setup ProgressRing + open checklist beside it — collapses to quiet quick-facts when done, SVG gradient area sparkline on the 30-day band; bottom half = three zones shaped like their contents: "What's happening" number-first news cards (Forms/Blog/SEO/Careers, no brochure copy) + a "Quick edits" dock (Hours/Services/Team/Photos — MODALS on the hub reusing the Content page's editors + scoped actions, hours live-instant / rest draft-staged) + a quiet utility footer (Design · Pages · Domain · Share links; Domain pill only off-neutral)), go-live checklist (real states only). Quick-edits UX law: the hub surfaces what a front desk changes weekly (hours, services, team, photos, ANNOUNCEMENT) as modals; day-one/rare surfaces (design, pages) demote to text links, editor stays the header primary. Announcement bar (2026-07-24, migration 0134 `clinic_profile.announcement` jsonb): a thin brand-deep strip above the header on every public page + template (rendered once in `app/site/[slug]/layout.tsx` via `components/clinic-site/announcement-bar.tsx`); LIVE-INSTANT (not a draft column) + self-expiring (inclusive clinic-local `endsAt`, resolved by pure `activeAnnouncement` in lib/types/clinic-content.ts); optional link sanitized (`sanitizeAnnouncementHref`, site-relative or http(s) only) at BOTH save and render. Sub-pages: `/website/editor` (the full-screen Studio — EditBridge, section modals, AI bar, page navigator, 🎨 Design picker; honors `?previewTemplate=`/`?page=` deep links), `/website/content` (THE plain-form home for site content — per-section forms riding the Studio's scoped actions; `CONTENT_SECTIONS` registry in `lib/website-content-sections.ts`), `/website/design` (template cards + brand color + hero media + intro video), `/website/pages` (unified page manager — `buildSitePagesIndex` live/needs-content rows, per-page copy-override editing via `saveInlineField`, Search-appearance meta editor), `/website/forms` (both LeadFormBuilders + chat-widget toggle + submissions glance), `/website/blog` (was `/posts`; platform org authors the marketing blog through it too), `/website/seo` (was `/seo`), `/website/careers` (was `/careers`; ATS + JSON-LD), `/website/domain` (auto-polling custom-domain card), `/website/share` (QR cards). Old paths 308 via route-level stubs (NEVER next.config — it would hijack public clinic-site paths pre-middleware). `/settings/clinic` is now the identity-only **Business profile** (names, contact/email sender, address, hours, timezone, logo + GBP sync/calendar feed) — `updateClinicProfile` is identity-only BY CONTRACT: a website column in its payload would be nulled on every identity save (tests/settings/clinic-actions.test.ts pins the exclusion). **Draft→Publish (2026-07-12)**: every website save STAGES to `clinic_profile.website_draft` jsonb (identity columns stay live-immediate) — pure core `lib/website-draft.ts` (WEBSITE_DRAFT_COLUMNS/merge/split/changes), server plumbing `lib/services/website-draft.ts` (`stageWebsiteValues` routes ALL writers: writeSection, AI edit, services picker, seoMeta); a verified editor sees the merged view via the overlay in `loadSite` + `getClinicThemeBySlug` (visitors never do; owner-facing DraftPreviewBanner pill on the site); Publish/Discard live on the hub (PublishCard) + Studio top bar; publish records ONE `__publish` history entry so undo-after-publish reverts live, while normal undo walks draftable columns back INSIDE the draft. Editing surfaces read `getEffectiveWebsiteProfile`; Pages/hub live-pills read the raw row on purpose. **Template gallery (2026-07-12)**: `/website/templates` — practice-type categories + style-tag filters + sort, one card per design with a LIVE scaled iframe of the clinic's own homepage in that template via the side-effect-free frame route `/site/[slug]/tf/[template]` (middleware stamps the `x-dc-template-frame` request header for that path; `resolveActiveSiteTemplate` honors it per-request for a verified editor, beating the preview cookie — six cards render six templates without clobbering; `isFrame` makes the layout suppress beacon/chat/banners/EditBridge). Catalog metadata lives on `SITE_TEMPLATE_CATALOG` (practiceTypes/styleTags/bestFor); the Design page slims to a current-design summary + gallery door; Apply stages `template` to the draft. |
| Business | Payments | `/payments` | Payments bundle. The money workspace (split out of Shop 2026-07-14; Weave/Pearly pattern): hub w/ KPI story (Outstanding → To reconcile → Payment plans → Recurring MRR) + Stripe status + doors → Online payments (`/payments/online`, reconciliation + deposits), Collections (`/payments/collections`, dunning + payment plans), Memberships (`/payments/memberships`; powers the site's /dental-plans page). Old `/shop/*` money paths 308. |
| Business | Shop | `/shop` | Pure commerce: hub w/ Orders + Coupons doors + Stripe Connect status + catalog + loyalty config. Storefront + checkout, orders/fulfillment, coupons + birthday codes, low-stock nudge, CSV exports; Recurring KPI drills into Payments. |
| Business | Integrations | `/integrations` | Catalog-driven marketplace + **feature bundles** (activating one surfaces its modules in the sidebar). PMS: **NexHealth Synchronizer (LIVE — THE one PMS door since 2026-08-19; platform binds, write-back off by default; detail page = the provider-neutral /integrations/pms sync dashboard, /integrations/open-dental 308s there)**; GBP + socials via Zernio; Gmail; Stripe; SMS registration at `/integrations/sms`. Social caps + paid add-on live here. |
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

- **Stripe (platform billing)**: `lib/stripe-config.ts` — ONE purchasable
  plan since 2026-07-19: **Premium at $200/mo "founding practice rate"**
  (list $500 shown struck through; $2,000 annual = 2 months free). The
  2026-07-02 $150/$250/$500 reprice was never executed Stripe-side, so the
  display now tells the truth; Basic $150 / Pro $250 remain in PLANS as
  legacy-lookup rows only (legacy tiers + managed provisioning, never
  self-serve). + Stripe Tax (automatic_tax on every platform checkout + plan
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
  `clinic_profile.trialRemindersSent`). **TRIAL EXPIRY KILLS EVERYTHING
  (owner ruling, 2026-08-10)**: `lib/services/billing-state.ts`
  (`listShutDownOrgIds`/`isClinicShutDown`, fail-open) — an expired
  unconverted clinic's crons all skip it (reminders, review auto-send,
  retention, campaigns stay parked, scheduled messages, proposal
  generators, daily digest, pms-sync), its public site shows coming-soon
  (even to editors), and its patient portal shows a calm phone-first
  notice with no billing words. Nothing is deleted; paying revives all.
- **Referral partners**: `lib/services/referrals.ts` (+ `referral-payouts.ts`,
  Stripe Express, $25 floor). Commission accrues per paid invoice
  (unique on `stripe_invoice_id`). Platform manages at `/partners`; partners
  see `/partner`.
- **PMS (`lib/services/pms/`, two providers behind one abstraction)**:
  sync engine (entity map, delta sync, write-back queue + retry, health
  monitor), CommLog mirroring from 6+ send sites, recall sync, cron.
  Clinic-tz wall-clock conversion in `pms/datetime.ts`. **NexHealth
  Synchronizer is the LIVE universal door** (see the stack entry for the
  full picture: v3-header writes, api-meter budget, cadence gate,
  off-by-default write-back, real-slots booking, sandbox-bound demo).
  **Open Dental direct** remains built + blocked: schedule-driven
  availability + real-office Customer Keys await OD vendor-portal approval.
- **Zernio (GBP + social)**: `lib/zernio.ts` + services (`zernio.ts`,
  `google-reviews.ts`, `facebook-reviews.ts`, `gbp-sync.ts`, `gbp-metrics.ts`,
  `social-posts.ts`, `social-comments.ts`, `social-metrics.ts`,
  `social-billing.ts`). Per-plan social caps (basic 0 · pro 1→3 · premium 2→5
  w/ add-on); GBP free/uncapped. All demo-safe (isDemo never networks) +
  best-effort (never throw to the UI).
- **Email identity**: Tier 1 `"Clinic Name" <slug@dreamcreatestudio.com>` w/
  deliverable Reply-To; Tier 2 sends as the clinic's connected Gmail with
  Tier-1 fallback. Automated patient-email copy is clinic-editable
  (`lib/services/email-automations.ts`, 10 keys, deviations in
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
  `actions.ts`). REDESIGNED 2026-08-13/14 (owner directive "staff LOOK at
  the work, not read about it"): every card renders its ARTIFACT — the
  social post in the platform's own chrome (+ a staff photo-attach
  control), the email as an email w/ the real Book-a-time button, the
  review reply nested under the review as Google will show it, the plan
  as a mini feed, the GBP fix as before→after
  (`proposal-artifacts.tsx`) — and the group presents as the SIGN-HERE
  STACK: one card front-and-center (soonest-to-expire first), a queue
  rail of capability chips w/ expiry-tone dots, skip/jump/see-all;
  undecided cards stay MOUNTED (hidden, settings-tabs law) so
  in-progress edits survive skipping away and back.
- **Search**: ⌘K palette (`lib/services/global-search.ts`) — searches patients/
  visits/leads/threads/campaigns/applicants/products/reviews/saved views/pages
  and ACTS (add follow-up, tag patient, quick-create).
- **Crons — 21 routes, all `Authorization: Bearer $CRON_SECRET`:**
  `pms-sync` (hourly; NexHealth orgs self-gate to a ~2h cadence, pending
  write-ops override the gate) · `send-reminders` (30m, incl. forms reminders) ·
  `send-scheduled-campaigns` (15m, also flushes scheduled messages) ·
  `auto-send-reviews` (hourly) · `customize-services` (hourly) ·
  `sync-google-reviews` (hourly, Google + Facebook) · `sync-gbp` (hourly) ·
  `retention-automations` (daily) · `followup-rules` (hourly) · `daily-digest`
  (daily) · `trial-reminders` (6h; per-milestone idempotent) · `prospect-discovery` (6h) ·
  `prospect-enrich` (30m) · `prospect-outreach` (30m) · `domain-renewals` (daily) ·
  `generate-proposals` (hourly — the Phase-2 proposal generators + staleness
  sweep; the weekly standup email rides `daily-digest` on clinic-local
  Mondays) · `guardian` (daily 14:00 UTC — Phase 4's watch over every
  clinic's engine; reports the practices that need a human, once per
  new/changed problem and then weekly, to whoever the AUDIENCE LOCK says) ·
  `learn-defaults` (WEEKLY Mon 15:00 UTC — the shared brain's one learning
  pass over the whole platform; weekly because send-time behaviour moves on
  the scale of seasons and a faster cadence only chases noise) ·
  `sms-registration` (6h — advances every clinic's A2P registration state
  machine)
  — 19 EventBridge rules
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
  non-negotiable. Tests before merge — the FULL `pnpm test` (~4 min), not a
  module subset: the repo-wide CI guards (legibility floor, tenant scoping,
  cron parity, token single-homes) only run in the full pass, and deploys
  don't run tests.
- **The phase-audit gate is a convention (2026-07-27; v2 re-shape same
  day; STOPPING RULE amended 2026-07-31 after Phase 4).**
  **READ THIS BEFORE STARTING PHASE 5's AUDIT.** Phase 4 ran 16 rounds and
  never returned zero, and the certificate in docs/AUDITS.md explains why:
  each round's FIXES are new code the next round audits for the first time,
  so "a phase closes CLEAN or it is not closed" is not a terminating
  condition for a phase large enough to need many rounds. Round 12's
  defects were ALL in round 11's corrections; round 16's were mostly
  coverage holes rather than wrong behaviour. **Judge the CHARACTER of a
  round's findings, not only the count.** A phase is done when the depth
  chamber stops returning in-phase gaps AND the remaining defects are
  confined to the correction layer or to unwatched-but-correct code — at
  that point one more round buys churn, not safety. Write the certificate,
  name the open items, and move on. The original rule follows.
  No transformation phase (or major feature slice) is DONE until the
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
  migration: **0155** (marketing-engine slice 1b: `marketing_pageview.
  campaign` — the normalized utm_campaign key, '' = none — plus `sessions`,
  and the unique index widened to (day, path, channel, campaign)). Before
  it: **0154** (the acquisition sensor layer, docs/marketing-engine.md
  slice 1: `marketing_pageview` — the www twin of site_pageview with a
  channel dimension, platform-global by design — plus
  `clinic_profile.signup_attribution` jsonb (first-touch stamp, written once
  at org creation) and `clinic_profile.hide_powered_by` (the site-credit off
  switch, Website → Design)). Before it: **0153** (`notification_prefs.
  email_mode` — honest email modes for the notification tray). Before those:
  **0152** (`clinic_profile.dream_team_cycle_at` — the Dream
  Team's heartbeat, "Cycles": stamped at the end of every hourly generator
  pass for that clinic whether or not it produced anything, read only by
  the status band; nothing branches on it). Before it: **0151** (the `goal`
  table — the practice's durable objective in its own words; it queues
  nothing and FLAVORS every generator's prompt). Before those: **0148**
  (`pms_api_usage` — the NexHealth call-budget ledger:
  one row per org per UTC day, unique index, read by
  `lib/services/pms/api-meter.ts`). Before it: **0147**
  (`clinic_profile.site_live_at` — the GO-LIVE LEVER: a clinic's public
  site serves only after one deliberate act; the migration grandfathers
  every EXISTING clinic to live, since they were serving traffic before
  the lever existed). **0146** (`clinic_profile.gbp_listing` jsonb — the LISTING
  TRUTH snapshot: what the clinic's Google Business listing itself says
  (websiteUri/placeId/reviewUrl/mapsUri/isVerified/title/fetchedAt),
  stamped by every GBP sync, read by the `gbp_website_fix` mismatch
  detector via `parseGbpListingSnapshot`). **0145** (`provider_message_id` + lookup indexes on
  `appointment_reminder_log` and `campaign_events` — the SMS delivery-receipt
  correlation key, stamped at send time, read by lib/services/sms-dlr.ts).
  Before it: **0144** (`clinic_sms_config` renamed provider-neutral —
  sms_phone_number / provider_phone_number_id / brand_registration_id /
  campaign_registration_id, nothing had ever read the twilio_* names — plus
  the brand-identity fields: ein, entity_type, brand_contact_name/_email.
  0143 made `campaign_events.recipient_email` NULLABLE + added
  recipient_phone: a text to a phone-only patient has no address to record,
  and the frequency cap now keys on the PATIENT, `patientId ?? email` —
  one person reachable two ways counts once. 0142 (`clinic_profile.guardian_clinic_state` +
  `guardian_clinic_alerted_at` — the CLINIC audience's own alert memory, so
  "who heard this alarm" is a lookup rather than an inference from today's
  signals; the two cadences are independent and a note to the practice no
  longer moves the owner's clock. 0141 was `clinic_profile.guardian_first_seen_at` +
  `guardian_clear_since` — the Guardian's chronicity and its stand-down DWELL
  clock: "blocked since June 2" instead of "I flagged it 7 days ago", and a
  recovery that has to HOLD for `STAND_DOWN_DWELL_DAYS` before it is
  announced, so a practice sitting on the stall threshold can't alert and
  stand down on alternating days. 0140 was `platform_config` — Dream Create's own platform-global
  switches, one row id 'default'. It carries THREE top-level keys today —
  `guardianAudience` (the audience lock), `sharedBrain` (the learned send
  hour) and `guardian` (the watcher's own heartbeat) — and every writer goes
  through `writePlatformConfig`, which merges shallowly and passes its own
  key WHOLE. A read-modify-write or a full-row replace here silently drops
  another subsystem's key). 0139 was `clinic_profile.guardian_state` +
  `guardian_alerted_at`, the Guardian's alert memory; 0138 was
  `proposal.original_body`, the autonomy ladder). Workflow:
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

-2. **THE DREAM TEAM / AI OPERATIONS PROGRAM (2026-08-23, owner directive —
   BUILDING NOW, in its own lane through the feature freeze).** Read
   `docs/ai-operations.md` FIRST before touching /dream-team, the proposal
   spine, the autonomy ladder, goals, or Sandman: it carries the vision in
   the owner's words ("gain new patients, in the services you want more
   patients in, and effortlessly organize, market, track, follow up, and
   maintain relationships with them"), the naming lexicon (Dream Team ·
   Cycles · Sandman · Goals in-product, Dreams in marketing), the Paperclip
   build-vs-borrow decision record, the three-lane matrix incl. the owner's
   DAY-0 DEEP SLEEP ruling ("dental staff won't keep up with social posts —
   that's exactly where human-out-of-the-loop works"), and the running build
   log D1–D9. Shipped: the page + summons strip · the roster · the veto
   runway + day-0 auto lanes · Sandman · goals (0151) · the design passes ·
   Cycles (0152) · Sandman's request registry. The program's phase audit
   runs at the END of the arc, not per slice.

-1. **THE RELEASE PROGRAM (2026-08-16, owner directive — THE CURRENT
   PROGRAM OF RECORD).** "We have every feature we plan to offer currently,
   so now we can start polishing, refining, and getting the app to the full
   release point where I can pivot to marketing instead of building." Read
   `docs/RELEASE.md` FIRST in any new session: phases R0 (scope lock +
   severity bars) → R1 (the eight audit sweeps: tenant/auth, money,
   journeys, resilience, performance, copy, accessibility, compliance) →
   R2 (burn-down) → R3 (hardening: Playwright E2E suite, error
   aggregation, the RDS restore drill, load sanity) → R4 (dress rehearsal
   + beta cohort) → R5 (RC + go/no-go + launch watch). Feature freeze: new
   ideas go to `docs/POST-1.0.md`, not the release. Everything below this line
   is either absorbed into that program or explicitly deferred by it.
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
   autonomy ladder live — **SHIPPED 2026-07-28; audit CLOSED CLEAN
   2026-07-29** (3 discovery rounds at the hard cap + retrospective +
   main-loop self-sweep + 5 verification rounds, the 5th returning ZERO
   findings across all four lenses; totals 2 criticals + 42 defects fixed +
   12 in-phase gaps shipped + 1 sweep seam; certificate and the "the fixes
   outproduced the phase" retrospective in docs/AUDITS.md. BOTH criticals
   were invisible to the suite because the DB is modelled in JavaScript — a
   FK-violating sentinel and an untyped jsonb bind parameter — so any new
   raw SQL or new write to a constrained column now needs a boundary test;
   `tests/journey/autonomy-sql.test.ts` renders the real statement through
   drizzle's own dialect) (migration
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
   handled on my own" tell (whose entry anchors to the seeded social post's
   own publish instant — `seedDemoSocialPosts` re-dates those rows on every
   resync (deploy/boot), which normally keeps it ~4 days old; if a demo org
   goes long enough without a resync to fall outside the tell's 7-day window
   the entry is skipped by design and the strip honestly reports a quiet
   week); everything else ask-first, so the review card
   still shows the earned-trust nudge and the never-pre-ticked consent box.
   `countOpenProposals` excludes demo orgs from the granted-subtraction for
   the same reason it excludes billing-walled ones: nothing will ever
   execute those cards. Plus three identity-anchored unedited approvals),
   Phase 4 the guardian + the shared brain — **SHIPPED 2026-07-31; audit
   CLOSED BY OWNER DECISION on a stated criterion, NOT on a zero-finding
   round** (3 discovery rounds at the hard cap + retrospective + self-sweep +
   a consolidation slice + 13 verification rounds; ~120 defects and 30
   in-phase gaps fixed; suite 5,629 → 6,007; migrations 0139/0140/0141).
   The counts went 9 → 6 → 4 → 1 → 7 → 4 and never reached zero, because
   each round's FIXES are new code the next round audits for the first time
   — round 12's defects were ALL in round 11's corrections, and round 16's
   were mostly coverage holes rather than wrong behaviour. Certificate, the
   full round-by-round history and the SIX NAMED OPEN ITEMS are in
   docs/AUDITS.md; the first of them (giving `recordEngineFailure` its other
   producers — reminders, campaigns, review sync, GBP sync, PMS sync) is the
   next slice. Slices: (1) the VERDICT — pure `lib/guardian.ts` (`assessEngine` over
   `EngineSignals`, five states ranked worst-first: silent > blocked >
   stalled > quiet > healthy; `needsAttention` keeps `quiet` off the list
   because crying wolf is how a guardian gets ignored; the stall is measured
   against the practice's OWN prior month, never against other clinics, with
   a `STALL_MIN_BASELINE` floor so a 2→1 month isn't an alarm) +
   `lib/services/guardian.ts` sweep (clinic orgs only, never demo — the demo
   is excluded from every cron so it would report permanently silent and
   train the owner to ignore the list; best-effort per clinic) + the
   Overview panel, built as a REPORT not a console. The ledger grew a
   FAILURE vocabulary (`recordEngineFailure`, `detail.failure`) so "tried and
   couldn't" is a real entry and `isWorkEntry` excludes it — a broken clinic
   must not look busy. (2) the ALERT MEMORY — migration 0139
   (`clinic_profile.guardian_state` + `guardian_alerted_at`), pure
   `shouldAlert` (a NEW or CHANGED problem interrupts immediately, the SAME
   one only every `RE_ALERT_DAYS`=7), the daily `guardian` cron; the stamp
   moves ONLY on a delivery that landed, so an outage never buys a problem a
   week of silence. (3) the AUDIENCE LOCK — migration 0140 `platform_config`
   + `lib/services/platform-config.ts`; the Guardian can report to the owner
   OR to the practice itself, and it **ships locked to the owner**. Only the
   platform owner opens it (`setGuardianAudienceAction`, the control on the
   Guardian panel); every read FLOORS at 'platform' (missing row, unreadable
   DB, malformed value, wire input) so nothing undefined can start the
   machine talking to customers. Even unlocked, only `clinicActionable`
   findings reach a practice — a switch they turned off, or a stall worth a
   conversation. SILENCE and repeated FAILURES stay with Dream Create at
   every setting: those are ours to fix, and telling a clinic would hand
   them alarm with no lever. A clinic-bound finding is written as a
   `guardian_note` ledger entry in the clinic's own voice (registered in
   `lib/autonomy.ts`, auto-by-default because it only ever REPORTS, and
   deliberately NOT in `GRANTABLE_CAPABILITIES` — there is no judgment to
   hand over) and the owner is NOT also emailed: one problem, one report.
   ONE alert memory serves both audiences by design (the stamp means "this
   problem was reported", not "reported to X"). The note is READ back by
   `getActiveGuardianNote` + the amber heads-up card on the clinic Overview
   — without that the sentence would be invisible (the note carries
   `detail.report`, so it is not work and appears in no standup count or
   story; the card is its ONLY clinic surface), i.e. a report nobody reads. It self-expires with the re-alert window, is
   RE-VERIFIED against live switches at render (telling a practice something
   untrue about their own settings is worse than saying nothing), and
   RE-CHECKS THE LOCK on the read — without that, "Keep it to me instead"
   would be a lie for a week, since notes written while open would keep
   rendering after it closed.
   NOT seeded in the demo on purpose: the demo org is excluded from the
   sweep, and the audience lock ships closed, so seeding one would
   demonstrate a surface no real clinic can currently reach. (4) PROPOSAL-ENGINE
   OBSERVABILITY — slice 1 shipped the failure vocabulary and the Guardian's
   three-strikes-is-`blocked` rule and then NOTHING called it, so that whole
   branch was dead in production; the generator driver now records a break
   into the clinic's own ledger under the capability that broke
   (`STEP_FAILURE`), with the org-level "engine never got started" case under
   a new registered `proposal_engine` capability (auto-by-default, not
   grantable — it is how every ask-first job reaches them, not a job to hand
   over). The load-bearing part is `recordEngineFailure`'s `onceWithin` window: the
   cron ticks HOURLY, so undeduped one stuck generator writes 24 rows a day
   into a clinic's story and trips the alarm before lunch on day one — at one
   strike per day, `FAILURE_ALARM_COUNT` means DAYS of a broken thing. Our own
   bookkeeping steps (reconcile, sweep) map to `null`: their failure is real
   and goes in `errors` for the platform, but it is not a sentence a clinic's
   story should carry. An unreadable ledger records ANYWAY (a duplicate row is
   cheaper than a swallowed break). Also fixed here: `openProposals` had been
   collected per clinic since slice 1, cost a query every sweep, and was read
   by nothing while its own comment claimed it coloured the recommendation —
   it now appends the `PILEUP_COUNT` clause to findings that actually reach
   the owner, and still never changes the state (a pile-up is a fact about the
   person, not the machine). (5) THE SHARED BRAIN — "no
   individual clinic has to be smart, because the platform already knows."
   Pure `lib/shared-brain.ts` + `lib/services/shared-brain.ts`; the first
   thing it learns is WHEN TO SEND (the hardcoded `SEND_HOUR_LOCAL = 10` in
   retention-automation.ts, a reasonable guess somebody made once, is now a
   learned default threaded through `automationSendAt`). THE PRIVACY LINE:
   correlating a send with an open needs the recipient's address, so that
   join happens INSIDE Postgres (`sendHourStatsQuery`) and nothing but
   `(hour, sent, opened, clinics)` crosses into application memory — the
   stored value is one integer. Three floors stop a learned default being
   worse than the guess it replaces: MIN_SENDS_PER_HOUR (a 100% open rate on
   four sends is not a finding), MIN_CLINICS_PER_HOUR (this is the floor that
   makes the word "cross-clinic" TRUE rather than "one big clinic has a
   habit"), and MIN_LIFT (only move off the default by a real margin, or the
   platform's send hour wobbles weekly chasing noise). Hours are confined to
   LEARNABLE_HOUR_MIN..MAX so the brain can never discover that 3 AM sends
   get opened nicely (by insomniacs, hours later) and start mailing patients
   overnight. It SHIPS INERT on purpose — with one live clinic nothing clears
   the clinic floor, which is correct behaviour, not a bug — and the
   `SharedBrainCard` on the platform Overview says "Still learning" out loud,
   because a learned default nobody can inspect is indistinguishable from a
   magic number. `resolveSharedBrain` floors every failure path (a stored 25,
   a "10", a null all resolve to 10) since this value reaches a SCHEDULER; a
   rejected hour is never reported as learned. A failed learning pass never
   OVERWRITES what was known — "we lost the database for an hour" must not
   read as "we un-learned the best send hour". `writePlatformConfig` is now
   the shared jsonb-merge writer (top-level keys replace; every writer owns
   its own key), with `setGuardianAudience` riding it. THE SAMPLE IS THE
   POPULATION THE HOUR ACTS ON (round-14 audit): the aggregate counts
   AUTOMATION campaigns only (`automation_key is not null`), because the
   learned hour drives exactly one thing — `automationSendAt` — and pooling
   human-made blasts compared CONTENT before it compared TIME, a confound
   the three floors cannot bound (they bound sample size and margin). That
   restriction surfaced WHY the brain was inert rather than merely
   under-fed: every automated send aimed at the hour in force, so one bucket
   filled and nothing was comparable. The EXPLORATION ARM (2026-07-31,
   `explorationHourFor`) is the answer — ~20% of automation campaigns go at
   an alternative daylight hour, deterministically, keyed per campaign so
   one practice lands in both arms.
   Phase 5+ new limbs proposal-first. **Limb 1 — THE CONTENT CALENDAR,
   SHIPPED 2026-07-31** (audit not yet run). The design test ruled out the
   obvious build: a month grid with drag-and-drop slots and an empty state
   reading "plan your content" is a queue of raw work wearing a calendar's
   clothes, and a practice with nobody to staff it ends the month with an
   empty grid and a small feeling of failure. Instead the machine notices
   the weeks ahead are empty, WRITES THE WHOLE PLAN, and asks one question.
   NOTHING NEW IS STORED — a plan is a proposal, and approving it creates
   rows the existing rails already understand (a `social_post` scheduled
   through the same composer the clinic uses by hand; a `blog_post` with
   `status='scheduled'` that the existing publish-scheduled-posts cron flips
   live), so a `content_plan` table would have been a second home for facts
   the schema already holds. Pure `lib/content-calendar.ts` (the plan's
   shape: PLAN_SIZE=4 across PLAN_HORIZON_DAYS=28, WEEKDAYS ONLY —
   deterministic so a re-draft doesn't shuffle under a practice that already
   read it — the article at position TWO so the card opens with something
   quick, `validatePlanItems` treating model output as untrusted input,
   `paragraphsToHtml` escaping on the one path that ends on a public page) ·
   service `lib/services/content-calendar.ts` (the horizon read across BOTH
   rails; `countHorizon` returns null on a failed read and every caller
   treats null as FULL — erring toward silence) · generator
   `generateContentPlanProposals` (AI-drafted, skips when AI is off, monthly
   sourceKey, `recentlyDeclined`, thin-horizon test) · executor
   `executeContentPlan`. Two load-bearing decisions: (1) the SCHEDULE IS
   RESOLVED AT APPROVE TIME, not at draft time — a card approved a week
   later would carry dates already past, which both rails correctly refuse,
   so the whole month would fail for the crime of being thought about; the
   card says so out loud (`PLAN_DATE_CAVEAT`) because shifting a promise
   silently is worse than not making it. (2) This is the first executor
   whose work is NOT ATOMIC, so it carries a `payload.done` map (index → row
   id) stamped the moment each row is durable: a retry RESUMES rather than
   republishes, and an article orphaned between "blank draft created" and
   "scheduled" gets FINISHED rather than skipped or duplicated. The
   staleness check runs only on a FIRST attempt — on a resume the horizon is
   full of the plan's own half-finished work, and reading that as "the
   clinic filled the month themselves" would strand every row already
   scheduled. `content_plan` is registered ask-first and deliberately NOT in
   `GRANTABLE_CAPABILITIES`: handing over one post is a bounded yes, handing
   over four weeks of a practice's public voice unseen is a different order
   of thing. A MUTUAL STAND-DOWN keeps it and the one-off social generator
   from both answering the same silence in one tick. The forward report
   ("What's going out", Growth hub) renders ONLY when something is coming —
   an empty grid captioned "plan your content" is the surface-to-operate the
   doctrine rules out.
   **Limb 2 — THE EMPTY CHAIR, SHIPPED 2026-08-01** (audit runs at the END of
   the phase, not per slice — owner ruling). The design test ruled out the
   utilization dashboard: "your week is 43% booked", with a gauge and a trend
   arrow, hands a busy practice a number and a feeling and no work done. A
   gauge has never filled a chair. So the machine reads the clinic's OWN
   hours, chairs and booked visits, sees which days in the near window will
   sit half empty, writes the invitation naming those days, and asks once.
   NOTHING NEW IS STORED and NO new read surface ships — the week's shape is
   already fully determined by hours + chairCount + appointments, and a
   utilization column would be a cached derivation that goes stale the moment
   somebody books. Pure `lib/empty-chair.ts` (FILL_WINDOW 3..9 days out —
   far enough that an invitation can be acted on, and exactly SEVEN days so a
   weekday never appears twice in a card that names days by weekday;
   SOFT_DAY_RATIO 0.5, MIN_SOFT_DAYS 2 because one quiet day is a Tuesday,
   MIN_DAY_OPENINGS 6 so half of a four-slot day isn't a campaign; the
   code-owned anti-shame copy; `planStillTrue`) · service
   `lib/services/empty-chair.ts` (reads the window a DAY AT A TIME through
   `getSlotsForDay` — the single home for what counts as an opening, whose
   rules are intricate enough (multi-chair overlap, visits running into the
   open window, cancelled/no-show not blocking, whole-visit-fits-before-close,
   DST-aware hours) that a faster bespoke aggregate would be a second home
   that disagrees the first time either is touched; days the clinic is CLOSED
   are left OUT, not reported as 100% open; `safeWindowLoad` returns null on a
   failed read and null is never an empty week) · generator
   `generateScheduleGapProposals` (WEEKLY `weekKey` cadence — an empty chair
   is a weekly fact; NO AI, so it keeps working for a practice whose key
   expired; needs ≥8 reachable due patients and nothing already sent or
   scheduled) · executor `executeScheduleGap`. The card is PERISHABLE by
   construction — it names specific days — so the executor re-reads the window
   at the tap and RETIRES rather than sends if any named day has filled or
   arrived (`planStillTrue` demands EVERY named day, not some: the email names
   them all). An unreadable window does NOT veto an explicit human yes, the
   mirror of the generator's silence. `schedule_gap` is registered ask-first
   and NOT grantable — the practice may know something about next Thursday
   that the schedule does not. It shares the AUDITED campaign send protocol
   with `outreach_campaign` rather than forking it (`CampaignExecOpts`:
   `extraStaleness` + `sentSummary`/`recoveredSummary`), and stands down
   mutually with it since both reach the same recall audience.
   `BOOKING_BUTTON_CAPABILITIES` (lib/autonomy.ts) now single-homes the "this
   send appends a Book a time button" disclosure the Approval Inbox card
   makes, guarded by `tests/journey/booking-button-disclosure.test.ts`;
   `schedule_gap` also joins `PATIENT_INBOX_CAPABILITIES`. Not seeded in the
   demo on purpose: the demo already carries the recall card, and seeding both
   would show a state the mutual stand-down means no real clinic can reach.
0a. **THE ONBOARDING OVERHAUL (2026-08-05, owner: "make this a project,
   not a sweep").** Research phase DONE — read `docs/onboarding-overhaul.md`
   FIRST (current-state audit incl. the five contradicting readiness
   surfaces + the ghost schedule + the GBP website-button blind spot that
   cost Mammoth Spring all its traffic; GBP API/vendor landscape — native
   `locations.patch websiteUri` works, gate is the one-time Basic-Access
   application; competitor + activation research — nobody in dental does
   self-serve onboarding, checklist completion medians ~10%, GBP-as-
   onboarding is unclaimed ground). Proposed shape: Phase A GBP listing
   truth (detect/guide/verify + UTM channel) → B readiness resolver → C
   onboarding as the employee's first week (setup asks ARE proposals;
   booking request-mode until hours confirmed) → D GBP write-back.
   **Phase A slice 1 SHIPPED 2026-08-05** (LISTING TRUTH end-to-end;
   Phases A+D merged the day Zernio's published OpenAPI v1.0.4 revealed a
   locations.patch proxy — no Google application needed): migration 0146
   `clinic_profile.gbp_listing` stamped by every GBP sync (the sync's
   normalizer also grew the summary-sibling shape fork — the current
   Zernio response nests a derived `location` summary beside top-level
   fields, and the old unwrap would have swallowed hours/website);
   pure `lib/gbp-listing.ts` (forgiving URL compare — scheme/www/slash/
   query are noise, junk degrades to 'unknown' never a false mismatch;
   `buildListingWebsiteUrl` UTM tags + `isGbpTaggedAttribution` reads the
   same marker); `gbp_website_fix` proposal (registered ask-first, NOT
   grantable — edits the practice's PUBLIC listing, no cadence to hand
   over; generator is AI-free, monthly sourceKey bucket, files ONLY on
   mismatch/missing + verified + connected — 'unknown' says nothing and
   an unverified listing files nothing since Google won't publish the
   edit; executor via `updateGoogleBusinessWebsiteUri` (the spec-path PUT)
   with live staleness re-check at the tap — already-correct retires
   rather than re-writes, since ANY edit can trigger a listing re-review —
   re-read-after-write because Google strips params, refused-write keeps
   the card and names the by-hand path; sweep retires healed cards through
   closeRecoveredProposal, attribution = attempt marker + snapshot 'ok');
   'gbp' lead channel ("Google profile") keyed on the utm_campaign marker
   ahead of search. **THE GREEN-LIT BUILD ORDER IS COMPLETE (2026-08-13):**
   Phase B readiness resolver (`lib/readiness.ts` + `lib/services/
   readiness.ts` — ONE truth layer grading ready/attention/waiting/todo/na,
   the five contradicting surfaces re-pointed) · the go-live lever (0147
   `site_live_at`; new clinics' sites start private, one deliberate act
   publishes; existing clinics grandfathered) · Phase C setup-as-Inbox-cards
   (`setup_hours`/`setup_chairs`/`setup_booking_mode`/`setup_texting` in
   lib/autonomy.ts — day-0 asks ARE proposals, ask-first, not grantable) ·
   the invite door (managed provisioning carries the prospect DOSSIER —
   brand color/logo, phone, address, timezone, Google place id —
   `lib/services/clinic-provisioning.ts`) · SMS
   kickoff + the included segment budget · the trial-expiry KILL (owner
   ruling; see the Trial subsystem entry) · the NexHealth arc through
   write-back v1 + real-slots booking (see the stack entry). Build log for
   ALL of it: docs/onboarding-overhaul.md. Owner actions pending: optional
   Google Basic-Access application as vendor insurance; Mammoth Spring
   needs THEIR GBP connected once they recover their Google login. The one
   surviving open question in the doc: setup-fee/positioning (Q5). Further
   onboarding polish now rides docs/RELEASE.md (R4's stranger test).
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
   `docs/FINISHING.md` is fixed, decided, or accepted. That doc is now
   FROZEN history: during the release program, new defects go to
   `docs/RELEASE.md` Part 5 (the program's ledger), not FINISHING.
3. **Inbound email replies → `/messages` — LIVE (2026-07-23).** Resend
   inbound domain `in.dreamcreatestudio.com` verified, MX + DKIM at name.com,
   `INBOUND_REPLY_DOMAIN` set, webhook rebuilt on the www host with ALL
   events (the old one pointed at the bare apex and had been auto-disabled —
   delivery/opened receipts were silently dead until this repair) + open
   tracking on. Human verification still worth doing: reply to a clinic
   email, watch /messages.
4. **OD vendor portal approval** (in flight) — DOWNGRADED to platform-ops
   insurance (2026-08-19, owner ruling): the self-serve Open Dental connector
   path was REMOVED from the product (catalog card, Customer-Key form, detail
   page — /integrations/open-dental 308s to /integrations/pms); OD practices
   connect through the NexHealth bridge like everyone else. The OD-direct
   provider code (lib/services/pms/open-dental.ts + connectOpenDental) stays
   INERT — if approval ever lands, it's an ops-side bind option, not a
   customer door.
5. **SMS — machinery COMPLETE, waiting on the first real carrier
   registration (see the stack entry for everything shipped).** Remaining,
   in order: (1) a real clinic submits the /integrations/sms form → the
   first live A2P registration verifies the AWS field paths (they cannot be
   integration-tested from CI — a wrong path degrades to
   REQUIRES_UPDATES/brand_action_needed, visible, never silent); (2) on
   approval + a provisioned number, the SNS two-way wiring (commands
   printed by scripts/setup-sms-aws.sh) TOGETHER with flipping
   SelfManagedOptOutsEnabled; (3) the honesty flip LAST (marketing pages,
   catalog availability, the disabled composer options).
6. **Platform webhook idempotency** shipped; review auto-send is anchored to
   `completedAt` with a 7-day ask-while-fresh floor (2026-07-14) — CLOSED.
7. **Phase 4's six named open items** (docs/AUDITS.md certificate, 2026-07-31):
   (1) ~~`recordEngineFailure` has only two producers~~ **CLOSED
   2026-07-31**: `lib/services/engine-failures.ts` is the registry (one
   table, one helper, one throttle — not six hand-written call sites) and
   all six producers report: reminders, scheduled campaigns, retention
   automations, review sync, GBP sync and PMS sync. New capability
   `pms_sync` registered. One failure per producer per clinic per DAY (the
   crons tick every 15 min), and deliberately NOT `dedupeAcrossOrg` — unlike
   the proposal engine's five steps these are independent subsystems, so
   reminders and Google sync breaking on one morning are two facts; (2) ~~the shared brain needs an EXPLORATION ARM~~ **CLOSED
   2026-07-31**: `explorationHourFor` sends ~20% of automation campaigns at
   an alternative daylight hour, so there is finally a second qualifying
   bucket. DETERMINISTIC (a retry schedules identically to the original) and
   keyed per CAMPAIGN — the key carries the org AND the date, so one
   practice lands in BOTH arms across days; assigning by clinic would have
   compared hours that were also different practices, the confound round 14
   refused to ship. Residual confound is DAY OF WEEK, bounded by the 90-day
   window and documented rather than hidden. The hash needed a MurmurHash3
   avalanche finalizer: raw FNV-1a's high bits barely move across keys that
   differ only in a trailing date, and the first draft put all 90 of one
   practice's daily campaigns in the same arm. The owner's card says the
   exploration is running; (3) ~~a per-audience alert memory~~ **CLOSED
   2026-07-31** (migration 0142 `guardian_clinic_state` +
   `guardian_clinic_alerted_at`): each audience keeps its own stamp, so the
   two cadences are independent and `ownerWasTold`/`clinicWasTold` are
   LOOKUPS rather than the inference from today's signals that round 12
   caught inverted in its principal case. Telling the practice no longer
   moves the owner's clock; (4) ~~the clinic half can only say bad news~~
   **CLOSED 2026-07-31**: `clinicRecoveryNote` closes the two findings a
   practice can be told about, keyed off their own memory. A receipt, not a
   report — no number, no next step, no request — because a machine that
   names the problem owes the person the moment it clears;
   (5) ~~the sweep's census does not reconcile~~ **CLOSED 2026-07-31**:
   `GuardianSweep.census` is `{eligible, assessed, unreadable}` and adds up
   by construction — every eligible org either produced a report or was
   dropped by its own failed read, there is no third door — surfaced on the
   run result, the heartbeat and the panel (only when it does NOT
   reconcile, because a balanced census is not news); (6) ~~the sweep
   aggregate still trusts a stored timezone~~ **CLOSED 2026-07-31**: both
   platform-wide aggregates resolve the zone through `pg_timezone_names`
   (the authority Postgres itself uses) instead of a bare `coalesce`, which
   guards NULL only — so an unrecognised legacy row falls through to the
   default rather than raising and blinding the watcher for every OTHER
   clinic.
8. Misc deferred: Zernio review webhooks (hourly cron covers today), FB reply
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
pnpm test                 # vitest run (~6,400 tests, ~4 min)
pnpm test:watch
```

## Test account

- `dustin@dreamcreateweb.com` — platform admin (Dream Create org owner).
  Password rotates via Settings → Account.
