# THE FIRST WEEK — every feature has a front door

Owner directive (2026-10-05): "every clinic I've signed up, they've been
lost and I've been lost along with them. The app is really cool and really
powerful, but right now it feels like a thing that exists, not a tool for
the clinic to dive into." And on the setup call as it has actually run:
"sign up here, now look at this neat feature, it can do these things, and
this feature does these cool things, alright have a great day."

This doc is the program's memory: the diagnosis, the doctrine, the setup
call, the activation events, the per-module inventory, the platform
cockpit, and the build order. It sits beside `docs/RELEASE.md` (the beta →
1.0 program) and `docs/ai-operations.md` (the Dream Team lane) as the
third program of record. The feature freeze still holds for new
capabilities; this program adds no capability. It adds the DOORS.

---

## Part 0 — The diagnosis (what the code says, 2026-10-05)

The product is a toolbox, and a toolbox is not a job. A new clinic opens
the dashboard, meets sixteen sidebar entries of equal weight, and nothing
tells them which to open or why to come back tomorrow. Measured:

- **65 empty states in `app/(default)`, 1 with an action.** Every module
  is on and empty on day one, so every page is an empty room, and 64 of
  the rooms have no door.
- **The texting door is closed by its own honesty rule.** The catalog card
  for SMS is hard-coded `availability: 'coming_soon'` → "Coming soon" +
  notify-me, no link. The registration form at `/integrations/sms` exists
  and `SMS_DRIVER=aws` is live. CLAUDE.md says the catalog flips "LAST,
  after the first real carrier registration" — which no clinic can start,
  because the door is closed. Circular.
- **The PMS door reads as "nothing works yet".** NexHealth is
  `request_access` (the August ruling: the platform binds it), and
  Dentrix / Eaglesoft / Curve are roadmap tiles with notify-me. The real
  bridge is live and has synced real practices; a clinic cannot tell.
- **Intake forms open on a seeded document, not a walkthrough.** First run:
  "click New Form — we'll seed the standard template". Nothing says what
  to collect, how a patient receives it, or how to turn on auto-send.
- **Only two features have a true "set up, then it is on" moment:** the
  website go-live lever (0147) and, since this week, insurance (0169/0170).
  Fifteen module hints exist and EXPLAIN; four setup cards exist (hours,
  chairs, booking mode, texting) and ASK; neither turns anything on.
- **The platform cannot see any of this.** The clinics list shows plan,
  status, MRR, patients, projects, joined. Not what is connected, not what
  the machine has done, not when staff last signed in, not what is stuck.

Why it happened: the app was built feature-first as pages that assume a
configured practice; setup was the platform's job through managed
provisioning; the North Star (rightly) refused "pages to operate" and so
never built activation; two honesty rules (texting last, PMS
platform-binds) are correct about never lying and still leave a closed
door with no "start here"; and the release program audited correctness,
journeys and copy without ever asking "how does a clinic turn this on".

---

## Part 1 — The doctrine

**The employee's first week.** DESIGN.md's North Star says the product is
the employee, not the tool. An employee's first week has a shape: they
learn what you want, they get the keys to the systems, they do one visible
thing, and they tell you about it the next morning. The dashboard's first
week has none of that shape. This program gives it one.

**Every feature has a front door.** The insurance intro is the pattern and
the only pattern: what it does (three lines), what to know (three lines,
honest — money, labels, where data goes), ONE button, the one or two
things we need from the practice, then it is on. While something external
is pending (carriers reviewing, the platform binding a PMS) the door says
so with a date-shaped status, never "coming soon".

**Five doors, not twenty-five.** A feature is OFF until the practice
chooses it. The sidebar carries what is on. A clinic grows the app around
itself; a clinic handed all of it at once feels like it is ours.

The seven laws:

1. **OFF until chosen.** Every module except the day-one six (Overview,
   Dream Team, Messages, Appointments, Patients, Settings) is behind a
   switch, with the intro card as its first screen. (Dream Team joined
   the day-one set in S3: its sign-here stack is where the day-0 setup
   asks land, and a door behind a door is a hallway. Website's go-live
   lever is its own switch; Integrations is the front door itself.) The switch is one column per
   feature on `clinic_profile` (`*_enabled_at`, the 0169 shape) — not a
   jsonb bag, so a backfill is one statement and a test can name it.
2. **One button.** The intro has one primary. "Enable and set up" opens
   the setup beneath it; the setup asks only for what the feature cannot
   run without; "Turn on X" flips the switch. Owners and admins turn
   things on; members read who can.
3. **Honest while pending.** A door that depends on something outside the
   practice (carriers, a platform bind, a BAA) shows the real state in the
   feature's own words with the next step named, and says who is working
   on it. "Coming soon" is retired from the dashboard; the two live
   switches that still say it (the SMS catalog card, the messages
   composer option) are the first to change.
4. **Every empty state carries a door.** One sentence and one button. The
   button is the feature's own first action, or the intro of the feature
   that would fill the room.
5. **The machine fires on day one.** Connecting data (PMS, CSV, Google) runs
   the generators immediately for that org, so the first win appears while
   the owner is still on the setup call — never "wait for the hourly cron".
6. **The morning after is the product.** The digest on day two must say
   what happened and name one thing to do, even for a thin clinic. If it
   has nothing to say, it says what it is waiting on.
7. **Activation is measured.** Five events per clinic (Part 3), time to
   each, visible to the platform. A program with no number is a mood.

What this program is NOT: a checklist. The onboarding research
(docs/onboarding-overhaul.md) puts checklist completion medians near 10%.
The first week is a conversation the machine starts and a set of doors,
not a list the clinic is asked to clear.

---

## Part 2 — The setup call (the product for the next ten signups)

Nobody in dental does self-serve onboarding; the competitors do a setup
call. With the clinics we have, a thirty-minute call IS the onboarding,
and the app's job is to make that call fast and leave the clinic with its
first win. Four beats, and the word "feature" is never said.

