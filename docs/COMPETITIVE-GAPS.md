# Competitive feature gaps — the module-deepening roadmap

Working document for the module-by-module program (started 2026-07-02): make
every DreamCRM module match or beat what the orbital-layer vendors ship, one
module at a time (UI, UX, logic, features).

**Vendor set researched (2026-07-02, full reports in session log):** NexHealth,
Dental Intelligence Engagement (Modento/LocalMed), RevenueWell, Solutionreach,
Weave, Adit, Lighthouse 360/360+, YAPI.

**Legend:** ✅ have · ◐ partial · ✗ missing · 📵 blocked on SMS (Phase B) ·
⭐ our exclusive (no researched vendor has it)

---

## The big picture

**Where we already win (no vendor has these):** self-serve website CMS +
Studio ⭐ · blog ⭐ · careers/ATS ⭐ · e-commerce shop ⭐ · membership plans ⭐ ·
a real logged-in patient portal ⭐ (every vendor is links-only) · loyalty-ready
commerce rails. This is the moat — never trade it away for parity features.

**The four structural gaps every vendor prices on (strategic bets, not module
work):**
1. **SMS (Phase B)** — the metered commodity ALL eight vendors sell. Reminders,
   confirmations, two-way texting, waitlist fill, text-to-pay, review requests
   are SMS-first everywhere. Half the parity gaps below become fully
   competitive the day SMS lands. Design every feature below SMS-ready
   (channel enum exists).
2. **Phones/VoIP + AI receptionist** — Weave (TrueLark), Adit, RevenueWell,
   and DI all ship 24/7 AI call answering + call-pop. The market is converging
   here fast. Phase C candidate.
3. **Insurance eligibility verification** — Weave, NexHealth, RevenueWell,
   Solutionreach, Adit all verify benefits pre-appointment (via payer portals /
   clearinghouses). Needs a partner (Vyne/Onederful/pVerify class). Roadmap.
4. **Direct mail** (RevenueWell, Lighthouse postcards/letters) — print channel
   for recall non-responders. Ops-heavy; defer indefinitely.

---

## Per-module gap lists (the working punch lists)

### 1. Appointments — RECOMMENDED FIRST MODULE
Current: agenda + windows + drawer actions + bulk + saved views + CSV + PMS
write-back + reminders (email, 30m cron) + review-request on complete.

- ✅ **ASAP/waitlist auto-fill** — SHIPPED 2026-07-02 ("fast-pass list").
  Staff add from the appointment drawer ("Wants earlier · fast-pass"), matched
  by visit type + preferred provider; cancellation auto-offers the freed slot
  by email (2h min notice, earlier-than-linked-visit only); first one-click
  claim wins via the advisory-lock insert (`/w/[token]`, token-is-auth),
  siblings flip to lost, the claimer's old visit auto-releases + re-offers
  onward. Panel on /appointments; persona-anchored demo seed. Later: SMS
  channel, patient self-serve join from the portal, staff manual "offer this
  slot" picker.
- ✅ **Booking deposits** — SHIPPED 2026-07-02. Per-visit-type `depositCents`
  (Settings → Practice → Visit types; $0 default — most clinics charge none),
  collected at website booking via the clinic's Stripe Connect account
  (fail-open: the visit books first, a payments hiccup never costs the slot),
  credited toward the visit; paid deposit auto-confirms the appointment;
  reconciliation + CSV under Shop → Payments; drawer shows paid/pending pill.
  Later: portal-booking deposits, auto-release when unpaid after N hours,
  refund-on-cancel policy control.
