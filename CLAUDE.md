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
- **Email: Resend (LIVE), sending from the verified domain `dreamcreatestudio.com`.**
  `EMAIL_DRIVER=resend` on App Runner; `EMAIL_FROM` is the platform default
  (`Dream Create <hello@dreamcreatestudio.com>`). **SES is NOT in use** —
  production-access was denied twice and the app fell back to Resend (the SES
  driver code + `lib/ses.ts` remain as a fallback; `EMAIL_DRIVER=ses` would
  re-enable it). **Per-clinic sender identity (Tier 1 + Tier 2) is live** — see
  the "Patient-facing email sender identity" bullet under What's wired. The
  `lib/email.ts` `deliver()` routes Gmail (Tier 2) → Resend/SES; it now CHECKS
  Resend's `{ data, error }` return and throws (the SDK doesn't throw on a bad
  key — a prior silent-failure bug). **Ops note:** the prod `RESEND_API_KEY` in
  Secrets Manager was an invalid/dead key (`re_T8fyc…`); it was swapped to the
  working account's key. **Both that Resend key and the AWS access key were
  shared in chat and still need rotating** (see priority list).
- **Storage: AWS S3** (`STORAGE_DRIVER=s3`, bucket `dreamcrm-uploads-prod`).
  Vercel Blob kept as a fallback driver.
- **AI: Anthropic API (direct)**. A Bedrock driver exists (`AI_DRIVER=bedrock`,
  inert) for a future single-BAA move — blocked on the Bedrock Anthropic
  use-case form + a tokens/day quota bump.
- **SMS: not wired** (future: AWS End User Messaging + A2P 10DLC). Gmail OAuth unchanged.
- **Deployed on AWS App Runner** (`us-east-1`). Canonical URL:
  **https://www.dreamcreatestudio.com**; `app.dreamcreatestudio.com` + the bare
  apex redirect to `www`. Clinic public sites serve live at
  `{slug}.dreamcreatestudio.com` (wildcard DNS + cert wired — see
  "Deployment & operations").

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
                     subdomain rewrite from {slug}.dreamcreatestudio.com.
                     layout.tsx loads Fraunces display serif via a runtime
                     <link> tag (NOT next/font — see Conventions).
  r/[token]/         Patient review-submission landing (text-first per
                     Reviews v2). Outside auth; token IS the auth.
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
- **Patient Portal v2 — clinic-branded, research-grounded, clinic-customizable**
  (migration 0051). The portal moved OUT of the Mosaic admin shell into its own
  route group `app/(portal)/patient/*` (same `/patient/*` URLs) with warm
  clinic-branded chrome: `#FAF7F2` ground + clinic `brandColor` accent + clinic
  logo + Fraunces display headings (runtime `<link>`, same as the public site),
  mobile bottom tab bar (≤4 primary + More sheet) + slim desktop header, footer
  with hours/phone/address. Patients feel they're inside their CLINIC's brand,
  not dental software (the Tend/One Medical research recipe). **Features**
  (research-ranked): state-aware next-visit card (CTAs mutate: Confirm → Add to
  calendar (.ics route w/ 24h alarm) → Directions → Reschedule/Cancel),
  self-serve **reschedule + cancel** with a clinic-set notice window (inside
  the window → "call us" + tel link), confirm sets `confirmedVia='portal'`,
  booking with clinic-restricted visit types + min-notice + a Tend-style
  comfort question (lands in appointment.notes), recall nudge via the shared
  `derivePatientRecallStatus`, pre-visit form task strip, Forms page (pending
  vs done, reuses IntakeFormRunner), Billing (PMS balance w/ honest framing +
  **online balance payments via Stripe Connect direct charge** — new
  `patient_balance_payment` table, idempotent finalize on the return page +
  an `/api/webhooks/stripe-connect` branch on `metadata.kind='balance_payment'`;
  the front desk posts payments to the PMS ledger; membership card w/ benefit
  usage; merged payment/order history), Records (visit history, forms on file,
  insurance w/ "we'll verify" caveat, HIPAA records-rights blurb), Messages
  (warm reskin of the unified thread), Profile (single-column inputs +
  marketing-email opt-in toggle w/ audit timestamps + sign out), **Family
  access** — `patient.guardian_patient_id` self-FK (one-level tree enforced in
  `updatePatient`), guardian sees dependents' visits + books for them
  (`getAccessiblePatientIds` scopes every read/mutation), staff link guardians
  via the patient Edit modal (`listPatientOptions` picker). **Magic-link
  sign-in** (better-auth `magicLink` plugin, `disableSignUp: true`, 15-min
  expiry, "Email me a sign-in link" on /signin) — portals die on passwords;
  dental visits are ~6mo apart. **Customization**
  (`clinic_profile.portal_settings` jsonb → `lib/types/portal.ts`
  `resolvePortalSettings` merges partials over defaults, so new settings never
  need a backfill): Settings → **Patient portal** (`/settings/portal`,
  owner/admin save gate) with per-feature toggles where OFF = the surface
  disappears entirely (no dead links — beats RevenueWell's documented
  dead-link toggle), bookable-type pills (procedure visits excluded by default
  — the wrong-type schedule-buster fix), booking/reschedule notice-hour
  inputs, welcome headline (`{firstName}` token) + welcome message +
  dismissible announcement bar + after-visit care note (shows ~7d post-visit),
  team-photos toggle, and **"Preview as a patient"**
  (`/settings/portal/preview` in its own `(preview)` route group — watermarked
  static replica w/ a sample patient + the clinic's real saved settings; no
  competitor ships this). Payments toggle defaults OFF + requires an active
  Connect account. Nav derives from settings via `buildPortalNav`. The portal
  layout also fixed a latent redirect loop (a patient member with no linked
  patient row now gets a help screen instead of `/` ↔ `/patient/dashboard`
  ping-pong). Demo: `DEMO_PORTAL_SETTINGS` (announcement + welcome + aftercare
  copy) + **Lily Lopez** (Emma's 9-year-old dependent with an upcoming
  cleaning + booked-by-mom note) seeded fresh + self-heal. Services:
  `lib/services/portal-settings.ts`, `lib/services/balance-payments.ts`, the
  portal-v2 block in `lib/services/patient-portal.ts`; components in
  `components/patient-portal/`; patient-side actions in
  `app/(portal)/patient/actions.ts`.
