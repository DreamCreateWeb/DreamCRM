import { describe, it, expect } from 'vitest'
import { clinicStripeRowStatus } from '@/lib/billing-status'

/**
 * Settings → Connected accounts, the clinic's Stripe row — READ from the
 * billing columns. It used to be hard-coded "Connected · Subscription
 * managed by Stripe" for every clinic: a trial clinic with no card and a
 * comped clinic that never has a subscription both read a green pill about
 * a subscription that did not exist.
 */
describe('clinicStripeRowStatus', () => {
  it('a no-card trial clinic is "available" with the trial named, and Connect goes to billing', () => {
    const row = clinicStripeRowStatus({ stripeSubscriptionId: null, subscriptionStatus: null, billingMode: 'self_serve', onTrial: true })
    expect(row.status).toEqual({ kind: 'available', detail: 'Free trial — no card on file yet' })
    expect(row.connectHref).toBe('/settings/billing')
  })

  it('a self-serve clinic past its trial with no subscription is "available", not Connected', () => {
    const row = clinicStripeRowStatus({ stripeSubscriptionId: null, subscriptionStatus: null, billingMode: null, onTrial: false })
    expect(row.status.kind).toBe('available')
    expect(row.status.detail).toBe('No subscription on file yet')
  })

  it('a managed or comped clinic is billed by Dream Create — connected, nothing to manage in Stripe', () => {
    for (const billingMode of ['managed', 'comped']) {
      const row = clinicStripeRowStatus({ stripeSubscriptionId: null, subscriptionStatus: null, billingMode, onTrial: false })
      expect(row.status).toEqual({ kind: 'connected', detail: 'Billed by Dream Create' })
      expect(row.connectHref).toBeUndefined()
    }
  })

  it('an active subscription is connected with the status word', () => {
    const row = clinicStripeRowStatus({ stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active', billingMode: 'self_serve', onTrial: false })
    expect(row.status).toEqual({ kind: 'connected', detail: 'Active' })
  })

  it('past due / unpaid read as partial with the problem named — never a green Connected', () => {
    for (const subscriptionStatus of ['past_due', 'unpaid', 'incomplete']) {
      const row = clinicStripeRowStatus({ stripeSubscriptionId: 'sub_1', subscriptionStatus, billingMode: 'self_serve', onTrial: false })
      expect(row.status.kind).toBe('partial')
      expect(row.status.detail).toMatch(/Past due|Unpaid|Incomplete/)
    }
  })
})
