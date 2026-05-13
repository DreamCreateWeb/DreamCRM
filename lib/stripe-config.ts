export type PlanId = 'basic' | 'pro' | 'premium'

export interface Plan {
  id: PlanId
  name: string
  price: number
  color: string
  features: string[]
  priceId: string
}

export const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 99,
    color: 'green',
    features: [
      'Professional static landing page',
      'Custom domain & SSL',
      'Mobile-responsive design',
      'HIPAA-safe hosting',
      '3 design templates (Modern, Classic, Editorial)',
    ],
    priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 149,
    color: 'sky',
    features: [
      'Everything in Basic',
      'Admin portal (clinic dashboard)',
      'Analytics & performance insights',
      'HIPAA-aligned database + AES-256 encryption',
      '30-second front-desk content updates',
      'Clinic-specific templates',
    ],
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? '',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    color: 'violet',
    features: [
      'Everything in Pro',
      'Patient portal',
      'SEO optimization',
      'Blog posts & content management',
      'Online booking & scheduling',
      'Priority support',
    ],
    priceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
  },
]

export function getPlanByPriceId(priceId: string): Plan | undefined {
  return PLANS.find((p) => p.priceId === priceId)
}

export function getPlanById(id: PlanId): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
