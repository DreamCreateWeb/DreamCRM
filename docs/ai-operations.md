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
