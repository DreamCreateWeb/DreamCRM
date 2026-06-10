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
}

export interface MarketingNavItem {
  label: string
  href: string
  children?: MarketingNavChild[]
}

export const MARKETING_NAV: MarketingNavItem[] = [
  { label: 'Product', href: '/product' },
  { label: 'Pricing', href: '/pricing' },
  {
    label: 'Compare',
    href: '/compare',
    children: [
      { label: 'vs Weave', href: '/compare/weave' },
      { label: 'vs NexHealth', href: '/compare/nexhealth' },
      { label: 'vs RevenueWell', href: '/compare/revenuewell' },
      { label: 'vs Solutionreach', href: '/compare/solutionreach' },
      { label: 'vs Adit', href: '/compare/adit' },
    ],
  },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
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
