# The Finishing Pass — seam-bug punch list

Every v1 feature exists; this document tracks the **seam bugs** — the class of
defect where each feature works in isolation but the joins between them are
wrong (timezones, attribution, numbers that disagree across surfaces, dead
affordances). Work the list by CLASS, not by item: fixing a class means adding
the helper/convention that makes the whole class impossible, then sweeping
call sites, then adding the regression test.

**STATUS (2026-07-02): the punch list is CLEAR.** Every open item across the
five classes is fixed, decided, or explicitly accepted (marked ▣). New seam
bugs get logged here as they're found — use the hunting method at the bottom.

Status legend: ☑ fixed · ▣ accepted as-is (decision recorded) · ☐ open.

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

Closed 2026-07-02 (round 5 — the class is now fully swept):

- ☑ **Portal message timestamps** — DECIDED: browser tz is correct for the
  reader's own conversation moments (like any chat app); visit-linked times
  stay clinic-tz. Documented in `messages-view.tsx`.
- ☑ **Follow-up rule/auto-create due-date assignment** — `buildRuleCandidates`
  + `autoCreateRebookFollowup` now stamp due dates from the CLINIC's calendar
  (`clinicDayKey` via `getClinicTimeZone`); the rule's date label formats
  clinic-tz too.
- ☑ **Date-only server renders near midnight** — the cancel/no-show
  notification date labels (`appointments.ts` ×2), the new-booking staff
  notification (`site/[slug]/actions.ts`), and global-search visit dates all
  format against the clinic tz now. `formatDueLabel` was already tz-safe
  (local-construct + local-format); services pass the clinic's `today` key.
- ☑ **`lib/utils.ts` formatters** — marked CLIENT-ONLY loudly (banner comment
  pointing server code at `lib/format-datetime.ts`).
- ☑ **Staff dashboard client components** — DECIDED: staff browser tz stands
  (staff sit in the clinic; a traveling owner reading their own dashboard in
  their own tz is arguably correct too). Revisit only if a real complaint
  lands.

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

Closed 2026-07-02 (round 5):

- ☑ **`patient.is_demo_persona` column** shipped (migration 0114): written at
  persona insert, self-healed onto existing personas by
  `getPersonaAlignedPatientIds` (which still resolves by identity email —
  the column is the durable marker for the future). The dead
  `notification_prefs.push_everything` column dropped in the same migration
  (its unread flag + banner code removed).
- ☑ **Prod verification** — superseded: the cleanup sweep has run on every
  deploy since the fix (misattributed rows removed), and the seeded-artifact
  classes since then are persona-anchored by construction.
