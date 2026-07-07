// Help-docs content for /docs. Plain structured content checked into the
// repo (the same honesty bar as everything else: every step describes the
// product as it actually ships — if a doc would need to lie, fix the
// product or don't write the doc).

export interface DocSection {
  heading?: string
  paragraphs?: string[]
  steps?: string[]
}

export interface DocArticle {
  slug: string
  title: string
  summary: string
  category: string
  minutes: number
  sections: DocSection[]
}

export const DOC_CATEGORIES = [
  'Getting started',
  'Front desk, daily',
  'Patient-facing',
  'Money & integrations',
] as const

export const DOCS: DocArticle[] = [
  /* ── Getting started ────────────────────────────────────────────── */
  {
    slug: 'create-your-practice-account',
    title: 'Create your practice account',
    summary: 'From signup to a live website and working dashboard in about ten minutes.',
    category: 'Getting started',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'Signing up creates three things at once: your practice organization, your staff login, and your practice website at your-practice.dreamcreatestudio.com.',
        ],
        steps: [
          'Click Get started and create your login (you can switch to passwordless sign-in links later).',
          'Answer the onboarding questions — practice name, services, hours, contact details. These seed your website copy, your booking rules, and your portal.',
          'Pick a plan. Basic is the website tier; Pro adds the daily front-desk tools; Premium adds analytics, shop, careers, and the PMS sync. Everything is month-to-month.',
          'Finish checkout and you land on your dashboard. Your public site is already live on your subdomain.',
        ],
      },
      {
        heading: 'What to do next',
        paragraphs: [
          'Your Overview page shows a Getting-started checklist that tracks real setup state — it checks items off automatically as you complete them anywhere in the app. Start with your logo and team photos: they change how the site feels more than anything else.',
        ],
      },
    ],
  },
  {
    slug: 'your-first-30-minutes',
    title: 'Your first 30 minutes',
    summary: 'The setup order that gets a practice live with the least backtracking.',
    category: 'Getting started',
    minutes: 5,
    sections: [
      {
        paragraphs: [
          'Everything on this list lives on the Getting-started checklist on your Overview, and each item deep-links to the right screen.',
        ],
        steps: [
          'Add your logo and a real photo (Website → hover the hero → Replace photo). Template sites convert badly; real practices convert.',
          'Set your office hours (Settings → Clinic profile). Hours drive your website, your booking slot grid, and the portal footer all at once.',
          'Introduce your team with photos and a sentence of bio — they appear on your site and on patient-facing visit cards.',
          'Invite your front desk (Settings → Team). Everyone gets their own login.',
          'Skim Settings → Patient portal and click "Preview as a patient" to see what patients will see before you share anything.',
        ],
      },
      {
        heading: 'If you run Open Dental',
        paragraphs: [
          'Connect it early (Business → Integrations) — patients, visits, and balances sync in, so you skip manual patient entry entirely. See "Connecting Open Dental" for the key exchange.',
        ],
      },
    ],
  },
  {
    slug: 'editing-your-website',
    title: 'Editing your website',
    summary: 'The Website Studio lets you change your live site by clicking on it.',
    category: 'Getting started',
    minutes: 4,
    sections: [
      {
        paragraphs: [
          'Open Website in the sidebar. What you see is your real, live site in an editable canvas — not a form-based admin page.',
        ],
        steps: [
          'Hover any section and click "Edit" to change its content in a focused editor; Save publishes immediately.',
          'Click your tagline or practice name to edit the text right in place.',
          'Click any photo to replace it; uploads go straight to your media storage.',
          'Navigate to your other pages (About, Services, FAQ…) inside the canvas — editing follows you across the whole site.',
          'Services come from a curated dental library: pick what you offer and the detail pages, FAQs, and navigation build themselves. You can have the AI tailor each service’s copy to your practice voice.',
        ],
      },
      {
        heading: 'Ownership, in plain terms',
        paragraphs: [
          'Your content is yours. There is no agency queue and no "contact support to change a word" — and if you ever leave, your text and images export with you.',
        ],
      },
    ],
  },
  {
    slug: 'inviting-your-team',
    title: 'Inviting your team',
    summary: 'Logins for the front desk, roles, and what each role can do.',
    category: 'Getting started',
    minutes: 2,
    sections: [
      {
        steps: [
          'Go to Settings → Team and enter a teammate’s email.',
          'Pick a role: Owner and Admin can change practice settings, billing, and the portal; Member covers daily front-desk work.',
          'They receive an invite email; accepting it creates their personal login.',
        ],
        paragraphs: [
          'Each person’s first sign-in gets the welcome tour and their own page-by-page hints — dismissing a hint only dismisses it for them, so training a new hire costs you nothing.',
        ],
      },
    ],
  },

  /* ── Front desk, daily ──────────────────────────────────────────── */
  {
    slug: 'the-morning-huddle',
    title: 'The morning huddle (your Overview)',
    summary: 'One screen at the start of the day: today’s chair, who needs a nudge, what came in overnight.',
    category: 'Front desk, daily',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'The Overview is built around the dental morning-huddle ritual. Every number on it is clickable and lands you on the filtered list it came from.',
          'Today’s chair lists the day’s visits with per-patient flags: ★ first visit, 🎂 birthday, $ outstanding balance, 📝 intake still missing. Attention cards above it surface unconfirmed visits in the next 48 hours, new website leads, and recent form submissions.',
          'If your practice is new, the Getting-started checklist sits on top; it disappears on its own once setup is genuinely done.',
        ],
      },
      {
        heading: 'The fastest habit to build',
        paragraphs: [
          'Press ⌘K (Ctrl+K on Windows) anywhere and type a patient’s name — patients, their upcoming visits, their conversation threads, and every page in the app are one keystroke away.',
        ],
      },
    ],
  },
  {
    slug: 'managing-the-schedule',
    title: 'Managing the schedule',
    summary: 'The agenda list, confirmations, reschedules, and the aging colors.',
    category: 'Front desk, daily',
    minutes: 4,
    sections: [
      {
        paragraphs: [
          'Appointments is an agenda, not a wall calendar: today pinned on top, grouped by day, with a count of who still needs confirming. Unconfirmed visits grow an amber edge that turns red as the visit gets close — the schedule shows you where to spend your next five minutes.',
        ],
        steps: [
          'Click any row to open the visit drawer: confirm, send a reminder email, reschedule, mark completed or no-show.',
          'Reschedules use the same live slot grid patients see, keep the visit’s length, and email the patient the new time automatically.',
          'Select several rows to send reminder emails in one batch.',
          'Filter chips cover the useful slices: unconfirmed, needs intake, new patients, cancellations.',
        ],
      },
      {
        heading: 'Where bookings come from',
        paragraphs: [
          'Every visit carries its source — your public site’s booking page, the patient portal, or the front desk — so you can see which channels actually fill chairs. If Open Dental is connected, bookings push into it automatically and cancellations clear the old slot there too.',
        ],
      },
    ],
  },
  {
    slug: 'leads-to-patients',
    title: 'From website lead to patient',
    summary: 'The triage queue for contact and insurance-check requests.',
    category: 'Front desk, daily',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'Every contact-form and insurance-verifier submission on your website becomes a lead with a timestamp and source attribution. Fresh leads have a green edge; the edge drifts to red as hours pass untouched — speed-to-call is the whole game with web leads.',
        ],
        steps: [
          'Open a lead to see everything they submitted, plus which page and campaign they came from.',
          'Mark it Contacted once you’ve reached out.',
          'Click Convert to patient — it creates the patient record (de-duplicating by phone and email) and lands you on their page to book the first visit.',
        ],
      },
    ],
  },
  {
    slug: 'messages-and-your-inbox',
    title: 'Messages & your clinic inbox',
    summary: 'One thread per patient, plus your practice Gmail inside the dashboard.',
    category: 'Front desk, daily',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'Messages shows one conversation per patient. Portal messages and their emails merge into the same thread, and threads a patient is waiting on grow the same aging edge as everything else. Replies can go out as portal messages or email; canned templates cover the three most common replies.',
          'Inbox is your connected Gmail account for everything that isn’t a patient thread — triage, assign, and resolve as a team. Connect it under Inbox → Connect; patient emails are recognized and linked onto their patient thread automatically.',
        ],
      },
    ],
  },

  /* ── Patient-facing ─────────────────────────────────────────────── */
  {
    slug: 'setting-up-the-patient-portal',
    title: 'Setting up the patient portal',
    summary: 'Feature toggles, notice windows, your welcome copy, and preview-as-patient.',
    category: 'Patient-facing',
    minutes: 5,
    sections: [
      {
        paragraphs: [
          'Settings → Patient portal controls everything patients can see and do. The rule throughout: a feature you switch off disappears completely — patients never see a dead link or a greyed-out button.',
        ],
        steps: [
          'Toggle features: booking, self-reschedule/cancel, messages, billing, online payments, records, forms, family access.',
          'Set which visit types patients can book online. Procedure visits are off by default so the front desk books the right chair time.',
          'Set your notice windows: how close to a visit patients can self-reschedule or cancel before the portal says "call us" instead.',
          'Write your welcome headline and message, an optional announcement bar, and an after-visit care note that shows for a week after each completed visit.',
          'Click "Preview as a patient" — a watermarked replica with your saved settings and a sample patient.',
        ],
      },
      {
        heading: 'How patients sign in',
        paragraphs: [
          'Patients use passwordless sign-in: they enter their email and tap the link we send. Invitations go out from the patient’s record (the Invite button), and family access lets a parent manage their kids’ visits from one login — link dependents on the patient’s Edit form.',
        ],
      },
    ],
  },
  {
    slug: 'online-booking-rules',
    title: 'Online booking rules',
    summary: 'Where the slot grid comes from and how to keep wrong bookings out.',
    category: 'Patient-facing',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'The public booking page and the portal both offer real openings: your office hours minus what is already on the books, in your practice’s timezone. Two patients can’t take the same slot — the second one is asked to pick again.',
        ],
        steps: [
          'Office hours (Settings → Clinic profile) define the grid; closed days say "we’re closed", sold-out days say so honestly.',
          'Portal settings restrict which visit types are self-bookable and how much notice a booking needs.',
          'Every confirmation email includes your intake form link when one is set as default.',
        ],
      },
    ],
  },
  {
    slug: 'reviews-collection',
    title: 'Collecting reviews',
    summary: 'Request after good visits, feature the best on your website, stay FTC-clean.',
    category: 'Patient-facing',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'Reviews work text-first: the patient writes their words on your review page, you choose which become testimonials on your website with one click — their exact words, never edited. After submitting, patients are invited to share on Google (and the platforms you configure), which is where public reputation actually compounds.',
        ],
        steps: [
          'On Reviews, add your Google review link (plus Healthgrades or Facebook if you use them).',
          'Send requests from the Ready-to-ask list, or from any patient’s page after a visit.',
          'Everyone gets the same ask — no rating-gating — which keeps you on the right side of the FTC’s fake-reviews rule.',
          'A per-patient rate limit prevents over-asking; the default is one request a year.',
        ],
      },
    ],
  },
  {
    slug: 'recall-campaigns',
    title: 'Recall & outreach campaigns',
    summary: 'Audiences that build themselves, warm templates, and booked-visit attribution.',
    category: 'Patient-facing',
    minutes: 4,
    sections: [
      {
        paragraphs: [
          'Recall & Outreach turns your patient data into audiences that stay current on their own: due or overdue for a cleaning, lapsed, new patients, birthdays this month. If Open Dental is connected, its recall due dates drive the "due" status directly.',
        ],
        steps: [
          'Pick an audience (or define one with the patient filters).',
          'Start from a system template — reactivation, birthday, welcome — and make it sound like you.',
          'Send or schedule. The funnel shows Sent → Opened → Clicked → Booked, attributed to real bookings, not just opens.',
          'Patients can opt out in one click from any email; opt-outs are honored everywhere automatically.',
        ],
      },
    ],
  },

  /* ── Money & integrations ───────────────────────────────────────── */
  {
    slug: 'connecting-open-dental',
    title: 'Connecting Open Dental',
    summary: 'The official-API sync: what you need, what syncs, and what never moves.',
    category: 'Money & integrations',
    minutes: 5,
    sections: [
      {
        paragraphs: [
          'DreamCRM talks to Open Dental exclusively through its official API — every write lands in your OD audit trail, and nothing ever touches the database directly. You’ll need OD’s eConnector running (their standard remote-access service) and a Customer API key for your office.',
        ],
        steps: [
          'In Open Dental: Setup → Advanced Setup → API → Add Key to create your office’s Customer Key (OD bills API access ~$30/mo).',
          'In DreamCRM: Business → Integrations → Open Dental, paste the key, choose one-way (import) or two-way.',
          'Run the first sync. Patients, appointments, providers, balances, and recall due dates come in; the field map on the page shows exactly what reads and writes.',
          'With two-way on: bookings made on your site or portal push into OD, cancellations clear the OD slot, and our confirmations/reminders mirror into each patient’s CommLog.',
        ],
      },
      {
        heading: 'What never syncs',
        paragraphs: [
          'Charts, procedures, claims, prescriptions, imaging. Clinical records stay in your PMS — by design, not limitation. Sync health is monitored; if syncs stall or fail repeatedly you get a banner on your Overview, not silence.',
        ],
      },
    ],
  },
  {
    slug: 'setting-up-your-shop',
    title: 'Setting up your shop & memberships',
    summary: 'Stripe Connect, products, membership plans — payouts to your own bank.',
    category: 'Money & integrations',
    minutes: 4,
    sections: [
      {
        paragraphs: [
          'The shop runs on your own Stripe account, so product sales and membership subscriptions pay out to your bank directly — we never hold your money.',
        ],
        steps: [
          'On Shop, click Connect Stripe and finish Stripe’s hosted onboarding.',
          'Add products with variants, prices, and stock; toggle pickup or flat-rate shipping.',
          'Create membership plans (annual or monthly) with the benefits you include; patients join from your site and the member list tracks benefit usage.',
          'Enable the storefront and it appears on your public site; orders land in Shop → Orders with a fulfillment pipeline.',
        ],
      },
    ],
  },
  {
    slug: 'plans-and-billing',
    title: 'Plans & billing',
    summary: 'What each tier includes, switching plans, and how to cancel.',
    category: 'Money & integrations',
    minutes: 2,
    sections: [
      {
        paragraphs: [
          'Basic ($150/mo) is the website tier: the site, the edit-in-place studio, AI copy help, and lead capture. Pro ($250/mo) adds the daily front office: patients, agenda, leads queue, messages, intake forms, reviews, the patient portal, blog and SEO. Premium ($500/mo) adds recall campaigns, analytics, the shop and memberships, careers, and the Open Dental sync. Annual billing gives you two months free.',
          'Switch tiers any time under Settings → Plan; changes prorate through Stripe. Cancelling stops the next renewal — there is no term contract, and your website content exports with you.',
        ],
      },
    ],
  },
  {
    slug: 'online-balance-payments',
    title: 'Online balance payments',
    summary: 'Let patients pay their balance from the portal, and how reconciliation works.',
    category: 'Money & integrations',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'With Stripe connected and the payments toggle on (Settings → Patient portal), patients see their PMS balance in the portal and can pay it by card. Payments settle to your Stripe account.',
          'One honest detail matters: your PMS owns the ledger. DreamCRM records the payment and shows the patient an "as of" date, but the front desk posts it to the PMS ledger like any other card payment — the next sync then reflects the updated balance. Each payment records the balance the patient saw at pay time to make reconciliation unambiguous.',
        ],
      },
    ],
  },

  /* ── Front desk, daily (new systems) ────────────────────────────── */
  {
    slug: 'fast-pass-waitlist',
    title: 'The fast-pass waitlist',
    summary: 'Fill a cancelled slot before it goes empty — automatically.',
    category: 'Front desk, daily',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'A cancellation is a hole in the day and lost production. The fast-pass waitlist closes it: when a booked visit cancels, the freed slot is offered to patients who asked to be told if something opened sooner — first-come, one-click to claim.',
        ],
        steps: [
          'Patients join the waitlist themselves from your portal ("notify me if something opens sooner") or you add them from the Appointments drawer.',
          'When a matching slot frees up (same visit type, same provider window), the earliest waitlisted patient gets an email with a one-click claim link.',
          'They claim it; the visit books and confirms in one step, and the rest of the list is told the slot is taken.',
          'You see "Fast-pass filled — [name]" on the schedule so it never surprises the desk.',
        ],
      },
      {
        heading: 'Why it beats a sticky note',
        paragraphs: [
          'The old way — a paper list you phone through when someone cancels — only works if the desk has time to make calls. This works while the phones are busy, at 9pm, on a weekend. The patient claims the slot themselves.',
        ],
      },
    ],
  },
  {
    slug: 'follow-ups-that-run-themselves',
    title: 'Follow-ups that run themselves',
    summary: 'A reminders board that fills itself from balances, recall, and unconfirmed visits.',
    category: 'Front desk, daily',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'Follow-ups is the "nothing slips" board. Rules watch your patient data and create a follow-up when a patient needs a nudge — an outstanding balance, an overdue recall, an unconfirmed visit — so the team works a list instead of trying to remember.',
        ],
        steps: [
          'Open Follow-ups (Daily → Follow-ups). Each card is a patient + a reason + who it’s assigned to.',
          'Claim an unassigned card, work it (call, text, email), and check it off — it clears from the board.',
          'The smart rules run hourly: balance reminders, recall-due nudges, unconfirmed-visit chases, and an auto-rebook when someone no-shows.',
          'Use ⌘K → "add follow-up" to drop a manual reminder on any patient from anywhere in the app.',
        ],
      },
      {
        heading: 'The sidebar badge',
        paragraphs: [
          'A due count sits on the Follow-ups sidebar entry so the board is never out of sight. Zero is the goal; the rules make sure the list is always the real one.',
        ],
      },
    ],
  },
  {
    slug: 'digital-intake-forms',
    title: 'Digital intake forms',
    summary: 'Photo & insurance-card fields, OCR autofill, AI pre-visit summaries, kiosk mode, and packets.',
    category: 'Front desk, daily',
    minutes: 4,
    sections: [
      {
        paragraphs: [
          'Intake Forms turns the clipboard into a link. Patients complete forms before they arrive — on their phone — and you get a clean, searchable submission plus an AI pre-visit summary, so chair time starts on time.',
        ],
        steps: [
          'Every practice starts with a standard new-patient form; edit fields or build your own (Intake Forms → the form editor).',
          'Add photo and insurance-card fields — the card image runs through OCR to pre-fill carrier and member details for the patient to confirm.',
          'Conditional fields show follow-up questions only when relevant, so the form stays short.',
          'Forms send automatically before a visit and chase gently if not completed; returning patients get a pre-filled form to just confirm.',
          'For walk-ins, open kiosk mode on a tablet at the desk — the same form, no login.',
        ],
      },
      {
        heading: 'Where the answers go',
        paragraphs: [
          'Each submission attaches to the patient with an AI summary of what matters for the visit, offered in Spanish when needed. If Open Dental is connected, a copy of the completed form is mirrored into the patient’s chart as an honest text note — never a fabricated structured-field sync.',
        ],
      },
    ],
  },
  {
    slug: 'broadcast-messaging',
    title: 'Broadcast messaging',
    summary: 'Send one message to a whole segment of patients at once.',
    category: 'Front desk, daily',
    minutes: 2,
    sections: [
      {
        paragraphs: [
          'Sometimes you need to reach a group fast — "we’re closing early Friday," "Dr. Lee has openings next week." Broadcast lets you message a segment from the inbox without building a campaign.',
        ],
        steps: [
          'In Messages, click the 📣 Broadcast button (owner/admin).',
          'Pick a segment with a live count — today’s visits, tomorrow’s visits, the next 7 days, or all active opt-in patients.',
          'Write the message; each recipient gets it in their own thread, so their replies come back to your inbox normally.',
          'A 500-recipient cap keeps this for genuine broadcasts — bigger sends belong in Recall campaigns with funnel tracking.',
        ],
      },
    ],
  },

  /* ── Patient-facing (new systems) ───────────────────────────────── */
  {
    slug: 'post-visit-surveys',
    title: 'Post-visit surveys (NPS)',
    summary: 'A quiet 0–10 pulse after each visit, with unhappy patients escalated to the owner.',
    category: 'Patient-facing',
    minutes: 2,
    sections: [
      {
        paragraphs: [
          'After a visit, patients can be asked a single question — how likely are you to recommend us, 0 to 10 — by email and inside the portal. It’s the honest early-warning system: you hear about a rough visit before it becomes a public 1-star.',
        ],
        steps: [
          'A promoter (9–10) is invited onward to leave a public review — the good visits become reputation.',
          'A detractor (0–6) never gets a public-review push; instead the owner is emailed so someone can reach out personally.',
          'An optional comment lets the patient say what happened, in their words.',
          'Scores roll up so you can see the trend, not just single answers.',
        ],
      },
    ],
  },
  {
    slug: 'family-access',
    title: 'Family access',
    summary: 'One login runs the whole household — parents manage kids’ visits, forms, and balances.',
    category: 'Patient-facing',
    minutes: 2,
    sections: [
      {
        paragraphs: [
          'Households don’t want a login per person. With family access on (Settings → Patient portal), one passwordless login manages everyone linked to it — the parent confirms the kids’ visits, fills their forms, and sees their balances from one place.',
        ],
        steps: [
          'A patient requests to link a family member from inside their portal message thread; you approve it.',
          'Once linked, the portal shows a person-switcher — every action (reschedule, forms, payment) applies to the selected family member.',
          'Household appointment reminders consolidate: one email per household per day instead of four.',
        ],
      },
    ],
  },
  {
    slug: 'loyalty-and-referrals',
    title: 'Loyalty & refer-a-friend',
    summary: 'Reward visits and turn happy patients into new-patient referrals.',
    category: 'Patient-facing',
    minutes: 2,
    sections: [
      {
        paragraphs: [
          'Two growth loops that run off patients you already have. The loyalty program awards points for visits; refer-a-friend gives each patient a share link and credits them when a new patient books through it.',
        ],
        steps: [
          'Turn on referrals in the portal (Settings → Patient portal); each patient gets a unique share link.',
          'When someone books through that link, the booking is attributed to the referrer and surfaced to your team.',
          'Loyalty points accrue on completed visits — a quiet reason to keep coming back.',
        ],
      },
    ],
  },

  /* ── Money & integrations (new systems) ─────────────────────────── */
  {
    slug: 'booking-deposits',
    title: 'Booking deposits',
    summary: 'Take a deposit on high-value visit types so the slot is real.',
    category: 'Money & integrations',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'For visit types where a no-show is expensive, you can require a deposit at booking. Money down means the appointment is confirmed, and it’s credited toward the visit — this needs Stripe connected (your account, your payout).',
        ],
        steps: [
          'Set a deposit amount per visit type (Settings → Practice).',
          'When a patient books that type online, they pay the deposit through Stripe Checkout; the appointment flips to confirmed automatically.',
          'The deposit shows in your payments reconciliation, credited toward that visit — post it to your PMS ledger when convenient.',
        ],
      },
    ],
  },
  {
    slug: 'payment-plans',
    title: 'Payment plans with autopay',
    summary: 'Let patients pay a balance in installments on a card kept on file.',
    category: 'Money & integrations',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'When a balance is too big to pay at once, offer a payment plan instead of sending it to collections. The patient accepts online, a card is kept on file, and installments charge themselves.',
        ],
        steps: [
          'Propose a plan from the Collections board (2–12 months, with sensible floors).',
          'The patient accepts on a secure link and saves a card (Stripe Connect, SETUP mode) — the first installment charges on accept.',
          'Remaining installments charge automatically each month; declines retry a few times, then park for the desk to handle.',
          'Every installment records a payment for reconciliation, and the plan’s status is visible on the board.',
        ],
      },
    ],
  },
  {
    slug: 'membership-plans',
    title: 'In-house membership plans',
    summary: 'Your answer for uninsured patients — a subscription that keeps them coming.',
    category: 'Money & integrations',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'In-house membership plans are the uninsured-patient answer: a monthly or annual subscription that bundles cleanings, exams, and a discount, billed through your own Stripe account. They sell from your website and the portal.',
        ],
        steps: [
          'Build plans in the Shop (Business → Shop → Memberships) — price, billing interval, and included benefits.',
          'Patients subscribe from your public site or the portal upsell; billing runs on Stripe Connect subscriptions.',
          'Benefit usage is tracked so the front desk knows what a member has left this period.',
        ],
      },
    ],
  },
  {
    slug: 'collections-and-ar',
    title: 'The collections workboard',
    summary: 'Work open balances honestly, with pay-links and a dunning state per patient.',
    category: 'Money & integrations',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'Collections (Business → Shop → Collections) lists open PMS balances so the desk can work them in order, send a pay-by-email link, and see where each patient is in the follow-up — without inventing aging numbers the PMS didn’t give us.',
        ],
        steps: [
          'Sort by largest open balance; each row shows the latest pay-link status and last online payment.',
          'Send a pay-link in one click; the patient pays online and it lands in your reconciliation.',
          'Escalate a stubborn balance into a payment plan right from the board.',
        ],
      },
    ],
  },
  {
    slug: 'requesting-a-pms-integration',
    title: 'Requesting your PMS integration',
    summary: 'Run Dentrix, Eaglesoft, or Curve? Raise your hand and we’ll notify you when it’s ready.',
    category: 'Money & integrations',
    minutes: 2,
    sections: [
      {
        paragraphs: [
          'Open Dental syncs today, two-way, through its official API. The other major PMSs — Dentrix Ascend, Dentrix desktop, Eaglesoft, Curve — are on the roadmap, and each depends on a vendor partnership or approval we pursue based on real demand. We won’t claim a sync works before it does.',
        ],
        steps: [
          'Open Business → Integrations and find your PMS in the Practice Management group.',
          'Click "Notify me when it’s ready." That records your practice’s interest against that PMS.',
          'We prioritize the vendor partnerships with the most practices waiting — and email you the day yours goes live.',
        ],
      },
      {
        heading: 'Why not just "turn it on"?',
        paragraphs: [
          'Because a real integration goes through the vendor’s sanctioned path (the Henry Schein One API Exchange for Dentrix Ascend, Patterson Innovation Connection for Eaglesoft, and so on), not a database scraper. That’s slower to enable, but it’s the only way every write lands in your audit trail — the same standard we hold for Open Dental.',
        ],
      },
    ],
  },
  {
    slug: 'custom-domains',
    title: 'Using your own domain',
    summary: 'Point your practice domain at your DreamCRM site with managed SSL.',
    category: 'Money & integrations',
    minutes: 3,
    sections: [
      {
        paragraphs: [
          'Your site ships on your-practice.dreamcreatestudio.com, but you can put it on your own domain (yourpractice.com) with a managed certificate — patients never see our subdomain.',
        ],
        steps: [
          'Add your domain in Settings and we’ll give you the DNS records to add at your registrar.',
          'Add those records; the certificate provisions automatically once DNS resolves.',
          'Your site, booking, and portal all serve from your domain — the subdomain keeps working as a fallback.',
        ],
      },
    ],
  },
]

export function getDoc(slug: string): DocArticle | undefined {
  return DOCS.find((d) => d.slug === slug)
}

export function docsByCategory(): Array<{ category: string; articles: DocArticle[] }> {
  return DOC_CATEGORIES.map((category) => ({
    category,
    articles: DOCS.filter((d) => d.category === category),
  }))
}
