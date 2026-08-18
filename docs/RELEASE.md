# THE RELEASE PROGRAM — beta → 1.0

Owner directive (2026-08-16): "we have every feature we plan to offer
currently, so now we can start polishing, refining, and getting the app to
the full release point where I can pivot to marketing instead of building."

This doc is the program's memory: the phases, the release criteria, every
sweep's charter, and the running defect ledger. It is modeled on how a
large agency stabilizes a product for GA — then re-shaped around what we
actually have: one owner, one AI development partner, and the ability to
run dozens-to-hundreds of parallel review agents in a single pass.

---

## Part 0 — The 1.0 definition (scope lock)

Ratified 2026-08-17. This is what 1.0 IS. Anything not on this list is
either an accepted exclusion (below) or post-1.0 (`docs/POST-1.0.md`). The
freeze rule is in force: new feature ideas land in POST-1.0, not here.

### What ships in 1.0 — the feature list as it stands

The product is a multi-tenant SaaS for dental clinics with four personas
(below). 1.0 is the current live surface, no more and no less:

- **Clinic dashboard.** Daily (Overview huddle · My Day · Messages ·
  Appointments · Patients · Follow-ups · Leads · Intake Forms), Growth
  (the acquisition/reactivation hub + outreach/reviews/social/analytics),
  Website (the Shopify-style hub + Studio editor, multi-template public
  sites, Draft→Publish, custom domains, announcement bar), Business
  (Payments · Shop · Integrations), Settings (13 focused pages).
- **The employee, not the tool.** The Phase 1–4 transformation is in
  scope: journey-stage resolver + Action Ledger + autonomy ladder; the
  proposal spine and its executors; the Approval Inbox sign-here stack +
  weekly standup; the Guardian + shared brain; the Phase-5 limbs shipped
  (content calendar, empty chair). Governed by the North Star doctrine.
- **Platform tenant.** Dream Create's own cockpit: clinics + managed
  provisioning, client messaging, MRR/subscriptions, partners, sales
  pipeline, and the full prospecting engine ("The Hunter" — discovery →
  enrichment → outreach → call mode → self-booking demos → convert).
- **Patient portal.** Clinic-branded: visits, reschedule/cancel, booking,
  forms, billing, in-portal survey, records, messages, family access,
  magic-link auth, per-clinic feature toggles.
- **Referral-partner portal.** Invite acceptance, referral tracking,
  Stripe Express payouts.
- **Public clinic sites.** Multi-template, brand-derived palettes, the
  token-IS-auth landings (r/ review, c/ confirm, w/ fast-pass, b/ balance,
  d/ demo booking, i/ intake, n/ …), booking with real PMS slots.
- **The integrations that are LIVE.** Resend email (+ inbound replies),
  AWS S3 storage, Anthropic AI surfaces, Zernio (GBP + social), NexHealth
  Synchronizer PMS (import + write-back v1 + real-slots), Stripe platform
  billing + Connect, GBP listing-truth write-back.

### The four personas (the audit matrix's rows)

1. **Clinic staff** (owner/admin/member) — the dashboard.
2. **Platform owner** (Dream Create) — the platform tenant + demo.
3. **Patient** — the portal + public booking/intake/pay.
4. **Referral partner** — the partner portal.

Plus the **public visitor** (unauthenticated) on clinic sites and the
token-IS-auth landings — a fifth column in the journey matrix even though
it is not a logged-in persona.

### Known-and-accepted exclusions (ship 1.0 without these)

These are KNOWN, DECIDED, and not launch blockers. Each has a home in
`docs/POST-1.0.md` or an open item in CLAUDE.md:

- **SMS is machinery-complete but dark.** Sends unlock per-clinic on the
  first real A2P carrier approval; the honesty flip (marketing pages,
  composer options) is deliberately LAST. 1.0 ships with texting built,
  armed, and truthfully presented as pending registration — not as a
  promised-but-broken feature.
- **Open Dental direct path** is built but blocked on OD vendor-portal
  approval. NexHealth already covers real-slot booking, so this is not a
  journey gap — it's a second PMS door awaiting a key.
- **Procedure-code-gated campaigns** (post-op, treatment-plan follow-ups,
  per-provider production analytics) — no procedure entity in PMS sync yet.
- **No E2E browser suite yet** — this is an R3 deliverable, not an
  exclusion; called out here so R0's "what 1.0 IS" is honest about the
  current test posture (happy-dom unit/integration only).
- **HIPAA/BAA posture is undocumented** — S8 produces the honest write-up;
  the positioning decision is the owner's (Part 4, point 4).
- Webhooks-at-scale, phones territory (missed-call text-back), Apple/Bing
  presence, per-staff/per-location booking, 2FA, patient-view audit log —
  all POST-1.0.

### The severity bars (restated here as the ratified scope-lock version)

- **S0** — data loss, security hole, cross-tenant leak, or money computed/
  moved wrong. Blocks EVERYTHING; fix before any other work proceeds.
