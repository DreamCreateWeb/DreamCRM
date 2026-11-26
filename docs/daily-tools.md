# THE DAILY TOOLS — reasons to open the app on purpose

Owner directive (2026-11-25): "everything we have is generally set it and
forget it … people love the app for what it is, but nobody goes into it all
day every day. I want to fix that by adding tool sets that just make their
work lives better or easier." The examples offered: reminders that
understand dentists, an "Alexa-type" assistant trained on dental, measuring
tools for doctors, a 3D-printing library. The choice of what to build was
delegated: *"I want you to decide."*

This doc is the program's memory: the research, the ruling it produced, the
laws every tool in the program obeys, the build order, and the build log. It
sits beside `docs/ACTIVATION.md` (every feature has a front door) and
`docs/ai-operations.md` (the Dream Team) as a program of record. Read it
before touching `/huddle` or adding any tool to this program.

---

## Part 0 — The research (2026-11-25)

Seven research passes (what each role does all day; recurring compliance
duties; AI in the dental office; chairside reference tools; in-office 3D
printing; back-office coordination tools; how professional software earns a
daily habit) and one synthesis. The notes and the report are filed in
[`docs/research/daily-tools-2026-11/`](./research/daily-tools-2026-11/)
(`report.md` is the synthesis; read its caveats before quoting a number).

What it found, in one paragraph: **teams return to rituals, not gadgets.**
The one daily ritual dental offices share is the morning huddle; the
best-known product built around it lists at $399–$899 a month, and its
documented failure is trust — reviewers abandon it when a huddle number
disagrees with their practice software. The second-strongest rhythm is the
sterilizer log and the renewal clocks (every load, every week, then 120 days
to five years), which is duty rather than desire but is the one thing a
clinical assistant would touch every working day. The assistant's documented
uses are WRITING (appeals, letters, job ads, office procedures); the voice
demand on record is for charting, which needs patient data the AI may not be
sent. Chairside calculators are a convenience (one well-documented job: the
anesthetic cartridge arithmetic). 3D printing serves a minority (17% of
dentists owned a printer in the last authoritative survey, 2022), has no
demand evidence, and most shared print files carry non-commercial licences.

**How solid it is:** thinner than it should be. The research could not reach
first-hand posts from dental staff (the forums refused automated reads), no
dental product publishes daily-use figures, and most prices are vendor- or
aggregator-sourced. The ranking measures how well each habit is DOCUMENTED,
not proven demand. Every tool here ships behind its own switch, so each
switch is the demand measurement the research could not supply.

---

## Part 1 — The ruling

**One daily page, with feeders — not five destinations.** Five separate
tools would rebuild the problem the app has today: capable things with no
moment in the day when anyone looks. The Huddle is the page; everything
else in the program earns its place by putting a row on it.

| Order | Tool | Why here | Status |
|---|---|---|---|
| H | **The Huddle** — the morning meeting, already prepared | The best-documented daily ritual; reuses data already synced; reaches the whole team | **H1 SHIPPED** (below) |
| U | **Upkeep** — sterilizer and spore-test logs, open/close checklists, then licence / CE / DEA / credentialing / equipment clocks | The most certain cadence; brings in clinical staff; feeds the Huddle | next |
| W | **Sandman as the office writer** — appeals, letters, job ads, procedures | Documented uses; the persona exists | after Upkeep |
| T | **A small toolbox** — a transparent anesthetic calculator first | One documented job; low cost | after the writer; counsel reads it first |
| P | **3D printing** | Minority of practices; no demand evidence | PARKED — at most a vendor-neutral cost-per-print calculator |

Two events reorder this list: a signed BAA with the AI vendor moves the
assistant up (charting and note-taking is the top wish of dentists planning
to adopt AI), and an ADA CDT licence opens coding help.

### What changed in the charter, and why it does not contradict it

