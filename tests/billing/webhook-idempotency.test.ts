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
  // Typed with rest args so the dedupe-key assertions below can read call[1].
  notify: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: (...a: unknown[]) => h.constructEvent(...a) } },
}))
vi.mock('@/lib/db', () => ({
  // One row for every lookup: the platform org has to RESOLVE or the notifying
  // branches short-circuit before `notifyOrgMembers` and assert nothing.
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'org_platform' }] }) }) }) },
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

  // DREAMCRM-89. The claim alone does not cover the notifications. It is
  // RELEASED when a handler throws (so Stripe's retry re-runs the WHOLE
  // handler, re-reaching every notify above the throw) and it is FAIL-OPEN (so
  // a delivery whose ledger write errored is processed with nothing recorded,
  // and Stripe's retry after a slow response finds a clean ledger). Every other
  // step here survives a re-run — `syncSubscriptionFromStripe` upserts,
  // `accrueCommissionForInvoice` is unique on the invoice id — while
  // `notifyOrgMembers` inserts a fresh row per call. So it carries the event's
  // own key, and `notify()` makes that at-most-once per recipient.
  it.each([
    ['checkout.session.completed', { customer_details: { email: 'new@clinic.com' } }],
    ['customer.subscription.deleted', { id: 'sub_5', customer: 'cus_5' }],
    ['invoice.payment_failed', { id: 'in_1', amount_due: 20000, currency: 'usd' }],
  ])('%s carries the event id as the notification dedupe key', async (type, object) => {
    h.constructEvent.mockReturnValue({ id: 'evt_k', type, data: { object } })
    await POST(req())
    expect(h.notify).toHaveBeenCalledOnce()
    expect(h.notify.mock.calls[0][1]).toMatchObject({ dedupeKey: 'stripe:evt_k' })
  })

  it('a delivery processed while the ledger was down re-notifies under the SAME key on retry', async () => {
    const event = {
      id: 'evt_reopen',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_9', customer: 'cus_9' } },
    }
    h.constructEvent.mockReturnValue(event)

    // Delivery 1: the claim write errors, so we fail open and process with
    // NOTHING recorded. The notification lands.
    h.claim.mockRejectedValueOnce(new Error('ledger unavailable'))
    expect((await POST(req())).status).toBe(200)

    // Delivery 2: Stripe retried (it never saw our answer, or saw it late), the
    // ledger is back, and the claim succeeds because delivery 1 recorded none.
    // The handler runs again in full.
    expect((await POST(req())).status).toBe(200)

    // Two dispatches, ONE key — which is what makes the second a no-op at the
    // insert instead of a second "a clinic just cancelled" in every owner's
    // bell and inbox. Same property covers release-and-retry: the key is
    // derived from the event id and nothing else.
    expect(h.notify).toHaveBeenCalledTimes(2)
    const keys = h.notify.mock.calls.map((c: unknown[]) => (c[1] as { dedupeKey?: string }).dedupeKey)
    expect(keys).toEqual(['stripe:evt_reopen', 'stripe:evt_reopen'])
  })

  it('two DIFFERENT events never share a key', async () => {
    const make = (id: string) => ({
      id,
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1' } },
    })
    h.constructEvent.mockReturnValueOnce(make('evt_a')).mockReturnValueOnce(make('evt_b'))
    await POST(req())
    await POST(req())
    const keys = h.notify.mock.calls.map((c: unknown[]) => (c[1] as { dedupeKey?: string }).dedupeKey)
    expect(new Set(keys).size).toBe(2)
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
