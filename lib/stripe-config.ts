export type PlanId = 'basic' | 'pro' | 'premium'
export type BillingInterval = 'monthly' | 'annual'

export interface Plan {
  id: PlanId
  name: string
  price: number
  annualPrice: number
  color: string
  features: string[]
  priceIds: Record<BillingInterval, string>
}

export const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 99,
    annualPrice: 990,
    color: 'green',
    features: [
      'Professional static landing page',
      'Custom domain & SSL',
      'Mobile-responsive design',
      'HIPAA-safe hosting',
      '3 design templates (Modern, Classic, Editorial)',
    ],
    priceIds: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
      annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 149,
    annualPrice: 1490,
    color: 'sky',
    features: [
      'Everything in Basic',
      'Admin portal (clinic dashboard)',
      'Analytics & performance insights',
      'HIPAA-aligned database + AES-256 encryption',
      '30-second front-desk content updates',
      'Clinic-specific templates',
    ],
    priceIds: {
      monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? '',
      annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL ?? '',
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    annualPrice: 1990,
    color: 'violet',
    features: [
      'Everything in Pro',
      'Patient portal',
      'SEO optimization',
      'Blog posts & content management',
      'Online booking & scheduling',
      'Priority support',
    ],
    priceIds: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
      annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL ?? '',
    },
  },
]

export function getPlanByPriceId(priceId: string): { plan: Plan; interval: BillingInterval } | undefined {
  for (const plan of PLANS) {
    if (plan.priceIds.monthly === priceId) return { plan, interval: 'monthly' }
    if (plan.priceIds.annual === priceId) return { plan, interval: 'annual' }
  }
  return undefined
}

export function getPlanById(id: PlanId): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
