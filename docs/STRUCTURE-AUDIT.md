# DreamCRM Structure Audit — features by purpose vs competitor organization

Working document (2026-07-13). Three stages:
1. **Inventory** — every feature + setting in the clinic dashboard, organized by purpose, with exact placement.
2. **Competitor benchmark** — how the comparable products structure the same purpose (nav placement, naming, sub-pages, where settings live).
3. **Adjustments** — the change list that falls out of comparing 1 against 2.

Status: COMPLETE (2026-07-13). All three stages done; the 4-item change list
at the bottom shipped in the same session. Log future placement findings in
docs/FINISHING.md.

---

## Stage 2a — Competitor benchmark: engagement suites (NexHealth, Weave, RevenueWell, Solutionreach, YAPI, Adit)

### NexHealth
- **Top nav**: Home (day view + action alerts) · Activity (event log) · Patients · then product modules: Scheduling, Communications (Templates), Forms, Payments, Analytics. Reviews/Recall/Waitlist are NOT nav items — they are template TYPES inside Communications. Global settings = gear icon, upper-right.
- **Forms**: Forms → Manage Forms; a library of common forms to use/edit; per-form editor. **Form automation lives INSIDE each form**: a "Send automatically" toggle + rules (patient status New/Returning, frequency e.g. every 12 months, age, procedure codes, appointment types). Admin-gated.
- **Communications**: everything automated is a "Template" with one grammar — gray Action tile (trigger) → purple Email/SMS tiles → + to add steps. Categories: Appointment Journeys, Daily Automations (missed appt, cancellation, review requests), Post-Appointment (follow-up, Recall), Patient-Based (New Patient, Birthday), Manually-Triggered (payment requests, waitlist, form request/reminder).
- **Timing is GLOBAL**: gear → Settings → Template configurations (sending/quiet hours). Content in-feature, schedule global.
- Reviews: toggle on the Home screen per-patient; auto-send post-visit; rating-gated routing (≤3★ stays private).

### Weave
- Modules: Phones, Messages, Email, Team Chat, Calendars, Reviews, Payments, Forms, Insights, Email Marketing. "New Weave" adds a Dashboard landing + Contacts + notification center; right-side utility panel (Team Chat, Task Center, Quick Fill, Schedule Pulse).
- **Auto-Messaging is the single hub** for ALL outbound automation (reminders, confirmations, recall, review requests). Reminder config in-feature: name, before/after, presets 1hr/1day/1wk/2wk/4wk or custom, time-of-day, audience (all/confirmed/unconfirmed), appointment type.
- **Centralized Settings app** (gear, top-right) with a left settings menu: Subscriptions, Payments Settings (role-gated to Super Admin/Payment Admin), Reviews setup, preferences.
- (Help pages JS-rendered; sidebar ordering unconfirmed verbatim.)

### RevenueWell
- "Universal Wrapper" app-switcher shell: Phone · Messenger · Insights · Campaigns (+ Forms, Scheduling, Virtual Visits, Team Chat). Settings moved to top-right; Location Selector in top nav.
- **Campaigns** = the marketing hub; 100+ templates; **Automatic Campaigns** toggle-on (Birthday, Expiring Benefits, Reactivation); CDT/procedure-code targeting.
- **Timing is GLOBAL**: Settings → Phone & SMS (Phone Schedule + Text Message Schedule). Same content/schedule split as NexHealth.
- Forms are location-scoped via the top-nav Location Selector; Enterprise Forms for DSOs.

### Solutionreach
- Discrete product areas: Conversations (opens as its own app/tab), Reminders, Recall, Reviews/Reputation, Surveys/NPS, Newsletters/Campaigns, Online Scheduling, Check-In. Multi-location via "Location Hub". (In-app settings placement not publicly documentable.)

### YAPI
- Organized by DEVICE/SURFACE, not modules: Desktop Dashboard · in-office iPad app (the intake/kiosk surface) · POP patient portal. Forms are the anchor: builder + 30+ library, zero-click PMS sync on check-in.

