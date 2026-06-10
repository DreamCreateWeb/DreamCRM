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
      'Beautiful clinic website on your own address',
      'Edit-in-place Website Studio — change anything yourself',
      'AI copy assistant for your site',
      'Contact + insurance-check requests straight to you',
      'SEO foundations: sitemap, social cards, local schema',
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
      'Online booking with your live availability',
      'Patient records, appointments agenda & reminders',
      'Website leads queue + unified patient messages',
      'Digital intake forms',
      'Clinic-branded patient portal',
      'Reviews collection + website testimonials',
      'Blog + SEO dashboard',
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
      'Recall & outreach campaigns',
      'Practice analytics',
      'Online shop + membership plans (payouts to your bank)',
      'Careers page + applicant tracking',
      'PMS integration — Open Dental, two-way',
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
