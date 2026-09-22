import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE STAFF BILLING ACTIONS RETURN THEIR REFUSAL (DREAMCRM-97).
 *
 * `startStripeCheckout`, `openBillingPortal` and `startActivationCheckout`
 * used to `throw new Error('Only an owner or admin can change billing.')` and
 * friends. In production Next.js replaces a thrown server-action message with
 * an opaque digest, so the clinic saw "An error occurred in the Server
 * Components render" — or, on the trial-ended wall's bare
 * `<form action={…}>`, nothing whatsoever.
 *
 * WHAT EACH GROUP BELOW IS FOR, because they are not all the same kind of
 * assertion (§2d):
 *
 *  - "returns rather than throws" — these FAIL against the pre-fix code, which
 *    is the defect this slice exists for. Note the shape deliberately: a test
 *    written as `.rejects.toThrow('Only an owner…')` passes against BOTH the
 *    broken and the fixed version, because the thrown message survives inside
 *    a test process and is replaced only by the production Next runtime. That
 *    is the exact trap the ledger records as "22 assertions that passed while
 *    production showed patients an error digest", so nothing here asserts on a
 *    throw.
 *
 *  - "the redirect is not swallowed" — a MUTATION guard rather than a
 *    reproduction. `redirect()` throws NEXT_REDIRECT, so moving it inside the
 *    try/catch this fix introduced would turn every successful checkout into
 *    "we couldn't start that just now" while the navigation silently never
 *    happens. Verified by making that mutation and watching these fail.
 *
 *  - "an internal failure is not quoted at the clinic" — the Stripe/DB leg
 *    raises sentences about OUR deployment ("Stripe price for Premium (annual)
 *    is not configured"). Returning them verbatim would swap one bad staff
 *    experience for another.
 */

const redirect = vi.fn((url: string) => {
  // Shaped like the real thing: `redirect()` signals by throwing, and its
  // caller must not catch it. A plain sentinel would let a swallowing
  // try/catch look identical to a working redirect.
  const err = new Error(`NEXT_REDIRECT;replace;${url};307;`) as Error & { digest: string }
  err.digest = `NEXT_REDIRECT;replace;${url};307;`
  throw err
})
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

const requireTenant = vi.fn()
vi.mock('@/lib/auth/context', () => ({ requireTenant: () => requireTenant() }))
vi.mock('@/lib/session', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/services/settings', () => ({
  AccountInput: { parse: (v: unknown) => v },
  FeedbackInput: { parse: (v: unknown) => v },
  NotificationPrefsInput: { parse: (v: unknown) => v },
  submitFeedback: vi.fn(),
  updateAccount: vi.fn(),
  upsertNotificationPrefs: vi.fn(),
}))

const createCheckoutSession = vi.fn()
const createPortalSession = vi.fn()
const updateSubscriptionPlan = vi.fn()
vi.mock('@/lib/services/billing', () => ({
  createCheckoutSession: (a: unknown) => createCheckoutSession(a),
  createPortalSession: (a: unknown) => createPortalSession(a),
  updateSubscriptionPlan: (a: unknown) => updateSubscriptionPlan(a),
  setSubscriptionCancelation: vi.fn(),
}))

const createActivationCheckout = vi.fn()
vi.mock('@/lib/services/clinic-provisioning', () => ({
  createActivationCheckout: (a: unknown) => createActivationCheckout(a),
}))

import {
  openBillingPortal,
  startStripeCheckout,
  startStripeCheckoutFormAction,
} from '@/app/(default)/settings/actions'
import { startActivationCheckout } from '@/app/(default)/billing/activate/actions'
import {
  BILLING_UNAVAILABLE_MESSAGE,
  PLAN_CHANGE_UNCONFIRMED_MESSAGE,
} from '@/lib/types/billing-action'
import { PURCHASABLE_PLANS } from '@/lib/stripe-config'

const PLAN = PURCHASABLE_PLANS[0].id

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    userId: 'u1',
    userEmail: 'owner@acme.test',
    ...overrides,
  }
}

beforeEach(() => {
  redirect.mockClear()
  requireTenant.mockReset()
  requireTenant.mockResolvedValue(tenant())
  createCheckoutSession.mockReset()
  createPortalSession.mockReset()
  updateSubscriptionPlan.mockReset()
  createActivationCheckout.mockReset()
  updateSubscriptionPlan.mockResolvedValue(false)
})

