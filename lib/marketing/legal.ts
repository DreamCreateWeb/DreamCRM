// The two legal documents the public site carries: the Privacy Policy and the
// Terms of Service.
//
// THEY ARE DATA, AND EVERY FACT IN THEM IS RESOLVED, for the reason the help
// docs are (`lib/marketing/docs.ts`): a policy is the page on this site most
// likely to be written once and then contradicted by the product. The trial's
// length is `TRIAL.days`, the prices are `getQuotedPlan()`, the cookie
// lifetimes are the constants the middleware sets them with — so the day one
// of those moves, the page that makes a promise about it moves too.
//
// WHAT THESE PAGES MAY NOT SAY (docs/COMPLIANCE.md). No statement that the
// service meets, satisfies or is certified against any health-privacy or
// security standard, and none of the words that would read as one. The
// product makes no such claim anywhere, and a policy page is the worst place
// to start. What they do instead is describe, plainly, what information goes
// where — including to which other companies — and say whose job each legal
// duty is. `tests/marketing/legal-pages.test.tsx` holds that vocabulary at
// zero and checks every named provider against the list below.
//
// NOT REVIEWED BY A LAWYER. Written from the code's real behaviour on
// 2026-11-23 at the owner's direction; the clauses a lawyer most needs to
// read are the limit of liability, the governing-law clause, and what the
// Terms say (and deliberately do not say) about patient information.

import { ATTRIBUTION_COOKIE, ATTRIBUTION_COOKIE_MAX_AGE_SECONDS } from '@/lib/marketing-attribution'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'

const PLAN = getQuotedPlan()

/** Who operates the service — the name and address a policy has to carry. */
export const OPERATOR = {
  business: MARKETING.companyName,
  person: 'Dustin Russenberger',
  street: '180 Sally St',
  cityLine: 'Ward, AR 72176',
  email: 'dustin@dreamcreateweb.com',
} as const

/** The day these documents last changed, as an ISO date. */
export const LEGAL_UPDATED = '2026-11-23'

/**
 * Every other company that information is sent to, and why. ONE list, quoted
 * by the Privacy Policy — add a provider to the product and it belongs here
 * in the same change, or the policy is wrong on the day it ships.
 */
export const SERVICE_PROVIDERS: ReadonlyArray<{ name: string; does: string }> = [
  { name: 'Amazon Web Services', does: 'hosting, the database and file storage' },
  { name: 'Stripe', does: 'payments and billing' },
  { name: 'Resend', does: 'sending email' },
  {
    name: 'Anthropic',
    does: 'the AI features — the text or images a feature is asked to work on are sent to produce the result',
  },
  {
    name: 'Google',
    does: 'a Gmail or Google Business account when you connect one, map and listing lookups, and the fonts practice websites load',
  },
  { name: 'Zernio', does: 'the Google Business Profile and social-media connections' },
  { name: 'NexHealth', does: 'the connection to a practice-management system, when a practice turns it on' },
  { name: 'Stedi', does: 'insurance eligibility checks, when a practice runs one' },
  { name: 'name.com', does: 'domain registration, when a practice buys a domain through us' },
]

export interface LegalSection {
  /** The in-page anchor. */
  id: string
  heading: string
  paragraphs?: string[]
  bullets?: string[]
  /** Paragraphs that follow the bullets. */
  after?: string[]
}

export interface LegalDoc {
  path: '/privacy' | '/terms'
  title: string
  /** One line, for the hero and the page description. */
  summary: string
  updated: string
  sections: LegalSection[]
}

const COOKIE_DAYS = Math.round(ATTRIBUTION_COOKIE_MAX_AGE_SECONDS / 86_400)
const CONTACT_LINE = `${OPERATOR.business}, ${OPERATOR.street}, ${OPERATOR.cityLine} — ${OPERATOR.email}`
const BILLING_PAGE = 'Settings → Plan & billing'