- **Patient-facing email sender identity (Tier 1 + Tier 2)** — clinic→patient
  email comes FROM the clinic, not "Dream Create". `lib/email-identity.ts` (pure:
  `ClinicSender`, `clinicSenderFrom`, `formatFromHeader`, `deliverableReplyTo`) +
  `lib/services/clinic-sender.ts` (`getClinicSenderIdentity(orgId)` +
  `listClinicGmailAccounts`). **Tier 1 (default, zero-config):** `"Acme Dental"
  <{slug}@dreamcreatestudio.com>` (display name = clinic, address on the verified
  platform domain → no per-clinic DNS), Reply-To = the clinic's contact email
  (skipped when non-deliverable, e.g. the demo's `*.example`). Name precedence:
  `clinic_profile.email_sender_name` → display name → org name → default.
  **Tier 2 (one-click upgrade):** clinic connects Google (the existing
  `/api/oauth/gmail/start` Inbox OAuth) and picks it in `/settings/clinic` →
  patient email sends AS their real address via the Gmail API
  (`clinic_profile.email_sending_account_id`, migration 0049); `deliver()` routes
  Gmail and FALLS BACK to Tier 1 on any Gmail failure. Threaded through every
  patient-facing send: intake, booking confirmation, patient message, portal
  invite, review request, appointment reminder/reschedule. Editable field:
  Settings → Clinic Profile → "Email sender name" + "Send patient email from".
  Migrations 0048 (`email_sender_name`) + 0049 (`email_sending_account_id`).
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
  Tend-inspired composition (see `components/clinic-site/modern-
  template.tsx`). Warm off-white palette (`#FAF7F2` bg, `#1C1A17` ink,
  `#FFFFFF` surface, `#E8E2D9` border), clinic brand color drives all
  CTAs + accent treatments. **Typography: Fraunces serif display
  headings** in brand color (H1 + every section H2) loaded by
  `app/site/[slug]/layout.tsx` via runtime `<link>` tag (NOT
  `next/font/google` — build env doesn't reliably reach Google Fonts,
  see "Build vs test" gotcha below); Inter for body.
  **Composition top-down**:
  (1) brand-colored announcement strip with rotating-style chips
      (tagline · "No judgment, ever" · "Same-week visits");
  (2) floating white pill-shaped sticky nav (rounded-full container
      with backdrop blur, NOT edge-to-edge — warm page color shows at
      viewport edges);
  (3) centered hero: 12-col grid 3/6/3 with display-serif H1 in brand
      color, organic blob photos flanking on desktop (asymmetric
      border-radius, no SVG mask — left blob = heroImageUrl, right blob
      = officePhotos[0]), Book + phone pill CTAs side-by-side;
  (4) pill-shape service carousel right under the hero (horizontal
      scroll on mobile, wrap on desktop, each links to #services);
  (5) stats trust card (soft white card with vertical dividers between
      stat items, brand-color 40-48px numerals);
  (6) services as soft cream tiles with hover lift (still 01/02/03
      numbered — our signature vs Tend's icons);
  (7) team grid (4:5 portraits, gradient initial chip fallback that
      strips honorifics + post-nominals — `Dr. Jane Lee → JL`,
      `Maria Vega, RDH → MV`);
  (8) testimonials → **static 3-card grid (≤3 featured)** OR
      **continuous looping marquee (>3 featured)** with seamless loop,
      pause-on-hover, prefers-reduced-motion fallback;
  (9) about, office-tour gallery (captions always render, alt fallback),
      hours+location (`id="hours"` anchor);
  (10) booking CTA section, then 4-column footer (Brand · Explore ·
       Patients · Today) with live "Open today · 9 AM – 5 PM" / "Closed
       today" blurb; bottom bar carries © · Staff login · DreamCreate
       attribution.
  Plus a floating phone-circle CTA pinned bottom-right (desktop) and
  the existing sticky Book+Call bar (mobile). "Book a Visit" copy is
  universal across tiers; basic tier routes Book to `#contact`.
  Editable via `/settings/clinic` (services, staff, stats, testimonials,
  office photos, hours, brand, logo/hero uploads, accepted insurance
  carriers).
  **(11) Location section** — between testimonials and the clinical-team
  trust grid: "Come meet us at {addressLine1}" with a keyless Google Maps
  iframe (`https://www.google.com/maps?q=...&output=embed`, no API key
  required) and a "Get directions" CTA deep-linking into
  `google.com/maps/dir/?api=1&destination=...` (opens in a new tab).
  Address citation prefers `primaryLocation.addressLine1` over the
  profile-level field — same precedence as the Hours+Location card and
  the JSON-LD builder. Hides cleanly when the clinic has no address at
  all. **(12) Insurance section** — forest-teal `#36514c` full-width band
  (same hue as the footer + testimonial cards) right after Location. Left
  column: "Our insurance carriers" checklist sourced from the new
  `clinic_profile.accepted_insurance_carriers` jsonb column (migration
  0038, `string[]`); falls back to "call to verify" copy when the column
  is empty. Right column: "Check your insurance" verifier form (email +
  phone + optional carrier dropdown) — on submit, creates a `lead` row
  scoped to the org with `sourcePage: 'insurance_verifier'` so the
  request lands in the existing /leads triage queue with the same aging
  + status treatment as contact-form leads. **NOT** an actual eligibility
  check (no payer-API hookup); the success message tells the patient
  we'll be in touch within one business day so expectations stay honest.
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
  pinned bottom with channel picker auto-defaulting to the patient's
  historical preferred channel (≥3 inbound with ≥70% share → shows a
  "{Patient} prefers {channel}" label next to the picker), falling back
  to the most recent inbound channel otherwise, then in-app +
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
- **Website Studio — full in-place "navigate-the-canvas" editor** (PRs
  #199–#212). Per DESIGN.md "the website is the trunk", `/website` opens
  the clinic's REAL public site full-screen in an editable canvas (no CRM
  chrome) — they edit by hovering and clicking the site itself, live.
  Evolved from the original three-pane editor (#199 + #200) into a true
  WYSIWYG surface: #202 full-screen foundation + inline tagline → #203
  demo-mode gate fix → #204 section modals + image replace + hover "Edit"
  → #205 hero-image/intro-video fixes → #207 navigate-the-canvas → #208–#212
  per-page instrumentation. **How it works**: the authed shell
  (`app/(default)/website/website-studio.tsx`) hosts an `<iframe>` of
  `/site/[slug]?edit=1`; the public site mounts an **EditBridge**
  (`components/clinic-site/edit-bridge.tsx`) — gated owner/admin + `?edit=1`
  by `EditBridgeGate` in the shared `app/site/[slug]/layout.tsx` (auth via
  `lib/clinic-site-edit.ts::canEditClinic`, demo-mode aware) — that turns
  every `data-edit-*`-tagged region into an affordance and `postMessage`s
  intents to the shell. **Inline text** (tagline, clinic name) edits in
  place (contentEditable → `saveInlineField`); **images** click-to-replace
  ("📷 Replace photo"); **sections** hover → "✎ Edit {label}" → a modal
  reusing the existing editor + its **scoped** `website-actions.ts` save →
  canvas reloads the CURRENT page. **Navigate-the-canvas**: internal
  `/site/…` links navigate with `?edit=1` preserved, so editing spans
  Home → About → Services → … without leaving the canvas (hash links
  scroll; external/tel/mailto suppressed; nav dropdowns still work).
  **Coverage**: Home (tagline · clinic name · hero image · intro video
  upload-or-URL · trust stats · testimonials · services via the embedded
  library picker), About (about · team · office photos), FAQ, Insurance
  (carriers), Payment & Financing (methods · financing · cancellation),
  and footer **Office Hours** on every page. Editors: `faq-editor.tsx` +
  new `hours-editor.tsx` in `app/(default)/website/` + reused
  `settings/clinic/*-editor.tsx`; shared parsers in
  `lib/clinic-content-parse.ts`. A **stale-tab fallback** renders "refresh
  to edit" when a `/website` tab predates a deploy that added new section
  types (the shell JS lags the freshly-server-rendered iframe). Ownership
  framing throughout — the anti-lock-in wedge from the dental-website
  research (Officite ToS: site *"owned by us"*; ProSites *"cone of
  silence"*). `/settings/clinic` remains a deep-edit fallback. **Loose
  end:** the Phase-2 per-section "✨ Rewrite with AI" buttons lived on the
  old three-pane panels and are NOT yet re-wired into the Studio modals —
  the infra (`ai-website.ts`, allowance, `ai_usage_counter`) is intact;
  the buttons just need re-adding per copy-heavy modal.
- **Website Editor — AI copy assist + tier-baked allowance** (PR #200) —
  per-section **"✨ Rewrite with AI"** on the four copy-heavy sections
  (Hero tagline · About · Stats · FAQ; Services already had their own AI
  via `service-library-ai.ts`). `lib/services/ai-website.ts` orchestrates
  one `runClaudeJson` structured-output call per section, reusing the
  exported `CORE_VOICE_RULES` (anti-shame, **no fabricated numbers /
  prices** — stats are qualitative only, cost answers are estimate-first).
  The generated copy is RETURNED to the editor to fill the fields for
  review — **never auto-saved** (the clinic reviews, tweaks, clicks the
  normal Save). **Monetization decision (research-grounded, see below):
  a tier-baked monthly allowance, NOT a credit currency.** Manual editing
  and the (future) onboarding draft are always free and never count; only
  an on-demand rewrite does. `AI_REWRITE_ALLOWANCE` (lib/types/ai-website.ts)
  = Basic 15 / Pro 50 / Premium 200 per month, plain-language ("✨ N AI
  rewrites left"), **fails safe** — when spent, the buttons gate gracefully
  ("edit freely; they reset on the 1st") and it NEVER auto-charges. The
  meter is a per-org/per-month `ai_usage_counter` table (migration 0042,
  atomic `INSERT … ON CONFLICT DO UPDATE count+1`). Cost reality: a rewrite
  is pennies of Sonnet tokens vs a $99–199/mo sub, so the allowance is an
  abuse guardrail + upgrade lever, not cost-recovery — deliberately
  generous so the "pay to edit my own content" resentment never triggers.
  `/settings/clinic` stays as a deep-edit fallback (retire in a follow-up).
  **Built for the original three-pane editor (#200); the in-place Website
  Studio that replaced it has NOT yet re-wired these per-section "Rewrite
  with AI" buttons into its modals — infra intact, buttons pending** (see
  the Website Studio bullet's loose end). The same `ai-website.ts` is the
  generation engine reused by the conversational AI onboarding interview
  (Phase 3 — see "What's NOT yet wired").
- **Reviews & Reputation v2** — Post-visit review collection where the
  **patient writes the review inside DreamCRM**, the text persists,
  staff just toggles featured/unfeatured on the public site. Patient
  email/SMS link → `/r/<token>` → form with optional 1-5 stars + 2000-
  char textarea → submit captures the review. After submit, optional
  CTAs surface ("Also share on Google / Healthgrades / Facebook / Yelp")
  so the SEO play stays — but DreamCRM now owns the text.
  Schema (migration 0023 + 0035): `clinic_review_config` (per-org
  platform IDs, 365-day default rate limit, NPS toggle off, auto-trigger
  toggle off) + `review_request` (status funnel `pending → sent →
  clicked → completed | skipped | failed`, signed opaque token, optional
  rating, **`review_text` column added by 0035** carrying the patient's
  actual words). Service (`lib/services/reviews.ts`):
  `createAndSendReviewRequest` validates rate-limit + config + opt-in
  and emails via Resend; `submitReviewText({token, text, rating})` is
  the PRIMARY completion path (text-first); `recordReviewCompleted` is
  the secondary platform-tap path; `featureReviewAsTestimonial({orgId,
  patientId})` sources the quote from `review_request.reviewText` (staff
  can't put words in the patient's mouth — throws "has not submitted a
  review" when no text exists); `unfeatureReviewTestimonial` removes
  the linked entry; `listFeaturedTestimonialPatientIds` + `listReviews
  Received` drive the dashboards.
  UI: `/reviews` morning-huddle dashboard (Sent · Opened · Reviewed ·
  Ready-to-ask KPIs + platform-mix breakdown + Ready-to-ask one-click
  send list + recent activity table with ✓ Featured pills + "Browse
  received reviews →" CTA when there are completions + inline config
  panel). `/reviews/received` (new) — read-only review cards with the
  patient's actual quote in an italic blockquote, star rating, one-
  click "Feature on website →" / "Remove from website" toggle. Staff
  CANNOT edit the patient's words. Reviews where the patient went
  straight to a third-party platform without leaving a copy here get a
  calm "no text to feature" message and no Feature button.
  `clinic_profile.testimonials` JSON gains optional `patientId` link so
  featured testimonials know which CRM patient they're tied to;
  privacy-first display label denormalized at feature time (`"First L."`
  + city). Public clinic site testimonials section flips between static
  3-card grid (≤3 featured) and a looping marquee (>3 — see Public
  site composition below).
  Research-grounded: Google primary (~80% of dental review value),
  Healthgrades > Facebook for healthcare reputation, **Yelp opt-in
  only** (Yelp filters solicited reviews → prompts hurt more than help;
  Birdeye/Weave/Swell all exclude). **No NPS gating** — same prompt to
  every recipient, FTC-clean per the 2024 Fake Reviews Rule ($53k per
  violation; Podium is the cautionary tale). 365-day rate limit
  matches NiceJob lockout dialed conservative for dental visit cadence.
  Auto-trigger 24h after `appointment.status='completed'` is v1.1
  scaffolded (handler exists, needs EventBridge schedule rule). Demo
  seeder pump: 7 completed reviews (Mia / Liam / Charlotte / Emma /
  Noah / Mason / Ava) with full text in `review_text` (`DEMO_REVIEW_
  TEXTS` map is the single source of truth) + 5 pre-promoted as
  testimonials (`DEMO_FEATURED_PATIENT_IDXS = [0, 2, 6, 7, 11]`); the
  other 2 stay unfeatured as live CTA targets on `/reviews/received`.
  Self-heal block backfills `review_text` on legacy demos seeded before
  migration 0035 + relinks testimonials to real patients.
- **PMS Integrations v1 (Open Dental, two-way)** — the orbital layer
  wrapping the clinic's existing PMS. Schema (migration 0033):
  `pms_connection` (per-org: provider, status, AES-encrypted Customer
  Key, sync direction, auto-sync, last-sync audit) + `pms_entity_map`
  (durable 1:1 PMS↔DreamCRM link by externalId, origin pms/dreamcrm,
  content hash for skip-on-unchanged) + `pms_sync_run` (inbound audit
  header w/ per-entity counts) + `pms_write_op` (outbound audit + retry
  queue — the "every record we created in your PMS, via the API" log) +
  `patient.pms_balance_cents`/`pms_balance_updated_at`. Provider
  abstraction in `lib/services/pms/`: a `PmsProviderClient` interface
  (read + write), `open-dental.ts` real adapter (REST, auth header
  `ODFHIR {DeveloperKey}/{CustomerKey}` — Developer Key is a platform
  env secret `PMS_OPEN_DENTAL_DEVELOPER_KEY`, per-office Customer Key
  pasted by the clinic + stored encrypted), `demo.ts` DB-backed sandbox,
  `sync.ts` engine (pull→reconcile via entity-map w/ email/phone dedupe→
  upsert + write a sync_run; queue/flush/retry write-backs). **Two-way**:
  imports patients/appointments/providers/balances; pushes
  DreamCRM-originated bookings (widget / portal / front-desk /
  reschedule) into Open Dental — `queueAppointmentWriteBack` enqueues a
  `pms_write_op` on booking (best-effort, never blocks the booking),
  flushed via the API on the next sync. Source of truth = PMS for edits;
  DreamCRM pushes only the records it originates (sidesteps bidirectional
  merge for v1). **Positioning is sanctioned + audit-clean**: official
  API only, every write lands in the clinic's Open Dental Audit Trail —
  the explicit opposite of the direct-DB scrapers Open Dental publicly
  warns its customers against (NexHealth by name). UI at `/integrations`
  (morning-huddle): trust banner, status hero + Sync-now/direction/
  auto-sync/disconnect controls, KPIs, transparent fixed field map,
  what-we-sync / never-touch scope card, inbound sync log + outbound
  write-back log; unconnected state shows the Open Dental connect form
  ($30/mo office API fee surfaced honestly) + an honest catalog of the
  others (Dentrix Ascend = request-access pending HSOne approval;
  Dentrix desktop / Eaglesoft / Curve = roadmap, need a signed local
  agent per office). Client-safe catalog/labels/field-map in
  `lib/types/pms.ts`. **Validated against Open Dental's hosted developer
  sandbox** (shared test DB at `api.opendental.com` — no office install,
  no $30/mo fee): read shapes, `DateTStamp` delta + `Offset/Limit`
  pagination, and writes (createPatient; createAppointment **requires an
  `Op`/operatory**). Still unit-tested with a mocked `fetch`; the demo
  provider exercises the engine end-to-end. **Phase 0 hardening shipped
  (sandbox-driven):** `DateTStamp` high-water delta for appointments +
  paginated `/patients/Simple` (which carries `EstBalance`, unlike the
  plain `/patients` list) for bulk balance import; appointment write-back
  now sends a clinic-default operatory (auto-picked from `/operatories`,
  prefer web-sched, stored in `pms_connection.meta`); office-local
  wall-clock datetimes converted against the clinic's IANA timezone
  (`lib/services/pms/datetime.ts`, dependency-free `Intl`); provider role
  defaults to `dentist` (OD `Specialty` is an office-specific numeric
  DefNum, not a portable label). Open Dental also supports sanctioned
  webhook **Subscriptions** (`POST /subscriptions`) for near-real-time —
  a Phase 2 add-on that needs an office-side service; v1 is `DateTStamp`
  polling (zero office install). **Phase 1 status (as of 2026-05-28):
  4 of 5 items shipped; #5 (schedule-driven availability) is blocked on
  OD vendor portal access — see the "OD vendor portal approval"
  priority item below for the full unblocking workflow.** (1)
  **cancellation/reschedule write-back** — cancel/no-show/reschedule on
  our side now PUTs `AptStatus=Broken` to OD (verified vs sandbox) so the
  old slot stops reminding (the #1 clinic complaint from the research);
  new `pms_write_op.operation='update'` + `status='skipped'` (supersedes
  a still-pending create on book-then-cancel-before-sync); triggers wired
  into `cancelAppointment`, `markNoShow`, `rescheduleAppointment(original)`.
  (2) **Recall sync** — migration 0034 added `patient.pms_recall_due_at`
  + `pms_recall_interval`; the OD adapter `listRecalls` pulls `/recalls`
  paginated (no `DateTStamp` support there) and reconciles the soonest
  active due date per patient; a shared
  `lib/services/recall-status.ts::derivePatientRecallStatus` helper now
  drives the recall pill on the patients list AND the recall audience in
  Recall & Outreach — **preferring the PMS due date when present**,
  falling back to the appointment-derived heuristic otherwise.
  (3) **Sync-health alerts** — addresses the #1 reliability complaint in
  the research (syncs silently stop). New `lib/services/pms/health.ts`
  computes an `IntegrationsHealth` snapshot per org from
  `pms_connection.{lastSyncAt,lastSyncStatus,lastError}` + the last 5
  `pms_sync_run` rows; surfaces `ok | never_synced | stale | partial |
  errored | repeated_failure` with `info | warn | error` severity. A
  proactive warn/error attention banner now renders on the **Overview**
  (just above the existing attention-cards row) and on the
  **Integrations page** (above the status card), with severity-colored
  styling and an "Open Integrations" CTA on Overview. Thresholds:
  staleness fires after 36h with no successful sync (auto-sync-only —
  manual-only clinics are silent), repeated-failure fires at 3+
  consecutive non-success runs. No new schema — read-only over what we
  already capture. Deterministic pure helper `deriveIntegrationsHealth`
  is unit-tested across every branch.
  (4) **CommLog mirroring** — the top "I wish it did this" from the
  integrations research. Every DreamCRM-originated patient message
  (booking confirmation / appointment reminder / reschedule notice /
  review request / intake form send) is now mirrored as a CommLog entry
  in Open Dental's chart via `POST /commlogs` (verified vs sandbox: 201
  with `Note / Mode_ / SentOrReceived / CommDateTime / PatNum`), so the
  front desk sees the full comms history without leaving OD. Mirrors
  ride the same `pms_write_op` queue + flush as appointment write-backs:
  `queueCommLogWriteBack` enqueues on the send path (best-effort, never
  blocks the send), and `retryPendingWrites` dispatches via
  `processCommLogWriteOp`. Skips silently if patient isn't mapped (front-
  desk-added patients with no PMS link) or the connection isn't two-way.
  Wired into 5 send sites: `reviews.ts::createAndSendReviewRequest`,
  `appointments/actions.ts` (reminder + reschedule notification),
  `site/[slug]/actions.ts` (public booking confirmation),
  `patient-intake-send.ts`. Marketing campaign sends + Patient
  Communications in-app replies are intentionally skipped in v1
  (campaigns would flood OD's chart; in-app reply has no email/SMS hop
  to log). Client-safe `WRITE_OP_ENTITY_LABELS` adds the "Comm log"
  label so the Integrations write-back log renders the new rows
  alongside appointment writes. Demo seeder pump: 3 commlog write-op
  rows (2 success, 1 pending) so the write-back log demos every state.
  No new schema — `pms_write_op.entityType` is `text` and already
  accepts the new value.
  (5) **Schedule-driven availability — BLOCKED on OD vendor approval.**
  The booking slot picker (`lib/services/booking.ts`) currently
  subtracts existing `appointment` rows from clinic hours but doesn't
  respect provider out-of-office blocks, lunch breaks, time-off, or
  operatory-level limits. Fix is reading OD's `/schedules` resource
  (provider blocks + clinic schedule entries) and intersecting it with
  the slot generator. Same Phase-0 discipline as the rest of the
  integration (validate every endpoint shape against a live office
  before shipping) means we can't merge until we have a Customer Key
  against a real office — OD's shared sandbox doesn't carry per-office
  provider schedules to validate against. Unblocks the moment vendor
  approval lands; no DreamCRM code is written against `/schedules`
  until then. See the "OD vendor portal approval" priority item for
  the workflow.
  Demo seeder pump: a sandbox "Open Dental
  (Sandbox)" connection +
  entity maps over the 15 patients / 17 appointments / 2 providers + 3
  sync runs + a write-back log covering every state (2 pushed-success /
  1 errored-will-retry / 1 pending-next-sync) + PMS balances on a few
  patients; self-heal seeds it on legacy demos (and re-activates the
  sandbox if a platform admin disconnected it mid-session).

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
| Growth | Reviews | `/reviews` + `/reviews/received` | **Live (v2)** | Post-visit review collection — **patient writes the review text inside DreamCRM** (`review_request.review_text`, migration 0035), staff just toggles featured/unfeatured on the public site. Morning-huddle dashboard: 4-stat funnel (Sent · Opened · Reviewed · Ready-to-ask) + platform mix breakdown + Ready-to-ask list + recent activity with ✓ Featured pills + Browse received CTA + inline config. `/reviews/received` shows the patient's actual quote in a read-only italic blockquote + star rating + one-click Feature/Unfeature (staff CANNOT edit). Public landing at `/r/<token>` is text-first: rating + textarea + Submit, then "Also share on Google/Healthgrades/Facebook/Yelp?" as a secondary action (SEO play preserved). `featureReviewAsTestimonial({orgId, patientId})` sources quote from `review_request.reviewText` — throws "has not submitted a review" when null. `clinic_profile.testimonials` gains `patientId` link; display label denormalized to "First L." + city. Featured testimonials surface on the public site (static 3-card grid ≤3, looping marquee >3). FTC-clean (2024 Fake Reviews Rule), no NPS gating, 365-day rate limit. Auto-trigger on appointment completion = v1.1 scaffolded (handler exists, needs EventBridge rule). |
| Growth | Analytics | `/analytics` | **Live (v1)** | Premium-tier. The honest CRM-vs-PMS split: read-only aggregation (no new schema) over data other modules already capture. 5 bands — Acquisition (new patients via firstSeenAt + source mix + a real GSC-clicks→leads→contacted→converted website funnel), Schedule health (volume trend + no-show/cancellation/confirmation rates vs an industry benchmark, with a low-volume guard that shows counts instead of a misleading % on small samples), Recall & outreach (recall-due reuses listPatients + sent→opened→clicked→booked), Reputation (review funnel + platform mix, reuses getReviewStats), and an honest "Lives in your PMS" deferral block (production $, procedure mix, hygiene reappt %, AR aging) that arrives with Integrations rather than being faked. 30/90-day toggle. Aggregates existing demo data — no seeder change |
| Website | Website Studio | `/website` | **Live (v3 — in-place)** | Full-screen **in-place "navigate-the-canvas" editor** (PRs #199→#212): `/website` hosts an `<iframe>` of the clinic's REAL site (`/site/[slug]?edit=1`); the public site mounts an **EditBridge** (gated owner/admin + `?edit=1` via `EditBridgeGate` in the shared `/site/[slug]/layout.tsx`) so every `data-edit-*` region is hover-to-edit. Inline text (tagline, name) edits in place; images click-to-replace ("📷 Replace"); sections hover → "✎ Edit" → modal reusing the existing editor + **scoped** `website-actions.ts` save → canvas reloads the current page. **Navigate-the-canvas** keeps `?edit=1` across internal links. Coverage: Home (tagline · name · hero image · intro video upload/URL · stats · testimonials · services picker) · About (about · team · office photos) · FAQ · Insurance · Payment & Financing · footer Office Hours (every page). Editors in `app/(default)/website/` (faq/hours) + reused `settings/clinic/*-editor.tsx`. Stale-tab "refresh to edit" fallback. **Loose end:** the Phase-2 per-section "✨ Rewrite with AI" buttons (tier allowance Basic 15 / Pro 50 / Premium 200, `ai_usage_counter` 0042, `ai-website.ts`) were on the old three-pane panels and aren't yet re-wired into the Studio modals (infra intact). `/settings/clinic` is the deep-edit fallback. Next: conversational AI onboarding interview (Phase 3) |
| Website | Blog | `/blog` | Soon | Phase 1 placeholder — Tiptap editor + SEO + AI-assisted drafts |
| Website | SEO | `/seo` | **Live (v1)** | Base SEO (sitemap / robots / JSON-LD / OG images / canonicals) is live. Dashboard surfaces site-health checks, an organic→leads→bookings funnel, real Search Console clicks + top queries, and reviews as a ranking signal. **Search Console is a single shared platform connection, zero-config for clinics**: the platform admin connects ONCE with the `sc-domain:dreamcreatestudio.com` Domain property (covers apex + www + every clinic subdomain); each clinic's SEO tab reads that connection scoped to its own pages via a `page contains '/site/<slug>'` (or `<slug>.` in subdomain mode) filter — clinics connect nothing. OAuth routes a platform-admin's connect to the platform org even from demo mode (`getPlatformOrgId`); `getClinicSeoPerformance` does the scoped read (also feeds the Analytics website funnel). Platform context (`tenantType==='platform'`) shows the manage view (connect / pick property / whole-domain perf); clinic/demo shows the scoped read. Custom-domain clinics aren't covered by the shared property (future: their own connection). Rank tracking + page-speed + GBP still roadmap |
| Website | Careers | `/careers` | **Live (v1)** | Premium-tier. Job postings on the clinic's own site + a built-in ATS — replaces the $400/mo DentalPost board. **The "Indeed integration" is structured-data, not a partner API**: each open role renders at `{slug}.../careers/[jobSlug]` with `JobPosting` JSON-LD so **Google for Jobs + Indeed index it for free** (Indeed's Job Sync API is ATS-partner-only; the direct-employer path is the `/site/[slug]/jobs.xml` feed we also generate). Schema (migration 0031): `job_posting` (role/employment/comp/status/apply-method) + `job_application`. Admin `/careers`: Roles tab (create/edit via `/careers/new` + `/careers/[id]`, publish/close/delete) + Applicants tab (triage pipeline new→reviewing→interview→offer→hired/passed, aging-color rot border on un-reviewed, drawer with résumé download + rating + notes). Public apply form uploads résumé to S3 via a public server action (auth-gated upload route can't serve unauthenticated applicants). Client-safe types/labels/JSON-LD in `lib/types/careers.ts`; DB functions in `lib/services/careers.ts`. Demo seeder: 2 open roles + 1 draft + 7 applicants across every pipeline state (aging spread). Scope = permanent/part-time hires for one practice, NOT a temp/gig marketplace (Cloud Dentistry's lane). Full one-click *Indeed Apply* is a future partner track |
| Business | Shop | `/shop` | **Live (v1 — complete)** | Premium-tier. Phase 3 differentiator (no orbital-layer competitor ships a storefront — confirmed Weave/NexHealth/RevenueWell have none). Built in slices: **(1 shipped)** migration 0032 = 8 purpose-built `shop_*`/`membership*` tables (separate from the generic Mosaic products/orders), Connect *Standard* designed so payouts land in the clinic's own bank. **(2 shipped)** `/shop` admin: product/variant catalog CRUD (`/shop/products/new` + `/shop/products/[id]`, image upload to S3, multi-variant pricing + inventory, FSA-with-Rx flag, draft/active/archived), fulfillment + tax config toggles, Stripe Connect status card. **(3a shipped)** Stripe Connect *Standard* OAuth onboarding — per-clinic (each clinic connects its OWN account so payouts hit their bank; `lib/services/shop-connect.ts` + `/api/connect/shop/start`+`/callback`, mirrors the GSC code-exchange), status auto-refresh on `/shop` load (pending→active), disconnect/deauthorize. `STRIPE_CONNECT_CLIENT_ID` is set in `dreamcrm/app-secrets` + mapped on App Runner; Connect config = Standard accounts · hosted onboarding · Stripe Dashboard. Client-safe types/labels in `lib/types/shop.ts`; DB in `lib/services/shop.ts`. **(3b shipped)** public storefront `/site/[slug]/shop` (+ `[productSlug]` detail, localStorage cart namespaced per slug, `/cart` review+checkout) → Stripe Connect **direct-charge** Checkout Session on the clinic's account (`lib/services/shop-checkout.ts`; pickup or ship + flat-rate shipping + Stripe Tax on ship only; optional platform application fee via `platformFeeBps`), idempotent order finalize via the `/shop/success` page **and** a `/api/webhooks/stripe-connect` backstop (needs `STRIPE_CONNECT_WEBHOOK_SECRET` + a Connect webhook endpoint for `checkout.session.completed`) — inventory decrement + patient linkage by email/phone on payment. Orders admin at `/shop/orders` (fulfillment pipeline unfulfilled→ready/shipped→picked-up/delivered + tracking). `storefrontEnabled` gates the public pages. Demo seeder: 6 products (7 variants) + config + 3 orders (paid pickup / paid shipped+tracking / pending). **(5 shipped)** membership plans — `lib/services/membership.ts` + `lib/types/membership.ts`: plan CRUD at `/shop/memberships` (+ `/new`+`/[id]` builder: name/interval/price/benefits/discount), **lazy Stripe price sync** (product+recurring price created on the connected account on first join, so no Stripe call until an account exists), public `/site/[slug]/membership` (plan cards + join) → **subscription** Checkout Session on the clinic's connected account, members tab with benefit-redemption tracking (`benefitsUsed`), subscription lifecycle (`customer.subscription.updated/deleted`) handled by the same `/api/webhooks/stripe-connect` (branches on `session.mode`). `membershipEnabled` gates the public page. Dashboard shows active-member count + MRR. Demo seeder: 2 plans (Smile Club annual $399 + monthly $39) + 3 members (active/active/past-due). `membership.patientId` is required, so a join matches/creates a patient (`source='membership'`). Self-heal seeds plans (+ members for existing patients) on legacy demos. **(4 shipped)** coupons — `lib/services/coupons.ts`: manual promo codes (% or $ off, optional min-subtotal / expiry / single-use) + one-click **birthday codes** (single-use, auto-generated off `patient.dateOfBirth` month, idempotent per month). Admin `/shop/coupons` (create + list + deactivate + generate-birthday). Applied at checkout via a one-time Stripe coupon on the connected account (`discounts:[{coupon}]`, exact computed cents so %/$ behave the same); cart has a promo field with live validate; single-use burns on order finalize. Demo seeder: WELCOME10 + SUMMER25 + a birthday code. **Shop module is feature-complete for v1** (catalog · Connect · storefront+checkout · orders · memberships · coupons). **Research-grounded:** FSA/HSA is mostly a myth (cosmetic whitening + plain brushes ineligible; electric brushes only with an Rx) so it's an optional per-product flag, not a headline. **Stripe Connect can't be fully sandbox-tested** (no connected accounts/cards) — logic is unit-tested; money flow verified in Stripe test mode. Connect onboarding uses **OAuth** (`/oauth/authorize`, `scope=read_write`) and works — verified the live authorize link resolves. **Resolved bug (2026-05-27):** "Connect Stripe" briefly returned *"No application matches the supplied client identifier"* because the stored `STRIPE_CONNECT_CLIENT_ID` had a 1-char transcription typo (`ca_UavHzM`**`S`**`I2…` instead of the correct `ca_UavHzM`**`5`**`I2…` — an `S`/`5` misread); corrected in `dreamcrm/app-secrets` + redeployed. OAuth flow, redirect URI, and code are all correct — **no code change needed** |
| Business | Integrations | `/integrations` | **Live (v1)** | Premium-tier. PMS bridge — **Open Dental wired, two-way**, through its official REST API (`ODFHIR {dev}/{customer}` auth; platform Developer Key in env `PMS_OPEN_DENTAL_DEVELOPER_KEY` (currently OD's *public sandbox* Developer Key while real vendor approval is in flight — application sent 2026-05-28), per-clinic Customer Key AES-encrypted). Imports patients/appointments/providers/balances; pushes DreamCRM-originated bookings back via the API (best-effort `pms_write_op` queue on booking → flushed on sync). **Sanctioned + audit-clean positioning** — official API only, every write in the clinic's Audit Trail (the opposite of the DB-scrapers Open Dental warns against, incl. NexHealth by name). Morning-huddle UI: trust banner · status + Sync-now/direction/auto-sync/disconnect · KPIs · transparent fixed field map · what-we-sync/never-touch scope card · inbound sync log + outbound write-back log; unconnected = OD connect form + honest catalog (Dentrix Ascend request-access, Dentrix desktop/Eaglesoft/Curve roadmap — need a signed local agent per office). Migrations 0033 (`pms_connection`/`pms_entity_map`/`pms_sync_run`/`pms_write_op` + `patient.pms_balance_cents`) + 0034 (`patient.pms_recall_due_at`/`pms_recall_interval`). Service in `lib/services/pms/`, client-safe types in `lib/types/pms.ts`. Validated against OD's hosted developer sandbox; also unit-tested w/ mocked fetch; demo provider exercises the engine end-to-end. **Phase 0 hardening:** DateTStamp delta + Offset/Limit pagination, write-back default operatory, clinic-timezone datetimes, role defaults to dentist, balance via `/patients/Simple`. **Phase 1 (4/5 shipped, #5 blocked on OD vendor approval — sent 2026-05-28):** (1) cancellation/reschedule write-back (PUT AptStatus=Broken; supersede pending-create on book-then-cancel); (2) recall sync (PMS recall due dates feed `derivePatientRecallStatus` shared helper used by patients list + Recall & Outreach audience); (3) sync-health alerts (`deriveIntegrationsHealth` snapshot, Overview + Integrations warn/error banners, staleness 36h / repeated-failure 3+); (4) CommLog mirroring (5 send sites pipe outbound comms into the OD chart); (5) **blocked** — schedule-driven availability awaits a real-office Customer Key to validate `/schedules` against per-office provider blocks. Webhook Subscriptions are Phase 2 (needs office-side service). Demo seeds a sandbox connection covering every state |
| Settings | Settings | `/settings/account` | Live | + `/settings/clinic` for site editor, `/settings/locations` for multi-location |

**Dropped from clinic sidebar** (route files may still exist for
platform tenant or as legacy entry points):
- `Analytics /dashboard/analytics` — Mosaic template, not dental-shaped (replaced by clinic-side `/analytics` placeholder)
- `Revenue /dashboard/fintech` — fintech-card demo, completely unrelated to clinic finance
- `Product Orders /ecommerce/orders` — superseded by `Shop /shop` placeholder; route still works as the interim product-orders surface
- `Tasks /tasks/kanban` — research across 8 dental orbital-layer products (Weave / NexHealth / RevenueWell / Modento / Lighthouse / Solutionreach / Adit / Practice by Numbers) found 0 ship a generic kanban; the dental pattern is patient-attached followups, already half-shipped across Overview attention cards + Patients needs-attention + Appointments aging-color + Leads rot. Future "Followups" surface goes inside Patients detail, not a top-level module
- `Invoices /invoices` — Mosaic stub that 404s. Clinical billing is PMS-owned (out of scope per DESIGN.md); Shop payments + booking deposits + memberships will live inside Shop (Phase 3) as "Orders & Payments"

Public clinic surfaces also live (full Tend-clone nav structure as of
Checkpoint 3 — minus multi-location pages):
- `{slug}.dreamcreatestudio.com/` — Modern Family/Wellness template
- `{slug}.dreamcreatestudio.com/book` — slot-picker booking (pro/premium)
- `{slug}.dreamcreatestudio.com/intake/[formSlug]` — public form fill
- `{slug}.dreamcreatestudio.com/sitemap.xml`, `/robots.txt`
- `{slug}.dreamcreatestudio.com/opengraph-image` — dynamic OG image
- `{slug}.dreamcreatestudio.com/services` + `/services/[serviceSlug]` —
  Tend-style services index (grouped Core/Special) + per-service detail
  pages with AI-customized content (Checkpoints 1A + 1B)
- `{slug}.dreamcreatestudio.com/insurance` — standalone deep version of
  the homepage Insurance section (Checkpoint 2)
- `{slug}.dreamcreatestudio.com/payment-financing` — payment methods +
  optional financing partners + cancellation policy (Checkpoint 2)
- `{slug}.dreamcreatestudio.com/dental-plans` — re-render of the
  membership module under Tend's "Dental Plans" voice (Checkpoint 2)
- `{slug}.dreamcreatestudio.com/about`, `/team`, `/team/[staffSlug]`,
  `/blog`, `/blog/[postSlug]`, `/careers`, `/careers/[jobSlug]`, `/faq`,
  `/r/[token]` — full About-dropdown surface (Checkpoint 3)

**Post-Checkpoint-3 desktop nav** (5 dropdowns; FAQ + Blog are NO LONGER
top-level — they live inside the About dropdown):

```
Services ▼  Special Services ▼  Patients ▼  About ▼  Contact
   ↓              ↓                 ↓           ↓
   core           special           Insurance   About
   library        library           Payment     Meet Our Team
   services       (when any)        & Financing Blog
                                    Dental Plans Careers
                                    (when active) FAQ
                                                  (always)
```

Gating booleans threaded through `buildClinicNavLinks` mirror each other:
`hasBlog` (published posts) · `hasDentalPlans` (active membership plans)
· `hasCareers` (open job postings) · `hasTeam` (staff array non-empty).
All 13 `<SiteHeader>` call sites do the parallel `Promise.all` loads
upstream and pass the booleans down. Each child auto-hides cleanly when
its gate is false; FAQ + About + Insurance + Payment & Financing always
render (universal defaults make them render-safe on empty clinics).

## Tend-clone service library + Patients dropdown + About dropdown (Checkpoints 1A + 1B + 2 + 3)

Per DESIGN.md "the website is the trunk" + the Tend.com aesthetic, every
clinic gets a full per-service detail page, not just a card on the strip
under the hero. The catalog is platform-owned (every clinic starts from
the same canonical content), customized per clinic at render.

**Schema:**
- `service_library` (migrations 0039 + 0040) — platform-owned canonical
  catalog. Columns: `slug` (unique), `name`, `category` (core | special),
  `icon`, `shortDescription`, `heroBullets[]`, `body`, `processSteps[]`,
  `faq[]`, `relatedSlugs[]`, `origin` (platform | clinic), `status`
  (active | pending | archived), `submittedByOrgId` FK, `reviewNotes`,
  + `idx_service_library_status`. 17 canonical entries
  (`SERVICE_LIBRARY_SEED` in `lib/services/service-library-seed.ts`).
- `clinic_profile.services` jsonb — each `ClinicService` row links to a
  canonical entry via `librarySlug`; the clinic can override `photoUrl`
  + `offer` (promo ribbon), and (1B) carries an optional `customized`
  blob with per-clinic AI-rewritten copy.

**Checkpoint 1A (shipped):** `/services` + `/services/[serviceSlug]`
render Tend-style detail pages using canonical content + `{clinic}` /
`{city}` token substitution. Nav builds Core/Special dropdowns from the
clinic's library-linked services (`buildClinicNavLinks` in
`lib/clinic-site-helpers.ts`). The resolver (`resolveClinicServices`)
returns `EnrichedService[]` with hero bullets, body, process steps, FAQ,
related-services slugs — all token-substituted.

**Checkpoint 1B (shipped):**
- **Per-clinic AI customization** — `lib/services/service-library-ai.ts`
  `customizeServiceForClinic(library, clinic)` calls Anthropic Sonnet
  4.6 via `runClaudeJson` (tool-use structured output, the same pattern
  as `lib/services/ai-blog.ts`). Generated **at selection time** (when
  the clinic picks a service in the settings picker), persisted on
  `clinic_profile.services[i].customized` (`{ heroBullets, body,
  processSteps, faq, generatedAt, modelId }`), regeneratable from the
  picker UI. The detail-page resolver prefers `customized` when present
  + linked to the matching library slug; falls back cleanly to the 1A
  token-substitution path when missing or malformed. Tight system prompt
  pins voice rules + the **no-fabricated-pricing** promise (cost FAQs
  describe the estimate-first process, never invent dollar figures).
- **Clinic-submitted entries** — `vetAndCleanNewService(submission,
  existing)` runs a 3-way Sonnet decision (invalid / duplicate / new)
  via the same structured-output path. Duplicates point at an existing
  slug (e.g. "Zoom Whitening" → "Teeth Whitening"); new entries arrive
  as a clean full `ServiceLibraryEntry` shape. Defense-in-depth: the
  service rejects hallucinated existing-slugs that don't actually exist
  in the supplied list, and treats "new" entries colliding with an
  existing slug as a duplicate. `submitNewLibraryEntry` lands accepted
  new entries as `origin='clinic'`, `status='pending'`,
  `submittedByOrgId=orgId`. **Submitting clinic uses immediately** —
  `listLibraryForPicker(orgId)` + `getLibraryEntryBySlug(slug, orgId)`
  both honor "active OR my-own-pending"; other clinics' pickers don't
  see it until a platform admin approves.
- **Picker UI** (`/settings/clinic`) — `services-library-picker.tsx`
  replaces the old free-text editor. Selected services list with per-row
  Regenerate-with-AI / Edit-copy / Photo+offer / Remove + up-down
  reorder buttons. "+ Add a service" drawer lists library entries by
  category with search, plus a "Can't find your service?" submission
  form that surfaces duplicates / rejections / success states inline.
  Per-row "Customized ✨" / "Library default" pills make the state of
  each row visible at a glance.
- **Platform admin review surface** — `/platform/service-library` (gated
  to `tenantType === 'platform' && role in [owner, admin]`). Three tabs:
  Pending (action queue), Active (cleanup → archive), Archived (audit
  trail). Each row expands to show the full canonical preview (hero
  bullets, body, process, FAQ); pending rows carry Approve / Reject
  controls with required reviewer notes. Sidebar entry in
  `lib/modules/platform.ts`.
- **Demo seeding** — `lib/services/demo-clinic.ts` carries hand-written
  per-service `customized` blobs in `DEMO_CUSTOMIZED` keyed by slug
  (Acme-flavored rewrites, no fabricated prices, structural counts
  match the canonical seed). Skips the Anthropic API entirely on every
  resync (resync runs on every deploy via
  `scripts/resync-demo.mjs`). Self-heal block backfills missing
  `customized` blobs onto legacy demos so they showcase the 1B path on
  next deploy without losing real-clinic data.
- **Tests** — `tests/services/service-library-ai.test.ts` (18 tests
  covering customization success / parse-failure / vet new+duplicate+
  invalid / hallucinated slugs / slug collisions),
  `tests/services/service-library.test.ts` (extended for the customized
  resolver branch + malformed-blob fallback),
  `tests/services/service-library-admin.test.ts` (approve / reject
  status transitions + DB error paths),
  `tests/services/service-library-submit.test.ts` (submit-new end-to-
  end with mocked AI + DB),
  `tests/demo-mode/demo-services-customized.test.ts` (every Acme service
  has a customized blob matching the canonical process/FAQ counts, no
  $-figure anywhere).

**Checkpoint 2 (shipped):** Patients nav dropdown — three new public pages
matching Tend's `/insurance` · `/payment-financing` · `/dental-plans`
structure, adapted for single-clinic multi-tenant. `buildClinicNavLinks`
emits a new "Patients" parent with **Insurance** + **Payment & Financing**
children always (universal fallbacks render even when the clinic hasn't
configured the underlying fields), plus a third **Dental Plans** child
only when the clinic has ≥1 active membership plan. Gating mirrors the
existing `hasBlog` pattern: each calling page loads
`listActivePlans(orgId)` alongside its other parallel data fetches and
passes `hasDentalPlans` into `buildClinicNavLinks`.
- **New schema (migration 0041):** `clinic_profile.payment_methods` jsonb
  (clinic-set list, null = render `DEFAULT_PAYMENT_METHODS` fallback) +
  `financing_partners` jsonb (`Array<ClinicFinancingPartner>` —
  `{id, name, description?, applyUrl?, logoUrl?}`, null/empty = section
  hides entirely — we don't push patients to financing the clinic
  doesn't actually partner with) + `cancellation_policy` text (longform
  prose, null = section hides — no fake dollar fees). Client-safe types
  + `DEFAULT_PAYMENT_METHODS` in `lib/types/clinic-content.ts`;
  `JsonClinicFinancingPartner` server-side type in
  `lib/db/schema/platform.ts`.
- **`/insurance`** (`app/site/[slug]/insurance/page.tsx`) — the standalone
  deep version of the homepage Insurance section. Hero + 4-bullet
  "We're here to help" grid + carrier list & verifier band (reuses the
  same `clinic_profile.accepted_insurance_carriers` data + the existing
  `InsuranceVerifierForm` client component, no fork) + chartreuse-card
  logo marquee + 2-column in-network vs out-of-network process steps
  (universal honest copy) + forest-teal "No dental insurance?"
  cross-link to `/dental-plans` (auto-hides when no active membership)
  + HSA/FSA + final-bill explainer + FAQ accordion filtered to
  `category === 'Insurance'` (4 universal fallbacks when none authored)
  + closing CTA.
- **`/payment-financing`** (`app/site/[slug]/payment-financing/page.tsx`)
  — Hero + 3-step "Honest billing, every visit" explainer (NO
  marketing pitch about a bill-pay integration we don't actually
  ship; describes how billing works rather than promising online pay)
  + pill grid of payment methods (`payment_methods` field or
  `DEFAULT_PAYMENT_METHODS`) + forest-teal HSA/FSA band + financing
  partners cards (hides entirely when `financing_partners` is null/empty)
  + cancellation policy soft-card (hides when null — no fake fees)
  + FAQ accordion filtered to `category === 'Billing'` (4 universal
  fallbacks) + closing CTA.
- **`/dental-plans`** (`app/site/[slug]/dental-plans/page.tsx`) —
  **re-render** of the membership flow with Tend's "Dental Plans" nav
  voice (NOT a 308 redirect to `/membership` — keeps the URL stable,
  preserves canonical metadata, avoids URL flicker mid-load).
  Imports the existing `MembershipJoin` client component directly so
  the Stripe Checkout flow has one source of truth; `/membership`
  remains the canonical implementation for the join action. Hero +
  plan cards + 3-bullet "Why patients choose this" reassurance band
  (No deductibles · No annual maximums · No claim forms) + closing
  CTA. `notFound()`s when `getShopConfig.membershipEnabled === false`
  or `listActivePlans(orgId).length === 0`.
- **Settings editor** (`app/(default)/settings/clinic/`) — new textarea
  for payment methods (newline-separated, same pattern as accepted
  insurance carriers), `FinancingPartnersEditor` repeater component
  ({name, description, applyUrl, logoUrl} rows with add/remove), and a
  cancellation-policy textarea. All three flow through the existing
  `updateClinicProfile` server action with null-on-empty parsers.
- **Sitemap** updated to include `/insurance` + `/payment-financing`
  always (they render universal defaults when underlying data is null),
  + `/dental-plans` only when active membership plans exist.
- **Demo seeding** — `lib/services/demo-clinic.ts` seeds Acme with
  `DEMO_PAYMENT_METHODS` (5 entries matching `DEFAULT_PAYMENT_METHODS`),
  `DEMO_FINANCING_PARTNERS` (CareCredit + Sunbit — the two most common
  in US dental, `applyUrl` points at each company's homepage NOT a
  hotlink-protected affiliate URL), and `DEMO_CANCELLATION_POLICY`
  (warm 2-3 sentence policy, no specific dollar amounts). Self-heal
  block backfills all three fields onto legacy demos when null
  (existing demos that have hand-edited any of these stay untouched).
- **Tests** —
  `tests/clinic-site/insurance-page.test.tsx` (hero copy / carriers
  render / "call to verify" fallback / verifier form present /
  dental-plans cross-link gating / in-vs-out-of-network steps /
  Insurance-filter FAQ / universal default FAQ fallback / basic-tier
  Book CTA routing),
  `tests/clinic-site/payment-financing-page.test.tsx`
  (DEFAULT_PAYMENT_METHODS render / clinic-set methods replace
  defaults / financing partners hide-when-empty + render-when-set /
  cancellation policy hide-when-null + render-when-set / Billing-
  filter FAQ / universal default FAQ fallback),
  `tests/clinic-site/dental-plans-page.test.tsx` (Tend-voice H1 /
  plan cards from `listActivePlans` / 404 when no plans / 404 when
  membership disabled / reassurance band),
  `tests/clinic-site/site-header.test.tsx` extended with a
  "Patients dropdown" describe block (parent + children structure /
  Dental Plans gating by `hasDentalPlans` / child hrefs route under
  basePath / desktop toggle renders / mobile sub-nav renders all
  three children),
  `tests/demo-mode/seeder.test.ts` extended to verify the new
  self-heal columns + the no-overwrite guarantee.

**Checkpoint 3 (shipped):** `/team` index + per-staff detail pages +
About-dropdown consolidation. Per Tend's "Meet Our Dentists" pattern, the
flat About/FAQ/Blog top-level nav collapses into a single **About**
dropdown carrying About · Meet Our Team · Blog · Careers · FAQ. FAQ and
Blog are NO LONGER top-level — they live only inside About.
- **New routes:**
  - `app/site/[slug]/team/page.tsx` — Tend's `/dentists` pattern. Hero
    ("Meet the team at {clinic}" with the first sentence of `about` or a
    universal warm intro), 1/2/3-column responsive grid of oval-portrait
    cards (matching the homepage clinical-team band), each with title +
    name + "More →" link to the per-person detail page. Empty-staff
    state renders a "coming soon" placeholder rather than 404 (so direct
    nav hits don't break), but the nav dropdown only surfaces the link
    when `staff.length > 0`. SiteHeader + footer + closing CTA band
    match every other clinic page.
  - `app/site/[slug]/team/[staffSlug]/page.tsx` — per-staff detail page.
    2-col hero (oval portrait + copy block: eyebrow / back-to-team /
    H1 name in Fraunces brand color / title+credentials line / bio /
    Book CTA labeled "Book with {firstName}" stripping honorifics).
    Specialties pill list (forest-teal accent, only renders when set),
    "Outside the office" fun-fact card (only renders when present),
    closing CTA band. Resolves staffSlug against an explicit
    `staff.slug` override OR `kebab(staff.name)` fallback — explicit slug
    is checked first so renaming a staff member doesn't break links if
    they set a stable slug. `notFound()` on unknown slug. Emits Person
    JSON-LD (`@type:'Person'`, `worksFor:{@type:'Dentist', name:clinic}`)
    for people-search SEO.
- **Type changes (NO migration — `clinic_profile.staff` is jsonb):**
  `ClinicStaff` in `lib/types/clinic-content.ts` adds 5 optional fields
  — `slug?` (URL override), `credentials?` ("DDS · 12 years experience"),
  `specialties?` (string[]), `funFact?` (single-line humanizing detail),
  `bookHref?` (per-staff booking URL override). All optional; detail page
  renders gracefully when absent.
- **Shared slug helper:** `staffSlug({slug?, name})` in
  `lib/clinic-site-helpers.ts` — explicit-override-then-derived. Re-used
  by the /team index (per-card link), the [staffSlug] resolver
  (param-to-staff match), and the sitemap.xml route (per-staff URL).
- **Nav restructure:** `buildClinicNavLinks` signature gains `hasTeam?:
  boolean` + `hasCareers?: boolean` (mirror the existing `hasBlog` +
  `hasDentalPlans` pattern, default false). About is now the canonical
  dropdown parent — children in Tend's order: About → Meet Our Team
  (gated `hasTeam`) → Blog (gated `hasBlog`) → Careers (gated
  `hasCareers`) → FAQ (always — universal defaults render even when
  the clinic hasn't authored items). FAQ + Blog removed from top-level.
- **All 11 SiteHeader call sites threaded** with the two new booleans —
  page wrappers do the loads in parallel (`Promise.all`):
  `getOpenJobs(orgId)` for Careers (returns `length > 0`), plus
  `(profile.staff ?? []).length > 0` for Team (no extra DB call — staff
  already loaded with the profile). Each call site is the page that
  matters: `app/site/[slug]/{about,book,careers,careers/[jobSlug],
  dental-plans,faq,insurance,page (home → ModernTemplate wrapper),
  payment-financing,services,services/[serviceSlug]}/page.tsx` plus
  `components/clinic-site/modern-template.tsx` (sync, receives
  `hasTeam` + `hasCareers` as props from the home wrapper).
- **Settings editor** (`app/(default)/settings/clinic/staff-editor.tsx`)
  — surfaces all 5 new fields per staff row: slug (text, placeholder
  shows the auto-derived kebab), credentials (text), specialties
  (textarea, newline/comma split), funFact (text), bookHref (text,
  optional). All flow through the existing `updateClinicProfile` server
  action (jsonb column accepts the extended type as-is).
- **Demo seeding** — `DEMO_STAFF` in `lib/services/demo-clinic.ts` carries
  5 staff (lead dentist with explicit slug + cosmetic dentist with
  derived slug + 2 hygienists + office manager) — each with credentials,
  specialties, fun-facts to exercise every code branch on the detail
  page (Dr. Reyes has all fields populated; Maria has bio+credentials+
  specialties; Casey has bio+funFact but no specialties; Renee has
  credentials+specialties but no funFact). Self-heal block backfills:
  (1) replaces null / empty / all-legacy-minimal staff arrays with
  DEMO_STAFF wholesale; (2) targeted in-place upgrade — for each
  stored entry whose new optional fields are ALL absent, looks up by id
  and backfills from DEMO_STAFF; entries with ANY new field set are
  treated as clinic-edited and skipped.
- **Sitemap** — `app/site/[slug]/sitemap.xml/route.ts` emits `/team`
  (when staff exists) + one URL per staff member with the resolved slug.
- **Tests** —
  `tests/clinic-site/team-page.test.tsx` (H1 / each staff renders /
  More links use explicit + derived slug / empty-staff renders
  placeholder not 404 / hero subhead pulls about first sentence /
  fallback warm copy when about is null / chrome present),
  `tests/clinic-site/team-staff-page.test.tsx` (resolves by explicit
  slug / derived slug / renders credentials+specialties+funFact /
  hides those sections when absent / per-staff bookHref override /
  Book label strips honorific / Back-to-team href / Person JSON-LD
  worksFor:Dentist / notFound on unknown slug / notFound on empty
  staff list),
  `tests/clinic-site/site-header.test.tsx` extended with an "About
  dropdown" describe block (universal floor About+FAQ children render
  always / Team/Blog/Careers gate correctly on their booleans / About
  dropdown toggle renders / mobile sub-nav renders all children /
  FAQ+Blog NO LONGER top-level),
  `tests/demo-mode/seeder.test.ts` extended (self-heal patch carries
  DEMO_STAFF when null + skips staff overwrite when clinic-edited).

## What's NOT yet wired (priorities for next session)

### Maintenance session 2026-06-09 — what shipped + what's still open

A bug-hunt + email-deliverability session shipped PRs **#265–#276** (all merged
to main, all green). Highlights:
- **Email now works end-to-end via Resend** (#273 + an ops fix): the prod
  `RESEND_API_KEY` was a dead key — swapped to the working account's key in
  Secrets Manager; `deliver()` now surfaces Resend's `{error}` return instead of
  reporting false success. **Per-clinic sender identity Tier 1 + Tier 2**
  (#274/#275/#276) — see the What's-wired bullet.
- **Bug-hunt fixes:** auth/role-gating (#265: email-bind patient invites, gate
  marketing actions, org-check patient notes); appointment lifecycle (#266:
  reschedule keeps duration, terminal-state guards, reminders skip confirmed,
  slot pre-open overlap); Stripe membership period-end silently null (#267);
  shop oversell + atomic coupon burn (#268); `/messages` email channel actually
  delivers now (#269); reviews submit status-gate + feature-exact-review (#270);
  PMS sync hardening (#271: high-water skip, overlap guard, family-phone dedupe,
  patient-map recovery); intake form picker (#272).

**Clinic timezone — DONE (#278, migration 0050).** `clinic_profile.timezone`
(null = `CLINIC_DEFAULT_TZ` = America/New_York) + `lib/clinic-timezone.ts`.
`getSlotsForDay` generates the booking grid in the clinic zone (accepts a
date-only `YYYY-MM-DD` key — the booking form now sends the patient's calendar
day — or a Date → clinic-local; open/close resolved via the DST-aware
`lib/services/pms/datetime.ts` `parseOdDateTime`); appointment-time emails
(booking confirmation / reminder / reschedule) render in the clinic zone via
`ClinicSender.timeZone`; Settings → Clinic Profile has a Timezone picker. So
booking slots + emails are now timezone-correct (no longer UTC).

**Still open (priority order):**
1. **ROTATE TWO SECRETS shared in chat (compromised):** the Resend key
   `re_BZDw…` (now the live prod key — create a fresh one in Resend, swap it into
   `dreamcrm/app-secrets`, redeploy; also delete the dead `re_T8fyc…`) and the
   AWS access key `AKIA53LCNZ3Y66OJGLOI`. **This is the user's action item.**
2. **Lower-severity audit findings (deferred, low risk):** Connect OAuth state
   cookie delete-path; platform Stripe webhook idempotency ledger (dup
   owner-notifications on retries); orphan `pending` membership on abandoned
   checkout; review auto-send timing anchored to `completedAt` vs visit time;
   restore real `db.transaction()` in `rescheduleAppointment`/`convertLeadToPatient`/
   `moveTask` (the "Neon has no transactions" comments are STALE — it's
   node-postgres now, which supports them).
3. **Patient email replies don't loop back into `/messages`** for arbitrary
   addresses — inbound email is only ingested via the Gmail integration. With
   Tier 2 (clinic's connected Gmail = the sender), replies to that mailbox DO
   surface; for Tier 1 (platform domain) they go to the clinic's contact email,
   not back into the thread. A dedicated inbound-parse path is the full fix.

### Tend-clone epic — DONE (Checkpoints 1A/1B/2/3 shipped this session)

The full Tend-style site structure is live, minus multi-location pages.
PRs: #184 (services library + Core/Special nav), #186 (AI customization
+ clinic submissions + admin review), #187 (Patients dropdown + 3 new
pages), #188 (Team page + About dropdown). The "Tend-clone service
library" subsection below covers the full design; the "Public clinic
surfaces also live" list above enumerates every public route.

**Loose ends for v1.1** (not blocking — system works as-is):
- Per-staff individual booking widgets via `ClinicStaff.bookHref` — type
  is wired and rendered on the detail page CTA, but we don't yet have
  a per-provider booking experience inside `/book`; the override
  currently points patients to the same booking page
- `service_library` AI-submitted pending entries currently render their
  AI-generated content with NO admin edit pass (admin approves or
  rejects; editing the cleaned content pre-approval is v1.1)
- Per-page SEO controls in the Website Editor — still v1.1

### Website Editor epic — Phases 1 + 2 + in-place Studio shipped; Phase 3 (AI onboarding) in progress

Research-grounded overhaul of the `/website` editor (deep research this
session on dental website vendors, patient expectations, and AI-copy
pricing — full reports in chat history). Key findings that shaped it:
the clinic pain that matters is **lock-in + powerlessness** (you don't own
the site, must email an agency to change a word — Officite ToS / ProSites
"cone of silence"), **AI copy is whitespace in dental** (no vendor ships
it), and **metering edits to your own content is the #1 AI backlash
trigger** (Canva/Cursor/Notion). So: own-it + edit-it-yourself framing,
AI as a free-feeling accelerant, manual editing always free.

- **Phase 1 (PR #199, shipped)** — section editor + live preview + FAQ
  editor (see "Website Editor v2" under What's wired).
- **Phase 2 (PR #200, shipped)** — per-section "Rewrite with AI" + the
  **tier-baked allowance** monetization model (Basic 15 / Pro 50 /
  Premium 200 rewrites/mo; NOT a credit currency; fails safe; never
  auto-charges). See "Website Editor — AI copy assist" under What's wired.
- **Phase 2.5 — in-place Website Studio (PRs #202–#212, shipped)** — the
  three-pane editor was REPLACED by a full-screen WYSIWYG canvas: the
  clinic edits its real `/site/[slug]` inside an `<iframe>`, hovering and
  clicking the site itself, navigating page-to-page in edit mode. Inline
  text + image/video replace + per-section modals (reusing the existing
  editors) + footer hours, across Home + every content subpage. See the
  "Website Studio" bullet under What's wired for the full mechanism +
  coverage. **Carry-over:** Phase-2's per-section "Rewrite with AI" buttons
  aren't re-wired into the Studio modals yet (infra intact).
- **Phase 3 (IN PROGRESS) — the conversational AI onboarding
  interview**: a brand-styled streaming chat shown post-checkout (onboarding
  creates a near-empty `clinic_profile`, so `/onboarding-complete` →
  a new `/welcome` step is the insertion point) that asks ~6–10 warm
  questions then drafts the WHOLE site copy (tagline, about, service
  selection + customization, stats, FAQ) in one pass, free + uncounted,
  then drops the clinic into the in-place Studio to refine. Reuses
  `lib/services/ai-website.ts` + `service-library-ai.ts`.

### Public-site polish reconciliation (PRs #190–#198 — were undocumented)

The #189 doc sweep predated these; captured here for honesty:
- **#190–#192** — shared public-site primitives added: `components/clinic-site/`
  `closing-cta.tsx`, `scroll-reveal.tsx`, `numbered-steps.tsx`; subpage
  refinement sweep (scroll reveals + ClosingCTA across the subpages).
- **#193** — **replaced the sticky mobile Book+Call bar with corner
  floating CTAs** (`site-mobile-actions.tsx`) + dropdown hover-bridge.
  ⚠️ This diverges from DESIGN.md's "sticky bottom CTA bar" pattern — a
  deliberate change; DESIGN.md's mobile-pattern note should be updated to
  match (or the decision revisited) next time that doc is touched.
- **#194–#196** — mobile responsiveness pass + About-page polish + hamburger
  drawer nav + stats 2×2 + tighter form cards + day-picker breakout.
- **#197–#198** — **intake self-signup flow** (`app/site/[slug]/intake-start/`)
  routed through `www` so auth + cookies + portal share an origin; nav-logo
  cleanup; day-picker arrows.

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
2. **Reviews auto-trigger (v1.1)** — code shipped, **needs an
   EventBridge schedule rule to start firing.** Handler at
   `/api/cron/auto-send-reviews` (Bearer `CRON_SECRET`, same pattern as
   `publish-scheduled-posts`). Service `autoSendDueReviewRequests` in
   `lib/services/reviews.ts` finds every org with
   `clinic_review_config.autoSendEnabled=1` + a complete platform
   config, scans `appointment.status='completed'` past the per-org
   `autoSendDelayHours` cutoff (default 24h), and fires one send per
   appointment with no existing `review_request` row pointing at it
   (per-appointment idempotency means hourly is safe). Expected
   guard misses (opted out / no email / rate limit / no platforms) are
   classified as `skipped`; unexpected errors land in `result.errors`
   for ops alerting. **To activate:** add an EventBridge schedule rule
   (`cron(0 * * * ? *)` for hourly) that POSTs to
   `https://www.dreamcreatestudio.com/api/cron/auto-send-reviews` with
   `Authorization: Bearer ${CRON_SECRET}`.
3. ~~**Subdomain DNS**~~ — **DONE (2026-05-28).** `*.dreamcreatestudio.com`
   is wired and serving: clinic sites are live at
   `{slug}.dreamcreatestudio.com` (verified `acme-dental-demo.…` → 200
   homepage + `/book`). App Runner holds a third custom-domain
   association `*.dreamcreatestudio.com` (`active`, wildcard ACM cert
   CN `*.dreamcreatestudio.com`) alongside the apex+www and `app.`
   associations. **3 CNAME records at name.com** make it work:
   `*` → `hq7ygyvjdp.us-east-1.awsapprunner.com` (routing) + two ACM
   validation CNAMEs (`_4345…` → `_cc91….acm-validations.aws` and
   `_f8f4….r9ex…` → `_5914….acm-validations.aws`). `www`/`app`/apex stay
   on their explicit, more-specific records (they win over `*`); unknown
   subdomains rewrite to `/site/<slug>` and 404 cleanly. To add the
   wildcard on a fresh service: `aws apprunner associate-custom-domain
   --domain-name "*.dreamcreatestudio.com" --no-enable-www-subdomain`,
   then add the returned validation records + the `*` routing CNAME.
   Path-based URLs (`/site/[slug]/...`) still work as before.
4. **Real annual Stripe prices** — split the 3 `STRIPE_PRICE_*_ANNUAL`
   envs (they currently point to the same monthly prices).
5. **Multi-page Website editor (v1.1)** — about page, services detail,
   custom landing pages, blog posts. Template switcher with preview
   (Cosmetic / Pediatric variants per DESIGN.md). Custom domain wiring
   for the `websiteDomain` column. Per-page SEO controls.
6. **Patient portal — v2 SHIPPED (2026-06-09; see the Patient Portal v2
   bullet under What's wired).** Full clinic-branded redesign out of the
   Mosaic shell + reschedule/cancel + family access + online balance
   payments + magic-link sign-in + the /settings/portal customization
   menu with per-feature hide-not-disable toggles and preview-as-patient.
   Future v1.1 additions (not blocking): per-appointment form pre-fill,
   Spanish portal locale, per-dependent portal logins for teens,
   payment-plan support, "posted to PMS" tracking on balance payments
   (clinic-side reconciliation list exists via
   `listRecentBalancePayments`, no UI yet), portal-side review-request
   surfacing after completed visits.
7. **Patients module v2** — per-patient tags + audience targeting;
   comms preferences granularity; household linkage table for
   pediatric/family clinics; per-view audit log for Premium tier;
   `patient.source` backfill for legacy rows (currently null on rows
   pre-migration-0018).
8. **Shop module (Phase 3)** — the differentiator nobody else ships
   (whitening kits + branded merch via Stripe Connect, birthday
   coupons, loyalty mechanics, membership plans). `/shop` placeholder
   exists. Existing `/ecommerce/orders` route serves as interim view.
9. ~~**Patient detail "Send review request" button**~~ — **shipped
   2026-05-28 (PR #143).** "Request review" CTA lives in the patient
   detail header next to Send intake / Book / Edit. Wraps
   `createAndSendReviewRequest` with the same `{ ok | error }` shape as
   `sendIntakeRequestAction`; the underlying service still enforces every
   guard (no email, opted out, no platforms configured, within rate-limit
   window) and we surface those messages verbatim under the button.
10. **Clinic module build-out — COMPLETE.** Analytics, Blog, SEO,
    Careers, and Integrations have all shipped — the clinic sidebar has
    **no remaining `status:'soon'` modules**. Integrations Phase 1 is
    4/5 shipped (cancellation/reschedule write-back + recall sync +
    sync-health alerts + CommLog mirroring). Remaining v1.1 deepenings:
    schedule-driven availability (Phase 1 item #5, blocked — see #11
    below); scheduled auto-sync on a cron (manual Sync-now + best-effort
    write-back ship today); Dentrix Ascend (pending Henry Schein One
    partner approval); configurable field mapping (today fixed + shown
    in full); webhook Subscriptions (Phase 2 — needs office-side service).
11. **OD vendor portal approval (in flight, sent 2026-05-28, SLA 1-3
    business days)** — gates Phase 1 item #5 and any real-office testing
    of the integration. The current `PMS_OPEN_DENTAL_DEVELOPER_KEY` env
    is OD's *public sandbox* Developer Key (works against the hosted
    test DB only; can't issue Customer Keys for real offices).
    Application emailed to `vendor.relations@opendental.com` on
    2026-05-28 with the standard fields (company name + mailing address
    + developer contact + application description + requested API
    resources: patients/appointments/operatories/providers/recalls
    read+create+update, commlogs create, schedules read). **Once
    approved:** (a) log into the developer portal at
    https://api.opendental.com/portal/gwt/fhirportal.html with the new
    vendor credentials; (b) replace `PMS_OPEN_DENTAL_DEVELOPER_KEY` in
    Secrets Manager (`dreamcrm/app-secrets`) with the issued vendor key
    and redeploy; (c) for each clinic onboarded, generate a Customer
    Key from the portal naming that office; (d) the office installs
    **eConnector** (https://www.opendental.com/manual/econnector.html)
    on a Windows machine and pastes the Customer Key into OD: **Setup
    → Advanced Setup → API → Add Key**; (e) same Customer Key pasted
    into DreamCRM at `/integrations`. **No adapter code change needed**
    — we keep hitting `https://api.opendental.com/api/v1/` (Remote API
    mode) with `Authorization: ODFHIR {DeveloperKey}/{CustomerKey}`. OD
    has three API modes (https://www.opendental.com/site/apilocal.html):
    **Local** (each workstation, `localhost:30222`, no eConnector),
    **API Service** (DB server, `localhost:30223`, eConnector required),
    **Remote** (`api.opendental.com`, eConnector required). DreamCRM
    uses **Remote** — the only mode that lets a cloud-hosted SaaS reach
    the office. eConnector itself is a free Windows service from OD;
    office API access may carry a monthly fee (CLAUDE.md previously
    cited ~$30/mo from prior research; the live docs read on 2026-05-28
    don't surface a price — will appear during eConnector signup). Once
    approval lands, the first concrete deliverable is wiring
    `/schedules` into `lib/services/booking.ts` to close Phase 1.

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
| **Domain config** | apex `dreamcreatestudio.com` + wildcard `*.dreamcreatestudio.com` + auto SSL | App Runner custom-domain associations (apex+www, `app.`, and `*.` wildcard) w/ App-Runner-managed ACM certs; DNS (CNAMEs) at name.com. Wildcard live as of 2026-05-28 |
| **Subdomain rewrite in `middleware.ts`** | `{slug}.dreamcreatestudio.com` → `/site/{slug}` | Same code works wherever middleware runs; verify Lambda@Edge / CloudFront Functions compatibility |
| **Env var management** | Encrypted envs per project + per env target | AWS Secrets Manager (PHI-touching secrets) OR Systems Manager Parameter Store (config), surfaced into Lambda env vars or container task definitions |
| **Webhook endpoints registered with vendors** | Stripe + Gmail Pub/Sub all point at `dreamcreatestudio.com/api/webhooks/*` | Same URL post-migration (domain stays). New: `/api/webhooks/ses` for SES bounce/complaint events; `/api/webhooks/aws-sms` for inbound SMS. Rotate **every** signing secret as part of the cutover |
| **Migration bootstrap pattern** | One-shot `/api/admin/bootstrap` route + `ADMIN_BOOTSTRAP_TOKEN` env + paired cleanup PR | Same pattern works post-migration; only the env-set/delete API endpoints change (Vercel API → AWS Secrets Manager `PutSecretValue` / `DeleteSecret`) |

### Pre-migration code hygiene

Already done (no action needed):
- All current migrations applied to prod through 0023 at AWS-cutover time (`_dreamcrm_migrations_applied` ledger reflected 0000–0023 then); subsequent migrations 0024–0041 have been auto-applied on deploy via `scripts/db-migrate.mjs` (note: 0033 + 0034 land with the OD epic merge; 0035 adds `review_request.review_text`; 0036 adds `clinic_profile.faq`; 0037 adds `clinic_profile.difference_video_url`; 0038 adds `clinic_profile.accepted_insurance_carriers` powering the public Insurance section + verifier form; 0039 adds the platform-owned `service_library` table powering the Tend-clone services-library checkpoint; 0040 adds `service_library.submitted_by_org_id` + `review_notes` + `idx_service_library_status` for the AI submission → admin review workflow; 0041 adds `clinic_profile.payment_methods` + `financing_partners` + `cancellation_policy` for the standalone /payment-financing page; 0042 adds the `ai_usage_counter` table — per-org/per-month tally behind the Website Editor's tier-baked AI-rewrite allowance)
- Bootstrap route + middleware allowlist removed after every migration apply (latest cleanup: PR #108). Note: the **public-path allowlist in `middleware.ts`** also needs to cover any new `/api/admin/*` route guarded only by `CRON_SECRET` — PR #185 fixed a regression where `/api/admin/resync-demo` was silently 302'd to /signin (added in #176 but never added to the allowlist), which silently broke every auto-resync since.
- 1224/1224 tests passing, typecheck clean
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
- **Clinic public sites**: `{slug}.dreamcreatestudio.com` serve live via the
  `*.dreamcreatestudio.com` App Runner wildcard association (ACM wildcard cert).
  `middleware.ts` rewrites the subdomain → `/site/<slug>`; `www`/`app` are
  reserved (more-specific DNS records win over `*`), unknown slugs 404. DNS:
  `*` CNAME → `hq7ygyvjdp.us-east-1.awsapprunner.com` + two ACM validation
  CNAMEs at name.com (see priority-list item #3 for the exact records).
- **Deploy = merge to `main`** (automatic, like Vercel was). A GitHub Actions
  workflow (`.github/workflows/deploy.yml`, keyless via the OIDC role
  `DreamCRMGitHubActionsDeploy`) uploads the source and triggers the CodeBuild
  project `dreamcrm-image-build`, which builds the image with `docker buildx`,
  pushes ECR `:latest` + `:build-N` (and a separate `:buildcache` tag carrying
  the BuildKit layer cache via `--cache-to type=registry`), then runs
  `aws apprunner start-deployment`. End-to-end ~4-5 min: ~30-60s GitHub Actions
  + ~60-90s CodeBuild (cache-hot; ~2 min cold) + ~3 min App Runner deploy
  (image pull + health check + traffic switch — irreducible AWS overhead).
  Watch it in the repo's **Actions** tab. Manual fallback (no GitHub):
  ```
  git archive --format=zip HEAD -o /tmp/src.zip
  aws s3 cp /tmp/src.zip s3://dreamcrm-codebuild-952078552817/source/dreamcrm-src.zip
  aws codebuild start-build --project-name dreamcrm-image-build
  ```
  `NEXT_PUBLIC_*` bake at build time (CodeBuild env → Docker build args), so
  changing them needs a rebuild, not just a redeploy. The BuildKit cache image
  in ECR (`dreamcrm:buildcache`) is regenerated every build (`mode=max`) and
  isn't covered by the `build-*` lifecycle rule, so it persists indefinitely;
  if a build ever needs to start from a cold cache, just delete that tag in
  ECR and the next build will repopulate it.
- **Secrets / config**: Secrets Manager `dreamcrm/app-secrets` (one JSON) →
  injected as App Runner `RuntimeEnvironmentSecrets`. Driver switches + non-
  secret config (`STORAGE_DRIVER`, `EMAIL_DRIVER`, `AI_DRIVER`, `S3_BUCKET`, …)
  are `RuntimeEnvironmentVariables`. Updating a secret needs a redeploy to take
  effect (instances read them at startup).
- **DB migrations** (latest: 0051): **auto-applied on deploy.** The
  container runs `scripts/db-migrate.mjs` (drizzle migrate, idempotent) before
  the server boots, so each deploy applies its own pending migrations from
  inside the VPC. A migration failure exits non-zero → the container fails its
  health check → App Runner keeps the previous version serving (the app never
  goes down on a bad migration; the deploy just shows failed). Workflow:
  `pnpm db:generate`, commit, merge to `main` — the deploy applies it. The
  manual route `POST /api/admin/migrate` (`Authorization: Bearer $CRON_SECRET`,
  same idempotent migrate) stays as a fallback for out-of-band applies.
  `/api/admin/seed-platform` (same auth) seeds the platform org on a fresh DB.
- **Acme demo auto-resync**: also auto-applied on deploy. After migrate,
  the container runs `scripts/resync-demo.mjs` → `POST /api/admin/resync-demo`
  → calls `createDemoClinic()`. It's idempotent: on a fresh DB it seeds the
  demo end-to-end; on an existing demo it walks every self-heal branch
  (stats label migrations, differenceVideoUrl overwrite, FAQ backfill,
  testimonials re-linking, etc.) so the demo always showcases the latest
  template without a manual "View as Acme" trigger. Real-clinic data is
  never touched — `createDemoClinic` scopes all writes to the org with
  `isDemo: true`. (Real clinics don't need this: their public site reads
  `clinic_profile` live on every render, so edits in `/settings/clinic`
  reflect immediately.)
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
  active custom domains `dreamcreatestudio.com`(+www), `app.dreamcreatestudio.com`,
  and `*.dreamcreatestudio.com` (wildcard, for clinic public sites)
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
- **For UI / public-site / font / next-config PRs, run `pnpm build` —
  not just `pnpm test` — before claiming the PR is shippable.** Tests
  use happy-dom and never exercise the production build path, so they
  miss whole classes of issues: `next/font/google` configs that the
  build env can't fulfill (CodeBuild's outbound to fonts.googleapis.com
  is unreliable — PR #166 broke prod this way, #167 fixed it by
  switching to a runtime `<link>` tag), turbopack module-resolution
  surprises, server/client boundary slips, etc. If the change touches
  the template, layout, or anything font/build-related, `pnpm build`
  is the only signal that proves it'll deploy.
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