describe('startStripeCheckout — the refusal comes back as a value', () => {
  it('hands a front-desk member the role sentence instead of throwing it', async () => {
    requireTenant.mockResolvedValue(tenant({ role: 'member' }))
    // Resolving at all is the assertion. Pre-fix this rejected, and the
    // trial-ended wall had nothing to catch it with.
    await expect(startStripeCheckout(PLAN, 'monthly')).resolves.toEqual({
      error: 'Only an owner or admin can change billing.',
    })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  it('returns the wrong-tenant refusal', async () => {
    requireTenant.mockResolvedValue(tenant({ tenantType: 'partner' }))
    const r = await startStripeCheckout(PLAN, 'monthly')
    expect(r.error).toMatch(/only clinic tenants/i)
  })

  it('returns the refusal for a plan that is not self-serve', async () => {
    const r = await startStripeCheckout('basic' as typeof PLAN, 'monthly')
    expect(r.error).toMatch(/self-serve checkout/i)
    // The guard that keeps a clinic from minting a subscription at the legacy
    // price still refuses — it just says so out loud now.
    expect(updateSubscriptionPlan).not.toHaveBeenCalled()
  })

  it('returns the refusal when Stripe hands back a session with no URL', async () => {
    createCheckoutSession.mockResolvedValue({ url: null })
    const r = await startStripeCheckout(PLAN, 'monthly')
    expect(r.error).toMatch(/couldn’t start checkout/i)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('does NOT tell a clinic "nothing has been charged" when the plan swap may have committed', async () => {
    // Sentinel's N1 on #663. `updateSubscriptionPlan` calls
    // `stripe.subscriptions.update(…, proration_behavior: 'create_prorations')`
    // and then syncs the result back; if the sync half throws, the subscription
    // is already on the new price with prorations queued onto the next invoice.
    // The generic line would be a false statement about their money.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateSubscriptionPlan.mockRejectedValue(new Error('Subscription has no customer'))
    const r = await startStripeCheckout(PLAN, 'annual')
    expect(r.error).toBe(PLAN_CHANGE_UNCONFIRMED_MESSAGE)
    expect(r.error).not.toMatch(/nothing has been charged/i)
    expect(logged.mock.calls.flat().join(' ')).toContain('settings.plan-swap')
    expect(createCheckoutSession).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('does NOT quote an internal Stripe/config failure at the clinic', async () => {
    const internal = 'Stripe price for Premium (annual) is not configured'
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    createCheckoutSession.mockRejectedValue(new Error(internal))
    const r = await startStripeCheckout(PLAN, 'annual')
    expect(r.error).toBe(BILLING_UNAVAILABLE_MESSAGE)
    expect(r.error).not.toContain('Stripe price')
    // …and the real one is where staff can find it.
    expect(logged.mock.calls.flat().join(' ')).toContain('settings.checkout')
    logged.mockRestore()
  })
})

describe('startStripeCheckout — the redirect is not swallowed by the new try', () => {
  it('propagates NEXT_REDIRECT to Stripe Checkout rather than returning an error', async () => {
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.test/s/abc' })
    await expect(startStripeCheckout(PLAN, 'monthly')).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
    expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.test/s/abc')
  })

  it('propagates the in-place plan-swap redirect too', async () => {
    // A clinic with a live subscription swaps price in place — Checkout would
    // mint a SECOND subscription — and lands back on the billing page.
    updateSubscriptionPlan.mockResolvedValue(true)
    await expect(startStripeCheckout(PLAN, 'annual')).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
    expect(redirect).toHaveBeenCalledWith('/settings/billing?checkout=success')
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })
})

describe('startStripeCheckoutFormAction — the useActionState adapter', () => {
  it('forwards the bound plan + interval and returns the same refusal', async () => {
    requireTenant.mockResolvedValue(tenant({ role: 'member' }))
    const bound = startStripeCheckoutFormAction.bind(null, PLAN, 'annual')
    await expect(bound({ error: null }, new FormData())).resolves.toEqual({
      error: 'Only an owner or admin can change billing.',
    })
  })

  it('does not swallow the redirect either', async () => {
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.test/s/xyz' })
    const bound = startStripeCheckoutFormAction.bind(null, PLAN, 'monthly')
    await expect(bound({ error: null }, new FormData())).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
  })
})

describe('openBillingPortal — the refusal comes back as a value', () => {
  it('returns the role sentence for a member', async () => {
    requireTenant.mockResolvedValue(tenant({ role: 'member' }))
    await expect(openBillingPortal()).resolves.toEqual({
      error: 'Only an owner or admin can manage billing.',
    })
    expect(createPortalSession).not.toHaveBeenCalled()
  })

  it('returns the written sentence when the portal call fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    createPortalSession.mockRejectedValue(new Error('No Stripe customer on file for org_1'))
    const r = await openBillingPortal()
    expect(r.error).toBe(BILLING_UNAVAILABLE_MESSAGE)
    expect(r.error).not.toContain('org_1')
    logged.mockRestore()
  })

  it('propagates the redirect to the Stripe portal', async () => {
    createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.test/p/abc' })
    await expect(openBillingPortal()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
    expect(redirect).toHaveBeenCalledWith('https://billing.stripe.test/p/abc')
  })
})

describe('startActivationCheckout — the managed arm of the same wall', () => {
  it('returns the role refusal rather than throwing it into the void', async () => {
    requireTenant.mockResolvedValue(tenant({ role: 'member' }))
    await expect(startActivationCheckout()).resolves.toEqual({
      error: 'Only the clinic owner or an admin can add billing.',
    })
    expect(createActivationCheckout).not.toHaveBeenCalled()
  })

  it('returns the written sentence when provisioning the checkout fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    createActivationCheckout.mockRejectedValue(new Error('pendingPlanId missing on clinic_profile'))
    const r = await startActivationCheckout()
    expect(r.error).toBe(BILLING_UNAVAILABLE_MESSAGE)
    expect(r.error).not.toContain('pendingPlanId')
    logged.mockRestore()
  })

  it('propagates the redirect to the reserved-plan checkout', async () => {
    createActivationCheckout.mockResolvedValue({ url: 'https://checkout.stripe.test/s/managed' })
    await expect(startActivationCheckout()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
    expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.test/s/managed')
  })

  it('falls back to the home redirect when provisioning returns no URL', async () => {
    // The one `redirect()` in the diff with no test, named in Sentinel's N1
    // read of #663. It is outside the try like the other three, and it must
    // stay a redirect rather than becoming a returned error — a clinic sent
    // nowhere is a clinic staring at a button that did nothing.
    createActivationCheckout.mockResolvedValue({ url: null })
    await expect(startActivationCheckout()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
    expect(redirect).toHaveBeenCalledWith('/')
  })
})
