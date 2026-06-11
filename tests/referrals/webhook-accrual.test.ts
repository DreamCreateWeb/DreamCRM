import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The platform Stripe webhook's invoice.payment_succeeded branch resolves the
 * clinic org by the invoice customer and accrues referral commission —
 * best-effort (a thrown accrual must NOT fail billing sync / the webhook).
 */
const { state } = vi.hoisted(() => ({
  state: {
    profileRows: [] as unknown[][],
    accrueShouldThrow: false,
    accrueCalls: [] as Array<Record<string, unknown>>,
  },
}))

const mockConstructEvent = vi.fn()
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) } },
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => state.profileRows.shift() ?? [] }) }),
    }),
  },
  schema: { clinicProfile: { organizationId: 'organizationId', stripeCustomerId: 'stripeCustomerId' }, organization: { type: 'type', id: 'id' } },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({ _k: 'eq' })) }))
vi.mock('@/lib/services/billing', () => ({
  clearSubscription: vi.fn(),
  syncSubscriptionFromStripe: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/referrals', () => ({
  accrueCommissionForInvoice: vi.fn(async (args: Record<string, unknown>) => {
    state.accrueCalls.push(args)
    if (state.accrueShouldThrow) throw new Error('accrual boom')
    return { accrued: true }
  }),
}))

import { POST } from '@/app/api/webhooks/stripe/route'

function reqWithBody(): Request {
  return new Request('https://x/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: '{}',
  })
}

beforeEach(() => {
  state.profileRows = []
  state.accrueShouldThrow = false
  state.accrueCalls = []
  mockConstructEvent.mockReset()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
})

describe('invoice.payment_succeeded → referral accrual', () => {
  it('resolves the org from the invoice customer + accrues for the paid amount', async () => {
    state.profileRows = [[{ organizationId: 'org1' }]]
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_1', customer: 'cus_1', amount_paid: 19900, subscription: 'sub_1' } },
    })
    const res = await POST(reqWithBody())
    expect(res.status).toBe(200)
    expect(state.accrueCalls).toHaveLength(1)
    expect(state.accrueCalls[0]).toMatchObject({
      organizationId: 'org1',
      stripeInvoiceId: 'in_1',
      amountPaidCents: 19900,
    })
  })

  it('no matching clinic_profile for the customer → does not accrue, still 200', async () => {
    state.profileRows = [[]] // no profile
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_2', customer: 'cus_unknown', amount_paid: 9900 } },
    })
    const res = await POST(reqWithBody())
    expect(res.status).toBe(200)
    expect(state.accrueCalls).toHaveLength(0)
  })

  it('an accrual error is swallowed — the webhook still returns 200', async () => {
    state.profileRows = [[{ organizationId: 'org1' }]]
    state.accrueShouldThrow = true
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_3', customer: 'cus_1', amount_paid: 19900 } },
    })
    const res = await POST(reqWithBody())
    expect(res.status).toBe(200) // billing sync NOT broken by accrual failure
  })

  it('does NOT accrue on invoice.payment_failed', async () => {
    state.profileRows = [[{ organizationId: 'org1' }]]
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_4', customer: 'cus_1', amount_due: 19900 } },
    })
    const res = await POST(reqWithBody())
    expect(res.status).toBe(200)
    expect(state.accrueCalls).toHaveLength(0)
  })
})