1. **Ask what they want more of (5 min).** "More new patients", "fewer
   no-shows", "people stop ghosting on recall", "a website that isn't
   embarrassing". It becomes their goal (the `goal` table already stores
   it and flavours every generator). It decides which ONE door you open
   next. You open one.
2. **Connect the thing that makes the machine real (10 min).** The PMS
   bridge if supported, a patient CSV if not, Google Business Profile
   always. This is the step the tour skipped, and why every later feature
   looked like an empty room.
3. **Produce one win while they watch (10 min).** With patients loaded,
   the recall engine shows "38 overdue and reachable" and you send the
   first invitation together; or the listing check finds the broken
   website button on their Google profile and you fix it in front of
   them. They leave with something that happened.
4. **Set the daily habit (5 min).** Turn on the morning digest to the
   person who opens the desk. The one sentence: "Tomorrow morning this
   will email you what it did overnight and the two things that need you.
   That email is the app."

Everything else stays OFF until a Tuesday when they say "can it do X".
Then one switch.

---

## Part 3 — Activation events and the first thirty days

The five events, stamped per clinic the first time each happens:

| # | Event | Source of truth (today) |
|---|---|---|
| A1 | **Data connected** — PMS bound, or ≥ 25 patients imported, or GBP connected | `pms_connection`, `patient` count, `clinic_integration` (gbp) |
| A2 | **First message sent** to a patient (any channel, any sender incl. the machine) | `campaign_events` / messages / reminder log |
| A3 | **First booking** through the site, portal, or the machine's recall link | `appointment.source` |
| A4 | **First review ask** that went out | review request log |
| A5 | **First form submitted** by a patient | `form_submission` |

Time-to-A1 is the number this program lives or dies on; a clinic without
A1 inside 48 hours is stuck by definition. The first thirty days, as the
clinic should experience them:

- **Day 0 (the call):** goal set · A1 · one win · digest on.
- **Day 1:** the digest arrives with what the machine did overnight and
  one thing to do. The Overview shows the sign-here stack with 1–3 cards.
- **Day 7:** the Monday standup says the week in plural nouns. One more
  door has been opened by the clinic on their own (A2 or A3 happened).
- **Day 30:** A1–A3 done; the clinic has opened ≥ 3 doors; the platform
  cockpit shows nothing stuck.

