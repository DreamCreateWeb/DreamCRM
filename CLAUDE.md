# DreamCRM — Project context for Claude

Multi-tenant SaaS for dental clinics. Dream Create (platform owner) runs the
platform; clinics are tenant orgs; patients are users with `role='patient'`
in a clinic org; referral **partners** are a fourth persona with their own
portal. The Mosaic Next.js admin template provided the original dashboard
bones; the v2 design system re-skinned it — wire logic into the existing
system, don't replace it.

This file is the LEAN working manual (trimmed 2026-11-03: every agent start
pays for it). The long-form subsystem narrative it used to carry lives,
verbatim, in [`docs/SUBSYSTEMS.md`](./docs/SUBSYSTEMS.md); per-session detail
in [`docs/HISTORY.md`](./docs/HISTORY.md). When a pointer below is not enough,
open those — do not guess.

**The doc set (read in this order for a new module):**

| Doc | What it is |
|---|---|
| [`DESIGN.md`](./DESIGN.md) | Durable strategy + design principles — what we're building, who for, positioning, the North Star. Read before designing anything new. |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | The binding dashboard UI system (v3 "Cute Dream, Living Data") — semantic tones, glyphs, motion, components, the 40px chrome floor, the ink-ramp rule. Read before touching dashboard UI. |
| [`BRAND.md`](./BRAND.md) | The MARKETING SITE's personality language ("Daylight Dream"). Read before touching `app/(marketing)` or `components/marketing`. Marketing only — the dashboard keeps DESIGN-SYSTEM.md. The page-by-page record of the Part 8 moves is in docs/SUBSYSTEMS.md. |
| **This file** | Current state: architecture, module map, conventions (the laws), ops. |
| [`docs/SUBSYSTEMS.md`](./docs/SUBSYSTEMS.md) | The long-form reference: the SMS / insurance / PMS build records, the Transformation phases, the migration history, the platform tenant's prospecting engine. |
| [`docs/HISTORY.md`](./docs/HISTORY.md) | The chronological session-by-session build log. |
| [`docs/ACTIVATION.md`](./docs/ACTIVATION.md) | THE FIRST WEEK — every feature has a front door (the seven laws, the switches, the cockpit). Read before adding ANY page, empty state, catalog card or "coming soon". |
| [`docs/RELEASE.md`](./docs/RELEASE.md) | The release program (beta → 1.0; the defect ledger, Part 5). New ideas go to `docs/POST-1.0.md`. |
| [`docs/ai-operations.md`](./docs/ai-operations.md) | THE DREAM TEAM spec — lexicon, lane matrix, the day-0 deep-sleep ruling, the build log. Read before touching /dream-team, the proposal spine, autonomy, goals or Sandman. |
| [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) | The honest compliance posture (TCPA/CAN-SPAM, the HIPAA subprocessor decision). Read before ANY compliance claim in copy. |
| [`docs/AUDITS.md`](./docs/AUDITS.md) | Phase-audit certificates, retrospectives, the standing self-sweep checklist. |
| [`docs/STRUCTURE-AUDIT.md`](./docs/STRUCTURE-AUDIT.md) | The information-architecture reference. Read before moving/renaming any surface. |
| [`docs/COMPETITIVE-GAPS.md`](./docs/COMPETITIVE-GAPS.md) | The module-deepening roadmap + owner rulings (e.g. insurance checks stay MANUAL, 2026-10-02). |
| Deep dives | `docs/custom-domains.md` · `docs/inbound-email.md` · `docs/insurance-go-live.md` · `docs/financing-providers.md` · `docs/onboarding-overhaul.md` · `docs/sms-provider-evaluation.md` · `docs/marketing-engine.md` · `docs/intake-forms-overhaul.md` · `docs/zernio-google-integration.md` · `docs/outreach-go-live.md` · `docs/E2E.md` · `docs/CI.md` · `docs/PROD-READ-ACCESS.md` |

## Stack

