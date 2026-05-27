# DreamCRM — Project context for Claude

Multi-tenant SaaS for dental clinics. Dream Create (platform owner) runs the
platform; clinics are tenant orgs; patients are users with `role='patient'`
in a clinic org. The Mosaic Next.js admin template provides the dashboard
aesthetic — keep it; wire logic to it rather than replacing components.

> **Read [`DESIGN.md`](./DESIGN.md) before designing any new module.** It is
> the durable strategy + design-principles document — what we're building, who
> for, how it's positioned, the design language, and the module roadmap.
> `CLAUDE.md` is implementation context; `DESIGN.md` is direction.

## Stack
- **Next.js 16** (App Router, Turbopack), TypeScript, Tailwind 4
- **Drizzle ORM** on **AWS RDS Postgres** (`us-east-1`; node-postgres driver, private/VPC-only)
- **better-auth** with Organizations plugin (multi-tenant)
- **Stripe** for billing (Checkout + Customer Portal + webhooks) — unchanged (own BAA)
- **Email: AWS SES** (`EMAIL_DRIVER=ses`; verified domain `dreamcreateweb.com`
  with DKIM + DMARC). Resend kept as a fallback driver. **SES is still in the
  sandbox — production-access request pending AWS review**, so outbound to
  non-verified recipients is held until approved.
- **Storage: AWS S3** (`STORAGE_DRIVER=s3`, bucket `dreamcrm-uploads-prod`).
  Vercel Blob kept as a fallback driver.
- **AI: Anthropic API (direct)**. A Bedrock driver exists (`AI_DRIVER=bedrock`,
  inert) for a future single-BAA move — blocked on the Bedrock Anthropic
  use-case form + a tokens/day quota bump.
- **SMS: not wired** (future: AWS End User Messaging + A2P 10DLC). Gmail OAuth unchanged.
- **Deployed on AWS App Runner** (`us-east-1`). Canonical URL:
  **https://www.dreamcreatestudio.com**; `app.dreamcreatestudio.com` + the bare
  apex redirect to `www`. Clinic public sites at `{slug}.dreamcreatestudio.com`
  still need wildcard DNS (see "Deployment & operations").

## Repo layout
```
app/
  (default)/         Authenticated app surface (dashboard, settings, etc.)
                     — same code serves platform admin and clinic admin;
                       page bodies branch on getTenantContext().tenantType
  (auth)/            sign-in / sign-up / reset-password / accept-invite
  (onboarding)/      4-step onboarding → creates clinic org + Stripe Checkout
  (double-sidebar)/  inbox + messages (uses tenant-sidebar v2 + their own inner sidebar)
  (alternative)/     component library + finance demos + utility pages
  site/[slug]/       Public clinic homepage + /book (pro+) — served via
                     subdomain rewrite from {slug}.dreamcreatestudio.com
  api/auth/[...all]  better-auth handler
  api/webhooks/stripe  Stripe webhook → updates clinic_profile
  api/upload         Vercel Blob upload (auth-gated)

lib/
  db/schema/         auth.ts, platform.ts, clinic.ts, domain.ts, index.ts
  db/migrations/     drizzle-generated; 0000_third_guardsmen.sql applied to prod
  auth/              server.ts, client.ts, context.ts (getTenantContext)
  services/          per-entity server-only modules (customers, orders, …,
                       billing, stripe-admin, settings, …)
  modules/           platform.ts, clinic.ts, patient.ts module registries
                       feeding the tenant-aware sidebar
  email.ts           Resend wrapper (password reset, invite, …)
  stripe.ts          Lazy Proxy Stripe client
  stripe-config.ts   PLANS array (Basic $99 / Pro $149 / Premium $199)
  blob.ts            @vercel/blob upload helper

components/ui/
  dashboard-shell.tsx  Shared chrome (auth + tenant + sidebar) used by all
                         authenticated route-group layouts
  tenant-sidebar.tsx   Data-driven sidebar (modules from lib/modules/)
  nav-icons.tsx        Icon registry

middleware.ts          Auth gate + public-path allowlist + subdomain
                       rewrite ({slug}.dreamcreatestudio.com → /site/{slug})

tests/                 Vitest unit/integration tests (run `pnpm test`).
                       Mocks live in tests/mocks/. happy-dom env.
```

## Multi-tenancy model

- `organization` has `type: 'platform' | 'clinic'`
- `member` links user → org with `role: 'owner' | 'admin' | 'member' | 'patient'`
- `session.activeOrganizationId` carries which org the user is operating as
- `getTenantContext()` (in `lib/auth/context.ts`) resolves the current
  request into `{ tenantType, role, planTier, organizationId, patientId, … }`
- Every tenant-scoped table in `lib/db/schema/domain.ts` carries an
  `organization_id` FK (nullable for now — backfill when seed data lands)
- `lib/modules/` defines what each `tenantType` sees in its sidebar (with
  `minPlan` plan-gating and `roles` array role-gating)

**Platform org seeded**: `Dream Create` (`slug: dream-create`, `type: platform`),
with `dustin@dreamcreateweb.com` as the only `member(role: owner)` and
`platformAdmin: true` on the user row.

## Stripe wiring
- Plans live in `lib/stripe-config.ts` (Basic / Pro / Premium, monthly + annual)
- **Note:** the `*_ANNUAL` env vars currently point to the same Stripe prices
  as `*_MONTHLY`. The Plans UI offers annual billing but charges monthly until
  real annual prices are created in Stripe and 3 envs are updated.
- Webhook endpoint `we_…` registered at
  `https://dreamcrm-dreamcreatewebs-projects.vercel.app/api/webhooks/stripe`
  (legacy URL — fine, Vercel routes both). Subscribed events:
  `checkout.session.completed`, `customer.subscription.{created,updated,deleted,trial_will_end}`,
  `invoice.payment_{succeeded,failed}`
- Platform admin manages subscriptions + plans at `/ecommerce/invoices`
  (gated to `tenantType==='platform' && role in {owner,admin}`)

## What's wired and working
- Auth (sign-in/up/reset, sign-out) with timeout + hard-reload to avoid
  cookie races on the next request
- Onboarding 01→02→03→04 (`sessionStorage` draft → plan picker →
  org+member+clinic_profile + Stripe Checkout)
- Tenant-aware sidebar across all three route groups
- All Mosaic template pages CRUD-wired to DB (customers, orders, invoices,
  tasks, calendar, campaigns, forum, feed, meetups, jobs, inbox, messages,
  shop/cart/pay, settings panels, fintech, analytics)
- Stripe admin UI (subscriptions table + plans CRUD) for platform admins
- Vercel security headers, function timeouts, image remotePatterns
- **Public clinic websites** at `{slug}.dreamcreatestudio.com` (modern
  template — hero / about / hours / services / contact / footer; +/book
  page for pro/premium tiers). Subdomain rewrite in middleware.ts.
- **Clinic site editor** at /settings/clinic — display name, tagline,
  about, full address, contact, brand color, 7-day office hours editor,
  template selector. /settings/locations for multi-location practices.
- **Stripe → clinic_profile** sync: webhook now writes plan_tier /
  stripeSubscriptionId / subscriptionStatus to clinic_profile (org-keyed)
  with 3 fallback paths to resolve the org.
- **Accept-invite flow** at /accept-invite?token=… — token validation,
  sign-up-or-sign-in toggle, auto-accept on submit, patient.userId linkage
  via link-patient.ts.
