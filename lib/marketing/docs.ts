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
          'Basic ($99/mo) is the website tier: the site, the edit-in-place studio, AI copy help, and lead capture. Pro ($149/mo) adds the daily front office: patients, agenda, leads queue, messages, intake forms, reviews, the patient portal, blog and SEO. Premium ($199/mo) adds recall campaigns, analytics, the shop and memberships, careers, and the Open Dental sync. Annual billing gives you two months free.',
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
