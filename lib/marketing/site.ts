// Shared structure + constants for the public marketing site
// (www.dreamcreatestudio.com). Design register: B2B SaaS (the buyer is a
// practice owner / office manager evaluating software), NOT the warm
// patient-facing language the clinic sites use. Ink + violet (the
// product's own accent), Inter, dense and concrete.

export const MARKETING = {
  productName: 'DreamCRM',
  companyName: 'Dream Create',
  tagline: 'The front-office platform for dental practices',
} as const

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'
export const DEMO_URL = `https://acme-dental-demo.${SITE_DOMAIN}`

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
      { label: 'Recall & outreach', href: '/product#recall', description: 'Measured in booked visits' },
      { label: 'Shop & memberships', href: '/product#shop', description: 'Payouts to your own bank' },
      { label: 'Open Dental sync', href: '/product#integrations', description: 'Two-way, official API only' },
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
  { label: 'Pricing', href: '/pricing' },
  {
    label: 'Resources',
    href: '/docs',
    children: [
      { label: 'Help docs', href: '/docs', description: 'Setup guides in front-desk language' },
      { label: 'Blog', href: '/blog', description: 'Announcements & essays from the team' },
      { label: 'Your first 30 minutes', href: '/docs/your-first-30-minutes', description: 'The setup order that works' },
      { label: 'Connect Open Dental', href: '/docs/connecting-open-dental', description: 'The official-API sync, step by step' },
      { label: 'Live demo practice', href: DEMO_URL, description: 'Browse a fully-populated clinic', external: true },
    ],
  },
]

export const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Platform tour', href: '/product' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Live demo practice', href: DEMO_URL, external: true },
      { label: 'Patient portal', href: '/product#portal' },
      { label: 'Open Dental sync', href: '/product#integrations' },
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
      { label: 'Help docs', href: '/docs' },
      { label: 'Blog', href: '/blog' },
      { label: 'Getting started guide', href: '/docs/your-first-30-minutes' },
      { label: 'Connect Open Dental', href: '/docs/connecting-open-dental' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Create your account', href: '/signup' },
      { label: 'Sign in', href: '/signin' },
    ],
  },
]
