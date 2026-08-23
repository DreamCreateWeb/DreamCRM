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
