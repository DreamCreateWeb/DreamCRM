# The Dream Team — AI Operations spec + decision record

**Status: ACTIVE BUILD (owner directive 2026-08-23, overnight session).** The
owner opened a build lane through the release program's feature freeze for
this program specifically; RELEASE.md notes the exception. New defects found
while building still go to RELEASE.md Part 5. The phase-audit for this
program runs at the END of the build arc, not per slice (Empty-Chair
precedent).

This doc is the program's foundation the way `onboarding-overhaul.md` was
for onboarding: the decision record, the architecture, and the build log.
Read it FIRST in any session touching AI operations.

## The vision (owner's words, 2026-08-23)

The platform's identity is not "track and communicate with your patients."
It is: **"Gain new patients, in the services you want more of, and
effortlessly organize, market, track, follow up, and maintain relationships
with them."** Two halves — GAIN (websites, social, GBP, reviews, campaigns)
and MAINTAIN (recall, follow-ups, messaging, retention). The Dream Team is
the layer that makes the GAIN half goal-driven: a staff member says "I want
more implant patients" and a team of specialist agents works the connected
socials, the website, the GBP listing, the data — filing what needs a yes,
shipping what doesn't — toward that goal.

**Human-out-of-the-loop is a FEATURE here, not a risk (owner ruling).**
Dental staff don't want to keep up with social posting, and they won't.
The low-stakes broadcast lanes run on their own from day 0. The safety
mechanism for those lanes is the VETO RUNWAY (below), not an approval.

## Naming lexicon (theme: dreams/sleep — the Dream Create brand)

| Thing | Name | Status |
|---|---|---|
| The feature / sidebar entry / the team itself | **Dream Team** | LOCKED (owner) |
| One run of the team's work loop (the heartbeat) | **Cycle** | LOCKED (owner — "sleep cycles"; never "tick") |
| The chief of staff persona fronting the team in chat | **Sandman** | working name, owner leaning yes |
| Objectives ("more implant patients") | **Goals** in-product; "Dreams" in marketing copy only | LOCKED (owner) |
| The staged-work queue with one-tap stop | "Going out soon" (plain) — themed candidate: "Tonight's cycle" | open |
| Lanes running without approval | "Handles it on their own" (existing autonomy voice) | reuse |

Rule: cute where it sells (marketing site, the roster), plain where people
work (buttons, queues, settings).

## What already exists (the spine — do not rebuild)

The Transformation phases built a Paperclip-shaped governance stack without
naming it one. The Dream Team is a PRESENTATION + GOALS layer over it:

| Harness concept | Already shipped as |
|---|---|
| Specialist agents | The proposal GENERATORS (review_reply, social_post, inquiry_response, outreach_campaign, content_plan, schedule_gap, gbp_website_fix) + the reminder/retention/review-ask engines |
| Heartbeat | The 21 crons (generate-proposals hourly = the main cycle) |
| Approval workflow | The proposal primitive (`lib/services/proposals.ts`) — idempotent filing, atomic approve-claim, expiry, decline memory |
| Earned autonomy | The trust ladder (`lib/autonomy.ts`, `setCapabilityTrust`, unedited-run suggestions) |
| Audit trail | The Action Ledger (narrate-once law) |
| Watchdog | The Guardian (worst-first states, alert memory, audience lock) |
| Cross-company learning | The shared brain (send-hour, exploration arm) |
| Weekly report | The standup Narrator |
| Chat-over-data precedent | The prospecting ⌘J copilot (`lib/prospect-copilot.ts`) — snapshot Q&A, suggests, never mutates |
| Product knowledge injection | `config.brain` → `effectiveProductKnowledge` |

## The Paperclip decision (research 2026-08-23)

Paperclip (github.com/paperclipai/paperclip, MIT, launched 2026-03) is the
closest existing product: org charts of agents, heartbeats, per-agent
budgets with atomic hard stops, board approvals, immutable audit, multi-
company isolation. The owner has used it and confirms the model.

**Decision: do NOT embed it.** It is a standalone Node server + React app +
own Postgres with a trusted-operator threat model (bash-capable coding-CLI
adapters, browser/computer-use agents holding raw credentials). Wrong fit
for a multi-tenant SaaS with dental front-desk users, patient data, a
consent spine, and proper OAuth integrations (Zernio/Resend/AWS). Screen-
driving logins also violates platform ToS and risks clinics' accounts. Our
agents act ONLY through the audited rails.

**What we borrow (the blueprint):** goal ancestry (every task carries its
goal's context down the chain), per-goal budgets that PAUSE atomically
instead of overspending, the org-chart presentation (the roster), skills/
knowledge injection, and the promise the owner loves: the chief of staff
NEVER says "I can't" — it acts through a connected rail, or files the
connect-this-integration setup card (already a proposal type) and continues
the moment it's connected.

**Separate idea, not this program:** running Paperclip self-hosted for
Dream Create's OWN back office (one trusted operator = its intended threat
model). Owner's call, zero product risk.