export const PRIVACY_POLICY: LegalDoc = {
  path: '/privacy',
  title: 'Privacy Policy',
  summary: 'What information DreamCRM collects, what it is used for, and which other companies it is sent to.',
  updated: LEGAL_UPDATED,
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      paragraphs: [
        `${MARKETING.productName} is software for dental practices, provided by ${OPERATOR.business}, which is operated by ${OPERATOR.person}. This policy covers this website and the ${MARKETING.productName} service.`,
        `Questions and requests go to ${CONTACT_LINE}.`,
      ],
    },
    {
      id: 'two-kinds',
      heading: 'Two kinds of information',
      paragraphs: [
        'There are two kinds of information here, and they are treated differently.',
        `The first is information we collect for ourselves: about people who visit this site, practices that sign up, and practices we contact about ${MARKETING.productName}. We decide what is collected and why, and most of this policy is about it.`,
        `The second is the information a practice keeps in ${MARKETING.productName} about its own patients. The practice decides what is collected and what it is used for; we handle it on the practice’s behalf. If you are a patient of a practice that uses ${MARKETING.productName}, that practice’s own privacy notice applies to your information, and a request about it should go to the practice.`,
      ],
    },
    {
      id: 'what-we-collect',
      heading: 'What we collect for ourselves',
      bullets: [
        'Account details: your name, email address and password (stored as a hash, not as typed), your practice’s name, address and phone number, and the staff you invite.',
        'Billing: Stripe takes payment for us. Card numbers go to Stripe and are not stored on our servers. We keep the Stripe references for your account and subscription, your plan, and the status of your invoices.',
        'What you send us: messages to support, your answers in the setup interview, and a practice-grade request (the practice it is about and the email address to send the report to).',
        `How you found us: one first-party cookie (${ATTRIBUTION_COOKIE}, kept for ${COOKIE_DAYS} days) remembers the first page you landed on, the site that sent you, any campaign tags in the link and, if you arrived from an ad, that ad’s click identifier. If you sign up, that record is saved with your account.`,
        'Page views: we count visits to our own pages ourselves.',
        'Sign-in cookies, which keep you signed in.',
        `Public information about dental practices: business name, address, phone number, website and public listing and review information, used to contact practices about ${MARKETING.productName}. Every such email says how to stop them, and we honor that.`,
      ],
      after: [
        'We do not run third-party advertising or analytics trackers on this site.',
      ],
    },
    {
      id: 'how-we-use-it',
      heading: 'What we use it for',
      bullets: [
        'To provide the service, bill for it and answer support requests.',
        'To send the emails the service needs: sign-in links, trial and billing notices, and security notices.',
        'To learn which of our marketing works. If you arrived from an ad and then signed up, we may tell that ad platform that the click led to a signup.',
        `To contact practices that may want ${MARKETING.productName}.`,
        'To keep the service running, find faults and prevent abuse.',
        'To meet legal obligations.',
      ],
      after: ['We do not sell personal information.'],
    },
    {
      id: 'who-receives-it',
      heading: 'Other companies it is sent to',
      paragraphs: ['These companies process information for us so that the service can work:'],
      bullets: SERVICE_PROVIDERS.map((p) => `${p.name} — ${p.does}.`),
      after: [
        'We also disclose information when the law requires it. If the business were sold, the information would pass to the new owner, and we would tell account owners.',
      ],
    },
    {
      id: 'patient-information',
      heading: 'Patient information we handle for practices',
      paragraphs: [
        'A practice can keep its patients’ contact details, appointments, messages, forms (including the health history the practice asks for), insurance details, balances, payments and documents in the service.',
        'We use that information only to provide the service to that practice: showing it to the practice’s staff, sending the reminders and messages the practice sets up, keeping it in step with the practice’s own practice-management system, and running the checks the practice asks for. When a patient pays a practice through the service, the payment goes to the practice’s own Stripe account.',
        'When a practice uses an AI feature — to summarize an intake form, read an insurance card or draft a reply — the content it is asked to work on is sent to our AI provider to produce the result.',
        'We do not sell patient information and we do not use it to advertise to patients.',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies',
      bullets: [
        'Sign-in cookies, set when you sign in.',
        `${ATTRIBUTION_COOKIE} — how you first found us, described above. First-party, ${COOKIE_DAYS} days.`,
        'partner_ref — set for 30 days when you arrive through a referral partner’s link, so the partner is credited if you sign up.',
      ],
      after: ['None of these is an advertising cookie from another company.'],
    },
    {
      id: 'safeguards',
      heading: 'How it is protected',
      paragraphs: [
        'Connections to the service are encrypted (HTTPS), and the database is encrypted at rest.',
        'No system can promise that nothing will ever go wrong. If we learn of a breach that affects your information, we will tell you as the law requires.',
      ],
    },
    {
      id: 'keeping-and-deleting',
      heading: 'Keeping and deleting',
      paragraphs: [
        'We keep account information while the account is open. If a subscription ends, the practice’s data is not deleted automatically, so a practice that comes back finds everything where it left it.',
        'A practice can ask us to delete its account and its data, and we will, apart from records we are required to keep, such as billing records. Copies in backups age out on the normal backup schedule.',
      ],
    },
    {
      id: 'your-choices',
      heading: 'Your choices',
      bullets: [
        'Account owners can see and correct their account and practice details in Settings.',
        'Every marketing email from us has a link that stops them.',
        `To ask for a copy of the information we hold about you, or for it to be deleted, write to ${OPERATOR.email}. We answer as quickly as we can, and within the time the law that applies to you requires.`,
        'If you are a patient of a practice, ask the practice.',
      ],
    },
    {
      id: 'children',
      heading: 'Children',
      paragraphs: [
        'This site and the service are for dental practices and the people who work in them. They are not directed to children, and we do not knowingly collect information from children for ourselves. A practice may keep records about patients who are minors; that information is the practice’s, as described above.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      paragraphs: [
        'When this policy changes we post the new version here with a new date. If a change is significant, we also email account owners before it takes effect.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      paragraphs: [CONTACT_LINE],
    },
  ],
}