- **Next.js 16** (App Router, Turbopack), TypeScript, Tailwind 4, React 19.
- **Drizzle ORM** on **AWS RDS Postgres** (`us-east-1`; node-postgres, VPC-only).
- **better-auth** with Organizations (multi-tenant) + magic-link (patients).
- **Stripe** — platform billing (Checkout + Portal + webhooks; ONE purchasable
  plan, Premium $200/mo "founding rate", Stripe Tax on), **Connect Standard**
  for clinic shop/membership/balance payments, **Connect Express** for partner
  payouts.
- **Email: Resend (LIVE)** from `dreamcreatestudio.com`; per-clinic sender
  identity Tier 1 (platform domain, clinic name) + Tier 2 (connected Gmail) —
  `lib/email-identity.ts`, `lib/services/clinic-sender.ts`; `deliver()` in
  `lib/email.ts` routes it. Inbound replies → /messages are LIVE
  (`in.dreamcreatestudio.com`; runbook `docs/inbound-email.md`).
- **Storage: AWS S3** (`STORAGE_DRIVER=s3`). **AI: Anthropic API direct**
  (`lib/ai.ts`; inert Bedrock driver for a future single-BAA move).
- **Zernio** — Google Business + social hosted OAuth, reviews, GBP listing
  sync, posting, metrics (`lib/zernio.ts`).
- **SMS: AWS End User Messaging + A2P 10DLC — machinery SHIPPED + ARMED,
  waiting on the first real carrier registration.** `SMS_DRIVER=aws` is live;
  a clinic can send only when its own `a2p_status='approved'` (NO platform
  fallback BY LAW; each clinic gets its own brand + campaign + number). The
  consent spine (`lib/sms-consent.ts` — the ONLY writers of marketing opt-in;
  an opt-out is louder than an opt-in), E.164 (`lib/phone.ts`, honest-null),
  the patient-keyed frequency cap, segments math, inbound STOP/START, DLR
  receipts, the reminders' email-first channel choice, the included monthly
  budget — all shipped. **The honesty flip comes LAST**: nothing in product or
  marketing copy may promise texting until then. Full record: SUBSYSTEMS.md.
- **Insurance eligibility — LIVE for every clinic behind a self-serve ON
  switch** (`clinic_profile.insurance_enabled_at`; `canUseInsuranceTool` is
  the ONE predicate every surface asks). Stedi is the clearinghouse
  (`INSURANCE_DRIVER=stedi`, `STEDI_MODE=live` in prod since 2026-10-07, BAA
  executed); a live check needs the practice's NPI (`clinic_profile.npi`) and
  rides a 200-check monthly allowance (`INCLUDED_MONTHLY_INSURANCE_CHECKS`,
  fail-open); a carrier NAME is not a payer (the payer PICKER); every dollar
  part is nullable BY LAW (never a number the payer did not state); the
  record remembers the card (`patient.insurance_detail`, trusted only while
  it matches the flat policy number); the printable verification sheet, the
  full breakdown (billed per check), discovery (no-card fallback, its own
  20/month allowance), the payer notebook. **Checks stay MANUAL — owner
  ruling 2026-10-02** (no automatic pre-visit verification without a
  re-ruling). Pure `lib/insurance-eligibility.ts` + `lib/stedi-eligibility.ts`;
  service `lib/services/insurance-eligibility/`. Full record: SUBSYSTEMS.md.
- **PMS: NexHealth Synchronizer (LIVE, THE one door — the self-serve Open
  Dental path was REMOVED 2026-08-19; OD-direct code stays inert).**
  `lib/nexhealth.ts` + `lib/services/pms/nexhealth.ts`; every call metered
  (`pms_api_usage`, 60/day budget, fail-open), ~2h cadence; write-back v1 OFF
  by default (the platform bind card flips it); REAL SLOTS on the public site
  + portal only (`lib/services/booking.ts`). The clinic-facing door is
  `/integrations/pms`'s connect-request form (`lib/pms-link.ts` is the one
  read of connected / pending / none).
- **Deployed on AWS App Runner** (`us-east-1`); canonical
  `https://www.dreamcreatestudio.com`; clinic sites at
  `{slug}.dreamcreatestudio.com` + custom domains (CloudFront tenants). Merge
  to `main` auto-deploys.

## Repo layout

