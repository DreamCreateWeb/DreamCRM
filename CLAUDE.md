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
- **Drizzle ORM** on **Neon Postgres** (US-East, `iad1`)
- **better-auth** with Organizations plugin (multi-tenant)
- **Stripe** for billing (Checkout + Customer Portal + webhooks)
- **Resend** for transactional email (from `Hello@DreamCreateWeb.com`)
- **Vercel Blob** for uploads
- **Vercel** deployment, production URL: **https://dreamcreatestudio.com**
  - Wildcard `*.dreamcreatestudio.com` reserved for clinic public sites
  - Every push to `main` aliases there — refresh, don't open per-deploy URLs

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
| Growth | Analytics | `/analytics` | Soon | Phase 4 placeholder — dental-shaped KPIs (recall conversion, no-show, hygiene reappt, schedule utilization) |
| Website | Website Editor | `/website` | **Live (v1)** | Per DESIGN.md "the website is the trunk" — promoted out of Settings into a real dashboard. Hero with View-live-site CTA + public URL, 4-stat row (template / brand color / plan / setup completion), 12-item Setup checklist (required vs optional, with ✓ Set / ~ Partial / ⚠ Missing pills per item, each linking to /settings/clinic for the deep edit), Public surfaces list (homepage / book / intake forms / sitemap / robots / OG image — each with View link), Locations summary, "Coming next" footer with the v1.1 roadmap. Deep content editing remains at /settings/clinic |
| Website | Blog | `/blog` | Soon | Phase 1 placeholder — Tiptap editor + SEO + AI-assisted drafts |
| Website | SEO | `/seo` | Soon (dashboard) | Base SEO (sitemap / robots / JSON-LD / OG images / canonicals) is **live**; this dashboard surfaces rankings + page health |
| Website | Careers | `/careers` | Soon | Job postings on the clinic's site + applicant tracking (replaces DentalPost / Cloud Dentistry $400/mo boards) |
| Business | Shop | `/shop` | Soon | Phase 3 — full storefront with Stripe Connect, birthday coupons, loyalty. The differentiator move no orbital-layer competitor ships. Existing `/ecommerce/orders` is the interim view |
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

1. **Subdomain DNS** — `*.dreamcreatestudio.com` wildcard at name.com
   isn't set. Apex resolves to Vercel (216.150.1.1) but subdomains
   NXDOMAIN. Required record: `CNAME *  cname.vercel-dns.com.` Vercel
   side already has the wildcard domain configured + verified.
   Path-based URLs (`/site/[slug]/...`) work today as a workaround.
2. **Patients module v2** — v1 shipped this session. v2 candidates:
   per-patient tags + audience targeting; comms preferences granularity
   (per-channel opt-in: SMS/email/marketing); household linkage table
   for pediatric/family clinics; per-view audit log for Premium tier;
   web-analytics events on the timeline once that lands; patient.source
   backfill for legacy rows that predate the new column (currently null).
3. **Real annual Stripe prices** — split the 3 `STRIPE_PRICE_*_ANNUAL`
   envs (they currently point to the same monthly prices).
4. **Patient portal completion** — `/patient/*` exists but bills is
   placeholder; records, messages, intake-fill, refill-request marked
   'soon' in the patient sidebar.
5. **Coming-soon Overview cards become real modules** —
   - Reviews & reputation (post-visit Google/Yelp prompts)
   - SMS replies (Twilio integration, two-way)
6. **Migration 0004 + Gmail push env vars need applying to prod** —
   bootstrap-apply `0004_lowly_microbe.sql` (adds `watch_expires_at`),
   then set Vercel env vars:
   `GMAIL_PUBSUB_TOPIC=projects/dreamcrm-496717/topics/gmail-watch`,
   `GMAIL_PUBSUB_SA_EMAIL=dreamcrm-admin@dreamcrm-496717.iam.gserviceaccount.com`,
   `CRON_SECRET=<random>`. Finally create the Pub/Sub push subscription
   pointing at `https://dreamcreatestudio.com/api/webhooks/gmail` with
   OIDC identity `dreamcrm-admin@dreamcrm-496717.iam.gserviceaccount.com`.
7. **Migration 0021 needs applying to prod** — the Recall & Outreach
   schema ships via `0021_recall_outreach_v1.sql`. PR also ships the
   bootstrap route + middleware allowlist; follow the canonical migration
   workflow (set ADMIN_BOOTSTRAP_TOKEN env, POST to /api/admin/bootstrap,
   delete token, open cleanup PR). After 0021 lands, the migration adds:
   patient marketing opt-in columns (defaults backfill all rows to email-
   opt-in=true / sms-opt-in=false), `recipient_source` + `patient_filter`
   on audiences, `recipient_source` + `template_id` on campaigns,
   `patient_id` + `booked_appointment_id` + `booked_at` + `'booked'` enum
   on `campaign_events`, new `campaign_templates` + `clinic_sms_config`
   tables, and the `'twilio_sms'` channel enum value.
