# The Finishing Pass — seam-bug punch list

Every v1 feature exists; this document tracks the **seam bugs** — the class of
defect where each feature works in isolation but the joins between them are
wrong (timezones, attribution, numbers that disagree across surfaces, dead
affordances). This is the current engineering focus. Work the list by CLASS,
not by item: fixing a class means adding the helper/convention that makes the
whole class impossible, then sweeping call sites, then adding the regression
test.

Status legend: ☑ fixed · ☐ open · ◪ partially fixed / needs decision.

---

## Class 1 — Server-side UTC leaking into clinic wall-clock (2026-07-02 sweep)

**Rule (now in CLAUDE.md):** the server runs in UTC. Server-side time strings
format via `lib/format-datetime.ts` helpers (tz required); server-side day
windows/bucketing use `clinicDayStart/WeekStart/MonthStart`
(`lib/clinic-timezone.ts`). Tests: `tests/timezone/clinic-day-boundaries.test.ts`.

Fixed 2026-07-02:

- ☑ Patient timeline appointment times (`patient-timeline.ts`) — the reported
  "booked 1 PM, timeline says 6 PM" bug
- ☑ Overview activity feed + today's-chair times + morning-huddle day header
  (`clinic-overview.ts` + `dashboard/clinic-overview.tsx`)
- ☑ Overview "today" window + MTD month boundaries (were UTC-bounded — evening
  visits fell out of today's chair)
- ☑ Appointments window chips (Today/Tomorrow/This week/…) + agenda day
  grouping/labels (`resolveWindow`, `groupByDay`) — evening visits grouped
  under the wrong day
- ☑ My Day schedule times (`my-day/page.tsx`; window fix inherited via
  `listAppointments`)
- ☑ Portal → staff notification copy ("moved their visit to …",
  `app/(portal)/patient/actions.ts`)
- ☑ Open Dental comm-log notes (booking confirmation + reschedule — the note
  disagreed with the correctly-tz'd email beside it)
- ☑ Inbox quoted-reply header ("On …, X wrote:", patient-visible)
- ☑ Intake submission "submitted at" (`submissions/[submissionId]/page.tsx`)

Open:

- ☐ **Public booking form slot labels** (`app/site/[slug]/book/book-form.tsx`)
  — client component formats slot Dates in the PATIENT's browser tz. A patient
  booking from out of state sees shifted times. Slots should render
  clinic-local labels (the slot grid itself is already clinic-tz on the
  server; carry pre-formatted labels or the clinic tz to the client).
- ☐ **Portal message timestamps** (`patient/messages/messages-view.tsx`) use
  browser tz while portal *visit* times use the clinic-tz helpers — decide one
  way (probably fine as browser tz for the reader's own messages; visit-linked
  times must stay clinic-tz) and document.
- ☐ **Staff dashboard client components** (agenda rows, drawers, thread
  panels, calendar) format in the staff member's browser tz. Correct while
  staff sit in the clinic; wrong for a traveling owner. Low priority — but if
  we ever fix it, thread `timeZone` down and reuse the shared helpers.
- ☐ **Date-only server renders that can shift a calendar day** near midnight:
  appointment notification date labels (`appointments.ts` `dateLabel` sites),
  new-booking staff notification (`site/[slug]/actions.ts`), follow-up rule
  labels (`followup-rules.ts`), global-search visit dates
  (`global-search.ts`), follow-up due dates (`lib/types/followups.ts`). Same
  fix shape: `clinicDayKey`/tz-aware format. Lower stakes than times.
- ☐ **`lib/utils.ts` `formatTime`/`formatDate`** are tz-less shared helpers —
  today only client code calls them, but any future server caller inherits the
  UTC bug. Either require a tz argument or mark them client-only loudly.

## Class 2 — Demo seed data attributed to real records (2026-07-02 sweep)

**Rule (now in CLAUDE.md):** the demo org contains real test patients; every
seeded artifact anchors to persona identity (`getPersonaAlignedPatientIds`,
persona emails), never positionally; every seeded row carries a recognizable
marker; `cleanupMisattributedDemoArtifacts` sweeps strays on each resync.
Tests: `tests/demo-mode/persona-anchoring.test.ts`.

Fixed 2026-07-02:

- ☑ The reported "phantom 5★ Healthgrades review" on a real test patient
  (positional index into an unordered all-patients query) — plus the same
  fault in message threads, Sophia/Emma/Marcus top-ups, scheduled send
  (which the cron would have actually SENT to a real patient), starred
  thread, campaign events, memberships (unordered `limit 3`), money-coherence
  anchor, testimonial links
- ☑ Cleanup sweep removes already-misattributed rows on the next deploy
  (review requests by `demo…` token, threads by seed bodies, the seeded
  scheduled send, seeded-campaign events, Stripe-less memberships,
  stray-linked testimonials)

Open:

- ☐ **Verify in prod after deploy**: Dustin Russenberger's timeline shows no
  review event, and `/reviews/received` no longer counts it.
- ☐ Real patients in the demo org still count into demo KPIs (patient counts,
  trends). Acceptable for a demo; revisit if the demo is ever shown with real
  test patients present.
- ☐ Consider a `patient.is_demo_persona` column in a future tidy migration so
  anchoring stops depending on the `@example.com` email convention (also drop
  `notification_prefs.push_everything` in the same migration).

## Class 3 — Numbers/state that should agree across surfaces (next sweep)

Candidate hunt list — verify each pair renders from the same source:

- ☐ Patient balance: patients list `$` glyph vs detail header vs Overview
  outstanding-balances vs portal billing (should all be `pms_balance_cents`;
  a prior fix unified the glyph — verify the remaining surfaces).
- ☐ "Needs a text" / unconfirmed counts: agenda day sub-headers vs Overview
  attention card vs nav badge vs My Day.
- ☐ Review KPIs: `/reviews` funnel vs Overview reviews card vs Analytics
  reputation band (30/90 windows must match labels).
- ☐ Next-visit shown on patient detail header vs timeline vs portal card.
- ☐ Trial banner day count vs Settings → Billing vs trial reminder emails.

## Class 4 — Dead/misleading affordances (next sweep)

- ☐ Sweep for links to routes that redirect (old `/channels`, `/google-posts`,
  `/settings/plans`, `/settings/reminders` are covered by redirect stubs —
  make sure nothing user-facing still LINKS to them as primary paths).
- ☐ Empty states that promise an action the current role/plan can't take
  (view-only member seeing owner-only CTAs).
- ☐ Buttons that silently no-op in demo mode instead of explaining.

## How to keep hunting (method)

1. Pick a surface a real clinic hits daily (patient detail, agenda, Overview,
   portal home).
2. Cross-check every derived fact on it against the surface that OWNS that
   fact (the module page, the DB column, the email that was sent).
3. Any disagreement → find the class (tz? attribution? divergent query? stale
   copy?) → fix the CLASS (helper + convention + sweep + test), not the pixel.
4. Log fixed/remaining items here; keep CLAUDE.md's conventions in sync.