Stuck flags (the cockpit's reasons to call): no A1 by day 2 · no staff
sign-in for 7 days · machine did nothing for 7 days with data connected ·
a sign-here card waiting more than 3 days · a door pending on US (PMS
bind, SMS carrier) for more than 5 days · the morning email still OFF on
day 1 (S7 — law 6 rides the digest, and the call's fourth beat was
skipped).

---

## Part 4 — The module inventory (every door, today → target)

| Module | Door today | Switch | "On" needs | Day-one win it can produce |
|---|---|---|---|---|
| Overview | always on | day-one five | — | the sign-here stack + the summons strip |
| Messages | always on; composer says "SMS (coming soon)" | day-one five | — | the first inbound reply threads |
| Appointments | always on; empty until data | day-one five | — | tomorrow's schedule from the PMS |
| Patients | always on; empty until data | day-one five | — | A1 |
| Settings | always on | day-one five | — | — |
| Dream Team | day-one six (S3 ruling: the setup asks live here) | — | a goal | the first proposal |
| My Day | **switch (S3)** — generic intro; opens at A1 | done | — | today's follow-ups |
| Follow-ups | **switch (S3)** — generic intro; opens at A1 | done | — | the auto rules' first cards |
| Inquiries | **switch (S3)** — generic intro; opens when the site goes live | done | — | the first inquiry |
| Intake Forms | **DONE (S5)** — its own door: pick what to collect (the standard template's sections, the basics always), see the questions, how patients get it (the true sentence), one button that builds the form + turns on | done | — | A5 |
| Insurance | **intro + switch (shipped)** | done | NPI (live) | a benefits card |
| Growth | **DONE (S5)** — its own door: the facts the first win needs with a door each (patients loaded → PMS / CSV, Google → Integrations) and the live "N due and reachable" | done | nothing to turn on; the facts say what the win needs | "38 overdue and reachable" |
| Website | go-live lever (shipped) | done (the lever IS the switch) | hours, brand | the site is live |
| Payments | **DONE (S5)** — its own door over the existing connect: where Stripe stands (connected / finish in Stripe / not connected with the real link, which now returns to Payments) and one button | done | Stripe Connect (allowed to turn on first) | first pay link |
| Shop | **switch (S3)** — generic intro; same rule | **intro with setup (S5)** | Stripe Connect, one product | — (never day one) |
| Integrations | catalog; SMS "coming soon", PMS "request access", roadmap tiles | **the hub itself is the front door** | — | A1 |

Every empty room inside those modules (S6, 2026-10-06): the `<EmptyState>`
cards that used to end in a sentence now end in a BUTTON — the feature's own
first action (Book a visit, Start a campaign, Sync now, Compose a post, Add
a code, New plan) or the door to the feature that fills the room (Send a
form, Send a review request, Invite patients to the portal, Open the
pipeline, Add a clinic). The filter variants ("Nothing in this view") get a
Clear-filters button, which is the honest door for an emptiness the viewer
made. Eleven stand without a button on purpose — all-clear states ("Every
patient is square", "No subscriptions need attention"), the right-hand pane
of a two-pane surface before a row is picked, the "No messages yet" that
sits directly above the composer, the feedback inbox that fills from
clinics' own submissions, and one defensive branch the static catalog can
never reach — each named with its reason in the guard.

The integrations catalog, specifically:

| Card | Today | Target |
|---|---|---|
| Text messaging | **DONE (S4)** — `live`, "Set up texting" → `/integrations/sms`; the card carries the registration state in its own words ("Carriers reviewing") while pending | the catalog flipped the day a clinic can START, not the day one finishes; an installation with no driver says "not enabled" |
| NexHealth (Open Dental, Dentrix + more) | **DONE (S4)** — `live`, "Connect" → `/integrations/pms`, the intro + ONE form (system, practice name as it knows it, contact, best time, notes) → "We're connecting it — you'll hear from Dustin within a day"; the request posts into the clinic's support thread and the cockpit shows it as pending on us | the bind stays platform-side; `pms_connect_request` (0173) is the receipt, the connection row the truth |
| Dentrix desktop / Eaglesoft / Curve | **DONE (S4)** — folded under the bridge card (they ARE reached, through the bridge); `pms_interest` stays as history for the platform's demand panel | — |
| Google Business Profile, socials, Gmail, Stripe | **DONE (S5)** — each card carries a "what to know" line while not connected (`IntegrationDef.know`: Stripe's fees and payouts, where Gmail lands, Google reads-only) beside its sentence, note and ONE button | — |

---

## Part 5 — The platform cockpit: "First week"

A platform page, `/platform/first-week`, one row per clinic (demo excluded
by default, togglable), sorted stuck-first then newest:

- **Day N** since the org was created, with the trial state.
- **Goal** in their words, or "not set".
- **Connected:** PMS · patients (count) · Google · Gmail · Stripe · texting
  (registration state) — the readiness resolver's facts, graded.
- **Doors open:** which switches are on.
- **The machine, last 7 days:** work entries (the ledger's `workOnly`), open
  sign-here cards and the oldest's age.
- **Last staff sign-in** (the newest session of any non-patient member).
- **Activation:** A1–A5 with dates.
- **Stuck:** the flags from Part 3, each a sentence naming the next move
  ("No data by day 3 — call about the PMS").

It is a REPORT, not a console: the only actions are the ones the clinics
list already has (View as, resend invite). Its job is to make the setup
call and the day-7 check-in possible from one screen. Later: a weekly note
to the owner naming the stuck clinics (the Guardian's cadence, the
Guardian's audience lock).

---

## Part 6 — Build order (one PR per slice; full suite + build each)

| Slice | What | Done when |
|---|---|---|
| **S1** | The platform cockpit (Part 5) | the owner can run a setup call and a day-7 check-in from one screen; activation events A1–A5 derived read-time |
| **S2** | Day-one kick | binding a PMS, importing a CSV, or connecting GBP runs that org's generators immediately; the first card appears within the call |
| **S3** | The switch, generalised — **SHIPPED 2026-10-05** | one column per feature, one registry + one gate, the sidebar shows the day-one six + what is on + "Add"; My Day / Follow-ups open at A1, Inquiries when the site goes live |
| **S4** | Front doors: the integrations hub — **SHIPPED 2026-10-06** | the SMS card opens the form; PMS is a self-serve connect request with an honest status; roadmap tiles fold under it; "coming soon" leaves the dashboard (and a test holds it at zero) |
| **S5** | Front doors: Intake Forms, Growth (recall), Payments — **SHIPPED 2026-10-06** | each gets the intro + setup + on, in the insurance shape, through `FeatureGate`'s `intro` slot |
| **S6** | Every empty state carries a door — **SHIPPED 2026-10-06** | the 50 door-less rooms each have one sentence and one button; the eleven that stand without one are named with a reason, and `tests/activation/empty-state-doors.test.ts` holds the tree there |
| **S7** | The morning after — **SHIPPED 2026-10-06** | the day-two digest for a thin clinic says what happened and names one thing, or says what it waits on; a quiet first week is narrated, never skipped; the cockpit flags a clinic whose morning email is still off |
| **S8** | Activation stamped + measured — **SHIPPED 2026-10-07** | `clinic_profile.activation` carries all five stamps, written once from the rails' own first-times (`reconcileActivation`, at the day-one kick and on the daily tick); the platform Overview shows the cohort's time-to-A1, the 48h share, who is stuck and all five events; the cockpit shows the median time to data |

S1 first because the owner has to be able to SEE before anything else is
worth tuning; S2 because the setup call needs the win on the call; S3
before S4–S6 because the doors need the switch to be one thing.

---

## Part 7 — Build log

- **2026-10-05 — program written.** Diagnosis from the tree (65/1 empty
  states, the circular SMS gate, PMS request-access, intake's seeded
  template), the doctrine and its seven laws, the four-beat setup call,
  the five activation events, the module inventory, the cockpit spec, the
  eight slices. Insurance's intro + switch (0169/0170) is the pattern.
- **2026-10-05 — S1 SHIPPED: the platform cockpit.** `/platform/first-week`
  (platform tenant, "Customers · First week" in the sidebar). Pure
  `lib/first-week.ts` (day arithmetic, `activationProgress`, `stageOf`,
  the STUCK thresholds and `stuckFlags` — each a sentence naming the next
  move, in the order the owner should care) + service
  `lib/services/first-week.ts` (`getFirstWeekBoard`: one row per clinic,
  demo excluded unless `?demo=1`; the readiness resolver's facts in the
  cockpit's order; goal, the ledger's 7-day work count, open cards + the
  oldest's age, the three doors, the SMS state, the newest non-patient
  session as "last staff sign-in", and the five activation events read as
  FIRSTS from the rails that already record them — A1 the earliest of a
  connected PMS, a connected Google profile, or the 25th patient; A2 the
  earliest reminder or campaign send; A3 a booking through us; A4 the
  first review ask sent; A5 the first form in). Best-effort per read: a
  broken read renders as unknown, never as healthy, and never blanks the
  board. Stuck-first ordering; three KPIs (in their first month, stuck,
  no data). A REPORT: the only doors are the clinic's detail page and the
  demo toggle.
- **2026-10-05 — S2 SHIPPED: the day-one kick.** Law 5 is live: when a
  clinic's data arrives, that clinic's generators run NOW. Three hooks —
  the end of a successful PMS import (`runImport`, every trigger), a
  patient CSV import that created rows (`importPatients`), and the Google
  connect sync the moment the profile becomes `connected`
  (`syncConnectedAccounts`) — each call `scheduleKick`, fire-and-forget,
  and `kickOffFirstWeek` (lib/services/day-one-kick.ts) runs the SAME
  per-org pass the hourly cron runs, extracted from the driver as
  `runOrgGeneratorPass` (`makeOrgPass` is the one body behind both callers,
  so generator order, per-step isolation, the one-strike bookkeeping and
  the Cycles heartbeat cannot drift). Clinics only (never the platform org,
  the demo, or a shut-down clinic); throttled on the Dream Team heartbeat
  (`KICK_COOLDOWN_MS` = 15 min, so a two-hourly scheduled sync never
  doubles the AI spend); never throws into the import that called it.
  THE FIRST STAMP: migration 0171 `clinic_profile.activation` jsonb, and
  `stampActivation` (lib/services/activation.ts) writes `a1` ONCE through a
  guarded jsonb merge whose RETURNING row is the atomic "first time?" —
  a connected PMS or Google profile stamps at once, a CSV stamps when the
  roster clears `A1_PATIENT_FLOOR`. The cockpit prefers a stamp over its
  derived read (`mergeActivation`). A2–A5 stayed derived until S8.
- **2026-10-05 — S3 SHIPPED: the switch, generalised.** Law 1 is live
  for every module. Migration 0172 adds seven `*_enabled_at` columns to
  `clinic_profile` (My Day, Follow-ups, Inquiries, Intake Forms, Growth,
  Payments, Shop — Insurance's 0169 column joins the same registry) and
  GRANDFATHERS every existing clinic ON for the five day-to-day modules,
  with Payments + Shop opened only where the payments bundle's own signal
  already showed them, so nobody sees a money page they did not see
  yesterday; new clinics start null everywhere and meet the doors. The
  registry is pure `lib/feature-switches.ts` (key → module → column,
  the intro copy — three lines it does, three to know, never "coming
  soon" — `autoOpen`, `splitModulesBySwitch`); the server half
  `lib/services/feature-switches.ts` reads once per request (React
  `cache`, FAIL-OPEN: a transient read error must not hide pages a
  clinic chose) and opens doors through a `coalesce` so a repeat event
  never moves a stamp and a door closed on purpose stays closed.
  `lib/services/tenant-nav.ts` is THE ONE resolver of the sidebar's list
  — role, then switches, then the bundle gate for un-switched modules —
  and ⌘K reads the same list, so the palette can never offer a page the
  sidebar hides (a switched-off Growth takes its sub-pages with it). THE
  RULE: a module with a switch is gated by its switch alone; "Turn on
  Payments" beats "has Stripe engaged", because the page a clinic just
  asked for must not vanish for want of a Stripe account. The sidebar
  gains the "Add" group — the doors not yet opened, muted, each linking
  to its intro. Each switched module's `layout.tsx` wraps its pages in
  `FeatureGate`: off → the generic intro card (`FeatureIntro`, one
  button for owners/admins, a sentence for members; the section eyebrow
  and the registry's copy); on → the page plus a quiet "Turn off" line
  on the module's ROOT path only (`FeatureFooter`, confirm awaited before
  the transition). Other tenants pass straight through (the platform
  shares the campaign editor under /growth). A1 (the day-one kick) opens
  My Day + Follow-ups; the go-live lever opens Inquiries. Dream Team
  became day-one (law 1 amended): its stack carries the setup asks. The
  demo self-heal opens every door; the e2e seed opens every door for its
  operating practices, so only the stranger journey meets them closed.
  Deliberately NOT done here: the switch never stops the engine — the
  follow-up rules still write cards and the digest still counts for a
  clinic whose Follow-ups door is closed; they are there when it opens.
  S5 replaces the generic intro with a real setup for Intake Forms,
  Growth and Payments by setting `ownIntro` on the registry row.
- **2026-10-06 — S4 SHIPPED: the integrations hub's front doors.** Law 3
  is enforced: `tests/activation/no-coming-soon.test.ts` scans every
  dashboard tree for the phrase in rendered text and holds it at zero
  (the one allowed mention NAMES the public site's pre-live page). The
  catalog changed shape: texting is `live` (the card says "Set up
  texting" and opens the one form; an installation with no SMS driver
  reads "not enabled", never a form that cannot submit), and the PMS
  bridge is `live` with `connectKind: 'pms'` — the four roadmap tiles
  (Dentrix Ascend / desktop, Eaglesoft, Curve) are FOLDED under it,
  because the bridge already reached those systems and a "coming soon"
  tile for them was false. The resolver gained a `pending` state ("started,
  waiting on someone outside the clinic") that beats availability: the
  texting card carries the registration's own words ("Carriers
  reviewing") and the PMS card "We're connecting it", each with a
  See-progress door; bundles say "In progress". THE PMS FRONT DOOR:
  `/integrations/pms` unconnected is the intro (pure `lib/pms-connect.ts`
  — vendors, copy, validator, status sentences) plus ONE form — which
  system, the practice name as it knows it, who to call, when, notes —
  and `submitPmsConnectRequest` (lib/services/pms-connect.ts) stores ONE
  row per clinic (migration 0173 `pms_connect_request`, upsert on the
  org; a re-submit re-opens, a connected one stays connected) and POSTS
  THE REQUEST INTO THE CLINIC'S SUPPORT THREAD as the requester — the
  support rail already alerts every platform admin and lists the clinic
  in Client Messaging, so "you'll hear from Dustin within a day" rides a
  channel he reads rather than a new inbox. A failed post never loses the
  row. The first-week cockpit reads the open request as PENDING ON US
  ("Connecting Eaglesoft", the STUCK clock running from the ask) and
  names it on the row. The other two live switches that said "coming
  soon" changed: the Overview's reviews footnote is a DOOR ("Set up
  texting →", law 4), and the composer's SMS option says the clinic's
  true state ("set up texting first" / "reminders only, for now" — the
  composer's own outbound text is not wired; reminders and campaigns
  text). Channel legend, the audiences toggle, the social add-on card
  ("not for sale yet"), the inbox's Outlook note and the sidebar's dead
  `soon` title lost the phrase too. Carried to S5: a "what to know" line
  on the Gmail / Stripe / Google cards. `pms_interest` (the old notify-me
  demand table) stays as history for the platform Overview's demand
  panel; nothing writes it any more.
- **2026-10-06 — S5 SHIPPED: the doors with real setup.** `FeatureGate`
  grew an `intro` slot: a module's layout hands it the module's OWN door
  and the gate renders that in place of the generic card while the
  switch is off. `components/feature-switch/feature-intro.tsx` split into
  the presentational `IntroShell` (eyebrow, title, lede, does, know, the
  pill, a children slot), `TurnOnButton` (the generic switch, or a door's
  own action returning the same shape) and `AskManager`; the generic
  `FeatureIntro` composes them. THREE DOORS: Intake Forms
  (`app/(default)/intake-forms/intro.tsx` + `intake-intro-card.tsx`) —
  what to collect as the standard template's sections with the basics
  locked on (`intakeSectionChoices` / `pickIntakeSections` in
  lib/types/forms.ts), "See the questions" per section, the TRUE sentence
  about how patients get it (every booking confirmation, new patients the
  full form, the pre-visit reminder chases), and `turnOnIntakeFormsAction`
  builds the first form from the kept sections and flips the switch — a
  clinic with forms on file keeps them and only gets the switch. Growth
  (`app/(default)/growth/intro.tsx` + `growth-intro-card.tsx`) — the
  facts the first win needs with a door each (no patients → the PMS door
  or a CSV; Google not connected → Integrations) and the live "N due and
  reachable" from `getRecallStats`; an unreadable count says so rather
  than showing a zero; nothing is required to turn on. Payments
  (`app/(default)/payments/intro.tsx` + `payments-intro-card.tsx`) — the
  intro over the existing Stripe Connect: connected / finish in Stripe /
  not connected with the real connect link, and the button turns on
  regardless (the hub's own connect card is the next step). The Connect
  OAuth flow learned `?back=` (an allowlist riding the state —
  `resolveConnectBack` in lib/types/shop-connect.ts), so a clinic that connects from the Payments door
  lands back on Payments instead of the Shop. The S4 carry closed:
  `IntegrationDef.know` puts a "what to know" line on the Google, Gmail
  and Stripe cards while not connected. Not done on purpose: no new
  switches, no new columns — the three doors ride S3's columns and S3's
  generic action; Insurance keeps its own page-level intro as before.
- **2026-10-06 — S6 SHIPPED: every empty state carries a door.** The
  inventory re-run found 108 `<EmptyState>` elements across `app/(default)`,
  `app/(double-sidebar)` and `components`, 61 without an `action`. Fifty
  got one: the feature's own first action where the room has one (Book a
  visit → `/appointments?new=1` on the Overview, My Day and the PMS
  write-back table; Start a campaign → `/growth/outreach?new=1` on all four
  recall rooms; the PMS dashboard's "No syncs yet" renders the real
  `SyncNowButton`; "Write your first post" anchors to the composer; the
  coupons room focuses the code box; memberships' "No members yet" switches
  to the Plans tab; the platform's plan panel and project board render
  their own New-plan / New-project modals as the door), or the door to the
  feature that fills it (Send a form → `/intake-forms` under submissions;
  Send a review request under private feedback; Invite patients to the
  portal under online payments; Open the pipeline under communications and
  demos; Add a clinic → `/ecommerce/customers` under every platform room
  that fills with customers). Every "Nothing in this view" / "No X match
  these filters" variant got a Clear-filters button that resets the state
  that emptied it (orders, applicants, subscriptions, feedback, client
  messaging). The team chat's "+ New conversation" grew a labelled form
  (`NewConversationButton label=`) so the empty list's door is a button
  with words, not an icon. Copy that said "use the button above" was
  rewritten to say what the button does — a sentence that points at
  another control is not a door. ELEVEN stand without one, each named
  with its reason in `tests/activation/empty-state-doors.test.ts`: six
  all-clear states, two pane placeholders, one composer-adjacent, one
  room that fills from clinics' own submissions, one defensive branch. The
  guard reads the tree with the TypeScript parser (not the design-system
  tag reader — an apostrophe in a button label inside the `action` braces
  opens a quote that reader never closes), holds every door-less
  `<EmptyState>` to the named list, and fails on a stale entry; it is
  registered in `scripts/review-gate.mjs` as a blocking-assertion class.
  Nothing new is stored and no page is added — the doors ride the routes,
  deep-link params and modals that already exist.
- **2026-10-06 — S7 SHIPPED: the morning after.** The morning digest was a
  to-do list — follow-ups due, visits to confirm, leads — and a clinic with
  none of those got NO email, which is exactly the thin day-two clinic the
  setup call had just promised "tomorrow morning this will email you what
  it did overnight". Pure `lib/morning-after.ts` writes the three sentences
  law 6 asks for: WHAT HAPPENED (the ledger's work since yesterday morning
  in the standup's own nouns — `STANDUP_NOUNS` moved to the pure
  `lib/standup-nouns.ts` so a night and a week use one vocabulary — plus
  "N of my own jobs hit trouble" from the engine-failure count, so a night
  of nothing but failures never reads as a quiet night), ONE THING (a card
  on a human first, named — `listOpenProposalsOnYou` shares
  `countOpenProposals`' grant rule, so a card the machine will execute
  itself is never asked of a person; then something BROKEN from the
  readiness resolver's own words and door; then the next activation
  door — `ACTIVATION_DOORS`, one per event, each a real route — while the
  clinic is inside `ONE_THING_DAYS` = 30, after which it would be a daily
  nag), and WHAT IT WAITS ON (`listPendingOnUs`, extracted from the cockpit
  so the "still on us" line and the stuck clock read one list). The
  digest's rule changed: inside `MORNING_AFTER_DAYS` = 7 the email goes
  out even when every list is empty, with a quiet-night line that differs
  before and after the patients are connected; after the first week a
  night with no work, no card and no broken thing stays quiet as before.
  The email's button lands on the one thing's own door when there is no
  routine to-do for My Day to show; when the one thing names a card, the
  generic "N pieces waiting on your yes" line is not said twice; the subject
  says "what I did overnight" / "one thing" when the routine subject would
  be empty. Every read is once per clinic and best-effort — a failed read
  says less, never blocks the morning to-dos, and a null morning leaves the
  old digest exactly as it was. The cockpit gained its seventh stuck flag:
  the morning email still off on day 1 ("nothing arrives on day two"),
  last in the order, because a digest that is off is a law-6 failure the
  owner can fix in one click on the call. Not done on purpose: the digest
  stays OPT-IN (law 1 — the call's fourth beat turns it on; the cockpit now
  says when it wasn't), and no new column — the night is read from the
  rails that already record it.
- **2026-10-07 — S8 SHIPPED: activation stamped + measured.** Law 7 is
  live. THE STAMPS: A2–A5 (and A1 wherever the kick never ran) are written
  by ONE mechanism, `reconcileActivation` (lib/services/activation.ts) —
  for every key still unset it reads the rails' own first-time (the
  derived read, `readActivation`, moved beside the stamps and re-exported
  from first-week.ts) and writes THAT instant through `stampActivation`'s
  write-once guard, never "now", so a stamp made a day late still carries
  the true time. It runs at the end of the day-one kick and, as
  `reconcileActivationStamps`, on the daily-digest tick over every real
  clinic with something unstamped (budgeted + resumable, job
  `activation-reconcile`); clinics with all five stamped cost one row
  read. Deliberately NOT a stamp call at every send/booking/submission
  site: six-plus writers across reminders, campaigns, three booking paths,
  review asks and forms, and a site missed is an event never counted — one
  reconcile that reads the rails cannot miss one, and it backfills every
  clinic that predates stamping for free. THE NUMBER: pure
  `lib/activation-metrics.ts` (`computeActivationMetrics` over the cohort
  of real clinics created inside `COHORT_DAYS` = 90: per event the count
  reached and the median hours from org creation; the share with A1 inside
  `A1_TARGET_HOURS` = 48, Part 3's line; the count still without data past
  the stuck day) and `getActivationMetrics` (stamps only, demo excluded,
  "unreadable" on a failed read — never a cohort of zeros). The platform
  Overview gained `ActivationCard` ("The first week, measured"): time to
  data (median), data within 48h, no data past day 3, signed up, and the
  five-row event table, with a door to the cockpit; an empty cohort is a
  room with a door (law 4). The cockpit's KPI row gained "Time to data,
  median" over the clinics it shows (`counts.medianHoursToA1`). The
  program's eight slices are all shipped.
- **2026-10-07 — PHASE AUDIT, round 1 (fixes).** The phase-audit
  workflow's first discovery round over S1–S8 returned 34 confirmed
  defects (22 distinct once the four lenses' duplicates merged), 3
  in-phase gaps and 4 backlog items; the main loop re-verified every
  survivor against the cited code before touching it. What was wrong, and
  what changed: (1) THE DOORS REOPENED THEMSELVES — `openDoorsAtA1` ran on
  every eligible kick and `openDoors` coalesces, so every PMS sync turned
  My Day and Follow-ups back on after a clinic turned them off, and a
  second go-live reopened Inquiries; the kick opens doors on the FIRST
  stamp only and the go-live action reads `siteLiveAt` before it writes.
  (2) A1 WAS STAMPED "NOW" — the kick stamped before it reconciled, so an
  existing clinic's time-to-A1 was the deploy date; the kick reconciles
  FIRST and an A1 the rails already prove (through the kick or the daily
  pass) opens the doors too. (3) NOTHING ANSWERED A PMS REQUEST —
  `pms_connect_request.status` had no writer, so "we're connecting it"
  lasted forever and came back as pending after a disconnect; a connected
  bind (`upsertPmsConnection`) stamps it `connected`, and the cockpit row
  carries "Mark install scheduled" / "Close request"
  (`answerPmsRequestAction`). (4) A2 ignored staff messages — it is now
  the earliest of reminders, campaigns and outbound `patient_message`
  rows. (5) The digest's "and N more" counted the short list it loaded,
  not the stack (`openCardsTotal`); the A3 door sends a clinic whose site
  is still private to put it live first (`SITE_NOT_LIVE_DOOR`); staff's
  own insurance checks are no longer narrated as "I handled"
  (`HUMAN_RUN_CAPABILITIES` in `lib/standup-nouns.ts`, shared with the
  standup); the digest's button lands on `/dashboard` when My Day is off.
  (6) The cockpit: "Doors open" names the S3 switches that are on
  (`doors.switches`), dates format in the clinic's zone, the SMS pending
  clock reads `a2pStatusUpdatedAt` so a failed poll no longer resets it,
  the sign-in line says what it reads ("active staff session"), and the
  digest-off flag ages out at `SETTLED_DAY` = 30. (7) The morning email
  has a switch an owner can reach: Settings → Notifications → "Morning
  email for the clinic" (`setClinicDigestAction`), where the cockpit's
  flag now points. (8) The Intake door never met a provisioned clinic —
  creation seeds the standard form untouched, so every clinic had "1 form
  on file"; `isUntouchedSeedTemplate` tells the seed from THEIR form and
  turning on rebuilds the seed in place from what they kept (its slug —
  the link already on their site — survives). (9) Growth's intro said
  every send waits for a yes while review asks auto-send; the copy says
  which. (10) Unreadable reads render as "couldn't read just now", never
  as "No patients yet" / "Google not connected" / "no forms on file" (the
  Growth and Intake intros carry nullable facts). (11) The Payments hub's
  own Connect Stripe button returned to Shop; `?back=payments`. (12) ⌘K
  tied the Payments pages to the Shop switch; each family follows its own
  module. (13) Day 0's most important empty room, Patients, offers the A1
  doors (connect the practice software, import a CSV) before a manual
  add. (14) The feature-switch actions return a typed error instead of
  crashing to the boundary. (15) Migration 0174: an
  `(organization_id, sent_at)` index on `appointment_reminder_log`, which
  the A2 read scanned without one per clinic (the one "rejected" finding
  the main loop overruled). Backlog, on the owner's menu, not the
  release: the morning after only in the opt-in email (nothing in the app
  says the one thing); overnight as counts, not stories; the cockpit
  clock starting at org creation for managed clinics with no invite
  state; the kick's result discarded. Round 2 runs over this fix range.
- **2026-10-07 — PHASE AUDIT, round 2 (fixes).** Round 2 over the program
  plus round 1's fix commit returned 27 confirmed defects (14 distinct), 1
  in-phase gap and 3 backlog items; the main loop re-verified each against
  the code. The round's lesson is the one the gate's own convention
  predicts: HALF OF IT WAS IN ROUND 1's CORRECTIONS. (1) THE DOORS,
  PROPERLY: round 1's "first occurrence only" guards were both defeated
  by the event repeating from a null state — take the site offline and put
  it back and `siteLiveAt` is null again, so the go-live guard was true on
  every re-pull; and the daily reconcile stamped A1 without ever opening
  the A1 doors, after which every later kick (gated on "first stamp") never
  opened them either, so a roster that crossed the floor by bookings never
  got My Day or Follow-ups. The fix is a MEMORY rather than a guard:
  migration 0175 `clinic_profile.doors_closed` jsonb, written by a person's
  "Turn off" and cleared by a person's "Turn on"; the MACHINE's openers
  (`openDoorsAtA1`, `openDoorsAtSiteLive`) skip every key in it, so they
  are safe to call on every occurrence — the kick on every eligible A1,
  the daily pass when it stamps A1, the go-live lever on every pull — and a
  door a clinic shut stays shut. (2) A1's GOOGLE INSTANT was the
  `zernio_connection` row's createdAt, which is minted at the START of any
  connect attempt (social included), days before the OAuth finishes; with
  the kick now reconciling first, that early instant was written once and
  forever. The rail is the GBP ACCOUNT's `connectedAt` now. (3)
  UNREADABLE ≠ EMPTY, on the stamps too: one failed rail read (say the
  reminder log) made `earliestOf` pick a later source and the write-once
  guard froze it in. `readActivationDetailed` names each key whose source
  could not be read, the reconcile skips those keys, and the kick never
  stamps "now" over an unread A1 rail (the daily pass carries the true
  instant). (4) THE PMS REQUEST'S OTHER HALF: round 1 made a bind write
  'connected' and nothing mirrored a disconnect, so the door said "connected
  and syncing" over a dead bridge with no way to ask again;
  `disconnectPms` → `closeConnectedPmsRequest`, the closed copy and the
  "Ask us to connect it again" button; the cockpit's "Asked" date and the
  pending-on-us clock read `createdAt` (an answer re-dated the ask and
  reset the 5-day clock); the answer action requires a platform
  owner/admin. (5) OFF UNTIL CHOSEN, for intake: the seeded standard form
  rode every booking confirmation while the Intake Forms door was closed
  (law 1 broken on the S5 door whose copy said auto-send was off);
  `getBookingIntakeForm` sends nothing while the switch is off, the know
  line tells the truth, and the turn-on rebuild spares a seeded form
  patients have already answered (rewriting it hid their sections from the
  record). (6) The digest's one thing no longer asks a clinic to "bind your
  practice software" beside "still on us: connecting it" (`pendingOnUs`
  items carry a `kind`); its failure line owns the problem ("that's mine to
  sort out") instead of sending staff to an Overview with no details. (7)
  The 48h share's denominator is the clinics old enough to be JUDGED — a
  signup from this morning is undecided, not a miss. (8) The cockpit: the
  machine's week excludes staff-run checks (`machineWork`); an unread
  profile row is `digestOn: null` + `doorsUnreadable` (no false "morning
  email is off" flag); the Payments intro has an 'unreadable' state like
  its two siblings; `resolveConnectBack` uses `Object.hasOwn`. THE GAP,
  CLOSED: Part 5 asked for "Day N with the trial state" and S1 never
  carried it — the first week IS the 7-day trial, and expiry shuts the
  clinic down. `FirstWeekRowInput.trial` (from `resolveTrialState` over
  `trialEndsAt`, now on `ClinicListRow`), a "Trial · N days left" / "Trial
  ended · behind the wall" pill, and two flags: behind the wall comes FIRST
  and alone (the next move is billing, not the PMS), and a trial ending
  within `STUCK.trialEndingDays` = 2 with no data is a call today. Backlog
  (owner's menu): "install scheduled" with no date or message; door opens
  and closes leave no who/why record; a member meeting a closed door gets
  no name and no button. Round 3 runs over this fix range.
- **2026-10-07 — PHASE AUDIT, round 3 (the cap) — fixes.** Round 3 over
  the program plus both fix commits returned 13 confirmed defects (7
  distinct, FIVE of them in round 2's own corrections), no in-phase gap,
  and one CRITICAL that was live in production for the ~40 minutes between
  the round-2 deploy and the hotfix (DreamCreateWeb/DreamCRM#759):
  `enableFeature` cleared the new `doors_closed` memory with
  `${toOpen}::text[]`, and drizzle renders a JS array inside a sql
  template as a parenthesised scalar list — `($1, $2)::text[]` — which
  Postgres rejects as a malformed array literal; that single UPDATE is also
  the one that opens the door, so every person's "Turn on" failed. The
  keys go in as ONE array literal now, and the boundary test CLAUDE.md
  requires for raw SQL (`tests/feature-switches/doors-closed-sql.test.ts`)
  renders both doors_closed statements through drizzle's real dialect.
  THE REST, by root: (1) OFF UNTIL CHOSEN had four more intake paths than
  round 2 gated — the public site's booking action, the forms-reminder
  cron (which also stamped A2 from a send nobody chose), the portal's
  pre-visit task, and the public "Start your intake" / form-by-slug pages.
  There is ONE gate now, `patientFacingIntakeOpen` (lib/services/forms.ts),
  with two wrappers (`getPatientFacingDefaultForm`,
  `getPatientFacingFormBySlug`) that every patient-facing surface reads;
  the staff send refuses with a sentence naming the door. (2) The intro
  showed the section picker for an answered seeded form while the action
  (round 2) silently ignored the picks — both read ONE split now,
  `splitIntakeFormsForDoor`. (3) A re-ask after a closed PMS request kept
  the original `createdAt` (the cockpit flagged it stuck on arrival and
  both "Asked" labels showed a weeks-old date), and a clinic's contact
  edit flipped a 'scheduled' answer back to 'requested': the upsert keeps
  scheduled/connected, re-opens closed as a NEW ask dated now, and keeps
  the date on an edit. (4) The 48h tile's fraction said "N of all clinics"
  under a percentage computed over the clinics old enough to judge —
  `a1Within.decided` is exposed and the label says so. (5) Migration 0176
  backfills `doors_closed` for GRANDFATHERED clinics only — 0172 set all
  five day-to-day modules ON for them, so a null column can only be a
  human close; a clinic created after the switches with a stamped A1 and a
  null column is deliberately NOT marked (it could be a door the daily pass
  never opened, round 2's own defect, and a never-opened door costs the
  feature while a reopened one costs one more "Turn off"). Backlog (owner's
  menu): the morning email as a setup card on the Dream Team page rather
  than only a settings switch; telling the clinic its own milestones.
  Upheld rejections: the close memory checked in JS not SQL; review asks
  continuing while Growth is closed (auto-by-default automations keep
  their own switches by the Phase-3 law); the one thing repeating a
  stalled step; one thing for every staff member regardless of role.
  Round 3 was the cap: the certificate, the retrospective and the
  self-sweep follow in docs/AUDITS.md, then ONE verification round.
- **2026-10-07 — THE SELF-SWEEP (main loop, post-cap) + the certificate.**
  Round 3 was the cap, so the remaining discovery was the main loop's own:
  a sibling sweep of every fix from all three rounds, the component ×
  failure-mode matrix, crash-consistency of every claim-then-act. Found
  and fixed: the PUBLIC SITE'S DEAD LINKS — every template's footer, the
  hometown header, the modern hero and the new-patients page linked
  "New patient forms" / "Start your intake" to a page the round-3 gate
  404s while the door is closed (`intakeDoorOpen(profile)` in
  lib/feature-switches.ts hides each with the door; the new-patients page
  hides its whole intake card); two more patient-facing intake surfaces
  (the portal's form-by-id fill view, the public packet page) now ask
  `patientFacingIntakeOpen`; the DAILY PASS OWES DOORS to a clinic whose
  A1 it stamped before it opened doors (a bookings-only roster with no
  later kick would have waited forever — it now walks any clinic with A1
  on file whose A1 doors are null and not closed); the demo self-heal
  forgets a close when it reopens every switch. The certificate, the
  four-cause retrospective and the three standing additions to the
  self-sweep checklist are in docs/AUDITS.md. ONE verification round
  follows, as the gate requires after a documented sweep.
- **2026-10-07 — VERIFICATION ROUND 1: not clean (9 confirmed / 5
  clusters, no gap) — fixed, and the sweep extended by class.** The
  classes the self-sweep's checklist had not covered, each now in
  docs/AUDITS.md: a data migration whose boundary was a calendar date
  (0176's cutoff sat ~5h after 0172 applied, so clinics born in the window
  got fabricated closes — migration 0177 removes exactly those keys for
  exactly that window); "unreadable ≠ empty" for every cockpit read that
  FEEDS A FLAG (`unreadable` on the row: a failed ledger/session/A1-rail/
  cards read is named and its flag stands down); navigation as part of the
  "sent to patients" set (the portal's Forms tab hides with the door); the
  STAFF-facing intake nag (`no_intake` and `missingIntakeBeforeAppt`
  consult the switch, so the Overview, agenda, patients list, the record,
  the S7 prep list and the AI reply context stop asking staff to operate a
  closed module; the Overview's intake and follow-ups cards hide with their
  doors); per-feature turn-off copy (`offWarns` — intake's confirm says
  patients stop getting forms and sent links stop working); and the
  digest's one thing never sends staff through a door a person closed
  (`ACTIVATION_DOORS[*].feature` + `doorsClosed`). One more verification
  round follows.
- **2026-10-07 — VERIFICATION ROUND 2 and THE CLOSE.** 12 confirmed in
  four clusters, no gap, every one a sibling inside a class verification
  round 1 had named: the staff-facing intake readers the file-walk missed
  (the Overview's own chair glyph and "Intake forms" tile, the patients
  and agenda intake chips + the SQL filter, the appointment drawer's
  "send the form" block, the record's Send-intake menu item and Forms-tab
  door); the Overview's Shop card for a shop nobody opened; the digest
  listing follow-ups and leads behind closed doors (and in its subject)
  while the Overview card hid; the cockpit's trial-ending flag and
  "No data connected" KPI on an unread A1 rail; and the test gap on the
  service gates. All fixed and pinned (`readMorningAfter` gained a service
  test). THE PROGRAM'S AUDIT CLOSES HERE on the gate's stated criterion —
  three consecutive rounds with zero in-phase gaps and the remaining
  defects confined to the correction layer — with the final lesson in
  docs/AUDITS.md: a named class is swept by grepping its vocabulary, not
  by walking the files a fix touched.
