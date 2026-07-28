# Phase Audit Certificates

Every transformation phase (and any major feature slice) ends with the
**phase-audit workflow** (`.claude/workflows/phase-audit.js`). The machine,
per the owner's standard ("perfection plus depth", 2026-07-27), **v2 shape
(2026-07-27, after v1 consumed ~75% of a monthly quota on Phase 1):**

- **Perfection chamber** — 4 merged lens auditors (claims/semantics ·
  law/doctrine · resilience/tests · depth) file DEFECTS; ONE adversarial
  skeptic tries to refute each; the MAIN LOOP (the session's stronger model)
  re-verifies every survivor against the cited code before anything is
  fixed — it is the second, decisive vote.
- **Depth chamber** — "would it make sense to add more?" The depth lens
  files PROPOSALS; ONE value judge (three standpoints in one prompt) triages
  each into *in-phase gap* (blocks the gate), *backlog* (the owner's menu
  below), or reject; in-phase gaps also get main-loop confirmation.
- **All subagents run Opus** (`model:'opus'`) — near-flagship quality at a
  fraction of the cost; the main loop supplies the flagship judgment where
  it counts.
- **DONE = one clean round** (zero confirmed defects + zero in-phase gaps).
- **HARD CAP: 3 rounds.** The script refuses a round 4. If round 3 still
  finds significant items (any critical/major defect or in-phase gap), more
  auditing is the wrong tool — the phase was under-built or its claims were
  wrong: fix what round 3 found, then write the owner a ROOT-CAUSE
  RETROSPECTIVE here ("why did this phase ship with this many gaps?") and
  decide together whether to re-open the phase as new build work.
- Integrity law (unchanged from v1): a dead auditor/voter is never a clean
  vote — the round is invalid and re-runs without consuming the cap.

(Phase 1's rounds 1–5 below ran under **v1**: 9 lenses, 3 skeptics + 3
judges, Fable subagents, dry = two consecutive clean rounds. Its certificate
stands as written.)

Each certificate records: rounds, findings found → confirmed → fixed →
rejected, the backlog harvest, and the gate declaration.

---

## The depth backlog (the owner's menu)

Proposals judged real-but-future-scope land here, newest first. The owner
promotes items into phases; nothing here is a commitment until he does.

**From Phase 2 round 1 (2026-07-28):**

1. **The ledger outcome contract** — the standup narrates what the machine
   DID, not what came of it ("41 reminders — 38 confirmed"). The judge kept
   it backlog: writers embed domain ids so nothing is irrecoverable, and
   per-capability outcome linkage across 20+ writers is its own slice.
   (Re-affirms the round-4 item; the standup consumer arrived but dictates
   only the read shape, which shipped as `until`.)
2. **`originalBody` on proposals** — approving with edits overwrites the
   draft, losing the send-as-written vs rewrote-it signal. Promote FIRST
   into Phase 3 (its consumer): one nullable column + stash-at-approve.
3. **"This week so far" line / the daily brief** — the standup card shows a
   window up to 13 days old by Friday; DESIGN.md names the daily brief as
   the Narrator's second voice. Build the ledger paragraph into the daily
   digest as its own slice.
4. **Ledger drill-down drawer** — the standup's counts are unclickable
   numbers; a /dashboard ledger drawer filtered by capability + week serves
   the standup, the daily brief, and Phase 4's guardian in one build.
5. **Proposal-engine observability** — generator run results are discarded;
   AI-off/over-cap no-ops silently. Fold generator counts into the daily
   digest when Phase 4's Guardian lands (the clinic-facing half shipped as
   the quiet-week config narration).
6. **Decided-proposal history** — approved/declined/expired rows have no
   reader ("what was in that campaign I approved Tuesday?"). The approve
   TOAST shipped in round 1; the history strip is future scope.

**From Phase 1 round 4 (2026-07-27):**

1. **The ledger's outcome-linkage seed** — DESIGN.md defines the ledger as
   "what the machine did AND WHAT CAME OF IT"; no outcome field or pinned
   detail-key contract exists, and `logReminderSent` omits the reminder-log
   id it just minted. Nothing is irrecoverable (writers embed domain entity
   ids; joins work via appointmentId+time), so the contract — and the
   reminder-log id — ship with Phase 2's standup, whose consumer dictates
   the shape.
