// Shared structure + constants for the public marketing site
// (www.dreamcreatestudio.com). Design register: B2B SaaS (the buyer is a
// practice owner / office manager evaluating software), NOT the warm
// patient-facing language the clinic sites use. Ink + brand teal (the Dream
// Create accent), Inter, dense and concrete.

import { TRIAL_DAYS } from '@/lib/trial'

export const MARKETING = {
  productName: 'DreamCRM',
  companyName: 'Dream Create',
  tagline: 'The front-office platform for dental practices',
} as const

/**
 * The site's one money formatter.
 *
 * It lives HERE rather than beside either caller because the pricing page
 * spans the server/client boundary: `page.tsx` renders the FAQ prose, the
 * metadata and the JSON-LD on the server, and `price-card.tsx` re-formats on
 * every toggle in the browser. Exporting it from the `'use client'` card and
 * calling it from the page builds clean and then fails at collection with
 * "Attempted to call usd() from the server but usd is on the client" — caught
 * by `pnpm build`, which the vitest suite structurally cannot see (happy-dom
 * has no boundary). A neutral module is the only home that serves both, and
 * two local copies would be two answers to "how do we write a price" on the
 * one page that exists to have a single answer about price.
 */
export const usd = (n: number) => `$${n.toLocaleString('en-US')}`

/**
 * THE TRIAL, AS EVERY PUBLIC SURFACE STATES IT.
 *
 * Owner ruling 2026-11-23: a 14-day free trial, and a card is required to
 * sign up. Until then the site said "7 days free, no card" in some forty
 * places, each typed by hand — so the ruling was forty edits, and the next
 * one would have been forty more. The length comes from `TRIAL_DAYS` (the
 * number Stripe is actually given at checkout), and the card terms are
 * written ONCE here, so a page cannot promise a trial the checkout does not
 * give.
 *
 * THE CARD IS SAID OUT LOUD. A chip that only said "14 days free" would be
 * true and would still leave a practice to find the card field on the fourth
 * screen. `cardChip` sits beside the length wherever the length is a chip,
 * and `cardTerms` is the full sentence: what is taken, when it is charged,
 * and the way out.
 *
 * `tests/marketing/trial-copy.test.ts` holds the rule this replaced at zero:
 * no public surface says "no card" about our own trial.
 */
const TRIAL_DAYS_SPELLED: Record<number, string> = { 7: 'Seven', 14: 'Fourteen', 30: 'Thirty' }
const TRIAL_SPAN: Record<number, string> = { 7: 'a week', 14: 'two weeks', 30: 'a month' }

export const TRIAL = {
  days: TRIAL_DAYS,
  /** "14-day free trial" */
  name: `${TRIAL_DAYS}-day free trial`,
  /** The trust-row chip. */
  chip: `${TRIAL_DAYS} days free`,
  /** The chip beside it. */
  cardChip: 'Card required to start',
  /** The short button. */
  cta: `Start free — ${TRIAL_DAYS} days`,
  /** The long button. */
  ctaLong: `Start your ${TRIAL_DAYS}-day free trial`,
  /** The length at the head of a sentence: "Fourteen days of…". */
  daysWord: TRIAL_DAYS_SPELLED[TRIAL_DAYS] ?? String(TRIAL_DAYS),
  /** The length as a span: "run it for two weeks". */
  span: TRIAL_SPAN[TRIAL_DAYS] ?? `${TRIAL_DAYS} days`,
  /** What the card means, in one sentence. */
  cardTerms:
    'A card starts the trial. It is not charged until the trial ends, and if you cancel before then you pay nothing.',
} as const

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/**
 * Top-level marketing routes. SINGLE SOURCE for the middleware public-path
 * allowlist and the sitemap's static pages — adding a marketing page here
 * makes it public + indexed in one move (a page that exists in nav but is
 * auth-walled has shipped twice before; see middleware.ts history).
 */
export const MARKETING_PUBLIC_PATHS = ['/product', '/why', '/about', '/pricing', '/compare', '/docs', '/blog', '/grade', '/resources', '/roi', '/partner-program', '/changelog', '/privacy', '/terms'] as const
export const DEMO_URL = `https://acme-dental-demo.${SITE_DOMAIN}`

/**
 * The two legal documents (`lib/marketing/legal.ts`), as every surface links
 * them: the footer's bottom row, the signup form, and the card step. One list,
 * so a third document reaches all three at once.
 */
export const LEGAL_LINKS = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
] as const

