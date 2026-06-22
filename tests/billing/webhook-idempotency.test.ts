import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The platform Stripe webhook claims each event id before handling it, so a
 * retried/duplicate delivery is a no-op (no double notify / double side-effect)
 * and a FAILED handler releases its claim so Stripe's retry re-processes.
 */
const h = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  claim: vi.fn(async () => true),
  release: vi.fn(async () => undefined),
  sync: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
  notify: vi.fn(async () => undefined),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: (...a: unknown[]) => h.constructEvent(...a) } },
}))
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) },
  schema: {
    clinicProfile: { organizationId: 'organizationId', stripeCustomerId: 'stripeCustomerId' },
    organization: { type: 'type', id: 'id' },
  },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({ _k: 'eq' })) }))
vi.mock('@/lib/services/billing', () => ({
  clearSubscription: h.clear,
  syncSubscriptionFromStripe: h.sync,
  claimStripeEvent: h.claim,
  releaseStripeEvent: h.release,
}))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: h.notify }))
vi.mock('@/lib/services/referrals', () => ({ accrueCommissionForInvoice: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/billing-notifications', () => ({
  sendPaymentFailedEmailForCustomer: vi.fn(async () => undefined),
}))

import { POST } from '@/app/api/webhooks/stripe/route'

function req(): Request {
  return new Request('https://x/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: '{}',
  })
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  h.constructEvent.mockReset()
  h.claim.mockReset().mockResolvedValue(true)
  h.release.mockReset().mockResolvedValue(undefined)
  h.sync.mockReset().mockResolvedValue(undefined)
  h.clear.mockReset().mockResolvedValue(undefined)
  h.notify.mockReset().mockResolvedValue(undefined)
})

describe('stripe webhook idempotency', () => {
  it('processes a freshly-claimed event', async () => {
    h.claim.mockResolvedValue(true)
    h.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1' } },
    })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(h.claim).toHaveBeenCalledWith('evt_1', 'customer.subscription.updated')
    expect(h.sync).toHaveBeenCalledWith('sub_1')
  })

  it('skips a duplicate event WITHOUT running any handler', async () => {
    h.claim.mockResolvedValue(false)
    h.constructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1' } },
    })
    const res = await POST(req())
    const body = (await res.json()) as { duplicate?: boolean }
    expect(res.status).toBe(200)
    expect(body.duplicate).toBe(true)
    expect(h.sync).not.toHaveBeenCalled()
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('releases the claim when a handler throws so Stripe re-processes (500)', async () => {
    h.claim.mockResolvedValue(true)
    h.sync.mockRejectedValue(new Error('db down'))
    h.constructEvent.mockReturnValue({
      id: 'evt_boom',
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_9' } },
    })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(h.release).toHaveBeenCalledWith('evt_boom')
  })

  it('still processes if the ledger claim itself errors (fail-open, never drop an event)', async () => {
    h.claim.mockRejectedValue(new Error('ledger unavailable'))
    h.constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_2' } },
    })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(h.sync).toHaveBeenCalledWith('sub_2')
  })
})
