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
- **Vitest test suite** (568 tests) covering middleware, billing sync,
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
  + patient portal tags 'portal').
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
- **Gmail push notifications via Google Pub/Sub** — `users.watch()` is
  registered when a mailbox is connected; Gmail publishes change events
  to `projects/dreamcrm-496717/topics/gmail-watch`; the push subscription
  POSTs to `/api/webhooks/gmail` (OIDC-verified); `processHistoryEvent`
  diffs from the stored historyId via `users.history.list` and ingests
  new messages. A daily Vercel cron at 04:00 UTC renews any watch that
  expires within 36h (`/api/cron/gmail-watch-renew`). Existing polling
  (auto-sync on page load + Refresh button) remains as a fallback path.

## Module status snapshot (clinic dashboard)

Live = real data + interaction. Stub = template-shape exists but not yet
on dental-correct schema. Placeholder = "Coming soon" UI only.

| Module | Sidebar path | Status | Notes |
|---|---|---|---|
| Overview | `/` → `/dashboard` | **Live (v1)** | Morning-huddle dashboard, shipped this session |
| Analytics | `/dashboard/analytics` | Stub | Mosaic template, not dental-shaped |
| Revenue | `/dashboard/fintech` | Stub | Per-user fintech demo, not real clinic revenue |
| Patients | `/patients` | **Live (v1)** | Dental `patient` table. List with glyph cluster + filter chips + fuzzy search + bulk email; detail page with identity rail + unified timeline (appointments + messages + forms + invoices + notes) + needs-attention panel + relationship notes (append-only `patient_note` table) |
| Appointments | `/appointments` | **Live (v1)** | Dental `appointment` table. Agenda-list default grouped by day, glyph cluster (★/🎂/$/📝!/⚠️/💤/🆕/📅/⏱/🔕), aging-color left border (T-72h neutral → T-12h red until confirmed), filter chips (date window + needs-attention + staff), side drawer for confirm / reschedule / cancel / mark no-show / send reminder, bulk reminder send. "Book appointment" from patient detail opens an in-place drawer. `/calendar` 308s to `/appointments` for clinic tenants (platform org keeps the generic FullCalendar) |
| Product Orders | `/ecommerce/orders` | Stub | Generic Mosaic e-commerce orders module for clinics that sell products on the side (whitening kits etc.). We do NOT manage clinical treatment plans — those stay in the PMS per DESIGN.md |
| Invoices | `/invoices` | Live | Product invoices, tenant-scoped |
| Patient Messaging | `/messages` | Live | Conversations, tenant-scoped |
| Intake Forms | `/intake-forms` | **Live (v1)** | Shipped this session |
| Inbox | `/inbox` | Live | Gmail integration, real-time SSE, triage, threading |
| Tasks | `/tasks/kanban` | Live | Kanban + table, dnd |
| Recall & Outreach | `/marketing` | Live | Campaigns module |
| Blog / SEO / Careers / Website Editor | — | Placeholder | `status: 'soon'` in clinic registry |
| Settings | `/settings/account` | Live | + `/settings/clinic` with services, staff, stats, testimonials, office photos editors |

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
   - Website leads (contact form submissions need to land in a `lead`
     table — currently the contact form just fires an email and
     forgets the submission)
6. **Migration 0004 + Gmail push env vars need applying to prod** —
   bootstrap-apply `0004_lowly_microbe.sql` (adds `watch_expires_at`),
   then set Vercel env vars:
   `GMAIL_PUBSUB_TOPIC=projects/dreamcrm-496717/topics/gmail-watch`,
   `GMAIL_PUBSUB_SA_EMAIL=dreamcrm-admin@dreamcrm-496717.iam.gserviceaccount.com`,
   `CRON_SECRET=<random>`. Finally create the Pub/Sub push subscription
   pointing at `https://dreamcreatestudio.com/api/webhooks/gmail` with
   OIDC identity `dreamcrm-admin@dreamcrm-496717.iam.gserviceaccount.com`.

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
