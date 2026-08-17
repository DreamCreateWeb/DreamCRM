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

## Part 6 — The post-1.0 backlog
Moved to `docs/POST-1.0.md` (2026-08-17) — the full seeded inventory:
externally-gated items (OD vendor portal, first A2P approval,
procedure-code data), deferred feature ideas (webhooks at scale,
plan-card photo slots, SMS second wave, phones territory, …), and the
ECS decision.
