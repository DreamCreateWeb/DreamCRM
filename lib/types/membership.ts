// Client-safe membership types + pure helpers (no server-only deps). DB
// functions live in lib/services/membership.ts.

export type BillingInterval = 'monthly' | 'annual'
export type PlanStatus = 'draft' | 'active' | 'archived'
export type MembershipStatus = 'pending' | 'active' | 'past_due' | 'cancelled'

export const BILLING_LABELS: Record<BillingInterval, string> = {
  monthly: 'Monthly',
  annual: 'Annual',
}
export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  past_due: 'Past due',
  cancelled: 'Cancelled',
}

export interface Benefit {
  label: string
  qty?: number
}

export interface PlanRow {
  id: string
  name: string
  slug: string
  description: string | null
  billingInterval: BillingInterval
  priceCents: number
  benefits: Benefit[]
  discountPercent: number
  status: PlanStatus
  featured: boolean
  position: number
  memberCount: number
}

export interface MemberRow {
  id: string
  patientId: string
  patientName: string | null
  email: string | null
  planId: string
  planName: string
  planBenefits: Benefit[]
  status: MembershipStatus
  benefitsUsed: Record<string, number>
  currentPeriodEnd: Date | null
  startedAt: Date | null
}

export interface PlanInput {
  id?: string
  name: string
  description?: string | null
  billingInterval: BillingInterval
  priceDollars: number
  benefits: Benefit[]
  discountPercent: number
  status: PlanStatus
  featured: boolean
}

export function intervalSuffix(interval: BillingInterval): string {
  return interval === 'annual' ? '/yr' : '/mo'
}