- **S1** — a core journey broken for any persona (can't book, can't pay,
  can't sign in, a dead-end in a golden path). Blocks launch.
- **S2** — polish, copy, edge-case, non-blocking UX. Fix in R2 burn-down
  if cheap; else the post-1.0 ledger.
- **S3** — nice-to-have. Post-1.0.

R0 is CLOSED with this section. R1 (the eight sweeps) is the next phase;
its findings populate Part 5.

---

## Part 1 — How agencies do it (the model we're adapting)

A serious agency moves a feature-complete product through five gates:

1. **Scope lock / feature freeze.** A written definition of what 1.0 IS.
   New ideas go to a post-1.0 backlog, not the release. Severity bars are
   agreed in advance (what blocks launch vs. what ships-with-known-issue).
2. **Stabilization.** Full-regression passes, exploratory QA cycle per
   module, bug triage with a rising fix bar (early: fix everything; late:
   P0/P1 only — churn is itself a risk near a release).
3. **Hardening.** The non-functional work: security review, performance
   and load, accessibility, failure-mode drills (every third party down,
   one at a time), data-integrity drills (backup/restore actually
   exercised, not assumed), compliance sign-off.
4. **Dress rehearsal + beta.** Real users on the release candidate with
   instrumentation and a feedback loop; a scripted end-to-end onboarding
   run by someone who didn't build it; runbooks and on-call rehearsed.
5. **Go/no-go + launch + watch.** A checklist review against the written
   criteria; launch; a heightened-monitoring window with a rollback plan.

The kinds of tests they run, mapped to our reality:

| Agency practice | Our state today | Gap |
|---|---|---|
| Unit/integration regression | 6,500 tests, ~650 files, CI-gated | Healthy |
| E2E browser journeys | **None** (happy-dom only) | **The biggest single gap** |
| Cross-device / mobile QA | Ad-hoc (owner's phone) | Needs a pass |
| Accessibility | Targeted CI guards (legibility floor, tone contract) | No full WCAG pass |
| Performance/load | Never run | Needs a pass (t4g.micro RDS!) |
| Security review | Tenant-scoping tests + conventions | No adversarial pass |
| Failure-mode drills | Never-throw laws + best-effort patterns | Never drilled end-to-end |
| Backup/restore drill | RDS snapshots exist | **Never actually restored** |
| Error tracking | CloudWatch logs + alarms | No aggregation (no Sentry-class) |
| Compliance | TCPA machinery built; DMARC etc. | HIPAA posture undocumented; no AI BAA |
| Beta program | 1 real clinic + demo | No structured cohort/feedback loop |

## Part 2 — Our superpower, and its budget

We can do in an afternoon what an agency does in a six-week QA cycle:
fan out parallel reviewers over every module × persona × failure-mode
cell. The repo already owns the machinery (the `phase-audit` workflow,
v2 shape) and the scar tissue (v1 once burned ~75% of a monthly quota in
one night; v2 exists so that never happens again).

**Budget rules for this program:**
- Mechanical sweeps (enumeration, matrix-filling, copy inventory) run on
  cheaper/lower-effort agents; judgment lenses (security, UX verdicts)
  run on the strong model. Findings are ALWAYS verified before entering
  the ledger (the phase-audit law: a finder's claim is not a defect until
  a second pass confirms it against the cited code).
- Sized rounds with hard caps, per the audit convention. Judge findings
  by CHARACTER, not count (the Phase-4 lesson: fixes are new code; zero
  is not a terminating condition — confined-to-the-correction-layer is).
- One sweep at a time reaches the ledger; the owner sees a plain-English
  digest after each, never raw agent output.

## Part 3 — The phases

### R0 — Scope lock + release criteria (1 session, mostly writing)
- Write the **1.0 definition**: the feature list AS IT STANDS, the four
  personas, the known-and-accepted exclusions (e.g. OD schedule-driven
  availability awaiting vendor approval; SMS honesty flip until first
  carrier approval; webhooks at scale).
- Write the **severity bars**: S0 data loss/security/tenant leak/money
  wrong (blocks everything), S1 a core journey broken for any persona
  (blocks launch), S2 polish/copy/edge (fix in burn-down if cheap,
  else post-1.0 ledger), S3 nice-to-have (post-1.0).
- Freeze rule: new feature ideas go to `docs/POST-1.0.md` (created
  2026-08-17, seeded from every doc's verified open threads). The North
  Star doctrine still governs fixes (no new consoles born in QA).

### R1 — THE GREAT AUDIT (the parallel sweeps; ~2-4 sessions)
Eight chartered sweeps, each producing verified findings into the ledger
(Part 5). Run order puts cheap-and-catastrophic first:

- **S1 Tenant & auth matrix (security).** Enumerate EVERY server action
  and API route; verify org-scoping, role gates, and the demo/patient/
  partner boundaries adversarially. Then the token-IS-auth public
  surfaces (r/, c/, w/, b/, d/) for guessability and cross-org reach.
- **S2 Money paths.** Stripe platform billing, Connect flows, payment
  plans, partner payouts, the trial→paid→past-due→expired lattice
  (including the new kill switch), refund/failure webhooks. Every path
  that moves or gates money, walked against its webhook truth.
- **S3 The four-persona journey audit.** Module × persona matrix (clinic
  staff / platform / patient / partner + public visitor): every core
  journey walked for logic breaks, dead ends, stale copy, empty-state
  honesty. This is the agency's exploratory QA cycle, parallelized.
- **S4 Resilience drills.** The outage matrix: each third party (Stripe,
  Resend, NexHealth, Zernio, AWS SMS, S3, the AI) × each consumer —
  verify the never-throw/best-effort laws actually hold and the Guardian
  sees what it should. Crons: overlap, partial failure, clock skew.
- **S5 Performance.** Page-weight budget on public sites (they sell),
  N+1 hunts on the heavy dashboards, DB index audit against real query
  shapes, cron runtimes vs their windows, the t4g.micro ceiling.
- **S6 Copy & voice.** Every empty state, error message, email template,
  and patient-facing sentence against the anti-shame voice + tenant-voice
  convention + "Reach Support" law. The 1.0 impression lives here.
- **S7 Accessibility.** Full-page passes (keyboard, contrast, focus,
  screen-reader landmarks) on the top journeys — booking, portal,
  Overview, the sign-here stack — beyond the existing CI guards.
- **S8 Compliance & data.** TCPA/CAN-SPAM posture verification against
  the built machinery; data export/deletion answers; the HIPAA-adjacent
  posture WRITTEN DOWN honestly (what we are, what we are not, the
  Anthropic-BAA question for AI features); retention defaults.

### R2 — Burn-down (sessions until the bar is met)
Fix by severity, full-suite gates every slice, sibling-sweep every fix
class (the standing self-sweep checklist from docs/AUDITS.md). Rising
bar: last week of R2 accepts only S0/S1 changes — churn is risk.

### R3 — Hardening deliverables (build, not just audit)
- **E2E browser suite** (the one genuinely new artifact): Playwright
  golden-path journeys — public booking, portal booking + cancel, staff
  day (confirm/complete/cancel), sign-here approve, onboarding path B,
  go-live lever — running against a local server in CI, tagged so the
  merge gate stays fast. This is the regression net for post-1.0 change.
- **Error aggregation**: a lightweight error-tracking surface (evaluate:
  Sentry vs CloudWatch Insights queries + alarm) so prod exceptions have
  ONE home with grouping, not log spelunking.
- **The restore drill**: actually restore an RDS snapshot to a scratch
  instance and boot the app against it. A backup that has never been
  restored is a hope, not a backup. Write the runbook from the drill.
- **Load sanity**: scripted concurrency against staging-shaped traffic
  (booking bursts, cron overlap) to find the t4g.micro ceiling before a
  marketing push does.
- Standing ops items folded in: AWS key rotation (owner's), the ECS
  migration decision (App Runner new-customer closure), uptime check +
  status posture.

### R4 — Dress rehearsal + beta cohort
- **The stranger test**: a fresh clinic onboarded end-to-end (path B,
  then a managed path-A invite) by following ONLY what the product says
  — every stumble is a finding. Owner plays the stranger; I watch logs.
- **Beta cohort**: 3–5 real practices (owner recruits; All About Smiles
  + Mammoth Spring are natural firsts), each with: NexHealth bound where
  applicable, SMS registration started (the first real carrier pass —
  a standing dependency for the honesty flip), and a weekly feedback
  loop the Approval-Inbox way: short, concrete, answered.
- Success criteria per beta clinic written BEFORE they start (e.g. "booked
  ≥1 real online appointment", "zero support-blocking incidents in 14
  days", "owner would recommend").

### R5 — Release candidate + go/no-go + launch watch
- RC tagged; 72h change freeze except S0.
- Go/no-go review against the R0 criteria — written, honest, kept.
- Launch = the marketing pivot. Heightened watch: the Guardian + alarms
  + a daily digest to the owner for the first two weeks.

## Part 4 — Owner decision points (none block starting R1)
1. **Spend appetite per audit round** (the sweeps are token-hungry even
   in v2 shape) — default: one sweep per session, digest between.
2. **Beta cohort recruitment** — who, when (R4).
3. **Error-tracking choice** (Sentry-class SaaS vs CloudWatch-native).
4. **The Anthropic BAA / HIPAA posture** — a positioning call as much as
   a legal one; S8 will produce the honest write-up to decide from.
5. **Timeline pressure** — the phases are effort-shaped, not date-shaped,
   until the owner pins a launch date.

## Part 5 — The defect ledger
(Populated by R1 sweeps. Format: `S# · severity · surface · one-line ·
status`. Verified findings only — a finder's claim is not a defect.)

### R1 · S1 sweep — Tenant & auth (2026-08-17)

Parallel finders enumerated every server action, API route, and cron; the
main loop re-verified each severity-level claim against the cited code
before it entered this ledger or got fixed. Findings below the S2 line were
reported by the finders but are NOT yet main-loop-verified — they are
R2 burn-down candidates, listed so nothing is lost, and are not asserted
as confirmed defects yet.

**Fixed this session (verified against code, tested):**

- S0 · `api/admin/seed-platform` · any `CRON_SECRET` holder could POST an
  email+password to reset that user's credential password and stamp
  `platformAdmin: true` → total platform-owner account takeover (PHI,
  Stripe, every clinic). The route's own comment said "run once, then
  remove"; it was still deployed. · **FIXED** — route + its middleware
  allowlist entry deleted (bootstrap already done in prod).
- S1 · `(onboarding)/submitOnboarding` · the org-reuse path had no role
  check, so a `role='patient'` or plain-`member` session carrying a clinic
  `activeOrganizationId` could rewrite the practice's identity (display
  name, brand color, address, timezone). · **FIXED** — owner/admin guard on
  the reuse path (mirrors `requireWelcomeClinic`); create path already
  server-mints role `owner`. Regression tests added.
- S1 · `messages.createConversation` · trusted client-supplied
  `participantIds`, letting any authenticated user (incl. a patient) create
  a conversation targeting arbitrary user ids and inject messages into a
  platform admin's / another clinic's inbox — cross-tenant message write. ·
  **FIXED** — recipients authorized server-side (`allowedRecipientIds`):
  non-platform callers reach only their own org's staff; the generic
  contact picker (`listMessagableContacts`) now matches, replacing the
  all-users `listCommunityUsers`. Regression tests added.
- S1 · `ecommerce/{customers,orders,invoices}` actions · only `requireTenant()`,
  which a patient-role member passes, so a patient could delete/edit the
  clinic's CRM/leads, orders, and invoices via direct action POST. ·
  **FIXED** — positive `requireStaff` gate (`tenantType clinic|platform`).
- S2 · `marketing.requireClinicStaff` · gated by subtraction
  (`role==='patient'`), which still admitted the partner persona
  (contained to the partner's own id-namespace, no cross-tenant reach). ·
  **FIXED** — switched to the positive `clinic|platform` form.
- S2 · `api/inbox/stream` · `requireTenant()` with no role check, so a
  patient-tenant member could open the SSE stream and receive every
  `inbox_events` NOTIFY for their clinic's staff Gmail mailbox (metadata
  only — orgId/kind/messageId/threadId/actorKind/at, no PII, no
  cross-tenant reach). Sibling `realtime/stream` already guards this. ·
  **FIXED** — reject `tenantType !== 'clinic'` after the tenant gate.

**Reported by the S1 sweep — R2 burn-down candidates (pending main-loop verify):**

- S2 · `patients.adjustLoyaltyPointsAction` → `loyalty.adjustLoyaltyPoints` ·
  no patient-in-org guard before the ledger insert (orphan row in caller's
  own org; no cross-tenant read). · **FIXED** (patient-in-org guard).
- S2 · `shop.updateShopConfigAction` · accepts `platformFeeBps` in the
  client patch → a clinic owner could zero Dream Create's Connect
  application fee on their own charges. · OPEN.
- S2 · patient-portal `loyalty` redeem + `payment-plans` propose · read-then-
  insert TOCTOU (concurrent double-spend / two open plans). · OPEN.
- S2 · portal message attachments (`sanitizeAttachments`) · accept arbitrary
  `http(s)` URLs (no host allowlist) → staff-inbox tracking-pixel/IP-leak;
  non-TLS accepted. Same class: insurance-OCR URL (no SSRF — Anthropic
  fetches — but burns the OCR allowance). · OPEN.
- S2 · `patient-followups` `assignedUserId` (create/update/bulk) · assignee
  not verified as an org member (integrity only). · **FIXED**
  (`assertAssignableInOrg`).
- S2 · all 25 `CRON_SECRET` routes · non-constant-time `!==` secret compare
  (theoretical timing oracle) + 25× copy-paste (drift risk); a shared
  `lib/cron-auth.ts` with `timingSafeEqual` fixes all. · OPEN.
- S2 · `api/internal/custom-domains` · public + cacheable enumeration of
  every custom-domain clinic (data already public; convenient scraper). · OPEN.
- S3/housekeeping · `uploadPatientDocumentAction` writes the S3 blob before
  the patient-in-org check (forged id orphans a blob; no row, no access);
  `enterDemoMode` doesn't validate the target org (self-only, re-validated
  downstream). · OPEN.

Partitions audited CLEAN (no defect): appointments, patients, leads,
intake-forms, followups, my-day, search, growth (outreach/reviews/social),
website (blog/careers/forms/seo), settings (all pages incl. team/clinic/
practice/locations), payments (collections/memberships/online), shop +
coupons, billing/activate, integrations, partner portal + accept, the
platform admin-action files (partners/prospecting/service-library/invoices/
customers admin) — every client-supplied id was traced into its service and
confirmed paired with `organizationId` in the SQL. Cron + admin routes are
uniformly fail-closed on an unset/empty secret with no pre-auth work.

The PUBLIC-surface partition (token-IS-auth landings r/c/w/b/d/i/n, the
public `site/[slug]` actions, and the webhook/OAuth routes) came back with
NO S0/S1 — token mints are 128–144-bit random, mutations gate on their
row's status (replay-safe), every webhook verifies its signature/secret
BEFORE any effect (Stripe constructEvent, Svix, SMS shared-secret, Gmail
OIDC), all three cookie-based OAuth callbacks bind the connected account to
the session's own org via a state-nonce + `requireTenant()` org match, and
every public-site write derives its org from the slug, never a client
`orgId`, with `namesLooselyMatch` family-safe identity. The lone finding
was the inbox/stream persona gap above (S2, fixed).

**S1 sweep CLOSED (2026-08-17):** 1 S0 + 3 S1 + 2 S2 fixed and verified;
the remaining S2/S3 items are R2 burn-down candidates. No open S0/S1.

### R1 · S2 sweep — Money paths (2026-08-17)

Three parallel finders (platform billing · Connect + payouts · payment
plans/collections/MRR); every finding re-verified against the cited code.
Both billing/Connect partitions found NO S0/S1 — fund routing, fee math
(integer cents on the discounted subtotal), webhook signature-gating,
accrual idempotency (unique `stripe_invoice_id`), and Connect-OAuth org
binding are all correct. The payment-plan charger was the exception.

**Fixed this session (verified against code, tested):**

- S1 · `payment-plans.chargePlanInstallment` · the off-session installment
  charge had NO Stripe idempotency key, created the PaymentIntent BEFORE
  recording it, and bumped `installmentsPaid` with no CAS — so a DB error
  after a successful charge (→ 3-day retry) or the finalize↔cron race
  re-charged the same installment. A real double-charge path. · **FIXED** —
  deterministic `idempotencyKey: ppl_{plan}_{index}` (a retry reuses the same
  charge) + CAS-advance the counter before recording (a racing writer records
  no second row, never overshoots). Regression tests added.
- S2 · `settings.startStripeCheckout` / `openBillingPortal` · missing the
  owner/admin gate every sibling money action has — a `role='member'` staff
  could open the Stripe Customer Portal (cancel sub, swap card). · **FIXED**.
- S2 · `settings.startStripeCheckout` · client `planId` not restricted to
  `PURCHASABLE_PLANS`, so a clinic could self-serve a subscription at the
  cheaper legacy Basic/Pro price for the same (full) access. · **FIXED** —
  reject non-purchasable at the action (managed `/billing/activate` keeps its
  platform-reserved plan path).
- S2 · `balance-payments.createBalancePaymentSession` · no server-side upper
  bound; the `5,000,000` cap lived only in the `/b/[token]` wrapper, so a
  null (unsynced) PMS balance meant an unbounded charge from the portal
  path. · **FIXED** — `MAX_PAYMENT_CENTS` enforced in the shared service.
- S2 · `stripe` webhook commission accrual · accrued on `amount_paid`, which
  includes Stripe Tax the platform remits — overpaying partners a cut of
  sales tax. · **FIXED** — accrue on the pre-tax net
  (`total_excluding_tax ?? amount_paid − tax`).
- S2 · `platform-metrics.getMrrSnapshot` · counted unpaid `trialing` clinics
  at a stale $199 premium price — inflating MRR/ARR/ARPU on the owner's own
  dashboard. · **FIXED** — premium $200, recognized-revenue = `active` only.

**Reported by the S2 sweep — R2 burn-down candidates (money):**

- S2 · `stripe` + `stripe-connect` webhooks · no `charge.refunded` /
  `charge.dispute.created` handler, so an accrued/paid referral commission is
  never reversed on a refunded/disputed invoice (platform eats it), and
  shop/balance/deposit records stay `'paid'` after a Stripe-side refund
  (`OrderStatus 'refunded'` is never set). Needs a new webhook case. · OPEN.
- S2 · `referral-payouts.payoutPartner` · double-pay window — after a
  transfer succeeds but the ledger write fails, a manual retry >24h later
  (Stripe idempotency window lapsed) re-derives the same key and sends a
  SECOND real transfer; concurrent payouts also duplicate the payout ledger
  row. Needs persist-key-before-charge + a transactional accrued-set claim. ·
  OPEN.
- S2 · `getMrrSnapshot` stale tier constant duplicated in `projects.ts` +
  `clinics.ts` — single-source the tier→price map (ideally derive from live
  Stripe amounts as `/ecommerce/invoices` already does). · OPEN.
- S3 · stripe-webhook release-and-retry re-fires non-idempotent in-app
  notifications; collections board header total truncated at 200 rows;
  `stripe-admin.monthlyContributionCents` ignores `quantity`/`interval_count`;
  legacy `billing_profiles` vanity write; `(pay)/ecommerce/pay` demo cart
  accepts an arbitrary amount (moves no real money). · OPEN.

**S2 sweep CLOSED (2026-08-17):** 1 S1 + 5 S2 fixed and verified; the
refund/dispute reversal and payout double-pay hardening are the two
substantive R2 money items. No open S0.

### R1 · S3 sweep — Four-persona journey audit (2026-08-17)

Three parallel finders walked patient/public, clinic-staff, and platform/
partner journeys for logic breaks, dead ends, dishonest empty states, and
voice/tenant-voice slips. Verdict: the app is **release-quality on journey
logic** — 0 S1 across every persona; empty states are honest and kind,
orientation/back-paths hold, "prospect" vocabulary holds, and tenant-voice
is correctly branched on every dual-tenant surface checked. Only 2 S2s (both
patient) and a handful of S3 polish items.

**Fixed this session (verified, typecheck + build clean):**

- S2/journey · `r/[token]` review landing · with no Google URL, no other
  platforms, AND private feedback off, the page rendered a warm heading with
  nothing to click (dead-end). · **FIXED** — when there's no public
  destination, the private note path is offered (and opened) so the "we'd
  love to hear how your visit went" heading always has an affordance.
- S3/money-adjacent · managed provisioning modal + prospect→clinic convert
  card both defaulted the plan to legacy `'pro'` ($250), not the marketed
  `'premium'` ($200) — a real wrong-price on a real conversion if the owner
  didn't touch the dropdown. · **FIXED** — both default to `premium`.
- S3/voice · `site/[slug]/intake-start` tab title leaked the internal product
  name "DreamCRM" to patients. · **FIXED** — `generateMetadata` titles against
  the clinic name like every sibling page.

**Reported by the S3 sweep — R2/polish candidates:**

- S2 · the go-live "coming soon" gate (`site/[slug]/layout.tsx`) has no
  pathname exemption, so a pre-live clinic's shared portal-login link / QR
  (`/portal`), the `/intake-start` gate, and portal out-links (shop,
  dental-plans upsell) dead-end on the marketing coming-soon page. Mitigated
  (magic-link EMAIL sign-in bypasses the site layout), so not S1 — but the
  shared-link door is stranded. **R2 scoped item**: needs a pathname
  exemption (middleware-stamped) + a test that a pre-live clinic's portal
  login still resolves. · OPEN.
- S3 · portal visit-card offers no change affordance inside the notice window
  when the clinic has no phone on file (fall back to a "message us" link);
  family "Book for {name}" doesn't pre-select the dependent (`?for=` param);
  hardcoded "SMS replies — coming soon" tile on the clinic Overview (should
  ride the SMS honesty-flip, not be hand-removed); `/growth/audiences` uses
  the top-level eyebrow instead of the `‹ Growth` back-link; dead `?upgrade`
  param on the `/settings/plans` redirect; partner payout button reads
  "Withdraw $0.00" at zero balance; unreachable `isManage` branch in
  `website/seo/page.tsx`. · OPEN (polish).

**S3 sweep CLOSED (2026-08-17):** of 2 S2 found, 1 fixed (review dead-end)
and 1 (portal coming-soon gate) scoped to R2; 2 S3 fixed (plan defaults,
DreamCRM title leak); the rest is polish. No S0/S1.

### R1 · S4 sweep — Resilience drills (2026-08-17)

Three parallel finders drilled the outage matrix (external services ·
integrations · the 21 crons). Verdict: the never-throw/best-effort laws
hold across the great majority of paths — **0 S1**. The gaps cluster into
three cheap high-value classes (fixed) plus loop-hardening (R2).

**Fixed this session (verified against code, tested):**

- S2 · no request timeout on the Stripe, NexHealth, and Zernio clients — a
  black-holed connection (a STALL, not a clean error) pinned a request
  worker or a cron iteration up to ~80s (Stripe SDK default) / ~300s
  (undici default), and the public booking page's local-engine fallback
  only fires on a THROWN failure, so a NexHealth stall hung the patient's
  booking page. · **FIXED** — `timeout: 15_000, maxNetworkRetries: 1` on
  Stripe; `AbortSignal.timeout(10_000)` on every NexHealth fetch;
  `AbortSignal.timeout(15_000)` on Zernio. A stall now throws → the existing
  catch degrades.
- S2 · `domain-renewals` cron · the renewal `paymentIntents.create` had no
  idempotency key and `renewsAt` advanced only after the charge — same
  double-charge class as the payment-plan fix (a crash before the advance,
  or a concurrent daily run, re-charges the card). · **FIXED** —
  deterministic `idempotencyKey` keyed on the row + its due date.
- S2 · the trial-expiry KILL leaked · `balance-outreach` (dunning nudges)
  and `nps` (post-visit surveys) didn't gate on `listShutDownOrgIds`, so an
  expired unconverted clinic kept emailing its patients — against the owner
  ruling. · **FIXED** — both loops skip shut-down orgs (test mocks updated).
- S2 · Guardian blind spots · an all-recipients-failed campaign for an
  APPROVED clinic returned normally (no throw) so the campaigns engine read
  `healthy`; a persistently broken reminder sender-identity did the same. ·
  **FIXED** — `reportAutomationFailure` on an all-failed campaign
  (`attempted>0 && sent===0`) and on the sender-identity failure path.

**Reported by the S4 sweep — R2 burn-down candidates:**

- S2 · public `site/[slug]/shop` + `membership` checkout actions throw raw
  to the patient on a Stripe outage AND orphan a `pending` row (the
  balance-payment path already wraps correctly) — fix needs the action to
  return a typed error + the client to surface it. · OPEN.
- S2 · `send-reminders` has no per-ORG try around the candidate/priorLogs
  queries, so one org's query throw 500s the route and silences the tick for
  everyone (near-S1); and its idempotency is a read-before-send with the log
  written AFTER `deliver`, so an overlap/retry can double-send. Needs a
  per-iteration try + an atomic claim (unique on appointmentId+template,
  `onConflictDoNothing().returning()`) before sending. · OPEN.
- S2 · a campaign that crashes mid-`sendCampaign` is stranded `active` with
  no requeue and no per-recipient resume (partial send, rest dropped);
  `publish-scheduled-posts` has an unwrapped per-post loop + no
  `status='scheduled'` guard on the flip (double-ledger under overlap). ·
  OPEN.
- S2 · a NexHealth outage during an appointment/patient CREATE burns the
  6-attempt write-back cap instead of parking in the WAITING lane (only the
  cancel path classifies offline errors as `PmsWriteWaitingError`). · OPEN.
- S3 · staff billing actions unwrapped; upload route raw 500; `pms-sync`
  config-throw skips the Guardian signal; optimistic `emailSent` flag;
  trial-reminders milestone stamped after send; scheduled-message requeue
  double-send window; `auto-send-reviews` / `customize-services` unwrapped
  per-org loops (+ read-modify-write on `services`); prospect stuck-
  enrollment on a failed touch; Monday standup ignores the KILL. · OPEN.

**S4 sweep CLOSED (2026-08-17):** 6 S2 fixed (3 client timeouts as one
class, domain double-charge, trial-KILL leak ×2, 2 Guardian signals); the
loop-hardening + atomic-claim items are R2. No S0/S1.

### R1 · S5 sweep — Performance (2026-08-17)

Two finders (DB/query shape · frontend/page-weight). Verdict: the schema
indexing, the `<SiteImage>` pipeline, bundle code-splitting (EditBridge and
Recharts are both split out of the public bundle), streaming server
components, and the uniquely-indexed public token point-lookups are all
genuinely well-built. The findings are scale-shaped — real at a busy real
clinic, none breaking at the current one-beta-clinic scale.

**Fixed this session:**

- S2 · missing index `patient(organizationId, first_seen_at)` — the Overview
  acquisition trend tiles and Analytics filter on `first_seen_at` and were
  falling back to an org-leading index (residual scan of the whole roster). ·
  **FIXED** — migration 0149 adds the composite index.

**Reported by the S5 sweep — R2 burn-down candidates:**

- **S1 (scale) · the Patients list (`listPatients`)** loads the entire roster
  with `select()` (no projection, incl. jsonb), no `LIMIT`/pagination, applies
  the money/tag filters + sort in JS after the full load, and fans out
  unbounded last-visit/next-visit/last-message queries that scan EVERY
  appointment and message in the org. Falls over first on a real clinic
  (thousands of patients × history) on the t4g.micro. **THE must-fix perf
  slice** — server keyset/LIMIT pagination + column projection + SQL-side
  `DISTINCT ON`/`MAX…GROUP BY` aggregation + push filters/sort into SQL,
  mirroring the already-correct windowed+projected+batched `listAppointments`.
  Needs a UI pagination change too, so it's a dedicated slice with tests. · OPEN.
- S2 · `resolvePatientAudience` has the same JS-aggregation-of-all-appointments
  anti-pattern (shared root cause), and it's hit by the retention cron (×4/day
  per clinic), the marketing send path, and the proposal generators. Fold the
  MAX/MIN-in-SQL fix in with the Patients rework. · OPEN.
- S2 · `/messages` `listPatientThreads` has no `LIMIT` and filters search in JS
  over the full set — LIMIT + keyset paging + SQL `ILIKE`/phone search. · OPEN.
- S2 · `campaign_events` frequency-cap query filters by `patientId`/`recipientEmail`
  but every index is `campaignId`-leading — a partial index
  `(patientId, occurredAt) where type='sent'` if it shows in slow logs. · OPEN.
- S2 · the public-site + marketing body font (Inter) loads via a
  render-blocking third-party `@import` in `app/css/style.css:1` — violates
  the self-hosted-woff2 font doctrine (Nunito is already self-hosted correctly).
  Self-host Inter as woff2 `@font-face` with matching latin/latin-ext subsets. ·
  OPEN.
- S3/watch · `daily-digest` / `generate-proposals` / `retention-automations`
  fan out per-clinic SEQUENTIALLY (by design, to spare the t4g.micro), so the
  risk is cron wall-clock OVERRUN as clinic count grows, not DB overload —
  give them a wall-clock budget + resumability before onboarding many clinics;
  `listMessagesInThread` loads a whole thread with no limit. · OPEN.

**S5 sweep CLOSED (2026-08-17):** 1 S2 fixed (index, migration 0149); the
Patients-list scale rework (S1) is THE headline R2 perf slice, plus the
shared audience/inbox/font items. All scale-shaped — nothing breaks at
current scale. No S0.

### R1 · S6 sweep — Copy & voice (2026-08-17)

One finder over error messages, email templates, and the help-path law
(empty states + page-body voice were S3's territory, already clean). Verdict:
the corpus is a model of the anti-shame voice — the email default copy,
patient-brand isolation (no "DreamCRM" leak in any patient email), and the
"call the office" help-path law are all done well. 0 S1.

**Fixed this session:**

- S2 · the contact-ack auto-reply email had a dangling `{{urgentLine}}` merge —
  a phone-less clinic sent a patient "If it's urgent — otherwise, sit tight…"
  (broken sentence). · **FIXED** — the whole urgent clause is now conditional
  (phone → "reach us at …", no phone → "just reply and we'll prioritize it").
- S2 · raw Stripe/jargon strings that could reach a user — "Stripe did not
  return a setup URL" to a PATIENT starting a payment plan; "Stripe did not
  return a checkout URL"/"connected account id" to a clinic owner (checkout,
  membership, balance, Connect, settings). · **FIXED** — friendly
  "we couldn't start … please try again / call the office" copy at all sites.
- S2 · the public intake-start form surfaced raw better-auth `error.message`
  ("User already exists", validation internals) to patients. · **FIXED** —
  mapped to a friendly fixed set (bad-credentials / already-have-an-account).
- S3 · "on this DreamCRM instance" dev-jargon → "aren't switched on yet";
  billing footnote "Stripe tries again" → "we'll retry automatically". · FIXED.

**R2 candidate:** public booking/contact/intake forms display a THROWN
server-action `.message`, which Next redacts in production — so the carefully
worded action strings ("That slot is no longer available…") may never reach
the patient. Adopt the portal's structured `{ ok, error }` result pattern (same
root as the S4 public-checkout-wrap item). · OPEN.

### R1 · S7 sweep — Accessibility (2026-08-17)

One finder walked booking / portal / auth / the sign-here stack / the shared
primitives. Verdict: no blockers — the modal focus-trap infra and the shared
primitives (FlashToast `role=status`, StatusPill text-not-color, the PUBLIC
booking picker with `aria-pressed`+labels, skip-to-content) are exemplary.
0 S1; 11 S2, 4 S3 — an announcement/label cluster, heaviest in the portal.

**Fixed this session:**

- S2 · the shared portal input primitive (`PortalInput`/`PortalTextarea`)
  stripped the focus outline with no replacement — a keyboard user saw NO focus
  on every portal form (billing, family, survey, booking). · **FIXED** —
  `focus-visible` ring on the primitive (multiplies across every portal form).

**R2 candidate — a focused a11y slice (all S2/S3, cohesive):** bring the PORTAL
slot-picker + booking choice-chips to aria parity with the already-correct
public form (`aria-pressed`/`aria-label`/`role=radiogroup`, "taken" text alt);
add `<label sr-only>`/`aria-label` to the public booking visit-type select +
placeholder-only inputs; a `role="alert"`/`role="status"` sweep over the ~7
unannounced error/success nodes (public booking, portal visit-card + booking,
auth sign-in/up/reset, approval-inbox validation); + S3 (drawer `DialogTitle`,
portal desktop-nav `aria-current`, phase-change announcements). · OPEN.

### R1 · S8 sweep — Compliance & data (2026-08-17)

One finder produced the written posture assessment now in **`docs/COMPLIANCE.md`**
— the decision document the owner needs before the marketing pivot. Verdict:
TCPA/SMS-consent and CAN-SPAM are GENUINELY STRONG and verified; the entire
real risk is the HIPAA subprocessor posture, contained today ONLY by the fact
that the product makes zero compliance claims (grep-verified). 0 S1 today.

**Delivered:** `docs/COMPLIANCE.md` (posture per area + the findings ledger +
the owner's framed decision). No code fixed here — the S8 items are
policy/legal/ops decisions, not defects.

**Owner decisions (now surfaced in CLAUDE.md open items):** the HIPAA/BAA path
(the highest-leverage single move is the already-scaffolded `AI_DRIVER=bedrock`
flip, putting PHI-touching AI under the AWS BAA), execute the AWS BAA, move
patient email to SES, confirm NexHealth, write the customer legal pages
(Privacy/ToS/DPA/BAA — none exist), add patient-level deletion (right to
erasure), and a written retention policy. S3 doc items: verify S3 SSE, scrub
email addresses from a few log paths, refresh the stale SMS-eval recommendation.

---

## R1 — THE GREAT AUDIT: CLOSED (2026-08-17)

All eight sweeps run and verified in one program session. **Headline: the
product is in strong shape.** Zero broken core journeys across all four
personas + the public visitor; the findings were real but almost all fixable
in place, and whole subsystems audited clean (the staff dashboard, the token-
auth public surfaces, the image pipeline, the consent machinery).

**Fixed in-band during R1 (S0/S1 + cheap high-value S2/S3):** 1 S0 + 4 S1 +
~20 S2/S3 across the eight sweeps, each verified against code and tested,
seven commits pushed. Migration 0149 added.

**Carried to R2 burn-down (the ledger above), by theme:**
- **Perf (the headline):** the Patients-list scale rework (S1-at-scale) +
  shared `resolvePatientAudience` + `/messages` pagination + the Inter font
  self-host + cron wall-clock budgets.
- **Money hardening:** refund/dispute commission reversal; the partner-payout
  double-pay window.
- **Resilience:** the send-reminders per-org try + atomic claim; stranded-
  campaign recovery; publish-posts loop guard; NexHealth-create WAITING lane;
  the public-checkout wrap (shared with S6's thrown-message item).
- **A11y:** the focused slice (slot-picker/chips parity + input labels +
  `role=alert` sweep).
- **Journeys:** the portal coming-soon-gate dead-end (pathname exemption).
- **Compliance/ops:** the whole `docs/COMPLIANCE.md` decision list (owner-gated).

R2 fixes by severity with full-suite gates; the perf slice and the money
hardening lead. Then R3 (E2E + hardening), R4 (beta), R5 (launch).

---

## R2 — BURN-DOWN (in progress, opened 2026-08-17)

Fixing by severity, full-suite gate on every slice.

### Slice 1 — the Patients-list scale rework (the S5 headline) · DONE

`listPatients` was the one finding that falls over first on a real clinic.
Three behaviour-preserving fixes, no UI change:

- **The unbounded fan-outs are gone.** `lastVisits`, `nextVisits` and
  `lastMessages` each pulled EVERY matching row in the org (all appointment
  history; every message row) purely to derive one value per patient. All
  three now use Postgres `DISTINCT ON (patientId)` — exactly the row the
  composer already took (it read only the first per patient), so the result is
  identical while the transfer collapses from O(all appointments + all
  messages) to O(patients).
- **Column projection.** The roster select was a bare `select()` (every column
  including jsonb); it now projects the 15 columns the composer actually reads.
- Dropped a dead `emails` local.

Scale effect for a 3,000-patient clinic with history: tens of thousands of
appointment + message rows into Node per page render → ~3,000 projected rows
plus three one-row-per-patient aggregates.

**Still open (deliberately deferred):** pagination itself. The derived filters
(`hasBalance`, `missingIntake`, birthday, recall) and the sort still run in JS
after the load, so a `LIMIT` would silently truncate BEFORE filtering and
return wrong results. Correct pagination requires pushing those filters + sort
into SQL first, plus a UI change — a follow-up slice. With the fan-outs fixed
the remaining cost is bounded by the patient table alone.

### Slice 2 — money hardening (the two S2 money items) · DONE

- **Refund/dispute commission reversal.** A clinic that paid and was then
  refunded (or charged back) never produced that revenue, but the accrued
  partner commission survived — real platform loss. New
  `reverseCommissionForInvoice` + `charge.refunded` / `charge.dispute.created`
  cases on the platform webhook (a dispute resolves its charge → invoice).
  An `accrued` row flips to `reversed` (kept as audit, never deleted); an
  already-`paid` row is NOT rewritten — settled money surfaces for a human
  clawback decision instead. Idempotent, never throws. 5 tests.
- **Partner-payout double-pay window CLOSED** (migration 0150,
  `referral_payout.idempotency_key` unique). The key was derived from the
  claimed row set, but Stripe only dedupes a key for ~24h: after a transfer
  succeeded and its ledger write failed, the rows stayed `accrued` and a retry
  past that window re-derived the same key and sent a SECOND REAL TRANSFER.
  The key is now CLAIMED (a `pending` payout row) BEFORE the money moves and
  stamped with the transfer id the moment it lands, so a later retry sees the
  transfer already went out and RECONCILES the ledger instead of paying again.
  The failure path marks the claim `failed` (next attempt retries cleanly) and
  success finalizes the SAME row — one transfer can no longer produce two
  payout records. Recovery-path test added.

### Slice 3 — send-reminders per-org isolation (the near-S1) · DONE

Two queries in the reminder engine were unwrapped, so a statement timeout or a
malformed row for ONE clinic threw past both loops to the route's catch → HTTP
500 → **every remaining clinic went unreminded for that tick**.

- The per-org candidate scan is isolated: count the org failed, report the
  engine failure to the Guardian, continue to the next clinic.
- The per-appointment reminder-log read is isolated per APPOINTMENT, and
  deliberately so: that read IS the idempotency check, so a throw must never be
  treated as "nothing sent yet" (which would re-send a reminder the patient
  already got) and must not abort the org's whole batch.

**Still open:** the atomic reminder CLAIM (the double-send window — the log is
written AFTER `deliver`, so an overlap/crash can re-send). Deferred
deliberately: it needs a unique index on `(appointmentId, template)`, but
`template` is NULLABLE (Postgres treats NULLs as distinct) and existing prod
rows may already contain duplicates from the very bug being fixed — a failed
migration blocks deploys, since migrations auto-apply on boot. Needs a dedup
step + a partial unique index, as its own careful slice. · OPEN.

### Slice 4 — the doors are not the marketing site · DONE

The S3 sweep's one patient-facing dead-end. A practice fully operating but not
yet published was handing out portal links/QRs (from `/website/share`) that
dead-ended on the coming-soon page, which has NO navigation. Middleware now
stamps `x-dc-access-route` for `/site/[slug]/portal` and `/intake-start`
(mirroring the existing `x-dc-template-frame` pattern — a layout cannot read
the pathname), and `shouldShowComingSoon` takes an explicit `isAccessRoute`
exemption.

The exemption is checked AFTER `shutDown` on purpose: an expired trial still
closes everything — being a customer and having published a website are
different questions. Three tests pin it (doors open pre-live; the kill still
outranks; marketing pages unaffected). Build verified.

### Slice 5 — publish-scheduled-posts loop guard + status CAS · DONE

The cron loop spans EVERY org, and one post's throw (a ledger write, a bad row)
aborted the publish of every remaining post including other clinics'. The flip
also filtered on id alone, so two overlapping runs both published AND both
wrote a `blog_publish` ledger entry — double-reporting into the story/standup.
Now: per-post try/catch, and the update CASes on `status='scheduled'` with
`.returning()` — losing the claim is a quiet `continue`, not an error. Test
added for the CAS-loss path.

### Slice 6 — the accessibility slice (R1·S7's S2 cluster) · DONE

The S7 sweep found 0 blockers but a real S2 cluster, heaviest in the portal
(older patients — commercially the most a11y-sensitive surface). Fixed:

- **Colour-only selection, now announced.** The portal `SlotPicker` day and
  time buttons and the portal booking choice-chips ("Who's this visit for?",
  "What kind of visit?") carried their selected state in brand colour ALONE,
  with no `aria-pressed` and no accessible name — a screen-reader user could
  not tell what was selected. All now carry `aria-pressed` + labels + a
  `focus-visible` ring, bringing the portal to parity with the public booking
  form (which already did this correctly and served as the reference).
- **"Taken" slots** conveyed unavailability by strikethrough + colour only;
  they now carry an `sr-only` "— taken".
- **Missing accessible names on the top public conversion path:** the primary
  visit-type `<select>` had no label at all, and first/last name, phone and
  email were placeholder-only (a placeholder vanishes on input and is a weak
  name). All labelled.
- **Unannounced errors/results** now live-region'd: public booking error,
  portal booking error, the portal VisitCard's confirm/reschedule/cancel
  feedback (`role="status"` on success / `role="alert"` on failure — the
  portal's primary action feedback), and the sign-in / sign-up error blocks.

Combined with slice 0's shared `PortalInput`/`PortalTextarea` focus ring (R1),
this closes the S7 cluster's load-bearing half. Remaining S3 polish (drawer
`DialogTitle`, portal desktop-nav `aria-current`, phase-change announcements,
the family "Book for {name}" pre-select) stays on the polish list.

### Slice 7 — the PMS WAITING lane covers CREATES, not just cancels · DONE

Only the cancel path classified a vendor outage as `PmsWriteWaitingError`, so a
NexHealth outage during an appointment/patient CREATE fell through to the
counted error lane: each cron run burned an attempt, and after
`MAX_WRITE_ATTEMPTS` (6) the op was permanently SKIPPED — the booking silently
never reached the practice's schedule. That is exactly the failure the WAITING
lane exists to prevent (an outage across a long weekend exhausts the cap).

Fixed centrally in `settleWriteFailure` rather than per call site, so every
write path is covered at once: a new exported `isTransientPmsError` recognises
network/timeout/abort shapes and 5xx/429 responses and routes them to
`pending` with attempts PRESERVED. Deliberately conservative — anything it
cannot positively identify as transient (a 422, "slot no longer available")
still exhausts its retries and surfaces. Tests pin both directions.

### Slice 8 — stranded-campaign recovery · DONE

The claim flips a campaign `scheduled` → `active` BEFORE `sendCampaign` walks
its recipients, and that walk is NOT atomic (one send + one `campaign_events`
row at a time). A crash mid-walk — deploy, OOM, function timeout — left the row
`active` forever: the sweep only ever re-selects `scheduled`, so nobody
finished it. Half the audience got the email, the rest never heard anything,
and because nothing threw there was no error and no Guardian signal — the
practice just saw a campaign that claimed it sent.

Two halves, because either alone is wrong:

- `requeueStuckCampaigns` (run at the top of the same cron, mirroring
  `requeueStuckScheduledMessages`) puts a campaign left `active` and untouched
  for `STUCK_CAMPAIGN_AFTER_MS` (30 min) back to `scheduled`. A live send
  updates the row as it works, so "active and stale" is the honest signal for
  abandoned. Never throws — it must not stop the due sweep behind it.
- `dropAlreadySentRecipients` is what makes that requeue SAFE: it drops anyone
  already carrying a `sent` event for the campaign, matching on the same keys
  the send loops stamp (patientId → email → phone, for SMS sends with no
  address). So the re-run finishes the tail instead of re-mailing the half that
  got through. It **fails OPEN** — an unreadable events table sends the full
  list, because treating a failed read as "everyone already got it" would
  silently cancel a legitimate campaign, which is worse than a duplicate.

10 tests across both halves.

---

## R3 — HARDENING (in progress, opened 2026-08-18)

### Deliverable 1 — the E2E browser suite · FIRST SPECS GREEN

Part 1 of this program named "E2E browser journeys: **None** (happy-dom only)"
as **the biggest single gap**. It is now open: **10 specs passing in real
Chromium against a real Next production build and a real Postgres.**

- `playwright.config.ts` — Chromium project, traces/screenshots retained on
  failure, one retry in CI only (a golden path that needs a retry is a flaky
  spec, and a flaky E2E suite is worse than none because people learn to
  ignore red).
- `scripts/e2e-harness.sh` + `pnpm test:e2e` — one command that stands up a
  throwaway Postgres, applies EVERY migration from scratch, builds, serves,
  runs Playwright, and tears down on exit (including on failure). Prod RDS is
  VPC-only, so the suite brings its own database.
- `e2e/smoke.spec.ts` — seed-free specs covering what happy-dom structurally
  cannot see: middleware auth redirects on four protected surfaces, real
  server rendering of the marketing site, the `$200` pricing truth, sign-in
  form usability, the `role="alert"` on a failed sign-in (pinning the R2 a11y
  fix), and a 404 on an unknown clinic slug.
- `docs/E2E.md` — how to run it, why it is NOT in `pnpm test` (the merge gate
  stays fast), the browser-version pinning note, and the seeded journeys to
  write next (public booking, portal reschedule/cancel, staff day, sign-here,
  onboarding path B).

**A free side-benefit:** the harness applies all 150 migrations to an EMPTY
database, which rehearses the deploy path (migrations auto-apply on boot). It
verified 0149 (`patient_org_first_seen_idx`) and 0150
(`referral_payout.idempotency_key` + its unique constraint) land cleanly from
zero — exactly the failure mode that would otherwise wedge a deploy.

**Seeded journeys added the same day** (`scripts/e2e-seed.mjs` +
`e2e/clinic-site.spec.ts`): two clinics in SQL — one published, one operating
but unpublished. They verify the published site serves its own branding and a
booking page whose fields are reachable BY NAME (the R2 a11y fix), and that the
go-live lever gates marketing pages while **leaving the portal door open** —
the R2 slice-4 fix, now proven in a real browser rather than argued from code.
That is the shape worth repeating: an E2E spec earns its keep when it pins a
behaviour a unit test structurally cannot reach.

**The booking journey landed too** (`e2e/booking.spec.ts`): a genuine WRITE
test that picks an open slot, submits, asserts the patient-facing confirmation,
and leaves real `patient` + `appointment` rows behind — verified in the database
afterwards. Plus the guard that submit stays disabled until a time is picked.
E2E now stands at **18 specs, all green**.

### Deliverable 2 — the RDS restore drill · RUNBOOK WRITTEN, NOT YET RUN

`docs/RESTORE-DRILL.md`. Part 1 lists the backup/restore drill as never
exercised — "a backup nobody has restored is a hope, not a backup."

The procedure is written end to end (pick snapshot → restore to a NEW scratch
instance → verify row counts + the drizzle migration ledger → **boot the app
against it** → time it → delete the instance). It never touches
`dreamcrm-db`. The point is not "does a snapshot exist" but three things only a
real restore answers: can it become a running database, does the app boot
against it, and what is the true RTO.

**It has NOT been executed** — it needs AWS credentials for account
`952078552817`, deliberately unavailable to the development session. Running it
is an owner action; a result table at the bottom of the runbook is waiting for
the RTO/RPO numbers. · OPEN (owner).

### Deliverable 3 — load sanity · BASELINE MEASURED

`scripts/load-sanity.mjs` (no dependencies, read-only paths only — a load
script must never be able to fabricate bookings or send email) +
`docs/LOAD-SANITY.md` with the first real numbers this product has ever had.

**No errors at any level** — the app degrades by getting slower, which is the
good failure mode. But the finding is real: **the dynamic public pages are
already saturated at concurrency 8.** Tripling concurrency bought NO extra
throughput (clinic site 19.6 → 23.4 req/s) while p50 tripled (387ms →
1054ms). Flat throughput with latency rising in proportion to concurrency is a
queue, not capacity. `/pricing` is the control: it scaled cleanly (125 → 186
req/s), so the ceiling is the per-request work of the clinic/marketing pages,
not the HTTP layer.

**The slowest tail is the page that sells** (`/site/[slug]`), which is exactly
the surface a marketing push would hammer. Recommendation (not actioned —
it is a design change, not a defect fix): cache the public clinic site, using
the existing Draft→Publish flow as the natural invalidation point.

Caveat written into the doc: these numbers are from the dev container and
characterise the APPLICATION, not the prod t4g.micro's ceiling. A real ceiling
needs a staging run on prod-shaped hardware before the marketing pivot. · OPEN
(prod-shaped re-run).

### Deliverable 4 — error aggregation · NOT BUILT (owner decision)

Part 4 point 3 lists "Sentry-class SaaS vs CloudWatch-native" as an owner
decision, and it is a real one: a third-party error tracker means a new vendor,
a new data-processor relationship, and — per `docs/COMPLIANCE.md` — a new place
PHI-adjacent stack traces can land. Deliberately not chosen unilaterally. · OPEN
(owner).

**Scars worth keeping:**
- `@playwright/test` will not always match the pre-installed browser build, so
  the config points `executablePath` at the on-disk Chromium when present and
  falls back to Playwright's own resolution otherwise (a normal CI image is
  unaffected). Never run `playwright install` here — downloads are blocked.
- Running `pnpm add` WHILE the unit suite was in flight produced 78 bogus
  failures ("`headers` was called outside a request scope"): pnpm relinked
  `next` into a new virtual-store path mid-run, so mocks and runtime resolved
  to different copies. Not a code regression — never install during a test run.

### A flaky test, recorded rather than shrugged off (R3 candidate)

`tests/patient-portal/survey-card.test.tsx` → "skipping the note (Done with
empty box)" failed ONCE in a full run and passed on the re-run, on 5/5 in
isolation and 81/81 across the portal directory. The failure was a
`findByRole`/`findByText` timeout under full-suite load, in a file none of that
slice's changes touched — load-induced, not a regression.

It is logged because a test that fails ~1 run in N is a future CI annoyance
that will eventually be blamed on a real change. Fix shape: raise the
`findBy*` timeout in that file (or drive the phase change with an explicit
`waitFor`) as part of R3's suite-stability work. · OPEN.

---

## THE POLISH PASS (opened 2026-08-18, owner directive: "polish, not bug
fixing — upgrading UI components, UX and journeys")

Two design scouts proposed ranked UX upgrades against DESIGN-SYSTEM.md (one on
the staff daily journey, one on patient-facing surfaces); the audited S3/S7
polish tail was folded in. Implemented batch 1:

**The audited tail (all 9 closed):** visit-card offers "Message us" when the
clinic has no phone inside the notice window · the Family page's "Book for
{name}" now pre-selects that dependent (`?for=`) · the Overview's SMS
coming-soon tile is gated on the clinic's real texting state (self-retires on
approval) · `/growth/audiences` uses the canonical `‹ Growth` /`‹ Marketing`
eyebrow · the dead `?upgrade` param is gone from the plans redirect · the
partner button no longer reads "Withdraw $0.00" ("Nothing to withdraw yet" /
"$X accrued") · the seo page's unreachable tenant branch removed · the Drawer
gets a real `DialogTitle` + labelled close · portal desktop nav gets
`aria-current`.

**Patient-facing upgrades:** pressed states (`active:scale`) baked into the
portal button primitives + visit-card pills (hover doesn't exist on touch —
a tap must visibly register) + 44px pill/arrow tap floors · the portal booking
success screen now echoes the chosen time/type back and offers Add-to-calendar
(the moment trust is minted; it previously never repeated the time) · the
disabled book button says "Pick a time to continue" · the slot grid shows a
shaped pulse skeleton instead of a sentence, and a day whose openings were all
inside the notice window says so honestly instead of "we're closed" · the
public booking form carries the patient forward to "Your info" on first slot
pick (its submit button lives ~2 screens below on mobile) and remembers
already-fetched days (mirroring the server's own 2-min cache) · the n/ survey
landing converges on the warm token palette (it was the one off-brand token
page) and a failed score-tap now says so instead of silently reverting · the
b/ pay page grows Full/Half quick-amount chips + the "processed securely by
Stripe" line its portal sibling already had.

**Staff daily-journey upgrades:** the two stale v2-teal literals in Messages
(active-thread ring, search focus) re-pointed at tokens — the last
un-reskinned pixels on the busiest surface · toast TONES threaded through
agenda/patients/follow-ups so a failure no longer slides up wearing the
success green · the appointment drawer's feedback moved to the app-shell
ToastProvider (its local toast died unmounted the moment the drawer closed —
confirming from the drawer gave zero visible feedback) · the drawer opens onto
a payload-shaped skeleton and REFETCHES WITHOUT BLANKING (sending a reminder
used to blank the whole populated drawer) · My Day gets a layout-true
loading.tsx (its morning arrival visibly reshuffled) · today's-chair rows on
Overview + My Day now open the VISIT via the `?appt=` drawer deep-link (time +
status pill), so an "Unconfirmed" pill is one click from its remedy · My Day's
unread badge joins Messages/sidebar at warn-amber (unread is "needs action",
not "problem now").

**Batch 2 (same day):** `ActionButton` gains a `pending` prop — disables,
announces `aria-busy`, and overlays a spinner while the label keeps its width
(no more hand-rolled "Sending…" ternaries; buttons whose authors forgot one
get feedback free); reduced-motion stills it to a dot · `PendingVeil` extracted
as the one canonical filter-navigation veil (Patients' recipe), adopted on the
agenda (whose `useTransition` pending flag was being DISCARDED) and the
Messages thread list · **instant thread-switch feedback in Messages** — the
highest-frequency navigation in the app gave zero response until the server
render resolved; the clicked row now takes the active ring immediately
(plain left-click intercepted; middle/cmd-click keep native behavior) ·
**the follow-up tick earns its beat** — "Done — nice. Undo" (FlashToast grew
an inline-action slot; `reopenFollowupAction` existed but nothing offered it),
and a failed tick now says so instead of silently resetting the whole list ·
**the portal home gets a balance task strip** — "Your balance is $142 — you
can take care of it online in about a minute →" (reads the already-loaded
patient row, zero extra queries; anti-shame: states the fact + the easy path,
never "overdue") · **the public booking empty day gets a rescue** — the
server's window scan now returns WHICH day first has an opening
(`firstBookableDayInWindow`), and the "try another day" dead-end becomes a
one-tap "See Thursday's openings →" (this was the funnel's most fragile
moment: one tap + one fetch per day, 14 times).

**Batch 3 (same day; merged to main per the new owner directive — main gets
every gated turn):** c/ confirm landing gains Add-to-calendar on the confirmed
state (the natural next act for the exact patient who needed a reminder email;
same inline-.ics as the booking success — the context already carried the
start time, one prop plumb) · **visible labels on the public booking + request
forms** — name/phone/email were placeholder-only, and a placeholder vanishes
on the first keystroke, so a patient mid-form (or eyeing a browser autofill)
saw four filled boxes with no way to tell which was which; placeholders demote
to examples, aria-labels become real `<label htmlFor>` · **agenda empty states
hand over the action they name** — `emptyCopy` grew an action override, so
"Run a recall campaign to bring them back" now ships a *Start a recall
campaign* primary (→ `/growth/outreach?new=1`) and the quiet-today state ships
*Share your booking link* (→ `/website/share`), with + New booking one tier
down (still exactly one primary).

**Batch 4 (2026-08-18):** all three open scout proposals shipped. **The
shared `SearchInput` primitive** (`components/ui/search-input.tsx`) — the
Messages icon+clear recipe extracted once and adopted on the agenda, the
Patients list, and the thread search itself (which keeps its debounce and
just renders the primitive); the clear ✕ on the two form-submit surfaces
also clears the *active* query (`setParam('q', null)`), so a stale filter
can't outlive its visible text. **The "?" shortcut sheet + the full G-chord
map** — `keyboard-shortcuts.tsx` rebuilt on two registries (`GO_CHORDS`,
`SINGLE_KEYS`) so the help sheet renders from the same table the handler
reads and can never drift; chords grew `G-M`/`G-D`/`G-F` (Messages / My Day /
Follow-ups); the sheet is deliberately NOT `aria-modal` — the modal-open
guard would silence the very handler that closes it — closes on Esc, "?",
scrim tap, and ✕. **The drawer pending sweep** — all 14 `ActionButton`s in
the appointment drawer swapped `disabled={pending}` → `pending={pending}`
(spinner + `aria-busy` free from batch 2's prop; the one raw undo `<button>`
stays plain-disabled). Subsets green (89 files / 712 tests) + full gate.

### Test-hygiene note (worth keeping)

Two earlier R1 fixes (the loyalty patient-in-org guard and the follow-up
assignee guard) had broken `tests/patients` — a subset run had missed it
because those suites weren't in the subset. Caught by the full-suite gate,
fixed, and both guards now carry their own regression tests. Reinforces the
repo convention: **the full `pnpm test`, not a module subset, gates a slice.**

## Part 6 — The post-1.0 backlog
Moved to `docs/POST-1.0.md` (2026-08-17) — the full seeded inventory:
externally-gated items (OD vendor portal, first A2P approval,
procedure-code data), deferred feature ideas (webhooks at scale,
plan-card photo slots, SMS second wave, phones territory, …), and the
ECS decision.