### Adit
- Module-catalog IA: 15–25 branded modules (Adit Voice, Texting, Email, Call Tracking, Internal Chat, eFax, Patient Forms, Insurance Verification, Online Scheduling, Pozative Reviews, Reminders, Mobile App, Practice Analytics, Practice Health Score, Treatment Plans, CareCredit, Patient Recall, Adit Pay + Digital Marketing family: Website Design, SEO, Email Marketing, Google/Meta Ads).
- Per-module settings under a top-nav **Preferences** area, scoped by location (evidenced: Pozative → Preferences → location → Review Request Flow).

### Cross-platform patterns (engagement)
1. **Content vs schedule split is near-universal** — message content lives in the feature hub; sending/quiet hours live in global Settings (NexHealth, RevenueWell). Weave keeps both in-feature.
2. **Automation is a first-class NAMED hub** (Templates / Auto-Messaging / Campaigns); reviews, recall, waitlist are *types within it*, not nav modules.
3. **Forms rules live in-feature, per form** (NexHealth's "Send automatically" + rules is the reference pattern).
4. Two settings philosophies: centralized Settings app (Weave) vs location-scoped Preferences (RevenueWell, Adit) — DSO-orientation predicts the latter.

---

## Stage 2b — Competitor benchmark: growth / money / website (Birdeye, Podium, Dental Intelligence, Kleer, BoomCloud, Weave Payments, Pearly, Wix, Squarespace, ProSites, GDW, Shopify)

### Reviews & reputation
- **Birdeye**: left rail of products — Reviews (unified read/respond feed w/ filters + per-review actions + response templates), Campaigns (the ASK side: requests + a Templates tab), Reports/Dashboards (analytics, separate). Three verbs, three homes: read/respond · request · report.
- **Podium**: everything lands in an All-in-one Inbox; Settings in left nav; Review Automations + AI reply drafting. Caution: over-consolidation blurs where automations live.
- **NexHealth reviews**: auto-request post-visit, per-appointment-type config, rating-gate (integrity gray area — be deliberate).

### Dental analytics — Dental Intelligence
- Morning Huddle (INSIDE the Analytics module) with a **Yesterday / Today / Tomorrow** tab spine; widgets: MTD production forecast, schedule by provider/operatory, Suggested Patients, Follow Up Attempts.
- Metrics (Analytics) vs actions (Follow Ups: call/text tasks w/ due dates) vs audiences (Patient Finder: segmentation for marketing) — three nouns, three surfaces, shared data.

### Membership plans — Kleer/Clerri + BoomCloud
- Four sub-areas: **Plan Builder** (pricing, fee schedules, covered services, templates; plan config IS the settings layer) · **Members** (enrollment, renewals) · **Billing** (recurring charges, smart retry, ACH) · **Reporting** (MRR/ARR/churn front-and-center).
- Branded member portal as a separate patient-facing surface. Clerri Bridge embeds enrollment inside the PMS schedule view (growth action where staff already work).

### Payments & AR — Weave Payments + Pearly
- Weave: Payment Requests dashboard with a **status-tab spine (All / Paid / Unpaid / Refunds)** + provider/date/status/method filters; requests fire from the dashboard OR the patient profile (dual entry); Text-to-Pay; Payment Plans; a dedicated **Payments Settings** page (merchant/account config out of the transactional list).
- Pearly: module-per-noun — Billing & A/R Automation, Digital Statements, Payment Plans, Membership Plans, Online Payments, Letter Automation, Reporting, PMS Integrations. Rules-based dunning: balance qualification → timed omni-channel touches → smart retries. Membership nests INSIDE the payments product.

### Website builders (reference IA)
- **Wix dashboard**: Home · Getting Paid · Sales · Customers & Leads · Site & Mobile App (SEO lives here) · Apps · Settings (business info, site settings, DOMAINS, roles). Page DESIGN happens in the separate Editor. SEO also aggregates under Marketing & SEO → SEO Dashboard.
- **Squarespace**: mandatory sidebar core — Website, Analytics, Marketing, Contacts, Finance; toggleable — Products/Services, Invoicing, Content, Memberships, Donations, Scheduling ("Customize Sidebar" control). Pages under Website → Pages panel (with a "Not linked" section).
- **ProSites / Great Dental Websites**: dental site platforms bundle reviews + SEO + chat + hosting INTO the website product — validates folding reputation/SEO/chat into the site side.

### Shopify core nav (authoritative)
Home · Orders · Products · Customers · Marketing · Discounts · Content · Analytics · Sales channels (Online Store = theme/design as a CHANNEL) · Apps · **Settings pinned separately bottom-left** (store-wide config; feature config stays in-feature).

### Cross-platform patterns (growth/money/website)
1. Verb/noun separation recurs: read/respond vs request vs report (Birdeye); metrics vs actions vs audiences (DI).
2. The two portable list spines: **status tabs** (All/Paid/Unpaid/Refunds) and **temporal tabs** (Yesterday/Today/Tomorrow).
3. Settings split cleanly: pinned global Settings for account/merchant/store-wide; feature config in-feature (templates in Campaigns, plan config in the Plan Builder).
4. Vertical bundling validated: dental website platforms bundle reviews/SEO/chat; Pearly nests membership inside payments.

---
## Stage 1 — Inventory: every feature + setting, by purpose

### Purpose: Daily Operations Cockpit
- **Overview /dashboard** — morning-huddle header + legend; integrations-health + website check-engine banners; 7 plan-gated attention cards (unconfirmed, intake submissions, balances, new leads, unanswered messages, follow-ups due, orders to fulfill); today's chair; 5 trend KPIs; activity feed; reviews-received card; honest SMS placeholder; welcome modal + getting-started checklist.
- **My Day /my-day** — personal KPI strip; my follow-ups (interactive complete/reassign); my conversations; today's schedule w/ in-office breadcrumbs; tomorrow-audit (live per-visit prep audit); personal digest opt-out. Settings: clinic-wide morning digest toggle lives on /followups (rules card); personal opt-out on /my-day.
- **Follow-ups /followups** — mine/everyone + due filters; due-grouped board; complete/reopen/reassign; quick-add from any drawer. Settings IN-FEATURE: auto-add rules (balances / overdue recalls / unconfirmed visits, default off) + morning digest toggle (owner/admin).

### Purpose: Scheduling & Reminders
- **Appointments /appointments** — window filters; 8 attention chips; provider/source filters; search; saved views; CSV export; day-grouped agenda w/ aging borders; inline confirm/complete; bulk bar (reminders/complete/no-show/follow-up); booking drawers (chair-aware slots, walk-in); full appointment drawer (status, tags, context stats, reminder log, intake, deposits, fast-pass waitlist, in-office flow); waitlist panel; ?appt/?new deep links.
- Settings (the big scattered cluster): reminder timing + multi-touch journey + forms-nudge → **Settings→Automations→Emails (reminder card)**; 5 appointment email copies same hub; visit types (duration/deposit/bookable-website/bookable-portal/prep) → **Settings→Practice**; providers + chairs/recall/lapsed → Practice; self-scheduling master → Practice→Online booking; portal bookable types + notice windows → **Settings→Portal→Booking**; deposits require Stripe (Shop); calendar feed → Business profile.

### Purpose: Patient Communications
- **Messages /messages** — status/assignment/unread/star filters; search; broadcast megaphone (segments, 500 cap); one-thread-per-patient; patient context strip; AI urgency banner; triage toolbar (assign/snooze/archive/star); in-place booking; tags + quick follow-up; receipts; composer (channel select, templates, AI draft, Español, attachments, schedule-send).
- **Mailbox /inbox** — Gmail categories/intent chips/accounts; bulk actions; add-patient-from-email; compose; keyboard nav; auto-sync. Settings: /inbox/settings (connect/disconnect/reclassify, Tier-2 patient-sender designation).
- Settings elsewhere: message templates → **Settings→Message templates**; after-hours auto-reply → **Settings→Portal→Voice & display**; AI allowance = plan.

### Purpose: Patient Records & Relationship
- **Patients /patients(+/[id])** — status/source/tag filters + search + sortable columns; saved views (premium → audience); import/export CSV; bulk email/tag/portal-invite/pay-link; detail: header actions (message/book/intake/review/edit), lifecycle + glyphs, stat strip, needs-attention rail, follow-ups/tags/identity/family/referral/loyalty panels, filtered timeline, notes, documents, archive/merge.
- Settings: portal-invite + pay-link email copy → Automations; recall/lapsed thresholds → Practice; loyalty visibility → Shop loyalty config.

### Purpose: Intake & Forms
- **/intake-forms** — form list w/ stats + public URL; standard-template seeding; default-form badge (auto-attaches to booking confirmations); preview / KIOSK mode / edit; builder (sections, 14 field types incl. signature + insurance-card OCR, conditional visibility); AI Spanish translation; packets (multi-form links); submission viewer + AI pre-visit summary; send-intake from patient/appointment.
- Settings: intake_request email + forms-completion reminder toggle → **Settings→Automations→Emails**; default form = flag on the form.

### Purpose: Lead Management
- **/leads** — status chips w/ counts; rot borders; search; CSV; bulk contacted/archive; drawer (contact, UTM attribution, ladder new→contacted→convert w/ dedupe, archive-with-reason, fresh-lead pill).
- Settings: contact_ack auto-reply email → Automations; the forms that generate leads → Website→Forms; self-booking-off routes requests to Messages.

### Purpose: Reviews & Reputation
- **/growth/reviews** — setup gate; funnel + Google KPIs; platform mix; NPS pulse; ready-to-ask list w/ per-patient send; activity; **ReviewConfigPanel IN-FEATURE** (place ID, auto-send, feature-min-stars, private feedback, star-gate, NPS, more platforms, min-days-between); /received (read/respond: sync, reply + AI draft, hide/show-on-site, Facebook read-only, private feedback). review_request email copy → Automations (deep-linked).

### Purpose: Patient Marketing & Recall
- **/growth/outreach** — 4 attention KPIs → queue tiers; upcoming sends; 30d funnels; saved segments; activity; **Automations card IN-FEATURE** (birthday / reactivation / use-your-benefits toggles); newsletter one-click draft. **/queue** — tier sections + per-tier send CTA. **/growth/campaigns(+[id])** — table + editor (TipTap, AI draft/rewrite, channel resend/Gmail, audience, preview, send/schedule/cancel, stats, per-recipient table). **/growth/audiences** — segment editor (lifecycle/recall/source/tags/last-visit/balance/birthday + opt-in toggles, live preview).
- **PLACEMENT FINDING**: refer-a-friend program lives ONLY in Shop→Loyalty + patient portal — invisible from Growth.

### Purpose: Social Media
- **/growth/social** — multi-channel composer (GBP post types, event/offer fields, char caps, media, CTA, schedule, per-channel preview); history/calendar; comment manager. Connect + cap + $ add-on → Integrations (canonical) w/ billing summary card.

### Purpose: Analytics & Reporting
- **/growth/analytics** (premium) — 30/90 ranges; scorecard; acquisition (sources, funnels, GBP local, site visits); social performance; schedule health; recall funnel + won-back attribution; reputation proof; honest PMS-deferral; everything drills to filtered surfaces.

### Purpose: Website & Online Presence
- **/website** hub (live-site card, PublishCard, checklist, 30d snapshot, 10 doors) + editor (Studio: in-place edit, AI bar w/ allowance, undo, publish bar) + content (10 section forms) + design (brand color, heroes, video) + templates (gallery w/ live per-card iframes) + pages (live/needs pills, copy overrides, per-page SEO meta) + forms (2 lead-form builders + chat-widget toggle + submissions glance) + blog (Pro; AI drafts, calendar) + seo (Pro; health score, GSC, GBP local) + careers (Premium; ATS) + domain (DNS wizard + auto-poll) + share (QR cards). Draft→Publish across all editing. /welcome AI interview drafts the whole site.
- Identity (names/contact/hours/logo/timezone/sender) → **Settings→Business profile** (+ GBP sync w/ per-field provenance, calendar feed).

### Purpose: Online Booking
- Self-scheduling master + visit types (durations/deposits/bookable flags/prep) + providers + chairs → **Settings→Practice** (4 tabs). Portal bookable types + earliest-booking notice + reschedule/cancel cutoff → **Settings→Portal→Booking**. **SPLIT FINDING**: booking config spans two settings pages with no single home.

### Purpose: Patient Portal
- **Settings→Portal** — feature switches (booking/reschedule/messages/billing/payments/records/forms/family/shop); booking windows; voice & display (welcome, announcement, care note, team photos, after-hours auto-reply); preview-as-patient.

### Purpose: Payments & AR
- **/shop/payments** — online-payments reconciliation; deposits table; CSV; **balance-reminder cadence card IN-FEATURE** (min balance, cadence days, max sends). **/shop/collections** — open balances + dunning state; email pay link; payment plans (propose 2–12 installments, autopay, public accept, progress table). Stripe Connect onboarding = Shop hub.

### Purpose: E-commerce & Memberships
- **/shop** hub — Stripe panel, storefront banner, low-stock nudges, sales KPIs, doors, catalog, fulfillment/storefront/tax toggles, **loyalty config card** (points per visit/referral/payment, redeem threshold/value). Products (variants, FSA, fulfillment). Orders (state machine + CSV). Memberships (plans: interval/price/discount/benefits w/ redemption counters; members + MRR). Coupons (manual + birthday generator + loyalty-minted).

### Purpose: Integrations & Data Sync
- **/integrations** — bundle-grouped catalog, search, cap meter, per-kind connect flows, PMS demand capture, social add-on (canonical), preferred GBP account. Open Dental detail = full sync dashboard (connect key, direction, auto-sync, KPIs, scope, mapping, logs). Google Business detail. **Settings→Apps** = connected-accounts status (Gmail health, Stripe, platform-only Resend/Anthropic/PubSub).

### Purpose: Team / Account / Notifications / Security
- Team (invite/roles/pending), Billing (plan grid, Stripe portal, cancel/resume, invoices, social summary), Account (profile/email/password/text size), Notifications (bell buckets, digest, pause-all), Security (sessions, password), Feedback (+ platform inbox). Redirect stubs: reminders/plans/seo.

---

## Stage 3 — Synthesis: our placement vs the competitor norm, purpose by purpose

Our house pattern (established across the earlier consolidation passes): **feature
hubs own their own behavior config in-feature** (Reviews config panel, Outreach
automations card, balance-reminder cadence card, follow-up rules card), while
**message COPY + send timing live in one Automations hub**
(Settings→Automations→Emails) that features deep-link into, and **account/business-
wide config stays in pinned Settings**. That pattern matches the strongest
cross-competitor norms (content-vs-schedule split, automation as a named hub,
Settings pinned & separate — NexHealth, RevenueWell, Shopify). The verdicts
below hold every purpose area against both the norm and our own pattern.

| Purpose | Our placement | Competitor norm | Verdict |
|---|---|---|---|
| Daily cockpit | Overview + My Day + Follow-ups (3 surfaces) | DI Morning Huddle w/ temporal spine; metrics/actions/audiences as separate nouns | **Keep** — we already split metrics (Analytics) / actions (Follow-ups) / audiences (Audiences) exactly like DI. |
| Scheduling & reminders | Agenda in-feature; reminder journey + copy in Automations hub | Automation hub + global timing (NexHealth/RevenueWell) | **Keep the hub; add the missing deep link** — Appointments links the confirmation email but NOT the reminder journey. |
| Patient communications | /messages + /inbox; templates in Settings→Message templates (deep-linked from composer) | Templates hub (NexHealth) / in-feature (Weave) | **Keep** — deep link already exists. |
| Patient records | /patients + detail | Standard | **Keep.** |
| Intake & forms | Builder + default-form flag in-feature; request copy + completion reminders in Automations | Per-form "send automatically" rules in-feature (NexHealth) | **Keep** — default-form auto-attach is our in-feature rule; copy correctly lives in the hub. |
| Leads | /leads triage | Standard | **Keep.** |
| Reviews & reputation | /growth/reviews (ask + config in-feature) · /received (read/respond) · Analytics reputation panel (report) | Birdeye's 3 verbs: request · read/respond · report | **Keep** — we match the reference IA verb-for-verb. |
| Marketing & recall | Outreach hub w/ in-feature automations card + campaigns + audiences | Campaigns hub w/ toggle-on automatic campaigns (RevenueWell) | **Keep the hub; fix one hole** — refer-a-friend is a growth program but is INVISIBLE from Growth (config only on the Shop hub, stats only on patient detail + portal). |
| Social | /growth/social; connect/caps in Integrations | Module gated by connections | **Keep.** |
| Analytics | /growth/analytics, drills to filtered surfaces | Reports separate from action surfaces (Birdeye/DI) | **Keep.** |
| Website | Manage hub (/website) + separate visual Studio | Wix/Squarespace manage-vs-edit split | **Keep** — plus one code seam: the chat-widget toggle renders on Website→Forms but its save action lives in settings/practice/actions.ts. |
| Online booking | SUPPLY side (master toggle, visit types, providers, chairs) in Settings→Practice; portal RULES (allowed types, notice, cutoffs) in Settings→Portal→Booking | Single scheduling product area (NexHealth Scheduling, Solutionreach) | **Adjust with cross-links, not a merge** — verified `minNoticeHours` is consumed only by portal surfaces, so the two homes are semantically real (supply vs portal rules). But NEITHER page links to the other; an owner configuring booking can't find the second half. |
| Patient portal | Settings→Portal (switches, booking rules, voice, preview) | Separate patient-facing surface w/ its own config | **Keep.** |
| Payments & AR | /shop/payments (reconciliation + cadence in-feature) + /shop/collections; Connect onboarding on the Shop hub | Weave: status-tab spine + dedicated Payments Settings; Pearly: module-per-noun | **Keep** — the Shop hub Stripe panel IS our payments-settings home; the cadence card follows our in-feature-config pattern. |
| Memberships | /shop/memberships (plans + members + MRR, one page) | Kleer: Plan Builder / Members / Billing / Reporting (4 areas) | **Keep** — one page is right at our scale; the 4 Kleer nouns are all present on it. |
| Integrations | /integrations catalog + per-integration detail; Settings→Apps = connected-account status | Marketplace + per-module preferences | **Keep.** |
| Team/account/security | Settings card grid | Pinned Settings (Shopify) | **Keep.** |

### Change list (ranked, structure-only)

1. **Bridge the booking split** — cross-link both homes: Settings→Practice→Online
   booking gets a "Portal booking rules" link (allowed types / notice / cutoffs
   → /settings/portal), and Settings→Portal→Booking gets a "Visit types,
   providers & chairs" link back (→ /settings/practice). No settings move —
   the homes are semantically correct; the bridge is what's missing.
2. **Surface refer-a-friend from Growth** — the outreach hub gets a
   referral-program door/card linking to the existing Shop→Loyalty config
   (where the program lives), so a growth-minded owner can find it. No config
   moves; no new features.
3. **Appointments → reminder-journey deep link** — alongside the existing
   "Edit confirmation email" action, link the reminder card
   (`/settings/automations/emails?email=appointment_reminder`).
4. **Chat-widget action seam** — the toggle renders on /website/forms but its
   server action lives in settings/practice/actions.ts; move the action next
   to its route (code hygiene, zero user-facing change).

Everything else verified in place. Non-structural observations parked for
docs/FINISHING.md: public-site booking does not consume the portal notice
windows (behavior gap, not placement); review auto-send timing anchor already
tracked in CLAUDE.md open items.