```
app/
  (default)/         Authenticated app surface — most modules; page bodies
                     branch on getTenantContext().tenantType
  (double-sidebar)/  /inbox + /messages (two-pane surfaces)
  (auth)/            signin / signup / reset-password / accept-invite
  (onboarding)/      4-step onboarding → clinic org + no-card trial (NO Stripe
                     call at signup); /welcome AI interview
  (marketing)/       Public B2B site at the root of www
  (portal)/          Patient portal /patient/* — clinic-branded chrome
  (partner)/ (partner-accept)/ (preview)/
  site/[slug]/       Public clinic sites — MULTI-TEMPLATE (modern · cosmetic ·
                     pediatric · hometown · established · hometeam). Page
                     SHELLS own every read/SEO/gate and dispatch typed props
                     to the active template's renderers. Fonts via runtime
                     <link>, NOT next/font (build env can't reach Google)
  r/ w/ c/ b/ g/ e/ h/ n/ i/ d/   Token-IS-auth patient/prospect landings
  api/               auth · webhooks (stripe, stripe-connect, gmail, resend,
                     sms) · 23 CRON_SECRET-gated /api/cron/* routes ·
                     /api/admin/* (migrate, resync-demo, redrive, read-check)
                     · oauth/connect · token publics · /api/version

lib/
  db/schema/         auth.ts, platform.ts, clinic.ts (bulk), domain.ts, …
  db/migrations/     drizzle; 0000–0180 applied to prod (auto-apply on deploy)
  auth/              server.ts, client.ts, context.ts (getTenantContext,
                     requireTenant/requireRole/requirePartner)
  services/          ~200 server-only modules — one per entity/subsystem
                     (pms/ the provider layer; demo-clinic/ the seeder)
  modules/           Sidebar registries per tenant type
  integrations/      catalog.ts · resolve.ts · bundles.ts
  site-templates/    THE template system (types, catalog, registry, resolve,
                     palettes, manifest); renderers in
                     components/clinic-site/templates/<id>/; the conformance
                     harness auto-enrolls every registered template
  types/             Client-safe types/enums/registries
  ui/encodings.ts    THE semantic tone/glyph/aging registry
  clinic-timezone.ts / format-datetime.ts   The clinic-tz helpers (law below)
  run-action.ts      THE one home for runAction (law below)
  email.ts · stripe.ts · zernio.ts · trial.ts · inbound-email.ts

components/ui/       dashboard-shell.tsx (every authed layout; below lg the
                     sidebar is an OFF-CANVAS drawer — inert when closed),
                     the v2 primitives (PageHeader, ActionButton, StatusPill,
                     FilterChip, GlyphCluster, EncodingLegend, EmptyState,
                     BulkBar, KpiStat, FlashToast, ProgressRing) + charts/
                     (THE chart kit, Recharts — no hand-rolled polylines)
middleware.ts        Auth gate + public allowlist + {slug} subdomain rewrite +
                     custom-domain host→slug + apex/app. → www
tests/               Vitest (happy-dom), ~940 files / ~10,400 tests
e2e/                 Playwright suite (pnpm test:e2e; docs/E2E.md)
scripts/             db-migrate.mjs + resync-demo.mjs (container boot),
                     setup-cron-schedules.sh (EventBridge), review-gate.mjs
```

## Multi-tenancy model

- `organization.type: 'platform' | 'clinic'`; `member.role: 'owner' | 'admin'
  | 'member' | 'patient'`; `session.activeOrganizationId` is the active org.
- `getTenantContext()` (`lib/auth/context.ts`) resolves every request into
  `{ tenantType: 'platform'|'clinic'|'patient'|'partner', role, organizationId,
  patientId, isDemo, billing/trial state, … }`. Precedence: demo cookie
  (platform admins) → active-org membership → first membership → partner
  derivation. **Partners** are NOT org members (`requirePartner()` reads
  `referral_partner.user_id`).
- Every tenant-scoped table carries `organization_id`. **Every read filters by
  it, every insert sets it** — `tests/tenant-scoping/`.
