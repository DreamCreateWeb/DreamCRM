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
- ◐ **Reminder depth** — competitors: multiple cadenced reminders per visit
  w/ per-visit-type templates, DIFFERENT copy for confirmed vs unconfirmed,
  save-the-date on booking, procedure prep/post instructions attached,
  form links attached (we attach forms ✅). NexHealth wraps this as
  per-type "Appointment Journeys". **P1** (email now; voice/SMS later).
- ✗ **Family messaging consolidation** (Lighthouse) — one confirmation for a
  family with multiple same-day visits (we have guardian links). **P2.**
- ◐ **No-show follow-up** — we create a staff follow-up; vendors ALSO message
  the patient to rebook automatically. **P2.**
- 📵 Text confirmations w/ sentiment ("any affirmative reply confirms"),
  voice-call reminders.
- Skip: recurring appointments (PMS territory).

### 2. Billing & payments outreach (Shop module + patient billing)
Current: shop/memberships/coupons ⭐, portal balance payments, collections
nudge (My Day), balance follow-up rule.

- ✗ **Email-to-pay statements** — proactive "your balance + pay link" email
  from the patient record + bulk from the balances list (text-to-pay's email
  sibling; SMS-ready later). Every vendor has the SMS version. **P1.**
- ✗ **Automated balance-reminder cadence** (Weave bulk collections, DI
  past-due automation, Revenue Cycle Messaging) — opt-in automation:
  balance > X and aging > Y → cadenced emails w/ pay links. **P1.**
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

- ✗ **"Use your benefits" / insurance-expiry campaign** (RevenueWell) — the
  year-end revenue driver; auto-audience = insured patients w/ no visit since
  N months, auto-send Oct–Dec. **P1.**
- ✗ **Referral program** (Solutionreach Refer-a-Friend) — "refer a friend"
  campaign type + landing + attribution; pairs with a future loyalty program.
  **P2.**
- ✗ **Monthly patient newsletter** (RW/SR strength) — templated,
  oral-health-content newsletter w/ our blog posts as the content source
  (unique angle: we HAVE their content engine). **P2.**
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

- ✗ **Website "text us" widget** (Weave Text Connect, RW web chat) — a chat
  bubble on the clinic's public site that opens a thread in /messages
  (in_app/email now, SMS later). Distinctive twist: ours can hand off to the
  portal thread for known patients. **P1.**
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

- ✗ **Nightly per-patient audit → task list** (Lighthouse's signature: every
  night, audit each of tomorrow's patients against 20+ issues — missing
  info, unconfirmed, balance, due family members — and emit an actionable
  morning list w/ per-patient reasons). Ours = extend followup-rules into a
  "tomorrow's patients" audit feeding My Day + digest. **P1.**
- ✗ Patient-arrival / in-office flow board (YAPI dashboard, DI LiveOps) —
  check-in → seated → ready states. **P3** (needs in-office usage patterns).
- ✗ Team chat (Weave/DI/YAPI/RW). **P3 — big lift, weigh vs Slack.**

### 6. Reviews
Current: Google-first auto-loop, threshold auto-feature, hide, private
feedback, FB read-only, escalation, sidebar badge.

- ◐ **Star-gate before routing** (NexHealth: ≤3★ → private feedback flow,
  4–5★ → Google) — our /r/[token] offers both paths but doesn't ASK the
  rating first. Add optional "how was it?" gate (keep FTC-clean: never
  suppress, just route the unhappy to a human faster). **P2.**
- ✗ **AI reply drafts** for Google reviews (Weave). We have the AI rails. **P2.**
- ✗ Review-site steering by patient email domain (Lighthouse Gmail→Google).
  **P3 — cute, low value for us (already Google-first).**
- ✗ Competitor benchmarking (SR). **P3.**

### 7. Intake Forms
Current: v2 overhaul (types, conditional, OCR, AI summary, Spanish,
packets, auto-send, reminders, OD chart mirror).

- ✗ **In-office kiosk/tablet mode** (Weave/Adit/YAPI/DI) — locked-down
  fill-at-the-desk mode + QR handoff. **P2.**
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
- ◐ Household/family view — we have guardian links (portal); surface a
  family unit on the clinic side (family glyph, one card). **P2.**
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