export const TERMS_OF_SERVICE: LegalDoc = {
  path: '/terms',
  title: 'Terms of Service',
  summary: 'The agreement between your practice and Dream Create: the free trial, billing, cancelling, and who is responsible for what.',
  updated: LEGAL_UPDATED,
  sections: [
    {
      id: 'agreement',
      heading: 'The agreement',
      paragraphs: [
        `These terms are the agreement between ${OPERATOR.business}, operated by ${OPERATOR.person} (“we”), and the practice that signs up for ${MARKETING.productName} (“you”). By creating an account you agree to them, and the person creating the account confirms that they are allowed to agree on the practice’s behalf.`,
      ],
    },
    {
      id: 'the-service',
      heading: `What ${MARKETING.productName} is`,
      paragraphs: [
        `${MARKETING.productName} is front-office software for dental practices: a practice website, online booking, a patient portal, messages, reviews, recall and outreach, forms, insurance checks and tools for taking payments.`,
        'It is not a practice-management system, and it does not give clinical, legal, tax or insurance advice. We improve the service continually, so features are added and changed over time.',
      ],
    },
    {
      id: 'free-trial',
      heading: 'Your free trial',
      paragraphs: [
        `A new practice starts with a ${TRIAL.name}. A payment card is required to start it. Nothing is charged during the trial.`,
        `When the trial ends, your subscription begins and the card is charged the price of the plan and billing period you chose when you added it — currently ${usd(PLAN.price)} a month, or ${usd(PLAN.annualPrice)} a year — plus sales tax where it applies.`,
        `You can cancel at any time during the trial from ${BILLING_PAGE}, and if you do, you are not charged. We email the account owner a reminder about a week before the trial ends and again the day before.`,
        'There is one free trial for each practice. If we set your practice up for you directly, the trial and price are the ones we agreed with you in writing.',
      ],
    },
    {
      id: 'billing',
      heading: 'Subscription, renewal and cancelling',
      paragraphs: [
        'Your subscription renews automatically at the start of each billing period — each month or each year, whichever you chose — and the card on file is charged in advance for that period, until you cancel.',
        `You can cancel at any time from ${BILLING_PAGE}. Cancelling stops the next renewal; you keep access for the period you have already paid for.`,
        'If you subscribed at the founding practice rate, we will not raise that rate while your subscription continues without a break.',
        'If a payment fails we try the card again and tell you. If it stays unpaid, the subscription ends and access is suspended until billing is set up again.',
        `If you believe you were charged in error, write to ${OPERATOR.email} and we will put it right.`,
      ],
    },
    {
      id: 'when-it-ends',
      heading: 'When a trial or subscription ends',
      paragraphs: [
        'When a trial or subscription ends without a paid subscription in place, access to the dashboard stops, your public website shows a holding page, and automated messages stop.',
        'Your data is kept so that you can return, and you can ask us to delete it — see the Privacy Policy.',
      ],
    },
    {
      id: 'your-content',
      heading: 'Your content and your patients’ information',
      paragraphs: [
        'What you put into the service is yours. You give us permission to host and process it in order to provide the service to you.',
        'You are responsible for having the right to collect and use the information you put in — including the consent needed to contact your patients — and for meeting the health-privacy and other laws that apply to your practice.',
        'We handle patient information only to provide the service to you, as the Privacy Policy describes. These terms do not state that using the service satisfies any particular legal or regulatory requirement that applies to you.',
        'You can export your patient list from the service.',
      ],
    },
    {
      id: 'acceptable-use',
      heading: 'Acceptable use',
      bullets: [
        'Use the service only for your own practice and only lawfully.',
        'Message only patients and contacts you have a lawful basis to message.',
        'Do not try to get into another practice’s data, or to disrupt or overload the service.',
        'Do not resell the service without a written agreement with us.',
        'Keep your account details accurate and your sign-in details to yourself.',
      ],
    },
    {
      id: 'ai-features',
      heading: 'AI features',
      paragraphs: [
        'Some features draft or summarize for you. What they produce can be wrong. Read it before you rely on it or send it; what goes out to a patient is your decision.',
      ],
    },
    {
      id: 'other-services',
      heading: 'Other companies’ services',
      paragraphs: [
        'Parts of the service depend on other companies — payments, Google accounts and listings, the connection to your practice-management system, domain registration. Your use of those is also subject to their terms, and we are not responsible for their outages or decisions.',
        'When a patient pays you through the service, that payment is between you and your patient. It is processed by Stripe under your own Stripe account and Stripe’s terms.',
      ],
    },
    {
      id: 'insurance-checks',
      heading: 'Insurance checks',
      paragraphs: [
        'Eligibility and benefit information comes from the payer through a clearinghouse. It can be incomplete or out of date, and it is not a promise of coverage or of payment.',
      ],
    },
    {
      id: 'availability',
      heading: 'Availability',
      paragraphs: [
        'We work to keep the service running and to fix what breaks, but we do not promise that it will be uninterrupted or free of errors. To the extent the law allows, the service is provided as it is, without warranties of any kind.',
      ],
    },
    {
      id: 'liability',
      heading: 'Limit of liability',
      paragraphs: [
        'To the extent the law allows, our total liability to you for everything connected with the service is limited to the amount you paid us in the twelve months before the claim arose, and neither of us is liable to the other for lost profits or for indirect or consequential losses.',
      ],
    },
    {
      id: 'ending',
      heading: 'Ending the agreement',
      paragraphs: [
        'You can end this agreement at any time by cancelling. We can suspend or close an account that breaks these terms or the law, and we will give notice first where that is reasonable.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      paragraphs: [
        'When these terms change we post the new version here with a new date. If a change is significant, we email account owners before it takes effect, with time to decide whether to continue. Continuing to use the service after that date means you accept the change.',
      ],
    },
    {
      id: 'governing-law',
      heading: 'Governing law',
      paragraphs: [
        'These terms are governed by the laws of the State of Arkansas, and disputes about them are to be brought in the courts located in Arkansas.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      paragraphs: [CONTACT_LINE],
    },
  ],
}

export const LEGAL_DOCS: readonly LegalDoc[] = [PRIVACY_POLICY, TERMS_OF_SERVICE]

/** `2026-11-23` → `November 23, 2026`, from the string alone (no Date, no timezone). */
export function formatLegalDate(isoDay: string): string {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const [y, m, d] = isoDay.split('-').map((n) => Number(n))
  return `${MONTHS[m - 1]} ${d}, ${y}`
}