- **Patient portal** at /patient/* — dashboard with upcoming appointments,
  appointments list (upcoming + history), book a visit (server action,
  future-time validation), profile editor (name/contact/DOB/address),
  bills placeholder. Patient sidebar auto-selected by DashboardShell when
  ctx.tenantType==='patient'. `/` redirects patients to /patient/dashboard.
- **Clinic profile editor enhancements**: logo + hero image uploaders
  wired to Vercel Blob, editable services list (replaces hardcoded 4),
  staff editor with headshot uploads and bios. Modern template renders
  all of it (logo → header letter-mark fallback; hero image with gradient
  overlay; configurable services strip; Meet The Team section that
  auto-hides when empty).
- **Vitest test suite** (583 tests) covering middleware, billing sync,
  site rendering, server actions, invite-details, link-patient, patient
  booking, profile updates, services/staff JSON parsing, Gmail webhook
  auth gate, tenant-scoping on ecommerce services, demo-mode actions
  and seeder, modern-template (warm-neutral palette, anti-shame voice,
  numbered service pillars, sticky mobile bar), content sections
  (stats / testimonials / office tour), SEO (publicSiteUrl + Dentist
  JSON-LD branches), booking slot picker (open/closed days, overlap
  math, status filtering, freshness check, race-condition guard),
  intake forms (slug collision, default flag enforcement, archive,
  submit, seed idempotency, by-slug + get-default), clinic overview
  (hero / attention cards / today's chair / glyph matrix / trend tiles
  / activity feed), patients module (glyph cluster render + cap, detail
  header / needs-attention / timeline filter pills / pill count badges,
  bulk-email skip/send/error rules), appointments module (agenda
  rendering / contextual empty states / inline confirm button on
  scheduled rows only / bulk-send bar reveal / appointment glyph cluster
  / groupByDay date-grouping + today-tomorrow labels + totals math /
  computeAging tier transitions T-72h→T-12h→red / rescheduleAppointment
  transaction integrity + provider/location/type preservation + backref
  to original, booking widget tags appointment.source='booking_widget'
  + patient portal tags 'portal'), leads module (convertLeadToPatient
  lifecycle bridge + dedupe-by-phone/email + idempotent re-convert +
  single-vs-multi-word name split / list-view chip count badges +
  contextual empty states + aging-color border + fresh-call-now
  badge + converted-patient backlink / public contact form persists
  lead row even when email is misconfigured + captures UTM attribution).
- **Platform admin "view as clinic" demo mode** — `demo_context` cookie
  carries `{orgId, role, patientId?}`; `getTenantContext` synthesizes a
  clinic/patient context from it when the real user is `platformAdmin`.
  Enter via "View as" button on the clinics list page or "Create demo
  clinic & view" empty-state button (seeds Acme Dental Demo with
  patients, appointments, customers, orders, invoices, tasks, products).
  Sticky amber banner shows on every page while in demo mode; Exit
  button clears the cookie. Real session is untouched throughout.
  `enterDemoMode` auto-self-heals the Acme demo (bumps brandColor,
  backfills stats/testimonials/officePhotos, seeds default intake form)
  whenever the platform admin enters it, so the demo always showcases
  the latest template.
- **Modern Family/Wellness clinic site template** (`/site/[slug]`) —
  Tend-inspired warm off-white palette (`#FAF7F2` bg, `#1C1A17` ink,
  brand color bounded to CTAs only). Sections: header, photo-driven
  hero with copy-primacy fallback, stat anchor row, numbered service
  pillars (01/02/03, capped at 6), team grid (4:5 headshots), long-
  form testimonials, about, office-tour gallery, hours+location,
  booking CTA, footer, sticky mobile Book+Call bar. "Book a Visit"
  copy universal across tiers; anti-shame default subhead. Editable
  via `/settings/clinic` (services, staff, stats, testimonials, office
  photos, hours, brand, logo/hero uploads).
- **SEO foundations for clinic sites** — `publicSiteUrl()` canonical
  URL helper (custom domain or subdomain). `clinicJsonLd()` builds a
  schema.org `Dentist` payload (name, address with primary-location
  preference, OpeningHoursSpecification per open day, AggregateRating
  when stats include a reviewy stat, priceRange). Rendered as
  `<script type="application/ld+json">` in the initial HTML.
  Per-clinic `/sitemap.xml`, `/robots.txt`, and a dynamic OG image
  via Next.js `ImageResponse` (hero-photo overlay or warm copy-primacy
  fallback). `generateMetadata` on `/` and `/book` outputs proper
  title / description / canonical / OG / Twitter / favicon.
- **Real online booking with slot picker** at `/site/[slug]/book` —
  `lib/services/booking.ts` exposes `getAvailableSlots(orgId, date)`
  (30-min grid within clinic hours minus existing appointments,
  cancelled/no_show appointments don't block, past slots filtered)
  and `isSlotAvailable(orgId, startTime)` (race-condition guard called
  before INSERT). UI: 14-day date strip, slot grid with strike-through
  for taken slots, 3-step form (date · time · contact). Patient lookup
  by email OR phone, default endTime = start + 30 min. Universal
  "Book a Visit" copy; basic-tier routes to contact-form anchor instead
  of `/book`.
- **Intake forms** — schema (`form_template` + `form_submission`,
  migration 0017), service in `lib/services/forms.ts` (CRUD +
  `seedDefaultIntakeForm` for new clinics), discriminated-union
  `FormField` type covering text/textarea/email/tel/date/select/radio/
  checkbox/yes_no/signature. Admin UI at `/intake-forms` (list + create
  + builder page with sections + fields, drag-up/down reorder, type
  picker, options editor, required/help/placeholder, archive). Public
  fill at `/site/[slug]/intake/[formSlug]` (warm-neutral template,
  `noindex` meta, required-field validation client + server). Booking
  confirmation email now includes amber "Fill out your intake form"
  block when clinic has a default template. `DEFAULT_INTAKE_TEMPLATE`
  (opinionated standard dental new-patient: demographics, insurance,
  medical, dental history, anti-shame anxiety question, HIPAA,
  signature) seeded for the demo clinic + as the "+ New Form" starting
  point.
- **Morning-huddle Overview module** at `/` (routes to `/dashboard`,
  branches to `ClinicOverview` for clinic tenant). Research-grounded
  in the dental "morning huddle" pattern: six things to action, every
  number drillable. `lib/services/clinic-overview.ts` returns a single
  snapshot (today's chair with per-patient flags, unconfirmed-next-48h,
  intake submissions last 7d, outstanding balances, trend tiles, recent
  activity feed). Per-row glyphs on today's chair: new-patient ★,
  birthday 🎂, balance $, missing-intake 📝!. Three honest "Coming
  soon" placeholders at the bottom (Reviews, SMS replies, Website leads)
  — sets expectations rather than fake-it placeholders for the
  PMS-owned KPIs we deliberately don't show (production $, AR aging,
  case acceptance %, hygiene reappt %).
- **Patients module v1** at `/patients` — dental `patient` table, not
  generic `customers`. Research-grounded as a *relationship record*, not
  a clinical chart (no charts/perio/procedure/claims/Rx — those live in
  the PMS). `lib/services/patients.ts` returns rows with derived columns
  (last visit, next visit, recall status, outstanding balance, lifetime
  value, last contact, source) and a per-row glyph flag set (newPatient
  ★ / birthday 🎂 / $ balance / 📝! missing-intake-before-next-visit /
  ⚠️ unconfirmed-next-48h / 💤 lapsed / 🔕 opted-out). Filter chips
  (All / New / Recall due / Lapsed / Has balance / Missing intake /
  Birthday this month / Source) + fuzzy search across name/email/phone
  + sortable columns. Bulk email send via Resend (`lib/services/
  patient-bulk-comms.ts`) skips no-email/archived patients, personalizes
  with first name, errors don't abort the batch. Detail page at
  `/patients/[id]` — sticky header with lifecycle pill + all-glyphs +
  4-stat strip (last visit / next visit / balance / LTV) + primary CTAs
  (Send message / Book / Send intake / Edit). Left identity rail
  (contact / personal / insurance / portal). Center timeline merges
  appointments + messages + form submissions + invoices + notes +
  "patient added" floor, filtered by tab pills (All / Appointments /
  Messages / Forms / Billing / Notes) with count badges. Right column:
  "Needs attention" panel (per-patient version of the Overview pattern
  — only renders when there's something actionable) + append-only
  relationship-notes panel (separate `patient_note` table, soft-delete
  via `deleted_at`). Migration 0018 added `patient.source / lifecycle /
  first_seen_at / last_activity_at`, the `patient_note` table, and
  `customers.patient_id` FK (replaces brittle email-based joins).
  `/ecommerce/customers` clinic branch 308s to `/patients`; clicking a
  patient name on Today's chair in Overview jumps to their detail page.
  Booking action + invite-accept set `source` on insert; demo seeder
  backfills mixed sources for the 15 seeded patients.
- **Appointments module v1** at `/appointments` — dental `appointment`
  table (NOT the generic `calendar_events`/Mosaic FullCalendar, which
  was previously mis-pointed in the clinic sidebar). Research-grounded
  as a *relationship view of the schedule* — not a PMS scheduler. No
  operatories, no production $, no procedure codes, no claims, no
  charting. The PMS still owns the visit. **Agenda list is the default
  view** (vertical scroll grouped by day, today pinned, sticky day
  sub-header with `N booked · M confirmed · K still need a text`).
  Filter chips in two rows: date window (Today / Tomorrow / This week
  / Next 14 days / All upcoming / Past 30 days) + needs-attention
  (Unconfirmed / Needs intake / New patients / Has balance / Lapsed
  rebooking / Cancelled / No-show), plus staff + booking-source
  dropdowns (Public booking widget / Patient portal / Front desk /
  Phone / Recall campaign / Invite — auto-hides when org has none) +
  fuzzy search across patient name / email / phone / notes. Glyphs travel from
  Patients (★/🎂/$/📝!/⚠️/💤/🔕) plus 3 appointment-scoped (⏱ reminder
  sent recently, 🆕 booked just now, 📅 rescheduled). Aging-color left
  border on unconfirmed rows drifts T-72h → T-12h (Pipedrive-rotting
  borrow). Each row clicks into a right-side drawer with patient header
  + lifecycle pill + all glyphs + 4-stat patient context + primary
  actions (Mark confirmed / Send reminder email / Reschedule / Mark
  completed / Mark no-show / Cancel) + reminder-activity audit stripe.
  Reschedule sub-drawer reuses `lib/services/booking.ts` slot-availability
  guards + sends a "we moved your time" email when the notify-patient
  checkbox stays checked. The original row is kept as `cancelled` with
  the new row's `rescheduledFromAppointmentId` pointing back — full audit
  trail. Bulk-select + sticky bulk-send bar for emailing multiple
  reminders at once. "Book appointment" CTA on the patient detail page
  opens an in-place drawer with date/time/type/notes form (no navigation
  away from the patient page). `/calendar` 308s to `/appointments` for
  clinic tenants; platform org keeps the generic FullCalendar for product
  planning. Migration 0019 added `appointment.confirmedAt / cancelledAt
  / completedAt / noShowedAt / confirmedVia / rescheduledFromAppointmentId
  / source / providerId`, the new `clinic_provider` table (CRM-side
  staff label, NOT a clinical provider record — no NPI/license/
  signature), and the new `appointment_reminder_log` table (one row per
  reminder send, with reply audit columns). Demo seeder pump: 17
  curated appointments (vs. random) covering every glyph state,
  2 clinic_provider rows (Dr. Reyes + Maria Vega RDH) attached to every
  appointment, 4 reminder log entries (one with a reply from Sophia),
  Aiden's 💤 lapsed-rebooking, Emma's 🆕 just-booked, Mia's 📅
  rescheduled-with-phantom-cancelled-source.
- **Website Leads v1** at `/leads` — turns the public-site contact-form
  pipeline from "fire-and-forget email" into a tracked triage queue.
  New `lead` table (migration 0020) carries contact info, source
  attribution (sourcePage / referrer / utm_source/medium/campaign
  captured client-side at submit), lifecycle (`new` → `contacted` →
  `converted` or → `archived`), audit timestamps, and a soft pointer
  `convertedToPatientId` linking to the patient row created on convert.
  Status filter chips with count badges, fuzzy search, aging-color left
  border that drifts green (under 1h) → red (over 72h) so untouched
  leads visibly rot. Right-side drawer with one-click Mark Contacted /
  Convert to Patient (creates patient with `source='lead_form'`, dedupes
  by phone/email, transactionally flips the lead) / Archive (with reason
  picker). The convert action lands the user on the new patient's
  detail page so they can book the first appointment immediately.
  Source-attribution surfaces in both the row card (UTM campaign tag)
  and the drawer (full breakdown). Overview "New leads" attention card
  replaces the prior coming-soon placeholder. Demo seeder pump: 6
  curated leads (fresh / aging / stale-red / contacted / converted-to-
  Emma-Lopez / archived-spam) covering every lifecycle state.
- **Gmail push notifications via Google Pub/Sub** — `users.watch()` is
  registered when a mailbox is connected; Gmail publishes change events
  to `projects/dreamcrm-496717/topics/gmail-watch`; the push subscription
  POSTs to `/api/webhooks/gmail` (OIDC-verified); `processHistoryEvent`
  diffs from the stored historyId via `users.history.list` and ingests
  new messages. A daily Vercel cron at 04:00 UTC renews any watch that
  expires within 36h (`/api/cron/gmail-watch-renew`). Existing polling
  (auto-sync on page load + Refresh button) remains as a fallback path.
- **Recall & Outreach v1 (Phase A — email-only)** — turns the existing
  platform-tenant Marketing module into a dental-shaped recall + nurture
  engine for clinic tenants. Schema (migration 0021): `patient` gains
  `marketing_email_opt_in` + `marketing_sms_opt_in` (+ timestamps + source)
  with email default-on, sms default-off per TCPA; `audiences` and
  `campaigns` gain a `recipient_source` discriminator (`'customers'` for
  SaaS leads, `'patients'` for dental); `audiences.patient_filter` jsonb
  holds the patient-specific filter shape (lifecycles, recallStatuses,
  lastVisit windows, hasOutstandingBalance, birthdayThisMonth,
  hasUnconfirmedNextHours, requireEmail/SmsOptIn, includeArchived);
  `campaign_events` gains `patient_id` + `booked_appointment_id` +
  `booked_at` columns + a `'booked'` event type for outcome attribution;
  new `campaign_templates` table (system + per-org); new
  `clinic_sms_config` table (empty stub for Phase B Twilio); new
  `'twilio_sms'` channel enum value (no-ops with a clear error in Phase A).
  `lib/services/marketing.ts` `resolveAudience` dispatches between
  `resolveCustomerAudience` and `resolvePatientAudience` based on
  `recipientSource`; the patient resolver mirrors `listPatients` derived
  logic (recall status, lapsed cutoff, balance join) so audience previews
  match what the front desk sees on the patients page. Send orchestrator
  (`lib/services/marketing-send.ts`) handles both recipient shapes —
  tags emails with `patientId` or `customerId` so the Resend webhook +
  tracking pixel + unsub route can attribute back to the right source.
  Unsubscribe + hard-bounce + complaint all flip
  `patient.marketing_email_opt_in=0` (alongside the existing customer
  opt-out). Three system templates seed idempotently on first read:
  Reactivation, Birthday, New-patient welcome (warm-neutral voice, no
  marketing-bro vocabulary, all include the `{{firstName}}` token).
  `patient.flags.optedOut` now reads from the new column → 🔕 glyph
  fires correctly on the patients list. Demo seeder pump: opt-in
  distribution across the 15 personas (13 opted-in, 2 opted-out for the
  🔕 glyph; 2 also sms-opted-in for the Phase B audience), 4 patient-
  source audiences (Recall due / Lapsed lifecycle / New patients 60d
  / Birthday this month), 3 campaigns (1 sent with realistic event funnel
  ending in Aiden\'s booked attribution / 1 scheduled / 1 draft).
  Self-heal block in `enterDemoMode` tops up legacy demos with all of the
  above on next platform-admin "View as clinic" entry. Phase B (Twilio)
  layers SMS sends + STOP-keyword opt-out + inbound replies onto these
  foundations without another migration.
- **Patient Communications v1** — Front-style unified inbox replacing the
  generic Mosaic chat for clinic tenants. Schema (migration 0022):
  `patient_thread` (one per organization+patient, enforced unique) +
  `patient_message` (channel: `in_app` | `email` | `sms` + direction +
  body + audit timestamps + externalId for Gmail/Twilio back-ref).
  Service (`lib/services/patient-messaging.ts`) merges
  `patient_message` rows + existing `email_message` rows (patientId FK
  populated on Gmail ingest) into a unified ThreadMessage stream — no
  double-write, no backfill drift. UI at `/messages` for clinic:
  two-pane layout with top filter bar (status / assignment / unread-
  only with live counts), 22rem thread list with aging-color rot border
  on inbound-unanswered (emerald < 4h, amber < 24h, rose > 24h
  mirroring Leads), channel-colored bubble stream, reply composer
  pinned bottom with channel picker auto-defaulting to last-inbound +
  template dropdown (3 canned: confirm visit / treatment follow-up /
  quick scheduling question) + ⌘+Enter to send. Sticky thread header
  with snooze (4h / tomorrow / next week) / archive / reopen + assign
  + patient link. Demo seeder pump: 5 curated threads covering every
  state (Mia happy-path closed-loop email+in-app; Marcus RED ROT 72h
  unanswered 2-unread; Sophia recently closed; Aiden SNOOZED post-
  rebooking; Emma AMBER ROT 16h inbound). Patient timeline integration
  also pulls `patient_message` + `email_message` rows inline, with
  message-kind events linking to `/messages?thread=<id>`. Platform
  tenant keeps the generic Mosaic chat surface (different mental model).
- **Website Editor v1** — Per DESIGN.md "the website is the trunk",
  `/website` promoted out of `/settings/clinic` into a real top-level
  dashboard. Hero with View-live-site CTA + public URL; 4-stat row
  (template / brand color / plan / setup completion with warn tone on
  required-missing); 12-item Setup checklist (required: Logo, Tagline,
  Hero image, About, Services ≥4, Staff ≥2, Office hours, Address+
  phone; optional: Testimonials, Office photos, Stat anchors, Brand
  color) with ✓ Set / ~ Partial / ⚠ Missing pills per item, each
  linking to `/settings/clinic` for deep edit; Public surfaces list
  (homepage / `/book` / intake forms / sitemap / robots / opengraph-
  image — each with View link); Locations summary; "Coming next"
  footer with the v1.1 roadmap (multi-page editor, template switcher
  with preview, custom domain wiring, per-page SEO). Deep content
  editing stays at `/settings/clinic`.
- **Reviews & Reputation v1** — Post-visit review requests across
  Google / Healthgrades / Facebook. Schema (migration 0023):
  `clinic_review_config` (per-org platform IDs, 365-day default rate
  limit, NPS toggle off, auto-trigger toggle off) + `review_request`
  (status funnel `pending → sent → clicked → completed | skipped |
  failed`, signed opaque token, optional rating + private feedback
  for v1.1 NPS path). Service (`lib/services/reviews.ts`):
  `createAndSendReviewRequest` validates rate-limit + config + opt-in,
  sends via Resend; `listEligiblePatients` for the "Ready to ask"
  dashboard list (visit completed last 30d + email opt-in + no recent
  ask); `getReviewStats` for the 4-KPI funnel. UI: `/reviews`
  morning-huddle dashboard (Sent · Opened · Reviewed · Ready-to-ask
  KPIs + platform-mix breakdown + Ready-to-ask one-click send list +
  recent activity table + inline config panel). Public landing at
  `/r/<token>` outside auth (token IS the auth, `/r` in middleware
  PUBLIC_PATHS), platform-pick buttons are server-action forms
  recording click + redirecting to external write-review URL.
  Research-grounded: Google primary (~80% of dental review value),
  Healthgrades > Facebook for healthcare reputation, **Yelp opt-in
  only** (Yelp filters solicited reviews → prompts hurt more than help;
  Birdeye/Weave/Swell all exclude). **No NPS gating** — same prompt to
  every recipient, FTC-clean per the 2024 Fake Reviews Rule ($53k per
  violation; Podium is the cautionary tale). 365-day rate limit
  matches NiceJob lockout dialed conservative for dental visit cadence.
  Manual send in v1; auto-trigger 24h after `appointment.status='
  completed'` is v1.1 (cron-driven; `autoSendEnabled` schema bit ready).
  Demo seeder pump: 6 review_request rows covering every funnel state.

## Module status snapshot (clinic dashboard)

Sidebar grouped by user workflow: **Daily** (every-day cockpit) /
**Growth** (acquisition + retention) / **Website** (storefront editor) /
**Business** (commerce + integrations) / **Settings**. Each section
matches DESIGN.md's roadmap phases.

Live = real data + interaction. Soon = placeholder page with roadmap
copy + competitor reference + today-alternative link. Dropped from
sidebar = the route may still exist but isn't surfaced to clinic users.

| Section | Module | Sidebar path | Status | Notes |
|---|---|---|---|---|
| Daily | Overview | `/` → `/dashboard` | **Live (v1)** | Morning-huddle dashboard |
| Daily | Patients | `/patients` | **Live (v1)** | Dental `patient` table — glyph cluster, filters, detail page with timeline + needs-attention + notes |
| Daily | Appointments | `/appointments` | **Live (v1)** | Agenda list grouped by day, aging-color borders, drawer for confirm/reschedule/cancel, bulk reminder send |
| Daily | Leads | `/leads` | **Live (v1)** | Website contact-form triage queue with status chips + convert-to-patient |
| Daily | Messages | `/messages` | **Live (v1)** | Front-style unified Patient Communications: one thread per patient across channels (in_app + email; sms is Phase B). Filter chips (Open / Snoozed / Archived / All + Everyone / Mine / Unassigned + Unread only), aging-color rot border on unanswered inbound, two-pane layout (thread list + detail), reply composer with channel picker + 3 canned templates with `{{firstName}}` interpolation, snooze (4h / tomorrow / next week) / archive / reopen actions. Aggregates existing `email_message` rows (with `patient_id` FK from ingest) into the thread stream — no double-write. Platform tenant keeps the generic Mosaic chat surface |
| Daily | Inbox | `/inbox` | Live | Gmail integration, real-time SSE, triage, threading |
| Daily | Intake Forms | `/intake-forms` | **Live (v1)** | Builder + public fill at `{slug}.dreamcreatestudio.com/intake/[formSlug]` |
| Growth | Recall & Outreach | `/marketing` | **Live (v1 + UX overhaul)** | Morning-huddle dashboard, Outreach Queue at `/marketing/outreach`, patient-segment audience editor, Sent→Opened→Clicked→Booked funnel attribution |
| Growth | Reviews | `/reviews` | **Live (v1)** | Post-visit review requests across Google / Healthgrades / Facebook (Yelp opt-in only per industry pattern — their solicited-review filter penalizes prompts). Morning-huddle dashboard: 4-stat funnel (Sent · Opened · Reviewed · Ready-to-ask) + platform mix breakdown + "Ready to ask" list with one-click send per eligible patient + recent activity table + inline config panel. Public landing at `/r/<token>` with multi-platform tap-through, no NPS gating (FTC-clean per the 2024 Fake Reviews Rule). 365-day default rate limit. Manual send in v1; auto-trigger on appointment completion is v1.1 (cron-driven). |
| Growth | Analytics | `/analytics` | **Live (v1)** | Premium-tier. The honest CRM-vs-PMS split: read-only aggregation (no new schema) over data other modules already capture. 5 bands — Acquisition (new patients via firstSeenAt + source mix + a real GSC-clicks→leads→contacted→converted website funnel), Schedule health (volume trend + no-show/cancellation/confirmation rates vs an industry benchmark, with a low-volume guard that shows counts instead of a misleading % on small samples), Recall & outreach (recall-due reuses listPatients + sent→opened→clicked→booked), Reputation (review funnel + platform mix, reuses getReviewStats), and an honest "Lives in your PMS" deferral block (production $, procedure mix, hygiene reappt %, AR aging) that arrives with Integrations rather than being faked. 30/90-day toggle. Aggregates existing demo data — no seeder change |
| Website | Website Editor | `/website` | **Live (v1)** | Per DESIGN.md "the website is the trunk" — promoted out of Settings into a real dashboard. Hero with View-live-site CTA + public URL, 4-stat row (template / brand color / plan / setup completion), 12-item Setup checklist (required vs optional, with ✓ Set / ~ Partial / ⚠ Missing pills per item, each linking to /settings/clinic for the deep edit), Public surfaces list (homepage / book / intake forms / sitemap / robots / OG image — each with View link), Locations summary, "Coming next" footer with the v1.1 roadmap. Deep content editing remains at /settings/clinic |
| Website | Blog | `/blog` | Soon | Phase 1 placeholder — Tiptap editor + SEO + AI-assisted drafts |
| Website | SEO | `/seo` | **Live (v1)** | Base SEO (sitemap / robots / JSON-LD / OG images / canonicals) is live. Dashboard surfaces site-health checks, an organic→leads→bookings funnel, real Search Console clicks + top queries, and reviews as a ranking signal. **Search Console is a single shared platform connection, zero-config for clinics**: the platform admin connects ONCE with the `sc-domain:dreamcreatestudio.com` Domain property (covers apex + www + every clinic subdomain); each clinic's SEO tab reads that connection scoped to its own pages via a `page contains '/site/<slug>'` (or `<slug>.` in subdomain mode) filter — clinics connect nothing. OAuth routes a platform-admin's connect to the platform org even from demo mode (`getPlatformOrgId`); `getClinicSeoPerformance` does the scoped read (also feeds the Analytics website funnel). Platform context (`tenantType==='platform'`) shows the manage view (connect / pick property / whole-domain perf); clinic/demo shows the scoped read. Custom-domain clinics aren't covered by the shared property (future: their own connection). Rank tracking + page-speed + GBP still roadmap |
| Website | Careers | `/careers` | **Live (v1)** | Premium-tier. Job postings on the clinic's own site + a built-in ATS — replaces the $400/mo DentalPost board. **The "Indeed integration" is structured-data, not a partner API**: each open role renders at `{slug}.../careers/[jobSlug]` with `JobPosting` JSON-LD so **Google for Jobs + Indeed index it for free** (Indeed's Job Sync API is ATS-partner-only; the direct-employer path is the `/site/[slug]/jobs.xml` feed we also generate). Schema (migration 0031): `job_posting` (role/employment/comp/status/apply-method) + `job_application`. Admin `/careers`: Roles tab (create/edit via `/careers/new` + `/careers/[id]`, publish/close/delete) + Applicants tab (triage pipeline new→reviewing→interview→offer→hired/passed, aging-color rot border on un-reviewed, drawer with résumé download + rating + notes). Public apply form uploads résumé to S3 via a public server action (auth-gated upload route can't serve unauthenticated applicants). Client-safe types/labels/JSON-LD in `lib/types/careers.ts`; DB functions in `lib/services/careers.ts`. Demo seeder: 2 open roles + 1 draft + 7 applicants across every pipeline state (aging spread). Scope = permanent/part-time hires for one practice, NOT a temp/gig marketplace (Cloud Dentistry's lane). Full one-click *Indeed Apply* is a future partner track |
| Business | Shop | `/shop` | **Live (v1 — complete)** | Premium-tier. Phase 3 differentiator (no orbital-layer competitor ships a storefront — confirmed Weave/NexHealth/RevenueWell have none). Built in slices: **(1 shipped)** migration 0032 = 8 purpose-built `shop_*`/`membership*` tables (separate from the generic Mosaic products/orders), Connect *Standard* designed so payouts land in the clinic's own bank. **(2 shipped)** `/shop` admin: product/variant catalog CRUD (`/shop/products/new` + `/shop/products/[id]`, image upload to S3, multi-variant pricing + inventory, FSA-with-Rx flag, draft/active/archived), fulfillment + tax config toggles, Stripe Connect status card. **(3a shipped)** Stripe Connect *Standard* OAuth onboarding — per-clinic (each clinic connects its OWN account so payouts hit their bank; `lib/services/shop-connect.ts` + `/api/connect/shop/start`+`/callback`, mirrors the GSC code-exchange), status auto-refresh on `/shop` load (pending→active), disconnect/deauthorize. `STRIPE_CONNECT_CLIENT_ID` is set in `dreamcrm/app-secrets` + mapped on App Runner; Connect config = Standard accounts · hosted onboarding · Stripe Dashboard. Client-safe types/labels in `lib/types/shop.ts`; DB in `lib/services/shop.ts`. **(3b shipped)** public storefront `/site/[slug]/shop` (+ `[productSlug]` detail, localStorage cart namespaced per slug, `/cart` review+checkout) → Stripe Connect **direct-charge** Checkout Session on the clinic's account (`lib/services/shop-checkout.ts`; pickup or ship + flat-rate shipping + Stripe Tax on ship only; optional platform application fee via `platformFeeBps`), idempotent order finalize via the `/shop/success` page **and** a `/api/webhooks/stripe-connect` backstop (needs `STRIPE_CONNECT_WEBHOOK_SECRET` + a Connect webhook endpoint for `checkout.session.completed`) — inventory decrement + patient linkage by email/phone on payment. Orders admin at `/shop/orders` (fulfillment pipeline unfulfilled→ready/shipped→picked-up/delivered + tracking). `storefrontEnabled` gates the public pages. Demo seeder: 6 products (7 variants) + config + 3 orders (paid pickup / paid shipped+tracking / pending). **(5 shipped)** membership plans — `lib/services/membership.ts` + `lib/types/membership.ts`: plan CRUD at `/shop/memberships` (+ `/new`+`/[id]` builder: name/interval/price/benefits/discount), **lazy Stripe price sync** (product+recurring price created on the connected account on first join, so no Stripe call until an account exists), public `/site/[slug]/membership` (plan cards + join) → **subscription** Checkout Session on the clinic's connected account, members tab with benefit-redemption tracking (`benefitsUsed`), subscription lifecycle (`customer.subscription.updated/deleted`) handled by the same `/api/webhooks/stripe-connect` (branches on `session.mode`). `membershipEnabled` gates the public page. Dashboard shows active-member count + MRR. Demo seeder: 2 plans (Smile Club annual $399 + monthly $39) + 3 members (active/active/past-due). `membership.patientId` is required, so a join matches/creates a patient (`source='membership'`). Self-heal seeds plans (+ members for existing patients) on legacy demos. **(4 shipped)** coupons — `lib/services/coupons.ts`: manual promo codes (% or $ off, optional min-subtotal / expiry / single-use) + one-click **birthday codes** (single-use, auto-generated off `patient.dateOfBirth` month, idempotent per month). Admin `/shop/coupons` (create + list + deactivate + generate-birthday). Applied at checkout via a one-time Stripe coupon on the connected account (`discounts:[{coupon}]`, exact computed cents so %/$ behave the same); cart has a promo field with live validate; single-use burns on order finalize. Demo seeder: WELCOME10 + SUMMER25 + a birthday code. **Shop module is feature-complete for v1** (catalog · Connect · storefront+checkout · orders · memberships · coupons). **Research-grounded:** FSA/HSA is mostly a myth (cosmetic whitening + plain brushes ineligible; electric brushes only with an Rx) so it's an optional per-product flag, not a headline. **Stripe Connect can't be fully sandbox-tested** (no connected accounts/cards) — logic is unit-tested; money flow verified in Stripe test mode |
| Business | Integrations | `/integrations` | Soon | Phase 4 — Open Dental first, Dentrix second. Two-way PMS sync |
| Settings | Settings | `/settings/account` | Live | + `/settings/clinic` for site editor, `/settings/locations` for multi-location |

**Dropped from clinic sidebar** (route files may still exist for
platform tenant or as legacy entry points):
- `Analytics /dashboard/analytics` — Mosaic template, not dental-shaped (replaced by clinic-side `/analytics` placeholder)
- `Revenue /dashboard/fintech` — fintech-card demo, completely unrelated to clinic finance
- `Product Orders /ecommerce/orders` — superseded by `Shop /shop` placeholder; route still works as the interim product-orders surface
- `Tasks /tasks/kanban` — research across 8 dental orbital-layer products (Weave / NexHealth / RevenueWell / Modento / Lighthouse / Solutionreach / Adit / Practice by Numbers) found 0 ship a generic kanban; the dental pattern is patient-attached followups, already half-shipped across Overview attention cards + Patients needs-attention + Appointments aging-color + Leads rot. Future "Followups" surface goes inside Patients detail, not a top-level module
- `Invoices /invoices` — Mosaic stub that 404s. Clinical billing is PMS-owned (out of scope per DESIGN.md); Shop payments + booking deposits + memberships will live inside Shop (Phase 3) as "Orders & Payments"

Public clinic surfaces also live:
- `{slug}.dreamcreatestudio.com/` — Modern Family/Wellness template
- `{slug}.dreamcreatestudio.com/book` — slot-picker booking (pro/premium)
- `{slug}.dreamcreatestudio.com/intake/[formSlug]` — public form fill
- `{slug}.dreamcreatestudio.com/sitemap.xml`, `/robots.txt`
- `{slug}.dreamcreatestudio.com/opengraph-image` — dynamic OG image

## What's NOT yet wired (priorities for next session)

### AWS migration — DONE (see "Vercel → AWS migration" below for status)

The Vercel → AWS migration is complete: the app runs on App Runner + RDS +
S3 + SES, canonical at https://www.dreamcreatestudio.com. Remaining loose ends
(SES production access, optional Bedrock, moving the domain off Replit, the
eventual App Runner → ECS move) are tracked in that section.

### Feature work, post-migration

1. **Phase B — SMS (unlocks across 3 modules)** — Recall & Outreach
   SMS sends, Patient Communications SMS in + outbound, Reviews SMS
   channel. **Plan changed: AWS End User Messaging SMS, not Twilio.**
   Rationale: AWS BAA covers SMS alongside SES + S3 + Bedrock under a
   single agreement vs. Twilio's per-product BAAs. Schema is in place
   across migrations 0021/0022/0023 — `clinic_sms_config` columns
   keep their `twilio_*` names (storing AWS origination identity in
   `twilio_phone_number` etc. is just a string-typed column; no
   migration needed). Channel enum `'twilio_sms'` stays for back-
   compat, surfaced as "SMS" in UI. What's needed post-migration:
   lazy Proxy AWS-SDK SMS client at `lib/aws-sms.ts`; send-orchestrator
   SMS branch (currently a no-op with clear error in each of the 3
   services); inbound webhook `/api/webhooks/aws-sms` (SNS-triggered)
   for replies + STOP/HELP keyword handling; settings UI for the
   per-org origination identity + A2P 10DLC status. AWS submits the
   brand + campaign registration on your behalf — 5-14 business days
   for carrier approval, same regulatory clock as Twilio. SMS channel
   stays disabled in UI until `clinic_sms_config.a2p_status='approved'`.
   Twilio creds from prior conversation transcripts can be rotated +
   discarded — they're no longer the target integration.
2. **Reviews auto-trigger (v1.1)** — cron-driven send 24h after
   `appointment.status='completed'` for orgs with
   `clinic_review_config.autoSendEnabled=true`. The schema bit is
   already there; needs a cron entry + handler that queries
   `appointment completed AND completedAt < now - autoSendDelayHours
   AND no review_request in last minDaysBetweenRequests`. Wire
   alongside the AWS migration so the cron mechanism (EventBridge /
   Lambda scheduler / etc.) is decided once.
3. **Subdomain DNS** — `*.dreamcreatestudio.com` wildcard isn't set.
   Apex resolves to platform but subdomains NXDOMAIN. Required record
   on the registrar: `CNAME *` pointing at the new hosting target
   post-AWS-migration. Path-based URLs (`/site/[slug]/...`) work today
   as a workaround.
4. **Real annual Stripe prices** — split the 3 `STRIPE_PRICE_*_ANNUAL`
   envs (they currently point to the same monthly prices).
5. **Multi-page Website editor (v1.1)** — about page, services detail,
   custom landing pages, blog posts. Template switcher with preview
   (Cosmetic / Pediatric variants per DESIGN.md). Custom domain wiring
   for the `websiteDomain` column. Per-page SEO controls.
6. **Patient portal completion** — `/patient/*` exists but bills is
   placeholder; records, messages, intake-fill, refill-request still
   marked 'soon' in the patient sidebar.
7. **Patients module v2** — per-patient tags + audience targeting;
   comms preferences granularity; household linkage table for
   pediatric/family clinics; per-view audit log for Premium tier;
   `patient.source` backfill for legacy rows (currently null on rows
   pre-migration-0018).
8. **Shop module (Phase 3)** — the differentiator nobody else ships
   (whitening kits + branded merch via Stripe Connect, birthday
   coupons, loyalty mechanics, membership plans). `/shop` placeholder
   exists. Existing `/ecommerce/orders` route serves as interim view.
9. **Patient detail "Send review request" button** — quick row action
   directly on the patient detail page; today the only entry point is
   the Reviews dashboard's Ready-to-ask list.
10. **Coming-soon clinic modules to build out** — Analytics (dental
    KPIs: recall conversion, no-show, hygiene reappt, schedule
    utilization), Blog (Tiptap + SEO + AI drafts), SEO dashboard
    (rankings + page health on top of the already-live base SEO),
    Careers (job postings + applicant tracking), Integrations
    (Open Dental + Dentrix two-way sync).

## Vercel → AWS migration (LARGELY COMPLETE)

**Status:** the app runs on **AWS App Runner** (`us-east-1`) from an **ECR**
image, on **RDS Postgres** (private/VPC), with **S3** storage and **SES** email
live. Canonical domain **https://www.dreamcreatestudio.com**.

**Done:** containerized (Dockerfile + standalone output) → ECR → App Runner;
RDS via node-postgres; S3 storage (`STORAGE_DRIVER=s3`); SES email
(`EMAIL_DRIVER=ses`, domain verified + DKIM + DMARC); security headers moved
into `next.config.js`; VPC NAT egress route + free S3 gateway endpoint;
CloudWatch alarms + SNS + 30-day log retention; RDS hardening (deletion
protection, storage autoscaling, Performance Insights); ECR lifecycle policy;
third-party secrets recovered from Vercel into Secrets Manager; Stripe webhook
repointed to the App Runner domain; `www` made canonical with `app.`/bare
redirecting to it.

**Remaining:** SES production access (appeal pending AWS review); optional AI →
Bedrock (needs the Bedrock Anthropic use-case form + quota bump); move the
domain off Replit so the bare apex can point straight at AWS and the Vercel
redirector can be retired; SMS (future). **App Runner is closing to new
customers (Apr 2026)** — existing workloads keep running + patched, but plan an
eventual move to **ECS** (Express Mode or Fargate+ALB), which also unblocks a
static-IP/apex without the redirect workaround.

**Original plan + inventory below (kept for reference):**

**Strategic decision driving the migration**: consolidate every PHI-
touching dependency under the single AWS Business Associate Agreement
(BAA) instead of stitching together per-vendor BAAs (Twilio + Resend +
Anthropic + Vercel + ...). One BAA, one bill, one IAM policy surface —
materially simpler HIPAA posture for the clinic-tenant data model.

That means the migration replaces *both* Vercel infra surfaces *and*
the third-party integrations that aren't AWS-native. Inventory below.

### Third-party services → AWS replacements

| Current | Use in DreamCRM | AWS replacement | Migration shape |
|---|---|---|---|
| **Resend** | Transactional sends (password reset, invite, review request); marketing campaign sends in Recall & Outreach; FROM `Hello@DreamCreateWeb.com` | **AWS SES** (Simple Email Service) | Swap `lib/email.ts` + the Resend client in `lib/services/marketing-send.ts` + `lib/services/reviews.ts`. SES needs verified domain identity + DKIM + per-region quota request out of sandbox. Bounce/complaint webhook becomes SNS → Lambda → `/api/webhooks/ses` (replacing the Svix-signed Resend webhook). Open/click tracking moves to SES configuration sets (event publishing → SNS → our existing campaign_events ingest) |
| **Twilio** (planned Phase B — never shipped) | SMS sends for Recall, Patient Communications, Reviews; inbound webhook + STOP keyword handling | **AWS End User Messaging SMS** (formerly Pinpoint SMS) | Drops the never-shipped Twilio integration entirely. Build the lazy Proxy client as `lib/aws-sms.ts` (not `lib/twilio.ts`). A2P 10DLC registration is still required (5-14 business day carrier approval — AWS submits the brand + campaign on your behalf, same regulatory clock). Inbound SMS publishes to SNS → our webhook. **Schema columns named `twilio_*` in `clinic_sms_config` get repurposed**, not renamed (column name is just a string; we keep `twilio_phone_number` storing the AWS origination identity to avoid a migration). Channel enum value `'twilio_sms'` stays for backwards-compat; surface it as just "SMS" in UI |
| **Anthropic API (direct)** | Claude Sonnet calls in `lib/services/ai-marketing.ts` (campaign draft + improve copy) and any other AI surface | **AWS Bedrock** with Anthropic models | Swap the `@anthropic-ai/sdk` import for `@aws-sdk/client-bedrock-runtime`. Same model family available (Claude Sonnet 4.x / Opus 4.x). Caching + thinking features map across. Auth becomes IAM instead of `ANTHROPIC_API_KEY` |
| **Vercel Blob** (`lib/blob.ts`, `@vercel/blob`) | Logo / hero / staff headshot / office photo / intake-form-attachment uploads. ~10 call sites | **AWS S3** + signed PUT URLs | Single-file swap inside `lib/blob.ts` keeps call sites unchanged. Use S3 presigned URLs for browser-direct uploads (skip the `app/api/upload` round-trip if we want), or keep the upload API and have it `PutObject` to S3 |
| **Stripe** | Checkout + Customer Portal + subscription billing + future Connect (Shop Phase 3) | **No change** — stays Stripe | No AWS equivalent for card processing. Stripe has a healthcare BAA; sign it alongside the AWS BAA |
| **Gmail OAuth** | Staff connects their workspace Gmail for the Inbox module (reading clinic-bound email, sending replies). Also a marketing-send channel in Recall & Outreach | **No change** — stays Gmail OAuth | Cannot replace; it's the clinic's own mailbox. Note that with SES on outbound, the Gmail-send option in Recall becomes the "send from my own mailbox" option, and SES becomes the "send branded blast" option (current Resend tradeoff just with SES on the branded side) |
| **Neon Postgres** | Primary DB | **No change** — Neon stays | Already us-east-aligned with where we'll likely land on AWS. Connection string moves to Secrets Manager; otherwise no app-side change. If we ever want everything inside one BAA, RDS Postgres is the migration target — but Neon's serverless model is a real ops win and they have a separate BAA |

### Vercel infra surfaces → AWS

| Vercel surface | What it does | Likely AWS replacement |
|---|---|---|
| **Build + deploy** | Git-push auto-deploy from `main` | CodePipeline + CodeBuild → ECS Fargate, OR App Runner, OR Amplify Hosting |
| **Serverless functions** | Next.js API routes + Server Actions run as Vercel functions | Same code on Lambda (via SST / OpenNext / Amplify) or containerized on Fargate |
| **Edge runtime** | `middleware.ts` runs at edge | CloudFront Functions (limited) or Lambda@Edge |
| **`vercel.json` function timeouts** | Per-route `maxDuration` overrides (Stripe webhook 30s, upload 60s, Gmail watch renew 60s) | Lambda timeout settings per function |
| **`vercel.json` cron** | `0 4 * * *` runs `/api/cron/gmail-watch-renew` | EventBridge Scheduler → Lambda invocation, OR EventBridge + ECS Fargate task |
| **`vercel.json` headers** | Security headers (HSTS, X-Frame-Options, etc.) on all routes | CloudFront response-headers policy, OR set in `next.config.ts` |
| **Speed Insights + Web Analytics** | Vercel-managed RUM + page-view analytics | CloudWatch RUM, or self-host Plausible/PostHog |
| **`next/image` optimization** | Automatic image optimization on Vercel CDN | `next.config.ts` `images.loader: 'custom'` pointing at a Lambda + CloudFront image pipeline, OR pre-process at upload time and skip runtime optimization |
| **`next/og` `ImageResponse`** | Dynamic OG image rendering for clinic sites at `/site/[slug]/opengraph-image` | Runs on any Node runtime; works on Lambda + container deploys. Confirm Edge runtime isn't required |
| **Domain config** | apex `dreamcreatestudio.com` + wildcard `*.dreamcreatestudio.com` + auto SSL | Route 53 hosted zone + ACM cert (wildcard) + CloudFront distribution. Wildcard DNS still pending |
| **Subdomain rewrite in `middleware.ts`** | `{slug}.dreamcreatestudio.com` → `/site/{slug}` | Same code works wherever middleware runs; verify Lambda@Edge / CloudFront Functions compatibility |
| **Env var management** | Encrypted envs per project + per env target | AWS Secrets Manager (PHI-touching secrets) OR Systems Manager Parameter Store (config), surfaced into Lambda env vars or container task definitions |
| **Webhook endpoints registered with vendors** | Stripe + Gmail Pub/Sub all point at `dreamcreatestudio.com/api/webhooks/*` | Same URL post-migration (domain stays). New: `/api/webhooks/ses` for SES bounce/complaint events; `/api/webhooks/aws-sms` for inbound SMS. Rotate **every** signing secret as part of the cutover |
| **Migration bootstrap pattern** | One-shot `/api/admin/bootstrap` route + `ADMIN_BOOTSTRAP_TOKEN` env + paired cleanup PR | Same pattern works post-migration; only the env-set/delete API endpoints change (Vercel API → AWS Secrets Manager `PutSecretValue` / `DeleteSecret`) |

### Pre-migration code hygiene

Already done (no action needed):
- All current migrations applied to prod through 0023 (`_dreamcrm_migrations_applied` ledger reflects 0000–0023)
- Bootstrap route + middleware allowlist removed after every migration apply (latest cleanup: PR #108)
- 627/627 tests passing, typecheck clean
- No uncommitted changes on `main`
- Twilio integration was never shipped — no code to remove, just a never-built Phase B plan replaced with AWS SMS

To-do in the AWS migration session (rough order):
1. Decide on the deploy shape (SST / OpenNext / Amplify / containerized Next.js standalone build) before changing any code
2. Sign the AWS BAA, request SES sandbox-exit, kick off A2P 10DLC registration (5-14 business days — start early)
3. Audit `next.config.ts` for Vercel-specific settings
4. Swap `lib/blob.ts` → S3, `lib/email.ts` + send-paths → SES, `lib/services/ai-marketing.ts` → Bedrock. Each is a single-file (or small-fan-out) change; type-compat shims recommended so call sites stay the same
5. Build `lib/aws-sms.ts` for Phase B SMS, wire the inbound webhook
6. Move the Vercel cron to EventBridge
7. Wire CloudFront + Route 53 + ACM for the domain
8. Rotate every webhook signing secret post-cutover (Stripe, Gmail Pub/Sub, new SES, new AWS SMS)

## Deployment & operations

- **Production**: AWS **App Runner** service `dreamcrm` (`us-east-1`) serving
  ECR `…/dreamcrm:latest`. Public ingress; egress via a VPC connector (subnets
  route `0.0.0.0/0` → NAT + a free S3 gateway endpoint) so it reaches private
  RDS in-VPC *and* the internet (Stripe / Google / SES / Anthropic). Health
  check `/api/health`. Auto-deploy off.
- **Canonical URL**: `https://www.dreamcreatestudio.com`. `app.` + the bare apex
  redirect to www — `app.` via `middleware.ts`, the bare apex via a Vercel
  redirect (its DNS is at name.com/Replit and a bare apex can't CNAME to App
  Runner). Retire the Vercel redirect once the domain moves to a registrar with
  apex CNAME-flattening (e.g. Cloudflare) and the bare apex points at AWS.
- **Deploy = merge to `main`** (automatic, like Vercel was). A GitHub Actions
  workflow (`.github/workflows/deploy.yml`, keyless via the OIDC role
  `DreamCRMGitHubActionsDeploy`) uploads the source and triggers the CodeBuild
  project `dreamcrm-image-build`, which builds the image, pushes ECR
  `:latest` + `:build-N`, and runs `aws apprunner start-deployment`. Watch it in
  the repo's **Actions** tab (~8 min end to end). Manual fallback (no GitHub):
  ```
  git archive --format=zip HEAD -o /tmp/src.zip
  aws s3 cp /tmp/src.zip s3://dreamcrm-codebuild-952078552817/source/dreamcrm-src.zip
  aws codebuild start-build --project-name dreamcrm-image-build
  ```
  `NEXT_PUBLIC_*` bake at build time (CodeBuild env → Docker build args), so
  changing them needs a rebuild, not just a redeploy.
- **Secrets / config**: Secrets Manager `dreamcrm/app-secrets` (one JSON) →
  injected as App Runner `RuntimeEnvironmentSecrets`. Driver switches + non-
  secret config (`STORAGE_DRIVER`, `EMAIL_DRIVER`, `AI_DRIVER`, `S3_BUCKET`, …)
  are `RuntimeEnvironmentVariables`. Updating a secret needs a redeploy to take
  effect (instances read them at startup).
- **DB migrations** (latest applied: 0025): **auto-applied on deploy.** The
  container runs `scripts/db-migrate.mjs` (drizzle migrate, idempotent) before
  the server boots, so each deploy applies its own pending migrations from
  inside the VPC. A migration failure exits non-zero → the container fails its
  health check → App Runner keeps the previous version serving (the app never
  goes down on a bad migration; the deploy just shows failed). Workflow:
  `pnpm db:generate`, commit, merge to `main` — the deploy applies it. The
  manual route `POST /api/admin/migrate` (`Authorization: Bearer $CRON_SECRET`,
  same idempotent migrate) stays as a fallback for out-of-band applies.
  `/api/admin/seed-platform` (same auth) seeds the platform org on a fresh DB.
- **Monitoring**: CloudWatch alarms (RDS CPU/storage/connections/memory; App
  Runner 5xx/CPU/memory) → SNS topic `dreamcrm-alerts` (email). Logs retain 30d.
- **Webhook secrets**: rotate by editing `dreamcrm/app-secrets` in Secrets
  Manager, repointing the vendor (e.g. the Stripe webhook → App Runner domain),
  then redeploying.

## PR / merge workflow (this session's convention)

- Develop on a `claude/<feature-name>` branch off main.
- Push → open PR via GitHub MCP (`mcp__github__create_pull_request`).
- Auto-merge via `mcp__github__merge_pull_request` with `merge_method: squash`.
- Sync local main: `git checkout main && git fetch origin main && git reset --hard origin/main`.
- Migration PRs are paired: one PR ships the route + migration + code,
  the follow-up PR removes the route after migration is applied.

## AWS resource facts (`us-east-1`, account `952078552817`)
- App Runner service `dreamcrm` (default URL `hq7ygyvjdp.us-east-1.awsapprunner.com`);
  active custom domains `dreamcreatestudio.com`(+www) and `app.dreamcreatestudio.com`
- RDS `dreamcrm-db` (Postgres, `db.t4g.micro`, gp3, encrypted, 7-day backups,
  deletion protection on, storage autoscaling → 100GB, Performance Insights on)
- ECR repo `dreamcrm` (scan-on-push; lifecycle: expire untagged 3d / keep last 10)
- S3 `dreamcrm-uploads-prod` (public-read website assets) + `dreamcrm-codebuild-952078552817` (build source)
- Secrets Manager `dreamcrm/app-secrets`; SNS topic `dreamcrm-alerts`
- VPC `vpc-066acff3800b34067`, connector `dreamcrm-vpc-priv`, NAT gateway, S3 gateway endpoint
- CodeBuild `dreamcrm-image-build`; IAM roles `DreamCRMAppRunnerInstanceRole` /
  `DreamCRMAppRunnerECRAccessRole` / `DreamCRMCodeBuildRole`
- **Vercel** project `prj_HK0PWpVYjcDPZNUUoxIQ5UptBFMS` now hosts *only* the
  bare-domain → www redirect; retire it once the domain moves off Replit

> Note: long-lived AWS keys / Vercel tokens shared via chat must be rotated
> after use. Prefer short-lived (SSO/STS) credentials for prod ops.

## Branches
- `main` — production
- `archive/setup-mosaic-prior-work` — backup of the prior clinic SaaS work
  (kept as reference; ports of clinic-public / patient portal / accept-invite
  pages come from here)
- `claude/setup-mosaic-dashboard-Tgzs0` — same content as `archive/…`;
  redundant. Safe to delete via the GitHub UI when convenient.

## Conventions
- Always merge PRs the assistant opens. Stay on `main`. No long-running
  feature branches.
- Service modules live in `lib/services/`, marked `import 'server-only'`.
  Client-safe enums + types live in `lib/types/` or `lib/modules/types.ts`.
- Server actions live next to the route that uses them: `actions.ts` for
  user-facing CRUD, `admin-actions.ts` for platform-admin-only operations
  (which start with a `requireTenant()` + role check).
- All authenticated layouts go through `<DashboardShell>` — don't render
  `<TenantSidebar>` or `<Header>` directly elsewhere.
- After mutating a session field (e.g. `activeOrganizationId`), navigate
  via `window.location.assign()` instead of `router.push()` so middleware
  + tenant context see the new state on the next request.
- Stripe / DB / better-auth clients are lazy `Proxy` instances so
  `next build` can run without runtime envs.
- **No fake content. Every UI placeholder must read from a real DB column,
  and the Acme demo seeder must populate every column shown anywhere in
  the UI.** "Coming soon" cards with `status: 'soon'` in the module
  registry are the only honest exception — they label themselves as
  not-yet-built. Whenever you add a new field, table, or section, do all
  three in the same PR:
  (1) ship the real DB-backed wiring,
  (2) extend `lib/services/demo-clinic.ts` so the Acme demo seeds that
      field with realistic content (cover empty / common / edge-case
      values so every code path is exercised on the demo),
  (3) extend the self-heal block so existing demos backfill the field
      on the next platform-admin "View as clinic" entry. This keeps the
      demo as the single source of truth that the platform showcases
      every module's full functionality.

## Working in a new session (Claude Code on the web)

- **Dependencies are automatic.** A SessionStart hook
  (`.claude/hooks/session-start.sh`, registered in `.claude/settings.json`) runs
  `pnpm install` and creates the gitignored `next-env.d.ts` on session start, so
  `pnpm dev` / `pnpm test` / `pnpm typecheck` work immediately. (If `tsc` ever
  complains about `@/public/images/*`, that generated file is missing — the hook
  handles it; `pnpm build` also regenerates it.)
- **Deploys are automatic** — merge to `main` ships it (see Deployment above);
  watch the repo's Actions tab.
- **AWS CLI is not preinstalled.** For infra/ops work, install on demand:
  ```
  cd /tmp && curl -sS https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o a.zip \
    && unzip -q a.zip && sudo ./aws/install --update
  ```
- **AWS credentials**: set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
  `AWS_REGION=us-east-1` as environment variables in the Claude Code web
  environment settings so every session is pre-authed (no pasting keys into
  chat). Use a scoped, rotatable key; rotate anything ever shared via chat.

## Useful commands

```bash
pnpm dev                  # local dev (needs .env with the Vercel envs)
pnpm build                # next build
pnpm db:generate          # drizzle-kit generate (after schema changes)
pnpm db:push              # apply schema directly (local dev only)
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest run (full unit + integration suite)
pnpm test:watch           # vitest in watch mode
```

## Test account
- `dustin@dreamcreateweb.com` — platform admin (Dream Create org owner)
- Password set during seed; rotate via Settings → Account → Set New Password