- ✅ **Reminder journeys** — SHIPPED 2026-07-02. Multi-touch cadence
  (`touchOffsets`, default 3 days + day-before, up to 3 touches, journey
  presets in the Emails hub; legacy single-offset blobs resolve verbatim);
  per-touch idempotency + a 20h min-gap so touches never stack; DIFFERENT
  copy for confirmed ("see you soon", its own toggle) vs unconfirmed
  (confirm CTA); **one-click email confirm** (`/c/[token]` token-is-auth
  landing, POST-confirm so scanners can't; confirmedVia 'email') replacing
  the dead "Reply CONFIRM" copy; per-visit-type **prep instructions**
  (Settings → Practice) appended to reminders + shown on the confirm page;
  save-the-date "Add to calendar" link in the booking confirmation.
  Later: SMS channel, post-visit instructions, per-type cadence overrides.
- ✗ **Family messaging consolidation** (Lighthouse) — one confirmation for a
  family with multiple same-day visits (we have guardian links). **P2.**
- ✅ **No-show follow-up** — SHIPPED 2026-07-02. On no-show the patient now
  ALSO gets the warm "we missed you — no judgment, find a new time" note
  (new no_show_rebook Emails-hub key, clinic-editable + toggleable, default
  ON; "Find a new time" button on pro/premium, call-us copy on basic; PMS
  comm-log mirror). Staff alert + auto-rebook follow-up unchanged.
- 📵 Text confirmations w/ sentiment ("any affirmative reply confirms"),
  voice-call reminders.
- Skip: recurring appointments (PMS territory).

### 2. Billing & payments outreach (Shop module + patient billing)
Current: shop/memberships/coupons ⭐, portal balance payments, collections
nudge (My Day), balance follow-up rule.

- ✅ **Email-to-pay statements** — SHIPPED 2026-07-02. "Email a pay link"
  from the patient record's balance nudge + bulk from the patient list
  (skips no-balance/no-email); clinic-editable copy (Emails hub, Billing
  category); the email's button lands on the public `/b/[token]` pay page
  (token-is-auth, live PMS balance, partial payments, Connect direct
  charge, idempotent finalize + webhook backstop, /shop/payments
  reconciliation). SMS sibling when the SMS channel lands.
- ✅ **Automated balance-reminder cadence** — SHIPPED 2026-07-02. Opt-in
  (default OFF) at Shop → Payments: balance ≥ $X → the same pay-link email
  every N days, capped at M sends per rolling 90 days ("after that it's a
  phone call"); manual sends pause the schedule (3-day anti-stack guard both
  ways); demo orgs never send; rides the daily retention cron. No aging
  buckets yet (PMS gives a point-in-time balance only) — threshold + cadence
  stand in until an aging source exists.
- ✗ **Payment plans w/ card-on-file autopay** for balances (DI) — we have
  subscription rails via Connect. **P2.**
- ✗ Collections/AR board (DI) — AR aging view beyond the payments page. **P2.**
- ✗ Financing partners (CareCredit/Sunbit/Affirm at 5 vendors). **P3 —
  partnership.**
- ✗ Treatment-plan presentation w/ financing (Adit/DI). **P3** (edges the
  clinical boundary; needs PMS treatment-plan read).
- Skip: terminals/tap-to-pay hardware, surcharging (for now).

### 3. Recall & Outreach (Marketing)
Current: audiences, campaigns + funnel attribution, outreach queue,
birthday/reactivation autos, templates, promote-view-to-audience.

- ✅ **"Use your benefits" / insurance-expiry campaign** — SHIPPED 2026-07-02.
  Third set-&-forget automation on /marketing (opt-in, default OFF):
  Oct–Dec monthly sends to insured patients with no upcoming visit + 4
  months since the last, via the compliant scheduled-campaign rails
  (unsubscribe, tracking, visible in the campaign list). New audience
  filters `hasInsurance` + `noUpcomingVisit` are reusable by any custom
  audience; new "Use your benefits" system template.
- ✅ **Referral program** (Solutionreach Refer-a-Friend) — SHIPPED 2026-07-02:
  each patient gets one share link (`/book?ref=<token>`, lazily minted from
  the portal home's "Share the love" card — native share sheet on phones,
  clipboard elsewhere). A NEW patient booking or requesting through it gets
  `patient.referred_by_patient_id` stamped once at creation (org-scoped
  token, self-referral + overwrite guarded, never blocks the booking). The
  patient record shows both directions in a Referrals card ("Referred by
  Sophia" / "Brought 2 friends — worth a thank-you"), and the portal card
  thanks referrers with their count. Later: loyalty-program tie-in, referral
  leaderboard in analytics.
- ✅ **Monthly patient newsletter** — SHIPPED 2026-07-02, the unfair-angle
  version: "Draft this month's issue" on /marketing builds the newsletter
  from the clinic's latest published BLOG posts (title + excerpt + read-on-
  site links, {{firstName}}/{{bookingUrl}} merge) as a DRAFT campaign in
  the normal composer — review before send, compliant campaign rails,
  auto-managed all-patients opt-in audience. Lights up once a post is
  published. Later: auto-monthly cadence option, section curation.
- ✗ **Post-op follow-up campaigns** cadenced by procedure type (RW via CDT
  groupings) — needs PMS procedure codes (OD gives us this). **P2 (post-OD).**
- ✗ Treatment-plan follow-up campaign (RW/Lighthouse/DI) — unscheduled
  diagnosed treatment nudges. **P2/P3 (needs PMS treatment plans).**
- ✗ Patient surveys / NPS (SR/Lighthouse; `npsEnabled` stub exists). **P3.**
- Skip: direct-mail postcards, RevenueWell TV.

### 4. Messages
Current: unified thread inbox (in_app+email), receipts, attachments, AI
drafts, quick-book, scheduled send, star/unread, after-hours auto-reply,
Gmail mailbox, templates.

- ✅ **Website "message us" widget** — SHIPPED 2026-07-02 (Weave Text
  Connect / RW web chat parity, email-reply channel for v1). Brand-colored
  bubble on every public clinic page (site layout mount, bottom-left, away
  from the mobile-actions stack); name + email + message → an inbound
  thread in /messages (channel=email, so the reply composer defaults to
  the visitor's inbox — no account needed); repeat visitors thread to the
  same patient record (`source:'website_chat'`, lead lifecycle); honeypot +
  time-trap + rate limit, silent drops. Default ON with an off switch in
  Settings → Practice → Online booking. Later: SMS channel, known-patient
  portal-thread handoff, office-open presence hint.
- ◐ **Bulk/broadcast messaging** ("office closed today") — we have bulk email
  via patients list; make it a first-class /messages action w/ segment pick.
  **P2.**
- ◐ Inbox urgency categorization (SR) — we triage the Gmail mailbox with AI;
  extend triage to patient threads. **P3.**
- ✗ AI translations / preferred-language sending (NexHealth). **P3.**
- 📵 Two-way SMS (the module's biggest unlock), missed-call text-back,
  voicemail drops.

### 5. Front-desk automation (Follow-ups + My Day + Overview)
Current: follow-ups board + smart rules (balance/recall/unconfirmed) +
auto-rebook, My Day cockpit, morning-huddle Overview, daily digest email.
We're already ahead of most vendors here EXCEPT:

- ✅ **Per-patient audit of tomorrow's schedule** — SHIPPED 2026-07-02, one
  better than Lighthouse's nightly batch: computed LIVE at render/send
  (lib/services/patient-audit.ts). Every visit checked for: unconfirmed,
  pending booking deposit, no intake on file, balance to settle,
  unreachable (no email/phone), first visit, first-visit-back-after-lapse,
  birthday this week — plain-language reasons, clean visits stay quiet.
  Surfaces: "Tomorrow's patients — worth a look" on My Day + a 🔍 section
  in the morning digest. Later: family-member-due consolidation, more
  checks as data sources land (insurance eligibility, procedure prep).
- ✗ Patient-arrival / in-office flow board (YAPI dashboard, DI LiveOps) —
  check-in → seated → ready states. **P3** (needs in-office usage patterns).
- ✗ Team chat (Weave/DI/YAPI/RW). **P3 — big lift, weigh vs Slack.**

### 6. Reviews
Current: Google-first auto-loop, threshold auto-feature, hide, private
feedback, FB read-only, escalation, sidebar badge.

- ✅ **Star-gate before routing** — SHIPPED 2026-07-02. Opt-in
  `starGateEnabled` (Reviews settings, default OFF; demo ON): /r/[token]
  asks "how was your visit?" first; every rating sees the SAME public
  links (FTC-clean by construction), a 1–3★ answer just LEADS with the
  private-feedback form (public path one tap below, never hidden) and
  pre-fills the rating. Gate rating recorded on review_request.rating.
- ✅ **AI reply drafts** for Google reviews — SHIPPED 2026-07-02. "✨ Draft
  with AI" on /reviews/received drops a draft into the reply editor (never
  auto-posts; posts through the existing Zernio GBP reply rail). Prompt
  bakes in the public/HIPAA guardrails (never confirm patienthood or
  clinical detail; low ratings apologize + invite a call). Metered via
  ai_usage_counter kind 'review_reply_draft' (premium 200 / pro 80 / basic
  20 per month).
- ✗ Review-site steering by patient email domain (Lighthouse Gmail→Google).
  **P3 — cute, low value for us (already Google-first).**
- ✗ Competitor benchmarking (SR). **P3.**

### 7. Intake Forms
Current: v2 overhaul (types, conditional, OCR, AI summary, Spanish,
packets, auto-send, reminders, OD chart mirror).

- ✅ **In-office kiosk/tablet mode** — SHIPPED 2026-07-02. "Kiosk ↗" on
  each /intake-forms row opens the public form with `?kiosk=1`: chrome
  locked (no links off the form), post-submit screen says "hand it back"
  and auto-resets to a blank form for the next patient. Later: QR handoff
  to the patient's phone, front-desk PIN to exit.
- ✗ **Procedure-code-triggered consent auto-send** (DI/YAPI: consent forms
  auto-attach when procedure codes appear on the schedule) — post-OD. **P2.**
- ✗ Virtual check-in / arrival-by-text (SR/DI/YAPI). **P3 (📵 for text).**
- ✅ Everything else is at or above parity.

### 8. Patients
Current: relationship record, tags, docs, merge, saved views, timeline,
import/export, bulk comms, portal invites.

- ✗ **Loyalty program** (DI's unique feature) — points for kept visits /
  referrals / on-time payment, redeemed in OUR shop (no vendor can match the
  redemption side). **P2/P3 — differentiator, pairs with referrals.**
- ✅ Household/family view — SHIPPED 2026-07-02. "Family" card on the
  patient record (guardian / dependents / same-household via the portal's
  guardian links; getFamilyForPatient) — the front desk sees the household
  in one glance and can hop between records. Later: family glyph on the
  list, family confirmation consolidation (Appointments P2 pairs with it).
- ✅ Patient Finder-equivalents (saved views + ⌘K) at parity.

### 9. Analytics · 10. Portal · 11. Website/SEO/Careers/Blog
- Analytics: at/above parity for the no-PMS case (huddle ✅, funnels ✅,
  proof ✅). Per-provider scorecards + production analytics unlock post-OD
  (honest deferral already in place). Call analytics 📵/phones.
- Portal: ⭐ exclusive. Add virtual check-in later (P3).
- Website/SEO/Careers/Blog/Shop: ⭐ exclusive territory — keep compounding.

---

## Recommended module order (deepening program)

1. **Appointments** — waitlist auto-fill + booking deposits + reminder
   journeys (P1s above). Largest table-stakes gap, all email-capable today,
   all SMS-ready by design.
2. **Billing outreach** — email-to-pay + automated balance cadence (+ AR
   view). Money features; Connect rails already live.
3. **Front-desk automation** — the nightly patient audit (Lighthouse killer
   feature; our follow-ups engine is 80% of the way there).
4. **Recall & Outreach** — use-your-benefits + referral + newsletter.
5. **Messages** — website text-us widget + broadcast polish.
6. **Reviews** — star-gate + AI replies.
7. **Intake Forms** — kiosk mode (+ procedure consents once OD approves).
8. **Patients** — household view + loyalty/referrals build-out.

Re-run pricing/packaging comparison after SMS lands (our $99–199 vs their
$249–499/location is a weapon — every parity feature widens it).
