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
- **HARD CAP: 3 discovery rounds.** The script refuses a round 4 unless it
  is marked `{ verification: true }`. If round 3 still finds significant
  items (any critical/major defect or in-phase gap), discovery-BY-AUDIT is
  the wrong tool — but **the phase still has to reach a clean state, and the
  remaining discovery is the main loop's own job** (owner's clarification,
  2026-07-28): (1) fix everything round 3 found; (2) write the owner a
  ROOT-CAUSE RETROSPECTIVE here ("why did this phase ship with this many
  gaps?"); (3) run the retrospective's lessons as a DIRECT SELF-SWEEP —
  sibling-sweep every fix from every round, walk the component × failure-mode
  matrix, check crash-consistency of every claim-then-act; (4) fix what that
  finds; (5) confirm with `{ verification: true }` rounds until one comes
  back clean. A phase closes CLEAN or it is not closed — the retrospective
  is never the finish line.
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

**From Phase 2 round 3 (2026-07-28):**

1. **Expiry visibility + expiry narration** — approval cards carry no
   temporal cue (no age, no deadline) even though round 2 made
   soonest-to-expire the sort key, and an expiry/invalidation flips status
   with no word anywhere (no ledger entry, no standup line — the card just
   vanishes). The judge kept it backlog: nothing on the card is WRONG and
   no approval is made blind; a countdown pushes staff toward operating a
   deadline system, and "I gave up on this" is new vocabulary that belongs
   to Phase 4's guardian/failure work. The promotable half is a one-line
   "expires Friday" cue.

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

### Phase 3 — the autonomy ladder live ("always do this for me")

**Status: CLOSED CLEAN 2026-07-29 — verification round 5 returned ZERO
findings across all four lenses.** ✅ **CERTIFICATE**: 3 discovery rounds
(the hard cap) + the owner-mandated main-loop self-sweep + 5 verification
rounds. Totals: **2 criticals, 42 confirmed defects fixed, 12 in-phase depth
gaps shipped, 1 self-sweep seam closed, 7 skeptic/judge rejections upheld**;
the suite grew from 5,626 to 5,681 passing tests.

The closing round: claims EMPTY, law EMPTY (second consecutive), depth EMPTY,
resilience EMPTY. The convergence was legible round over round — critical →
major → demo surface → stale comments → nothing.

**The two criticals are why this gate exists.** Both were invisible to 5,600+
passing tests because both lived exactly where a JavaScript-modelled database
stops being a database: a string sentinel written into a column that is a
foreign key (every autonomous campaign would have thrown, forever, inside a
retry loop, while the card claimed it was handled), and an untyped bind
parameter inside a VARIADIC function (every grant and every revoke would have
failed with 42P18 — the entire ladder inert in production). Neither is
reachable by a test that mocks `sql`. Both now have boundary tests, one of
which renders the real statement through drizzle's own dialect.

**The dominant finding of the audit is about the audit.** Every round from 2
onward found most of its defects inside the PREVIOUS round's fixes — a
critical among them. The retrospective below names the cause; the standing
lesson for future phases is that **a fix is a new feature and gets the whole
checklist, including the demo, the copy, and the sibling readers of any law
it touches.**

**Verification round 5 (2026-07-29) — CLEAN.** All four lenses empty against
`git show d3d8b90` and the phase as a whole.

#### Retrospective: why did this phase ship with this many gaps?

Written for the owner, per the gate. The honest headline is not "Phase 3 was
sloppy" — it is that **the audit's own fixes became the largest source of new
defects**, and the shape of the test suite guaranteed the two worst ones
would be invisible.

1. **The fixes outproduced the phase.** Round 2 confirmed 9 defects, 4 of
   them inside round-1 fixes. Round 3 confirmed 9 more, including a CRITICAL
   inside a round-2 fix. The original Phase-3 build was not the problem by
   round 2 — the repair work was. Each fix was written under audit pressure,
   shipped with tests asserting its own semantics, and never swept against
   its siblings. The standing class checklist existed and I applied it to the
   PHASE, not to each FIX. **Lesson: a fix is a new feature and gets the full
   checklist, including the demo and the copy.**
2. **Mocked boundaries prove semantics, never executability.** Both criticals
   lived exactly where the harness stops: a string sentinel written into a
   column that is a foreign key, and an untyped bind parameter inside a
   VARIADIC function. 5,660 tests could not see either, because the DB is
   modelled in JavaScript. **Lesson: any new raw SQL, or any new write to a
   constrained column, needs a test at the real boundary** — render the
   statement through the dialect, or assert the column's constraint. Shipped
   as `tests/journey/autonomy-sql.test.ts`.
3. **Every new behavioral state needs a sentence.** The hand-back, the
   pre-grant card, the held-overnight card, the walled clinic: each time I
   drew a new distinction in the mechanism I forgot the human-facing copy,
   and each time a lens found a screen that said nothing, or said the
   opposite of what the code did. **Lesson: a new card state IS a new string;
   they ship together or the behavior is invisible.**
4. **A law added late has readers that predate it.** The dated grant needed
   the driver, the badge count, the card copy, the demo seeder and the
   earned-trust run to all agree. I swept some readers each time and found
   the rest by audit. **Lesson: when a new predicate lands, enumerate its
   readers exhaustively in the same commit.**
5. **The demo is a reader.** Twice a rule change silently invalidated seed
   data (the human-decider requirement killed the earned-trust history; the
   `autonomous: true` marker was never seeded, so the tell could never fire
   in the demo). **Lesson: every rule change runs against the seeder.**

#### The standing lesson this phase adds to the checklist

**A DATABASE MODELLED IN JAVASCRIPT IS NOT A DATABASE.** Both of this
phase's criticals were unreachable by the test suite for the same structural
reason: the harnesses model rows and predicates in JS, so a foreign-key
constraint and Postgres's parameter-type inference simply do not exist there.
Any new raw SQL fragment, and any new write to a constrained column, needs a
test at the real boundary — render the statement through the dialect
(`tests/journey/autonomy-sql.test.ts`), or assert the constraint. Add this to
the class list alongside artifact rendering, demo coherence, structured
signals, laws-under-recovery, recovery-paths-vs-each-other, fixture realism,
anchor-by-identity and snapshot-vs-alias semantics.

**AND: A FIX IS A NEW FEATURE.** Run the whole checklist on it — including
the demo, the user-facing copy, and every sibling reader of any law it
touches. Six consecutive rounds found most of their defects inside the
previous round's repairs; that is the single largest cost in this audit.

#### The self-sweep (main loop, post-cap)

Ran the retrospective's five lessons as direct checks rather than another
audit round:

1. **Every raw SQL fragment in the phase**, for parameter typing and operator
   resolution — `notHandedBack`, `autonomousOnly`, `workOnly` bind nothing;
   `hasEntryForProposal`'s one param resolves against a text expression; the
   trust write is now cast-complete and pinned by a rendering test.
2. **Every constrained-column write** — the `'machine'` sentinel's only
   surviving home (`sendCampaign`'s `initiatedByUserId`) verified as
   read-only, never stored.
3. **Every reader of the new law** — the driver, `countOpenProposals` and the
   card's flags are the complete set, and **this found a real seam**: the
   round-3 billing gate lived in the driver only, so a walled clinic's
   granted cards were subtracted from the badge *and* never executed. The
   count now applies the same gate (its comment had claimed so; the code did
   not). Fixed + pinned.
4. **The card's copy matrix** — five branches (handed back · pre-grant ·
   granted · earned-trust nudge · consent checkbox), no silent cell, and the
   precedence is right: a handed-back card of a granted capability shows the
   hand-back, not the pre-grant line.
5. **Demo coherence for every rule changed** — the demo org is not walled
   (no `stripeSubscriptionId`, no `trialEndsAt`), `resetAutonomy` clears the
   new `_revokedAt` stamp with everything else, and the tell now has seeded
   rows to render.

#### Verification round 1 (2026-07-29) — NOT clean

Four lenses, four findings, three unique. All three were seams in the
POST-CAP work itself, which is the retrospective's lesson #1 landing on the
retrospective's own author:

- **The demo's tell claimed a grant the demo had just deleted.** The
  self-sweep's seeded `autonomous: true` rows said "handled on my own, as
  you asked" while `resetAutonomy` wiped every grant on the same pass, the
  same screen still asked permission for that capability, and the two posts
  named existed nowhere on /growth/social. Fixed by making the claim TRUE:
  the reset now restores a known MIXED baseline (social_post handed over and
  dated before the seeded cards; everything else ask-first), and the seeded
  entry narrates the post that actually exists — `demo_spost_1`, published
  4 days ago to Google, Instagram and Facebook.
- **"I'll list each one" against a per-capability count.** Five strings
  promise an item-by-item record; the strip rendered one line per capability
  with a count and the newest summary. The same imprecision class round 1
  fixed (the "diary" that did not exist) and round 3 fixed ("nothing *yet*"
  from a 7-day read), in the same paragraph. `listAutonomousWork` already
  read every entry; the strip now names them, clamping at 8 per capability
  with an honest "…and N more this week".
- **The demo grant re-opened the walled-clinic seam.** Demo orgs are
  structurally excluded from the generator loop, so a granted demo card is
  subtracted from the badge while nothing will ever execute it — exactly the
  law the self-sweep had just codified, with one reader too few.
  `countOpenProposals` now applies the demo exclusion alongside the billing
  one. The harness models the join rather than stubbing it, because a
  no-op join would have let this pass silently.
- Also fixed: this file's own round-by-round had a duplicated Round-1 header
  and no record of rounds 2–3 at all.

#### Verification round 2 (2026-07-29) — NOT clean

Five findings, four unique, and again every one of them lived in the newest
code — verification round 1's own fixes:

- **MAJOR: the take-back could vanish for a whole session.** The strip hid a
  revoked chip optimistically in local state that only ever grew, and
  `router.refresh()` preserves client state — so revoking and then handing
  the SAME capability back in one session left no take-back control anywhere
  in the product, while a card beside it pointed at the missing control and
  the machine kept acting. "Reversible always" cannot depend on a local set.
  The strip now renders the server's grants, full stop.
- **The demo tell claimed "this week" for a post frozen weeks in the past.**
  Round 1 fixed the tell's IDENTITY (narrate a post that exists); its DATE
  still drifted, because the seeded post is insert-once and its `publishedAt`
  freezes at demo creation while the reseeded ledger row was always stamped
  4 days back. The entry now reads the post's real publish instant and seeds
  nothing when it has aged out of the strip's window — a quiet strip is true.
- **The card's loudest elements still asked permission on machine-handled
  work.** The generators write titles for a human who must act ("Send it?",
  "Answer Maria's website inquiry"), and a granted card rendered them
  verbatim under a header saying "say the word and they go out", with the
  truth in gray under the draft. Round 1 had fixed exactly this string on the
  DEMO seed and never swept the production generators. Machine-handled cards
  now carry an "I'm handling this one" pill and the header stops speaking for
  them. (A repo CI guard — the legibility floor — caught the pill's first
  font size, which is the guard doing its job.)
- **Stale docs, twice:** `listAutonomousWork`'s docstrings still described
  the count-plus-one-example the same commit had replaced, and CLAUDE.md
  still said the demo resync "resets all grants" after that commit made it
  seed a standing one.

#### Verification round 3 (2026-07-29) — NOT clean

Six findings, two unique issues plus three stale-doc items. Three of the four
lenses independently landed on the same root cause and prescribed the same
fix, which is a good sign the diagnosis is right:

- **The demo's tell was permanently dead, and the docs said otherwise.**
  Round 2 correctly killed a fresh-sounding lie (an entry claiming "this
  week" for a post whose date is frozen at demo creation) by gating the seed
  on the post's real publish instant — but that instant can only age, so the
  fix did not make the demo occasionally quiet, it disabled the TELL half of
  "do and tell" in the demo forever, on the surface the owner sells from,
  while CLAUDE.md and a docstring written in the same commit asserted the
  tell renders. **Root cause, now fixed:** the demo's social posts were
  seeded insert-once and never re-dated, so a standing demo org's "published
  4 days ago" silently became "published three weeks ago" — and every
  surface reading recency drifted with it. `seedDemoSocialPosts` now
  self-heals those dates on each resync (the posture every other demo
  artifact already uses). The age-out guard stays as the correctness
  backstop: if the anchor ever is stale, the strip says the week was quiet
  rather than claiming stale work is fresh.
- **The header qualifier round 2 added was false in the demo** — "the ones
  marked 'I'm handling this one' go out either way", on a tenant where
  nothing goes out, naming a pill the demo rendered as "mine (demo)". The
  production sweep landed; the demo sweep did not. There is one label
  everywhere now, and the header hedges in the demo. The lenses also noted
  the demo path was untested — it is pinned now.
- Three stale docs: `GrantsStrip`'s docblock still described the
  count-plus-one-example the strip stopped rendering two rounds ago (its own
  sibling comment 88 lines down had been corrected and this one missed),
  plus the two above.

#### Verification round 4 (2026-07-29) — NOT clean, but the LAW lens came back EMPTY

Five findings, ONE code defect and three stale docs — and the first empty
lens of the audit. The findings have moved fully off the ladder's mechanics
and onto the demo seeder and comments.

- **The re-date moved four date columns and left two frozen.** Round 3's
  self-heal re-stamped `scheduledAt`/`publishedAt`/`createdAt` but not
  `eventStartAt`/`eventEndAt`, so the demo's Google Business Event post ended
  up scheduled to publish *after* the free event it advertises. Two lenses
  found it independently (resilience noting the working tree already carried
  the identical fix). Every seeded date moves together now, and the re-date
  branch — previously untested — is pinned by a test verified to fail against
  the unfixed code.
- **Three stale docs**, all in the round-3 commit: the seeder's own header
  still said "skip when present" (the behavior that commit deleted), the
  demo-voice comment still said the post "freezes" (its sibling 90 lines up
  had been corrected), and CLAUDE.md's "never ages into staleness" overstated
  a design that deliberately keeps an age-out backstop. The docs now describe
  the real posture: re-dated on every resync (deploy/boot), with the strip
  honestly reporting a quiet week if a demo org goes long enough without one.

#### Round-by-round

v2 gate throughout: four Opus lenses (claims · law · resilience · depth) →
one skeptic → one judge → main-loop confirmation against the cited code
before any fix.

- **Round 1** (range `6fe9276..d4ed2cd`): the four lenses returned 29 raw
  findings → 12 deduped defect candidates + 3 depth candidates. The
  skeptic **confirmed 11 of 12** (one rejected: per-proposal re-reading of
  trust inside the driver loop — read-then-execute is inherently TOCTOU,
  the claim is atomic, and in-flight work must complete). The judge ruled
  **all three depth candidates IN_PHASE**, and filed one of its own
  (silent permanent autonomous failure) as a near-duplicate of the Phase-2
  backlog. One critical was found and fixed by the main loop before the
  chambers ran.
- **Round-1 fixes (all shipped, commits `6173d02` + `9a86bda`):**
  - **CRITICAL — every autonomous campaign would have failed forever.**
    `createMarketingCampaign` was handed the string `'machine'` as
    `createdBy`, a nullable FK to `user.id`; the insert would throw, the
    card would reopen, and the retry loop would repeat hourly while the
    card told the clinic it was handled. Now `null`; the parameter is
    `string | null` by contract. The `'machine'` sentinel stays only on
    `sendCampaign`'s never-stored `initiatedByUserId`.
  - **The machine may not be its own witness.**
    `countConsecutiveUneditedApprovals` had no `decidedByUserId`
    predicate, so grant → six autonomous approvals → revoke left the next
    card saying "you've said yes to the last 6 without changing a word".
    Human decisions only; a **decline** now breaks the run (the judge's
    D-C); a **subject-only edit** counts as an edit.
  - **A settings change is not work.** Grant/revoke entries file under the
    capability they change, so the standup counted them ("1 review reply"
    in a week with zero replies) and could quote the switch as a story.
    `countActionsSince` filters non-work rows in SQL; the story loop uses
    the shared `isWorkEntry`.
  - **THE HAND-BACK — autonomy could fail forever, silently.** A failed
    autonomous execution reopened a card that is excluded from every
    "waiting on you" count, under copy promising it goes out within the
    hour, with the expiry pushed 3 more days every hour, unbounded. After
    `AUTO_FAILURE_LIMIT` (2) consecutive autonomous failures the machine
    stops trying, narrates one "I couldn't" note, the card counts as
    waiting on a human again, the driver skips it, and the expiry stops
    being extended.
  - **No 3 AM mass emails.** Under ask-first the send hour was implicitly
    gated by staff approving during office hours; autonomy removed the
    human and the cron runs UTC. Patient-inbox capabilities now wait for
    08:00–19:00 clinic-local — the same daylight INTENT as
    `retention-automation.ts`, which aims at 10:00 local but falls back to
    "now" and so bounds nothing on its own (corrected in round 3; the
    round-1 wording claimed the window already existed there).
  - **THE TELL (depth D-A).** Three strings promised a "diary" that never
    existed, and autonomous work was invisible until the next Monday's
    aggregate standup, which never marked what the machine did alone. The
    Overview strip now lists it — per-capability counts for the last 7
    days plus the newest line verbatim, honest zero state, no new page.
  - **Say what is being handed over (depth D-B).** The grant is
    capability-wide, so a tick on a warm 5★ reply also hands over 1–2★
    reviews; the consent line says so.
  - Attribution asserted only when knowable; the inbox truncation notice
    compares against its own population; a failed grant after a successful
    approve is reported instead of swallowed; the two-part toast joins its
    sentences; the demo hedges everywhere the grant promises delivery.
  - Tests 5,626 → 5,646 (23 new pins incl. the harness now modelling the
    jsonb payload probes rather than an opaque token — fixture realism).

- **Round 2** (range extended through the round-1 fixes): the lenses were
  pointed at the FIXES as much as the phase, and that is where the damage
  was — 11 deduped candidates, **9 confirmed**, four of them living inside
  round-1 fixes. Two rejected and upheld: the 12-card list starving on-you
  cards (unreachable given the per-run filing caps, and the truncation
  notice renders) and the autonomy.ts comment about explaining why the
  asking stopped (forward-looking rationale, not a claim of a shipped
  surface).
- **Round-2 fixes (commit `2c18f64`):**
  - **"From now on" did not mean from now on.** A grant executed EVERY open
    card of that capability within the hour — including the 1–2★ review a
    clinic had parked while deciding what to say. Grants are now DATED
    (`_grantedAt`), and one shared predicate — `machineHandlesCard` /
    `machineHandlesCardRow` — decides what the machine acts on: granted,
    filed at or after the grant, not handed back. The driver, the badge
    count and the card's copy all read it, so they cannot drift. An older
    undated grant keeps its original behavior rather than silently freezing.
  - **The hand-back note was eating real ledger entries.** It carries the
    proposal's id and `hasEntryForProposal` matched on id alone, so a card
    the machine gave up on, that a human then approved and that really
    published, wrote NOTHING to the ledger. The guard is work-only now.
  - **The tell lied on busy clinics** — it read the newest 100 ledger rows
    of everything and filtered in JS, so on a clinic writing a row per
    reminder a week of autonomous work fell off the end and the strip said
    "nothing on my own yet". Filtered in SQL. And the tell now outlives the
    grant: taking a job back used to delete the record of what it did.
  - **The demo's earned-trust history had gone inert** — round 1 made a
    human decider mandatory and the seeded approvals had none, so the
    suggestion could never render; worse, a null decider now MEANS "the
    machine's own yes", so the seed asserted the machine approved itself.
  - **The send window read elapsed hours, not the wall clock** — on the
    fall-back Sunday the 8am gate opened at 7am local. `clinicLocalHour`
    joins the timezone helpers as the single home for "what time is it
    there".
  - Also: `setCapabilityTrust` merges in SQL instead of read-modify-write (a
    concurrent grant could drop a revoke), a held card says it goes out in
    the morning, and a handed-back card stops re-offering a hand-over the
    clinic already made. Tests 5,646 → 5,660.

- **Round 3** (the hard cap): 10 deduped candidates + 4 depth. **9 defects
  confirmed** (one rejected and upheld: the reviews nav badge counting
  machine-destined work — an unreplied review is a different claim than
  "waiting on your yes", and subtracting would hide genuinely human work).
  The judge ruled **3 depth candidates IN_PHASE** and backlogged the fourth
  (per-capability consent disclosures beyond review_reply) as re-litigation
  of a round-1 ruling.
- **Round-3 fixes (commits `f0f1567`, `34bb3f8`, `937deae`):**
  - **CRITICAL — the whole ladder was inert on Postgres.** Round 2's SQL
    merge interpolated the reserved key as an UNTYPED bind parameter inside
    `jsonb_build_object`, which is VARIADIC `"any"`; Postgres cannot infer a
    type there, so every grant AND every revoke failed with 42P18 and left
    the row unchanged. Two lenses found it independently, one reproducing
    the drizzle-generated statement against a real Postgres 16. Nothing in
    5,660 tests could see it: the harness mocks `sql` into a descriptor and
    re-implements the merge in JavaScript. Every parameter is cast now, and
    `tests/journey/autonomy-sql.test.ts` renders the real statement through
    drizzle's own `PgDialect` and fails if any `$n` is bound uncast
    (confirmed failing against the pre-fix code).
  - **Autonomy acted for clinics that could not stop it.** The Overview
    strip is the only take-back surface and `TrialEndedWall` replaces the
    entire dashboard, so a lapsed or cancelled clinic kept having public
    replies published and recall mail sent in its name, hourly, with no
    reachable brake. The driver now declines to act for a walled clinic.
  - **A crash mid-execute never counted toward the hand-back** — the
    reconcile hand-rolled its own reopen, so a proposal whose execution
    reliably kills the process retried every hour forever, with its expiry
    renewed each pass so it could not even age out. Both paths share one
    reopen.
  - **A revoke was not counter-evidence** — the next card answered it by
    asking for the grant back, citing approvals the clinic had just
    overruled. Revokes are dated (`_revokedAt`) and floor the earned-trust
    run.
  - **Depth:** the pre-grant card says why it is still theirs (round 2
    created that card class and left it silent); a granted card names the
    third exit — skipping one draft instead of revoking the whole
    capability; and the demo seeds the tell so the ladder's payoff is
    showable.
  - Also: every server-action call on the card has a failure boundary (the
    take-back had none — the direction that most needs one), the tell's zero
    state distinguishes a fresh grant from a quiet week, the driver gets the
    run's clock, and five documentation claims were corrected (migration
    numbers, the law's docblock placement, an orphaned comment, the false
    "retention already enforced a daylight window", and the gate's own cap
    semantics). Tests 5,660 → 5,674.

### Phase 2 — the voice (proposals · Approval Inbox · weekly standup)

**Status: CLOSED CLEAN 2026-07-28 — verification round 6 returned ZERO
findings across all four lenses.** ✅ **CERTIFICATE**: 3 discovery rounds
(the hard cap) + the owner-mandated main-loop self-sweep + 6 verification
rounds. Totals: **58 confirmed defects fixed, 18 in-phase depth gaps
shipped, 3 self-sweep seams closed, 9 skeptic/judge rejections upheld**;
the proposal/standup/generator surface grew from 5,532 to 5,593 passing
tests. The final clean round: depth EMPTY, law EMPTY (third consecutive,
with a full verification trace), claims EMPTY (first of the audit),
resilience EMPTY (with every remaining candidate developed and rejected
on evidence). The cap semantics that produced this close (the owner's
2026-07-28 clarification): discovery-by-audit ends at round 3, the
remaining discovery is the main loop's own — retrospective lessons run as
direct sweeps, verification rounds only confirm. The class checklist that
accumulated along the way (artifact rendering, demo coherence, structured
signals, laws-under-recovery, recovery-paths-vs-each-other, fixture
realism, anchor-by-identity, snapshot-vs-alias semantics) is now the
standing self-sweep list for every future phase.

Round 3 had fired the hard cap (2 major defects + 3 in-phase gaps), and
the close ran exactly as the corrected gate directs: fixes + the
retrospective below, then the retrospective's lessons as a DIRECT
SELF-SWEEP (sibling sweep of every fix, the executor × failure-mode
matrix, crash-consistency of every claim-then-act, reachable-control and
doc-drift checks), then verification until clean. A phase closes CLEAN or
it is not closed. First audit under the v2 shape (Opus lenses
via direct-Agent fallback — the Workflow runtime's permission-handler fault
recurred and the integrity guard correctly invalidated the workflow run;
the same 4-lens shape re-ran through the Agent tool). Round-1 range
`4f55238..708cd73`; round 2 audited the round-1 fix commit; round 3 audited
the whole range through the round-2 fix commit `975ec80`.

- **Round 3:** 4 lenses → 12 deduped defect candidates + 4 depth
  candidates → skeptic confirmed 10 / refuted 2, judge ruled 3 in-phase /
  2 backlog (one split ruling) → main-loop confirmation upheld every
  verdict against the cited code.
- **Round-3 confirmed + FIXED (10):**
  1. [major, 3 lenses] The inquiry generator kept the exact
     break-on-per-lead-failure bug round 2 fixed for reviews → draftText
     returns a typed reason (not_configured | no_allowance | failed);
     the loop breaks only on org-global refusals and skips a poisoned
     lead (pinned both ways).
  2. [major] outreach_campaign/social_post had NO staleness anywhere: the
     sweep covered only reviews+inquiries and the executor never re-read
     the engine → executeOutreachCampaign re-checks getRecallStats at the
     tap (recent/upcoming sends ⇒ friendly retire) and the sweep now
     expires quiet-channel social cards on any published-since-filing or
     scheduled post, and quiet-engine recall cards once the engine wakes.
  3. [minor, downgraded by the skeptic] A process death mid-approve
     stranded status='approved' + executedAt NULL forever (invisible to
     every reader, sourceKey claimed, no ledger entry — the one hole in
     "work is never silently lost") → reconcileStrandedApprovals reopens
     30-minute-stale stranded claims on the hourly sweep; executors
     self-guard the rerun.
  4. [minor] The Monday standup had no REACHABLE off switch at a real
     clinic (the per-staff opt-out toggle rendered only behind the
     daily-digest org switch, default 0) → the My Day toggle now renders
     unconditionally and its copy covers both emails.
  5. [minor] The reuse-path subject/body sync ran with no status guard
     BEFORE the duplicate-send claim, so a refused retry rewrote a SENT
     campaign's record → the sync runs only against
     draft/scheduled/paused rows (pinned: a completed row's copy
     survives the retire).
  6. [minor] A staff-deleted reused campaign row made the proposal
     un-approvable forever (update hits 0 rows → 'Campaign not found'
     throw → reopen loop for 14 days, month sourceKey burned) → a
     missing row un-stamps campaignId and the executor mints fresh.
  7. [minor] Raw executor throws rendered verbatim on the card
     ('RESEND_API_KEY env var is not set') → the approve wrapper logs
     the raw error and answers in the voice; the inquiry executor
     catches deliver()'s already-friendly transport errors and reopens
     with THAT text.
  8. [minor] The standup narrated a week that predated the account (every
     new clinic saw "a quiet week" about a pre-signup week on day one) →
     predatesAccount on WeeklyStandup: the card renders nothing and the
     Monday email skips when the org is younger than the whole window.
  9. [minor] Blanking the subject field silently sent the ORIGINAL
     subject (the omit-when-empty client check made the server's
     empty-subject guard unreachable) → Approve blocks client-side with
     an inline message.
  10. [minor] The demo-simulate comment claimed approvals feed the demo
     standup (impossible — entries land in the current week; the standup
     reads the prior week) → comment corrected.
- **Skeptic-refuted (2, upheld):** the "AI-outage retry storm" (bounded at
  10 calls/org/hour by the top-10 slice; the proposed consecutive-failure
  bail would reintroduce the round-2 freeze) and the "standup gets one
  attempt per week" (claim-before-send is the accepted round-1 design;
  the in-app card carries the same narration all week).