2. **Typed appointment-source registry** — 'pms'/'pms_live'/'pms_import'
   are raw literals; the journey law is an inline-SQL denylist, so a future
   bulk importer's new source value would mint fake timestamps by default.
   Current behavior is correct and executed-tested; build the registry +
   guard with the first new importer (Dentrix/Eaglesoft migration tooling).

**From Phase 1 round 3 (2026-07-27):**

1. **Ledger read shapes: `until`/cursor/capability filters** —
   `listRecentActions` caps at 500 with no upper time bound, so an
   after-the-fact "last week" narration can't be answered exactly. Purely
   additive params; build with Phase 2's standup consumer (kin to items 3
   and 5 below).
2. **Pin the transactional-receipt boundary** — booking/cancellation
   confirmations (and order/auth receipts) deliberately don't ledger:
   they're receipts for patient-INITIATED events, unlike the machine-
   initiated auto_reply. The judges accepted the boundary but it lives
   nowhere — write it down (and decide the machine's intake-form choice)
   when Phase 2 defines what the standup narrates.
3. **Reverse capability guard: extend the scan root to app/** — the spine
   guard walks lib/services only; zero app/-side writers exist today, but
   Phase 2's proposal writers will live under app/. One line when they land.
4. **Append-only CI guard for action_ledger** — the law is comment-only;
   an allowlisted db.update/db.delete scan (patient-merge's repoint is the
   one sanctioned mutation) pins it in the repo's guard-everything style.

**From Phase 1 round 2 (2026-07-27):**

1. **Engine heartbeat / empty-week honesty** — an empty ledger week is
   indistinguishable from a dead engine (`countActionsSince` returns the
   same `{}` for healthy-idle and broken). Phase 2's standup must narrate an
   empty window from automation-config cross-checks; the real "engine ran"
   evidence belongs to Phase 4's Guardian. Distinct from item 7 below
   (failure vocabulary covers attempts that failed; this is absence of any
   evidence of life).
2. **Autonomy grant provenance** — `clinic_profile.autonomy` stores a bare
   `'ask'|'auto'` with no who/when. Nothing writes grants until Phase 3's
   UI, so no migration burden yet — but the grant flow must record
   provenance (object shape or a ledger entry at grant time) when it ships.

**From Phase 1 round 1 (2026-07-27):**

1. **Seated-everywhere adoption sweep** — live readers that still count
   "new patients" from record creation should all migrate onto
   `getJourneyFunnel`/`firstSeatedAt`: the patients service source-mix +
   `getNewPatientsPerWeek12`/`getNewPatientCounts` (which feed the GROWTH
   SCOREBOARD hero and Overview trend — still `firstSeenAt`-based; a
   round-1 note claiming the scoreboard was "already fixed" was wrong and
   round 2 corrected it — only the backfill-source EXCLUSION shipped
   earlier, not seated semantics). NOTE (round 2): the spine currently has
   ZERO production consumers — `getJourneyFunnel`/`getJourneyForPatients`/
   `resolveTrust` are exercised only by tests until this sweep lands.
   Natural fit: Phase 2, when the standup starts quoting the numbers.
2. **Demo Action Ledger seeding** — the demo clinic should boot with a
   persona-anchored week of ledger entries (with a cleanup marker, per the
   demo-org convention) so the Phase 2 standup/approval surfaces demo well.
3. **Aggregate read shapes for the home page** — the ledger's readers cover
   list + counts; the future "what the employee did" home hero will want
   day-bucketed clinic-tz aggregates. Build alongside that UI, not before.
4. **Who-lists behind funnel numbers** — every funnel/scoreboard number
   should click through to the people it counts (the no-fake-content law's
   next of kin: "no unclickable numbers").
5. **Inquiries should include untriaged website leads** — the journey funnel
   counts patient records only; a lead that never converted is still an
   inquiry the town sent. Needs the lead↔patient dedupe story from `/leads`.
6. **Ledger failure vocabulary** — `recordAction` swallows failures with a
   console line; a standing "the machine tried X and failed" capability
   (with Guardian escalation) belongs in Phase 4's guardian work.
7. **Autonomy UI** — the ladder resolves trust but no surface lets a clinic
   SEE or change grants yet; Phase 3 is explicitly this.
8. **PMS real first-visit dates** — `BACKFILL_PATIENT_SOURCES` exclusion is
   honest but lossy; reading Open Dental's true first-visit date would let
   imported rosters carry real journey timestamps.

---

## Certificates

*(newest first)*

### Phase 2 — the voice (proposals · Approval Inbox · weekly standup)

**Status: round 1 COMPLETE + FIXED (v2 gate, 2026-07-28); round 2 pending.**
First audit under the v2 shape (Opus lenses via direct-Agent fallback — the
Workflow runtime's permission-handler fault recurred and the integrity guard
correctly invalidated the workflow run; the same 4-lens shape re-ran through
the Agent tool). Range `4f55238..708cd73`.

- **Round 1:** 4 merged lenses → 18 defect candidates + 12 depth proposals
  after dedupe (3 defects found by 2–3 lenses independently) → ONE skeptic
  confirmed 13 / rejected 5, ONE judge ruled 7 in-phase / 5 backlog / 0
  reject → main-loop confirmation upheld every skeptic verdict (the
  decisive second vote; each survivor re-read at the cited lines).
- **Confirmed + FIXED (13):**
  1. [major, 3 lenses] The standup re-implemented the seated law
     (min(completedAt) vs the spine's least-recipe; ANY-import suppression
     vs imported-earlier; no archived exclusion) → **countSeatedBetween
     shipped on the journey spine** (same aggregates + suppression by
     construction, recipe-pinned + canned-row tested) and the standup
     consumes it. One law, one implementation. [with in-phase gap D2]
  2. [major, 3 lenses] demo recall proposal hardcoded payload
     recipientCount 3 beside a title built from the real resolved count →
     payload now carries the real count (omitted when unresolvable).
  3. [major, 2 lenses] executeSocialPost ledgered the REQUESTED channel
     count on partial publishes → narrates the actual per-target published
     count ("(1 channel didn’t take it)"), and ZERO accepted channels
     reopens instead of ledgering.
  4. [major, 2 lenses] The standup email had no off switch → org-gated on
     the digest master switch, sent to ALL staff roles (the office manager
     is usually 'admin'), honors getDigestOptOutUserIds. [with gap D9]
  5. [major, narrowed by the skeptic] reopen-after-execution double-send:
     the try wrapped post-execution bookkeeping; inquiry sent email BEFORE
     the status flip; campaign retries minted fresh rows → bookkeeping
     moved OUT of the reopen region (a bookkeeping blip never reopens
     executed work); markLeadContacted is best-effort after the send; ONE
     campaign row per proposal (id stamped into payload pre-send, retries
     reuse it; already_sending on a reused row retires the card — never a
     re-blast).
  6. [major] zero-recipient / total-failure sends ledgered "Sent … to 0
     patients" as success → r.sent === 0 reopens with a friendly hold
     message; the campaign row stays draft for a clean retry.
  7. [minor] failed approves left duplicate draft campaigns in /growth →
     closed by the campaignId reuse in #5.
  8. [major] test gap: the standup harness stubbed min()+groupBy → the
     semantics now live in the spine's pinned recipe; countSeatedBetween
     has canned-row window/suppression tests + recipe/WHERE source pins;
     the standup test pins only "asks the spine with the right window".
  9. [major] test gap: unfailable mocked seams → new tests: post-execution
     bookkeeping failure never reopens; partial/zero social publish;
     zero-sent campaign; contact-mark blip; campaign-row reuse.
  10. [minor] standup week claim was read-then-write → atomic conditional
     claim (prior-value predicate + returning) before send.
  11. [minor] WeeklyStandup doc claimed Monday-based weeks → corrected to
     Sunday (clinicWeekStart) everywhere, example included.
  12. [major] the review-reply generator forked a SECOND AI prompt that
     weakened review-reply-ai.ts's hardened public+HIPAA rule and minted a
     second meter → the generator now drafts through
     **draftGoogleReviewReply (the single home)**: one prompt, one
     review_reply_draft allowance, displayName voice.
  13. [minor] cadence sourceKeys were UTC-month keyed → clinic-local
     monthKey (CLAUDE.md bucketing law) + a 14-day respect-the-no
     backstop: a decline blocks the same ask across the month boundary.
- **Skeptic-rejected (5, upheld on main-loop review):** hourly
  getRecallStats load + per-render buildWeeklyStandup (both consistent
  with existing /growth query load — accepted design, optimization
  welcome later); the 4,096-char review-reply edit (unreachable and
  already graceful); the reachable-count population mismatch (populations
  effectively coincide; '~' hedges the frequency-cap delta); the dead
  expireProposal export (half-wrong evidence; the helper was deleted as
  cleanup anyway).
- **In-phase gaps SHIPPED (7):** D2 (the spine consolidation, above) ·
  D3 the approval card QUOTES the thing being answered (generators + demo
  store payload.context; blockquote on the card) · D4 proposals reach
  beyond the Overview (sidebar badge on the Overview entry via
  /api/nav-badges, a My Day tile, a morning-digest line) · D6 approving
  answers with a FlashToast naming what happened (the ledger one-liner
  rides the action result) · D9 (all-staff + opt-out, above) · D10 a
  quiet week is NARRATED from automation-config cross-checks (quietNote:
  "reminders are switched off" vs "on and watching" — the AUDITS.md
  mandate, verified verbatim by the judge) · D12 merge-token bodies render
  as a SAMPLE ("Hi Maria,") with an edit-mode legend — raw {{tokens}} are
  never handed bare to a non-technical reader.
- **Backlog: 6 items** (see the menu above). Full suite 5,548 green;
  typecheck + build clean after the fix pass.

### Phase 1 — the spine (journey resolver · Action Ledger · autonomy schema)

**Status: CLOSED at round 5 under an AMENDED GATE (owner-approved,
2026-07-27).** Rounds 1–4 ran the full machine and were fixed + certified.
Round 5's finder and depth chambers completed, but the account's monthly
spend limit killed all 3 skeptics mid-round; rather than re-run the
expensive chamber, the owner approved a cheap close-out: **the 11 unverified
candidates were verified in the main loop** (single-reviewer code
verification against the cited files — NOT the 3-skeptic adversarial vote
the convention prescribes), survivors fixed, both judged in-phase gaps
shipped, full suite + typecheck + build green. Phase 1 is therefore
certified "fixed to the machine's last findings", not "two-consecutive-
clean-rounds dry" — the formal dry gate was waived for cost. Any future
Phase-1 regression hunting starts from the backlog + this note, not from
re-running rounds.

- **Round-5 close-out (2026-07-27, main-loop verification):** 10 of 11
  candidates CONFIRMED (2 were pure test gaps), 1 REJECTED. All confirmed
  items fixed + regression-tested in one pass; both in-phase gaps shipped.
  - #1 review_feature over-claim — FIXED: `narrateAutoFeatured` now asks
    `listFeaturableGoogleReviews` (the real read-time rule: threshold,
    comment, hide override, top-12 cap) which fresh reviews actually
    feature, instead of re-deriving the rule; new cap test (a fresh 4★
    behind twelve 5★s narrates nothing).
  - #2 export-route stale allowlist — FIXED: the CSV route reads
    `APPT_ATTENTION_KEYS`; new EXECUTED registry-driven tests run both the
    page's `parseAttention` and the export route per key ('unmarked'
    included), so a third local copy can't drop a key silently.
  - #3 staff markCompleted missing the pms_live re-stamp — FIXED:
    `markCompleted` now applies the same goingLiveCompleted rule as the
    delta sync (source 'pms_import' + startTime ≥ createdAt−24h →
    're-stamp pms_live'), so the SEATED mint no longer depends on whether
    the cron or the front desk noticed the completion first. 3 new tests
    (upcoming-at-import re-stamps; historical stays; non-import untouched).
  - #4 payment_autocharge final-installment amount — FIXED: the ledger
    formats `planAmountForInstallment(...)` (the amount actually charged);
    pinned with a $500/3 remainder test ($166.68 in summary AND detail).
  - #5 unmarked chip empty in non-past windows — REJECTED: structurally
    identical to existing chips (no-show is likewise empty in future
    windows); the only prominent entry point (the Overview CTA) pins
    `window=past_30d`. Accepted design.
  - #6 /growth/reviews "Sync now" ungated — FIXED: passes
    `initiatedByUserId: ctx.userId` (third human call site now under the
    actor law).
  - #7 callback pass-through unpinned — FIXED: executed route test pins
    `{ initiatedByUserId }` on BOTH fire-and-forget first syncs.
  - #8 parseAttention executed test — FIXED: written (see #2).
  - #9 listing_sync address detection — FIXED: the pre-read + compare now
    cover all six written address columns (line2/state/country included);
    new test: a suite-number-only change narrates.
  - #10 resurface guard vs sync outages — FIXED: the cutoff is
    `min(since, now−7d)` (threaded the delta watermark into
    `reconcileAppointments`), so a real booking made during a >7-day
    outage still stamps 'pms' and mints; pre-watermark history still
    stamps 'pms_import'. New outage test.
  - #11 drawer raw source literals — FIXED: `appointmentSourceLabel` is
    now single-homed in lib/types/appointment-views.ts; the agenda list
    and the drawer both use it ("via Practice system (imported)", never
    "via pms import").
  - **In-phase gap A — FIXED:** catch-net preview rows use
    `formatClinicDayTime` (month+day, clinic tz); render-tested.
  - **In-phase gap B — FIXED:** `listing_sync` detail captures a
    `{from,to}` snapshot per changed field at write time (the GBP apply
    overwrites the only copy of the before-values); pinned in both
    gbp-sync narration tests.
- Round-5 backlog addition (folded into the boundary-pin item): the
  machine-initiated INTERNAL-alert leg (e.g. the NPS detractor flag) is
  the second undecided ledger-boundary leg; decide both with Phase 2.

- **Round 4** (2026-07-27, range `1e8de2c..26ae6da`, direct-agent fan-out):
  9 lenses → 21 raw → 10 defect / 4 depth candidates → 3 skeptics + 3
  judges: **all 10 defects CONFIRMED** (1 critical, 3 major, 6 minor — the
  audit's first critical), **1 in-phase gap** (unanimous), 3 → backlog,
  0 rejected. Theme: the round-3 fixes' own seams.
- **Round-4 fixes (all shipped):**
  - **CRITICAL — the catch-net was dead at the URL seam.** The appointments
    page kept a LOCAL copy of the attention allowlist and it lacked
    'unmarked': the Overview CTA opened an unfiltered list and the chip
    did nothing. The vocabulary now has ONE home (`APPT_ATTENTION_KEYS` in
    lib/types/appointment-views.ts) that the page parser reads; pinned so
    a local list can't come back.
  - **The re-stamp's booked side sealed.** Live-observed completions now
    stamp `'pms_live'`, not `'pms'`: the journey layer mints their SEATED
    transition (honest startTime) but never their BOOKED one (createdAt is
    the connect moment), and they stay in the imported-booked suppression
    anchor. New `BOOKED_MINTABLE`/`IMPORTED_OR_LIVE` predicates, pinned
    per-function WITH the anchor recipes (`least(coalesce(completedAt,
    startTime), startTime)`, `least(startTime, createdAt)`) — round 4
    proved the old pins matched reverted recipes.
  - **listing_sync honesty, twice.** (1) The hours change-detection compared
    `JSON.stringify` of builder-ordered keys against the jsonb round-trip
    (Postgres reorders keys) — it would have written ~24 false "updated
    your hours" entries per day per GBP clinic; now a canonical
    sorted-key comparison, with a reordered-keys regression test. (2) The
    initiator gate: staff-clicked "Sync from Google" and the owner's
    connect flow pass `initiatedByUserId` and the machine ledger stays
    silent — same actor law as staff campaign sends.
  - **DST coherence:** the catch-net card's 30-day lookback now uses
    `clinicDayStart(now, tz, -30)` — the same calendar-day arithmetic as
    its CTA's window (the fixed-ms bound drifted 1h across DST).
  - **In-phase gap — `review_feature` registered (17th capability):** a
    newly-synced Google review at/above the feature threshold auto-
    publishes onto the public testimonials; the sync now narrates that
    moment ("Added Maria's 5-star Google review to your website"),
    change-detected at ingest, collapsed when a batch lands, silent for
    human-initiated connect syncs and demo orgs. Executed tests.
  - **Regression pins for everything round 4 caught unpinned:** the
    importedRoster fact (CSV roster stage, executed in all three readers),
    the ledger readers' `since` windows, the unmarked chip's status guard,
    and the staff-actor pass-through in sendCampaignAction.

- **Round 3** (2026-07-27, range `1e8de2c..70c7853`, direct-agent fan-out):
  9 lenses → 30 raw findings → 15 defect / 7 depth candidates after
  clustering → 3 skeptics + 3 judges: **12 defects confirmed** (6 major),
  2 rejected (onboarding service-copywriting is owner-INITIATED synchronous
  work per the round-1 actor gate; the funnel's missing upper bound is API
  hardening with zero real callers); **3 in-phase gaps** (all unanimous),
  4 → backlog. The round's theme: the round-2 fixes themselves — the
  source taxonomy had three unhandled seams and shipped untested.
- **Round-3 fixes (all shipped):**
  - **The PMS source taxonomy, sealed at all three seams.** (1) Backfill
    HOLDS OPEN on patient row errors — the appointment high-water mark
    won't advance, so retried roster rows stay `pms_import` and their
    skipped appointments get re-pulled (was: fake 'pms' growth + lost
    history). (2) HISTORICAL RESURFACE GUARD — a post-mark insert whose
    startTime is >7 days past stamps `pms_import` (an OD note edit on an
    old row is history arriving late, not a new booking). (3)
    LIVE-OBSERVED COMPLETION — a backfilled UPCOMING row (startTime on/
    after its own creation) that the delta sync watches complete re-stamps
    `pms` so the seating mints; the connect cohort is no longer a seated
    blind spot. Plus the anchor fixes: imported-booked suppression anchors
    on least(startTime, createdAt) (an upcoming imported row proves the
    person was booked by import time), and firstSeatedAt anchors on
    least(completedAt, startTime) so catch-up marking can't shift seats
    into the marking week. ALL of it executed-tested end-to-end through
    the runImport harness (6 new tests) + per-function WHERE pins (org
    scope, archived exclusion).
  - **The roster fact (in-phase gap):** `resolveJourneyStage` gains
    `importedRoster` — a CSV/PMS-imported roster member with zero
    appointment rows resolves 'patient', not 'inquiry' (a Dentrix clinic's
    1,200-person import no longer reads as 1,200 strangers).
  - **Three more capabilities registered WITH writers + executed pins:**
    `domain_autorenew` (renewals narrate the charge amount; releases are
    ledgered; declines claim nothing), `listing_sync` (GBP sync narrates
    hours/address/phone changes — change-detected so the hourly re-apply
    of identical data stays silent), `scheduled_social` (the hand-off is
    ledgered truthfully as "queued … publishing Tue 9 AM" — never a claim
    it already published; the executor is Zernio's servers, so there is no
    local delivery moment to observe).
  - **The catch-net, made coherent:** the agenda 'unmarked' chip now bounds
    at the clinic-local day start (no more nagging about a patient still
    in the chair) and the Overview card counts the same 30-day window its
    CTA opens — the number equals the list behind it. Card render +
    window-agreement pins added. Accepted residue: visits unmarked >30
    days fall off the net's surfaces (they remain excluded from every
    count; a longer-tail sweep can ride Phase 2 if the owner wants it).
  - **Scheduled-message honesty hardened:** the ledger's name lookup moved
    into its own try/catch — a lookup blip can never flip a DELIVERED
    message to 'failed' (staff would resend and double-text); regression-
    pinned. Narration is third-person now ("Delivered the message Dana
    scheduled for Maria") — append-only summaries must not say "you" to
    readers who aren't the scheduler.
  - **Raw source keys labeled:** 'pms'/'pms_import'/'import' render as
    "Practice system"/"Practice system (imported)"/"CSV import" on the
    patients list, source filter, and patient detail.

- **Round 2** (2026-07-27, range `1e8de2c..2fc7707`): run via direct-agent
  fan-out (the Workflow runtime's permission layer was broken this session —
  two runs died with every subagent's tool parameters stripped; the new
  integrity guard in `phase-audit.js` correctly declared those runs INVALID
  instead of clean). 9 lens finders → 16 raw defects + 7 depth proposals →
  14 defect / 5 depth candidates after dedupe → 3 skeptics + 3 judges:
  **13 defects confirmed** (4 major), 1 rejected (JS-side funnel aggregation
  — deliberate one-resolver pattern, inert, unanimous reject); **3 in-phase
  depth gaps**, 2 → backlog. Multi-lens convergence: 3 finders independently
  found the ongoing-PMS blindness; 2 found the unledgered AI copy cron.
- **Round-2 fixes (all shipped):**
  - **PMS journey semantics, both directions.** Ongoing delta-sync rows now
    carry source `'pms'` (backfill keeps `'pms_import'`; the sync flags a
    run as backfill until the first appointment high-water mark exists) so
    OD-side growth mints real transitions instead of reading as permanent
    zero. And the INVERSE law: imported history that PREDATES an organic
    visit now suppresses `firstBookedAt`/`firstSeatedAt` (anchored on
    imported rows' honest `startTime`) so a contact-linked long-time
    patient can't mint as a fake new patient. Source labels added
    ('Practice system'); executed tests pin both directions.
  - **The sixth unregistered automation:** the hourly AI service-copy sweep
    now records `service_copywriting` ("Wrote the Invisalign page copy for
    your website").
  - **Consistent actor line for timed deliveries:** scheduled 1:1 message
    flushes record `scheduled_message` and scheduled blog publishes record
    `blog_publish` (same machine-delivers-staff-work rule as scheduled
    campaigns).
  - **Honest review narration:** a no-Google clinic's auto-ask now records
    "Asked X for a review", never "a Google review".
  - **In-phase gap #1 — the seated catch-net:** past visits still sitting in
    a pre-visit status now surface on the Overview ("Did these visits
    happen?", renders only when non-empty) + a new `unmarked` attention
    chip on /appointments; demo org seeds one.
  - **In-phase gap #2 — the reverse capability guard:** spine test scans
    every `capability:` literal in lib/services against CAPABILITIES (a
    typo can't mint an orphan stream) + recordAction dev-warns on
    unregistered keys.
  - **In-phase gap #3 — `isBackfilled` on `PatientJourneyRow`** so windowed
    consumers can't re-open the import-as-growth lie one call site at a time.
  - **Test adequacy:** executed writer pins for review_request (+ staff
    gate + failed-send), noshow_rebook (disabled-automation regression pin:
    no email → no ledger row → no OD CommLog note), auto_reply (executed
    send path), retention_automation, followup_rule (per-created-row), and
    payment_autocharge negative paths (decline/demo never narrate a
    charge); journey SQL laws re-pinned per-function + per-aggregate
    (placement, not occurrence counts).
  - **Docs honesty:** resolveTrust docblock + spine test title now state
    the stored-grant exception; this file's round-1 "growth scoreboard
    already fixed" claim corrected (see backlog item 1).

- **Round 1** (2026-07-27, run `wf_aacb3b7b-eee`): 15 agents, ~1.77M tokens,
  62 min. 39 defect candidates → **36 confirmed** (~9 unique clusters after
  dedupe) + **4 in-phase depth gaps**; 3 rejected by the skeptics (the
  `resolveTrust` stored-grant claims — honoring a human's explicit grant for
  a not-yet-registered capability is by design); 8 proposals → backlog.
- **Round-1 fixes (all shipped):**
  - Staff-clicked "Send now" campaigns no longer enter the machine-only
    ledger (`initiatedByUserId` gate in `marketing-send.ts`).
  - Forms-completion nudges no longer masquerade as visit-time reminders —
    `logReminderSent` branches on `template === 'forms_intake'` → new
    `forms_reminder` capability with honest narration.
  - PMS-import honesty: `pms_import` appointments never mint
    `firstBookedAt`/`firstSeatedAt` (sync-time timestamps read as fake
    growth); stage facts still use all history. False healing claim in the
    service header corrected.
  - Two ledger-adjacent reads gained missing org filters (reminder writer's
    patient lookup, auto-reply's name lookup).
  - `pnpm typecheck` repaired (balance-outreach test mock typing).
  - Five unregistered automations became registered capabilities WITH
    writers: `nps_survey`, `noshow_rebook` (+ send-honesty: the disabled
    automation no longer logs a CommLog "sent" note), `waitlist_offer`,
    `payment_autocharge` (the machine charging cards is now always
    reported), `forms_reminder`; the auto-created no-show rebook follow-up
    records under `followup_rule`.
  - Patient merge re-points `action_ledger.patient_id` to the survivor.
  - Executed test coverage added: journey service mapping (import
    exclusion, cancelled logic, funnel windows), ledger reads (limit clamp,
    count mapping, org scoping), campaign actor gate, reminder-writer
    branches. CLAUDE.md contradictions fixed (0136, open-item 0b).