8. **Phase B — Twilio SMS for Recall & Outreach** — schema is already in
   place (migration 0021), so this is wiring only. Needed: lazy Proxy
   Twilio client (`lib/twilio.ts`); send-orchestrator SMS branch (currently
   a no-op with clear error); inbound webhook `/api/webhooks/twilio` for
   replies + STOP/HELP keyword handling; settings UI for the per-org
   Twilio phone number + A2P 10DLC status display; Twilio A2P brand +
   campaign registration (user-side, 5-14 business days for carrier
   approval). Twilio account creds for the user (Dustin) are wired to
   `.env.local` (gitignored) for local dev; production envs
   (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER`)
   need to be set in Vercel before Phase B sends real SMS. SMS channel
   stays disabled in UI until `clinic_sms_config.a2p_status='approved'`.
9. **Custom audience builder UI for clinic tenants** — Phase A clinic
   users see the 4 demo-seeded patient audiences but can\'t yet create
   new custom patient-source ones via UI (the existing audience editor
   only knows pipeline-stage chips). v1.1 candidate: branch the editor
   on `tenantType` to expose patient segment chips (recall status,
   lifecycle, hasBalance, birthdayThisMonth, sources, channel opt-in
   toggles) + a live "X patients in this segment" preview.
10. **Marketing UX polish for clinic tenants** — `/marketing` dashboard
    still shows the SaaS-style funnel (built for platform tenant); for
    clinic users it should show dental-shaped KPIs (recall due / lapsed
    counts / sent-this-month / booked-from-recall) + recent campaigns
    + audiences. Per-patient marketing-opt-in toggle on the patient
    detail page. Marketing events as their own timeline pill.
    Booking-conversion attribution from tracked links (today\'s `booked`
    events are only seeded by the demo).

## Deployment & operations

- **Production**: `main` branch auto-deploys to `https://dreamcreatestudio.com`
- **Region**: `iad1` (matches Neon)
- **Vercel token**: the user (Dustin) has provided a Vercel access token
  in this session's history (rotate-aware — don't echo it back to chat
  in future sessions; check session context for the latest one). Token
  is used for: reading project envs (note: `DATABASE_URL` is "sensitive"
  type and can't be pulled via `vercel env pull`), setting/deleting
  `ADMIN_BOOTSTRAP_TOKEN` for migration runs, polling deployment status.
- **DB migration workflow** (used 3× this session for 0015, 0016, 0017):
  1. Generate migration via `pnpm db:generate --name foo`
  2. Generate a random `ADMIN_BOOTSTRAP_TOKEN` and POST it to
     `https://api.vercel.com/v10/projects/prj_HK0PWpVYjcDPZNUUoxIQ5UptBFMS/env`
     with target `["production"]`, type `encrypted`.
  3. Add `app/api/admin/bootstrap/route.ts` (copy from any prior
     `claude/cleanup-bootstrap-*` PR — the canonical implementation
     ships an idempotent ledger `_dreamcrm_migrations_applied` and
     tolerates `42P07/42701/42710` mid-migration).
  4. Add `/api/admin/bootstrap` to `middleware.ts` `PUBLIC_PATHS`.
  5. Commit + push + auto-merge the PR. Wait for deploy
     (poll `/v6/deployments?...&target=production&limit=1` until
     `readyState=READY`).
  6. `curl -X POST -H "Authorization: Bearer $TOKEN"
     https://dreamcreatestudio.com/api/admin/bootstrap`. Verify response
     shows the new migration's status as `applied`.
  7. DELETE the `ADMIN_BOOTSTRAP_TOKEN` env var via the Vercel API.
  8. Open a follow-up PR (`claude/cleanup-bootstrap-NNNN`) removing
     the bootstrap route + middleware allowlist. Auto-merge.
- **Webhook secret rotation**: same pattern — `/api/admin/bootstrap` with
  `stripe-setup` action returns the new whsec; PATCH the
  `STRIPE_WEBHOOK_SECRET` env var via Vercel API.

## PR / merge workflow (this session's convention)

- Develop on a `claude/<feature-name>` branch off main.
- Push → open PR via GitHub MCP (`mcp__github__create_pull_request`).
- Auto-merge via `mcp__github__merge_pull_request` with `merge_method: squash`.
- Sync local main: `git checkout main && git fetch origin main && git reset --hard origin/main`.
- Migration PRs are paired: one PR ships the route + migration + code,
  the follow-up PR removes the route after migration is applied.

## Vercel project facts
- `accountId: team_JCkmr9YSdUoHDEI9kLvznwCc`
- `projectId: prj_HK0PWpVYjcDPZNUUoxIQ5UptBFMS`
- 32 env vars; **no** `ADMIN_BOOTSTRAP_TOKEN` should be present (rotated out
  after each use)
- Speed Insights + Web Analytics enabled

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