- `lib/services/tenant-nav.ts` is THE one resolver of the sidebar (and ⌘K):
  the day-one six + what the practice turned ON (`*_enabled_at` switches,
  `lib/feature-switches.ts`; `FeatureGate` renders the intro while off; the
  doors a person closed stay closed, `doors_closed`).
- **Platform org**: `Dream Create` (slug `dream-create`), owner
  `dustin@dreamcreateweb.com` (`platformAdmin: true`). **Demo mode**: "View
  as clinic" sets a `demo_context` cookie; the demo clinic ("Dream Dental",
  slug `acme-dental-demo`) auto-resyncs on every deploy.

## Timezone rules (critical — the server runs in UTC)

Clinics live in US timezones (`clinic_profile.timezone`, default
`America/New_York`). Two hard rules:

1. **Any time string built server-side** must format against the clinic tz —
   `formatClinicDayTime`/`formatClinicTime`/`formatClinicDayHeader`/
   `formatClinicDateTime` (`lib/format-datetime.ts`, they REQUIRE a tz), with
   the tz from `getClinicTimeZone(orgId)` or `sender.timeZone`. A bare
   `toLocaleString` on the server renders 1 PM Central as 6 PM.
2. **Any "today"/day-window/month/birthday computed server-side** uses
   clinic-local boundaries — `clinicDayStart`/`clinicWeekStart`/
   `clinicMonthStart`/`clinicLocalDate`/`clinicSamePointLastMonth`
   (`lib/clinic-timezone.ts`), `clinicDayKey`, and the birthday helpers in
   `lib/dates.ts` keyed on a day key — never `new Date()` arithmetic.

Public/patient-facing slot times are clinic-local by law in
`lib/services/booking.ts`. Client components format in the viewer's browser.

## Demo-org data rules (critical — real patients exist in the demo org)

`lib/services/demo-clinic/` anchors every seeded artifact to the 15 personas
**by identity** (`getPersonaAlignedPatientIds`), never by position or
arbitrary query; a missing persona → skip the seed. New seeded artifact types
carry a recognisable marker and extend `cleanupMisattributedDemoArtifacts`.

## Module status snapshot (clinic dashboard)

All modules are live; there are no `status:'soon'` placeholders (a test holds
"coming soon" at zero across the dashboard, the public site and the portal).
Long-form rows: docs/SUBSYSTEMS.md. History per module: docs/HISTORY.md.