## The lane matrix (the core ruling)

Three lanes, decided by blast radius — WHO receives the output:

**1. DEEP-SLEEP LANES — auto from day 0 + veto runway.** Broadcast content
from the clinic's own voice to the public; no patient targeting, nothing
irreversible that a delete can't fix. Lanes: `social_post`, blog articles
(the content_plan's pieces), GBP posts (new capability when built). Work in
these lanes STAGES with a visible runway ("goes out tomorrow 10:00 AM") and
a one-tap Stop; editing re-stages. No per-post approvals, ever. Onboarding
says this out loud once. **This deliberately REVERSES two Phase-2/3
rulings** (social_post default ask-first; content_plan not-grantable "four
weeks of a practice's public voice unseen") — owner directive 2026-08-23;
the runway's staged visibility + stop window replaces the approval as the
consent mechanism. Future audits: this was on purpose.

**2. ASK-FIRST, GRANTABLE (trust ladder unchanged).** Anything that lands
in a REAL PERSON's inbox or answers one in public: `review_reply`,
`inquiry_response`, `outreach_campaign`. The existing earned-trust flow
("you've approved the last 5 unchanged…") remains the graduation path; the
consent box stays never-pre-ticked.

**3. ASK-FIRST, NEVER AUTO.** Judgment the machine may not take over:
`schedule_gap` (the practice knows next Thursday), `gbp_website_fix`
(public listing edit), `setup_*` (day-0 identity), goal creation itself.
Website edits are a special case: the website agent works INTO THE DRAFT
LAYER freely (safe by construction — Draft→Publish already exists); the
publish stays human.

Laws no lane may cross, goal or no goal: the consent spine (an opt-out is
louder than an opt-in), quiet hours, the frequency cap, the family-safe
identity rule, budgets, the honest voice. A goal makes the machine
ambitious, never unsupervised.

## Architecture

**Goal object** (`goal` table, org-scoped): `objective` (free text),
`serviceFocus` (nullable service-line slug), `status`
(active/paused/achieved/retired), `createdByUserId`, budget fields, and a
`brief` jsonb (the planner's decomposition). Goals are few (0–3 active per
clinic) and long-lived.

**Ancestry context:** every generator receives the active goals and
flavors its work — the content planner writes implant-themed pieces, the
outreach audience builder targets the service line, the website agent
stages service-page emphasis into the draft, GBP posts point at the
service page. One shared `goalContextFor(orgId)` feeds them all; a
generator with no goal falls back to today's behavior exactly.

**Per-goal budgets:** ride the existing meters (`ai_usage_counter`, the
SMS segment budget, send caps). Hard stop = the lane PAUSES and the
roster says so honestly; nothing overspends.

**Sandman (the chief of staff):** one conversation surface, prospecting-
copilot architecture pointed at clinic data — a grounded snapshot
(new-patients/wk, recall funnel, campaign opens/clicks, review + social +
GBP metrics, goal progress) computed IN THE DATABASE (shared-brain privacy
law: aggregates cross into app memory, patient rows never reach the AI —
the Bedrock/BAA question stays open and unchanged by this program).
Sandman answers "why" questions with honest correlations ("the good month
had 6 posts and 2 campaigns; this month had 1"), and its suggested actions
FILE PROPOSALS or CREATE GOALS — it never mutates directly. Reachable from
the Dream Team page (primary home) and later everywhere (⌘J-style).

**Attribution honesty:** goal results report seated patients and real
click-throughs by channel (the GBP-UTM attribution already exists), stated
as correlation, never invented causality.

## The surface (solves the original approval-cards question)

**Sidebar: "Dream Team"** — one entry, clinic tenant, Daily group, right
under Overview. The page is *the staff you hired*, never a console:

1. **Waiting on you** — the approval sign-here stack MOVES HERE from the
   Overview (unchanged mechanics: queue rail, skip, see-all, mounted
   drafts, keyboard nav).
2. **Going out soon** — the veto runway: everything staged by deep-sleep
   lanes with its go-time and a Stop.
3. **Goals** — the 0–3 active goals with honest progress; "set a goal"
   intake.
4. **The roster** — each specialist's lane: what it shipped this week,
   what it's waiting on, its trust level; the grants strip and
   "handled on my own" feed fold in here.
5. **Sandman** — the conversation.

**The Overview keeps a calm summons strip** (~80px): "The Dream Team has
3 things ready for your sign-off · 2 posts going out tonight" → deep-links
to the page. The Overview goes back to being a glance.

## Build phases (the overnight ladder)

- **D1** — this spec + doc-set wiring. ✅ (this commit)
- **D2** — the Dream Team page + sidebar entry; approval stack relocates;
  Overview summons strip. Structural, no new behavior.
- **D3** — design pass: the roster, empty states, the page's identity
  (DESIGN-SYSTEM v3; the page must pass the "report, not console" smell).
- **D4** — the veto runway: unified staged-work read (scheduled social
  posts + scheduled blog pieces + parked campaign sends), Stop/edit
  actions, day-0 deep-sleep defaults for new clinics + the autonomy-
  registry changes and their test reconciliation, runway visibility in
  the summons strip.
- **D5** — Sandman v1: grounded snapshot service + chat UI + suggest-
  action chips that file proposals; read-only answers first.
- **D6** — Goals: schema + intake + `goalContextFor` threading through
  the generators + the mission/results view.
- **D7+** — refinement passes, demo seeding (persona-anchored, with the
  cleanup marker, per the demo conventions), docs, the program audit.

Deploy discipline per batch: full `pnpm build` + full `pnpm test` gate →
commit → merge to main → verify deploy (same as the best-version program).

## Open questions

- Sandman's final name + whether Sandman speaks in first person as "I" or
  as "we" for the team (leaning: "I" — one voice, many hands).
- Runway length (default staging→send delay): leaning next daylight 10 AM
  clinic-local, minimum ~12h visible runway.
- GBP posting capability: confirm the Zernio endpoint surface before
  promising the lane.
- Pricing: whether Dream Team headlines the $200 founding rate or
  justifies a higher tier post-1.0 (owner, later).
- Whether the demo org's Dream Team page shows a live-ish staged runway
  (leaning yes — it's the sales demo's money shot).

## Build log

- **2026-08-23 — D1**: spec written; doc-set table + POST-1.0 + RELEASE
  notes wired.
- **2026-08-23 — D2**: the Dream Team page ships and the Approval Inbox
  moves home. New: `/dream-team` (sidebar Daily entry, moon icon; the
  proposals badge re-points to it), `dream-team-view.tsx` (ctx-taking, the
  clinic-overview testability pattern), `load.ts` (the Phase-2 assembly
  moved WHOLE from clinic-overview — every audited law intact), a
  sign-here-shaped loading skeleton, and the Overview's SUMMONS STRIP
  (`dashboard/dream-team-strip.tsx`: one calm linked row — count, capability
  chips w/ expiry dots, renders NOTHING when quiet). `CAPABILITY_ICON` +
  `expiryTone` single-home in `lib/types/dream-team.ts` (inbox re-exports
  for test compat). Overview's proposal read slims to the strip's needs;
  My Day's waiting-tile + the daily digest deep-link to /dream-team. The
  three inbox test suites re-pointed at DreamTeamView; new strip suite.
- **2026-08-23 — D3**: THE ROSTER. `SPECIALISTS` registry in
  lib/types/dream-team (six teammates as a pure lens over lib/autonomy's
  CAPABILITIES — membership changes no behavior) + `team-roster.tsx`: one
  card per specialist with the blurb, last week's REAL per-capability
  counts (the standup's ledger lines — zero says "a quiet week", never
  looks busy), the on-their-own vs asks-first lanes (grants move a lane
  live), and a warn pill when that teammate has work in the stack. A
  report, not a console — no switches; take-it-back stays on the grants
  strip. Registry-parity tests guard that every non-meta capability sits
  on exactly one specialist (a new capability can't silently miss the
  roster).
- **2026-08-23 — D4**: THE VETO RUNWAY + day-0 deep sleep. The owner's lane
  ruling is now code: `social_post` and `content_plan` default to `auto` in
  lib/autonomy (a deliberate, comment-recorded reversal of the Phase-2/3
  ask-first + not-grantable rulings), and `content_plan` joins
  GRANTABLE_CAPABILITIES so the take-back governs it. `lib/dream-team-runway.ts`
  is the pure core: `nextRunwaySlot` (next clinic-local 10 AM >=12h out) +
  `RUNWAY_CAPABILITIES`/`stagesOnRunway` single-homing which lanes stage.
  The MACHINE's own yes to a social post now stages instead of firing
  (decideAndExecute computes the slot only for `actor.kind==='auto'`; a human
  approve stays immediate — a person just said go), and narrates the queue
  honestly ("Queued … going out <when>, with a Stop … until then") while
  suppressing social-posts' own hand-off ledger entry so one staged post
  narrates ONCE. content_plan needed no staging rule: it schedules every
  piece by construction. `lib/services/dream-team.ts` reads the unified
  runway (scheduled social + scheduled blog, batched destinations) +
  `countRunway` for the strip; `runway-section.tsx` renders "Going out soon"
  with per-row Stop (social confirms — the draft is discarded; blog returns
  to drafts), routed through the OWNING services via one server action. The
  summons strip gains a staged-count line and a quiet queue-only variant.
  The Approval Inbox's granted-card copy branches on `stagesOnRunway` so a
  staged lane never repeats the old "within the hour" false promise.
  Registry pins in spine/autonomy-service/proposals-service updated to the
  new defaults; new suites cover the slot math and the runway UI.
- **2026-08-23 — D5**: SANDMAN v1 — the chief of staff, in conversation.
  `lib/sandman.ts` (pure): the aggregates-only `SandmanSnapshot`, its
  model-legible render, the prompt builder, the tolerant parser, and a CLOSED
  action registry that is NAVIGATIONS BY CONSTRUCTION (every def is
  {kind,label,href,when} — there is no mutation shape to abuse, so a misread
  "email everyone" cannot fire). `lib/services/sandman.ts` builds the snapshot
  from the clinic's own services with a per-read catch (an answer from the numbers
  we could get beats an error, and a gap is REPORTED rather than rendered as a
  zero we didn't measure), meters under `sandman_chat` (cap 300/mo, shared
  ai_usage_counter), and degrades honestly when AI is off or the cap is hit.
  The prompt's laws: correlation never dressed as cause, never discuss an
  individual patient, never claim to have acted. `sandman-panel.tsx` is the
  conversation on /dream-team (opening questions a front desk actually has,
  last-6-turn history, suggestions render as LINKS resolved server-side from
  the registry). Tests pin the privacy shape, the history clamp, the
  invented-kind drop, and the panel's thread behaviour.
- **2026-08-23 — D6**: GOALS — "tell the team what you want more of." Migration
  0151 adds the `goal` table (objective, optional serviceFocus, status,
  baselineNewPatients/baselineAt, isDemo). `lib/goals.ts` is the pure core:
  `validateObjective` (one line, `OBJECTIVE_MAX` 120 — a goal, not a plan),
  `MAX_ACTIVE_GOALS` = 3 (a team pointed everywhere is pointed nowhere, and
  every generator's context pays per goal), `goalPromptLine` — the ANCESTRY
  LINE borrowed from Paperclip, deliberately a SUGGESTION so a goal can never
  override a generator's own laws (never invent a service/offer/price/
  credential, and "a good general piece beats a strained one"), returning `''`
  with no goals so the no-goal path is BYTE-IDENTICAL to today's prompts — and
  `goalProgressLine`, which states patients SEATED since the goal was set and
  never says the goal caused them. `lib/services/goals.ts` adds
  `goalPromptLineFor` (the hot path — never throws, because a failed goal read
  should cost a tick its flavor, never its work), `seatedSince` (the journey
  law: seated, never booked), and create/status writers; RESUMING RE-BASELINES
  so a goal paused for a month can't resume and claim the patients seated
  while it slept. Threaded into the social-post and content-plan prompts.
  `goals-section.tsx` on /dream-team is a REPORT with one input — no dates, no
  milestones, no task tree, which would be a queue of work wearing a goal's
  clothes. LEDGER VOCABULARY: setting/pausing/reaching a goal is an
  instruction the HUMAN gave, so `goalChange` joins `NOT_WORK_MARKERS` (a
  clinic's own typing must not inflate the machine's week) — and because it
  carries a VALUE rather than `true`, both `hasMarker` and its SQL twin in
  action-ledger learned a `PRESENCE_MARKERS` set, keeping the JS and SQL
  predicates generated from the one list. The whole-DOM overview suite now
  renders through the same ToastProvider/ConfirmProvider the shell gives a
  real page: rendering bare made any child calling `useToast()` throw, which
  said "the test forgot a wrapper", not "the UI is broken".
- **2026-08-23 — D7a**: THE PAGE'S SHAPE. Five slices had each added a section
  with its own heading, so a long scroll read as five unrelated widgets in a
  column. Three fixes. (1) `section-heading.tsx` — one rhythm: same size,
  same weight, same hint placement, one optional count that always rides the
  numeral face; anchors live on the `<section>`, which owns the scroll
  offset. (2) `team-status-band.tsx` — the OPENING BEAT. The page used to
  open straight onto a demanding surface (the sign-here stack) or, on a calm
  day, onto nothing much; neither answers the question a person arrives with,
  *is anything happening?* The band answers in one glance — waiting on you /
  going out soon / handled last week, plus what the team is pointed at — with
  the moon, a live dot, and the chrome-zone wash + floating bubbles the
  design system allows in a header zone and nowhere below. Its laws: every
  number REAL, zero said plainly, and a number with nowhere to go stays plain
  text (only two of the three have a section to land on, and a dead link
  reads as a broken page). (3) Order: work-in-flight (the stack, then the
  runway) before the about-the-team half (goals, Sandman, roster) — the
  runway belongs beside the stack, not after the goals. Plus the v3 surface
  sweep this surface had missed: the retired etched-ring card recipe replaced
  with `.v2-card`/`.v2-card-interactive` on the Overview summons strip, the
  goals empty state and the calm-desk card; counts moved to the numeral face;
  the roster's weekly number promoted from mid-sentence to a scannable stat;
  Sandman's thread given a FLOOR as well as a ceiling (an empty panel three
  lines tall reads as a broken widget, not an invitation) and its opening
  line given the same moon that answers. The calm-desk card stopped repeating
  the band's sentence and now explains what the team is doing instead.
- **2026-08-23 — D7b**: THE CARD ITSELF — the owner's original question. Four
  changes, each closing a gap the sign-here shape had left. (1) THE PILE,
  MADE VISIBLE: the whole surface is "the employee hands you one paper at a
  time", and the pile behind that paper existed only as a counter — two
  decorative sheets now peek from under the focused card (painted BEFORE it
  so DOM order, not a z-index fight, keeps the card on top; the focused
  wrapper had to become positioned, since a static card paints under
  positioned siblings). (2) THE DOT, IN WORDS: the queue rail marked a
  soon-to-retire card with a tone dot, which is not self-labelling — and
  whether skipping costs you the card is exactly what a person needs before
  they skip. `expiryDayLabel` (pure, day-granular, takes two day KEYS so the
  caller owns the timezone) is computed SERVER-side in the CLINIC's day —
  a client clock would hydrate differently, and a card expiring at 11 PM
  Central is still "today" for that practice. It stays silent past six days,
  because a countdown that never moves is noise, and degrades to silence on
  junk rather than rendering NaN at a person. The line carries its own
  reassurance: skipping keeps it here until then. (3) The arrow-key path
  through the stack has worked since the stack shipped and nothing said so —
  one `←/→` hint in the rail, hidden on touch where it would be a lie.
  (4) Room to read: the focal card went `p-4` → `p-5`, and the last two
  retired etched-ring surfaces (the completion note, the calm-desk card)
  moved to the floating-card recipe.
- **2026-08-23 — D7c**: THE DEMO + THE GOAL'S SERVICE. (1) `seedDemoGoal` gives
  the demo clinic one active goal ("more implant patients", focused on their
  dental-implants service) baselined three weeks back, so /dream-team opens on
  a practice that has POINTED its team somewhere: the goals section's
  populated state, the status band's "pointed at your goal" line, and the
  ancestry line the generators read. Seed-if-absent, `isDemo`-marked, and it
  never overwrites a goal a person typed in the demo. (2) THE SERVICE,
  UNDERSTOOD RATHER THAN ASKED FOR: `serviceFocus` had no way to be filled
  except by the seeder, and adding a dropdown would be the tool asking the
  employee to operate it — "more implant patients" is ALREADY the answer to
  "which service?". `matchServiceFocus` (pure) matches what a person typed
  against the practice's OWN service list, so a match can only be a service
  they actually offer; it folds plurals, refuses generic words ("dental care"
  describes almost everything a practice does), prefers the more specific
  service, and returns null rather than guessing. `deriveServiceFocus` is
  best-effort by construction — an unreadable profile costs the goal its
  focus, never its existence. (3) The loading skeleton now matches the page
  it precedes, band included; a skeleton that doesn't is a small lie the
  layout tells right before it jumps.
- **2026-08-23 — D7d**: CYCLES — the heartbeat, by its owner-given name.
  "The team is on the clock" was decoration until a person could see the
  clock ticking. Migration 0152 adds `clinic_profile.dream_team_cycle_at`,
  stamped at the END of every hourly generator pass for that clinic —
  whether or not the pass produced anything, because a quiet cycle is still
  a cycle. Best-effort by construction and nothing branches on it: a failed
  stamp costs a sentence, never a piece of work. Pure `cycleLabel` reads it
  COARSELY (the pass is hourly, so minute-precision would imply a resolution
  the machine doesn't have), returns "just now" for a future stamp rather
  than rendering negative arithmetic at a person, and returns null with no
  stamp — where the band says the first cycle hasn't run yet instead of
  implying one has. The wording deliberately avoids "within the hour",
  which the granted-card copy owns and the send-window test asserts absent.
  The demo org is excluded from every cron, so its heartbeat would read
  "hasn't run yet" forever — a true sentence about the demo that tells a lie
  about the product — and the resync stamps it ~20 minutes back on every
  deploy.
- **2026-08-23 — D8**: SANDMAN CAN PUT THE TEAM TO WORK — the owner's "and
  then be able to initiate or schedule a task", built so it cannot become the
  thing that scares you. A second CLOSED registry (`SANDMAN_REQUESTS`) sits
  beside the navigation one, and it is safe for exactly one reason: **a
  request runs an EXISTING generator now, and every generator's output is a
  DRAFT that lands in the sign-here stack needing a human yes.** Sandman
  cannot shorten the approval path, only start the work that fills it. The
  wire carries a KIND and nothing else — no content, no audience, no
  recipient — so there is nothing in a request for a bad answer to steer, and
  the button's LABEL comes from the registry rather than the model, because
  the label is a promise about what pressing it does. Four requests:
  draft_social · plan_month · recall_campaign · fill_week. Because the
  generators keep all their own guards (stand-downs, `sourceKey` dedupe,
  skip-when-AI-is-off), a second tap cannot mint a second card and a tap at a
  bad moment mints none — which is why "nothing to draft" is a NORMAL outcome
  and gets its own honest line per request ("next week looks well booked" is
  good news, not a failure; a shared "nothing to do" would have read as one).
  In the panel a request is a BUTTON, not a link — it starts something rather
  than going somewhere — it can be pressed once (the answer becomes a record,
  not a repeatable offer), the caption states the draft-only law where the
  finger is, and a success refreshes the page so the card the person just
  asked for is actually there.
- **2026-08-23 — D9**: THE FIRST VISIT, and the small honesties. (1) "Nothing
  needs you right now" is TRUE on day one and reads as "this page is empty" —
  the wrong first impression of the flagship surface. When no cycle has run
  yet the band says the team is settling in instead, and the calm-desk card
  points at the roster ("Meet the team ↓"), because the first thing a new
  practice should see is who they hired. (2) The band's live dot runs
  FOREVER, unlike a transient loading pulse, so it is the one animation here
  that needs `motion-safe`. (3) The band is a landmark and now has a name for
  anyone navigating by region. (4) The roster's "waiting on you" pill states
  a fact about work that is elsewhere ON THIS PAGE — making it a link is not
  a switch (the roster stays a report), it is the difference between naming a
  thing and being able to reach it.
- **2026-08-23 — D10 (bookkeeping)**: CLAUDE.md gains the Dream Team module
  row, the 0151/0152 migration entries, and an open-items block pointing the
  next session at this doc BEFORE it touches /dream-team, the proposal spine,
  the ladder, goals or Sandman. Also corrected a now-stale comment in the
  demo's voice seeder: `social_post: 'auto'` there used to stage a CHOICE and
  now pins a state, since D4 made it the platform default — the demo still
  shows a real clinic's day-one screens, and the ladder itself is
  demonstrated by the ask-first review card's earned-trust nudge. The
  explicit line stays on purpose: a reset must produce ONE known state, and
  inheriting a default would make the demo's baseline move the next time a
  default does.
- **2026-08-23 — D11 (the main-loop self-sweep)**: two real defects, found by
  walking the new code against the standing checklist rather than by an audit
  fleet. (1) **`seatedSince` counted the wrong population.** The goal card
  promises patients SEATED since the goal was set, but the query counted
  every row with a `firstSeenAt` in the window — so a practice that connects
  their PMS the week after setting a goal would have opened the card to
  "1,800 new patients seated in the last 3 days", precisely the claim the
  card's own caption promises it is not making. It now uses the SAME
  acquisition semantics as Analytics and the Overview tile: archived
  excluded, bulk backfills excluded via the single-homed
  `BACKFILL_PATIENT_SOURCES` (a source-scan guard fails CI if a local copy of
  that list ever appears here). (2) **Sandman's two actions had no billing
  wall.** The dashboard shell hides /dream-team from a shut-down clinic, and
  a hidden UI is not a gate — both actions are reachable by any signed-in
  user who can POST, and both either spend the practice's AI budget or start
  real work for an engine the crons already refuse to run. Both now check
  `isClinicShutDown` server-side, and `tests/journey/dream-team-actions.test.ts`
  pins that plus the tenant/role/closed-registry refusals.
- **2026-08-23 — D12 (self-sweep round 2)**: WHO DECIDED THIS. The day-0
  ruling made two lanes `auto` out of the box, but every line of ladder copy
  was written when `auto` could only mean somebody had ticked a box — so on a
  clinic's FIRST day the granted card opened with "You've handed these to me",
  describing an action they never took. The ladder's whole credibility rests
  on never mis-describing consent, so `TrustGrantView` grew `explicit` (only a
  stored 'auto' is a choice they made; a resolved level cannot tell the two
  apart), the card's opening clause branches on it, and the rest of the
  sentence — the send-window / runway / third-exit variants — is untouched.
  The grants strip's "nothing YET" vs "nothing this past week" heuristic had
  the same blind spot: it keyed on `grantedAt`, which a default lane never
  has, so it silently fell to the wrong line for every new clinic. An undated
  DEFAULT lane is exactly as old as the practice, so it counts as fresh while
  the team has never run a cycle (D7d's heartbeat, threaded down as
  `teamHasRun`). Also fixed here: Sandman's request buttons shared the ask's
  transition, so they rendered DISABLED for the tail of the very answer that
  produced them — a button that appears and can't be pressed reads as broken,
  and it showed up as a flaky panel test under load, which was the same fact
  in a second place. Requests now have their own transition and their own
  "Putting them to work…" indicator.
- **2026-08-23 — D13 (self-sweep round 3, and it left the Dream Team)**: FIVE
  INVISIBLE COLOURS. `bg-[color:var(--color-primary)] text-white` on a token
  nobody ever defined does not fail, does not warn, and does not fall back —
  CSS drops the declaration, the element keeps whatever is behind it, and the
  white text lands on that. Types can't see it, the build can't see it, and no
  test asserting on text can see it. Five were live at once, all spelling a
  brand token that had never existed: the approval card's EMAIL ARTIFACT
  painted its "Book a time" button with it (a `sky` fallback, a hue v3
  retired — so the artifact showed a small blue pill for a button that
  arrives as a wide near-black block, breaking the one promise these
  previews make: *look at the work as it will exist*), the social preview's
  avatar, the SELECTED star-threshold segment in review settings (an
  invisible selected state), the PRIMARY outcome button in Call Mode (an
  invisible button in the owner's most-used cockpit), and the identity
  swatch for a clinic with no brand colour. All five fixed, the email
  artifact now mirroring `authEmailShell`'s real recipe with the constant
  single-homed beside the preview. `tests/a11y/css-var-definitions.test.ts`
  is the new guard: every `var(--token)` under app/ components/ lib/ must be
  defined in the stylesheet or listed as runtime-provided WITH A REASON (the
  public sites' `--c-*` palette, the site fonts, Tailwind's own theme
  colours), and it strips comments first so prose describing the bug isn't
  read as the bug.
- **2026-08-23 — D14 (the retired hues, finally)**: v3 kept six semantic tones
  and dropped `sky` and `stone`; they were cleaned out module by module and
  each pass left a handful behind, which is how a design system dies — not by
  a decision, by attrition. The last of them: an "In the waiting room" status,
  the order/invoice/customer identifiers (now the brand link hue), a kanban
  column, the approval card's photo link (an action → teal) and its
  earned-trust nudge (informational → violet), the plan-mix bar (a CHART, so
  it rides the validated `--color-chart-*` tokens), the Stripe integration
  accent (whose real brand is violet anyway, so the fix corrected two things
  at once), the Gmail "Updates" category, and every neutral in the three
  SHARED editor primitives (editor-kit, image-uploader, focal-point-picker —
  62 classes). The avatar rotations were considered for an exemption and did
  not need one: identity hues can be blue. That leaves exactly ONE deliberate
  use, the Search-appearance preview, which borrows Google's own link blue
  for the same reason the email artifact borrows the email's button — and
  `tests/a11y/retired-tones.test.ts` makes the allowlist keep earning itself.
- **2026-08-23 — D15**: THE REGISTRIES WERE ON THE RETIRED RAMP TOO. D14 swept
  the screens; the two shared registries that hand colours to everything else
  still carried it. `lib/ui/encodings.ts` — the single home for meaning-colours
  — painted the "quiet" aging tier in stone (quiet is the NEUTRAL tone by
  definition, so gray was always the right answer), and
  `lib/types/patient-tags.ts` offered `sky` as a pickable tag colour, which
  would have re-seeded the retired ramp into every clinic's own labels. A
  registry matters more than any one screen because it re-supplies the hue
  everywhere it is read. The tag key moves to `blue`; `coerceTagColor`
  already sends any stored value that is no longer in the list to gray, so
  the swap degrades safely rather than throwing an undefined class at a chip.
  The guard's scope now includes both registries.
- **2026-08-23 — D16**: THE GUARDIAN NOW WATCHES THE HEARTBEAT (closes open
  item 5 of the certificate). Cycles was a report with one reader: if the
  generator cron stopped reaching a clinic, the stamp froze, the band quietly
  aged, and the only thing that would eventually notice was the `silent`
  rule's FOURTEEN EMPTY DAYS. `EngineSignals.hoursSinceCycle` (read off the
  row the sweep already selects — no extra query) now feeds a rule that reads
  FIRST in `classify`, on the same logic that put failures ahead of silence:
  lead with the fact that EXPLAINS the others. A clinic the pass never
  reaches produces no work AND files no new failures, so both older rules
  would have sent Dream Create hunting clinic-side for a cause that is
  entirely ours.
  Four things make it safe. **The sweep's eligibility set was already
  exactly right** — it excludes demo orgs and billing-walled clinics, which
  are the only two cases where a stale stamp is correct by design, so no new
  filter was needed. **NULL says nothing**: the column shipped in 0152, so
  every clinic reads null until their first pass after that deploy, and
  reading absence as death would have alarmed on the whole platform that
  morning; a permanently dead engine is still caught by the rule that caught
  it before. **The threshold is a full day**, because the cron ticks hourly
  (one missed tick is a deploy) and the sweep runs daily (anything under 24h
  would fire or not depending on where the sweep landed relative to the last
  tick — an alarm whose meaning depends on the observer's clock is not an
  alarm). And it stays with **Dream Create at every audience setting**:
  `silent` is already excluded from `clinicActionable`, because a cron that
  is not running is never a thing a practice can fix.
  The new `cause: 'no_cycle'` rides the existing `problemKey` machinery, so
  a clinic moving between ordinary silence and a stopped pass reads as news
  rather than "the same problem" — and the all-clear got a `PROBLEM_IN_WORDS`
  lookup so a recovery says "the hourly pass never reaching them" instead of
  the state word, which would have described the wrong thing the owner had
  been chasing.
- **2026-08-23 — D17 (the next silent class: server-rendered times)**. Prod
  runs in UTC and clinics do not. CLAUDE.md states the law and
  `lib/format-datetime.ts` exists so a call site cannot forget — but nothing
  stopped a NEW page from declaring its own two-line `fmtDate` with no zone
  at all, which is how four of them ended up in the tree at once: the intake
  forms list, an intake form's submissions, online payments, and the blog
  manager. Each rendered a date in the SERVER's calendar, so anything that
  happened after ~7 PM Central showed the wrong day. All four now go through
  a new `formatClinicDate(date, timeZone)` — the plain-date shape the module
  was missing, which is exactly why everyone kept re-inventing it — with the
  zone resolved once per page. The analytics trend charts' bucket labels got
  the same treatment (`weeklyTrend` gained an optional zone; every product
  caller passes one).
  TWO SITES WERE ALREADY RIGHT AND LOOK WRONG, so they got comments rather
  than changes: a follow-up's due label and the website traffic axis both
  parse a Y-M-D CALENDAR date as a local midnight and render it in that same
  zone, so the two agree — passing a clinic zone there would reinterpret the
  midnight as an instant and render the day BEFORE. Without the comment the
  next timezone sweep "fixes" them into being wrong.
  `tests/timezone/server-render-tz.test.ts` is the guard, and its SCOPE is
  the interesting part: provably-server files only (page/layout/route without
  a 'use client' banner, plus `lib/services/**`). A component file without
  the banner proves nothing — it may be imported by a client component and
  run in the browser, where the viewer's own zone is the right answer for
  staff. Guessing there would have flagged the inbox's patient card, which is
  correct, and a noisy guard earns an allowlist entry instead of a fix. It
  also resolves options objects passed by NAME (`{ ...dayOpts }` carries a
  zone as surely as an inline literal), which is what keeps the appointments
  agenda — correct all along — off the list. The allowlist is six platform
  and partner surfaces where no clinic clock applies, each with its reason,
  and a second test makes every entry keep earning it. Verified by breaking a
  fixed page on purpose and watching the guard fail.
- **2026-08-23 — D18**: TWO INVARIANTS — one enforced, one recorded.
  (1) THE DEPLOY PIPELINE, recorded in docs/RELEASE.md's ledger rather than
  changed. Checking deploy health turned up three failures in the last ten
  `main` runs, in two shapes: two short ones (the documented CodeBuild
  provisioning flake) and two that ran a FULL build and failed at the end,
  each created while the previous deploy was still running — and both of
  those commits were docs-only, so the diff cannot be the cause. The
  mechanism is that `deploy.yml` uploads `git archive HEAD` to a FIXED S3
  key and starts a build with no source override, so a build reads whatever
  is at that key right now. The GitHub `concurrency` group serialises the
  RUNS but nothing ties a BUILD to the commit that triggered it. The failure
  we saw is the benign direction; the other direction is a deploy that ships
  the wrong commit and reports success. NOT FIXED HERE ON PURPOSE: the fix
  changes the deploy path, it cannot be verified from a session with no AWS
  CLI, and a wrong guess breaks every deploy — so it is written up with its
  evidence and its fix shape and left for a session that can test it.
  (2) `tests/guards/server-only-services.test.ts` freezes a convention that
  holds at 193 of 196 modules — which is exactly when freezing is worth it,
  since erosion happens one new file at a time and nobody reviewing that file
  has the other 195 in their head. `import 'server-only'` is what makes a
  client component importing a service a BUILD ERROR rather than a bundle
  that ships database code to a browser. The three exceptions are reasoned
  (two are pure data; the third is a barrel, whose protection is transitive
  because the modules it re-exports carry their own banners), and a second
  test voids any exemption whose file ever reaches for the database. Both
  guards were verified the same way as the last two: by introducing a real
  violation and watching them fail.
