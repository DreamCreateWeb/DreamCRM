export type PlanId = 'starter' | 'professional' | 'enterprise'
export type BillingInterval = 'month' | 'year'

export interface Plan {
  id: PlanId
  name: string
  monthlyPrice: number
  annualPrice: number
  color: string
  features: string[]
  priceIds: {
    month: string
    year: string
  }
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 19,
    annualPrice: 14,
    color: 'green',
    features: [
      'Dental website design & hosting',
      'Patient intake forms',
      'SSL & custom domain',
      'Basic admin dashboard',
    ],
    priceIds: {
      month: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
      year: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 39,
    annualPrice: 34,
    color: 'sky',
    features: [
      'Everything in Starter',
      'HIPAA-aligned database + AES-256 encryption',
      'Online booking & scheduling',
      'Clinic-specific templates',
      '30-second front-desk updates',
    ],
    priceIds: {
      month: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? '',
      year: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL ?? '',
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 79,
    annualPrice: 74,
    color: 'violet',
    features: [
      'Everything in Professional',
      'Multi-location management',
      'BAA (Business Associate Agreement)',
      'Audit logging & compliance reports',
      'Priority support & SLA',
      'Custom integrations',
    ],
    priceIds: {
      month: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
      year: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL ?? '',
    },
  },
]

export function getPlanByPriceId(priceId: string): Plan | undefined {
  return PLANS.find(
    (p) => p.priceIds.month === priceId || p.priceIds.year === priceId
  )
}

export function getPlanById(id: PlanId): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
