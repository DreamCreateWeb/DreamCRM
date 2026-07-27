# Phase Audit Certificates

Every transformation phase (and any major feature slice) ends with the
**phase-audit workflow** (`.claude/workflows/phase-audit.js`) run in rounds
until DRY: **two consecutive rounds with zero confirmed defects and zero
in-phase depth gaps**. The machine, per the owner's standard (2026-07-27):

- **Perfection chamber** — independent lens auditors (semantics,
  completeness, codebase law, doctrine, failure modes, test adequacy) file
  DEFECTS; three adversarial skeptics try to refute each; majority-confirmed
  defects must be fixed before dry.
- **Depth chamber** — "would it make sense to add more?" Depth auditors
  (pinnacle, front-desk) file PROPOSALS; three value judges triage each into
  *in-phase gap* (blocks dry — the phase isn't honestly done without it),
  *backlog* (the owner's menu below), or reject.

Each certificate records: rounds, findings found → confirmed → fixed →
rejected, the backlog harvest, and the dry declaration.

---

## The depth backlog (the owner's menu)

Proposals judged real-but-future-scope land here, newest first. The owner
promotes items into phases; nothing here is a commitment until he does.

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

### Phase 1 — the spine (journey resolver · Action Ledger · autonomy schema)

**Status: rounds 1–2 complete, fixes shipped; NOT yet dry** (dry = two
consecutive clean rounds; round 3 pending).

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
