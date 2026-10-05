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

1. **OFF until chosen.** Every module except the day-one five (Overview,
   Messages, Appointments, Patients, Settings) is behind a switch, with
   the intro card as its first screen. The switch is one column per
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
bind, SMS carrier) for more than 5 days.

---

## Part 4 — The module inventory (every door, today → target)

| Module | Door today | Switch | "On" needs | Day-one win it can produce |
|---|---|---|---|---|
| Overview | always on | day-one five | — | the sign-here stack + the summons strip |
| Messages | always on; composer says "SMS (coming soon)" | day-one five | — | the first inbound reply threads |
| Appointments | always on; empty until data | day-one five | — | tomorrow's schedule from the PMS |
| Patients | always on; empty until data | day-one five | — | A1 |
| Settings | always on | day-one five | — | — |
| Dream Team | always on, roster + empty stack | **switch** (on at A1 — the machine needs data) | a goal | the first proposal |
| My Day | always on, empty | **switch** (on with a second staff member or at A1) | — | today's follow-ups |
| Follow-ups | always on, empty | **switch** (on at A1) | — | the auto rules' first cards |
| Inquiries | always on, empty | **switch** (on when the site goes live or a form is published) | — | the first inquiry |
| Intake Forms | seeded template, no walkthrough | **switch + intro** | pick what to collect, preview, how patients get it, auto-send | A5 |
| Insurance | **intro + switch (shipped)** | done | NPI (live) | a benefits card |
| Growth | hub with honest connect states | **switch + intro** (recall engine is the door) | GBP connected, patients loaded | "38 overdue and reachable" |
| Website | go-live lever (shipped) | done (the lever IS the switch) | hours, brand | the site is live |
| Payments | Stripe connect card | **intro** over the existing connect | Stripe Connect | first pay link |
| Shop | catalog + Stripe status | **switch + intro** | Stripe Connect, one product | — (never day one) |
| Integrations | catalog; SMS "coming soon", PMS "request access", roadmap tiles | **the hub itself is the front door** | — | A1 |

The integrations catalog, specifically:

| Card | Today | Target |
|---|---|---|
| Text messaging | `coming_soon`, notify-me, no link | **Set up texting** → the existing `/integrations/sms` form; status "Carriers reviewing — usually 3–7 days" after; the catalog flips the day a clinic can START, not the day one finishes |
| NexHealth (Open Dental, Dentrix + more) | `request_access` | **Connect your practice software** → a self-serve request that collects what the platform needs to bind (PMS vendor, practice name as the PMS knows it, an admin contact, best time) and shows "We're connecting it — you'll hear from Dustin within a day"; the bind stays platform-side |
| Dentrix desktop / Eaglesoft / Curve | roadmap tiles | fold under the NexHealth card as supported systems (they ARE, through the bridge) |
| Google Business Profile, socials, Gmail, Stripe | live connect | wrap each in the intro shape (what it does, what to know, one button) |

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
| **S3** | The switch, generalised | one column per feature, one `FeatureSwitch` helper, the sidebar shows day-one five + what is on + "Add"; Dream Team / My Day / Follow-ups / Inquiries auto-open at A1 |
| **S4** | Front doors: the integrations hub | the SMS card opens the form; PMS becomes a self-serve connect request with an honest status; roadmap tiles fold under it; "coming soon" leaves the dashboard |
| **S5** | Front doors: Intake Forms, Growth (recall), Payments | each gets the intro + setup + on, in the insurance shape |
| **S6** | Every empty state carries a door | the 64 cards each have one sentence and one button |
| **S7** | The morning after | the day-two digest for a thin clinic says what happened and names one thing, or says what it waits on |
| **S8** | Activation stamped + measured | `clinic_profile.activation` (A1–A5 timestamps, written once) and time-to-A1 on the platform Overview |

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
  derived read (`mergeActivation`). A2–A5 stay derived until S8.

