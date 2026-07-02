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

Fixed 2026-07-02 (round 2):

- ☑ **Public booking form day strip** — slot labels were already clinic-tz
  (server-formatted), but the 14-day strip + Today/Tomorrow labels anchored to
  the BROWSER's calendar. Now built from clinic-calendar date keys
  (`clinicDayKey`), so an out-of-state patient near midnight sees the clinic's
  bookable days.
- ☑ **Portal SlotPicker day strip** (book + reschedule flows) — same fix;
  clinic `timeZone` threaded from the portal pages/visit card.
- ☑ **Follow-up "today"/"overdue" boundaries** — `todayYmd()` was the SERVER's
  UTC day, so a Central clinic's follow-ups flipped to due/overdue at ~6-7 PM
  local. `listOpenFollowups`/`getFollowupSummary`/`countFollowupsDue`/
  `getMyDay` now bucket at the clinic's midnight (`clinicTodayYmd`).

Open:

- ☐ **Portal message timestamps** (`patient/messages/messages-view.tsx`) use
  browser tz while portal *visit* times use the clinic-tz helpers — decide one
  way (probably fine as browser tz for the reader's own messages; visit-linked
  times must stay clinic-tz) and document.
- ☐ **Follow-up rule/auto-create due-date assignment** (`followup-rules.ts`,
  `autoCreateRebookFollowup`) still stamps due dates from the UTC day — ±1 day
  near midnight; cron-context, needs per-clinic tz threading.
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

## Class 3 — Numbers/state that should agree across surfaces (audited 2026-07-02)

Full-code audit ran 2026-07-02. Verified AGREEING (no action): patient balance
(every surface reads `patient.pms_balance_cents`), review funnel windows
(Overview/reviews/Analytics all via `getReviewStats`), last/next-visit
predicates (list/header/drawer/portal all exclude cancelled+no-show,
instant-based), trial days (single `Math.ceil` source in `lib/trial.ts`),
sidebar follow-up badge == Overview card.

Fixed 2026-07-02 (round 2):

- ☑ **Overview "New patients MTD" import inflation** — counted `createdAt`
  with no source filter, so connecting a PMS / uploading a CSV spiked the tile
  by the whole roster while Analytics stayed flat. Now uses `firstSeenAt`,
  excludes `BACKFILL_PATIENT_SOURCES` + archived (same semantics as
  Analytics).
- ☑ **New-patient ★ glyph rule** — Overview counted a cancelled/no-show prior
  visit as "not new"; agenda/list didn't. Overview now excludes them too.
- ☑ **Private feedback counted as "Reviewed"** — `getReviewStats` completed
  count included `selectedSite='private_feedback'` rows (headline could exceed
  the platform-mix bars). Now excluded; private feedback keeps its own inbox.
- ☑ **My Day "need a text"** counted scheduled slots that had already passed
  today. Now only future ones.
- ☑ **Appointment drawer "Lifetime spend"** read the legacy Mosaic `invoices`
  table (always $0 for real clinics). Now reads paid `shop_order` rows — the
  same source as the patients list — relabelled "Shop purchases".
- ☑ **Agenda day totals** — "booked" no longer counts cancelled visits.
- ☑ **Portal recall nudge** derived last-visit from completed-only visits and
  ignored the clinic's recall cadence (fell back to the 6/9mo heuristic) — now
  uses the same predicate + `intervalMonths` as the patients list.
- ☑ Balance aggregate `::int` cast in Overview → `::bigint` (matches My Day;
  overflow-proof).
- ☑ Follow-ups sidebar badge doc claimed it mirrors the board's default list —
  corrected (the badge counts DUE; the board default lists all open).

Open (judgment calls, not clear bugs):

- ☐ "Unconfirmed" means *next 48h* on Overview/nav-badge but *today* on
  My Day — different-by-design, but the labels don't say so. Consider explicit
  copy ("in the next 48 hours" vs "today").
- ☐ Analytics treats "confirmed" as `confirmedAt || completed`; agenda counts
  `status='confirmed'` only. A confirmed-then-completed visit counts
  differently. Decide one definition.
- ☐ /followups board default shows ALL open while the badge counts due-only —
  consider defaulting the board to the "Due" filter, or a "N due now" pill at
  the top of the board.
- ☐ Guardian portal "next visit" may be a dependent's (family scope) — fine,
  but the card doesn't name whose visit it is when it's not yours.

## Class 4 — Dead/misleading affordances (audited 2026-07-02)

Audit ran 2026-07-02. Verified CLEAN: demo-mode actions all resolve to visible
feedback; portal feature toggles HIDE everywhere (nav, home cards, deep links
all guarded + `requirePortalFeature` server-side); `soon`/coming-soon tiles are
honest and non-clickable; `requirePlan`'s `?upgrade=` param survives to
`/settings/billing`.

Fixed 2026-07-02 (round 2):

- ☑ **Members saw Connect/Disconnect on /integrations** — every such action is
  owner/admin-only server-side (the GBP connect link even landed members on a
  raw JSON 403 page). The library now takes `canManage`: members get a "ask an
  owner or admin" note, view-only connected cards, and no add-on billing
  controls.
- ☑ **Members got the full Website Studio** where every save/AI action errors.
  The module is now owner/admin-only in the sidebar registry AND the page
  redirects members.
- ☑ **Fresh UI links pointing at redirect stubs** — ⌘K "Plan & billing",
  settings-search "Reminders", social-posts + integrations upgrade CTAs, and
  `requirePlan` itself now target `/settings/billing` /
  `/settings/automations/emails` directly (no double-redirect hop).

Open:

- ☐ Reviews action doc-comments say "owner/admin only" but the code allows
  members (comment/behavior mismatch — decide which is intended, then fix the
  other side).
- ☐ Open Dental detail page: members can view it via the card's Manage/View
  link — verify its mutating controls (sync now, disconnect, key entry) are
  role-gated in the UI, not just server-side.

## How to keep hunting (method)

1. Pick a surface a real clinic hits daily (patient detail, agenda, Overview,
   portal home).
2. Cross-check every derived fact on it against the surface that OWNS that
   fact (the module page, the DB column, the email that was sent).
3. Any disagreement → find the class (tz? attribution? divergent query? stale
   copy?) → fix the CLASS (helper + convention + sweep + test), not the pixel.
4. Log fixed/remaining items here; keep CLAUDE.md's conventions in sync.