| Section | Module | Path | Notes |
|---|---|---|---|
| Daily | Overview | `/dashboard` | Morning huddle; clinic-tz windows; PMS-sourced numbers branch on `getPmsLink`; the MTD trend compares against the same point last month. |
| Daily | Dream Team | `/dream-team` | The AI staff: the sign-here stack, the take-it-back grants, Cycles, the veto runway, Goals, Sandman, the roster. Spec: docs/ai-operations.md. |
| Daily | My Day | `/my-day` | Per-staff cockpit + the opt-in morning digest (`lib/morning-after.ts`). |
| Daily | Messages | `/messages` | Unified patient inbox (in_app + email + inbound SMS); receipts; AI draft; scheduled send (a failed send alerts its scheduler); snooze (resurfaced by cron); `thread_assigned`; the `oldest_unanswered` sort; the SUPPORT thread to Dream Create (`/messages/support`, platform-authored messages render as "Support" BY CONTRACT); activity markers never bump unread. Gmail mailbox at `/inbox`. |
| Daily | Appointments | `/appointments` | Agenda by clinic-local day; the drawer (confirm/reschedule from real slots with the visit's real duration/cancel with the honest notice/no-show/mark done → "Book their next visit"); the New-booking drawer is a patient SEARCH; a website booking emails the desk (`online_booking` urgent). |
| Daily | Patients | `/patients` | Relationship record: glyphs, filters, saved views, tags, documents, merge, CSV import/export; "lapsed" means the clinic's own threshold. |
| Daily | Follow-ups · Leads · Intake Forms | `/followups` `/leads` `/intake-forms` | Board + smart rules; contact-form triage with convert-then-book; intake v2 (OCR, AI summary, auto-send, Spanish, packets) — OFF until chosen (`patientFacingIntakeOpen` is the ONE gate). |
| Daily | Insurance | `/insurance` | The eligibility tool (see Stack). |
| Growth | Growth workspace | `/growth` | Hub (new-patients scoreboard + the reactivation funnel) → outreach, campaigns, audiences, reviews (Google-first auto-loop), social, analytics. Funnels count distinct PEOPLE. |
| Website | Website workspace | `/website` | Hub → Studio (`/website/editor`, EditBridge, every save via `runAction`), Content (rail + one editor), Design (template gallery with live frames; media slots per template), Pages, Forms, Blog, SEO, Careers, Domain (the sweep cron finishes it), Share. Draft→Publish (`website_draft`). Financing widgets (docs/financing-providers.md — NO raw HTML/script ever). Service icons (`lib/service-icons.ts`, one renderer). |
| Business | Payments · Shop · Integrations | `/payments` `/shop` `/integrations` | The money workspace (online payments, collections, memberships); pure commerce; the catalog-driven marketplace (PMS door = the connect-request form; texting door = `/integrations/sms`). |
| Settings | Settings | `/settings` | 13 focused pages; `/settings/clinic` is the identity-only Business profile (`updateClinicProfile` is identity-only BY CONTRACT). |

**Platform tenant** (`lib/modules/platform.ts`): overview (MRR, activation,
the Guardian, the shared brain), clinics (+ managed provisioning; the one
read of a clinic's standing is `lib/platform-clinic-status.ts`), client
messaging, subscriptions, partners, sales pipeline, prospecting ("The
Hunter" — platform-global, say "prospect" never "lead"; SUBSYSTEMS.md),
first-week cockpit, service library, blog, developer, settings.

**Patient tenant**: the clinic-branded portal (`app/(portal)/patient/*`):
visits, reschedule/cancel with notice windows, booking, forms, billing (PMS
balance + online payments + plans + membership), survey, records, messages,
family access. Tokens in `components/patient-portal/ui.tsx` (PORTAL_*). The
front door is a setting (`portal_settings.login`, external portals allowed —
the dead-link law: never an external URL that is not valid http(s)).

**Public clinic sites** (`app/site/[slug]/`): home, services, new-patients,
insurance, payment-financing, dental-plans, about/team/blog/careers/faq,
booking, intake, shop, the token landings. Brand-derived palette
(`lib/clinic-site-theme.ts`, WCAG-checked), JSON-LD, per-clinic sitemap.

## Key subsystem reference (short)

- **Trial**: no-card 7-day full trial (`lib/trial.ts`); **expiry kills
  everything** (owner ruling): `lib/services/billing-state.ts` — crons skip,
  the site shows coming-soon, the portal goes phone-first; paying revives.
- **The voice**: `lib/services/proposals.ts` (file / approve-claim / execute /
  narrate ONCE under the capability) + `proposal-generators.ts` (hourly; AI
  types skip when AI is off) + `standup.ts` + the Approval Inbox. Executors
  one per slice; non-atomic executors carry a `payload.done` map. Registry +
  grantability in `lib/autonomy.ts`; `GRANTABLE_CAPABILITIES` is the only
  thing a clinic can hand over; `countOpenProposals` excludes granted ones.
- **The Guardian + the shared brain**: `lib/guardian.ts` (five states, the
  stall against the practice's OWN prior month), the alert memory, the
  AUDIENCE LOCK (ships locked to the owner; every read floors at
  'platform'), `recordEngineFailure` (the registry in
  `lib/services/engine-failures.ts`, one strike per producer per day);
  `lib/shared-brain.ts` learns the send hour under three floors, inert until
  the floors clear, with an exploration arm.
- **Search**: ⌘K (`lib/services/global-search.ts`) searches and ACTS.
- **Crons — 23 routes, `Authorization: Bearer $CRON_SECRET`**, every one a
  `JOBS` entry in `scripts/setup-cron-schedules.sh` (the deploy re-runs it;
  `tests/cron-schedule-parity.test.ts` fails CI otherwise): pms-sync,
  send-reminders, send-scheduled-campaigns, auto-send-reviews,
  customize-services, sync-google-reviews, sync-gbp, retention-automations,
  followup-rules (+ snooze resurfacing), daily-digest (+ the Monday standup,
  the activation reconcile), trial-reminders, prospect-discovery/-enrich/
  -outreach, domain-renewals, generate-proposals, guardian, learn-defaults,
  sms-registration, grader-nurture, custom-domains (15m).

## Conventions (the laws)

- Stay on `main`; merge PRs the assistant opens; no long-running branches.
- Service modules in `lib/services/` are `import 'server-only'`; client-safe
  types in `lib/types/`. Server actions live next to their ONLY consumer's
  route (`actions.ts`; `admin-actions.ts` platform-admin with a role check).
- All authenticated layouts go through `<DashboardShell>`. After mutating a
  session field navigate with `window.location.assign()`.
- Stripe / DB / better-auth / Zernio clients are lazy Proxies so `next build`
  runs keyless.
- **Timezone rules above are law.**
- **Tenant voice.** Any surface serving two tenants branches EVERY
  reader-addressed string — the platform owner never reads "your patients".
- **Orientation.** Top-level module pages carry the `<Group> · <clinic name>`
  eyebrow; workspace sub-pages carry a way back to their hub.
- **Demo persona anchoring** (above) for every seeded artifact.
- **NO PLAN GATING.** One plan; access to the app IS access to the whole app.
  `requirePlan`/`planAllows`/`minPlan` are GONE; no upsell cards; no tier
  words in copy or the chrome. Still legal: add-on entitlements, billing
  STATE walls, `requiresBundle`, the `planTier` column.
  `tests/settings/no-plan-gating.test.ts` fails CI if a gate creeps back.
- **The PMS link has ONE read** — `lib/pms-link.ts` / `getPmsLink` (connected
  / pending / none). Any number that comes from the PMS says where it would
  come from; a practice with no PMS is never shown a PMS promise.
- **The platform's read of a clinic's standing has ONE home** —
  `lib/platform-clinic-status.ts` over `resolveTrialState`.
  `subscription_status` keeps 'trialing' after a trial runs out; reading the
  column alone counts a walled clinic as live.
- **Every user-supplied value in an HTML email goes through `escapeHtml`.**
  `sendNotificationEmail` adds "Hi {first}," only when the body does not open
  with a greeting (`bodyOpensWithGreeting`).
- **"Coming soon" is held at zero** on the dashboard, the public site and the
  portal (`tests/activation/no-coming-soon.test.ts`; the vocabulary covers
  "coming next/later", "arriving soon", "on the way", "in the works"). Every
  `<EmptyState>` carries a door (`empty-state-doors.test.ts`). No fake
  content: every placeholder reads a real column; the demo seeder populates
  every column shown; lorem / stock names / stock images at zero.
- **Family-safe identity.** Any flow that attaches inbound activity to a
  patient by contact info must ALSO name-match (`namesLooselyMatch`,
  `lib/patient-identity.ts`; public flows via `resolvePublicPatient`); a
  mismatch mints a separate "likely family" record. Every cancel stamps
  `cancelledVia` (`lib/cancel-actor.ts`; the dialog says the true notice).
- **A client component never bare-awaits a server action.** Next refuses an
  action id from another build by THROWING, and every merge is another
  build. Wrap it in `runAction` from `lib/run-action.ts` (THE home; the
  Studio file pre-binds its own stale copy), classify with
  `isDeploymentSkewError` (`lib/deployment-skew.ts`), reset busy in a
  `finally`, offer Refresh never retry. `tests/ui/no-bare-await.test.ts`
  (parser-based, `app/` + `components/`) holds today's offenders in a DATED
  ALLOWLIST per file that may only shrink: wrap an await in a listed file →
  edit its count DOWN (remove at zero) and lower `ALLOWLIST_CEILING`.
  `/api/version` + `BuildWatch` prompt a stale tab to refresh.
- **The dialog law.** A confirm dialog is awaited BEFORE a transition —
  awaited inside one, React 19 holds the render and the click dies.
- **Unlayered CSS beats every utility.** Hand-written rules that set a
  property a utility may also set go in `@layer components` in
  `app/css/style.css`. `.grain { position: relative }` once put every phone
  dashboard 256px to the right of an invisible drawer.
- **Shared assets over one-off values.** Portal tones in
  `components/patient-portal/ui.tsx`, site surfaces in
  `components/clinic-site/tokens.ts`, brand tints via `brandTint()`; the
  a11y guards fail CI on a local colour. The `ink-*` ramp INVERTS in dark:
  a bare `text-ink-500` is right in both themes; `gray-*` needs its pair.
- **Public-site photos go through `<SiteImage>`** (sized srcSet through
  `/_next/image`; the host/width tables mirror `next.config.js`); uploads
  capped at 2560px; HEIC refused in words that name the fix.
- **For UI / public-site / font / next-config PRs run `pnpm build`**, not
  just tests. `next/font/google` is banned (runtime `<link>` instead).
- **Vertical slices**: schema + service + UI + tests in one PR. Tests before
  merge — the FULL `pnpm test` (~7 min; the repo-wide guards only run in the
  full pass). CI runs typecheck + lint + the suite + e2e on every PR, and the
  deploy runs the gate before shipping. New raw SQL or a new write to a
  constrained column needs a boundary test that renders the real statement
  through drizzle's dialect (`tests/journey/autonomy-sql.test.ts` pattern).
- **The review gate's intake.** A new test that grades a whole product tree
  (a walker over `app/`/`components`/`lib`, a palette grader, a derived-list
  e2e spec) is a BLOCKING-ASSERTION CLASS and must be registered in
  `INTAKE_RULES` in `scripts/review-gate.mjs` with its class stated;
  `tests/guards/review-gate.test.ts` derives the list and fails CI otherwise.
- **The phase-audit gate.** No transformation phase or major slice is DONE
  until the `phase-audit` workflow returns a CLEAN round; HARD CAP 3
  discovery rounds, then a retrospective + a direct self-sweep + ONE
  verification round. Judge the CHARACTER of a round's findings, not only the
  count (a phase whose remaining defects are confined to the correction layer
  is done). Certificates in docs/AUDITS.md. Sweep a named class by grepping
  its vocabulary, not by walking the files a fix touched.
- **The North Star is a convention.** DESIGN.md's "the employee, not the
  tool": the design test is "does this ask the clinic to operate something,
  or does it do the job and report?" New capabilities ship as proposal
  types + ledger entries, never as pages to operate. Journey stage is
  DERIVED, never hand-stamped; "new patients" means SEATED.
- Voice: warm, plain, anti-shame ("3 still need a text", never "3 records
  pending confirmation"). See DESIGN.md.

## Deployment & operations

- **Prod**: App Runner service `dreamcrm` (us-east-1), ECR `:latest`, VPC
  connector → private RDS; health `/api/health`. **Deploy = merge to `main`**
  (GitHub Actions → CodeBuild → ECR → App Runner, ~5 min; then a few minutes
  of rollout — `/api/version` changes when the new build serves).
- **Migrations auto-apply on boot** (`scripts/db-migrate.mjs`; a failure keeps
  the previous version serving). Latest applied: **0180** (insurance
  discovery). The next number is **0181**. Workflow: edit the schema,
  `pnpm db:generate`, pin with a `tests/migrations/*.test.ts`, commit. The
  per-migration history is in docs/SUBSYSTEMS.md.
- **Demo auto-resync on boot**; **secrets** in Secrets Manager
  `dreamcrm/app-secrets` (changes need a redeploy); **DNS** at name.com (`www`
  canonical, `*` wildcard → App Runner; custom domains = CloudFront tenants,
  runbook `docs/custom-domains.md`); CloudWatch alarms → SNS
  `dreamcrm-alerts`. AWS account `952078552817`. App Runner closes to new
  customers Apr 2026 — an ECS move is planned.
- **Vercel previews cannot reach the database** (VPC-only RDS): a 500 on a
  preview is pre-existing, compare against main's preview before calling it
  a regression.

## Open items (priority order)

-3. **THE FIRST WEEK / ACTIVATION PROGRAM** — all eight slices SHIPPED,
   phase audit CLOSED 2026-10-07. The laws live in docs/ACTIVATION.md; read
   it before touching any first-run surface.
-2. **THE DREAM TEAM / AI OPERATIONS PROGRAM** — building in its own lane;
   docs/ai-operations.md first. The generator lane's registry convention: one
   file per generator/executor under `lib/services/proposal-generators/` and
   `proposal-executors/`, registered in `lib/autonomy.ts` and seated on a
   roster specialist (`tests/overview/dream-team-roster.test.tsx` holds the
   parity).
-1. **THE RELEASE PROGRAM** (docs/RELEASE.md) — the program of record.
0. **THE TRANSFORMATION ("the employee, not the tool")** — Phases 1–4 shipped
   and audited (certificates in docs/AUDITS.md); limbs 1–2 (the content
   calendar, the empty chair) shipped. The full phase narrative, the
   load-bearing decisions and the autonomy ladder's rules are in
   docs/SUBSYSTEMS.md — read them before touching the proposal spine.
0c. **THE DEEP DEV CYCLE (2026-10-26 →)** — 75 small findings shipped in two
   PRs, four feature slices in a third; 59 planned slices remain (the plan is
   in docs/HISTORY.md's part-3 entry and the session record). Build them
   one or two at a time, never a parallel fan-out.
1. **ROTATE / REVOKE secrets shared in chat** (owner's action item; identify
   by their LAST FOUR in the console): Stripe `rk_live_…` (revoke); AWS keys
   …H5M55 / …OJGLOI (rotate), …4CWFS (dead, delete); Resend `re_BZDw…` (mint
   fresh, delete the dead `re_T8fyc…`); the Stedi LIVE key …AYEV9 (rotate,
   re-run `scripts/setup-stedi-aws.sh --mode live --confirm-baa`); the AWS
   key …JBXN on the `Claude` IAM user (scope down or rotate).
2. **SMS** — waiting on the first real carrier registration; then the SNS
   two-way wiring together with SelfManagedOptOuts; the honesty flip LAST.
3. **OD vendor portal approval** — platform-ops insurance only.
4. Misc deferred: Zernio review webhooks, FB reply, per-staff booking
   widgets, 2FA, per-location booking; the doubled campaign 'sent' rows'
   data repair (`scripts/repair-double-sent-campaign-events.sql`, SELECT
   first — every reader already dedupes).

## Working in a new session (Claude Code on the web)

- Deps auto-install via the SessionStart hook; `pnpm dev` / `test` /
  `typecheck` work immediately. The hook self-heals a stale container
  snapshot (HEAD silently behind origin/main). Push early, push often — a
  container reset loses everything unpushed, including worktrees.
- A fresh container's clone can be SHALLOW; `tests/guards/rulebook-state.test.ts`
  needs history — `git fetch --unshallow origin` before a full gate.
- `rm -rf .next` if `pnpm typecheck` errors on `.next/types/validator.ts`
  after a route move. `CHROME_PATH=/opt/pw-browsers/chromium` for Playwright
  scripts; `pnpm test:e2e -- --skip-build --spec <file>` reuses a build.
- GitHub goes through the MCP tools (`gh api` for the REST endpoints);
  deploys are merge-to-main; never paste keys into chat.
- **Agent economy**: every subagent start pays for this file. Keep it lean;
  brief agents with file paths, not pasted code; run tests with the dot
  reporter and print failures only; prefer Sonnet for well-specified work.

## Useful commands

```bash
pnpm dev                  # local dev
pnpm build                # next build (REQUIRED for UI/font/config changes)
pnpm db:generate          # drizzle-kit generate (after schema changes)
pnpm typecheck            # tsc --noEmit
pnpm lint                 # the accessibility gate (jsx-a11y; CI runs it)
pnpm lint:prune           # shrink eslint-suppressions.json after fixes
pnpm test                 # vitest run (~10,400 tests; ~7 min on CI)
pnpm test:e2e             # the Playwright suite (docs/E2E.md)
```

## Test account

- `dustin@dreamcreateweb.com` — platform admin (Dream Create org owner).
  Password rotates via Settings → Account.