export interface MarketingNavChild {
  label: string
  href: string
  description?: string
  external?: boolean
}

export interface MarketingNavItem {
  label: string
  href: string
  children?: MarketingNavChild[]
}

export const MARKETING_NAV: MarketingNavItem[] = [
  {
    label: 'Product',
    href: '/product',
    children: [
      { label: 'Practice website', href: '/product#website', description: 'Edit your live site by clicking it' },
      { label: 'Online booking', href: '/product#booking', description: 'Real openings, schedule-safe rules' },
      { label: 'Patient portal', href: '/product#portal', description: 'Your brand, your feature toggles' },
      { label: 'Unified messages', href: '/product#messages', description: 'Portal + email, one thread per patient' },
      { label: 'Reviews', href: '/product#reviews', description: 'Their words, your testimonials' },
      { label: 'Google Business & social', href: '/product#gbp', description: 'Sync reviews, post everywhere' },
      { label: 'Recall & outreach', href: '/product#recall', description: 'Measured in booked visits' },
      { label: 'Shop & memberships', href: '/product#shop', description: 'Payouts to your own bank' },
      { label: 'PMS sync', href: '/product#integrations', description: 'Open Dental, Dentrix + more via the NexHealth bridge' },
    ],
  },
  {
    label: 'Compare',
    href: '/compare',
    children: [
      { label: 'vs Weave', href: '/compare/weave', description: 'Phones-first comms platform' },
      { label: 'vs NexHealth', href: '/compare/nexhealth', description: 'Booking & sync platform' },
      { label: 'vs RevenueWell', href: '/compare/revenuewell', description: 'Marketing suite' },
      { label: 'vs Solutionreach', href: '/compare/solutionreach', description: 'Reminders veteran' },
      { label: 'vs Adit', href: '/compare/adit', description: 'All-in-one comms & analytics' },
    ],
  },
  { label: 'Why DreamCRM', href: '/why' },
  { label: 'Pricing', href: '/pricing' },
  {
    label: 'Resources',
    href: '/docs',
    children: [
      { label: 'Grade your practice', href: '/grade', description: 'Free — your site, listing & reviews, scored' },
      { label: 'Recall ROI calculator', href: '/roi', description: 'What missed hygiene visits cost you' },
      { label: 'Practice growth library', href: '/resources', description: 'Recall scripts, membership math, patient growth' },
      { label: 'Help docs', href: '/docs', description: 'Setup guides in front-desk language' },
      { label: 'Blog', href: '/blog', description: 'Announcements & essays from the team' },
      { label: 'Changelog', href: '/changelog', description: 'What shipped, week by week' },
      { label: 'Your first 30 minutes', href: '/docs/your-first-30-minutes', description: 'The setup order that works' },
      { label: 'Connect your PMS', href: '/docs/connecting-your-pms', description: 'One bridge, set up with you' },
      { label: 'Live demo practice', href: DEMO_URL, description: 'Browse a fully-populated clinic', external: true },
    ],
  },
]

export const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Platform tour', href: '/product' },
      { label: 'Why DreamCRM', href: '/why' },
      { label: 'About DreamCRM', href: '/about' },
  { label: 'Pricing', href: '/pricing' },
      { label: 'Live demo practice', href: DEMO_URL, external: true },
      { label: 'Patient portal', href: '/product#portal' },
      { label: 'PMS sync', href: '/product#integrations' },
    ],
  },
  {
    title: 'Compare',
    links: [
      { label: 'All comparisons', href: '/compare' },
      { label: 'DreamCRM vs Weave', href: '/compare/weave' },
      { label: 'DreamCRM vs NexHealth', href: '/compare/nexhealth' },
      { label: 'DreamCRM vs RevenueWell', href: '/compare/revenuewell' },
      { label: 'DreamCRM vs Adit', href: '/compare/adit' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Grade your practice', href: '/grade' },
      { label: 'Recall ROI calculator', href: '/roi' },
      { label: 'Dental recall scripts', href: '/resources/dental-recall-scripts' },
      { label: 'Membership plan pricing', href: '/resources/dental-membership-plan-pricing' },
      { label: 'Get more dental patients', href: '/resources/how-to-get-more-dental-patients' },
      { label: 'Dental software pricing', href: '/resources/dental-software-pricing' },
      { label: 'Help docs', href: '/docs' },
      { label: 'Blog', href: '/blog' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Create your account', href: '/signup' },
      { label: 'Sign in', href: '/signin' },
      { label: 'Partner program', href: '/partner-program' },
    ],
  },
]
