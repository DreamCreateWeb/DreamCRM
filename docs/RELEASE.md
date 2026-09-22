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
   **Standing exception (owner directive 2026-08-23): the Dream Team / AI
   Operations program (`docs/ai-operations.md`) builds through the freeze
   in its own lane — its defects still land in Part 5, and its phase audit
   runs at the end of its build arc.**
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

### Deploy pipeline — rollout collisions + the unpinned source zip (2026-08-23, root-caused 2026-08-25)

Found while checking deploy health during the Dream Team build: three of the
last ten `main` deploys failed. The 2026-08-23 entry blamed a source-zip
race; on 2026-08-25 the owner provided AWS credentials and CodeBuild's own
logs settled it — **that theory was wrong about the observed failures.**

**The CONFIRMED root cause.** All three failed builds (a4ffcc01, d509923c,
4a775b7b) died at the same line, POST_BUILD's `aws apprunner
start-deployment`, with the verbatim error *"Can't start a deployment on
the specified service, because it isn't in RUNNING state."* App Runner
allows ONE rollout at a time; the rollout starts at the END of a build,
which is the exact moment the workflow used to exit and release its
`deploy-main` lock. A back-to-back merge then built in ~3–4 minutes on a
warm cache and its own `start-deployment` fired while the previous rollout
(~3–5 min) was still going. **The real harm:** the failed build had already
pushed its image, so prod silently stayed on the OLDER commit until the
next merge — run 803's commit never got its own rollout.

**Fixed, both halves (2026-08-25, owner-authorized session):**
1. *The collision* — the CodeBuild project's inline buildspec now wraps
   `start-deployment` in a retry-until-accepted loop (30×30s cap), so a
   build waits out the previous rollout instead of failing after it already
   pushed its image. Read-back verified against the live project. (An
   interim 7-minute lock hold shipped in the workflow first and was removed
   the same day once the buildspec fix landed.)
2. *Source pinning* — `DreamCRMCodeBuildRole`'s `s3:GetObject` was
   confirmed to cover the whole source bucket, so every deploy now uploads
   `source/<sha>.zip` and passes `--source-location-override`: a build is
   pinned to the commit that triggered it, and the ships-the-wrong-commit
   direction is closed. The fixed key is still refreshed each deploy for
   manual console builds.

**Still optional, genuinely:** an S3 lifecycle rule expiring old
`source/*.zip` objects (a few MB per deploy accumulates slowly), and
`apprunner:DescribeService` on the CodeBuild role if the retry loop should
narrate the service status while it waits. · **FIXED — verified live on
the next deploys (runs 807–808).**

### Deploy pipeline — a green deploy can leave prod on the previous commit, and nothing notices (found 2026-09-21)

DREAMCRM-83's changelog merge (`95e0c33c`, deploy run 35664809013) reported
green on everything we have — `test`, `e2e`, the deploy job's own gate,
`migration-check`, post-merge E2E — and production went on serving the
2026-09-17 build for **2h 40m** after its own rollout was requested, until an
unrelated merge (`9269da58`) carried the commit in as a passenger.

Measured, not inferred: `/changelog` returned the same `etag`
(`"xjgppisco23but"`) at 23:19 and again at 01:27 while the homepage was
already showing the 2026-09-17 cinema stage, so the container had not been
replaced; the new week appeared at 01:44:44 with a new etag, **eight minutes
after the NEXT deploy's `start-deployment`**.

**This is the 2026-08-23 entry's harm reached by its other cause.** That
entry closed the COLLISION (`start-deployment` REFUSED while a previous
rollout was still running) and the source-zip race. It did not close the
INVISIBILITY, and that half is structural rather than incidental:
`.github/workflows/deploy.yml`'s build step polls `codebuild
batch-get-builds` and exits as soon as the BUILD reports `SUCCEEDED`, and
the rollout is fired from the buildspec's POST_BUILD after that point.
Nothing downstream observes it — the next step is the EventBridge cron sync,
which by design never blocks the deploy. So the pipeline's green means "the
image built and App Runner accepted a request", never "the new version is
serving", and a rollout that is accepted and then does not complete — a
failed health check with App Runner's automatic rollback being the obvious
candidate — is indistinguishable from a successful deploy in every signal we
collect.

**Deliberately NOT root-caused here.** Which of those actually happened needs
App Runner's own operation history (`apprunner list-operations`, the service
event log), and the session that found this had no AWS credentials. The
defect above does not depend on the answer: the pipeline cannot tell a landed
rollout from a lost one either way, so the verdict is the same whichever it
was.

**What a fix looks like**, noted because it is NOT a docs change and lands on
the review gate (`.github/workflows/**` plus the deploy pipeline): after the
build step, poll `apprunner list-operations` for the operation the buildspec
started until it leaves `IN_PROGRESS` and fail the job on anything but
`SUCCEEDED`. That needs `apprunner:ListOperations` + `DescribeService` on the
deploy role — the same grant the 2026-08-23 entry already listed as
"optional" for narrating status while the retry loop waits, which is now the
load-bearing half. The IAM-free alternative is asserting a commit marker
served by production, which we do not expose today.

Not a launch blocker — nothing was wrong with the code that shipped and the
next merge repaired it. But "merge to `main` auto-deploys to production" is a
standing claim in `CLAUDE.md`, it is what the weekly changelog cadence and
every "shipped" report rest on, and a deploy that silently does not deploy
makes the other green signals worth less than they look.

**The fix is the one named above** (DREAMCRM-86, #639): a step at the end of
the `deploy` job runs `scripts/rollout-check.mjs`, which finds the
`START_DEPLOYMENT` this run's own build started — identified by a
`ROLLOUT_SINCE` mark taken before `start-build`, then latched by operation id —
polls it to a terminal status, fails on anything but `SUCCEEDED`, and then
requires `describe-service` to report `RUNNING`. `ROLLBACK_SUCCEEDED` fails, an
unrecognised status fails, and NO rollout at all fails. `docs/CI.md` has the
mechanics; `tests/guards/rollout-check.test.ts` holds the wiring in place
inside `test` (14 mutations, 14 red).

**Two things this entry's closure does NOT include, both deliberate.** The
root cause of the 2026-09-21 event is still not established — the check makes
the NEXT one visible rather than explaining that one, which is what the entry
asked for. And until the owner-side IAM grant lands (`apprunner:ListOperations`
+ `ListServices` + `DescribeService` on `DreamCRMGitHubActionsDeploy`,
DREAMCRM-65) every call answers `AccessDenied` and the step prints
`rollout UNVERIFIED` and exits 0 — loud, keyed to authorization errors alone,
and self-clearing the day the grant arrives. So the pipeline can now tell a
landed rollout from a lost one as soon as it is allowed to look.
**THE GRANT IS TWO PERMISSIONS PLUS A REPO VARIABLE** (Forge's finding,
Sentinel's call, review of #639). The check resolves the service ARN from the
`APP_RUNNER_SERVICE_ARN` repo variable and falls back to `apprunner
list-services` when it is unset — and it was unset, so the fallback was the
live path and the two-permission ask on the DREAMCRM-65 checklist would have
left every deploy still reporting `rollout UNVERIFIED`. The fix is the
VARIABLE, not a third permission: setting it means `list-services` is never
called, which removes a runtime AWS call from the deploy path, keeps the grant
to what the check actually needs, and leaves the checklist ask correct as
written. So the whole remaining dependency is:

- `apprunner:ListOperations` + `apprunner:DescribeService` on
  `DreamCRMGitHubActionsDeploy` (already on the checklist), and
- the `APP_RUNNER_SERVICE_ARN` repo variable, whose value nobody in the repo
  can derive — the service id is not the `APP_RUNNER_DEFAULT_HOST` subdomain.

A two-permission grant with no variable is not a silent failure: the degrade
path prints the denied call, so the run says `is not authorized to perform:
apprunner:ListServices` rather than shrugging.

· **FIXED (DEGRADED: the rollout is unverified until the DREAMCRM-65 grant and
the `APP_RUNNER_SERVICE_ARN` variable land) — #639** — deliberately not a plain
`FIXED`. Until both arrive every deploy prints `rollout UNVERIFIED` and nothing
is actually watching the rollout, so a bare verdict would stop the ledger
carrying something that is still true. **This entry closes when the grant and
the variable land, not when the PR merged.**

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
  application fee on their own charges. · **FIXED** — the patch is rebuilt
  from a field allowlist (`pickClinicShopConfigPatch`) before it reaches the
  DB, and the client-facing type `ClinicShopConfigPatch` omits the field
  outright, so the fee column has no path in from a server action.
- S2 · patient-portal `loyalty` redeem + `payment-plans` propose · read-then-
  insert TOCTOU (concurrent double-spend / two open plans). · **FIXED** —
  both now use the advisory-lock-then-check idiom the booking path already
  used against slot double-booking: one transaction, a per-patient
  `pg_advisory_xact_lock`, and the balance / open-plan check re-read INSIDE
  it, so the second tap blocks until the first commits and is then turned
  away. The loyalty coupon mint moved inside the transaction too — a failed
  mint rolls the ledger row back instead of relying on a compensating delete.
- S2 · portal message attachments (`sanitizeAttachments`) · accept arbitrary
  `http(s)` URLs (no host allowlist) → staff-inbox tracking-pixel/IP-leak;
  non-TLS accepted. · **FIXED** — `lib/attachment-hosts.ts` derives the
  allowed hosts from the same env the storage drivers read, and
  `sanitizeUploadedAttachments` drops anything else at every WRITE (portal
  action, staff send, scheduled send). Deliberately not applied on READ: a
  URL stored under an older configuration should still render for the staff
  who received it.
- S2 · insurance-OCR image URLs · same class as the attachment hosts above,
  unbundled from it because it was NOT closed with it: `runInsuranceOcr`
  still accepts any `http(s)` URL. No SSRF (Anthropic does the fetching),
  but an outsider can burn the clinic's OCR allowance on someone else's
  bytes. Wants the same `isAllowedAttachmentUrl` gate. · **FIXED** — landed
  on `main` in `11b52176` (DREAMCRM-24, #537) and left reading OPEN here until
  the DREAMCRM-47 reconciliation caught it. The gate it wanted is exactly the
  gate it got: `isAllowedAttachmentUrl` from `lib/attachment-hosts.ts`, at
  `lib/services/insurance-ocr.ts:74`, filtering `imageUrls` before anything is
  metered or sent — and placed in the SERVICE rather than in each caller, so
  the public-site intake and the patient portal are both covered by
  construction instead of by each one remembering. Dropped URLs are logged
  with the allowed hosts, so a storage-env misconfiguration reads as a
  misconfiguration rather than as "OCR stopped working".
  `tests/intake-forms/insurance-ocr-host-adoption.test.ts` scans the source
  tree for a re-implementation of the host check outside the shared module and
  for an entry point that skips it, so a new caller cannot reopen this.
- S2 · `patient-followups` `assignedUserId` (create/update/bulk) · assignee
  not verified as an org member (integrity only). · **FIXED**
  (`assertAssignableInOrg`).
- S2 · all 25 `CRON_SECRET` routes · non-constant-time `!==` secret compare
  (theoretical timing oracle) + 25× copy-paste (drift risk); a shared
  `lib/cron-auth.ts` with `timingSafeEqual` fixes all. · **FIXED** —
  `lib/cron-auth.ts` is that shared gate (`requireCronAuth`), adopted by all
  25 routes. Both sides are SHA-256'd before `timingSafeEqual` so the
  compared buffers are always 32 bytes — comparing raw strings would leak the
  secret's LENGTH through the length-mismatch throw. Fails closed on an unset
  or empty secret, and `tests/cron-auth-adoption.test.ts` fails CI on a new
  hand-rolled copy.
- S2 · `api/internal/custom-domains` · public + cacheable enumeration of
  every custom-domain clinic (data already public; convenient scraper). ·
  **ACCEPTED BY DESIGN** (2026-09-10 reconciliation) — the route documents
  the verdict in place: `middleware.ts` runs on the edge and cannot reach the
  DB, so it fetches this host→slug map to route custom domains, and the
  response is only pairs of facts that are already public (the domain
  resolves publicly; the slug is the clinic's public site path). No PHI, no
  auth to add without breaking the middleware fetch it exists to serve. Not a
  defect — recorded here so the next sweep doesn't re-report it.
- S3/housekeeping · `uploadPatientDocumentAction` writes the S3 blob before
  the patient-in-org check (forged id orphans a blob; no row, no access). ·
  **FIXED** (DREAMCRM-47) — `patientBelongsToOrg` is exported from
  `lib/services/patient-documents.ts` and asked BEFORE `uploadBlob`;
  `addPatientDocument` still asks again on its own account, because a service
  that trusts its caller to have checked is one caller away from not being
  checked at all. The gate belongs in front of the one write here that cannot
  be rolled back. `tests/patients/document-upload-order.test.ts` pins the
  ORDER, not just the refusal.
- S3/housekeeping · `enterDemoMode` doesn't validate the target org
  (self-only, re-validated downstream). Unbundled from the upload defect
  above: same sweep, different file, different fix. · **FIXED**
  (DREAMCRM-47) — the org row was already being read (to decide whether to
  run the demo seeder's self-heal), so the fix is to stop treating a missing
  row as "not the demo clinic" and start treating it as "nothing to render
  as". The cookie IS a tenant context — `getTenantContext` gives it
  precedence over real org membership — so a wire-supplied `orgId` matching
  no organization used to mint a seven-day cookie pointing at a tenant that
  does not exist. `app/(default)/ecommerce/customers/admin-actions.ts` was
  ALSO added to the `auth` rule in `scripts/review-gate.mjs` (and to
  `MUST_BE_GATED`): the file that mints the tenant-context cookie matched
  nothing on the gate list, so a PR changing which org a platform admin can
  become reported "merges on green".

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

- S2 · `stripe` webhook · no `charge.refunded` / `charge.dispute.created`
  handler, so an accrued/paid referral commission is never reversed on a
  refunded/disputed invoice (platform eats it). · **FIXED** (R2 Slice 2) —
  both cases land on the platform webhook and call
  `reverseCommissionForInvoice` (a dispute resolves its charge → invoice
  first). An `accrued` row flips to `reversed` and is kept as audit; an
  already-`paid` row is NOT rewritten — settled money surfaces for a human
  clawback decision instead. Idempotent, never throws.
- S2 · `stripe-connect` webhook · unbundled from the reversal above, which
  closed WITHOUT it: shop/balance/deposit records still stay `'paid'` after a
  Stripe-side refund (`OrderStatus 'refunded'` is never set), so a refunded
  order reads as fulfilled-and-paid on the clinic's own board. Needs the
  Connect-side refund case. · **FIXED** (DREAMCRM-23) — `charge.refunded` and
  `refund.created` now land on the Connect webhook and call
  `recordConnectRefund` (`lib/services/refunds.ts`), keyed on
  `stripe_payment_intent_id` (the one id both events carry and all three
  finalizers stamp). Tenant scoping comes from `event.account`, not event
  metadata — a refund issued from the Stripe dashboard carries none. Migration
  0161 adds `refunded_amount_cents` + `refunded_at` to all three tables.
  A shop order flips to `'refunded'` on a FULL refund only; balance payments
  and deposits keep `status` (its vocabulary is pending/paid/failed and eight
  readers filter on 'paid' — a fourth value would vanish a refunded payment
  out of the reconciliation list the front desk needs it in) and their surfaces
  read the new columns instead. Monotonic by construction, so unordered
  webhook delivery cannot walk a refund backwards.
- S3 · the clinic's "collected" figures do not NET refunds. Everything that
  sums `patient_balance_payment` / `booking_deposit` filters
  `status = 'paid'` and sums `amount_cents` — the collections board's
  "Collected this month", `getCollectedPerWeek8`, loyalty accrual, patient
  lifetime spend — so a refunded balance payment still counts as money the
  clinic kept. New in DREAMCRM-23 only in the sense that the refund is now
  RECORDED (`refunded_amount_cents`) and could be netted; the overstatement
  itself pre-dates it. Shop-order totals are already right: those filter
  `status='paid'` and a fully refunded order leaves that set. Fix shape:
  `sum(amount_cents - refunded_amount_cents)` over
  `status in ('paid','refunded')`, decided once for all of them so the
  surfaces cannot disagree. · **FIXED** (DREAMCRM-32) — the rule is
  `lib/net-collected.ts`, adopted by every clinic-side total: the collections
  board's "Collected this month" and its last-paid column, the Payments hub's
  8-week heartbeat, the Shop hub's revenue tile + trailing-30-day figure,
  "Best sellers" revenue, patient lifetime shop spend (both the list and the
  record), and all three bookkeeping CSVs, which grew a `Net collected`
  column so the number a bookkeeper totals is the netted one. Two decisions
  make it ONE rule rather than eight: the STATUS FILTER DOES NOT CHANGE (a
  refunded balance payment stays 'paid' on purpose, so netting is the only
  thing that makes its total honest; a fully refunded shop order leaves the
  'paid' set and nets to zero either way), and the net is CLAMPED AT ZERO so
  no single row can pull a clinic's month negative. "Best sellers" is the one
  allocation call: Stripe refunds a CHARGE, not a line, so each line is
  reduced by the share of its order that came back — the only split that
  keeps the lines summing to the order's net — while `unitsSold` stays a
  count of units that left the shelf. `tests/guards/net-refunds.test.ts`
  fails on a raw `sum()` over a refundable column, a raw `+=` off one, or the
  subtraction open-coded anywhere else; its red run was watched against the
  live bug in both `collections.ts` and `shop.ts`.
  TWO PROPERTIES OF THE RULE worth knowing before reading a figure it produces
  (Sentinel, review of #557): it NETS BY PAYMENT DATE, so an October refund
  against a September payment reduces September and is invisible in October's
  "Collected this month" and in the current bar of the 8-week heartbeat —
  right for "what we kept", surprising for a clinic reconciling an October
  bank statement; and "Best sellers" pro-rates against the ORDER TOTAL, which
  includes shipping and tax, so a shipping-only refund reduces every product
  line a little. Both are deliberate, and both are the kind of thing the next
  person would otherwise rediscover as a bug.
- S3 · four MORE surfaces showed refunded money as kept, found by the batch
  invariant sweep rather than by the ledger. Split from the netting entry
  above because they are a different failure: not a total that forgot to
  subtract, but a surface that never held the refund columns at all. ·
  **FIXED** (DREAMCRM-32):
  (1) the appointment drawer's "Shop purchases" stat — its own comment claimed
  the SAME source as the patients list's column, and both of those netted, so
  one figure read two different numbers on two pages;
  (2) the drawer's booking-deposit pill, which told the front desk to post
  money to the PMS ledger that Stripe had already sent back (the deposit row
  stays 'paid' by design);
  (3) the patient's printable SHOP-ORDER receipt, stamped "Paid" at full face
  value after a refund — the balance-payment branch 28 lines below it in the
  same file had been doing this correctly since DREAMCRM-23;
  (4) the patient's billing-history row for a shop order, silent about a
  refund while the payment rows beside it said so. (3) and (4) shared one root
  cause: `getMyBills` never selected `shop_order.refunded_amount_cents`.
  THE GUARD LESSON, worth more than the four fixes: `tests/guards/net-refunds.test.ts`
  reported clean through all of this, because it modelled the SQL `sum()` and
  the JS `+=` but not the `reduce` — and the drawer used a reduce. It now
  models all three accumulator shapes. Its new case was then found to have been
  written with BACKSPACE bytes where its word-boundary escapes belonged, so it
  matched nothing and passed on the first try; the red run against the live bug
  is what caught that. A guard authored straight to green proves only that it
  runs. This was the first of three reviews in a row to end on a guard that
  could not fail, which is what produced the one-time audit of the whole
  existing guard suite — **`docs/GUARD-MUTATION-PASS.md`** (DREAMCRM-50): 42
  mutations over 31 guards, 7 of them blind, 14 live defects found behind
  them, and the two regex traps that caused most of it.
- S3 · three clinic-side HISTORY surfaces still read "$400 paid" on a charge
  the patient had been refunded, while the patient's own portal said
  "Refunded to you" — one event, two stories, and a front desk on the phone
  between them. Its own entry because it is not a total that forgot to
  subtract: these are per-EVENT records, whose face value is correct, and what
  they owed the reader was the rest of the story. Found by Sentinel reviewing
  #557, in the same sweep that produced the four above. · **FIXED**
  (DREAMCRM-32) for the two a clinic reads as a narrative —
  `lib/services/patient-timeline.ts` (both the shop-order and the
  balance-payment entries) and `lib/services/thread-activity.ts` — via
  `refundNote` in `lib/net-collected.ts`, which single-homes the WORDING for
  the same reason that module single-homes the arithmetic. The title keeps the
  face value; the subtitle carries what changed since. · OPEN for the third:
  `lib/services/global-search.ts:393` labels a Cmd-K result
  `"<who> — $89.00"` with the order status as its sublabel, so a FULLY
  refunded order already discloses ("refunded") and a partly refunded one
  reads "Paid order" at face value. It is an identifier in a result list
  rather than a record of money, and changing it is a search-UX call — named
  here rather than left unwritten.
- S3 · a refunded online payment still earned its patient loyalty points.
  The balance-payment row keeps `status = 'paid'` after a refund on purpose,
  so the daily accrual sweep read it as money the patient had paid, and
  nothing took back points already awarded when the refund landed later.
  Split from the netting entry above on contact: that one is a SUM reading a
  column it never read, this one is a LEDGER holding a reward that is no
  longer earned — one verdict could not have closed both honestly. ·
  **FIXED** (DREAMCRM-32) — both halves, because a refund can land on either
  side of the sweep: the sweep skips a payment with nothing left on it, and
  `reverseLoyaltyForRefundedPayment` writes a compensating negative
  `kind = 'reverse'` row when the refund arrives afterwards, called
  best-effort from `recordConnectRefund` on EVERY delivery (so a crash
  between the money write and the ledger write is recovered by the
  redelivery rather than stranding the points). A PARTIAL refund keeps the
  award — points per payment are a flat number, not a rate, and the patient
  did pay. The reversal mirrors the EARN ROW's value rather than today's
  settings, so a clinic that raised its award in between cannot claw back
  more than it gave; idempotency is free from the existing unique
  (org, kind, source_id) index with the payment id as the anchor. The
  balance may go negative if the points are already spent — the honest
  outcome, and an already-minted coupon is never voided.
- S2 · `finalizeOrderFromSession` did not know 'refunded' was a terminal
  state, so a refunded shop order could be written back to `'paid'` by a page
  RELOAD. `app/site/[slug]/shop/success/page.tsx` finalizes on every load (an
  unauthenticated GET the shopper keeps in browser history) and a Stripe
  refund does not change the Checkout Session's `payment_status` — so the
  early return at `:302` and the CAS at `:365` (`ne(status,'paid')`) both let
  it through, resetting `paidAt`, burning a single-use coupon a second time,
  decrementing stock a second time, and alerting the clinic about money it had
  just sent back. Introduced by the refund work above and caught at the review
  gate before merge. · **FIXED** (DREAMCRM-23) — 'refunded' joins 'paid' in the
  early return, and the CAS became the POSITIVE `eq(status,'pending')`: the
  negative predicate had to be widened by hand every time a status value was
  added and had already been letting 'cancelled' through.
- S3 · membership and payment-plan refunds still reach no record.
  `recordConnectRefund` looks in `shop_order`, `patient_balance_payment` and
  `booking_deposit`; a refund on a membership subscription or a payment-plan
  installment runs through the same connected account, matches none of the
  three, and is discarded. Now at least logged
  ("refund matched no money record") rather than silent. · **FIXED**
  (DREAMCRM-32), and HALF OF IT WAS ALREADY WRONG WHEN WRITTEN: payment-plan
  installments have always matched. `chargePlanInstallment`
  (`lib/services/payment-plans.ts`) records every installment as a
  `patient_balance_payment` with the PaymentIntent stamped, so a refund on one
  lands on that row — verified in the code before the fix was designed, which
  is the only reason this entry did not grow a table nobody needed. The real
  gap was MEMBERSHIP alone: the `membership` row tracks the subscription, not
  its individual charges, so a refunded membership payment moved the practice's
  bank balance and their software said nothing.
  Migration 0162 adds `connect_refund`, one row per refunded charge, written by
  `recordConnectRefund` whether or not it attached to anything.
  `attached_to = 'none'` is the readable version of that log line, surfaced as
  "Refunds we couldn't match" on Payments → Online (only when there is one —
  an empty "nothing unmatched" panel is a worry with no work in it). Monotonic
  and claimed on (org, payment intent) like the rest of the path, so unordered
  delivery cannot walk a receipt backwards and a redelivery updates its own
  row; a later delivery that attaches UPGRADES the receipt, but one that
  cannot never downgrades an attachment already made. Best-effort — the money
  records are the thing that must land.
- S3 · `shop_config.stripe_account_id` has no unique constraint, and
  `orgIdForConnectedAccount` resolves a TENANT from it with `.limit(1)` on a
  money write path (matching what `syncConnectedAccountStatus` already did).
  Two rows sharing an account id would route one clinic's refund to another's
  records. A unique index would make the isolation structural instead of
  assumed. · **OPEN — written, parked, waiting on one production read.**
  The index is drafted in full at
  `lib/db/migrations/parked/one-stripe-account-per-clinic.sql` (UNIQUE and
  PARTIAL: the column is null for every clinic that has not connected Stripe,
  and again after `disconnectShopStripe` clears it, so a plain unique index
  would be satisfied by those nulls and say nothing). It is deliberately
  OUTSIDE `meta/_journal.json`, so no deploy can run it.
  WHY IT IS NOT SHIPPED: `CREATE UNIQUE INDEX` fails on existing duplicates,
  and on this deploy path a failed migration is skipped in silence and takes
  every later migration with it (the S2 entry directly below). So the order has
  to be check-then-apply, not apply-and-see.
  THE PRECONDITION: the `duplicate-stripe-accounts` check in
  `lib/read-checks.ts` (DREAMCRM-42, `docs/PROD-READ-ACCESS.md`) must return
  ZERO ROWS. That check exists and is dispatchable; it needs the owner's
  one-time DREAMCRM-42 setup (the read-only role, `DATABASE_URL_READONLY` and
  `ADMIN_READ_SECRET`) before it answers rather than 503s.
  It was SPLIT OUT of PR #557 by the DREAMCRM-45 planning decision
  (2026-09-15, bias-to-action): every other defect in that batch had no
  production precondition, and holding them all behind this one lookup was
  keeping finished work off `main`. One defect, one verdict — so this line
  stays OPEN until the index is live, even though its code is written.
  `tests/payments/connected-account-uniqueness.test.ts` freezes the PARKED
  state from both sides: the schema must not declare the index while the file
  exists (or `pnpm db:generate` would emit it into a numbered migration and it
  would apply anyway), no journaled migration may create it, and deleting the
  parked file without the index going fully live fails too.
- S2 · **a failed migration does not stop a deploy, and nothing says so.**
  Found by Sentinel reviewing #557, while checking the deploy note on
  migration 0162 — which claimed a duplicate would halt the deploy. It would
  not. `Dockerfile:62` starts the server first and runs the migrator as
  `(db-migrate && resync-demo) || true`; App Runner has already marked the
  container healthy, `scripts/db-migrate.mjs` retries ~90s and exits 1 into
  that `|| true`, `/api/admin/migrate` returns a 500 nobody alarms on, and
  `.github/workflows/deploy.yml` has no migration step at all. So a failing
  migration ships GREEN, is skipped again on every boot, and — because
  drizzle applies migrations in order — silently blocks every later migration
  behind it. Whatever that migration was protecting is simply off in
  production with a tick beside it. The note in 0162 now says this instead of
  the opposite, but the pipeline is the defect: it is the deploy path, it
  belongs to nobody yet, and it needs its own item and its own owner. · OPEN.
- S3 · a refund that later FAILS is never un-recorded. Stripe decrements the
  charge's `amount_refunded` and fires `charge.refund.updated` with status
  `failed`; `recordConnectRefund` is monotonic by design, so the record keeps
  showing money returned that never left. Rare (mostly bank-level failures on
  older cards), and un-doing it needs an ordering rule the monotonic path
  deliberately does not have — a non-monotonic write would reopen the
  out-of-order hazard the rule exists to close. · **FIXED** (DREAMCRM-47,
  migration 0163 `refund_synced_at` on the three money tables + the
  `connect_refund` receipt). The ordering rule is a WATERMARK, not a
  replacement: we now store WHEN the snapshot we applied was taken, and there
  are THREE cases, not two — strictly newer wins outright (down as well as
  up); strictly OLDER writes nothing at all, because a newer snapshot has
  already decided this charge; and only the genuinely UNORDERABLE (no key, or
  an exact tie) falls back to the old monotonic rule, unchanged. So the
  out-of-order hazard stays closed in both directions.

  The boundary between the last two cases is the whole correctness of this,
  and the first version got it wrong — caught by Sentinel in review, not in
  production. It sent everything "not strictly newer" to monotonic, and
  monotonic RAISES: a failure recorded at t40 was undone by the original
  refund redelivered from t10, putting the money straight back on the books
  with the order flipped to 'refunded' and the watermark still at t40, so
  nothing short of a genuinely newer event would ever correct it. Stripe is
  at-least-once and retries for three days, so that needed no misordering at
  all. **"Not newer" is a larger set than "cannot be ordered"; only the second
  one may fall back.** The suite missed it because the stale-event case that
  existed tested a stale event that would LOWER the total — accurate about
  what it asserted, and named as though it covered stale events generally.

  The ordering key is Stripe's own `event.created`, so there is exactly ONE
  clock and it is not ours. A snapshot we FETCHED (the refund-object events
  re-read the charge) is at least as fresh as the event that triggered the
  fetch, so stamping it with that event's time only ever UNDER-claims its
  freshness — and under-claiming degrades to the monotonic branch, which is
  where we were before. There is no direction in which the new rule is worse
  than the one it replaces. An equal timestamp is a redelivery and re-decides
  nothing.

  The sweep this needed: `recordConnectRefund` writes in FIVE places, and a
  half-applied rule is a record that disagrees with itself. All five follow the
  money down — the three money rows, the `connect_refund` receipt (the only
  place a refunded MEMBERSHIP charge is ever visible, and it was monotonic for
  the same reason), a shop order's `status` going back to 'paid' (this path is
  the only writer of 'refunded', so it takes back its own claim), and the
  LOYALTY ledger, where points clawed back for money that never left are
  returned by `restoreLoyaltyForUnrefundedPayment`. The loyalty call also
  stopped re-deriving the total with its own `Math.max` — a second copy of the
  monotonic rule that would have kept reversing points the ordering rule had
  just un-recorded.

  The refund-UPDATE events are now handled, and — unlike `refund.created` —
  are never skipped on the refund's status, because the status transition IS
  the news. All THREE spellings are accepted (`charge.refund.updated`,
  `refund.updated`, `refund.failed`): Stripe renamed the family and which name
  a connected account emits depends on the API version pinned to it, so
  betting on one would leave the whole fix inert for some accounts with
  nothing saying so. **Ops: subscribe the Connect webhook endpoint to all
  three in the Stripe dashboard — the table is in `docs/OPS.md` under "Stripe
  Connect webhook events", which is where an operator will actually look.
  Until that is done the code is correct and does nothing.**

  Two smaller things the sweep turned up. `lib/net-collected.ts` justified its
  zero-clamp partly on "`refunded_amount_cents` is monotonic by construction",
  which this change makes false; the clamp never needed that premise and the
  sentence is gone. And `listUnmatchedRefunds` now excludes zero-amount
  receipts: the receipt keeps its `refunded_at` when a refund fails (recording
  that a refunded charge was SEEN stays true), but the clinic's
  reconciliation list answers "what left this account with nothing here to
  match", and a refund that failed at the bank left nothing.
- S2 · `referral-payouts.payoutPartner` · double-pay window — after a
  transfer succeeds but the ledger write fails, a manual retry >24h later
  (Stripe idempotency window lapsed) re-derives the same key and sends a
  SECOND real transfer; concurrent payouts also duplicate the payout ledger
  row. · **FIXED** (R2 Slice 2, migration 0150 — `referral_payout.
  idempotency_key` unique). The key is CLAIMED as a `pending` payout row
  BEFORE the money moves and stamped with the transfer id the moment it
  lands, so a later retry sees the transfer already went out and RECONCILES
  the ledger instead of paying again. The failure path marks the claim
  `failed` (next attempt retries cleanly) and success finalizes the SAME
  row — one transfer can no longer produce two payout records.
- S2 · `getMrrSnapshot` stale tier constant duplicated in `projects.ts` +
  `clinics.ts` — single-source the tier→price map (ideally derive from live
  Stripe amounts as `/ecommerce/invoices` already does). · **FIXED**
  (DREAMCRM-23) — the map is GONE rather than deduplicated. The three copies
  disagreed (`{9900, 14900, 19900}` twice vs `{15000, 25000, 20000}` with
  premium priced BELOW pro), so two dashboards computed different MRR from the
  same tenants and neither matched an invoice. `lib/services/platform-mrr.ts`
  is now the one derivation: WHO COUNTS comes from `clinic_profile` (which
  orgs, what tier, demo or not), WHAT THEY PAY comes from the clinic's live
  Stripe subscription. `getMrrSnapshot`, `projects.getSubscriptionStats`, the
  Clinics list column and the Clinics page MRR tile all read it; the two
  dashboards still answer different questions (recognized vs including
  trials) but can no longer disagree about a clinic's amount. A comped clinic
  now contributes a real 0 instead of its tier's list price. Guarded by
  `tests/guards/one-mrr-number.test.ts` (no tier→price map, no second
  summing module, no hand-rolled ÷12).
- S3 · `stripe-admin.monthlyContributionCents` ignores `quantity` /
  `interval_count`, so a multi-seat or every-3-months subscription
  contributes the wrong MRR. · **FIXED** (DREAMCRM-23) — the cadence + seat
  math single-homes in `lib/mrr.ts` (`normalizedMonthlyCents`) and
  `monthlyContributionCents` keeps only its status gate. A quarterly price
  was counted as monthly (3× overstated) and seats were dropped entirely.
- S3 · `listAdminSubscriptions` asked Stripe for ONE page of 100 and stopped,
  so every MRR figure that sums it would have silently omitted the 101st
  paying clinic — the same defect class as the collections header above.
  Found while fixing this line. · **FIXED** (DREAMCRM-23) — it walks pages to
  a documented 20-page bound; an explicit `limit` still means at most that
  many.
- S3 · `shop-checkout.ts:378` — the lost-race branch returns
  `{ ...order, status: 'paid' }`. That was accurate while the only way to fail
  the claim was another writer setting 'paid'; with the positive
  `eq(status,'pending')` predicate a 'cancelled' order whose session reads
  paid also lands there, so the shop success page would tell that shopper
  "your order is confirmed". Nothing is written and no money moves — a
  cosmetic lie on one page, in a state that needs a cancellation AFTER payment
  to reach at all. Returning the row's real status closes it. · **FIXED**
  (DREAMCRM-47) — the lost-race branch re-reads the row inside the
  organization and reports the status it finds. A row that vanished under us
  falls back to what was read on the way in, never to 'paid': the whole point
  is that this branch stops inventing an answer.
  `tests/shop/finalize-lost-race-status.test.ts` models the compare-and-swap
  for real (a claim whose status predicate misses the row matches no rows), so
  the test exercises the lost-race branch rather than a stand-in for it.
- S3 · `listAdminSubscriptions` reads `s.items.data[0]` only, so a
  subscription with more than one item (a plan plus the social add-on, say)
  contributes ONE line's worth to every MRR figure. Pre-dates the MRR work,
  but it now sits under a comment claiming one derivation, and it is the same
  "we only counted the first" shape as the pagination fix directly above it.
  Fix shape: sum `normalizedMonthlyCents` across every item rather than
  reading the head, which also makes `priceId`/`productName` on the row
  explicitly "the primary item" rather than accidentally so. · **FIXED**
  (DREAMCRM-32) — `AdminSubscription` now carries `items`, every recurring line
  on the subscription, and `monthlyContributionCents` sums
  `normalizedMonthlyCents` across them. Each line normalizes on its OWN cadence
  and seat count, so an annually-billed add-on beside a three-seat monthly plan
  is two correct numbers rather than one wrong one. The flattened head fields
  survive as the documented PRIMARY item for the table columns and the
  plan-mix grouping that render one line per subscription; MRR never reads
  them. The head fields are also the FALLBACK for a caller holding a partial
  row — an ABSENT `items` falls back, an EMPTY one means "no recurring lines"
  and contributes nothing. Product names are now fetched for every item's
  product, not just the head's, so an add-on line is named rather than blank.
  The cadence + seat math stays single-homed in `lib/mrr.ts` (the one-MRR
  guard still holds).
- S3 · `lib/prospect-vendors.ts:108` — a FOURTH tier→price map
  (`PLAN_PRICE = { basic: 150, pro: 250, premium: 500 }`) whose comment says
  it mirrors `stripe-config` PLANS, and which has drifted: PLANS prices
  premium at $200 (the founding rate; $500 is the struck-through LIST price),
  so the prospecting deal room quotes a prospect $500/mo for a plan that
  costs $200. Repro: any prospect whose detected vendors include marketing or
  3+ categories → `consolidationEstimate` returns `ourPlanPrice: 500`, which
  renders on the deal room and in the outbound pitch. Not folded into the MRR
  fix: this is prospecting's lane and changing what a prospect is quoted is a
  product decision, not a cleanup. Allowlisted in the new one-MRR guard with
  this reason. · **FIXED** (DREAMCRM-38) — the product decision came back from
  the owner as "the deal room quotes the limited-time $200/mo founding rate",
  and the map is GONE rather than repriced: `consolidationEstimate` reads
  `PURCHASABLE_PLANS` from `lib/stripe-config.ts`, so the deal room, the
  pricing page and Stripe checkout move together on the next reprice. The
  tier SELECTION went with it — since the 2026-07-19 single-plan collapse
  there is one purchasable plan, so a booking+reviews stack was being quoted
  "Pro $250": a plan that is both unsellable AND dearer than the one they can
  buy. The row now reads the founding rate with $500 struck through, framed
  as the billing panel frames it. The one-MRR guard's exemption for this file
  is DELETED, so it is covered like any other; a sibling assertion in
  `tests/prospecting/vendors.test.ts` pins that the only plan money here
  arrives by import (the map guard would not catch a single re-pasted
  `const PREMIUM = 200`), and `tests/prospecting/deal-room-quote.test.tsx`
  pins the rendered row rather than the estimate's return value.
- S3 · `app/(default)/platform/prospecting/demo/[id]/track-picker.tsx:15` — a
  FIFTH copy of the plan prices, found sweeping for siblings of the deal-room
  quote above: `PLAN_LABELS` said "Premium · $500/mo", so the presenter's own
  panel disagreed with the $200 on the pricing page the prospect can read
  during the call. Strings, not numbers, so the one-MRR map guard never saw
  it. · **FIXED** (DREAMCRM-38) — the label derives from `getPlanById`;
  `tests/prospecting/track-picker-plan.test.tsx` pins it.
- S3 · `lib/types/demo-script.ts:161`, `:173` — the closing line of a LIVE
  BRANDED DEMO quoted $500. `DEMO_TRACKS.full.planPitch` ("Everything you just
  saw is the Premium plan — $500 a month, no contracts") and its last beat's
  talk track render at `components/demo/wrap-up.tsx:93`, so this is the last
  number a prospect hears before being asked to sign — more directly the
  defect DREAMCRM-38 exists to close than the presenter-facing picker label.
  Missed by that PR's first sweep, which matched `$N/mo`: "a month" has no
  `/mo`, so the search was narrower than the defect's real spelling and came
  back clean. Found in review. · **FIXED** (DREAMCRM-38) — both sentences
  interpolate `getQuotedPlan()`; `tests/demo-mode/demo-tracks.test.ts` asserts
  the VALUE, beside the pre-existing `/\$\d+/` shape check that stayed green
  the whole time the number was wrong.
- S3 · the demo tracks still recommend LEGACY tiers, in the picker AND in what
  the presenter says. `recommendedPlan` on `DEMO_TRACK_LIST` is one of
  basic/pro/premium and four of the five tracks say basic or pro, so the
  picker truthfully reads "closes on Basic · $150/mo" and the pitches at
  `lib/types/demo-script.ts:184` (`$150`), `:233`, `:280`, `:336` (`$250`,
  with `:222`, `:269`, `:325`, `:354` repeating them in the closing beats)
  quote plans that have not been sellable since the 2026-07-19 single-plan
  collapse. Left as stale-but-honest rather than repointed at `$200`, because
  the question is not the number: does a demo track still "close on" a tier at
  all now that there is one plan, and if not, what do the four non-premium
  tracks say instead? That needs the owner. Repro: open any prospect's demo
  prep page → the track cards, then run a non-full track to the wrap-up. · OPEN.
- S3 · `app/opengraph-image.tsx:69` — the social share card for the whole
  marketing site still reads `$150–500/mo`, the pre-collapse three-tier
  range. It is the price that appears when anyone links dreamcreatestudio.com
  in a text, a Slack, or a tweet, and it contradicts the $200 on the page it
  links to. Repro: `curl -I https://www.dreamcreatestudio.com/opengraph-image`
  or paste the URL into any link-unfurling client. Marketing lane, not folded
  into DREAMCRM-38's prospecting fix. · OPEN.
- S3 · `app/(marketing)/pricing/price-card.tsx:14` — the public pricing page
  carries its OWN `LIST_MONTHLY/RATE_MONTHLY/LIST_ANNUAL/RATE_ANNUAL`
  literals rather than reading `lib/stripe-config.ts`, whose `price` /
  `listPrice` / `annualPrice` / `listAnnualPrice` hold exactly those four
  numbers. They agree TODAY, so nothing is wrong on screen — this is the
  same shape as the deal-room map one reprice before it drifted, filed now
  because that is the only time it is cheap. Repro: change `premium.price`
  in stripe-config and note the pricing page keeps saying 200 while
  checkout charges the new number. · OPEN.
- S3 · `lib/services/demo-clinic/seed-partners.ts:109` — the demo seeds
  partner commissions off a `$500/mo` invoice (`invoiceCents = 50000`), so
  the demo partner portal shows $50 per practice per month while
  `/partner-program` tells real partners "At the $200/mo plan that's $20 per
  practice per month". Money the demo displays, not money that moves. Repro:
  view the demo clinic → the partner portal's commission rows. · OPEN.
- S3 · `lib/services/marketing-blog.ts:50` — the launch announcement post,
  published on the marketing blog, still says the platform costs "$150–500 a
  month": the pre-collapse three-tier range, on a page a prospect can read
  while a presenter quotes them $200. Marketing lane. Repro: open
  `/blog/dreamcrm-is-live` (or whatever slug that entry carries) and read the
  first paragraph. · OPEN.
- S3 · `lib/types/social-entitlements.ts:12` — the comment table documenting
  the social add-on still prices the tiers `Pro ($250) | Premium ($500)`. A
  comment, so nothing renders it, but it is the file the next person reads to
  learn what a tier costs and it teaches them the list price. Repro: read the
  header. · OPEN.
- S3 · the two struck-through list prices name themselves with `aria-label` on
  a bare `<span>` — `app/(marketing)/pricing/price-card.tsx:55` and
  `app/(default)/platform/prospecting/prospect-drawer.tsx:344`. ARIA prohibits
  an accessible name on `role=generic`, so that label is author error: NVDA and
  JAWS honour it in practice and other combinations are entitled not to, in
  which case the reader gets "$500 $200/mo" as one run with nothing saying
  which number is dead. Repro: a screen reader on the public pricing page, or
  on any prospect's deal room. Fix shape: a visually-hidden text node, or move
  the label onto an element that can carry a name (`<s>`/`<del>`) — across BOTH
  sites, since a quiet deviation on one of two identical surfaces is worse than
  a consistent imperfection. Raised by Sentinel reviewing DREAMCRM-38, where
  the deal-room half was written to match the existing sibling deliberately
  rather than diverge from it. · OPEN.
- S3 · nothing in the repo fails when a plan price is pasted somewhere new.
  Four separate surfaces had drifted to quoting $500 (the deal room, the demo
  track picker, the demo script's closing line, the launch blog post) and the
  first three were found by hand, one of them only in review after a sweep
  whose pattern was narrower than the defect. `tests/guards/one-mrr-number.ts`
  catches a tier→price MAP and nothing else; the assertion in
  `tests/prospecting/vendors.test.ts` covers exactly one file. Fix shape: a
  repo-wide guard — no plan-price literal outside `lib/stripe-config.ts` and a
  reasoned allowlist, matching the prose spellings (`a month`, `per month`,
  `/month`) as well as `/mo`. This introduces a new invariant, so it is
  Forge's intake before it is anyone's implementation. Raised by Sentinel in
  review of DREAMCRM-38. · OPEN.
Unbundled 2026-09-10 — these five shipped as ONE entry, which made the whole
line unresolvable while they shared a verdict. Since unbundling, three have
closed on their own evidence (the demo cart, the MRR cadence math, and the
collections header) and two remain open below.

- S3 · stripe-webhook release-and-retry re-fires non-idempotent in-app
  notifications. · OPEN.
- S3 · collections board header total truncated at 200 rows. · **FIXED**
  (DREAMCRM-23) — the header now reads `getCollectionsSnapshot`, the SQL
  aggregate the Payments hub's doorway card already used, so the two surfaces
  cannot disagree; a practice with 340 open balances was previously told its
  outstanding AR was whatever its top 200 debtors owed. "Pay links out" moved
  to a whole-clinic count in the same pass — it was a page number sitting next
  to a clinic number in "N of M". The sum casts to `::bigint` (sum() over an
  int4 column already returns one; the old `::int` would have ERRORED, not
  wrapped, above ~$21M), and the page says when it is showing fewer rows than
  the totals count.
- S3 · legacy `billing_profiles` vanity write (`lib/services/settings.ts`) —
  a table nothing reads back for billing. · **FIXED** (#606, `71e2992a`)
  (DREAMCRM-58) — `upsertBilling` was the only writer; it, `getBilling`, the
  two dead server actions behind them (`saveBilling` / `changePlan`) and their
  input schemas are gone. Bigger than dead code: `changePlan` took a plan name
  straight from its caller and wrote it, so any signed-in user could set
  `billing_profiles.plan` to 'enterprise'. That bought them nothing while
  nothing read the column — and it was one `select` away from self-serve plan
  escalation the day somebody pointed a read at the near-identical table name.
  The truth stays the org-scoped `clinic_profile` (`planTier`,
  `subscriptionStatus`), written by the Stripe webhook.
  `tests/billing/no-billing-profiles-write.test.ts` fails on a READ as well as
  a write — a read arriving is the risk, because it would give the rows the
  retired Plans UI left behind a meaning they never had. DROPPING THE TABLE is
  a migration on the deploy path and is queued in `docs/POST-1.0.md`, not done
  here.
- S3 · `(pay)/ecommerce/pay` demo cart accepts an arbitrary amount (moves no
  real money). · **FIXED** — the page is gone. The whole `(pay)` route group
  went with the Mosaic commerce template it belonged to (DREAMCRM-5, #508): a
  parallel shop nothing linked to, whose fake checkout was the only reason
  this defect existed. Nothing to harden when there is no page.

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
  (`/portal`) and the `/intake-start` gate dead-end on the marketing
  coming-soon page. Mitigated (magic-link EMAIL sign-in bypasses the site
  layout), so not S1 — but the shared-link door is stranded. **R2 scoped
  item**: needs a pathname exemption (middleware-stamped) + a test that a
  pre-live clinic's portal login still resolves. · **FIXED** — R2 Slice 4
  ("the doors are not the marketing site", below) did exactly that: middleware
  stamps `x-dc-access-route` for `/site/[slug]/portal` and `/intake-start`,
  `shouldShowComingSoon` takes an explicit `isAccessRoute` exemption checked
  AFTER `shutDown`, and three tests pin it. SPLIT ON RECONCILIATION
  (DREAMCRM-58 triage, 2026-09-15): this entry ALSO named the portal
  OUT-LINKS, which Slice 4 did not touch and which are a different defect —
  they are the line below, at their own severity. The entry had read OPEN ever
  since Slice 4 merged, which is the exact confusion §1 exists to prevent:
  half of it was fixed, so its one verdict could not be honest.
- S3 · a pre-live clinic's PORTAL OUT-LINKS dead-end on the coming-soon page.
  Split out of the S2 entry above on 2026-09-15 (DREAMCRM-58 triage) because
  R2 Slice 4 closed that entry's doors and not this. Two call sites, both live:
  `app/(portal)/patient/shop/page.tsx:16` redirects to `/site/{slug}/shop`, and
  `app/(portal)/patient/invoices/page.tsx:342` links to
  `/site/{slug}/dental-plans`. Neither path matches the `(portal|intake-start)`
  access-route pattern in `middleware.ts`, so a patient of a fully operating
  but unpublished practice taps Shop in a portal that works and lands on
  "coming soon". Repro: clear `clinic_profile.site_live_at` for a clinic, sign
  in to its portal as a patient, tap Shop. NOT the same fix as Slice 4's, and
  that is why it is its own entry: these are commerce and upsell surfaces
  rather than doors a practice hands out, so exempting them is one answer and
  hiding the out-links while the site is unpublished is another — a product
  call for whoever owns the portal, not a mechanical widening of the regex.
  · OPEN.
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
  return a typed error + the client to surface it. · **FIXED**
  (DREAMCRM-16) — `lib/services/checkout-error.ts` splits messages written
  FOR the patient (`CheckoutError`, passed through) from everything else
  (logged, replaced with one written sentence); both actions return
  `CheckoutStart` and both clients branch on it. Rollback on the way out:
  the shop deletes the never-started `pending` order and releases any
  single-use coupon reservation, membership deletes the `pending` row that
  would otherwise answer the retry with "you already have a join in
  progress" for an hour. The same raw-message leak on the balance path
  (`err.message` straight onto the public `/b/[token]` page) closed with it.
- S2 · the balance-payment path orphans its own `pending` row on the same
  outage — `createBalancePaymentSession` inserts
  `patient_balance_payment` (`lib/services/balance-payments.ts`) before the
  Stripe call with no rollback, and `listPortalPayments`
  (`lib/services/patient-portal.ts`) lists everything except `status='failed'`,
  so a phantom payment shows in the PATIENT's own portal history. No money
  moves and no clinic-side surface reads it (the reconciliation list filters
  to `paid`). Repro: make `stripe.checkout.sessions.create` throw a
  `StripeConnectionError` for a portal balance payment, then load
  `/patient/invoices`. Found by Sentinel reviewing the DREAMCRM-16 fix;
  deliberately not folded into that money PR. · **FIXED** (DREAMCRM-20 under
  DREAMCRM-23) — `createBalancePaymentSession` wraps everything from the
  Stripe call to the return, and `discardUnstartedBalancePayment` deletes the
  row scoped to (org, this exact id, `status='pending'`), best-effort, never
  masking the original Stripe error. Decided at the DREAMCRM-22 planning
  meeting: DELETE rather than a terminal `failed` status, so all three money
  paths share one rule — a row every future query must remember to exclude is
  how this bug happened.
  Deliberately NARROWER than `discardUnstartedOrder`: no
  `stripe_checkout_session_id IS NULL` predicate. Nothing is keyed off a
  balance-payment row the way a coupon reservation is keyed off an order, and
  leaving it out closes the `!session.url` case (see the next line).
- S3 · `discardUnstartedOrder` (`lib/services/shop-checkout.ts`) cannot clean
  up its OWN `!session.url` path. That throw fires one line after the id-stamp
  UPDATE, so `stripe_checkout_session_id` is set and the cleanup's
  `IS NULL` predicate matches nothing — the phantom 'pending' order survives
  in the clinic's Orders list. Repro: make `sessions.create` return a session
  with `url: null`, start a shop checkout, look at /shop/orders. Narrow (the
  hosted session always carries a URL in practice; this is the defensive
  branch), and the predicate is load-bearing for the coupon release's
  "was it deleted or never written" question, so the fix needs that reasoning
  re-earned rather than the predicate simply dropped. · **FIXED** (#606,
  `71e2992a`) (DREAMCRM-58) — the predicate is dropped, and it did not
  survive the re-earning. It never did the job its comment credited it with
  ("cannot collide with the finalizer's lookup key"): the case it would have to
  catch is `sessions.create` succeeding and the id-stamp UPDATE then throwing,
  which leaves the column NULL and was deleted regardless. The guarantee is
  what the comment already said it was — NO URL WAS EVER HANDED OUT, because
  the only caller rethrows instead of returning — so what remains is the scope
  that was load-bearing: this org, this exact `orderId`, `status='pending'`.
  The coupon release is re-derived as three exhaustive cases (deleted →
  release; never written → release; still there, which can now only mean NOT
  PENDING → keep holding), decided by the survivor lookup rather than by the
  predicate. Same choice, same reason, as `discardUnstartedBalancePayment`
  above, so both money paths share one rule. THE SECOND SYMPTOM is worth
  recording because this entry never named it: with the order surviving, the
  survivor lookup read "not gone" and the single-use promo code stayed locked
  for the full 24h COUPON_RESERVATION_TTL_MS — the exact lockout the rollback
  exists to avoid, re-created in Postgres. Three cases in
  `tests/shop/checkout-stripe-outage.test.ts`; the red run is worth copying —
  TWO of them PASSED with the defect live, because the mock db returned its
  canned rows for any WHERE at all and so could not see a predicate matching
  nothing. The delete mock now evaluates `IS NULL` against whether an UPDATE
  stamped the column.
- S2 · `send-reminders` has no per-ORG try around the candidate/priorLogs
  queries, so one org's query throw 500s the route and silences the tick for
  everyone (near-S1); and its idempotency is a read-before-send with the log
  written AFTER `deliver`, so an overlap/retry can double-send. · **FIXED** —
  both halves, in two slices. The per-org (and per-appointment) isolation
  landed in R2 Slice 3; the atomic claim landed in R2 Slice 9 as exactly the
  shape prescribed here — `onConflictDoNothing().returning()` against a
  unique index on `(appointmentId, template)`, PARTIAL so it covers only
  automated touches. The S4 sweep and R2 Slice 3 found this same defect
  independently; both records now point at the same fix.
- S2 · a campaign that crashes mid-`sendCampaign` is stranded `active` with
  no requeue and no per-recipient resume (partial send, rest dropped). ·
  **FIXED** (R2 Slice 8, `919ee625`) — `requeueStuckCampaigns` re-arms a
  campaign left `active` and untouched for 30 min, and
  `dropAlreadySentRecipients` makes that requeue safe: anyone already carrying
  a 'sent' event is skipped, so the re-run finishes the tail instead of
  re-mailing. FAILS OPEN — an unreadable events table sends the full list,
  since treating a failed read as "everyone got it" would silently cancel a
  real campaign.
- S2 · `publish-scheduled-posts` has an unwrapped per-post loop + no
  `status='scheduled'` guard on the flip (one throw aborts every remaining
  post INCLUDING other clinics'; two overlapping runs both flip and both write
  a ledger entry, double-reporting the publish). · **FIXED** —
  `publishDueScheduledPosts` (`lib/services/blog.ts`) wraps each post and
  claims it with a CAS on `status='scheduled'`; a lost claim is a `continue`,
  not an error.
Unbundled 2026-09-10 (DREAMCRM-23) — these shipped as ONE entry and both
halves were in fact already fixed, which neither could be recorded as while
they shared a verdict.
- S2 · a NexHealth outage during an appointment/patient CREATE burns the
  6-attempt write-back cap instead of parking in the WAITING lane (only the
  cancel path classifies offline errors as `PmsWriteWaitingError`). ·
  **FIXED** — R2 Slice 7 covered the appointment leg centrally in
  `settleWriteFailure`; DREAMCRM-24 closed the PATIENT leg, which had gone on
  swallowing its failure and reporting it to the queue as a counted error.
Unbundled 2026-09-15 (DREAMCRM-57) — the ten-clause S3 line below was one
entry with one verdict, and by the time anyone came to close it the clauses
had three different answers. Split on contact, one defect per entry, each
carrying its own. The eleventh entry is a gate hole the work turned up.

- S3 · `autoSendDueReviewRequests` runs its per-org body bare — only the SEND
  is wrapped (inside `fireReviewRequestForAppointment`), so a DB blip on ONE
  clinic's config read or candidates scan throws out of `for (const org of
  orgs)` and every clinic behind it loses the hour. Which tenants lose it is
  whatever order the config table returns. · **FIXED** (#592, `13f42218`) —
  the loop body moved into `sweepOneOrgForReviewRequests` so exactly one org's
  work sits inside the try; a failed org is reported with `appointmentId:
  null` rather than swallowed.
- S3 · `customizePendingServices` has the same shape: only the AI call is
  wrapped, so a failing services write or `recordAction` ends the sweep for
  every clinic behind it. · **FIXED** (#592, `13f42218`) — `customizeOneOrg`,
  same pattern.
- S3 · `customizePendingServices` writes `clinic_profile.services` as a
  read-modify-write: it reads every clinic's array at the TOP of the run,
  spends minutes in AI calls, then writes that stale array back — silently
  reverting anything the clinic changed in Website Studio meanwhile (a new
  service, a rename, a deletion), from a cron they never saw. · **FIXED**
  (#592, `13f42218`) — re-reads the row under `FOR UPDATE` inside a
  transaction and merges the new blobs onto the CURRENT array by service id,
  the same lock-then-merge shape `shop-checkout.ts` uses for inventory. The
  ledger entry now names the pages that LANDED rather than the ones the sweep
  set out to write.
- S3 · the trial-reminder milestone is stamped AFTER the send
  (`trialRemindersSent: [...sent, milestone]`), so two overlapping runs of an
  at-least-once cron both pass the in-JS `dueTrialReminder` check against the
  same snapshot and both email — and a send that succeeds followed by a stamp
  that fails re-emails on the next tick. A trial reminder arriving twice reads
  as a dunning notice from a company unsure whether you paid. ·
  **FIXED (#596, `1c57f4f1`)** — the append and the not-already-sent test are
  one statement (`coalesce(…) || $1::jsonb` under `not (… @> $1::jsonb)`), claimed
  BEFORE the send; a failed send releases the claim so the reminder is not
  lost to a Resend blip. Every bound parameter carries an explicit cast
  (`jsonb ||` and `jsonb -` are both overloaded → 42P18 at PARSE time), pinned
  by `tests/billing/trial-milestone-claim-sql.test.ts` against the real
  dialect — the `autonomy-sql` guard's lesson, applied to the second instance.
- S3 · `requeueStuckScheduledMessages` SELECTs the stuck ids and then UPDATEs
  by `id in (…)` with nothing else in the WHERE, so a flush that finishes
  between the two statements has its 'sent' row flipped back to 'pending' and
  the next flush sends the patient the same message again. A 'failed' row is
  resurrected the same way, discarding the error staff were about to read.
  The row most likely to lose that race is exactly the one the function exists
  for: the one sending for almost precisely `olderThanMs`. ·
  **FIXED (#596, `1c57f4f1`)** — one atomic `UPDATE … RETURNING` with
  `status='sending'` folded into the predicate.
- S3 · a prospect enrollment wedges permanently on a failed touch: the
  touch-log row is marked 'failed' and the loop moves on WITHOUT touching the
  enrollment, leaving it `active` with `nextSendAt` in the past. `due` is
  ordered by `nextSendAt` ascending so it sorts FIRST on every later tick, its
  claim conflicts with its own failed row, `onConflictDoNothing` returns
  nothing, and the run skips it in silence — forever, while holding a slot in
  an allowance-limited batch. A handful of dead addresses starve the whole
  outreach queue. · **FIXED (#596, `1c57f4f1`)** — a failed send backs
  the enrollment off by `TOUCH_RETRY_AFTER_MS`, and the claim became
  `onConflictDoUpdate` with `setWhere status='failed' and sentAt >= now -
  TOUCH_RETRY_WINDOW_MS`: still a claim (a run racing the live sender matches
  nothing), but able to take its own failed row back inside the window. Past
  the window the enrollment stops `stopped_undeliverable` rather than retrying
  forever.
- S3 · the booking `emailSent` flag is optimistic — set to `true` BEFORE a
  fire-and-forget `sendBookingConfirmationEmail` whose only failure handler is
  a `console.error`. The post-booking screen tells a patient in the PAST TENSE
  that a confirmation is on its way when the send was already rejected, and
  they go off and wait for it. · **FIXED (#599, `23d8214e`)** — the send is
  awaited and the flag reports what happened. `emailSent: boolean` became
  `emailStatus: 'sent' | 'no_email' | 'email_off' | 'not_sent'`, because two
  states were covering four. The old false branch read "We don't have your
  email", which was also what a patient saw when we DID have it and the send
  had failed — the one person who most needed to save the on-screen details,
  told the opposite of what happened. `email_off` arrived in Sentinel's review
  of the same PR: folding "the clinic switched this off" into `not_sent` made
  the screen apologise ("we couldn't get one out to you just now") for a
  setting the practice chose on purpose, which is the same defect one state
  further along.
- S3 · the Monday standup ignores THE KILL. Every other outbound sweep checks
  `listShutDownOrgIds` — reminders, review asks, retention, campaigns,
  scheduled messages, proposal generators, the morning digest, `pms-sync` —
  and `sendWeeklyStandups` does not, so the one weekly email an expired
  unconverted practice still gets is a cheerful report of the work a
  switched-off machine did for them. · **FIXED (#600, `72eb5d9d`)** —
  checked BEFORE the week is claimed, not just before the send, so paying
  releases the standup untouched on the next Monday.
- S3 · a `pms-sync` config throw skips the Guardian signal. A throw out of
  `runImport` happens BEFORE a `sync_run` row exists, so the failure-streak
  rule — which counts `sync_run` rows — can never see it, and the cron's catch
  treats an UNUSABLE connection (no Customer Key, an incomplete NexHealth
  binding, no client for the provider) exactly like the benign concurrency
  stand-down. The Guardian goes on reporting that practice `healthy` for as
  long as the bridge stays down. · **FIXED (#600, `72eb5d9d`)** — the
  stand-down throws a typed `PmsSyncInFlightError` (a class, not a message:
  matching on copy anyone may reword is not a classification) and only that
  one is silent; everything else reports to the Guardian. The clinic's streak
  EMAIL still does not fire — that rule keys off `sync_run` rows and these
  produce none.
- S3 · `app/api/upload` answers a bodyless 500. Every refusal on the route
  returns `{ error }` and every caller reads `res.json().error`, but
  `request.formData()` (a truncated multipart body) and `uploadBlob` (S3
  credentials, a bucket policy) are unwrapped — so the request becomes an
  unhandled rejection and Next answers with a framework 500 carrying no JSON.
  The one failure staff can do nothing about is the only one that tells them
  nothing. · **FIXED (#600, `72eb5d9d`)**.
- S3 · staff billing actions unwrapped. `startStripeCheckout` and
  `openBillingPortal` in `app/(default)/settings/actions.ts` throw
  `new Error('We couldn't start checkout just now…')` and friends, and in
  production Next replaces a thrown server-action message with an opaque
  digest — the same defect `submitContactRequest` was fixed for (it returns
  `PublicFormResult` now, see `lib/services/public-form-error.ts`), and the
  same class §2d records as 22 assertions that passed while production showed
  patients an error digest. · **OPEN.**
  THE REPRODUCTION, so whoever picks this up is not rediscovering it:
  - `settings/billing/subscription-panel.tsx:163` and `:176` already
    `catch (err) { setFeedback({ error: (err as Error).message }) }` — that
    renders the digest, not the sentence, and a test asserting
    `.rejects.toThrow(…)` passes either way because a thrown message survives
    in the test process and nowhere else.
  - `components/ui/trial-ended-wall.tsx:96` is the harder half and the reason
    this is its own slice: it calls the action through
    `<form action={startStripeCheckout.bind(null, …)}>`, so there is nothing
    to read a returned `{ error }` with. It needs `useActionState` to show a
    message — a visible UI change on the LAST screen a clinic sees before
    losing access, which is where a dead button costs the most.
  - `components/ui/billing-dunning-banner.tsx:46` swallows deliberately
    (nothing to surface from a non-interactive banner) and can keep doing so.
  - Note the success path REDIRECTS (`redirect()` throws NEXT_REDIRECT), so
    the converted signature is `Promise<{ error: string }>` that only ever
    returns on failure — do not wrap the redirect in the try.
- S3 · `app/site/[slug]/actions.ts` matched nothing in `GATE_RULES`, so a PR
  touching it reported *merges on green* — and `submitBookingRequest` prices
  the clinic's per-visit-type deposit through `visitTypeDepositCents` and
  opens a Stripe Checkout session for it via `createBookingDepositSession`.
  Its two siblings `shop/actions.ts` and `membership/actions.ts` are on the
  money rule for exactly that reason; this one was missed on the same pass. ·
  **FIXED (#599, `23d8214e`)** — added to the money patterns and pinned
  in `MUST_BE_GATED`. A pattern and not an area, so the count stays at nine
  and `rulebook-drift` stays green.
- S3 · `deliver()` (`lib/email.ts:122`) has NO deadline — the Gmail token
  fetch and send, or SES/Resend, run to the default socket timeout. That was
  survivable while every patient-facing caller fired and forgot; #599 puts an
  awaited send inside the public booking action, so a hung provider is now a
  patient sitting on a spinner after their visit is already committed. Found
  by Sentinel reviewing #599 and deliberately NOT taken there: changing the
  timeout behaviour of the one shared send path deserves its own slice rather
  than a rider on an approved diff. · **OPEN.**
  What it is NOT: data loss. `insertAppointmentIfBookable`'s advisory
  re-check means a resubmit cannot double-book, and the appointment row is
  already committed before the send — the cost is the wait.
  A bounded wait around the booking send would also make `not_sent` reachable
  in bounded time instead of at the socket timeout, which is the state that
  tells the patient to save their details.

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
  Needs a UI pagination change too, so it's a dedicated slice with tests. ·
  **FIXED** across two slices: R2 Slice 1 took the projection and the unbounded
  fan-outs, R2 Slice 10 the page bound with the filters and sort that had to
  precede it. THE headline perf slice is closed.
- S2 · `resolvePatientAudience` has the same JS-aggregation-of-all-appointments
  anti-pattern (shared root cause), and it's hit by the retention cron (×4/day
  per clinic), the marketing send path, and the proposal generators. ·
  **FIXED** — the last-visit / upcoming / unconfirmed lookups now roll up in
  Postgres (`max(start_time)` for the last visit; the other two are pure
  existence checks, so the grouped patient id is all they need). Each returns
  at most ONE row per patient instead of every appointment in the org, and
  each is skipped entirely unless the filter actually asks for it.
- S2 · `/messages` `listPatientThreads` has no `LIMIT` and filters search in JS
  over the full set. · **FIXED** — a clamped `LIMIT` (`clampRowLimit` over
  DEFAULT/MAX_THREAD_LIMIT) fetching one extra row to learn `hasMore` without
  a count query, and the whole search pushed into SQL: name/email/preview via
  `like` on lowered columns, plus a forgiving digits-only phone compare so
  "(512) 555-9117" still matches "9117".
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
  give them a wall-clock budget + resumability before onboarding many clinics.
  · **FIXED** — R2 Slice 12 (DREAMCRM-24). (The `listMessagesInThread` clause
  bundled here was already **FIXED** — it reads through
  `listMessagesInThreadPage` with a clamped limit.)

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
root as the S4 public-checkout-wrap item). · **FIXED** — R2 Slice 11
(DREAMCRM-24).

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

### Fixed — /compare/[vendor] scrolls sideways 212px at 390 (found 2026-09-15)

**S3 · marketing site · the capability matrix drags the whole document wider
than the phone.** Found by the three-width check on DREAMCRM-71 (tone tiles),
which touched two list markers on this page and nothing else — **the defect is
pre-existing and unrelated to that change**, isolated below rather than
assumed.

`BRAND.md` Part 10 makes this build-blocking in its own words — *"Zero
horizontal scroll at any width… check it by measuring `scrollWidth` against
`clientWidth`, not by looking at it"* — so it is recorded with the measurement
rather than a description.

**Reproduction**, `/compare/weave` at 390 x 900 (every vendor slug does it;
they share one template):

| Probe | Result |
|---|---|
| `documentElement.scrollWidth - clientWidth` | **+212px** |
| `window.scrollTo(9999, 0)` then `window.scrollX` | **212** — the page really does pan, it is not a measurement artifact |
| same measure with every `.mkt-tile` removed | **+212px** — not the tone tiles |
| same measure with `document.querySelectorAll('table')` removed | **+0px** — it is the matrix, alone |

**A second, independent instrument names the same element** — an axe run
(`wcag2a/2aa/21a/21aa`, the gate's own tag set) over the five marketing pages
at all three widths returns exactly one live finding, and it is on this same
`.overflow-x-auto`. **That is a SEPARATE defect and it has its own entry
below** (Sentinel's note on #617: one defect per entry, or the wrong fix
closes both). The two are related only in that one fix — reflowing the matrix
at 390 — would happen to resolve both.

**The element:** `app/(marketing)/compare/[vendor]/page.tsx:107` —
`<table className="w-full min-w-[42rem] …">`, rendered 672px wide inside a
390px viewport. Its wrapper on line 106 already carries `overflow-x-auto`, so
the intent was right; what a fix has to explain is why that container is not
containing it. A scan for elements whose `right` exceeds the viewport and which
have NO `overflow-x: auto|hidden|scroll` ancestor returns **zero** — i.e. no
element is escaping on its own, and the document is being widened through the
scroll container rather than past it. The usual cause of that shape is an
ancestor that is a flex/grid item without `min-width: 0`, so it sizes to
content instead of to its track; that is a lead, not a diagnosis.

**Not fixed here on purpose** (§10): it does not block the tone-tile work, it
is UI correctness rather than brand character, and a layout fix to a page this
PR only touched two list markers on would change how the diff classifies.
Handed to Vesper with this reproduction.

**ROOT-CAUSED AND FIXED on DREAMCRM-76 (Daylight Dream move 6 page 2), and the
lead above was WRONG — read the correction, because the mechanism is a trap
that will catch somebody else.** Nothing was sizing to content: every ancestor
of the scroll box measured `display: block`, computed `min-width: 0px`, and
390px wide. The tell was already in the reproduction table and nobody had asked
it — `document.body.scrollWidth` was **390**, correct, while
`documentElement.scrollWidth` was **602**. A document that widens where its own
body does not is not an in-flow overflow at all.

**The actual cause: `MatrixMark`'s `sr-only` spans.** Tailwind's `sr-only` is
`position: absolute`, and no ancestor inside the `overflow-x-auto` wrapper was
positioned, so the containing block of all 26 of them resolved to the INITIAL
containing block — outside the scroller (`offsetParent` read `BODY`). An
absolutely-positioned descendant whose containing block is outside a scroll
container contributes nothing to that container's scrollable overflow; it
contributes to its real containing block's. Each span therefore sat at its
static position inside the 672px table — the rightmost at **x = 601.5** — and
widened the document. 601.5 → 602, and 602 − 390 = **212**.

Isolated rather than argued, two ways, each taking the overflow to **+0**:
deleting only the `sr-only` spans, and setting `position: relative` on the
wrapper alone (which gives them a containing block inside the scroller).

**Why the entry's own scan hid it, which is the transferable half.** "A scan
for elements whose `right` exceeds the viewport and which have NO `overflow-x`
ancestor returns zero" was a true measurement that could not answer the
question. Those spans DO have an `overflow-x` ancestor in the DOM tree — and
DOM ancestry is not what governs scrollable overflow. The containing-block
chain is, and for an abspos element the two come apart. **A zero-escaping-
elements result does not mean zero elements escaped**, so grade the DOCUMENT,
not the elements.

**The fix does not depend on knowing any of that**: the matrix now reflows to a
card per capability below `md` and is a `<table>` with no `min-width` from `md`
up, so there is no scroll container on the page at any width. Verified +0 and
`scrollX` 0 on all EIGHT vendor slugs × 390 / 834 / 1440, and
`e2e/marketing-viewport.spec.ts` now holds every marketing page there — the
guard Part 10 has wanted since it was written. Watched to fail against this
exact defect: on the pre-fix file it reddens the eight vendor stops at 390 with
`+212`, and only those. · **FIXED — merged 2026-09-16 (#621, `57e289fa`)**

### Fixed — the compare capability matrix is a scroll region with no keyboard way in (found 2026-09-15)

**S3 · marketing site · WCAG 2.1.1.** `app/(marketing)/compare/[vendor]/page.tsx:106`
— the `div.overflow-x-auto` wrapping the feature matrix scrolls horizontally
and holds no focusable content, so a keyboard-only reader cannot reach the
columns that are off-screen. axe names it directly:
`scrollable-region-focusable`, *"Scrollable region must have keyboard access"*,
measured at 390 × 900 on `/compare/weave`. It is the ONLY live axe finding on
the five marketing pages across 390 / 834 / 1440 — the other 382 sit inside
`aria-hidden` product mocks and are pardoned under WCAG 1.4.3.

**Filed separately from the sideways-scroll entry above on purpose**, which is
the whole point of the one-defect-one-entry rule: the two share an element but
not a fix. Reflow the matrix at 390 and both go away; keep the box and let it
scroll — a perfectly reasonable answer for a wide comparison table — and the
width defect closes while THIS one survives with no entry of its own. In that
case the box needs `tabindex="0"` plus an accessible name (`role="region"` +
`aria-label`, or `aria-labelledby` pointed at the "Feature by feature"
heading).

Same lane and same hand-off as the entry above — UI correctness, Vesper.

**FIXED on DREAMCRM-76 by the first of those two answers**, which is the one
`BRAND.md` Part 10 was always going to force: the matrix reflows below `md`
instead of scrolling, so there is no scroll region left for the rule to be
about. Not a `tabindex="0"` — adding a tab stop to a box that no longer scrolls
would be a focus trap for no reader's benefit.

**Confirmed with the instrument that raised it**, both directions, at 390 × 900
on `/compare/weave`: axe (`wcag2a/2aa/21a/21aa`, the gate's own tag set) returns
this finding on `.overflow-x-auto` on the pre-fix file and **zero violation
nodes** on the rebuilt page. Re-run clean on `/compare`, `/compare/weave` and
`/compare/patientpop` at all three widths.

**The filed-separately decision was right and is worth keeping.** The two did
share a fix in the end — but only because the width answer chosen was the
reflow. Had the scroll box been kept and given `min-width: 0` plumbing, the
width entry would have closed and this one would have survived with no entry of
its own, which is exactly what the one-defect-one-entry rule exists to prevent.
· **FIXED — merged 2026-09-16 (#621, `57e289fa`)**

### Open — the Dream Create wordmark is invisible to every dark-OS visitor (found 2026-09-16)

**S2 · marketing site · WCAG 1.4.3, and it is the company lockup on every
page.** Found by the both-themes check on DREAMCRM-72 (Daylight Dream move 4),
which re-skinned the header around this without touching the logo — **the
defect is pre-existing and unrelated to that change**, isolated below rather
than assumed.

**Measured, as rendered** (Playwright, production build, `/why` at 1440):

| Probe | `prefers-color-scheme: light` | `prefers-color-scheme: dark` |
|---|---|---|
| `<html>` class | `… light` | `… dark` |
| wordmark computed `color` | `rgb(16, 24, 46)` | **`rgb(255, 255, 255)`** |
| the ground it rides | `#ffffff` | `#ffffff` |
| contrast | 17.62 | **1.00** |

**The element:** `components/brand/dream-create-logo.tsx:121` and `:149` —
`restClassName="text-[--brand-ink,#22304E] dark:text-white"`. The marketing
layout forces a light page (`app/(marketing)/layout.tsx`, `bg-white
text-gray-950`, zero `dark:` classes anywhere under `app/(marketing)`), but
`next-themes` still puts `.dark` on `<html>` from the OS preference — so the
wordmark's `dark:` half fires on a ground that never went dark. White on white.
The bubble MARK still paints (it has its own gradient fill), so what a
dark-OS visitor sees is the "D" alone with the words gone.

**Why no guard caught it, which is the transferable part.**
`tests/a11y/dark-mode-parity.test.ts` exists for exactly this shape — a
`dark:text-*` with no `dark:bg-*` beside it — and it declined here because the
LIGHT half is `text-[--brand-ink,#22304E]`, an arbitrary CSS-var value rather
than a `text-<ramp>-<step>` the resolver can grade. A false negative in the
documented direction, on the one element where the pair is 1.00.

**The footer already works around it**, which is how long this has been true
without being seen: `MarketingFooter` passes
`wordmarkClassName="text-white [--brand-ink:#fff]"` with a comment explaining
that the footer is dark in both themes. Somebody hit this pair from the other
side, patched their own call site, and the header kept the bug.

**Not fixed here on purpose** (§10): a fix has to choose between changing the
shared `components/brand/` component — which also renders on the dashboard, the
auth shell and the portal chrome, all outside the marketing lane — and scoping
the override to the marketing header the way the footer did. That choice
belongs to whoever owns those surfaces. UI correctness, Vesper. · OPEN

### Fixed — the cinema stage carries two sub-12px literals at reading size (found 2026-09-16) · FIXED (#633, `866991f5`)

**S3 · marketing site · `BRAND.md` Part 4.** Part 4 sets a 12px floor for this
site — *"No `text-[11px]`, no sub-0.75rem literals"* — and
`components/marketing/cinematic-spine.tsx:609` and `:621` render
`text-[0.72rem]` = **11.52px** on the avatar initials and the status chips
inside `CinemaStage`.

**Why it is a defect rather than a mock at 7px.** `BRAND.md` Part 7 is explicit
that the cinema stage is the one illustration on this site NOT covered by
`DECORATIVE_MOCKS` in `e2e/axe.ts`, precisely because it is the product at full
bleed and its type is real reading size — that is the argument the whole
section is built on. A run below the site's own floor is inside the surface
that argument applies to.

**Why nothing catches it:** `tests/a11y/legibility-floor.test.ts` skips
`components/marketing` wholesale, because the product mocks in that directory
imitate a real screen at 7px. DREAMCRM-72 closed that gap for the shared chrome
only (`tests/marketing/chrome-legibility.test.ts` grades the header, the footer
and `PageHero` by component), and deliberately did not widen to the spine —
scoping a floor to a surface that scales under a scroll-driven transform is a
different instrument from listing three components.

**FIXED on DREAMCRM-82**, on this entry's own stated rule rather than as a
blanket raise: that PR rebuilds `CinemaStage` (the four-scene stage), so both
elements the literals sat on were being written anyway — the same argument that
closed `resources/guide-ui.tsx:98` on DREAMCRM-79 and left the other seven
alone. Both are `0.75rem` now, and the whole surface (moved to
`components/marketing/cinema-scenes.tsx`) carries nothing under it.

**What this does NOT close:** the instrument. `tests/a11y/legibility-floor.test.ts`
still skips `components/marketing` wholesale and still nothing grades the stage
by component. That is the entry below, which is why these were two entries.
· FIXED (#633, `866991f5`, merged 2026-09-17)

### Open — nothing grades `app/(marketing)` against Part 4's 12px floor (found 2026-09-16)

**S3 · marketing site · `BRAND.md` Part 4.** Part 4 sets a 12px floor for this
site — *"No `text-[11px]`, no sub-0.75rem literals"* — and **three** live
literals sit under it, at 0.72rem = **11.52px** (**was seven**; re-derived
2026-09-17):

| File | Line |
|---|---|
| `components/marketing/ui.tsx` | 1530, 1768, 1828 |

**FOUR OF THE SEVEN HAVE CLOSED, each on this entry's own stated rule and none
of them by widening the scan.** `app/(marketing)/docs/page.tsx` and
`app/(marketing)/roi/roi-calculator.tsx` went on DREAMCRM-80 (move 6 pages 6a
and 6b), which rebuilt both pages; the two `cinematic-spine.tsx` rows went on
DREAMCRM-82, which rebuilt `CinemaStage` — see the entry above, which is the
DEFECT half of this pair. The three that remain are all inside `ui.tsx`'s
product mocks (`PortalMock`, `ReviewsMock`, `RecallFunnelMock`), i.e. the
population the skip's stated reason is actually about.

(Line numbers are against `main` as of DREAMCRM-79. Re-derive with
`git grep -n "className=.*text-\[0\.7[0-4]rem\]" -- "app/(marketing)" components/marketing`
rather than trusting them — the count is the durable fact, not the lines. The
`className=` is load-bearing since DREAMCRM-79: the bare pattern now also
matches a DOCBLOCK in `app/(marketing)/resources/guide-ui.tsx` that quotes the
literal while explaining its removal, and a re-derivation that counts a comment
reports a defect that is not there.)

**WAS EIGHT — `app/(marketing)/resources/guide-ui.tsx:98` CLOSED on
DREAMCRM-79** (move 6 page 5), on this entry's own stated rule rather than as a
blanket raise: the PR was rebuilding the element it sat on (the `ScriptCard`
caption), which is exactly why the three `compare` literals were fixed and
these eight were not. It is `MONO_LABEL` now — 0.75rem, single-homed.

**The count going 8 → 7 → 3 without the instrument moving is the thing to read
off this entry.** Every closure so far happened because somebody was already
rebuilding the element, which is the right way for a literal to get fixed and
the wrong way for a FLOOR to get enforced: the three that are left are exactly
the ones nobody has had a reason to open, and they will still be there when the
next re-derivation happens. That is the argument for the by-component
instrument below, not against it.

**This is a DIFFERENT gap from the cinema-stage entry above, which is why it is
its own entry.** That one is about `SKIP_DIRS` in
`tests/a11y/legibility-floor.test.ts` pardoning `components/marketing`
wholesale — a deliberate skip with a stated reason (the product mocks in that
directory imitate a real screen at 7px). This one is about `SCAN_DIRS` in the
same file, which is `['app/(default)', 'app/(portal)', 'app/(double-sidebar)',
'components']` — **`app/(marketing)` is not in it at all.** The three
`app/(marketing)` rows above are in no tree any guard walks, under any
exemption, for no stated reason. The five `components/marketing` rows are
inside the skipped directory and need the same by-component treatment
`tests/marketing/chrome-legibility.test.ts` gave the shared chrome on
DREAMCRM-72. **All five are decorative** — `ui.tsx:1395/1633/1693` are inside
`PortalMock`, `ReviewsMock` and `RecallFunnelMock`, and
`cinematic-spine.tsx:609/621` are inside `CinemaStage` — so all five are very
likely correct under that skip's real reason, which is exactly why the
instrument has to grade by component rather than by path. Note that
`aria-hidden` is NOT what earns them the pardon (`CinemaStage`'s own docblock
says so): imitating a real screen at real-screen scale is.

**Found by** the DREAMCRM-76 sweep while fixing the two compare literals in the
same family (`compare/[vendor]/page.tsx:147,153` and `compare/page.tsx:75`,
all three now 0.75rem). Those three are fixed because that PR was rebuilding
the elements they were on; the eight above are on five other people's surfaces
and a blanket raise would be a restyle of surfaces this PR never opened.

**Do not close this by adding `app/(marketing)` to `SCAN_DIRS`** until the
remaining three are resolved — the widened scan goes red on arrival, which is
the correct behaviour and also means the widening and the fixes have to land
together. (As of 2026-09-17 `app/(marketing)` is in fact CLEAN, so that half of
the widening is free today; the `components/marketing` half still needs the
by-component treatment, because the three survivors are inside mocks that
legitimately imitate a real screen at 7px.)
Same lane as the entry above — UI correctness, Vesper. · OPEN

### Open — the matrix "no" mark reads 2.29 against its own tile (found 2026-09-16)

**S3 · marketing site · `components/marketing/ui.tsx`, `MatrixMark`.** The
three marks in the comparison matrix are the VALUE a reader scans the page
for, and the "no" one is close to invisible. **Measured as rendered**
(Playwright, computed styles resolved through a canvas, `/compare/weave` at
1440, the rebuilt page):

| Mark | Glyph, as rendered | Tile, as rendered | Ratio |
|---|---|---|---|
| Yes | `#007a55` | `#d0fae5` | **4.72** |
| Partial | `#bb4d00` | `#fef3c6` | **4.52** |
| No | `#93a0bc` | `#e9f0fc` | **2.29** |

**Why axe is green on this page anyway, and why that is not a defence.** The
glyph is an `aria-hidden` `<svg>` carrying an `sr-only` word, so no text-
contrast rule grades it — a full axe run over `/compare`, `/compare/weave` and
`/compare/patientpop` at all three widths returns **zero** violation nodes. The
`sr-only` word means the meaning never rides on the glyph alone for a screen
reader; it does nothing at all for a sighted reader, who has only the mark.

Note the second row as much as the third: **`Partial` clears the floor by
0.02.** That is `BRAND.md` Part 7's "4.18 reads as nearly fine" shape — a pair
that passes today and fails the first time somebody warms the tint.

**Not fixed here on purpose** (§10, and Neon's own scope rule — character, not
correctness): it is a shared component rather than the page being rebuilt, its
exemption premise is pinned by `tests/marketing/tone-tiles.test.ts` (the
`sr-only` words), and the fix is a palette call on the tone registry rather
than a brand-character one. **`MatrixMark` is also the one tick on this site
the check-mark veto exempts BY COMPONENT with its premise asserted** — changing
its structure, or the `sr-only` spans, fails that guard by name. Deepen the ink
or the tint; do not restructure it. UI correctness, Vesper. · OPEN

### Open — `/product` has never been axe-scanned, and the exemption that would let it be is spelled for the homepage's composition only (found 2026-09-16)

**S7 · marketing site · `e2e/axe.ts` (`DECORATIVE_MOCKS`), `e2e/axe-baseline.ts`,
`app/(marketing)/product/page.tsx`.** `smoke.spec.ts` scans `marketing: home`
and `marketing: pricing`. The product tour is the longest page on the site and
carries **nine** of the repo's product mocks, and no stop reaches it, so nothing
grades it at all.

**Measured, against the production build** (the repo's own
`findA11yViolations`, WCAG 2.0/2.1 A + AA, after walking the page so every
`ScrollReveal` has fired; two runs per width, identical):

| Width | Violation nodes | Inside an `aria-hidden` mock | On the page itself |
|---|---|---|---|
| 390 | 89 | 89 | **0** |
| 834 | 103 | 103 | **0** |
| 1440 | 103 | 103 | **0** |

One rule only — `color-contrast`. The worst pairs, as rendered:

| Ratio | Foreground | Background | Size | Text | Section |
|---|---|---|---|---|---|
| **1.65** | `#c9c2b6` | `#faf7f2` | 10.56px | "9:00 AM" | `#booking` (`BookingMock`) |
| **1.72** | `#ffffff` | `#ffb900` | 9.28px | "MJ" avatar | `#frontdesk` (`DashboardMock`) |
| **1.93** | `#ffffff` | `#00d492` | 9.28px | "LL" avatar | `#frontdesk` |
| **2.26** | `#b4ab9e` | `#ffffff` | 7.68px | "Visits" | `#portal` (`PortalMock`) |

**This is a known-and-answered CLASS with no answer available on this page,
which is the actual defect.** `marketing: home` carried 41 of exactly these and
the decision (UI lane + QA, recorded in `e2e/axe-baseline.ts`) was that WCAG
1.4.3 exempts them as incidental and restyling a deliberate 7px illustration to
reach 4.5:1 helps nobody — so the stop `exclude`s them and holds **ZERO**, the
only state in which a NEW contrast defect there fails on arrival. The exclusion
is `DECORATIVE_MOCKS` = `.mkt-float > [aria-hidden="true"]`: the drift wrapper
AND the attribute. **Every mock on `/product` is `aria-hidden` and none is a
`.mkt-float` child** — they are not floating, they are the page's subject — so
that selector matches nothing here, `deadExclusions` would fail the stop by
name, and baselining `/product` today would mean either a ceiling of 103 (103
real defects' worth of room to hide in, on the second-busiest public page) or a
second exclusion derived from what the mocks ARE rather than from a drift
class.

**DREAMCRM-77 added 2 of the 103, at 1440 only**, and they are named here rather
than absorbed: `#93a0bc on #ffffff`, **2.62**, 7.68px, the string `"across all
channels"` in `DashboardMock`'s BOOKINGS TODAY tile, once each in `#frontdesk`
and `#integrations` — the two chapters that render that mock. Same component,
same colour, same size as the 101 already there; the move widened the mock's
column from six grid columns to seven and that caption becomes a node axe
resolves. 390 and 834 are byte-identical before and after. Nothing on the page
itself moved: **0 → 0 at all three widths.**

**Not fixed here on purpose** (§10, and Neon's scope rule — character, not
correctness). The fix is a stop plus an exclusion, which is `check-definitions`
machinery rather than brand work, and choosing the exclusion's shape is the
interesting part: deriving it from `aria-hidden` alone would exempt every
decorative subtree on the site forever, which is the blanket pardon §2d warns
about. Accessibility + the harness: Vesper / Quinn. · OPEN

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

**Deferred to Slice 10 (now DONE):** pagination itself. The derived filters
(`hasBalance`, `missingIntake`, birthday, recall) and the sort still ran in JS
after the load, so a `LIMIT` would have silently truncated BEFORE filtering and
returned wrong results. Correct pagination required pushing those filters +
sort into SQL first, plus a UI change.

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

**The atomic reminder CLAIM (the double-send window):** the log was written
AFTER `deliver`, so two overlapping ticks — or one retried — both read
"nothing sent yet" and both sent. · **FIXED** (R2 Slice 9, migration 0160).
Both blockers named here are handled: the unique index is PARTIAL
(`sent_by_user_id is null and template is not null`), which sidesteps the
NULL-template problem by covering only the automated touches that are
supposed to fire once — a staff drawer send may legitimately repeat and stays
outside it — and the migration DE-DUPLICATES existing rows in the same file,
ahead of the index, so it cannot fail on boot and block every deploy. See
Slice 9 below for the shape.

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

### Slice 7b — the WAITING lane reaches the PATIENT leg too · DONE

Slice 7 fixed the write path that calls `createAppointment` and stopped there,
because that is where the burned attempts were visible. One leg over,
`ensurePatientExternalId` still caught EVERY failure of `createPatient`,
recorded a bare `status: 'error'` on the patient op, and returned `null` — and
its caller turned that `null` into
`failOp('Patient could not be created in the PMS yet')` unconditionally. So a
booking whose patient was not yet mapped went on burning an attempt per sync
through an outage, and after six the visit existed in DreamCRM and never
reached the practice's schedule. Slice 7's own words for why that is the wrong
lane applied verbatim; the code just never reached it.

`ensurePatientExternalId` now settles its own op through `settleWriteFailure`
(same three lanes as every other write) and RETHROWS, so the appointment op it
serves is laned by the same rules — WAITING and transient park with attempts
preserved, a genuinely wrong write still counts its attempt and still
surfaces. `null` now means one thing only: the patient row is gone on our side.

Two things fall out of it. The op carries the REAL reason ("their practice
system requires an email, a date of birth to create a patient chart") instead
of an opaque sentence that fit every cause equally badly — the front desk can
act on the first and not the second. And because a parked appointment op
retries for as long as the outage lasts, the patient write now REUSES its open
op row rather than inserting a fresh one per pass; otherwise the fix would
have traded a lost booking for one audit row per hour per queued booking.

Four tests in `tests/integrations/write-back.test.ts` pin all of it. Red run:
restored the swallow — the two parking tests and the real-reason test failed;
restored the row-per-retry insert — the reuse test failed.

**Left open on purpose, from the review:** `MAX_WRITE_ATTEMPTS` no longer
bounds how long a booking can sit un-written, because parking is the point. A
parked op is visible — `lib/services/pms/connection.ts:196` counts pending/error
ops for the integration page — but nothing ALERTS on "op pending for N days",
so a practice whose bridge stays down doesn't get told. Recorded as its own
entry below rather than hedging this one's verdict.

### Open — a PMS write-op can sit parked with nobody told (found 2026-09-10)

Found reviewing Slice 7b. Since the WAITING lane preserves the attempt counter,
a write-op parks for as long as the practice system is unreachable — which is
the intended behaviour and strictly better than failing terminally. But
`MAX_WRITE_ATTEMPTS` was doing double duty as a crude "give up and be visible"
timer, and nothing replaced that second job. `getPmsHealth`
(`lib/services/pms/connection.ts:196`) counts pending/error ops on the
integration page, so it is visible to somebody who looks; nothing alerts on
"op pending for N days", so nobody is told. A practice whose bridge stays down
over a holiday week has bookings queued and no prompt to go and look. · OPEN
— UNBUNDLED to DREAMCRM-68 (2026-09-15, DREAMCRM-58 triage) and parked at
`backlog` for the next planning meeting to rank. It is the only item in that
triage batch that is not a small correctness fix: closing it means a new
alerting path — a sweep, a dedupe so a week-long outage is one notice rather
than a daily nag, and a decision about who hears it (the practice, whose bridge
it is, or Dream Create, who can do nothing about their server room). The
Guardian's audience lock and `recordEngineFailure`'s `onceWithin` throttle are
the shapes to reuse rather than invent.
### Slice 13 — the insurance-card scanner only reads our own storage · DONE

`lib/services/insurance-ocr.ts` filtered its `imageUrls` on `/^https?:\/\//` and
nothing else, so the PUBLIC card scanner would fetch and bill any URL on the
internet. The two call sites each had a different opinion about what "our
storage" means: the site intake action matched the bucket name as a SUBSTRING
of the host (`mybucket.attacker.example` passed) and otherwise waved through
anything ending `.amazonaws.com` — every public S3 bucket there is — and the
patient-portal action had no host check at all.

All three now go through `isAllowedAttachmentUrl` (`lib/attachment-hosts.ts`),
the same boundary message attachments use, which matches the exact hosts
`lib/blob-s3.ts` `publicBase()` mints. The gate lives in the SERVICE so a
future call site is covered by construction, and an adoption guard fails if
anyone re-implements a storage-host check.

Guard note worth keeping: the red run for that guard PASSED on the first
attempt while the hand-rolled filter was live, because the doc comment above it
happened to name `isAllowedAttachmentUrl`. A guard that greps source has to
strip comments — a mention is not an adoption.

### Open — insurance-card OCR trusts a client-supplied orgId (found 2026-09-10)

Found reviewing Slice 13 and NOT closed by it — the same surface, a different
defect, so it gets its own entry and its own verdict.
`readInsuranceCardAction(orgId, imageUrls)`
(`app/site/[slug]/intake/[formSlug]/actions.ts`) takes `orgId` straight from the
client with nothing checking it against the slug the page was served from, and
— unlike every other public site action — it has no `rateLimitPublicAction`. So
anyone who can upload through `/api/upload` can spend an ARBITRARY clinic's
400/month scanning cap on their own images.

Slice 13 closed the "any URL on the internet" half. This is the "whose
allowance" half: after Slice 13 the images must at least be ours, so it is a
signed-in caller rather than a stranger, which is narrower and not closed.
Pre-existing. · **FIXED** (DREAMCRM-32) — three gates, in the order the action
runs them: the per-IP `rateLimitPublicAction('insurance_ocr')` every other
public action already had, running FIRST so a flood costs a counter rather
than a query; the org resolved from the PUBLIC SLUG via
`resolveClinicOrgIdBySlug`, never a client-posted id, which is the law
`submitContactRequest` and the insurance verifier already follow; and the form
template re-validated against THAT org, so a caller has to name a real,
unarchived intake form belonging to the clinic whose page they claim to be on
(an archived form is not a door into the allowance either). The client no
longer holds an organization id at all on this path: `IntakeFormRunner` threads
an `OcrScope` of `{ siteSlug, templateId }` built once at the top, so the field
components have nothing to hand the server.
`tests/guards/public-action-tenancy.test.ts` freezes the rule for the whole
`app/site/**` tree.

### Open — three OTHER public clinic-site actions still take a client-posted orgId (found 2026-09-14)

Found by the guard written for the scanner above, and NOT closed by it — same
shape, three different calls, so bundling them would have put one verdict over
several defects. They are ALLOWLISTED (with these reasons) in
`tests/guards/public-action-tenancy.test.ts`:

- `app/site/[slug]/actions.ts` `listBookingSlots(orgId, …)` — a READ of public
  availability. No write, no spend, and it returns the same slots the page
  already renders to anyone.
- `app/site/[slug]/intake/[formSlug]/actions.ts` `submitIntakeForm({ orgId, … })`
  — re-validates `templateId` against the posted org, so a submission can only
  land on a form that org really owns. Spends nothing, and the form is public
  anyway; what it lacks is a rate limit.
- `app/site/[slug]/intake-start/actions.ts` `linkUserToClinicAsPatient({ orgId, … })`
  — re-reads the org, requires a signed-in session, and links the CALLER to a
  clinic whose public page already offers exactly that.

None is the scanner's defect (metered per-call spend on someone else's cap),
which is why the scanner was fixed and these were written down. The one worth
a decision is the missing rate limit on `submitIntakeForm`. · **FIXED** (#606,
`71e2992a`) (DREAMCRM-58), for that third item ONLY — the three
client-posted org ids stay exactly as allowlisted above, with their reasons,
because none of them is this defect.

`submitIntakeForm` was the last public clinic-site action with no rate limit.
It spends nothing, which is why it was written down rather than fixed with the
scanner, but it is an unauthenticated WRITE: every call inserts a
`form_submission` row AND fires `submitForm`'s `intake_submitted` notice to the
org's owners and admins, so a script could bury a clinic's submissions list and
their inbox together, for free, indefinitely.

THE DECISION WAS THE NUMBER, and it is sized against the legitimate traffic
rather than against the other actions here — both of the things that make this
surface different push the same way:

- a clinic's waiting-room iPad and its front-desk machines sit behind ONE
  egress IP, so a per-IP cap on intake caps a whole practice at once, and the
  failure mode is turning a real patient away at the desk;
- a PACKET is N submissions rather than one. `form_packet.formIds` has no cap
  and the flow submits each form independently, so one patient is routinely
  6–10 calls — most of them one-tap consents that go through in seconds — and
  a parent doing two children is already 20.

So 40 per 10 minutes, against the 3–8 per 5–10 every other public action here
uses: three people through a ten-form packet on the same wifi is 30 and fits,
while an unbounded flood becomes 240/hour per IP. The right response to a real
practice hitting this is to RAISE it, and the comment says so. It runs FIRST,
ahead of the template lookup, and `checkRateLimit` already fails OPEN, so a
limiter outage never stands between a patient and their forms.
`tests/intake-forms/submit-rate-limit.test.ts` pins the refusal, the ordering
and THE CAP ITSELF — shrinking it to 8/5min fails on its own, which is the
point of asserting a number that was a judgement call.

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

### Slice 9 — the reminder CLAIM: a reminder can only go out once · DONE

The last open defect that reached a patient's phone, deferred out of Slice 3
for exactly the two reasons this slice had to handle first.

The log row was written AFTER `deliver`, so two overlapping 30-minute cron
ticks — or one tick retried after a partial failure — both read "nothing sent
yet" and both sent. Same patient, same visit, two messages.

- **Claim before send.** The engine inserts the log row FIRST and only sends if
  it won the insert. `claimAutomatedReminder` /`confirmReminderSent` /
  `releaseReminderClaim` (`lib/services/appointments.ts`) are the three steps:
  a claim that comes back empty means another tick owns this send, a send that
  lands stamps the SMS `providerMessageId` and writes the action-ledger entry,
  and a send that does NOT go out drops the claim so the next tick retries.
  The ledger entry deliberately waits for the confirm — an append-only ledger
  must never narrate a message that hasn't gone out.
- **The NULL-template blocker, answered by making the index PARTIAL.** The
  unique index `appt_reminder_auto_touch_uq` on `(appointment_id, template)`
  carries `WHERE sent_by_user_id is null and template is not null and template
  <> 'forms_intake'`, so it covers exactly the automated VISIT touches — the
  only sends that are supposed to fire at most once per appointment. A staff
  member sending from the drawer may legitimately send twice and stays outside
  it; an ad-hoc NULL-template row Postgres would treat as distinct anyway is
  excluded rather than relied on.
- **The forms nudge is excluded BY NAME, and that exclusion is the review's
  find.** The first cut of this slice let the index cover it, and the pre-merge
  gate caught what that would do. `runDueFormReminders` logs through
  `logReminderSent`, whose idempotency is a 48-hour WINDOW rather than a row —
  and PMS sync updates an appointment's `start_time` IN PLACE (no new id,
  unlike a portal reschedule), so a visit pushed a week out comes back inside
  the forms window with its original nudge row now older than the dedup read.
  Under the index the engine would have sent the email, raised 23505, recorded
  nothing, and repeated every 30 minutes until the visit passed — because the
  row it needed to see is the one that never got written. The nudge SHOULD
  repeat there; it is the uniqueness rule that was wrong. The exclusion runs
  through the predicate, the `ON CONFLICT` clause and the migration's de-dup,
  which would otherwise have deleted legitimate repeat nudges as the bug's
  leftovers. `logReminderSent` carries the conflict clause regardless — both of
  today's writers sit outside the index, so it exists to stop the NEXT
  automated writer raising 23505 after a message has gone out.
- **The failed-migration blocker, answered by de-duplicating in the same
  file.** Migrations auto-apply on boot, so an index that trips over existing
  duplicates blocks EVERY deploy — and the rows it would trip over are the
  ones this bug wrote. Migration 0160 deletes them first, ahead of the index,
  scoped to the rows the index covers. The survivor is the row already
  carrying downstream state (a delivery receipt or a patient reply), then the
  earliest send — the one the patient actually got.

The trade is deliberate and worth writing down: **at-most-once, not
at-least-once.** A crash between the claim and the send spends that touch and
the patient doesn't get it (the next touch in the journey still fires). Every
failure path we can SEE releases the claim; the one we can't is a crash, and
sending a patient the same reminder twice is the louder failure.

One more thing the gate caught: the SMS provider-id stamp in
`confirmReminderSent` was an unguarded UPDATE, and a throw there unwound into
the send helper's catch → `{ ok: false }` → the engine RELEASED the claim for a
text the carrier had already accepted, and the next tick sent a second one.
Wrapped, on the same reasoning the file states three functions up: the reminder
is already out, bookkeeping must never throw after it. Lost claims also count
as `claimContended` rather than `alreadyReminded` — "the patient already has
this" and "two ticks overlapped" are different facts.

23 tests. The engine harness pins the orchestration (a losing tick sends
nothing; the claim strictly precedes `deliver` and the confirm strictly
follows; a claim that THROWS is treated as lost; family buckets claim and
release as a set). `tests/automation/reminder-claim.test.ts` renders the real
statement through drizzle's own dialect via the pg-proxy driver — no database —
because two properties no JS mock can see: an `ON CONFLICT` target must match
the index INCLUDING its predicate (getting it wrong is a 42P10 on every claim,
which stops reminders entirely), and every automated-shaped INSERT into the
table must carry that clause — the guard that fails on a bare one, red-run
against the pre-fix code.

### Slice 10 — the Patients-list page bound (Slice 1's deferred half) · DONE

Slice 1 wrote down why a `LIMIT` could not simply be added: the derived filters
and the whole sort ran in JavaScript AFTER the load, so a bound would have
truncated before filtering — "the recall-due patients among the first hundred"
rather than "the first hundred recall-due patients". So the bound ships with
what makes it correct.

- **Every filter is a SQL predicate now.** `hasBalance` is
  `coalesce(pms_balance_cents, 0) > 0` (a NULL PMS figure is not a balance, as
  the composer already treats it); the birthday month reads the ISO text
  column; `missingIntake` is `exists` a live visit inside the week `and not
  exists` a form submission; the tag filter is an `exists` over the assignment
  table; `recall_due` is `recallDueWhereSql`.
- **All six sorts are ORDER BY**, the three derived ones (last visit, next
  visit, last contact) as scalar subqueries, with the NULL placement the JS
  comparators had — a missing last visit sorted as 0 (NULLS FIRST ascending), a
  missing NEXT visit as +∞ (NULLS LAST), because a patient with nothing on the
  books belongs at the bottom of "soonest first". Every sort ends on the patient
  id so a page boundary is stable between requests.
- **Two entry points, one implementation.** `listPatientsPage` returns a page
  plus `total` — one indexed `count(*)` over the same predicate, so the header
  still counts every match rather than the page. `listPatients` keeps its
  signature and stays unbounded for the consumers that need every row (bulk
  actions over a saved view, the recall analytics count, the follow-up rules
  cron) and gains the SQL filtering.
- **On screen:** the header count is the filtered total, a footer says which
  slice is showing, and "Show more patients" walks `?show=` up in 100-row steps
  to a 1,000 ceiling, past which it points at a filter instead of a longer
  page — the same `ActionButton` + URL-param shape the `/messages` bound uses.
  Choosing that over page-by-page navigation is the one open UI judgment call;
  it follows the in-repo precedent rather than inventing a primitive.

**The one duplicated rule, recorded deliberately:** `recallDueWhereSql` is a
second expression of `derivePatientRecallStatus`. The same derivation cannot
run in SQL and in JavaScript from one body, and a recall filter applied after
the load cannot survive a page bound. It lives beside its twin, reads the same
constants, mirrors the near-window read INCLUDING its cancelled visits (the
list's own near-window query does not exclude them), and
`tests/patients/recall-sql-parity.test.ts` walks a case matrix through the
derivation and pins that the SQL's bounds are COMPUTED from the shared
constants rather than typed in. If the rule moves and only one side follows,
that file fails.

The pre-merge gate found one place they had already diverged, and it is the
kind only a branch-for-branch read catches: a patient whose
`recall_interval_months` is stored as **0**. JS reads `p.recallIntervalMonths
?? cadence.recallMonths`, and `??` does NOT fall through on `0` — so the zero
reaches the derivation, fails its `> 0` test, and lands on
RECALL_DEFAULT_MONTHS. The SQL's two-branch `else` handed it the clinic's
cadence instead, so for any clinic not on a six-month cadence that patient was
filtered by one rule and labelled by the other. Third branch added, case added
to the matrix.

41 tests. The service half renders the real statement through drizzle's own
dialect via the pg-proxy driver — no database — and asserts every filter is
present in BOTH the page statement and its count, since they have to describe
the same set or "showing 100 of 4,213" is a lie. Two of them count
`organization_id` predicates against the number of subqueries, so a new
correlated subquery cannot be added without its tenant filter.

---

### Slice 11 — the public forms say what went wrong · DONE

The patient-facing twin of the checkout fix. Every public form action signalled
its refusals by THROWING, and Next.js replaces a server-action error message
with an opaque digest in production — so "that slot is no longer available —
please pick another time" reached the patient as "An error occurred in the
Server Components render". The one sentence that would have told them what to
do next was the one that got eaten, on a form the clinic pays for traffic to.

`lib/services/public-form-error.ts` is the sibling of `checkout-error.ts`, with
the same split: `PublicFormError` carries a message we wrote FOR the patient
and is shown verbatim; anything else is logged server-side and replaced with
`PUBLIC_FORM_UNAVAILABLE_MESSAGE`. Six actions adopt it — contact, request-a-
visit, chat, booking, public intake, and the portal intake twin that shares the
same `IntakeFormRunner` — plus their five client components, which used to read
`err instanceof Error ? err.message`.

The adoption guard found a SIXTH form the write-up did not name:
`/intake-start`, the sign-up-then-attach flow, which had the same defect and
additionally surfaced raw better-auth throws. It is fixed here too.

Test note worth keeping: the existing suite pinned the THROWING contract
(`.rejects.toThrow(/no longer available/i)`) and passed the whole time
production was showing a digest — a thrown server-action message survives only
in the dev/test process. Those assertions now read the RESULT, which is what
the patient actually reads. Red run: reintroduced one bare `throw new Error`
and one `err.message` client — four guard tests failed, naming both files.

### Slice 12 — the nightly sweeps stop on purpose and remember where · DONE

`daily-digest`, `generate-proposals` and `retention-automations` each walked
every clinic with no time limit and no memory. The failure that makes this
worth fixing BEFORE the marketing push is silent: the route hits its
`maxDuration`, the request is killed mid-loop, and because the walk always
started at the same end of the same list, the same clinics were served every
night and the ones past the cut-off were never reached at all. Nothing errors.
Nothing is logged. A practice simply stops getting its morning digest and
nobody can say when it stopped.

The answer is NOT fan-out — the instance can't take parallelism, and the risk
here is cron wall-clock, not DB load. It is: stop on purpose before the
platform stops you, and start where you left off.

`lib/cron-budget.ts` holds the pure decisions (a deadline, a rotation, a walk),
`lib/services/cron-sweep.ts` the one side effect they need. Four decisions in
it are load-bearing enough to have their own tests:

1. **Rotate, don't truncate.** A resumed run walks past the end and back round
   to the clinics it served last time. A queue that must be drained before the
   front is served again would just move the starvation to the other end.
2. **Always walk at least one clinic.** A budget already spent at the start (a
   slow cold boot, a mis-set constant) would otherwise never move the cursor:
   the sweep would be dead while reporting success on every tick.
3. **A clinic that throws still counts as walked.** Without that, one clinic
   whose staff query fails every night parks the cursor permanently in front of
   itself — the same starvation, through a different door. This also fixes a
   live defect in `daily-digest`, where such a throw took the whole morning's
   run down with it; it is now one clinic's error in `result.errors`.
4. **One top-level config key per job**, never a shared `cronCursors` object.
   `writePlatformConfig` merges shallowly, so a shared sub-object would be a
   read-modify-write across concurrent crons and the hourly generator could
   silently wipe the daily digest's place in the list.

Budgets are chosen against each route's own `maxDuration` with room for what
runs after the walk (a guard test asserts the relationship holds). Bounding the
retention walk is also what leaves the four best-effort jobs riding that same
120s tick — balance cadence, DUE PLAN CHARGES, NPS, loyalty — room they did not
previously have.

Every clinic is now reached within `ceil(N / clinics-per-run)` runs however big
N gets, and the cron JSON says `sweep: { swept, remaining, completed, resumeAt }`
so an overrun is visible instead of silent.

**What an overrun costs a deferred clinic is NOT the same for all three**, and
`completed: false` must not be read as uniformly benign (Sentinel's note on the
review):

| Job | Tick | A deferred clinic gets |
|---|---|---|
| `generate-proposals` | hourly | a **delay** of an hour — `sourceKey` windows are days or months |
| `retention-automations` | daily | a **delay** of a day for the month/week-keyed automations, but a **SKIP** for the birthday campaign — its key is `birthday:<org>:<YYYY-MM-DD>`, so tomorrow's key is a different day and yesterday's birthday patients no longer match |
| `daily-digest` | daily | a **SKIP** — `daily_digest_log.sentOn` is today's date, so there is no late digest, only no digest |

The rotation is what makes the skips acceptable: it turns "the tail misses
EVERY night" into "every clinic misses OCCASIONALLY". It does not turn a skip
into a delay. If `retention-automations` — daily, and the tightest budget of
the three — ever genuinely runs out of time, the answer is a bigger budget or a
split route, not a shrug at `completed: false`.

Red run: reintroduced each of the five decisions in turn (no budget; no resume;
truncate instead of rotate; no per-clinic isolation; no minimum of one) and
watched 7 / 3 / 6 / 2 / 6 tests fail respectively.
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
`waitFor`) as part of R3's suite-stability work. · CLOSED 2026-09-09: the
root cause was a real race, not load — the phase flips to `comment` before
the transition's `pending` flag clears, so a click on the still-disabled
button was silently swallowed and no later render retried it. The tests now
wait for the button to be enabled before clicking.

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

**Batch 5 (same day):** the ActionButton `pending` adoption sweep finished
app-wide — a brace-aware codemod swapped `disabled={<flag>}` →
`pending={<flag>}` **only inside `<ActionButton>` tags** and only for simple
boolean flags (pending/saving/deleting/…; compound `disabled={pending || x}`
expressions deliberately untouched): **185 swaps across 78 files** — leads
drawer, patients modals, growth (audiences/campaigns/reviews/social),
settings (team/locations/billing/security/…), integrations, shop/payments/
partners, website (blog/careers/domain), prospecting, onboarding, signup.
Every one of those buttons now spins + announces `aria-busy` while its
action runs instead of merely dimming. Scouted and *rejected* for this
batch: a BrandButton pending twin for the portal — patient-facing forms
already swap their labels honestly ("Booking…", "Opening secure
checkout…"), so the prop would add machinery without adding feedback.
Also scouted clean: native `window.confirm`/`alert` (zero left — everything
rides the styled ConfirmProvider/toast), route `loading.tsx` coverage (a
group-level `PageSkeleton` fallback plus 16 tailored ones), and the
error/404 boundaries (already in-shell and warm).

**Batch 6 (same day) — R3 E2E expansion, the token journeys:** the two
patient email touches that need no login and no Stripe are now driven in a
real browser as real writes — `e2e/token-journeys.spec.ts` (4 specs; suite
now 22): **/c one-click confirm** (a GET/reload must NOT confirm — the
inbox-prefetcher guard — then the button confirms, the confirmed state
offers Add-to-calendar (batch 3's feature, now browser-pinned), and a
reload proves the write stuck) and **/n post-visit survey** (tap 9 → "Got
it — 9/10" → reload lands on the already-answered thanks state), plus
unknown-token 404s for both. Fixture: `e2e-seed.mjs` seeds a confirmable
next-Wednesday visit + an unanswered survey and RESETS both on every
re-seed (a one-shot fixture is a fixture that flakes on run two). The run
also caught a real latent bug in the existing booking spec: it was
**time-of-day dependent** — after the seeded clinic's 5pm close the day
strip honestly shows the empty state + rescue button, and the old
walk-the-days loop clicked "More days" (which extends the strip but never
switches days) and found nothing; every prior green run had simply
executed during business hours. The spec now behaves like a patient: take
a visible slot, otherwise take the "See {day}'s openings →" rescue — which
gives batch 2's funnel-rescue feature real browser coverage too. Harness
fix: `--skip-build` was also being passed through to Playwright.

**Deploy note (2026-08-18):** the batch-5 deploy (cf9ecc7) failed in
CodeBuild ~2 min in (the same commit builds green locally); retried with
an empty commit per the standing pattern.

**Batch 7 (2026-08-18) — the stranger test in CI + an honest completion
page:** `e2e/stranger.spec.ts` (suite now 23) drives the ENTIRE acquisition
path as one real browser journey with nothing seeded on the stranger's
side: signup → the four onboarding steps (practice → address → the slug
availability check → the no-card trial) → the completion page → the
dashboard wearing the new clinic's name → **the tenant wall** (the new
clinic's Patients page must not contain the other seeded clinic's patient
— the multi-tenancy check this program exists for, finally asserted in a
real browser). Writing the spec surfaced a real R2 casualty: since the
0147 go-live lever, a new clinic's site starts PRIVATE, but
`/onboarding-complete` still crowned it "**your site is live!**" — and
because editors bypass the coming-soon gate, the owner clicking the link
SAW their site and believed it, while the world saw "coming soon". The
page now says "your site is ready!", explains only-you-can-see-it-until-
you-publish, and the link's green live-dot became an amber preview-dot;
the spec pins the honest copy.

**Batch 8 (same day):** the stranger journey grew its FIRST DAY OF WORK
tail — after the tenant-wall check, the spec adds the clinic's first
patient through the real Add-patient modal ("Save & open") and lands on
their chart: staff CRUD in the same browser session the signup minted.
E2E 23/23 green.

### Owner scope correction — ONE PMS door (2026-08-19)

Owner ruling: "since NexHealth syncs with Open Dental, I don't want two
separate connector paths — remove the Open Dental path and stick to
NexHealth's." An approved scope change, not a freeze violation. Shipped:
the self-serve Open Dental catalog card (Customer-Key connect, gated on
OD vendor-portal approval that never came) is GONE; the NexHealth bridge
card is THE one PMS door, renamed "Open Dental, Dentrix + more" and given
the detail door it never had (`/integrations/pms` — the old OD detail page
made provider-neutral; `/integrations/open-dental` 308s there; the
Customer-Key ConnectPanel + `connectOpenDentalAction` deleted). The
marketplace now lights ONE card for whatever provider the connection row
carries, titled by the actual system. Connected-bridge cards also gained
the Manage door they LACKED (the old ConnectedActions keyed on
`connectKind === 'pms'`, which the bridge isn't — a connected NexHealth
clinic had no path to its own sync dashboard from the marketplace).
Marketing/docs/AI-knowledge reworded end to end ("Open Dental sync" →
"PMS sync — Open Dental, Dentrix + more through one bridge, official
paths only"): nav + footer, the docs article (now `connecting-your-pms`,
rewritten for the guided install — no more Customer-Key steps), product
page, home tile, comparison pages, the seeded blog post, the demo script,
and the prospecting product knowledge. The OD-direct provider ENGINE
(`lib/services/pms/open-dental.ts`, `connectOpenDental`) stays INERT —
the SES-driver pattern — so a future vendor approval is an ops option,
not a customer door.

**Batch 9 (2026-08-19) — the portal persona joins the browser suite:**
`e2e/portal.spec.ts` (suite now 25) walks the patient portal as a REAL
signed-in patient — no magic-link email round-trip: the seed creates
Casey's auth user + a live session row, and the spec mints the signed
session cookie exactly the way better-auth does (token + HMAC-SHA256 with
the harness's BETTER_AUTH_SECRET). Covers the auth wall (no cookie →
bounced off /patient/dashboard), the branded portal home ("Your next
visit" + the patient's name), and a real write: confirming a seeded
cleaning from the visits page, persisted across reload (`confirmed_via
'portal'`). The portal spec owns its own appointment row — sharing one
with the /c token spec would make each flaky in the other's parallel
shadow. All four personas' core journeys now run in a real browser:
stranger→clinic staff (signup/onboarding/patients), patient signed-in
(portal), patient tokenized (/c, /n), public visitor (site + booking).

### The UI Best-Version program (2026-08-19, owner directive)

Owner: *"look through the UI, piece by piece, component by component, page
by page — what is this now, what's the best version of this?"* Three scouts
walked every surface cluster against DESIGN-SYSTEM v3 + the doctrine; the
full ranked backlog (~150 findings incl. two system-level ones: the
never-defined `--color-brand-600` token and the ~35 hand-rolled pending
ternaries) lives in **`docs/UI-BEST-VERSION.md`** — the standing program
doc. Batches take the top of that list every turn.

**Batch 10 — the Daily cluster's top findings:** the Approve button (the
product's most-pressed control) was a raw `<button>` painting a fallback
sky because its brand token never existed — now `ActionButton primary`
with the dream gradient + width-stable spinner (Edit-first → ghost) · the
Overview attention cards' headline numbers are now the links their own
subtitle promises, and all four dead preview lists (unconfirmed, unmarked,
inquiries, follow-ups due) open the visit drawer / their lists · the
Follow-ups board split its one shared transition (a filter click no longer
freezes every tick-box), gained the PendingVeil, and its filtered empty
state hands over a real "Clear filters" button · Leads gained SearchInput
(clear-✕ clears the live query), the PendingVeil, and keyboard-openable
rows (role=button + Enter/Space); the lead drawer's archive sub-panel no
longer escapes the drawer to cover the whole viewport (missing `relative`)
· My Day's skeleton now matches the page width (no more arrival reflow)
and the tick-off circle is double-tap-proof with a hover check preview.

**Batch 11 — Records + Comms top findings (owner: "work through the clinic
side, every component"):** the six modals whose CANCEL button spun during a
save (batch 5's codemod had put the shared pending on the escape hatch)
now disable instead — Cancel never claims to be doing the work · the
Patients table's sort headers became real `<button>`s with `aria-sort` and
a fixed-width arrow slot (keyboard-sortable, no header reflow), and the
`<thead>` is sticky · agenda rows are keyboard-operable (role=button,
Enter/Space, explicit aria-label so the row's name doesn't swallow its
inner controls' — a collision our own tests caught) and the sticky day
header pins below the 56px chrome instead of tucking under it · **the new
`CopyChip` primitive** (six surfaces had each hand-rolled clipboard code;
now one home) makes the intake fill URLs and packet links one-tap-copyable
instead of un-selectable gray mono text · Messages: the thread list's
timestamp/You:/assignee metadata rises to the gray-500 contrast floor, the
urgency badge rides `StatusPill tone=urgent` (the tone contract + legend
now cover the most important triage mark), the composer **auto-grows** to
280px instead of a fixed two-line slit (collapsing back on send), and Send
got its own busy flag — it no longer announces "Sending…" while an
unrelated assign/snooze runs · patients bulk-bar Invite/Pay-link join the
pending prop.

**Batch 12 — same cluster, the safety + defaults tier:** the
merge-duplicate modal (an IRREVERSIBLE merge) gets the sibling modals'
full shell — role=dialog, aria-modal, focus trap, Esc — and scrim-click
deliberately no longer dismisses it: leaving an irreversible flow is an
explicit act, never a stray click · the appointment drawer's fourteen
buttons stop spinning in unison — an `activeAction` key means only the
button you pressed shows the spinner while the rest quietly disable · the
reschedule panel opens on the visit's OWN date and time instead of
tomorrow-09:00 (every reschedule used to start by undoing a wrong
default), and the walk-in booking time defaults to now rounded to the
next quarter hour — a walk-in is standing at the desk, not arriving at
9 AM · patient-detail's three send buttons (intake, review request,
portal invite) report through the one global toast corner instead of
absolutely-positioned spans that overlapped the layout and vanished on
timers.

**Batch 13 — hubs + settings tier:** the Website hub's trust bug closed —
"Your site is live" was printing in the same viewport where GoLiveCard
asked the clinic to go live; the sentence now tells the truth per
`siteLiveAt` · **`SaveBar` hoisted to `components/ui`**: the Design
panel's four competing raw-teal primaries become one save language —
dirty → Save → a "Saved" that PERSISTS until the next edit (no more 2.5s
self-destructing confirmations, no more no-op saves that still staged a
draft), "publish makes it live" said once at panel level · Quick edits'
save joins ActionButton with role=alert errors · Team panel opens on
MEMBERS (Invite is a tool, not a landing) and the Pending tab carries
its count · Audiences: the recipient count is the card's mono-numeral
hero, Delete demotes to a ghost with rose hover and only the clicked
card spins, the empty state hands over "+ New audience" · Shop's
duplicate Connect-Stripe primary demotes to secondary.

**Batch 14 — dismissal contracts + the builder's hands:** the new
`usePopoverDismiss` hook (Esc + outside-click, mousedown-phase so it
feels native) retires five popovers that could only be closed by
re-clicking their trigger — assign, snooze, templates, and schedule in
the Messages thread detail, plus the thread list's bulk snooze · the
intake form builder's reorder controls grow from ~10px text glyphs to
28px icon buttons with hover surfaces (sections and fields), "Remove
section" now CONFIRMS while naming how many questions die with it (the
more destructive click had no dialog while archiving the whole form
did), and Archive moves out of the sticky save bar into a quiet footer —
destructive never rides beside the primary · the Pages manager stops
rendering an invisible-but-focusable chevron on rows with nothing to
disclose (plain text, no dead tab stop) and "N text edits" explains
itself on hover.

**Batch 15 — the Overview's last visual debts:** the Approval Inbox and
Standup cards leave the retired v1 etched-card recipe for `.v2-card`
(the top of the morning page finally matches the bottom) · the
"machine handles this" pill and its rail-chip tint move from sky — which
is not a tone — onto v3's violet `info`, and the capability icon chip
drops a second never-defined brand token for the sunk surface · the
morning skeleton is now shaped like the morning page (sign-here card →
attention grid → five KPIs → feed) instead of a generic three-card
guess · feed rows only light on hover where a click actually lands ·
My Day: tomorrow's prep flags and the unread badge ride StatusPill
(hoverable meaning, tone contract), Claim joins ActionButton with the
pending spinner, and the digest toggle acknowledges its click.

**Batch 16 — Follow-ups, Leads, and the saved-views bar:** the shared
`TickButton` primitive ends the tick-circle drift between the Follow-ups
board and My Day (one recipe: hover previews the check, done fills
emerald, always double-tap-proof) · the board gets its own skeleton
(chip row → rules line → grouped tick rows), its "N due now" pill moves
out of the header's one-primary slot into the legend zone, and the
8-week completion label survives on tablets · Leads' empty states hand
over Share-your-website / Clear-filters, select-all became a
label-clickable list header, and the archive step's two exits finally
match · the saved-views bar loses `window.prompt` (audience naming is
now the same inline recipe as + Save view), the view-delete ✕ is always
visible and CONFIRMS (hover-only didn't exist on touch and an
irreversible-feeling delete had no dialog), and the Views/matches
labels rise to the contrast floor.

**Batch 17 — the agenda/drawer/modal tail:** the agenda bulk bar gets
per-action pending (only the pressed bulk button spins; the others
disable), and the bulk follow-up composer joins the dismiss contract
(Esc + outside-click on the trigger+panel wrapper, so the trigger still
toggles) · in the visit drawer, the in-office "undo" rises from
invisible micro-gray to a legible underlined control, and a patient's
reply BODY renders at text-sm full ink — their actual words are content,
not metadata · the staff booking drawer's slot grid shows six skeleton
chips in its own shape instead of a text line that made the panel jump
twice per date change · the fast-pass Remove now CONFIRMS (it discards
the patient's standing request) · Add-patient autofocuses its first
field; the import and edit modals wear the standard icon close.

**Batch 18 — the patient-detail tier:** the six same-weight header
actions collapse to the daily three (Send message primary · Book ·
Edit) plus ONE More ▾ menu carrying intake/review/view-as-patient on
the shared dismiss contract, with only the pressed row showing busy ·
the timeline filter moves into the URL (`?tab=` via
history.replaceState) so refresh and shared links land on the same
slice · the timeline paginates at 40 rows with "Show older (N more)"
and its empty states hand over the action they name (book / send a
message / send an intake form) · rows that need action wear the
app-wide aging left border (agingBorderClass) instead of a
tinted-amber emoji no legend explained · the needs-attention box joins
v2-card + StatusPill · the header strip gains its heartbeat: a
Visit-rhythm MiniTrend of completed visits per quarter (trailing two
years, derived from the timeline already in hand) · notes read at
text-sm, note delete CONFIRMS behind a real 24px target, and a
document upload shows a live in-progress row (spinner + filename)
instead of only a dimmed button. Deferred with reasons: TrailBack in
the back-link slot (trail-context/header-slot-bound) and EmptyState
inside the 240px rail cards (the well is main-column-sized).

**Batch 19 — the patients-list tail:** the whole row now opens the
patient (mouse click anywhere that isn't the row's own controls, riding
the same PendingVeil transition as filter navs; the name Link stays the
keyboard/AT path) · SearchInput grows an opt-in `enterHint` — a quiet ↵
kbd appears while typed text awaits submit, so the Enter-to-search
contract is finally visible (Messages' live search opts out) · an
ACTIVE source/tag filter now presents as the shared active FilterChip
with one-click clear (the select stays for picking — chips can't hold a
12-option enumeration) · the 12-week new-patients heartbeat label
survives on tablets (spark stays desktop) and the old Sparkline compat
wrapper is swapped for MiniTrend proper · the saved-views bar's
All-patients + view chips ride FilterChip's href mode instead of a
hand-rolled pill recipe with a drifted radius. Kept deliberate: the
bar's action pills (+ Save view / Follow-up all / Send a campaign) stay
custom — chips filter, they never act.

**Batch 20 — the patients modals:** the CSV import wizard gets its map
(a three-step rail — Upload → Match columns → Done — current step
ringed teal, finished steps ticked emerald, announced via
aria-current) and a real drop well in place of the browser's bare file
input: click to browse or drop the CSV on it, the chosen file echoes
back by name + size, and a non-CSV drop is refused with a plain
sentence · the edit-patient modal's fourteen fields gain their
headings (Contact / Address / Insurance / Care preferences / Family
access) so "where's the policy number" is a glance · the bulk-email
modal finally shows WHO gets it — "To:" with the first three names and
a +N-more disclosure over the full list — and its Send button trades
the label ternary for the pending prop.

**Batch 21 — the Messages tier:** j/k now walks the thread list from
the keyboard (the same triage rhythm /inbox already had — skipped
while typing, riding the same optimistic navigation and veil) · the
batch-surface checkboxes rise to 16px · both empty states hand over an
action (Clear filters when filters exclude everything; "Message a
patient from their chart" when the inbox is genuinely new) · the
schedule popover's confirm trades its raw violet button for
ActionButton with the pending spinner (violet stays a tone, never a
button skin) and Cancel goes ghost · the pending-attachment remove ✕
is always visible instead of hover-only (touch had no way in) ·
receipt rows and composer footnotes rise to the gray-500 contrast
floor (the thread's activity-marker lines stay deliberately quiet per
the markers law) · the 14-day pulse spark swaps the Sparkline compat
wrapper for MiniTrend proper. Also verified: the four detail-panel
popovers and the bulk snooze already ride the batch-14 dismiss
contract — struck in the backlog.

**Batch 22 — the thread header fold + the agenda filter grammar:** the
Messages thread header stops stacking six blocks before the first
message — tags and the quick-follow-up fold behind ONE named
disclosure ("Tags (N) & follow-up"), and the controls stay mounted
while collapsed (the settings-tabs law) so a half-typed follow-up
survives collapsing · the agenda's eleven-control filter strip gains
its grammar: a "When:" label on the window row, a "Show:" label on the
attention row, a hairline divider before the staff/source pickers, and
the search box joins the enterHint contract · the agenda row's
right-side pill cluster now wraps onto a second row (capped at 45%
width) instead of crushing the patient's name on narrow panes.

**Batch 23 — the Inbox tier:** the Gmail-shaped inbox joins the design
system's grammar. Unread goes AMBER (dot + count pill) matching the
Messages contract — emerald read as good news instead of waiting; the
emerald patient-link chip stays, since that encodes identity. Archive
and trash finally answer through the global toast (no confirm on
purpose — both are reversible). Row checkboxes are always visible at
half strength (touch has no hover); Refresh/Syncing… get their casing;
the filtered empty state hands over Clear filters. The reading pane's
arbitrary px type moves onto the standard scale, the pane and sidebar
surfaces ride tokens, the view-toggle chips ride the shared FilterChip
(intent chips keep their tone colors on purpose), and ToolbarButton's
dead primary variant is deleted — Reply is the pane's one primary by
construction. The route gets an inbox-shaped loading skeleton (list
pane beside reading pane). Deferred with reason: moving the first-paint
sync+classify off the request path is a data-path change, not
presentation — logged for post-1.0.

**Batch 24 — Growth hub + Reviews:** NewsCard — byte-identical local
copies in the Growth and Website hubs, exactly how recipes drift — is
hoisted to `components/ui/news-card.tsx` and both hubs import the one
recipe · the Growth utility footer's three links get a real tap height
(py-2) · on Reviews, each of the four look-alike KPI bands now leads
with its own header (the ask→review funnel · On Google right now ·
Where they reviewed · Patient pulse), the Google-link setup gate joins
the standard warn recipe, the survey footnote rises to the contrast
floor, and Edit-request-email demotes to ghost beside the page's one
breath primary. Deferred with reasons: the Growth hero/funnel stay
hand-shaped (deliberate owner-approved v3 layouts — KpiStat's tile
chrome would box what was designed to flow), and the funnel/review
heartbeats need per-metric history series the services don't keep
(post-1.0 candidates).

**Batch 25 — the outreach queue + the Website hub:** the queue's tier
headers move onto the standard tone surface recipe (tone-500/10 tint +
inset ring — the *-50 backgrounds were a second dialect of the same
tones), an empty tier collapses to one quiet ✓ line instead of a
full-height well, and only the LARGEST tier's Send stays primary — the
rest demote to secondary so four teal buttons stop competing for
"start here" · on the Website hub, the 30-day visits delta moves under
the number it describes instead of floating in the band header, the
go-live checklist circles hover an → inside (the row navigates, it
doesn't tick), and the utility footer's Design/Pages doors drop the
fact echoes the hero already carries (Domain keeps its address — the
footer is its only editable home) while all four links gain real tap
height.

**Batch 26 — the intake tail:** the form-builder finally says
"Unsaved changes" (amber, in the save bar's status line) whenever
anything differs from the last-saved shape — the baseline resets on
save, so closing the tab mid-edit is a known risk instead of a silent
one · on the forms index, Edit leads each row at secondary weight
(it's the daily action) with Preview/Kiosk demoted to ghost · the
packets Delete joins the quiet-until-hover rose recipe · the
cross-template submissions list discloses its 50-row cap and points at
each form's full history. Verified already-done in batch 14 and
struck: reorder targets, Archive's footer placement, the
remove-section confirm; the add-field menu was already a labeled grid.
Deferred with reasons: a stacked mobile preview (desk task), TrailBack
in the back-link slot (context-bound), and submissions filters (glance
surface; per-form pages carry the full lists).

**Batch 27 — Settings home + Team:** the settings tiles finally carry
their live state — a server-fetched badge map puts "N invites pending"
on Team and "Trial — N days left" on Billing (best-effort, quiet when
nothing's live) · settings search announces its result count
(role=status), the clear-✕ rises to a 28px target, and the no-match
state names the query and hands over an inline clear-the-search
action · on Team, the shared pending stops spinning every row — each
Remove/Resend/Cancel gets its own key so only the pressed button spins
while the rest disable — and the invite-expiring-soon text rides
TONE_TEXT.warn instead of a hand-mixed amber.

**Batch 28 — the money tier (Billing · Payments · Shop):** the billing
panel's one shared pending stops covering four different actions —
portal/cancel/resume each get their own key and the plan buttons ride
pendingPlan, so only the pressed thing spins · the Payments hub doors
stop restating the KPI band sitting directly above them (only Online
payments keeps its connect STATE — a fact about the door, not a KPI;
tests now pin the absence) and adopt v2-card-interactive · on Shop,
the steady-state "storefront live" band demotes to a quiet one-line
status (good news is not a standing banner) and the LowStock panel
moves BELOW the Sales band — restock is housekeeping, not the lead
story. Scout-stale items struck: the billing upsell and Payments
Stripe notices already ride the standard info recipe. Deferred with
reasons: the billing money-facts grid (voice over scan speed on a
rare page), the Outstanding heartbeat (no history series), and the
$0-sales band (documented deliberate hide during setup).

- **2026-08-20 — UI best-version batch 29 (the Overview tail).** Approval
  Inbox raw fields moved onto form-input/form-textarea/form-select (the
  off-system sky focus rings are gone); the three amber notice dialects
  (readiness banner, site-health banner, guardian note) unified onto the
  standard warn recipe; the sign-here stack gained a keyboard path (→/n
  next, ←/p previous, guarded against typing targets and view-all); the
  permanent ComingSoonCard chrome was deleted in favor of a one-line
  texting footnote inside the live Reviews card, gated on !smsLive.
  Deferred with reason: two trend tiles without sparks (no per-day history
  series in getOverview — data-path work).

- **2026-08-20 — UI best-version batch 30 (the Daily-cluster tail: My Day,
  Follow-ups, Leads).** My Day: "All my follow-ups" promoted to the header
  primary; the KPI grid goes 4-up when the conditional proposals tile
  joins (no lone orphan); the raw chair/door emoji adopt the agenda's own
  labeled StatusPill recipe; tick double-fire verified covered by the
  shared TickButton. Follow-ups: the rules card collapses to a one-line
  summary + disclosure (body stays mounted); the caught-up empty state
  hands over Open patients; the per-row assignee select is quiet until
  hover/focus. Leads: drawer timeline stamps clinic wall-clock via
  formatClinicDayTime (tz plumbed through); loading.tsx matches the
  aging-card-stack shape. System: the legacy Sparkline compat wrapper is
  fully retired — the last five imports (both boards, both heartbeats,
  KpiStat) now use MiniTrend directly and sparkline.tsx is deleted.

- **2026-08-21 — UI best-version batch 31 (the clinic-portal closeout).**
  Appointment drawer: the one-primary action ladder moved into a sticky
  bottom footer (the shared Drawer's slot recipe) so it stays reachable
  while the activity log scrolls; in-office + destructive rows stay
  in-flow. Inbox: every bulk act now toasts its count; failures toast
  urgent (the header swap stays — Gmail grammar). Audiences: per-audience
  counts stream in after first paint (use() + Suspense on an unawaited
  promise). Website quick-edit modals ride the shared useFocusTrap; the
  services picker's reorder/remove now toast success. Website forms:
  submission rows deep-link to their own inquiry (/leads?lead=… opens the
  drawer), the empty state hands over Share-your-website, the 7-day count
  leads at full weight. Practice settings: view-only banner on the
  standard warn recipe, the Saved tick rides TONE_TEXT.ok + role=status,
  and SettingsTabs now WRITES ?tab=&sub= on click (replaceState) so
  refresh/share lands on the same tab. Two pages-manager items verified
  already fixed in place. **With this batch every clinic-side item in
  docs/UI-BEST-VERSION.md is done or explicitly deferred with a reason;
  the remaining unstruck items are the patient-portal cluster, outside
  this program's scope.**

- **2026-08-21 — UI best-version batch 32 (portal chrome + dashboard +
  visits; the portal program opens).** Fraunces is self-hosted (variable
  woff2, latin + latin-ext, preloaded — no more third-party font round
  trip or Georgia flash on cell connections); the portal loading shimmer
  went warm to match the cream canvas; the header "Book a visit" pill
  demotes to a quiet aria-current outline ON the booking page. Dashboard:
  both amber task strips ride PortalNotice, the balance strip leads with
  the bolded amount, verb tiles get a pressed state, and "See all visits"
  shows whenever anything is upcoming. Visits: past rows link to their
  detail pages (› affordance), the list caps at 10 with "Show older (N
  more)", and an empty history says so instead of vanishing. Visit
  detail: the pending-forms callout rides PortalNotice; the bring-list
  emoji quiet down to markers.

- **2026-08-21 — UI best-version batch 33 (portal booking + billing +
  records).** Slot buttons hit the 44px tap floor; the no-openings state
  offers the clinic's phone as a next step; book/request submits and the
  confirmation CTA ride BrandButton; the request form recovers its
  sibling's accessibility (role=group + aria-pressed on chips, role=alert
  on errors, PortalInput/PortalTextarea focus rings); the three files
  re-declaring the palette now import PORTAL_*. Billing: pay-form on
  tokens + BrandButton + announced errors + a focus-within ring; the
  post-Stripe banner is PortalNotice in a live region; history tabs get
  real tap height and full tab/tabpanel ARIA. Records: the off-palette
  error hex → PortalErrorText, success announces, "Not on file" reads at
  PORTAL_MUTED.

- **2026-08-21 — UI best-version batch 34 (portal messages, profile,
  family, intake).** Messages: send feedback is legible, announced
  (role=status/alert) and persists until the next action; the composer
  starts at one line and auto-grows (collapsing after send) so it stops
  colliding with the tab bar on short phones; the attachment remove hits
  24px; the paperclip emoji became a real stroke icon in the PortalIcon
  set. Profile: all 11 fields ride PortalInput with real focus rings
  (the WCAG item), the Saved note persists in a live region, Sign out
  gets a pending state, and the marketing toggle says so when a failed
  save reverts it. Family: Book-for pills ride BrandButton small, the
  no-dependents state now renders the self-serve FamilyLinkRequest, and
  ages read "age 8". Intake: Fill-it-out rides BrandButton, the raw
  green hex joined the palette, and the empty state is PortalEmptyState
  with a next step.

- **2026-08-21 — UI best-version batch 35 (the portal shared cards — THE
  PROGRAM CLOSES).** Survey NPS circles hit 44px with press (not hover)
  feedback; VisitCard's Confirm says "Confirming…" via a per-action key,
  its status pill rides the shared VisitStatusPill (new labelOverride
  keeps the deliberate "Needs confirming" divergence) and its result
  notice rides PortalNotice, which grew a danger tone; loyalty-card's
  rose text joins the palette with role=alert; PortalEmptyState's sage
  fallback becomes PORTAL_INK; family-link-request gets real labels
  (placeholders demote to examples). **Every item in
  docs/UI-BEST-VERSION.md — clinic portal AND patient portal — is now
  done or explicitly deferred with a reason.**

- **2026-08-21 — UI best-version batch 36 (the platform program opens:
  scout + the feedback-mechanics sweep).** Three scouts walked every
  platform-tenant surface against the design system; their ~90 ranked
  findings are now Cluster 4 of docs/UI-BEST-VERSION.md. First batch
  ships the two highest-leverage mechanical fixes: (1) the FlashToast
  primitive now announces urgent toasts as role=alert/assertive — an
  error toast no longer reads to a screen reader as a success — and the
  partner tables pass urgent tones on every failure path (validation and
  catches alike); (2) the Cancel-spin/shared-pending sweep across the
  core platform files — clinics delete-modal Cancel no longer spins,
  "View as" demotes from a per-row primary, a failed resend-invite says
  so instead of being swallowed, and partner/subscription/plan actions
  each spin alone (per-action keys) instead of lighting up every button
  on the row.

- **2026-08-21 — UI best-version batch 37 (Platform Overview + Revenue).**
  The Overview gets its one primary (+ Add clinic, which now opens the
  add-clinic modal on arrival via ?add=1); the Guardian's audience
  control keeps its audited inline-decision flow but rides real buttons
  with pending states and announced note/error; both honesty banners and
  the Stripe-unavailable banners move to the standard warn recipe with
  live regions; guardian/brain cards float as v2-cards; engine states
  render as StatusPills with an EncodingLegend generated from the same
  table; PMS-demand clinic chips and the activity feed rows become real
  links (whole-row targets). Revenue: Total and Project KPIs gain sparks
  from their existing weekly buckets, top-contributor and transaction
  rows deep-link to their clinics (the service now carries the org id),
  the split bars ride chart-series tokens instead of semantic tones, and
  the legend uses the fixed series order. Deferred with reasons: an MRR
  spark (no stored monthly series) and a platform-shaped dashboard
  skeleton (loading.tsx is tenant-blind).

- **2026-08-21 — UI best-version batch 38 (Clinics roster + clinic
  detail).** The delete-clinic modal gets the full dialog contract
  (focus trap, Esc, scrim-click — all blocked mid-delete — ink scrim,
  modal shadow, announced error); the roster adopts SearchInput, hands
  over "Show all clinics" on a filtered miss, and its header row +
  avatar fallbacks ride tokens. The detail page: teal eyebrow,
  in-progress projects read as in-flight (violet) instead of
  celebration-pink, an EncodingLegend generated from the same tables the
  rows render from, invoice rows deep-link to their Stripe hosted pages,
  and the NexHealth bind card moves onto ActionButton with per-action
  pending and an announced success. /ecommerce/customers gains a shaped
  loading skeleton. Deferred with reasons: the entity-style identity
  header stays custom (PageHeader has no avatar slot), and project rows
  stay unlinked (no per-project destination exists yet).

- **2026-08-21 — UI best-version batch 39 (Client messaging + MRR).**
  Messaging: the conversation title reads at real heading size (it was a
  12px whisper), Send rides the pending prop, the new-conversation
  trigger reaches 40px, the team empty state hands over an
  Invite-a-teammate button instead of a path typed in prose, the sidebar
  adopts SearchInput + aria-pressed tabs + surface tokens, and /messages
  gains a three-pane loading skeleton. Subscriptions: the local tone map
  drops sky (info=violet) and churn-risk reads warn instead of
  celebration-pink; every mutation now toasts its outcome; row errors
  announce beside the buttons that caused them; each attention bucket's
  "+N more" deep-links to the matching table slice (?status=); the
  Stripe-error banner announces; PlanMix rides EmptyState + chart
  tokens; the route gains a loading skeleton. Deferred: + New plan stays
  with its card (a rare act shouldn't be the page primary).

- **2026-08-21 — UI best-version batch 40 (Partners tail).** The
  filtered-empty table hands over Show-all-partners; the terms editor
  gets a real dirty contract (Save lights only on change, with an
  Unsaved-changes hint, and demotes to secondary so Pay-now keeps the
  page's one primary); all three rose-50 error blocks move to the urgent
  recipe with role=alert; the modal ✕ grows a 32px hit area; gray-400
  meaningful text joins the 500 floor; the silent active→all filter
  fallback now writes the state so the chips can't contradict the last
  click; both partner routes gain shaped loading skeletons. Ledger and
  payout empties stay quiet one-liners by the in-card precedent.

- **2026-08-21 — UI best-version batch 41 (Prospecting part 1).** The
  prospect drawer gets the standard dismiss contract — a thin client
  shell supplies scrim + Esc + focus trap + role=dialog while the
  content stays server-rendered (keeping the ?prospect= deep link) —
  and its ✕ grows a real target. The drawer's five actions split onto
  per-action pending keys, suppress rides useConfirm, and
  enroll/stop/re-enrich/suppress all confirm via toast. The contacts
  panel gets per-row pending, a confirm on contact delete, and a boxed
  ✕. The workspace header settles on ONE primary (Call Mode, breathing;
  Add-a-clinic demotes), the kill-switch banner joins the warn recipe
  with a live region, the search box becomes the shared SearchInput (a
  small client wrapper keeps the plain GET form), and all four
  prospecting routes gain shaped loading skeletons. **Batch 42 (Call Mode + demo prep + copilot):** every outcome logger — Call Mode's teleprompter, the call-list cards, the demo-prep header — now spins only the button you pressed and reports through the global toast instead of a vanishing 2.5s flash; the ⌘J copilot, the 🎭 rehearsal booth, and the Add-a-clinic modal all gain the standard dialog contract (focus trap, Esc, scrim click, screen-reader roles); demo-prep keeps ONE breathing primary; conversion/AI errors announce via role=alert; and a module-wide tone sweep retires sky, brand-teal-as-status (Won/savings → emerald), off-palette *-50 surfaces, and two raw hex colors. **Batch 43 (Prospecting home + boards):** the workspace's view switcher becomes filter chips so it can't be confused with the sub-nav; the prospects table's whole practice cell deep-links and the warmth tiles get a legend; the daily briefing's empty columns offer real next steps and overnight hot arrivals link to their deal rooms; the hunt panel's five engine pills get a legend; the focus banner and territory table move onto shared buttons with per-row pending, real links, and an empty state that points at settings; the pipeline board's counts and headline deep-link; win/loss meters and all low-contrast gray floors are tokened and legible; phone-queue's "No website" tone now matches the prospects table. **Batch 44 (Call Mode + deal-room tail):** Call Mode's session strip gains hover/screen-reader text for every segment (the outcome colors were the only encoding); both loss-reason pickers now read the one shared registry instead of a hand-rolled duplicate with different wording; the suggested-reply disclosure and copy buttons announce properly; the post-demo follow-up drafter gets honest button states, an announcing error line, and a toast when an outcome is logged; remaining low-contrast gray text in the deal room lifted. **Batch 45 (Marketing home + lead pipeline):** the lead-pipeline stage colors move onto the design system's tone registry (and match the prospecting board's language); the marketing home's funnel bars, recent-activity rows, and audience list all deep-link (activity rows open the lead's drawer directly); a failed card drag now announces itself instead of silently snapping back; the lead drawer spins only the pressed button and reports every failure; the add-lead dialog gets the standard modal contract; an empty board hands over the Add-lead button instead of six bare columns; the board gets a matching loading skeleton. **Batch 46 (Service library + editor kit):** the shared editor inputs used across every Website Studio modal move onto the app-wide form recipes (brand focus ring instead of a private gray dialect); the library-entry editor finally guards unsaved work on every way out (outside click included) and gets real dialog behavior; Approve/Reject each show their own progress; a missing reviewer note is pointed out right under the note box instead of a popup; chips lose developer wording; the board gains search and a loading skeleton. **Batch 47 (Blog editor + list):** background autosave no longer makes every sidebar button spin — each action shows its own progress with a live label; the just-published email nudge stops competing as a second primary and announces itself properly; publish errors announce to screen readers; all the sidebar's hand-rolled inputs move onto the shared form styles; the post list's read counts link into the post and the page gets a loading skeleton. **Batch 48 (Settings home + notifications):** the settings search box becomes the shared search control for both tenants; the notification page's save flow moves onto the standard save bar (it now actually shows "Saved" — before, the form thought it had unsaved changes forever after a save), the pause-all warning rides the standard amber style, explainer text is legible, and confirmations ride the global toast. **Batch 49 (Campaigns + audiences, platform orientation):** the platform's campaigns list now points home to Marketing instead of bouncing through a clinic-only hub; the audiences page stops giving one destination two different names; empty campaign lists hand over the New-campaign button; both audience editors get real dialog behavior, independent Refresh/Save progress, and error reporting; the campaign editor stops leaking the email vendor's name ("Resend" → "Branded email"), its cancel buttons stop pretending to work, and its status pill explains itself on hover. THE PLATFORM BEST-VERSION PROGRAM'S CLUSTER 4 IS NOW FULLY WORKED — every item done or deferred with a reason.

### The notifications overhaul (2026-08-25, owner: "the notification system
seems pretty bad")

The scout found the system's badness was mostly HONESTY, not plumbing. The
defect list, all fixed in one slice (migration 0153):

- **The "Email digest" that wasn't.** The delivery toggle — ON by default —
  emailed EVERY bell event individually the instant it fired: each booking,
  paid order, cancellation, form, and campaign send became its own email to
  every owner/admin, under a label promising a digest. Email delivery is now
  a per-user three-way MODE (`notification_prefs.email_mode`): 'all' (the
  old firehose, opt-in), **'urgent' (default for new users)** — only types
  the new registry marks urgent (a person waiting: patient message, lead,
  inquiry; or something broken: failed payment, bounced message, low
  review/survey, PMS sync down), and 'none' (bell only). Existing rows were
  backfilled to the behavior they had chosen; the legacy `push_email`
  boolean stays in sync for rollback.
- **Demo noise emailed real people.** The demo-org fallback routes bell
  events to platform admins — and emailed them too, so every test booking
  in Dream Dental landed in the owner's real inbox. Demo-fallback events
  are now bell-only by construction (`suppressEmail` beats even
  `forceEmail`; pinned by test).
- **A settings toggle wired to nothing.** The third bucket row ("Platform
  updates" / "Product news") controlled the `offers` bucket — which no
  dispatch site has ever sent to. Row cut; column stays for a first real
  sender. The other buckets' "Includes:" lines now enumerate what actually
  fires.
- **A muted alarm.** `pms_sync_failing` lived in the `candidates` bucket,
  labeled "Recall & marketing" — muting campaign chatter also muted the
  your-PMS-connection-is-down alarm. Moved to `comments` (default ON).
- **One face per bucket.** The tray painted 💬/🎯/📣 per BUCKET (Mosaic
  leftovers), so a 1-star review, a no-show and a paid order looked alike,
  and three dispatch sites compensated by baking emoji into titles (which
  leaked into email subjects). New client-safe registry
  `lib/types/notifications.ts` gives every type an icon + semantic tone;
  titles are words again; the tray was rebuilt on the v3 system
  (tone-tinted icon tiles, honest read-state, a real empty state) and
  screenshot-verified light/dark/empty via the render-rig loop.

Known and accepted: patients have no bell surface (no notify() ever
targets a patient and the portal renders no tray), so the patient branch
of the settings panel is defensive copy for an unreachable tenant state.

Same-day follow-ups (2026-08-26): the tray itself was rebuilt from
headlessui Menu to Popover — the Menu's outside-click handler dismissed
the panel before its own header/footer buttons (Mark all read, Clear all,
Preferences) ever received a click, and rows "activated" an inert <li>
instead of navigating (owner: "I can't click anything"); contract pinned
by tests/notifications/tray-popover.test.tsx.

### Support messaging wired end-to-end (2026-08-26, owner directive)

"From my platform portal, im supposed to be able to message clients, and
clients to be able to message me from their messages tab. i want it to be
called 'support' for the chat, not my name or identity." The system was
half-built: platform → clinic messages landed in a surface the clinic
NEVER renders (their /messages is the patient inbox), and clinic staff
were explicitly barred from starting a conversation with the platform
(`allowedRecipientIds` stops at their own org). Shipped: ONE support
thread per clinic org anchored on the never-before-used
`conversations.organization_id` (no migration); a third Messages tab —
Patients · Mailbox · **Support** (`/messages/support`) — where the
platform side always renders as "Support" 🎧 (identity contract pinned by
tests/messaging/support-view.test.tsx); the platform works the same
thread from Client Messaging under the clinic's name, its
New-conversation composer routes into the org thread instead of minting a
parallel invisible one, and its counterpart-picker now prefers the clinic
staffer (a multi-party support thread could otherwise file under 'team').
Both directions notify through the registry (support_message /
support_reply, urgent → they email under the default mode). The demo org
gets a read-only preview (no thread minted from Dream Create to itself).

### Test-hygiene note (worth keeping)

Two earlier R1 fixes (the loyalty patient-in-org guard and the follow-up
assignee guard) had broken `tests/patients` — a subset run had missed it
because those suites weren't in the subset. Caught by the full-suite gate,
fixed, and both guards now carry their own regression tests. Reinforces the
repo convention: **the full `pnpm test`, not a module subset, gates a slice.**

### The homepage headline faded out below the contrast floor (2026-09-14) · FIXED

**The defect.** `app/(marketing)/page.tsx`'s hero rendered its second line —
"One calm system." — as gradient text: `from-teal-600 to-teal-400` with
`bg-clip-text text-transparent`, on the marketing layout's hard-coded white
ground. With `bg-clip-text` the gradient IS the ink, so the right-hand stop is
the text colour: 5.09:1 at the `from-` end and **2.42:1 at the `to-` end**. The
last two words of the most-read page we have faded into the page. Found by
Quinn on DREAMCRM-43 while surveying the marketing site, handed over rather
than absorbed; fixed under DREAMCRM-44 (UI batch 62).

**The verdict.** Fixed. The gradient is now `from-teal-700 to-teal-600`
(7.05 → 5.09) — one token step deeper in the same colour family, which §6 of
the repo conventions rules is engineering rather than a redesign, so it did not
wait on the owner. The wider `to-teal-500` span the finding also offered was
declined: at 3.82 it clears the 3:1 large-text floor only, so it would have
been legal exactly as long as the headline stays 2.6rem.

**Why no gate caught it, and what now does.** This was the fourth blind spot in
the family rule 3 (#564) was written to close, and all three existing gates
missed it by construction: **axe** reports a gradient fill as `incomplete`
rather than a violation, so `marketing: home` held ZERO in `e2e/axe-baseline.ts`
with the defect live — there was no ceiling to shrink; **rule 2** matches
`bg-<ramp>-<step>` paired with `text-white`, and this chunk spells its fill
`from-`/`to-` and its ink `text-transparent`; **rule 3** grades gradient stops
as the SURFACE under white text, and there is no white ink here to anchor on.
Rule 3's own "stays quiet" test pinned the defective string as returning null,
one batch before anybody measured it — a rule declining to look is not the same
as the thing being fine, which is the axe-incomplete lesson repeating one level
in.

`tests/a11y/class-pairs.ts` rule 4 + `token-contrast.test.ts` now read the
stops of any `bg-clip-text text-transparent` chunk as INK and grade each
against white. Zero, no ceiling, no exemption. Its cutoff is rule 2's cutoff
asserted rather than assumed — the WCAG ratio is symmetric, so "white reads on
teal-600" and "teal-600 reads on white" are one measurement and the repo gains
no second opinion about which teal step is legal. **This is a new class of
assertion inside the required `test` check, so it changes what can merge:**
Forge intake and a Sentinel review, per the axe-ratchet shape in §2 of the
conventions.

### A new blocking assertion could reach `main` with nothing asking about it (2026-09-14) · FIXED

**The defect.** `scripts/review-gate.mjs` reported PR #566 — which added rule 4
to `tests/a11y/class-pairs.ts`, a new class of blocking assertion inside the
required `test` check — as **"✅ No review-gate files in this PR … merges on
green."** That was the correct answer to the question the check asks (does this
owe a review?) and no answer at all to the one that mattered (does this change
what everyone else can merge?). §2 of the conventions has always required the
second, and nothing in the repository could prompt for it: the gate list is
path-based, and a new assertion class inside an existing check touches no path
on it. Its author predicted at the DREAMCRM-45 planning meeting that #566 would
need routing, remembered the rule by hand, and routed it — while the one part
of the system that is supposed to know said otherwise, on the job summary, with
a green tick.

It is the fourth PR of this shape: the axe ratchet (#534, three days to reach
the skill), the shared-pending guard (#559), the brand ramp's solid-fill rule
(#555 — routed, but only the half its title described), and #566.

**The verdict.** Fixed under DREAMCRM-49. `scripts/review-gate.mjs` now answers
two questions separately. `INTAKE_RULES` names the files holding a repo-wide
blocking assertion; a PR touching one gets its own job-summary section and a
`needs-forge-intake` label saying *tell Forge the same day*. It adds no
reviewer and holds up nothing — §2 calls this intake, not review, and a
test-only PR stays exempt from §3. A PR can now be told "merges on green" and
"tell Forge" in the same summary, which is the honest pair of answers.

Deliberately **not** done by widening the review gate: measured against the last
90 merged PRs, folding these files into `GATE_RULES` would have put roughly a
third of them into a review queue of one. The money rule was narrowed on exactly
that reasoning, and this would have undone it faster.

Four files went the other way, onto the review gate as a new `check-definitions`
rule — `vitest.config.ts`, `playwright.config.ts`, `e2e/axe.ts` and
`scripts/review-gate.mjs`. They decide which assertions run and which are
excluded, which is the `.github/workflows/**` argument one level in.

**The half a path list cannot cover.** A brand-new scanner file matches no
pattern, which is how `dark-mode-parity.test.ts` (#555) and `shared-pending.ts`
(#559) arrived. `tests/guards/review-gate.test.ts` therefore derives the set
from the tree, on the same terms as the `@/lib/stripe` test: a suite file that
walks a directory and names a product root is asserting about the whole tree,
and must be on the intake list or `test` fails naming it. Red runs watched on
all four new assertions, including a fabricated new scanner file — it failed by
name on arrival.

### `e2e/axe-baseline.ts` has no guard that ceilings only go down (2026-09-14) · FIXED

**The defect.** §2 of the conventions states "Ceilings only ever go down" and
"raising a ceiling to get green is weakening a failing test", and nothing
enforces either. A PR that raises a per-(stop, rule) number in
`e2e/axe-baseline.ts` to get past a new accessibility violation turns `e2e`
green, trips no guard, and — deliberately, see below — carries no label.

**Reproduction.** Raise any entry in `e2e/axe-baseline.ts` by one and run
`pnpm test`: the suite is green. Nothing in `tests/guards/**` reads the file's
previous value.

**Why it was not simply added to the intake list** (DREAMCRM-49, where this was
found). The baseline is an *inventory of existing debt*, not a rule. Shrinking
it is the expected end of every accessibility fix — it moved in 10 of the last
90 merged PRs — so labelling those PRs would teach people the label means
nothing, and a path pattern cannot tell a shrink from a raise anyway. The
instrument this wants is a monotonicity guard that reads the entry's value on
`origin/main` and fails on any increase, with a deliberate opt-out that has to
be written down. That is a different defect from the routing hole and is filed
separately rather than bundled into it.

**The verdict** (DREAMCRM-60, #588, 2026-09-15). Built as specified.
`tests/guards/axe-baseline-ratchet.test.ts` reads every ceiling as `origin/main`
has it and fails any increase, inside the required `test` check (the git read is
the test's; `axe-baseline-ratchet.ts` beside it is a pure comparator) — including a
(stop, rule) absent from main, because an unlisted pair tolerates zero and
adding a line is therefore a raise from zero, which is the shape a reviewer's
eye forgives most easily.

The opt-out is `e2e/axe-baseline-raises.ts`, and putting it in its OWN file is
what resolves the argument above rather than working around it. The baseline
stays off every label list for exactly the reason recorded here; the raises file
holds nothing but raises, so it goes on the review gate under
`check-definitions`. A path pattern still cannot tell a shrink from a raise — it
does not have to, because the two directions now live in two files. Shrinks stay
quiet; a raise reaches Sentinel.

An entry re-asserts its own PREMISE, not merely its match: once the ceiling it
describes moves — which is what a fix landing looks like — `test` goes red until
the entry is deleted. That is #587's lesson carried forward rather than a fourth
instance of the gap Sentinel's DREAMCRM-55 contribution names.

Nine mutations watched red on the real file (an existing ceiling raised, a new
stop added, an opt-out overshot, an opt-out expired, an opt-out reduced to a
shrug, the workflow fetch step deleted, the gate pattern deleted, a spread added
to the literal). **The tenth came back GREEN and changed the code**: renaming the
export to `A11Y_BASELINE_V2` and aliasing it left every assertion passing,
because the marker was matched with `indexOf` and a prefix is not a name — the
`\b` family of trap from `docs/GUARD-MUTATION-PASS.md`, in a new spelling. The
marker carries a `(?![\w$])` lookahead now.

One thing this does NOT close, stated so nobody reads it as closed: the
comparison is against `origin/main`'s tip, and `actions/checkout` on a
`pull_request` builds the merge commit, so on a PR the tree being graded already
contains main. On a stale local branch the two can disagree about a ceiling the
branch never touched; the failure says so and names the fix (update the branch).
Under `strict: true` that state cannot reach a merge.

### Clipped text over a SOLID brand fill is graded by no rule (2026-09-14) · FIXED

**The defect.** Rule 4 (#566) grades `bg-clip-text text-transparent` only when
the ink is a *gradient* — `isGradientText` in `tests/a11y/class-pairs.ts`
requires at least one base-variant `from-`/`via-`/`to-` stop. A chunk spelling
the same effect with a solid fill —
`bg-teal-400 bg-clip-text text-transparent` — renders teal-400 letterforms on
white at **2.42:1** and is graded by nothing: rule 4 skips it for want of a
gradient stop, rule 2 skips it because `scanForWhiteOnShallowBrand` requires
`ink.word === 'white'` and the ink here is `transparent`, rule 3 needs a
`text-white` to anchor on, and axe cannot see a clipped background at all.

**Reproduction.** Add `className="bg-teal-400 bg-clip-text text-transparent"` to
any element under `app/`, `components/` or `lib/` and run
`pnpm vitest run tests/a11y/token-contrast.test.ts` — green, with a 2.42:1
headline live.

**Zero instances today** (`grep -rn "bg-clip-text" app/ components/ lib/` returns
the one fixed marketing headline), so this is a hole rather than a live defect —
which is precisely the shape #566's own module header argues for writing down:
*when you write a rule for a shape, write down what the shape's inverse would do
to it.* Rule 4 was written for the gradient inverse of rule 3 and left its own
solid-fill inverse open.

**The verdict.** Fixed (DREAMCRM-63, #594, `a90c6f64`). Rule 4 now resolves the paint that
becomes the letterforms through `clippedInks` in `tests/a11y/class-pairs.ts` —
the gradient's base stops when there is a gradient, and the solid
`bg-<colour>` when there is not — and grades whatever comes back as ink on
white, against the same cutoff it already shared with rule 2. A gradient WINS
over a solid fill when both are present, because `background-image` paints over
`background-color`, so a fallback nobody sees is not condemned. The rule's
surface was renamed with it: `isClippedText`, `gradeClippedTextClasses`,
`scanForUnreadableClippedText`, `clippedTextSites` and
`CLIPPED_TEXT_EXEMPTIONS`, because a name reading "gradient" over a rule that
grades solid fills is the overclaiming-name failure §2d warns about, seen from
the other end.

**The red run, watched on the reproduction above.** `className="bg-teal-400
bg-clip-text text-transparent"` in `app/(marketing)/page.tsx`: GREEN on the
guards as they stood (all 42 assertions passing with a 2.42 headline in the
tree), RED after, reporting
`app/(marketing)/page.tsx:219 — the solid fill IS the ink here (bg-clip-text),
and it is too pale to read (bg-teal-400) — light: teal-400 on white = 2.42`.
Both halves were run; the green one is the part worth recording, because it is
the state this repo was in for a day short of a week.

### Three dead-exemption detectors asked whether an exemption still MATCHED, never whether its REASON held (2026-09-15) · FIXED

**The defect.** This repo has four allow-lists that make a contrast gate
looser, each with a detector that fails when an entry stops matching anything:
`deadBrandFillExemptions`, `deadClippedTextExemptions` and
`deadToneFillExemptions` in `tests/a11y/class-pairs.ts`, plus `deadExclusions`
in `e2e/axe.ts`. All four asked the same question — *does this entry still
describe something?* — and none asked *is the reason it was granted still
true?* Those come apart, and when they do the exemption goes on pardoning its
subject with its whole argument gone. #587 found it on the fourth list
(moving the marketing hero off `bg-gray-950` left every assertion in
`token-contrast.test.ts` green over a headline measuring 1.88 on white) and
closed it for the one entry it added. The other three were left open, which is
the `public-action-tenancy` lesson in new clothes: a narrow allowance
outliving its subject is exactly what these lists were built to prevent.

**Reproduction, one per list, each green before and red after.**

- `BRAND_FILL_EXEMPTIONS` — delete `aria-hidden="true"` from
  `RecallFunnelMock`'s root in `components/marketing/ui.tsx`. The bars become
  content; the exemption's entire argument is WCAG 1.4.3, *text that is part of
  a picture*; white on `teal-400` at **2.42** goes on being pardoned and the
  detector says nothing. Second shape: re-point one bar so the
  teal-200/300/400/600 progression the `why` describes is no longer there.
- `TONE_FILL_EXEMPTIONS` — move `bg-rose-600 hover:bg-rose-700 text-white` out
  of `VARIANT_CLASSES` into a local const in the same file. The `why` claims
  the pairing is *already decided in ONE place*, which is the thing rule 5
  protects; after the move it is a fresh local guess, and the detector is still
  green because the string is still in the file. Second shape, numeric:
  re-point `--color-rose-600` so white on it drops to 3.91. The `why`'s "it
  clears AA, but only at 4.53" is now false, rule 5 is not a ratio rule so it
  stays quiet, and the pardon covers a fill under the floor.
- `DECORATIVE_MOCKS` — add a readable 14px panel that fails contrast inside
  `.mkt-float > [aria-hidden="true"]`. The selector still matches, so
  `deadExclusions` is green, `marketing: home` keeps its ceiling of ZERO, and a
  real contrast defect on the busiest public page we have is discounted by a
  sentence about 7px illustration glyphs.

**The verdict.** Fixed (DREAMCRM-63, #594, `a90c6f64`). Each list's own premise is now asserted
against the source or the page that justifies it, in the shape #587 established
— assert the FACT the `why` rests on, not that the string is still somewhere:

- `token-contrast.test.ts`, "the exempted bar is still an aria-hidden picture,
  inside its progression" — the owning component (not the file: most mocks in
  that 1,100-line file are `aria-hidden`, so a whole-file search passes on
  somebody else's attribute) still marks itself `aria-hidden`, and all four
  steps of the progression are still there.
- `token-contrast.test.ts`, "the exempted danger fill is still VARIANT_CLASSES'
  own entry, not a loose copy" plus "…still clears AA, which is what makes it a
  note" — the structural half reads the `danger` VALUE out of the record, the
  numeric half re-derives 4.53 and 6.03 from the palette rather than trusting
  the `why` text.
- `e2e/axe.ts`, `exclusionsHidingReadableText` — scans the page WITHOUT the
  exclusions, takes the `color-contrast` findings the exclusions are
  discounting, and reports any whose element renders at or above this repo's
  own **12px legibility floor**. Deliberately narrower than "no big text in
  there": the real mocks carry a 16.8px headline that reads fine, and a rule
  firing on that is the "208 places to catch 8" failure that gets a guard
  switched off. It costs one extra scan, at the one stop in the suite that
  passes exclusions, and is skipped where there are none.

Every one of the six mutations above was watched RED, and the failing direction
of the axe production path was watched by hand (`expectNoA11yViolations`
reports through `expect.soft`, and a soft failure marks the test that provoked
it failed no matter what that test then asserts — so it cannot be a passing
Playwright test). `tests/guards/axe-exclusion-premise.test.ts` is what keeps
that wiring from coming undone afterwards: it fails `test` if
`expectNoA11yViolations` stops asserting on either detector.

### A failed migration deployed green (2026-09-14) · FIXED

**The defect.** Nothing anywhere asserted that production had applied the
migrations in the commit it was running. Three separately-defensible decisions
added up to it: `Dockerfile:62` runs `(db-migrate && resync-demo) || true`
*after* App Runner has already marked the container healthy, so the exit code is
swallowed by design — taking the container down because a migration threw would
turn a stuck schema into an outage; `deploy.yml` had no migration step at all;
and `/api/admin/migrate` answers a 500 that nothing reads. A merge whose
migration failed therefore showed a green tick and produced no other signal.

It compounds, which is what makes it an S1-shaped problem rather than a one-off
bad deploy. `PgDialect.migrate` applies a boot's pending migrations in ONE
transaction and only ever considers journal entries whose `when` is GREATER than
the newest ledger row. So a migration that throws rolls the whole batch back and
every later migration is blocked behind it on every future boot — and, the other
half of the same invisibility, a journal entry whose `when` lands at or below an
already-applied row (what a rebase or a merge reordering two generated
migrations produces) is skipped SILENTLY, FOREVER, and no redeploy fixes it.
DREAMCRM-32's own catalog entry had already named this in passing: "on a
duplicate the deploy goes GREEN and the migration is skipped silently, forever."

**The verdict.** Fixed. `.github/workflows/migration-check.yml` +
`scripts/migration-check.mjs` ask production which migrations it has actually
applied — through the DREAMCRM-42 read path (catalog entry `migrations-applied`,
the `SELECT`-only role), so no runner holds a database credential — and compare
that against `lib/db/migrations/meta/_journal.json`. `deploy.yml` calls it with
`needs: deploy`, NOT `continue-on-error`, so a merge whose migrations did not
land turns the deploy run red. It also runs daily at 08:20 UTC, which is the
timing-free reading and the only thing that would ever catch the silently-skipped
case. Mechanics: `docs/CI.md`, "The deploy is not finished until the migrations
are in".

The `|| true` in the Dockerfile **stays**, deliberately. The failure mode here
was never that the container kept serving; it was that nobody was told. Removing
it would trade an invisible schema problem for a visible outage on every
transient migration failure, and the assertion above is the thing that was
actually missing.

Second, weaker signal from the other end: every failure line
`scripts/db-migrate.mjs` prints now starts with `ERROR`, so `error-scan.yml`
picks it up within 30 minutes. Those two lines previously matched none of that
workflow's filter terms — the one alarm already pointed at those logs read
straight past a migration that never applied.

**Honest about what it proves today.** The read path needs owner-side setup
(DREAMCRM-42 steps 1–3) before this question is answerable at all, so until that
lands every run prints `⚠️ NOT VERIFIED — nothing was checked` and exits 0. The
alternative — an alarm red every day for an unrelated reason — is one nobody
opens on the day it first means something. The summary says so on every run, and
a guard asserts that the NOT VERIFIED wording can never read as a pass. A fifth
verdict, `THE CHECK ITSELF IS BROKEN`, covers production rejecting the secret and
exits 1: an alarm that cannot fire is not the same as one with nothing to report.

**What the review changed.** Two blocking findings, both about placement rather
than design. The two `drizzle` grants had been written into
`scripts/readonly-role.sql` *above* the credential `REVOKE`s — and that script is
run once, by hand, with `ON_ERROR_STOP=1` and no surrounding transaction, so an
error on either line would have ended the run with `dreamcrm_readonly` created,
holding blanket `SELECT` on all of `public`, and none of the 19 revokes applied.
They are the first statements in that file to depend on an object nobody has
looked at, and they had been put ahead of the only thing standing between that
role and every stored password hash and session token. Moved below, as section
4b. Nothing had run yet, so nothing was ever exposed. Second: the poll was inside
`deploy.yml`'s workflow-level `deploy-main` concurrency group, which would have
stalled the *next* merge's test-and-build behind it — up to 12 minutes, worst
case on exactly the fix-forward merge. The group now sits on the `deploy` job,
where the thing that genuinely cannot overlap lives. Three files had asserted the
opposite; all three now state the real shape.

**This changes what a deploy can report, and it edits `.github/workflows/**`,**
so it is behind the review gate (done, Sentinel, 2026-09-14) and owes Forge
intake per §2 of the conventions.

### The 20s stall-detector tail — STRUCK BY DECISION (2026-09-14)

**The item.** `vitest.config.ts` pins `testTimeout: 20_000`, and DREAMCRM-19's
note beside it says what would earn a lower number: pre-load the **8 remaining
files** that still `await import()` the module under test inside a test —
`tests/automation/cron-auth` (8 route graphs behind a `describe.each`),
`tests/inbox/gmail-parser` and `tests/inbox/classification` lead them — and
re-measure. DREAMCRM-19 did that work for 35 of the original 43; these 8 defer
on purpose (`vi.resetModules`, `vi.doMock`, env set before the import), so each
needs its own judgement about whether the module reads its env at import time
or at call time. A per-file product question, not a mechanical edit.

**The verdict: struck, not done, and not deferred a third time.** It reached
the planning meeting twice, was deferred both times, and the DREAMCRM-45
meeting took it off the list on QA's own recommendation. Carrying an item a
third time is not a decision, it is a habit — and this one was never a defect.

**Why striking it is safe, and on what evidence.** A timeout is a HANG
detector, not an assertion: raising it relaxes no check and lowering it
tightens none. So the only thing a lower number buys is a *faster* report of a
hang that is not happening. Checked before striking (200 GitHub Actions runs,
2026-09-11 00:53 UTC to 2026-09-15, the whole life of the current budget):

- two `CI` failures in the window, and neither was a vitest timeout — one was
  a Playwright `toContainText` assertion timeout in `e2e`, the other a
  deliberately broken tree of our own (the DREAMCRM-48 red run);
- every `nightly-test` green across all four unattended nightly fires;
- every `tz-canary` green too — worth checking separately, because it is the
  one job that runs the unit suite under a non-UTC clock and
  `continue-on-error: true` means a red one would not show up as a failed run.

Nothing has come near 20s. Under load the slowest of the 8 reaches ~4.3s on its
first test, which is the 4.6x headroom the note describes.

**What would reopen it.** A vitest timeout in `test`, `nightly-test` or
`tz-canary` — any one of them. At that point the answer is still the pre-load
work and a re-measure, not a bigger number: raising a hang detector to get
green is the same move as raising an axe ceiling, and §2 of the repo
conventions rules on it the same way. The note in `vitest.config.ts` keeps the
whole recipe, so striking the ledger entry costs nothing but the queue slot.

### A raw control byte makes a tracked file unreviewable, and nothing checks (2026-09-15) · FIXED (#603, `5322a489`)

**The defect.** Git decides a file is binary by scanning its first 8000 bytes
for a `NUL`. A tracked text file that contains one renders in every diff — `gh
pr diff`, the GitHub review view, `git diff --numstat` — as `Binary files …
differ`, with no content and a `-  -` line count. Nothing in the repo checks for
this, so a file can become unreadable in review without anyone choosing it, and
the PR that does it reports no additions.

**Why it is a gate defect and not a formatting nit.** The consequence lands on
review, which is the control §2 and §3 rest on. #588 shipped
`tests/guards/axe-baseline-ratchet.ts` — the comparator for the axe ratchet —
with a `NUL` at byte 7636, inside the sniff window. The whole 13,413-byte body
was invisible in the PR diff. `tests/guards/**` is on `INTAKE_RULES`, not
`GATE_RULES`, so every future edit to that file would have gone to intake rather
than to a reviewer, pointed at a blob: **a weakening of the ratchet would have
been invisible in review by construction.** Sentinel caught it on #588 and
blocked on it; the file is escaped and diffs as text now (`335 0`).

**Three independent reproductions, none of them in code.**

1. `docs/RELEASE.md` carried a raw `0x08` at byte 193065, where `` `\b` `` was
   meant — in this ledger, which had therefore lost the name of the lesson it
   was recording. Same in `tests/guards/axe-baseline-ratchet.test.ts` at 8664.
2. Forge reproduced it independently about half an hour later, in a different
   tool, writing the conventions skill: `` `\b` `` typed into an edit script
   arrived at disk as a real `0x08` after two layers of JSON encoding. Caught
   only because that lane diffs every write byte-for-byte against what it sent.
3. Quinn reproduced it a third time *while writing this entry*, which turned
   `RELEASE.md` binary until it was caught.

**So the hazard is not "somebody typed a control character".** It is that prose
quoting a regex or an escape sequence **acquires the byte on the way to disk**,
through the authoring path, without anyone choosing it. All three were in docs.
None was in code. A guard therefore wants `docs/**` in scope, not just source.

**Reproduce it:**

```bash
printf 'const a = 1\nconst k = `x\0y`\n' > tests/guards/zz-probe.ts
git add tests/guards/zz-probe.ts && git diff --cached --numstat -- tests/guards/zz-probe.ts
#  -  -  tests/guards/zz-probe.ts      <- binary; no content in any diff view
git rm -qf --cached tests/guards/zz-probe.ts && rm tests/guards/zz-probe.ts
```

**Live instance, and it survives by luck.** `lib/services/acquisition.ts`
carries the same raw-`NUL` composite-key idiom at bytes 8750, 8799 and 9223.
The file stays text only because the first one sits *past* the 8000-byte sniff
window — a byte-offset accident, not a different convention. One added comment
paragraph above it flips the file to binary. That fragility is the argument
*for* a guard rather than a caveat on it: a finding whose reproduction depends
on nothing above it moving needs a check that re-derives it, not a note that
records it.

**The fix, and the sequencing it forces.** Write the separator as an escape —
`` `${a}\u0000${b}` `` — and `\b` in prose. Identical string values, no
behaviour change, +5 bytes each. But **a guard that is red on arrival cannot
land**, so the escape in `acquisition.ts` and the guard must ship in ONE PR.
That edit is product code in another lane; it is a composite map key that never
leaves the function, so it is about as safe as a product-code change gets, and
this entry is the hand-over §10 asks for — file, byte offsets, consequence, fix.

**What shipped (DREAMCRM-66, #603, merged 2026-09-15 `5322a489`).** `tests/guards/control-bytes.ts` +
`control-bytes.test.ts`: every tracked file is walked with `git ls-files` and
scanned for any C0 byte outside tab, LF and CR. Three decisions are the whole
design:

- **It does not re-derive git's 8000.** `acquisition.ts` was clean by that rule
  on the day it was one comment paragraph from unreviewable, and a check that
  reports a file like that as fine teaches people it is noise. The window is
  reported in the failure message and gates nothing.
- **It bans the whole C0 range, not just `NUL`.** `0x08` never makes git call a
  file binary and had still eaten a word out of this ledger. The hazard is the
  authoring path, not git's sniff.
- **Exclusions are derived from CONTENT, not from a path list.** A file is
  skipped when its first bytes are a known binary signature (PNG, JPEG, WebP,
  ICO, WOFF/WOFF2, ...), anchored at offset 0. Asking git "is this binary?"
  would have been circular — it already called `acquisition.ts` `-text` —
  whereas a `.ts` file does not open with a PNG header, and a font added
  tomorrow is skipped with nobody editing anything. A second assertion closes
  the mirror hole: a file whose header and extension disagree fails by name, so
  the exclusion cannot become a hiding place.

Beside the byte scan the guard asks **git itself**, through the `w/` column of
`git ls-files --eol`, and requires the two answers to name the same files. That
column and not `i/`: `i/` reads the index, and the test failed on
`acquisition.ts` with the fix already applied on disk because the index still
held the old blob. A guard that only tells the truth after `git add` gets
distrusted.

**Two live instances nobody had found, and a fourth reproduction during the
fix.** The sweep turned up raw `0x1B` in `scripts/e2e-flaky-summary.mjs` and
`tests/guards/e2e-flaky-summary.test.ts` — four sites, all of them an ANSI
colour-code regex that had lost its backslash, the same shape as the `0x08` in
this ledger. And writing the guard reproduced the hazard a fourth time: the two
new files arrived on disk with **nine** raw control bytes in their own fixtures,
every one of them a place the escape was typed and the byte was written. Which
is the argument for the check, stated by the check's own authoring: three
reproductions in a day across three tools is not a run of bad luck.

Escaped in the same PR because a guard that is red on arrival cannot land:
`acquisition.ts` (3 x `\u0000`, identical map keys, no behaviour change) and the
four `0x1B` sites (`\x1b`, same regex, same string).

**Red runs, on the real defect.** The byte scan was watched red on: the three
`NUL`s restored in `acquisition.ts` **past byte 8000** — the mutation §2d asks
for, git still diffing that file happily; a `NUL` planted at byte 7000 of
`tests/guards/axe-baseline-ratchet.ts`, the #588 shape; and a `0x08` planted in
this file, where `git ls-files --eol` reports plain text and only the byte scan
can see it — which is what proves the scan is not leaning on git's verdict. The
instrument was then broken in both directions: a PNG header prepended to
`acquisition.ts` (caught by the extension-mismatch assertion, so the exclusion
is not a hiding place), and `binarySignatureOf` forced to `null` and to
always-match (five and six tests red respectively).

**Gate routing.** New CLASS of blocking assertion inside `test`, repo-wide over
all tracked source and docs — Forge intake on the day, and the
`needs-forge-intake` label fires by path (`tests/guards/**` is on
`INTAKE_RULES`). Sentinel review classified by running `gateFindings()` on the
real file list rather than by guessing; see the PR.

## Part 6 — The post-1.0 backlog
Moved to `docs/POST-1.0.md` (2026-08-17) — the full seeded inventory:
externally-gated items (OD vendor portal, first A2P approval,
procedure-code data), deferred feature ideas (webhooks at scale,
plan-card photo slots, SMS second wave, phones territory, …), and the
ECS decision.
