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
const invoicesUpcoming = vi.fn()
const subRetrieve = vi.fn()
const subUpdate = vi.fn()
vi.mock('@/lib/stripe', () => ({
  stripe: {
    invoices: {
      list: (...a: unknown[]) => invoicesList(...a),
      // retrieveUpcoming was removed from the SDK — createPreview replaced it.
      createPreview: (...a: unknown[]) => invoicesUpcoming(...a),
    },
    subscriptions: {
      retrieve: (...a: unknown[]) => subRetrieve(...a),
      update: (...a: unknown[]) => subUpdate(...a),
    },
  },
}))

import {
  listOrgStripeInvoices,
  getOrgSubscriptionSummary,
  setSubscriptionCancelation,
} from '@/lib/services/billing'

beforeEach(() => {
  state.selectRow = []
  invoicesList.mockReset()
  invoicesUpcoming.mockReset()
  subRetrieve.mockReset()
  subUpdate.mockReset()
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

  it('extracts the card on file + the true next charge from the upcoming invoice', async () => {
    state.selectRow = [{ stripeSubscriptionId: 'sub_acme' }]
    subRetrieve.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1_700_000_000,
      customer: 'cus_1',
      default_payment_method: { card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2027 } },
      items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    })
    invoicesUpcoming.mockResolvedValue({ amount_due: 14900, currency: 'usd' })
    const res = await getOrgSubscriptionSummary('org_1')
    expect(res?.card).toEqual({ brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027 })
    expect(res?.nextChargeCents).toBe(14900)
    expect(res?.nextChargeCurrency).toBe('usd')
  })

  it('does not fetch an upcoming invoice when the sub is set to cancel', async () => {
    state.selectRow = [{ stripeSubscriptionId: 'sub_acme' }]
    subRetrieve.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: true,
      customer: 'cus_1',
      items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    })
    const res = await getOrgSubscriptionSummary('org_1')
    expect(invoicesUpcoming).not.toHaveBeenCalled()
    expect(res?.nextChargeCents).toBeNull()
  })

  it('tolerates a missing/failing upcoming-invoice call — summary still returns (date-only)', async () => {
    state.selectRow = [{ stripeSubscriptionId: 'sub_acme' }]
    subRetrieve.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1_700_000_000,
      customer: 'cus_1',
      items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    })
    invoicesUpcoming.mockRejectedValue(new Error('no upcoming invoice'))
    const res = await getOrgSubscriptionSummary('org_1')
    expect(res?.status).toBe('active')
    expect(res?.nextChargeCents).toBeNull()
  })
})

describe('setSubscriptionCancelation', () => {
  it('flips cancel_at_period_end on the org subscription', async () => {
    state.selectRow = [{ stripeSubscriptionId: 'sub_acme' }]
    subUpdate.mockResolvedValue({})
    const r = await setSubscriptionCancelation('org_1', true)
    expect(subUpdate).toHaveBeenCalledWith('sub_acme', { cancel_at_period_end: true })
    expect(r).toEqual({ ok: true, cancelAtPeriodEnd: true })
  })

  it('errors (and never calls Stripe) when there is no subscription on file', async () => {
    state.selectRow = [{ stripeSubscriptionId: null }]
    const r = await setSubscriptionCancelation('org_1', true)
    expect(r).toMatchObject({ ok: false })
    expect(subUpdate).not.toHaveBeenCalled()
  })

  it('returns a friendly error when Stripe throws', async () => {
    state.selectRow = [{ stripeSubscriptionId: 'sub_acme' }]
    subUpdate.mockRejectedValue(new Error('stripe down'))
    const r = await setSubscriptionCancelation('org_1', false)
    expect(r).toMatchObject({ ok: false })
  })
})
