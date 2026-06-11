import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * listOrgStripeInvoices / getOrgSubscriptionSummary must scope to THIS org's
 * own Stripe customer / subscription (no cross-tenant bleed), and degrade to
 * empty/null when there's nothing on file or Stripe errors.
 */
const state: { selectRow: unknown[] } = { selectRow: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.where = () => c
    c.limit = async () => state.selectRow
    return c
  }
  return {
    db: { select: () => chain() },
    schema: {
      clinicProfile: {
        organizationId: 'organizationId',
        stripeCustomerId: 'stripeCustomerId',
        stripeSubscriptionId: 'stripeSubscriptionId',
      },
    },
  }
})

const invoicesList = vi.fn()
const subRetrieve = vi.fn()
vi.mock('@/lib/stripe', () => ({
  stripe: {
    invoices: { list: (...a: unknown[]) => invoicesList(...a) },
    subscriptions: { retrieve: (...a: unknown[]) => subRetrieve(...a) },
  },
}))

import { listOrgStripeInvoices, getOrgSubscriptionSummary } from '@/lib/services/billing'

beforeEach(() => {
  state.selectRow = []
  invoicesList.mockReset()
  subRetrieve.mockReset()
})

describe('listOrgStripeInvoices', () => {
  it('returns [] (and never calls Stripe) when the org has no customer', async () => {
    state.selectRow = [{ stripeCustomerId: null }]
    const res = await listOrgStripeInvoices('org_1')
    expect(res).toEqual([])
    expect(invoicesList).not.toHaveBeenCalled()
  })

  it('scopes the Stripe call to the org customer and maps rows', async () => {
    state.selectRow = [{ stripeCustomerId: 'cus_acme' }]
    invoicesList.mockResolvedValue({
      data: [
        {
          id: 'in_1',
          number: 'ACME-001',
          amount_paid: 14900,
          currency: 'usd',
          status: 'paid',
          created: 1_700_000_000,
          hosted_invoice_url: 'https://stripe/inv_1',
          invoice_pdf: 'https://stripe/inv_1.pdf',
        },
      ],
    })
    const res = await listOrgStripeInvoices('org_1', 5)
    expect(invoicesList).toHaveBeenCalledWith({ customer: 'cus_acme', limit: 5 })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ number: 'ACME-001', amountPaidCents: 14900, currency: 'USD', status: 'paid' })
  })

  it('degrades to [] when Stripe throws', async () => {
    state.selectRow = [{ stripeCustomerId: 'cus_acme' }]
    invoicesList.mockRejectedValue(new Error('stripe down'))
    expect(await listOrgStripeInvoices('org_1')).toEqual([])
  })
})

describe('getOrgSubscriptionSummary', () => {
  it('returns null when no subscription is on file', async () => {
    state.selectRow = [{ stripeSubscriptionId: null }]
    expect(await getOrgSubscriptionSummary('org_1')).toBeNull()
    expect(subRetrieve).not.toHaveBeenCalled()
  })

  it('maps status + interval + period end from the org subscription', async () => {
    state.selectRow = [{ stripeSubscriptionId: 'sub_acme' }]
    subRetrieve.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1_700_000_000,
      items: { data: [{ price: { recurring: { interval: 'year' } } }] },
    })
    const res = await getOrgSubscriptionSummary('org_1')
    expect(subRetrieve).toHaveBeenCalledWith('sub_acme', expect.anything())
    expect(res).toMatchObject({ status: 'active', interval: 'annual', cancelAtPeriodEnd: false })
    expect(res?.currentPeriodEnd).toBeInstanceOf(Date)
  })

  it('degrades to null when Stripe throws', async () => {
    state.selectRow = [{ stripeSubscriptionId: 'sub_acme' }]
    subRetrieve.mockRejectedValue(new Error('boom'))
    expect(await getOrgSubscriptionSummary('org_1')).toBeNull()
  })
})
