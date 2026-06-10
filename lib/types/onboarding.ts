// Client-safe types + copy for the clinic-staff tutorial system: the
// first-run welcome tour, the Getting-started activation checklist, and
// the per-module hint banners.
//
// Design: checklist completion is DERIVED from real org data (a logo
// exists, a patient exists...) — never stored — so it can't lie. Only
// dismissals are stored, per staff member.

import type { PlanTier } from '@/lib/modules/types'

export interface ActivationTask {
  id: string
  label: string
  /** One warm sentence: why this matters, in front-desk language. */
  body: string
  href: string
  done: boolean
}

export interface ActivationChecklist {
  tasks: ActivationTask[]
  doneCount: number
  totalCount: number
  allDone: boolean
}

/** Definition side of a task — the service pairs each with a live `done` check. */
export interface ActivationTaskDef {
  id: string
  label: string
  body: string
  href: string
  minPlan?: PlanTier
}

export const ACTIVATION_TASK_DEFS: ActivationTaskDef[] = [
  {
    id: 'brand_website',
    label: 'Make your website yours',
    body: 'Add your logo or a real photo — your site instantly stops looking like a template.',
    href: '/website',
  },
  {
    id: 'add_team',
    label: 'Introduce your team',
    body: 'Patients pick practices with faces. Add your people and they appear on your site.',
    href: '/settings/clinic',
  },
  {
    id: 'set_hours',
    label: 'Set your office hours',
    body: 'Hours drive your website, your booking slots, and the portal — one setting, everywhere.',
    href: '/settings/clinic',
  },
  {
    id: 'invite_team',
    label: 'Invite your front desk',
    body: 'Everyone gets their own login — no shared passwords on sticky notes.',
    href: '/settings/team',
  },
  {
    id: 'add_patients',
    label: 'Add your first patients',
    body: 'Add a few by hand, or connect your PMS later and they sync in on their own.',
    href: '/patients',
    minPlan: 'pro',
  },
  {
    id: 'connect_inbox',
    label: 'Connect your clinic inbox',
    body: 'Link your Gmail and patient email lands next to everything else — no tab juggling.',
    href: '/inbox',
    minPlan: 'pro',
  },
  {
    id: 'portal_setup',
    label: 'Shape your patient portal',
    body: 'Choose what patients can do online, set your notice windows, and preview it as a patient.',
    href: '/settings/portal',
    minPlan: 'pro',
  },
  {
    id: 'reviews_setup',
    label: 'Turn on review collection',
    body: 'Add your Google link once — happy patients become public reviews from then on.',
    href: '/reviews',
    minPlan: 'pro',
  },
  {
    id: 'connect_pms',
    label: 'Connect Open Dental',
    body: 'Patients, visits, and balances sync two-way through the official API.',
    href: '/integrations',
    minPlan: 'premium',
  },
  {
    id: 'open_shop',
    label: 'Stock your shop',
    body: 'Whitening kits and membership plans, sold from your site, paid out to your bank.',
    href: '/shop',
    minPlan: 'premium',
  },
]

/** Per-module hint banners — one warm orientation line on first visit. */
export interface ModuleHintDef {
  title: string
  body: string
}

export const MODULE_HINTS: Record<string, ModuleHintDef> = {
  patients: {
    title: 'Your patient relationships, not a clinical chart',
    body: 'Charts and procedures stay in your PMS. This is the relationship view — who’s due, who has a balance, who’s slipping away. The colored glyphs on each row tell you who needs what at a glance.',
  },
  appointments: {
    title: 'The schedule, sorted by what needs you',
    body: 'Today is pinned on top, and unconfirmed visits grow an amber-to-red edge as they get close. Click any row to confirm, remind, reschedule, or cancel without leaving the page.',
  },
  leads: {
    title: 'Every website inquiry, tracked until it becomes a patient',
    body: 'Contact and insurance-check requests land here. Fresh leads are green, neglected ones turn red — call them, mark them contacted, and convert them with one click.',
  },
  'intake-forms': {
    title: 'Paperwork that fills itself out at home',
    body: 'Build forms once; patients complete them from the booking email or their portal before they arrive. Every submission lands on the patient’s record.',
  },
  marketing: {
    title: 'Recall that runs itself',
    body: 'Audiences build themselves from your patient data (due for cleaning, lapsed, birthdays). Send a warm campaign and watch Sent → Opened → Booked — real bookings, not vanity opens.',
  },
  reviews: {
    title: 'Ask at the right moment, feature the best',
    body: 'Send a review request after a good visit. Patients write their words here, you choose which appear on your website — and the Google link keeps your public profile growing.',
  },
  analytics: {
    title: 'Your practice trends, minus the PMS noise',
    body: 'Acquisition, schedule health, recall, and reputation — built from the data this system already captures. Production dollars and clinical KPIs stay in your PMS, where they belong.',
  },
  blog: {
    title: 'Posts that bring patients from Google',
    body: 'Write it yourself or let the AI draft it for your review. Published posts appear on your website with the SEO plumbing handled.',
  },
  seo: {
    title: 'How patients find you, measured honestly',
    body: 'Search clicks, top queries, and site health — pulled straight from Google. The basics (sitemaps, schema, social cards) are already wired for you.',
  },
  careers: {
    title: 'Hire from your own website',
    body: 'Post a role and it appears on your site, indexed by Google for free. Applicants land here in a pipeline — no $400/mo job board needed.',
  },
  shop: {
    title: 'Your storefront, your bank account',
    body: 'Sell whitening kits, electric brushes, and membership plans from your website. Payments go through your own Stripe account — payouts land in your bank.',
  },
  integrations: {
    title: 'Wraps your PMS — never replaces it',
    body: 'Connect Open Dental and patients, visits, recall, and balances sync two-way through the official API. Every write shows up in your PMS audit trail.',
  },
}
