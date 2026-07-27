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

**From Phase 1 round 1 (2026-07-27):**

1. **Seated-everywhere adoption sweep** — live readers that still count
   "new patients" from record creation (patients service source-mix,
   Overview trend, growth scoreboard already fixed) should all migrate onto
   `getJourneyFunnel`/`firstSeatedAt`. Natural fit: Phase 2, when the
   standup starts quoting the numbers.
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

**Status: round 1 complete, fixes shipped; NOT yet dry** (dry = two
consecutive clean rounds; round 2 pending).

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