- ▣ Real patients in the demo org count into demo KPIs — ACCEPTED for a demo
  (they're real activity in a real org); no change planned.

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

Closed 2026-07-02 (round 5 — every judgment call decided):

- ☑ "Unconfirmed" windows — the labels already spell it out (Overview:
  "appointments in next 48h"; My Day: "today, still unconfirmed"). Verified;
  no further change.
- ☑ Confirmed definition — DECIDED: Analytics keeps `confirmedAt || completed`
  (a kept visit was confirmed in the way that matters); the agenda's live
  counts keep `status='confirmed'` (operational "who needs a text today").
  Different questions, intentionally different predicates — documented at the
  Analytics calc.
- ☑ /followups board — a "🔔 N due now" pill (overdue + due-today, the same
  number the sidebar badge counts) now sits in the board header, so board and
  badge always agree at a glance.
- ☑ Guardian portal next-visit — already solved: VisitCard renders
  "for {firstName}" on dependent visits (shipped with the family work).

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

Closed 2026-07-02 (round 5):

- ☑ Reviews actions — DECIDED: staff-wide access is intended (sending a
  review request / replying to Google reviews is front-desk work). Gate
  renamed `ensureClinicStaff` with the decision documented; only the patient
  role is excluded.
- ☑ Open Dental detail page — members now get a READ-ONLY dashboard: no
  Sync-now header button, no direction/auto-sync/disconnect controls (an
  "owner or admin manages these" note instead), and the unconnected state
  hides the key-entry form behind an ask-an-admin note.

## Class 5 — User journeys, signup → production (audited 2026-07-02)

Four end-to-end journey audits ran: self-serve signup→trial→paid, managed
provisioning + all invite flows, first-time integrations (Gmail/GBP/social/
Stripe Connect/Open Dental), and first-run configuration + upgrades.

**Verified solid (no action):** no redirect loops anywhere (mid-onboarding
re-entry, org-less users, pending invites all converge); slug race is atomic;
AI welcome interview never dead-ends; trial expiry locks only the clinic app
(public site + portal + booking stay up) and the wall embeds real checkout;
trial reminder cron is idempotent w/ correct copy; webhook idempotency;
first-run empty states crash-free; portal toggles hide everywhere; wrong-user
invite acceptance blocked on every flow; partner payout ledger is double-pay
safe; Stripe/Gmail OAuth state nonces correct; PMS bad-key + disconnect paths
clean; add-on purchase for self-serve + comped correct.

Fixed 2026-07-02 (round 3):

- ☑ **Plan change double-billing (HIGH)** — switching plans as an existing
  subscriber opened a NEW Checkout subscription; the old one kept billing,
  orphaned. Now an in-place price swap with proration
  (`updateSubscriptionPlan`); Checkout only for the first purchase. Tests:
  `tests/billing/update-subscription-plan.test.ts`.
- ☑ **Checkout return was webhook-blind** — `?checkout=success` was dropped by
  a redirect stub, no confirmation shown, and an expired-trial owner bounced
  straight back into the trial wall after paying. The success URL now lands on
  /settings/billing with the session id, syncs the subscription synchronously,
  and shows success/cancelled banners.
- ☑ **Canceled ≠ trial-ended** — a former paying customer was told "your free
  trial has ended". The wall now says "your subscription has ended" when
  `subscriptionStatus='canceled'`.
- ☑ **Zernio connect flashed success on denied consent / swallowed API
  errors** — the callback now propagates provider errors and verifies the
  platform actually landed before flashing "connected".
- ☑ **Trial clinics told "managed billing — contact us"** when buying the
  social add-on (no-sub trial conflated with comped). Now distinguished:
  trials get "Start your plan to add more" → /settings/billing.
- ☑ **Timezone never captured at onboarding** — every clinic silently
  defaulted to Eastern. Onboarding now records the signer-upper's browser
  IANA zone (validated server-side); the settings picker default now imports
  `CLINIC_DEFAULT_TZ` instead of a re-typed literal.
- ☑ **Onboarding re-submit wiped clinic name/address** (browser Back to
  step 4 with a cleared draft) — the conflict-update now conditionally
  spreads every field.
- ☑ **No email at all on signup** — a welcome email now sends when the trial
  starts (once, on org creation; also the earliest deliverability check on
  the owner's address).
- ☑ **Partner + patient-portal invite emails bypassed the Outlook-safe
  shell** (no VML button, no copy-paste URL — the exact defect that bit the
  first real clinic). Both now render through `authEmailShell`.
- ☑ **localhost link fallbacks** in managed-provisioning invites, partner
  invites, and Stripe Express return URLs — now fall back to the production
  origin.
- ☑ Re-clicking an already-accepted invite as the joined user routed to a red
  "Invitation expired" screen — now routes home (and the unauthenticated copy
  says "already used", not "expired").
- ☑ Team-invite duplicate-member guard was case-sensitive on stored email.
- ☑ GBP multi-location accounts flipped nondeterministically between
  locations (unordered select + `[0]`) — now stably ordered. (A real location
  PICKER is still open, below.)
- ☑ One more bare-UTC time render on the Overview unconfirmed preview.

Owner decisions (2026-07-02) + what shipped on them (round 4):

- ✓ **DECIDED — Reserved-plan Premium trial then tier drop is intentional**:
  the full-Premium trial deliberately showcases the bigger plans; features
  not in the chosen plan disappear at payment. No change.
- ☑ **"Your site is live" moment built** — `/onboarding-complete` now leads
  with "{Clinic} — your site is live!", a live-URL pill that opens the site,
  and a "connect your own domain" link deep-linking to
  `/settings/clinic#custom-domain`. The welcome email includes the live URL.
- ☑ **Canceling the add-on now DISCONNECTS over-cap channels** (newest first,
  oldest keep working) — we pay Zernio per connection. Also enforced on plan
  downgrades via the webhook sync. Demo orgs and GBP never touched. Tests in
  `tests/billing/social-billing.test.ts`.
- ☑ **Gmail Tier-2 send-as surfaced** — inbox settings now offers "Send
  patient email from your own address" to owners/admins after a connect
  (until a sender is designated), marks the designated account with a
  "Patient sender" chip, and maps the raw `access_denied` OAuth error to
  friendly copy.

Fixed 2026-07-02 (round 4, engineering follow-ups):

- ☑ **Stripe Connect status can now leave `active`** — `account.updated` is
  handled in the Connect webhook, `saveConnectedAccount` writes `restricted`
  for an onboarded account whose charges Stripe disabled, and
  `refreshConnectStatus` re-pulls even when currently active.
- ☑ **GBP "connected but empty"** — the connect callback now kicks a
  fire-and-forget profile + reviews sync, so /reviews and /seo populate
  immediately instead of waiting for the next cron tick.
- ☑ **"Next charge" was silently dead** — `stripe.invoices.retrieveUpcoming`
  no longer exists in the installed SDK (every call threw into a catch);
  migrated to `invoices.createPreview`.

Closed 2026-07-02 (round 5):

- ☑ GBP multi-location — `zernio_connection.preferred_gbp_account_id`
  (migration 0114) + a location picker on the Google Business detail page
  (rendered only when >1 location). `resolveGbpAccount` honors the persisted
  pick (falling back to the stably-ordered first when the pick disappears
  after a re-connect), so reviews/metrics/listing-sync/posting all follow it.
- ☑ `billingActivationPending` — DROPPED (flag, banner component, and its
  dunning-banner interaction). Managed clinics are always 'trialing'
  pre-payment, so it never fired; TrialBanner + `hasReservedPlan` own that
  journey.
- ☑ Multi-clinic patient landing — the membership fallback now orders by
  oldest membership (was an unordered `limit(1)` that could flip between
  requests). The magic-link brand was already deterministic (most-recent
  patient row). ▣ Residual: the two rules can still disagree for a
  multi-clinic patient (brand says newest clinic, landing says oldest org) —
  acceptable until a portal org switcher exists; both are now stable.
- ☑ Follow-up rule due dates — fixed (see Class 1).
- ☑ Gmail watch lapse — the inbox now shows a quiet amber strip when any
  connected mailbox's push watch has lapsed ("real-time paused — new email
  arrives when you open the inbox"), instead of degrading silently.

## Class 6 — Cross-surface rule drift (opened 2026-07-13, structure audit)

- ☑ Public-site booking ignores the notice window — FIXED (2026-07-13):
  `getSlotsForDay`/`isSlotAvailable` take an optional `minNoticeHours`; the
  public slot list + submit and the portal slot list now pass the clinic's
  "Earliest online booking" value (the portal submit already enforced it).
  Staff paths omit it, so walk-ins book right now. Settings copy updated to
  say "on your website and in the portal". Bookable-TYPE lists stay
  intentionally separate (`bookablePublic` flags vs the portal allowlist).

## How to keep hunting (method)

1. Pick a surface a real clinic hits daily (patient detail, agenda, Overview,
   portal home).
2. Cross-check every derived fact on it against the surface that OWNS that
   fact (the module page, the DB column, the email that was sent).
3. Any disagreement → find the class (tz? attribution? divergent query? stale
   copy?) → fix the CLASS (helper + convention + sweep + test), not the pixel.
4. Log fixed/remaining items here; keep CLAUDE.md's conventions in sync.

---

## Class 6 — Action-link dead ends needing new params/routes (2026-07-20 audit)

**Rule (DESIGN-SYSTEM v3):** every number links to the filtered view that
explains it. Passes 1–2 wired everything whose destination already existed;
these need a real param/route first (never invent unparsed query params):

- ☑ Shop hub "To fulfill" KPI → /shop/orders now parses
  `?fulfillment=unfulfilled` into a first-class Unfulfilled chip (paid +
  awaiting fulfillment); the tile deep-links it (2026-07-20).
- ▣ Shop hub catalog Products/Live KpiStats → ACCEPTED unlinked: the tiles
  sit inside the catalog section they describe (adjacency IS the
  explanation; a self-anchor would be noise). Decision 2026-07-20.
- ☑ Intake-forms heartbeat ("Completed · 8 weeks") → new
  /intake-forms/submissions index (recent completions across templates,
  patient/template/viewer links, clinic-tz); the label links it
  (2026-07-20).
- ☑ My Day "You closed N this week" → /followups now parses `?closedBy=me`
  into a first-class "Closed by me" chip (status='done' + completedBy = you,
  newest close first — the heartbeat's exact math; `listOpenFollowups`
  gained a `completedBy` filter); the heartbeat label deep-links it
  (2026-07-20).
