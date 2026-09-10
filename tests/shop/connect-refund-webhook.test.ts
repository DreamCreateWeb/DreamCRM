import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The Connect webhook's refund branch — the event that had no case at all, so
 * a Stripe-side refund never reached our records.
 *
 * What these pin:
 *
 *  1. `charge.refunded` carries the cumulative figures itself; `refund.created`
 *     carries one refund, so the CHARGE is fetched — trusting the single
 *     refund's amount would read a second partial refund as "not fully
 *     refunded" and leave the order reading Paid.
 *  2. Tenant scoping comes from `event.account` (Stripe naming the connected
 *     account), NOT from event metadata — a refund issued from the Stripe
 *     dashboard has none. An account we cannot map to a clinic writes nothing.
 *  3. A refund that never succeeded moves no money and records nothing.
 *  4. A handler failure returns 500 so Stripe retries — a dropped refund is
 *     the bug this whole branch exists to fix.
 */

const state = {
  orgForAccount: null as string | null,
  recordCalls: [] as Array<Record<string, unknown>>,
  recordThrows: false,
  chargeRetrieves: [] as string[],
  charge: null as Record<string, unknown> | null,
}

const mockConstructEvent = vi.fn()
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
    charges: {
      retrieve: async (id: string) => {
        state.chargeRetrieves.push(id)
        return state.charge
      },
    },
  },
  subscriptionPeriodEnd: () => null,
}))

vi.mock('@/lib/services/shop-connect', () => ({
  syncConnectedAccountStatus: vi.fn(async () => undefined),
  orgIdForConnectedAccount: vi.fn(async () => state.orgForAccount),
}))
vi.mock('@/lib/services/refunds', () => ({
  recordConnectRefund: vi.fn(async (args: Record<string, unknown>) => {
    state.recordCalls.push(args)
    if (state.recordThrows) throw new Error('db down')
    return []
  }),
}))
vi.mock('@/lib/services/shop-checkout', () => ({ finalizeOrderFromSession: vi.fn() }))
vi.mock('@/lib/services/balance-payments', () => ({ finalizeBalancePaymentFromSession: vi.fn() }))
vi.mock('@/lib/services/booking-deposits', () => ({ finalizeBookingDepositFromSession: vi.fn() }))
vi.mock('@/lib/services/membership', () => ({
  finalizeMembershipFromSession: vi.fn(),
  handleSubscriptionEvent: vi.fn(),
}))

import { POST } from '@/app/api/webhooks/stripe-connect/route'

function post(): Request {
  return new Request('https://x/api/webhooks/stripe-connect', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: '{}',
  })
}

beforeEach(() => {
  state.orgForAccount = 'org_a'
  state.recordCalls = []
  state.recordThrows = false
  state.chargeRetrieves = []
  state.charge = null
  mockConstructEvent.mockReset()
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test'
})

describe('charge.refunded', () => {
  it('records the cumulative refund against the clinic that owns the account', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount: 5_000, amount_refunded: 5_000 } },
    })
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect(state.recordCalls).toEqual([
      { organizationId: 'org_a', paymentIntentId: 'pi_1', amountRefundedCents: 5_000, chargeAmountCents: 5_000 },
    ])
    // The event already carries the totals — no extra Stripe round-trip.
    expect(state.chargeRetrieves).toEqual([])
  })

  it('passes a PARTIAL refund through as a partial one', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: { object: { payment_intent: 'pi_1', amount: 5_000, amount_refunded: 1_500 } },
    })
    await POST(post())
    expect(state.recordCalls[0]).toMatchObject({ amountRefundedCents: 1_500, chargeAmountCents: 5_000 })
  })

  it('an expanded payment_intent object still resolves to its id', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: { object: { payment_intent: { id: 'pi_1' }, amount: 5_000, amount_refunded: 5_000 } },
    })
    await POST(post())
    expect(state.recordCalls[0]).toMatchObject({ paymentIntentId: 'pi_1' })
  })

  it('a charge with no payment intent records nothing', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: { object: { amount: 5_000, amount_refunded: 5_000 } },
    })
    expect((await POST(post())).status).toBe(200)
    expect(state.recordCalls).toEqual([])
  })
})

describe('refund.created', () => {
  it('fetches the CHARGE for the cumulative total, on the connected account', async () => {
    state.charge = { payment_intent: 'pi_1', amount: 5_000, amount_refunded: 5_000 }
    mockConstructEvent.mockReturnValue({
      type: 'refund.created',
      account: 'acct_1',
      // The refund itself only knows about its own $15 leg.
      data: { object: { id: 're_1', charge: 'ch_1', amount: 1_500, status: 'succeeded' } },
    })
    await POST(post())
    expect(state.chargeRetrieves).toEqual(['ch_1'])
    expect(state.recordCalls[0]).toMatchObject({ amountRefundedCents: 5_000, chargeAmountCents: 5_000 })
  })

  it('a refund that never succeeded moves no money and records nothing', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'refund.created',
      account: 'acct_1',
      data: { object: { id: 're_1', charge: 'ch_1', amount: 1_500, status: 'failed' } },
    })
    expect((await POST(post())).status).toBe(200)
    expect(state.chargeRetrieves).toEqual([])
    expect(state.recordCalls).toEqual([])
  })

  it('a refund with no charge to resolve records nothing', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'refund.created',
      account: 'acct_1',
      data: { object: { id: 're_1', status: 'succeeded' } },
    })
    expect((await POST(post())).status).toBe(200)
    expect(state.recordCalls).toEqual([])
  })
})

describe('tenant scoping and failure', () => {
  it('no connected account on the event → nothing is written', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1', amount: 5_000, amount_refunded: 5_000 } },
    })
    expect((await POST(post())).status).toBe(200)
    expect(state.recordCalls).toEqual([])
  })

  it('an account we cannot map to a clinic → nothing is written', async () => {
    state.orgForAccount = null
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_unknown',
      data: { object: { payment_intent: 'pi_1', amount: 5_000, amount_refunded: 5_000 } },
    })
    expect((await POST(post())).status).toBe(200)
    expect(state.recordCalls).toEqual([])
  })

  it('metadata never decides the tenant — the account does', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: {
        object: {
          payment_intent: 'pi_1',
          amount: 5_000,
          amount_refunded: 5_000,
          metadata: { organizationId: 'org_somebody_else' },
        },
      },
    })
    await POST(post())
    expect(state.recordCalls[0]).toMatchObject({ organizationId: 'org_a' })
  })

  it('a failed write returns 500 so Stripe retries — a dropped refund is the bug', async () => {
    state.recordThrows = true
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      account: 'acct_1',
      data: { object: { payment_intent: 'pi_1', amount: 5_000, amount_refunded: 5_000 } },
    })
    expect((await POST(post())).status).toBe(500)
  })
})