- **The success law** (DESIGN.md: minutes-in-app goes DOWN while patients go
  UP) is about time spent OPERATING the product — a cost. This program adds
  time people CHOOSE to spend because a page does a job for them. The test
  is unchanged: *does this ask the clinic to operate something, or does it
  do the job and report?* The Huddle is a report. A tool in this program
  that asks to be operated has failed it.
- **"Lab order tracking" is on DESIGN.md's not-in-scope list.** The lab-case
  ARRIVAL check planned for the Huddle (a lab, a due date, the seat
  appointment it belongs to) is logistics — "will it be here?" — not the
  clinical order. Ruled in scope 2026-11-25 under the owner's delegation;
  the clinical side (the prescription, the shade, the lab's fee) stays out.
- **Clinical calculators** stay reference tools: clinician-facing only, the
  formula, inputs and source shown on every result, never in the patient
  portal, no urgent directives. A lawyer reads the first one before it ships.

---

## Part 2 — The laws (every tool in this program)

1. **RULES, NEVER THE AI, for anything with a patient in it.** Patient rows
   never reach a model — the same line Sandman's chat holds. The Huddle is
   assembled entirely by code.
2. **SAY WHERE IT CAME FROM.** A page that states a fact names its source
   and how old the read is. With no practice software connected it says
   what it CAN see and opens the door; it never passes a thin list off as
   the whole day. No production figures, no goals, no scoreboards — those
   are the numbers that disagree with the practice software.
3. **NO RANKINGS.** Nothing compares one person, provider or day with
   another. In a team of eight a leaderboard is personal, and the research
   on workplace game mechanics is mixed at best.
4. **HIDE DETAILS IS A PROMISE.** A page that can be put on a wall has a
   switch that leaves nothing private on it: names shortened, amounts and
   medical detail dropped. A new flag or line that carries something private
   must say what it reads as with details hidden (`quiet`).
5. **WE REMIND; YOU REMAIN RESPONSIBLE.** Nothing in this program promises
   compliance. Every interval is the practice's to set; a default cites its
   authority and date.
6. **ONE AUDIT.** A patient's flags come from `auditClinicDay`
   (`lib/services/patient-audit.ts`) — the same rules for My Day, the
   morning email and the Huddle. A new flag is added THERE, never on a page.
7. **Every tool is a switch with a front door** (docs/ACTIVATION.md law 1),
   and a tool that needs nothing set up opens on its own at A1.

---

## Part 3 — The Huddle

`/huddle` · sidebar **Huddle** (Daily, after Dream Team) · switch `huddle`
(`clinic_profile.huddle_enabled_at`, migration 0197; opens at A1).

Four sections, in the order a team would run the meeting:

1. **Yesterday / Last time in** — the last day the practice actually saw
   patients, found by looking at the schedule, not a calendar (Monday talks
   about Friday; nobody configures working days): how many visits happened,
   first visits SEATED by name, who did not make it, visits nobody marked,
   what was booked online since, what the Dream Team handled.
2. **Today** — every visit, patient by patient, with the audit's flags; a
   ring for how much of what is still ahead is ready. A visit already marked
   done stays on the page.
3. **Tomorrow / Next on the books** — the next day with anyone on it; only
   the visits that need prep are listed, and the rest are counted as set.
4. **Before you go** — closures ahead, follow-ups due, conversations
   waiting, inquiries, Dream Team cards — each with its door, and none for a
   module the practice has not opened.

Two controls, and they only change how it is shown: **Present** (a
whole-screen dialog in room-sized type — the app's ONE Modal primitive at
its new `screen` size, so the focus trap, the scroll lock and Escape are the
same as every other dialog's; the browser's own full-screen exit leaves it
too) and **Hide
details** (law 4; remembered per device).

**The morning email** carries the Huddle's one line ("12 visits today — 3
need a little prep.") while the door is open — counts only, never a name —
and a day with patients in it is now worth the email on its own.

**The Overview** stays the desk's glance and no longer calls itself the
morning huddle (its eyebrow is `Daily · <day>`); Today's chair links to the
Huddle while it is on.

Code: `lib/huddle.ts` (pure — every sentence) · `lib/services/huddle.ts`
(the reads) · `lib/services/patient-audit.ts` (`auditClinicDay`) ·
`app/(default)/huddle/` · the demo's day `lib/services/demo-clinic/seed-huddle.ts`.

### Decisions worth knowing before changing it

- **No backfill in 0197.** A clinic that was live before the Huddle existed
  gets its door from the daily activation reconcile (`a1DoorsOwed`), which
  honors a door a person closed. An UPDATE in the migration would not.
- **Strict at the centre, best-effort at the edges.** Today's schedule IS
  the page, so a failed read throws to the error boundary; the recap, the
  next day, the sync stamp and the heads-up each fall back to "not shown".
- **The demo's day is seven upserted rows** (deterministic ids, the
  `appt_demohud_` marker, persona-anchored by identity). The demo's other
  appointments are seeded once, relative to its creation, and a resync never
  moves them — without the upsert an older demo has no today at all.