- **Round-3 in-phase gaps SHIPPED (3):** the approved inquiry reply is
  READABLE on its lead — getSentInquiryReply (keyed by the executor's own
  sourceKey) + the lead drawer's "What we sent · <clinic-tz date>" block,
  demo rows labelled (the inquiry executor was the only one whose artifact
  landed on no surface — an employee who answers your mail and keeps no
  copy) · the inquiry card renders context.preferredDate ("Asked about:
  next Tuesday morning") and a date-only inquiry no longer shows an empty
  context block · the standup CARD gets the email's own overflow line
  ("…and N more small things") so the two never disagree on a week's
  total. (The ledger drill-down page stays backlog item 4; expiry
  visibility went to the backlog as a new item.)
- Round-3 full suite 5,570 green; typecheck + build clean.

**Root-cause retrospective (the hard cap fired — owner-facing):**
Three rounds, 32 confirmed defects + 14 shipped gaps, and round 3 was
still not clean. Why did this phase ship with this many gaps?
1. **The phase was four products in a trench coat.** "The voice" bundled
   a transactional primitive (proposals), four executors that each touch a
   different subsystem (Google reviews, social, email, campaigns), a cron
   generator fleet, an email digest, and two dashboard surfaces — in one
   slice. Every executor×failure-mode cell was its own audit surface; the
   defect count tracked that combinatorial area, not carelessness. LESSON:
   ship executors one per slice next time (Phase 3+ capabilities are
   already planned proposal-first, one at a time — hold to that).
2. **Fixes kept creating seams symmetrically.** Round 2's break/continue
   repair fixed reviews and missed the IDENTICAL loop in inquiries; the
   digest-gate removal fixed dead-on-arrival and orphaned the opt-out
   toggle behind the very gate it removed. Roughly half of rounds 2–3's
   majors were fix-introduced. LESSON: every fix now names its siblings —
   "where else does this exact shape occur?" is a mandatory question in
   the fix pass (it caught the sweep gap this round only because a lens
   asked it).
3. **The failure model matured mid-phase.** Round 1 hardened
   in-process failures (reopen/expire), round 2 partial failures, and
   only round 3 asked "what if the PROCESS dies?" — the stranded-approve
   hole existed from day one but no earlier lens owned crash-consistency.
   LESSON: the resilience lens's brief now includes process-death and
   deploy-mid-write for any claim-then-act pattern, from round 1.
The machinery itself held: every defect was caught by the gate before a
clinic saw it, the skeptic killed 2 of 12 candidates, and the main-loop
confirmation upheld every verdict. The cap did its job — the marginal
round was fixing the auditor's own previous fixes.

**The self-sweep (2026-07-28, post-retrospective — the lessons run as
checklists by the main loop itself):**
- *Sibling sweep of every fix from all 3 rounds* → found ONE: the social
  executor lacked the at-the-tap staleness re-check its campaign sibling
  got in round 3 (the sweep covered social between taps, but inside the
  hour a "quiet channels" card could publish right after the clinic
  posted). FIXED: executeSocialPost retires when any post is queued or
  published since the card was drafted; activity predating the card never
  retires it (both pinned).
- *Reachable-control check on every user-facing pointer* → found ONE: the
  report emails' footer says "manage them at settings → notifications",
  and that page could not silence them (the skeptic had narrowed round
  3's #4 to the My Day toggle but the misdirection itself remained).
  FIXED the honest way — the destination gained the capability: a "My
  report emails" mute on the notifications page (same per-staff opt-out,
  immediate save, clinic staff only; pinned incl. never-renders for
  platform/patient tenants).
- *Doc-drift grep across every phase file* → found ONE: the standup test
  header still claimed the email was "org-gated on the digest master
  switch" (removed in round 2). Corrected; repo-wide grep for the stale
  phrases now returns nothing.
- *Crash-consistency of every claim-then-act* (approve claim → reconcile
  sweep; standup week claim → accepted round-1 design; social/campaign
  row-before-network → supersede/reuse) and the *executor × failure-mode
  matrix* (staleness / partial / throw / crash / retry / empty-input /
  tenant-scope / tz / voice per executor) → walked in full; no further
  findings. Two accepted residuals documented in code: the
  three-simultaneous-failure inquiry double-email window (reconcile
  comment), and the ≤90-min window where a stranded approve's "What we
  sent" block could show before the reconcile flips it back.
The gate itself was amended to encode the corrected cap semantics
(`.claude/workflows/phase-audit.js`: refusal note, escalation note, and a
`{ verification: true }` round type that is only legal after a documented
self-sweep).

**Verification round 1 (2026-07-28): NOT clean — the sweep missed four
classes.** 4 lenses → 6 deduped defect candidates + 4 depth candidates →
skeptic confirmed 5 / refuted 1 (the standup one-attempt re-file — the
round-3 rejection stands), judge ruled all 4 depth gaps in-phase →
main-loop confirmation upheld every verdict. Everything fixed:
- [gap, major] The inquiry reply — the ONE public-facing email the phase
  sends — invited booking with nothing clickable → it now carries the
  booking button (the exported resolveClinicBookingUrl; button-less when
  no site resolves) AND a clinic sign-off ("— {clinic}"), which also
  makes the drafting prompt's "the template signs for the clinic" true
  (it wasn't: the shell's only foot-name was the platform's).
- [defect] A stranded-then-retired approve narrated ZERO times →
  narrate-once-under-recovery: executors report `recovered` when the
  evidence says OUR OWN prior attempt executed (our reply on the review /
  our campaign row active-or-completed / our post's target published),
  and approveProposal writes the missing entry guarded by the new
  hasEntryForProposal (no double when only the executedAt stamp had
  failed); recovered retires stamp executedAt so the reconcile never
  loops.
- [defect] The client cleared dead cards by regexing the error copy →
  the structured `expired` flag rides through both actions and the card
  clears on it (claim-lost + decline-lost now carry the flag too).
- [defect ×2 lenses] The demo's "Your channels have been quiet" card
  contradicted the demo org's own seeded posts (4d-old publish + two
  scheduled) → premise-free demo title ("I drafted a post for your
  channels — want it out there?"); the recall demo card's visible title
  ("N patients are due") was never false and stands.
- [defect] The round-3 "corrected" demo comment was still false (no
  "activity surfaces" read the ledger) → rewritten truthfully; and the
  demo narration/toast now carries the hedge ("· demo — nothing actually
  went out") so the demo never over-claims (the lead drawer's label was
  the standard).
- [gap] Social cards said "posts to 3 channels" while one was the Google
  Business listing → the generator (and demo seeder) store channel
  labels; the card names them ("posts to Google Business, Instagram",
  +N more past 3); old payloads fall back to the count.
- [gap] The recall (and now inquiry) send appends a booking button the
  card never showed → read-mode line "Your booking button goes at the
  bottom."; the edit legend mentions {{bookingUrl}} only when the body
  contains it.
**The four classes the sweep lacked, now in its checklist:** (1)
END-TO-END ARTIFACT RENDERING — render the final artifact (shell + body +
auto-appended button + sign-off) and diff against the card and the
sibling sends, never just the executor inputs; (2) DEMO COHERENCE —
demo-voice premises must hold against the OTHER demo seeders' rows, and
demo actions must never over-claim; (3) STRUCTURED SIGNALS OVER PROSE —
typed server flags are consumed as flags, never string-matched; (4) LAWS
UNDER RECOVERY — every recovery path must preserve every law the happy
path had (narrate-once, here).

**Verification round 2 (2026-07-28): NOT clean — depth EMPTY (its first
clean lens of the audit), but claims/law/resilience found 7, all
main-loop confirmed.** The two majors were the same discovery made
independently by two lenses: verification round 1's recovery narration
was SHADOWED DEAD CODE for social + campaigns — the earlier-added
staleness checks match OUR OWN completed work (publishedAt is always
after createdAt; recentSends includes our own completed campaign) and
return first, and the pinning tests passed only because their fixtures
omitted fields production always writes. All fixed:
- OWN-WORK CHECKS NOW RUN FIRST in both executors (a staleness match is
  therefore always genuinely the clinic's own activity), pinned by
  ordering tests with REALISTIC fixtures (publishedAt set; the campaign
  pin asserts getRecallStats is never even consulted).
- reconcileStrandedApprovals redesigned: it CLOSES attributable executed
  work itself (narrate-once guarded by hasEntryForProposal + expire with
  executedAt, via the new detectRecoveredWork attribution — review reply
  = ours verbatim / campaign row active-or-completed / post target
  landed) and reopens only unattributable work, EXTENDING a passed
  expiry so the card is visible again (the reopen-into-invisibility
  hole); reconcile now runs BEFORE the sweep, killing the
  reopen-then-sweep race that silently expired recovered work.
- The demo inquiry card now anchors BY IDENTITY to the seeded demo lead
  (olivia.c@example.com) — the newest-lead query could quote a REAL
  person who used the live demo site's contact form (the exact
  arbitrary-query anchoring the demo convention forbids); demo channel
  labels use platformLabel (displayName rendered 'Dream Dental ×3').
- The ledger-boundary law comment documents the deliberate recovered-
  expiry exception; the inquiry sign-off is CONDITIONAL (a staff-signed
  draft sends as written — never two sign-offs) and the card's
  disclosure line covers the sign-off alongside the button, mirroring
  the same heuristic.
**Classes added to the sweep:** (5) RECOVERY PATHS AGAINST EACH OTHER —
stacked fixes are checked in execution order (a guard added by one fix
can shadow a branch added by another), and the SWEEPS must uphold the
same laws as the tap paths; (6) FIXTURE REALISM — fixtures carry every
field production writes (a fixture that omits publishedAt can make dead
code look tested); (7) demo ANCHOR-BY-IDENTITY applies to every
demo-voice reference, not just premises.

**Verification round 3 (2026-07-28): NOT clean — LAW came back EMPTY
(with a full verification trace) and depth found only one seam in the
round-2 fix itself, but claims + resilience independently found the
recovery class one level deeper.** All main-loop confirmed and fixed:
- [major, 2 lenses] THE UNSTAMPED WINDOW: social's payload.socialPostId
  was stamped only AFTER createSocialPost's entire network publish loop
  (the campaign sibling stamps BEFORE its send), so a death mid-publish
  left published targets with no link back to the proposal — every
  recovery mechanism keys on that link. createSocialPost gained an
  `onPersisted(postId)` hook that fires the moment the rows are durable,
  before any network call; the executor stamps there. Pinned: the mock
  now honors the hook (fixture realism) and a die-mid-publish test
  asserts the stamp landed first.
- [major] The invalidation sweep expired open cards on rot-evidence it
  could not attribute (it never read the body) — the review-timeout path
  (Google accepted, local write failed, reopen, hourly sync mirrors the
  reply, sweep silently expires) narrated zero. The recovery-closing
  logic moved to ONE home — exported closeRecoveredProposal (attribution
  via detectRecoveredWork, guarded narration, expire with executedAt) —
  used by BOTH the reconcile and now the sweep, which routes every
  expiry candidate through it before the silent batch expire.
- [minor] approveProposal stamped executedAt BEFORE recordAction — a
  death between the statements was the one unnarrated window the
  recovery machinery could never see (reconcile filters executedAt IS
  NULL). Swapped: narrate, then stamp — record-then-stamp is idempotent
  via the hasEntryForProposal guard.
- [minor, depth] The round-2 identity anchor made the demo inquiry card
  UNRECOVERABLE once Olivia was triaged (the lead reseed only inserts
  missing-by-name; nothing reset status) → seedProposals restores the
  anchor lead to a fresh 'new' before anchoring — the delete-and-reseed
  contract holds again.
- [minor] The countActionsSince JSDoc had been orphaned above
  hasEntryForProposal — moved to its function.
**Verification round 4 (2026-07-28): NOT clean — LAW EMPTY for the second
consecutive round; claims/resilience/depth found 6, all inside the
recovery machinery, all main-loop confirmed and fixed:**
- [major] Campaign recovery attributed from sendCampaign's 'active' CLAIM
  flag, which is set before any email exists — a post-claim pre-send
  throw would have narrated a send that never happened, with the row
  stuck 'active' and the month's recall silently lost. Attribution now
  requires COMPLETION evidence ('completed'/sentAt, written only by the
  post-send block); a stale stuck claim (active, no sentAt, >15 min) is
  REPAIRED at the tap — released to draft, copy synced, and the send
  actually runs; a fresh active claim holds the card; already_sending
  after our own check is a live race and holds without narrating.
- [major] reopen() after a failed approve was the reconcile-reopen's
  forgotten sibling: no expiry extension ("try again in a minute" on a
  near-expiry card meant invisible + swept within the hour, sourceKey
  burned) and no attempt marker. Both added.
- [minor ×2, depth] The sweep's closer could MIS-CREDIT (a staff member
  hand-pasting the drafted reply into Google produced a verbatim match on
  a never-approved card → false "you approved it") and a transient read
  failure terminally closed real work unnarrated. closeRecoveredProposal
  is now three-state ('closed' / 'not_ours' / 'skip'): review attribution
  requires evidence of OUR OWN attempt (approved status or the new
  reopened-from-approval marker both reopen paths stamp); transient
  attribution/narration failures skip the pass and retry hourly.
- [minor] The closer's expire was status-unguarded against a concurrent
  approve → now an atomic conditional close on the caller's expected
  status (0 rows = the approve owns it), and the approve's own narration
  gained the hasEntryForProposal guard so whoever narrates second is
  suppressed — one yes stays one entry from both directions.
- [minor] The standup-card header comment still described the pre-round-1
  hide-on-quiet behavior — corrected (the quiet week narrates in-app; the
  EMAIL is what stays silent).
**Verification round 5 (2026-07-28): NOT clean — but ALL FOUR lenses
independently converged on ONE finding**, the strongest convergence
signal of the audit: round 4's reopen() wrote back the CLAIM-TIME payload
snapshot, erasing the campaignId/socialPostId the executors stamp during
execution — real in production (drizzle .returning() materializes a
snapshot) and invisible in tests because the mock's returning() handed
back live aliased rows, making the pinning tests false-green. Fixed both
sides: reopen() re-reads the payload before merging the marker, and the
harness now returns MATERIALIZED SNAPSHOTS from every select/returning
(jsonb deep-copied) — the aliasing class can never hide a bug again, and
the existing stamp-survival tests became the regression net. Resilience
added one last minor: the tap's recovered-retire was the file's final
stamp-before-narrate — reordered to narration-first (a failed narration
leaves the row approved for the hourly reconcile; the card still clears).
Round-5 full suite 5,593 green; typecheck + build clean.

**Verification round 6 (2026-07-28): CLEAN — zero findings, all four
lenses.** Depth and claims empty; law empty with a full verification
trace (tenant scoping, ledger-boundary law + its recovered-expiry
exception, clinic-tz, demo coherence, voice, authorization, cron
parity); resilience empty after tracing every interleaving of the new
reopen re-read and narration-first retire, cross-checking all recovery
paths in execution order, and rejecting its own remaining candidates on
evidence (each unreachable or absorbed by the executors' own-work
guards). The gate is satisfied; the certificate is in the status block
above.

- **Round 2:** 4 lenses over the fix commit → skeptic confirmed 9 defects
  / rejected 2, judge ruled 4 in-phase gaps → main-loop confirmation
  upheld every verdict (both rejections re-verified at the cited code:
  the "meter drain" claim ignored the top-10 slice cap; the "permanent
  starvation" claim ignored newest-first admission within the star
  bucket).
- **Round-2 confirmed + FIXED (9):**
  1. [major] Campaign-row REUSE sent the pre-edit draft: a reopened
     campaign retry never synced the staff-edited body/subject onto the
     reused row → the reuse path now updates subject + bodyHtml from the
     claimed proposal before sending (pinned by test).
  2. [major] One generator throwing killed its siblings for the org →
     runProposalGenerators runs each generator in its own try/catch.
  3. [major] An uncaught runClaudeJson throw in draftGoogleReviewReply
     propagated through the review generator → the AI call is caught and
     returns `{ok:false, reason:'failed'}`; the error union now carries
     `reason: not_configured | no_allowance | not_found | failed`.
  4. [major] The review generator treated every draft failure as global →
     break ONLY on not_configured/no_allowance; a per-review failure
     skips that review and the siblings still draft (pinned by tests).
  5. [major] The Monday standup email was DEAD ON ARRIVAL: it gated on
     dailyDigestEnabled, which defaults to 0 and is a different opt-in →
     gate removed; the off switch is the per-staff digest opt-out (test
     inverted to pin the always-sends behavior).
  6. [minor] One bouncing mailbox cost the remaining staff their standup
     (the week was already claimed, so no retry) → per-recipient
     try/catch; failures land in result.errors.
  7. [minor] The social quiet-window check ignored the SCHEDULED queue →
     it now also checks status='scheduled' targets before proposing.
  8. [minor] executeSocialPost could double-publish after a failed
     attempt (createSocialPost persists the row before networking) →
     supersede law: prior payload.socialPostId with all-failed targets is
     deleted before the fresh publish; any published/scheduled target
     retires the card instead. The dead publishedCount===0 branch (ok ⇒
     ≥1 non-failed) was removed.
  9. [minor] STANDUP_NOUNS were plural-only ("1 campaigns sent") + the
     CLAUDE.md meter line contradicted the code → {one, many} pairs with
     standupNoun(); doc corrected (review_reply drafts spend the shared
     review_reply_draft 200/mo allowance).
- **Round-2 in-phase gaps SHIPPED (4):** the email SUBJECT is shown and
  editable on the card (merged into the payload pre-claim so the executor
  sends exactly what was approved) · declining is two-tap ("Sure? I won't
  ask again") since a decline is permanent, and answers with its own
  toast · the quiet-week standup keeps the good-news lines (seated /
  reviews / only-you) instead of going monosyllabic · the inbox lists
  SOONEST-TO-EXPIRE first with an honest "Showing X of N" header when
  truncated (D5, expired-work re-ask flow, went to the backlog).
- Round-2 full suite 5,552 green; typecheck + build clean.

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

---

## Phase 4 — the Guardian + the shared brain: ROUND-3 ESCALATION + RETROSPECTIVE (2026-07-30)

**Rounds 1–3 ran at the hard cap and round 3 still found significant items,
so discovery-by-audit ended and the remaining discovery became the main
loop's own job.** Totals across the three rounds: **36 confirmed defects
fixed, 9 in-phase gaps shipped, 7 accepted to backlog, 17 rejections upheld.**
Suite 5,629 → 5,865.

### Why did this phase ship with this many gaps?

One root cause, three faces. **I shipped observability without ever making
the thing fail.**

Phase 4's whole subject is *noticing when something is broken*. Every slice
was written by reasoning forward from a healthy system — "when X breaks, we
will record it" — and never once by breaking X and watching. That single
habit produced almost every serious finding:

1. **`recordFailure` had zero callers for a whole slice.** I wrote the
   failure vocabulary AND the three-strikes rule that consumes it, and the
   branch was dead in production. Reasoning forward, it looked complete:
   the writer existed, the reader existed. Nobody connected them because
   nothing ever failed during development.

2. **The channel I then built could not see the failure most likely to
   happen.** The AI helpers are hardened never to throw — a fact documented
   in their own source — and I wired the recorder into `catch` blocks. A
   revoked API key would have broken all three AI generators silently and
   forever while the Guardian reported "healthy".

3. **When I fixed that, I conflated two failures into one signal.** "The
   provider is down" and "this one review is un-draftable" both returned
   `'failed'`, so a single profane 1★ — sorted worst-first, so it leads
   every run, and never replied to, so it never leaves the queue — would
   have produced one strike a day forever and a permanent false `blocked`
   that no recommended action could clear.

4. **And the reader I shipped to end headline-guessing read only half the
   vocabulary its own counter counts.** `failureCountExpr` matched
   `failure` OR `autoFailure`; `recentFailureSummaries` matched `failure`.
   A clinic that had granted autonomy hit the alarm entirely on hand-backs
   and got an empty "What it tried" list under a hardcoded guess.

The same forward-only reasoning explains the rest: two `.catch(() => 0)`
paths that turned an unreadable database into a *confident false claim*
(a fabricated "down 100%", and every practice on the platform reported
silent from one timed-out aggregate); a bare `UPDATE` for a memory row that
may not exist, which would have emailed about a half-provisioned clinic
every morning forever; a `MIN_LIFT` stability guard anchored to a constant
so it stopped guarding the moment it was needed; a heads-up card whose only
call to action was a 404.

**A second, sharper lesson: I verified a route with `ls -d`.** That confirms
a *directory* exists and says nothing about whether Next.js will serve it.
The one surface where the machine admits it cannot do its job had a dead
link, and my pre-audit check "passed". Checking the shape of a thing is not
checking the thing.

**Third: tests written alongside a fix tend to test the fix's shape, not its
behaviour.** Round 3 found that round 2's headline fix was "verified" by
`readFileSync`-ing its own source and asserting on the text — flipping the
one line that mattered would have kept the suite green while production
regressed. Round 1's two headline fixes, the churn filter, the seated-null
guard, and the shared brain's only production effect all had **zero executed
coverage** at the moment I declared them done.

### Standing lessons added by this phase

- **Observability is not shipped until you have broken the thing.** Any code
  whose job is to notice a failure must be exercised by inducing that
  failure — not by reasoning that the recorder is wired up. If the failure
  cannot be induced in a test, that is itself the finding.
- **A failure signal must distinguish "the system is down" from "this item
  is bad."** Collapsing them turns one awkward row of data into a permanent
  false alarm about infrastructure, and the recommended fix can never clear
  it.
- **A counter and its explainer must share one predicate.** If code counts
  N things and another function explains them, they are one law with two
  readers; give them one home or they will disagree, silently, in the
  direction that makes the report wrong.
- **`.catch(() => 0)` inside a comparison is a lie generator.** A default
  that is indistinguishable from real data will be reported as real data.
  Unreadable must be its own value, and a report that cannot be made
  honestly must not be made.
- **Verify routes by their handler, not their directory.** `ls -d` proves
  nothing. Look for the file that actually serves the path.
- **A test that reads source text is not coverage.** If the assertion would
  survive the behaviour being reverted, it is documentation with a green
  tick on it.

### Verification rounds (2026-07-30)

**Attempt 1 — INVALID.** The skeptic, the judge and one lens all died on API
529s, so the round produced no verdict. Its surviving lenses did, however,
find a **critical**: `failureOnly()`'s unwrapped top-level `OR` escaped
drizzle's `and()` chain, so the failure-cause reader matched every Phase-3
hand-back row for **every organization** — a tenant-scoping breach, with
patient names in hand-back summaries able to print under another practice's
name. Introduced in round 3, in the query written to fix a different bug.
Fixed; the test walks paren depth and was verified to fail when reverted.

**Attempt 2 — NOT CLEAN.** 2 major + 5 minor defects, 3 in-phase gaps. The
major ones: `guardian_state` was stamped even when nothing was delivered, so
a clinic that changed state while the mail was down kept a recent
`alertedAt` from its *previous* problem and went silent on the new one for a
week; and the failure de-dup was keyed on capability, so one flaky provider
surfacing in a different step each hour bought a fresh strike every time.
Also: the owner's report replayed sentences written for the clinic ("you'd
handed this over to me", "it's back with you") — a tenant-voice breach on the
phase's flagship owner surface; the shared-brain badge flipped to "Still
learning" during routine weeks while a learned hour was scheduling real
patient mail; and the brand-new-clinic recommendation reached no reader.

**Standing lesson added:** *a raw SQL fragment with a top-level `OR` must
parenthesize itself* — it cannot know what it will be composed into, and
`and()` will not do it for you. The failure is silent: valid SQL, plausible
rows, no error.

**Open gap carried to backlog (named, not hidden):** the failure vocabulary
still has exactly ONE writer. The proposal engine reports; reminders,
campaigns, review sync, GBP sync and PMS sync do not. So the Guardian's
`blocked` state currently sees proposal-engine breaks only. The verdict copy
was corrected to stop asserting a cause it cannot check ("usually an expired
Google token") — it now says what it knows and lets the per-capability list
carry the rest. Wiring the remaining producers is the next slice of this
work, not a claim this phase gets to make.

**Attempt 3 — NOT CLEAN.** 2 major + 8 minor, 2 in-phase gaps. The major:
`recordFailure`'s once-a-day window only ever throttled the `failure` half
of the vocabulary. The `autoFailure` half — the Phase-3 hand-back — has no
throttle, and the granted-card loop hands back EVERY open card in one tick,
so a single two-hour provider outage wrote N rows in the same instant,
cleared `FAILURE_ALARM_COUNT` immediately, and pinned the practice to
`blocked` for the whole trailing week after the break had healed. Round 3's
unification of the two markers is what brought the undeduped half into the
alarm; the throttle was never extended with it.

The fix moves the alarm from rows to **distinct days**, which is what its own
documentation always claimed ("three strikes is three DAYS of a broken
thing") and is robust to whatever shape the rows arrive in or whichever
subsystem writes them. It also made the headline honest — "hit trouble on 3
days this week" where "3 times" had been counting bursts.

Also fixed: an empty `.set({})` throwing "No values to set" on exactly the
path that matters (a report was due and did NOT land), swallowing the real
diagnosis into an ORM string — introduced by the verification-round-2 fix
for the stamping bug; "I first told you about this N days ago" reporting the
LAST alert and structurally pinned at ≤7 days, so a six-week break read as a
one-week one; the owner's failure list printing clinic-voiced capability
labels ("Bring you work that's ready to approve") — the residue of round 2's
move off the ledger summaries onto the labels, which are clinic copy too;
and the `stalled` verdict asserting lost growth without noting that a week
with failures may simply have lost data.

**Standing lesson added:** *when two subsystems write the same signal, the
throttle belongs to the READER, not to one writer.* Unifying what a counter
matches without unifying what limits it moves the burst problem rather than
solving it — put the rate limit where the count is taken.

### The consolidation slice (2026-07-30)

Three verification attempts each found real defects of the SAME class, so
the method changed. Rather than a fourth round, the failure signal was
rebuilt as **one owned primitive**:

- **`lib/ledger-markers.ts`** declares the vocabulary ONCE — `NOT_WORK_MARKERS`
  and `FAILURE_MARKERS` — plus the JS predicates derived from those lists.
- **`workOnly()` and `failureOnly()` are GENERATED** by mapping over the same
  lists. There is no hand-written SQL copy of the law left to drift, and a
  marker added to a list reaches every rendering with no further edits.
- **`recordEngineFailure` is the ONLY door.** The Phase-3 hand-back, which
  used to stamp its own `autoFailure` marker through `recordAction` — and so
  ended up outside the throttle the other producer had, counted by an alarm
  whose explainer could not read it — now goes through it, carrying one
  marker plus a `failureKind` for provenance.
- **`tests/journey/ledger-marker-law.test.ts` is the structural guard.** It
  asserts the JS and SQL laws agree marker-by-marker, walks paren depth to
  prove the OR self-parenthesizes, and FAILS THE BUILD if any file outside
  the owning module hand-writes a failure marker or re-types a marker
  predicate (allowlist with reasons, per repo convention).

**Where the rate limit lives, stated once:** the write-side `onceWithin`
stops a WRITER spamming a clinic's story; the ALARM is throttled at the
READER by counting distinct DAYS. That split is deliberate — a producer may
legitimately write several rows at once (each hand-back names a different
card), and verification round 3 proved that unifying what a counter matches
without unifying what limits it just moves the burst.

**Post-consolidation verification — NOT CLEAN, but differently.** 5 distinct
defects + 3 guard gaps, and the shape of them is the point:

- **The consolidation caught its own consequences.** Routing the hand-back
  through the one door made it share the engine's marker — so an unthrottled
  hand-back row started matching the engine's 24h throttle and suppressing
  its strike. Right idea, incomplete: unifying the vocabulary without keying
  the throttle by KIND is the same mistake one layer over. Fixed by keying
  `ownFailureMarker` on `failureKind`.
- **One old instance surfaced with better resolution.** The cause list had
  been counting ROWS while labelling them "days" ever since round 3 moved the
  counter to days and changed only the word. It now buckets by
  `(capability, day)` in the same query shape the counter uses.
- **The binding tz convention had been missed entirely.** `date_trunc('day',
  occurred_at)` buckets on UTC midnight — 5 PM the previous day in PDT — so a
  Pacific practice's single bad afternoon could read as two "days". Both the
  counter and the explainer now bucket clinic-local.
- **The guard gaps were the most valuable finding.** The marker-law test
  proved both renderings NAMED each marker but never that they agreed on
  POLARITY (a rendering could name a marker in the wrong direction and pass),
  covered only the failure markers rather than all four, and pinned
  composition safety for `failureOnly()` but not `workOnly()` — which goes
  into the same `and()` calls. All three closed.

**Standing lesson added:** *a guard that checks presence is not checking the
law.* Asserting that generated SQL mentions a marker says nothing about
whether it asserts or negates it. Guards must pin the direction, and must
cover every member of the set they claim to own.

**Post-consolidation verification, attempt 2 — NOT CLEAN.** 2 major + 1
minor, and both majors were round 6's own fixes being wrong in a way only a
boundary check could see:

- **`AT TIME ZONE` was applied backwards.** `action_ledger.occurred_at` is
  `timestamp` WITHOUT zone holding a UTC wall clock. In Postgres, `naive AT
  TIME ZONE z` ASSUMES the value is already local in `z` and ADDS the offset;
  the correct conversion is the round trip `(v AT TIME ZONE 'UTC') AT TIME
  ZONE z`. Round 6 wrote the single-cast form — copied from the shared brain,
  whose column genuinely IS timestamptz — so the day boundary moved the WRONG
  way by double the offset (16:00 local for an EDT practice). The bug round 6
  set out to fix survived its own fix, and no test could tell, because the
  only assertion was that the string "at time zone" appeared.
- **The shared brain's abort branch was dead code.** `readPlatformConfig`
  catches every error and returns `{}`, so `getSharedBrain()` cannot reject
  and the "a failed config read aborts the pass" branch was unreachable. A
  transient DB error still substituted the shipped default as the incumbent
  AND let the pass overwrite what was known. Fixed with a strict read that
  is allowed to throw, and a test that makes it throw.
- The `silent` verdict asserted "the ledger is empty for 14 days straight"
  in the same email that listed what had failed — reachable because the work
  count excludes failures and the alarm pre-empts only at three.

**Standing lesson added:** *asserting that a conversion is PRESENT is not
asserting it is CORRECT.* A test that greps for `at time zone` passes on a
statement that shifts time the wrong way. Boundary tests for conversions must
pin the DIRECTION — and an idiom copied between two columns is only valid if
the column TYPES match.

**Attempt 3 — NOT CLEAN.** 2 major + 2 minor. Two of them are the phase's own
signature class, found hiding inside the fixes for it:

- **The day expression was a hand-written DUPLICATE.** The counter and the
  explainer each carried their own copy, so the round-6 day-counting fix and
  the round-7 timezone-direction fix each had TWO sites — and only one was
  rendered by a test. Reverting the explainer's copy restored either defect
  with the whole suite green. Now `clinicLocalDay()`: one expression, both
  readers.
- **The explainer had ZERO executed coverage.** The service test's select
  mock lacked `orderBy`/`limit`/`desc`, so `recentFailureSummaries` threw a
  TypeError straight into its own silent `catch {}` and returned `[]` in
  every sweep test — for three rounds it looked covered and never ran once.
  The catch now logs, which surfaced the cause in one run, and the mock
  executes the real query.
- **The clinic-facing stall said "Nothing is broken on my side" in a week the
  machine recorded failures.** Round 7 taught the OWNER's version of that
  sentence to hedge and left the sibling asserting it unconditionally — the
  sibling-sweep lesson from Phase 2, written down and not applied.
- The `learned` flag still flipped when the learned hour EQUALS the shipped
  default (the likeliest steady state). Whether we learned something is a
  fact about the past, so it is now carried forward rather than re-derived
  from the value.

**Standing lessons added:**
- *A silent `catch {}` around a query makes an untested path look tested.*
  It converts "this never ran" into "this returned empty", which every
  assertion downstream happily accepts. Catches that swallow must log.
- *A test harness that omits a builder method does not fail — it throws into
  your error path.* Mock completeness is a correctness property of the test,
  not a convenience.


**Attempt 4 (round 9) — NOT CLEAN.** 7 distinct defects (2 major) + 4 in-phase
gaps. The whole round was, again, the phase's signature class — but this time
in a form that names the *method* failure rather than the code failure:
**the round-8 sibling sweep enumerated the files I remembered instead of the
files the phase touched.**

Every confirmed defect was a sibling of an already-fixed one:

- **The weekly standup told a clinic "nothing needed sending… I'm watching"
  in a week its own ledger held only failures.** `totalActions` is work-only
  by law, so a nothing-but-failures week is arithmetically identical to a
  week where nothing needed doing. Round 8 taught the Guardian's clinic-facing
  sentence to hedge for exactly this and left the standup — the flagship
  honesty surface — asserting an all-clear. Fixed with `countFailuresSince`,
  and the main-loop sweep then found TWO MORE calm verdicts with the same
  silence (`healthy` and `quiet`), plus the switch-blocked one. There is now
  a structural test that walks every verdict reachable with 1–2 failures and
  fails if any of them says nothing.
- **A blind sweep rendered as a confident all-clear.** "I could not see" and
  "nobody needed you" both arrived as an empty `reports` array, so the panel
  printed "No practices to watch yet", the overview's catch discarded even
  the honest summary, and the cron logged `{ok:true, scanned:0}`. The service
  had refused to invent a verdict and then handed back a shape in which that
  honesty was the one field nobody read. `blind` is now a first-class value
  every consumer must decide about — and the same class turned up in the
  shared-brain card, where a failed read rendered as "Still learning / Has not
  run yet", both of which can be flatly untrue.
- **The heads-up card's visibility window and the re-alert cadence were the
  same constant,** both measured from the sweep's own `now`. A day-7 run
  starting a second earlier than a week ago wrote no note, and the card — the
  note's only clinic surface — went dark for a day under a live problem. A
  coin flip on cron jitter, in code whose comment promised the opposite.
- **`classify` reported an unexplained blackout while holding the
  explanation.** Both engines off plus an empty ledger returned `silent`
  ("check their integrations and patient data") when the switches sat in the
  same signals — and `silent` is not clinic-actionable, so the one finding
  the practice could have fixed in two clicks was withheld at every audience
  setting.
- `engine-switches.ts` — created BY this phase — was the one file the round-8
  catch-logging sweep missed. Re-swept from `git diff --name-only`, which
  found five more.
- `dedupeAcrossOrg` had zero executed coverage: deleting the branch left the
  whole suite green.
- CLAUDE.md still said `platform_config` "carries only the audience lock"
  (load-bearing — that is exactly the belief that produces a read-modify-write
  and drops the learned send hour) and called the phase "slices 1–3" while
  listing five.

**In-phase gaps shipped:** the alert loop now CLOSES (a recovery stands down
to whoever was interrupted, and a failed all-clear keeps the old memory so
tomorrow retries); the watcher records its own HEARTBEAT (a dead cron rule, a
500ing route, or a platform with no `platformAdmin` row used to present as
"everything is fine", because the panel renders live either way); a flagged
row and its alert email now OPEN the practice instead of leaving the owner to
hand-search the clinics list; and the audience lock shows a DRY RUN while
closed — the sentence a practice would read, and how many would hear one
today — so the owner's first sight of that copy is not a customer reading it.

**Standing lessons added:**
- *A sibling sweep must be driven by the diff, not by memory.* Enumerate
  `git diff --name-only <range>` and grep that list. Round 8's sweep was
  correct in kind and incomplete in extent, and the file it missed was one
  the phase itself had created.
- *When a fix teaches ONE surface to hedge, find every surface that makes the
  same claim and write the structural test that enumerates them.* Three
  rounds in a row fixed one instance of "the machine says it is fine when it
  is not" and left its siblings standing.
- *Never store a field nobody reads.* Slice 4 was pulled up for exactly that;
  the heartbeat's `blind` flag was written and dropped by the resolver in the
  same hour, and is now read.

**Attempt 5 (round 10) — NOT CLEAN.** 4 distinct defects (8 confirmed, with
duplicates) + 3 in-phase gaps. **Three of the four were defects IN THE
ROUND-9 FIXES**, which is the sharpest signal yet: at this depth the phase's
remaining risk is not the original code, it is the corrections.

- **Both "I couldn't read it" states round 9 added were DEAD CODE.** The
  shared-brain card's `unreadable` branch and the Guardian heartbeat's
  fallback were wired to `readPlatformConfig`, which swallows every error and
  returns `{}` — so neither `.catch` could ever fire, and a transient DB blip
  still rendered "Still learning" and "I haven't completed a daily check yet",
  the two claims the fixes existed to prevent. Round 7 had already built
  `readPlatformConfigStrict` for exactly this and left it with one consumer.
  Fixed with ONE strict read serving all three platform_config surfaces, and
  a source-scanning guard (the defect is a branch that never executes, which
  no behavioural test can observe by construction) with a negative control.
- **The stand-down guard was inverted in its principal case.** Round 9 asked
  `clinicActionable` against TODAY's signals to decide whether the owner
  should hear an all-clear — but the only clinic-actionable `blocked` shape
  is both-switches-off, and it recovers BY the switches going back on, so
  today's signals always answered "not theirs" and the owner was emailed an
  all-clear for an alarm only the practice ever received. Replaced with a
  signals-free `standDownGoesToOwner`, which errs toward silence on the one
  genuinely ambiguous case.
- **The dry run claimed practices "would hear something today"** when the
  cadence guarantees they will not: delivery needs the routing rule AND
  `shouldAlert`, and at the moment the lock opens every flagged clinic
  already carries its state from earlier owner-audience runs. The count was
  right; "today" was the false part, on the phase's single most consequential
  control.
- `platform-config.ts`'s and the schema's own docstrings still said "two
  top-level keys" after the heartbeat added a third — CLAUDE.md was swept in
  round 9 and the two files nearest the code were not. That sentence is
  load-bearing: it is what a writer reads before deciding a read-modify-write
  is safe.

**In-phase gaps shipped:** the standup's BUSY-week branch now admits failures
too (round 9 taught the quiet branch and left the one a working practice
reads fifty weeks a year); both heartbeats detect **stopped**, not just
**never started** (a stored instant rendered as quiet grey text forever,
never compared to now — and a silently dying cron is the failure this repo
has actually had); and `sampleSends` finally reaches the owner, so "Still
learning" can say how close, instead of quoting floors with no reading
against them.

**Standing lessons added:**
- *An error branch attached to a read that swallows its own errors is dead
  code.* Every new "I couldn't" state must be traced to a call that can
  actually reject — and if the only available reader floors internally, the
  fix is a strict variant, not a `.catch`.
- *A fix is a change, and changes need the same sweep the original code got.*
  Three of round 10's four defects were in round 9's corrections. Re-run the
  class sweep over the DIFF OF THE FIX, not only over the code it fixed.
- *Never store a field nothing renders* (third occurrence — `openProposals`
  in slice 4, the heartbeat's `blind` in round 9, `sampleSends` and the
  heartbeat's `scanned`/`flagged` here). Storing and rendering must land in
  the same commit.

**Attempt 6 (round 11) — NOT CLEAN.** 9 distinct defects (11 confirmed with
duplicates) + 1 in-phase gap. Unlike round 10, most of these were in the
ORIGINAL code and had survived every prior round — the lenses reached a layer
they had not reached before (the meaning of the stored memory, the shape of
the comparison the brain makes, what the boundary test actually renders).

- **The standup called an autonomy hand-back "mine to sort out, and I'm on
  it."** `countFailuresSince` matched both failure producers, and the second
  one is the machine *deliberately stopping* after two tries and handing the
  card back — so the same report said the machine was still on it AND listed
  that card two lines below as waiting on the human, contradicting the
  machine's own ledger sentence. `failureKind` existed precisely to tell
  them apart, and the read side ignored it.
- **The alert memory stored only the STATE word, and `blocked` is two
  problems.** Failure-blocked is ours to fix and never reaches a practice;
  switch-blocked is theirs and does. Moving between them was "the same
  problem", so nobody was told for up to a week while the last thing said
  about that clinic was the wrong half of the truth. Fixed with a problem
  KEY (state + cause) — the memory's granularity now matches what the code
  means by "the same problem".
- **The stand-down (round 9) gave the Guardian a way to OSCILLATE.** The
  stall is a strict inequality over two daily-sliding windows, so one seated
  patient crossing a boundary flips a practice attention → fine → attention
  on alternating days — and every flip was a state change, so it earned an
  alert one morning and an all-clear the next, forever. Fixed with a dwell
  clock: a recovery must hold `STAND_DOWN_DWELL_DAYS` before it is
  announced, and because the problem key is not stamped over while that
  quiet is being served, the re-break is still "the same problem" and stays
  silent too. One clock, both halves of the flap. **My own new test caught a
  bug in that fix** — the first draft still stamped `healthy` on the
  not-yet-held pass, which defeated the entire mechanism.
- **The SQL boundary test rendered a statement Postgres would reject.** It
  hand-wrote `select … from action_ledger` around the imported aggregates,
  and the day expression inside them names `clinic_profile.timezone` — 42P01,
  every run. The strictest-looking test in the phase was validating a
  statement the database cannot execute, and the LEFT JOIN the real query
  depends on had zero coverage anywhere (the service harness stubs `leftJoin`
  to a no-op). The query is now ONE definition: the service passes the live
  `db`, the test passes drizzle's offline `QueryBuilder`.
- **The shared brain declared findings from a comparison with one arm** — and
  skipped MIN_LIFT entirely when the hour in force had no qualifying bucket,
  so the platform-wide send hour could move on a single arm while the copy
  claimed it "beats every other hour". Every automated send aims at the hour
  in force, so `[incumbent]` alone is the LIKELIEST shape for a long time.
  Both closed; several existing tests had been pinning the defect by
  supplying one bucket and expecting a finding.
- **A week of nothing but failures was still `quiet`, so the Monday email was
  suppressed** — the exact week rounds 9 and 10 taught this thing to admit
  its own breakage was the week the email carrying that admission never sent.
- The audience control printed "Practices are told nothing" from an
  unreadable config: round 10 floored the DECISION correctly and let the
  floor be rendered as a statement of fact. Same class, one consumer further.
- `alsoFailedClause` rendered a count of DAYS as a count of "jobs".

**In-phase gap shipped:** chronicity. `guardianAlertedAt` is overwritten on
every delivery, so "I last flagged this N days ago" is pinned at or under
RE_ALERT_DAYS by construction — a six-week break read as a seven-day one, and
the owner could not tell a churn conversation from a shrug. Migration 0141
adds `guardian_first_seen_at`; both email bodies and the panel row now say how
long it has actually been wrong.

**Standing lessons added:**
- *A test that builds its own version of a query is testing its own version
  of the query.* If the production statement is assembled by a builder, the
  boundary test must render THAT builder — drizzle's `QueryBuilder` needs no
  connection, so there is no excuse.
- *When a stored value stands for a concept, check that its GRANULARITY
  matches the concept.* One word for two problems is the duplicate-law defect
  wearing a different hat: not two copies disagreeing, but one copy that
  cannot express the distinction the rest of the code makes.
- *Adding a state transition adds an oscillation.* Any new "announce the
  opposite" path needs a dwell clock, or the threshold it watches will flap.
- *A single-arm comparison is not a comparison.* Any code that says one thing
  "beats" another must assert that it had something to compare against —
  and its tests must supply two arms, or they pin the defect.

**Attempt 7 (round 12) — NOT CLEAN, and the shape of it is the finding.**
6 distinct defects, **zero in-phase gaps** (the depth chamber said the phase
is complete for the first time, sending 8 items to the backlog) — and **every
single defect was in a ROUND-11 FIX.** The original phase code produced
nothing this round.

- **The alert email compared a problem KEY to a bare state.** Round 11 made
  the stored memory `state:cause`; two readers in the same file were left
  comparing it to `verdict.state`, and for `blocked` — the one state that
  always carries a cause — that is never equal. So no "Still:" prefix, no "I
  last flagged this N days ago", and round 11's own chronicity sentence
  (nested inside the same broken comparison) was dead for the exact state it
  was written for. The third reader in that file HAD been updated.
- **The chronicity clock was keyed to the last REPORTED problem, and the
  reported key deliberately lags the observed one.** Two opposite failures
  fell out: while the key could not be stamped (a mail outage, or the lock
  open on a clinic that can never stand down to the owner) the age reset to
  today on every pass; and because it cleared only on a DELIVERED stand-down,
  a practice that recovered without one kept its instant forever and a
  relapse rendered "· 100 days now" for a problem that started yesterday. It
  is derived from the trouble itself now, never from what was said about it.
- **The standup quoted a number that meant neither jobs nor days.** Round 11
  narrowed the count to engine failures and called them "jobs" — but the only
  producer writes at most one row per org per DAY and collapses several
  broken steps into one, so one job broken for five days read as "5 jobs".
  Exactly the counter-vs-explainer disagreement round 11 fixed one file over,
  re-introduced by that round's fix. There is no honest number available yet,
  so the sentence quotes none.
- A source-text regex was standing in for the shared brain's only production
  effect, in a file whose harness already drives the real path — it broke on
  renames and passed on regressions, and no test had ever watched a learned
  hour reach a campaign row. `troubleForDays` had zero executed coverage and
  the sweep harness omitted the column it reads. CLAUDE.md's two migration
  lines contradicted each other.

**THE STRUCTURAL FIX, and the real lesson.** Three of the six were invisible
because the alerts harness hand-wrote `verdict: { state, headline, why,
recommendation }` — a literal fixture is a SECOND, SILENT MODEL of the type it
stands in for, so when round 11 added `cause`, 38 tests kept passing while
production compared a key to a state. The fixture now builds from the real
`assessEngine`, and reconciling it immediately surfaced three more genuine
mismatches. **A hand-written fixture for a type the code owns is the
duplicate-law defect wearing test clothing.**

**Standing lessons added:**
- *Test fixtures must be built from the code's own constructors, not
  hand-written literals.* A field added tomorrow has to reach the tests
  without anyone remembering to bring it.
- *When you change what a stored value MEANS, grep every reader of that
  column in the same commit* — not the ones you remember touching. Round 11
  updated three of five readers of `guardianState`.
- *Do not quote a number you cannot define.* If the count means neither of
  the two things a reader might assume, the honest sentence has no number.

**Attempt 8 (round 13) — NOT CLEAN, but converging.** 4 defects + 1 minor
in-phase gap, from 10 raw candidates (round 12 raised 22). Volume is down
across every stage, and — unlike round 12 — TWO of the five were in the
ORIGINAL code, so the "only the correction layer is churning" reading from
round 12 was too generous by itself.

- **An unreadable alert memory FABRICATED the chronicity clocks and wrote
  them back.** `readMemory`'s catch returned an empty object with no flag,
  and the clocks are derived with `?? now` — so one transient SELECT failure
  permanently reset a six-week break's age to today and restarted the dwell
  window. The comment on those clocks claimed they could not be corrupted
  ("both facts are observations"): true of an undelivered report, false of an
  unreadable memory. The catch had ZERO executed coverage because the
  harness's db mock could not fail; replacing its body with one that muted
  every alarm would have left all 38 tests green. There is a fail switch now.
- **The panel glued the trouble-RUN length onto the CURRENT state's
  headline.** Round 12 redefined the clock to survive a change of shape and
  re-worded both emails to match; the panel and the field's own doc were left
  on the old meaning, so a practice stalled 40 days that switched its engines
  off yesterday read "Both engines are switched off · 41 days now" while the
  email that same morning said the careful, correct thing.
- **A failed all-clear lost its age before the retry.** The clock cleared on
  the pass where the email failed, so the report the owner actually received
  the next morning was the quieter one — missing "It needed attention for 41
  days", the sentence round 11 shipped as a gap.
- **ORIGINAL: the stall note replayed a stale "this week" claim for 8 days.**
  The live re-verification was exempted for `stalled` on the grounds that it
  "describes a closed 30-day window, which cannot become false inside a
  week" — true of the opening clause, and round 8 then added a second clause
  about the trailing SEVEN days to the same string. A practice whose
  generator broke on Monday and was fixed Tuesday kept being told to discount
  its own numbers for a reason that had stopped existing. The writer now
  records the numbers the sentence was built from, so the reader re-derives
  instead of replaying.
- **ORIGINAL (gap): the pile-up clause blamed the practice for cards the
  machine handed back.** "N pieces of finished work are sitting unanswered in
  their inbox, so they may have stopped opening it" is a claim about a
  PERSON; a handed-back card is evidence of the opposite. One revoked token
  inflates `failures7` AND that count from a single cause, so the email that
  starts a customer conversation carried a false sentence about that
  customer's staff. `notHandedBack()` already existed as the predicate.

**Standing lessons added:**
- *A catch that cannot be reached by any test is not a guard, it is a
  comment.* Every error path that CHANGES STORED STATE needs a fail switch in
  the harness — the round-8 lesson (swallowed errors) applied to the harness
  rather than the code.
- *When a value's MEANING changes, re-read every sentence that renders it.*
  Round 12 changed what the chronicity clock measures and re-worded two of
  three surfaces.
- *A count borrowed from another subsystem inherits that subsystem's
  definition, not yours.* `openProposals` counts handed-back cards by
  documented design; the Guardian needed a different question and asked the
  same one.

**Attempt 9 (round 14) — NOT CLEAN, and the defect count has collapsed.**
ONE minor defect + 2 major in-phase gaps, from 10 raw candidates. Defects
confirmed by round: 9 → 6 → 4 → **1**. The remaining work in this phase is
depth, not correctness.

- **(defect) `learnBestSendHour`'s winning branch still said "beats every
  other hour"** — the phrase round 11 ruled a false comparison and reworded
  in its two siblings, left verbatim in the ONE branch that actually moves
  every clinic's send hour. `best` is the max over `eligible` only, so any
  hour under the floors or outside the daylight window was never compared.
- **(gap) THE BRAIN LEARNED FROM A POPULATION IT DOES NOT ACT ON.** The
  aggregate counted every campaign send — automated birthday/reactivation
  mail pooled with human-made marketing blasts — while the learned hour is
  applied to exactly one thing, `automationSendAt`. Those two populations do
  not share an open rate at ANY hour and systematically go out at different
  hours, so the buckets differed by CONTENT before they differed by TIME.
  MIN_LIFT's 3-point margin is far smaller than the gap between them: all
  three floors could pass on a comparison that never controlled for what was
  being sent, because they bound sample size and margin, not comparability.
  One predicate on an already-joined table.

  **And the fix surfaced the real shape of the primitive.** Restricted to
  comparable sends, every automated send aims at the hour in force, so
  exactly one bucket fills and `eligible.length < 2` holds forever — the
  brain cannot move the hour on its own. That is correct behaviour, not a
  bug: the only honest way to learn a better hour is to deliberately send
  some of them somewhere else. **An EXPLORATION ARM is now the named next
  slice.** Manufacturing a second bucket by pooling incomparable sends is
  the one thing we will not do.
- **(gap) The Guardian's own run errors had no reader.** Written in seven
  places, returned to a cron route, handed to EventBridge, discarded — the
  same channel this phase built the heartbeat to escape, with the REASONS
  left inside it. The owner could see "1 report couldn't be delivered" and
  had no way to learn whether the mail provider was down, whether there was
  nobody to email, or whether a clinic's memory was unreadable. Sharpest
  case: a half-provisioned clinic (org row, no clinic_profile — reachable in
  production) is skipped by the alerting half FOREVER, counted in nothing,
  while the panel renders it as a flagged `silent` row telling the owner to
  go audit its integrations. The heartbeat now carries deduplicated reasons
  and a skip count, and the panel prints both.

**Standing lesson added:**
- *A learned default must be learned from the population it will be applied
  to.* Sample-size and margin floors cannot detect a confound; only the
  predicate that makes the two arms comparable can. If restricting to that
  population leaves nothing to compare, the honest answer is that the thing
  cannot be learned yet — not a wider sample.