- **Adding a feature switch touches four lists** (the registry, the sidebar
  read, the reconcile's select, the demo's self-heal).
  `tests/feature-switches/a1-doors-select.test.ts` holds them together; it
  was written because the reconcile's select named its A1 doors by hand.

### Owed, in order

- **H2 — the team's own lines.** A note for tomorrow's huddle ("Maria is
  out Thursday") and a private thank-you that gets seen. Recognition has the
  strongest evidence of NEED in the research (43% of assistants feel valued,
  down from 72% in 2020) and none that software closes the gap — so it ships
  small, and never ranked.
- **H3 — the lab-case arrival check** (see the charter note above).
- **Its own browser spec.** H1 rides `e2e/dashboard-viewport.spec.ts` (the
  page at 390 / 834 / 1440) and was looked at by hand in a real browser;
  Present and Hide details are held by `tests/huddle/huddle-board.test.tsx`
  under happy-dom only. A spec that owns a `huddle` seed scope (a yesterday,
  a today and a tomorrow) and walks Present in Chromium is the first thing
  H2 should add — a new scope puts rows on the live e2e clinic's today, so
  it wants the axe baselines re-read in the same change.
- **Print.** A printout is how a team with no screen in the break room
  reads it; needs the shell's chrome to step aside under `@media print`.
- **The demo's other days.** Only the Huddle's seven rows move with the
  calendar; the demo's other "tomorrow" stories still age from its creation.
- **Marketing.** `lib/marketing/docs.ts` still titles a help page "The
  morning huddle (your Overview)", and the product page calls the Overview a
  morning huddle. Both are true as metaphors and both will read oddly beside
  a sidebar entry called Huddle. Left alone in H1 on purpose: the marketing
  tree was another session's that week, and each page's `contentKey` must
  move exactly when its content does (the IndexNow law).

### Owner's side (no engineering)

- **A BAA with the AI vendor** — the single change that reorders this list.
- **Ask a few office managers and assistants** whether a huddle that
  prepares itself would get opened every morning. Ten minutes each would
  test the ranking before the writer is built.
- **An ADA CDT licence**, if coding help is wanted (two to eight weeks).

---

## Build log

### 2026-11-25 — H1: the Huddle

Schema (0197, one nullable column) + service + UI + tests in one slice.
`auditUpcomingDay` generalised into `auditClinicDay` (any clinic-local day;
`held` vs `live` scope; prep flags only for visits still ahead; a slot that
already passed today no longer asks for a confirmation) with My Day and the
digest reading tomorrow through it unchanged. The switch joined the A1
doors; the reconcile's select and the demo's self-heal learned the column.
The digest gained the Huddle's line. `StatusPill` gained `size="lg"` and
`wrap` (a flag that quotes an intake answer must not run off a phone);
`Modal` gained `size="screen"` (Present was first written as its own
overlay and `tests/ui/no-hand-rolled-modal.test.ts` refused it — rightly).
