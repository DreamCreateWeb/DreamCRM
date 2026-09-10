import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

/**
 * What a patient reads when checkout can't start.
 *
 * Two separate defects lived here. First, `startCheckout` / `startMembershipCheckout`
 * THREW: Next.js replaces a server-action error message with an opaque digest
 * in production, so the storefront's `(err as Error).message` rendered "An
 * error occurred in the Server Components render" — the raw error a shopper saw
 * whenever Stripe was down. Second, the paths that already returned a result
 * passed `err.message` straight through, so a Stripe outage published the SDK's
 * own text ("An error occurred with our connection to Stripe. Request was
 * retried 1 times.") onto a public clinic page.
 *
 * The rule these tests pin: a message we wrote FOR the patient reaches them
 * unchanged; anything else becomes one written sentence and is logged instead.
 */

const state = {
  shopResult: null as unknown,
  shopThrows: null as unknown,
  membershipResult: null as unknown,
  membershipThrows: null as unknown,
  site: { orgId: 'org_1', slug: 'bright-smiles' } as unknown,
}

vi.mock('@/lib/services/clinic-site', () => ({
  getClinicSiteBySlug: async () => state.site,
  publicSiteUrl: () => 'https://bright-smiles.example',
  appBaseUrl: () => 'https://app.example',
}))
vi.mock('@/lib/services/shop-checkout', () => ({
  createShopCheckoutSession: async () => {
    if (state.shopThrows) throw state.shopThrows
    return state.shopResult
  },
}))
vi.mock('@/lib/services/membership', () => ({
  createMembershipCheckout: async () => {
    if (state.membershipThrows) throw state.membershipThrows
    return state.membershipResult
  },
}))
vi.mock('@/lib/services/coupons', () => ({ validateCoupon: vi.fn() }))

import {
  CheckoutError,
  CHECKOUT_UNAVAILABLE_MESSAGE,
  checkoutFailure,
} from '@/lib/services/checkout-error'
import { startCheckout } from '@/app/site/[slug]/shop/actions'
import { startMembershipCheckout } from '@/app/site/[slug]/membership/actions'
import { HONEYPOT_FIELD } from '@/lib/form-trust'

/** What the Stripe SDK actually throws when it can't reach Stripe. */
function stripeOutage(): Error {
  const err = new Error('An error occurred with our connection to Stripe. Request was retried 1 times.')
  err.name = 'StripeConnectionError'
  return err
}

const error = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  state.shopResult = { url: 'https://checkout.stripe.test/cs_1' }
  state.shopThrows = null
  state.membershipResult = { url: 'https://checkout.stripe.test/cs_2' }
  state.membershipThrows = null
  state.site = { orgId: 'org_1', slug: 'bright-smiles' }
  error.mockClear()
})

afterAll(() => {
  error.mockRestore()
})

describe('checkoutFailure', () => {
  it('shows a message that was written for the patient, unchanged', () => {
    const res = checkoutFailure('shop-checkout', new CheckoutError('Only 2 of Whitening Kit are left.'))
    expect(res).toEqual({ ok: false, error: 'Only 2 of Whitening Kit are left.' })
    // Nothing surprising happened — no need to page anyone.
    expect(error).not.toHaveBeenCalled()
  })

  it('replaces a raw Stripe outage with one written sentence, and logs the real error', () => {
    const outage = stripeOutage()
    const res = checkoutFailure('shop-checkout', outage)

    expect(res.error).toBe(CHECKOUT_UNAVAILABLE_MESSAGE)
    expect(res.error).not.toMatch(/Stripe/)
    // The message has to tell the patient the two things they need: no money
    // moved, and there is another way to pay.
    expect(res.error).toMatch(/nothing has been charged/i)
    expect(res.error).toMatch(/call/i)
    // The real error is still recoverable by whoever is on call.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('shop-checkout'), outage)
  })

  it('does not leak a database error either', () => {
    const res = checkoutFailure('membership', new Error('relation "shop_order" does not exist'))
    expect(res.error).toBe(CHECKOUT_UNAVAILABLE_MESSAGE)
    expect(res.error).not.toMatch(/relation|shop_order/)
  })

  it('handles a non-Error throw', () => {
    expect(checkoutFailure('shop-checkout', 'boom').error).toBe(CHECKOUT_UNAVAILABLE_MESSAGE)
  })
})

describe('startCheckout (public shop)', () => {
  it('returns the checkout URL on success', async () => {
    await expect(startCheckout('bright-smiles', {
      items: [{ variantId: 'v1', qty: 1 }],
      fulfillmentType: 'pickup',
      email: 'a@x.com',
    })).resolves.toEqual({ ok: true, url: 'https://checkout.stripe.test/cs_1' })
  })

  it('answers a Stripe outage with a result, never a throw', async () => {
    state.shopThrows = stripeOutage()

    const res = await startCheckout('bright-smiles', {
      items: [{ variantId: 'v1', qty: 1 }],
      fulfillmentType: 'pickup',
      email: 'a@x.com',
    })

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toBe(CHECKOUT_UNAVAILABLE_MESSAGE)
  })

  it('still tells a shopper the thing they can act on', async () => {
    state.shopThrows = new CheckoutError('That promo code has just been used — remove it to continue.')

    const res = await startCheckout('bright-smiles', {
      items: [{ variantId: 'v1', qty: 1 }],
      fulfillmentType: 'pickup',
      email: 'a@x.com',
    })

    expect(res).toEqual({
      ok: false,
      error: 'That promo code has just been used — remove it to continue.',
    })
  })

  it('reports an unknown clinic as a result too', async () => {
    state.site = null
    const res = await startCheckout('nope', {
      items: [{ variantId: 'v1', qty: 1 }],
      fulfillmentType: 'pickup',
      email: 'a@x.com',
    })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toMatch(/couldn’t find this clinic/)
  })
})

describe('startMembershipCheckout (public membership)', () => {
  it('returns the checkout URL on success', async () => {
    await expect(
      startMembershipCheckout('bright-smiles', { planSlug: 'basic-care', email: 'a@x.com' }),
    ).resolves.toEqual({ ok: true, url: 'https://checkout.stripe.test/cs_2' })
  })

  it('answers a Stripe outage with a result, never a throw', async () => {
    state.membershipThrows = stripeOutage()

    const res = await startMembershipCheckout('bright-smiles', {
      planSlug: 'basic-care',
      email: 'a@x.com',
    })

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toBe(CHECKOUT_UNAVAILABLE_MESSAGE)
  })

  it('still tells a patient the thing they can act on', async () => {
    state.membershipThrows = new CheckoutError('You’re already a member of this plan.')

    const res = await startMembershipCheckout('bright-smiles', {
      planSlug: 'basic-care',
      email: 'a@x.com',
    })

    expect(res).toEqual({ ok: false, error: 'You’re already a member of this plan.' })
  })

  it('keeps the silent spam drop silent — ok with a blank url, no Stripe call', async () => {
    state.membershipThrows = new Error('createMembershipCheckout must not be called for a bot')

    const res = await startMembershipCheckout('bright-smiles', {
      planSlug: 'basic-care',
      email: 'a@x.com',
      hp: 'i am a bot',
    })

    // The client guards on a falsy url and treats this as a no-op, so the bot
    // learns nothing — an { ok: false } here would be a signal.
    expect(res).toEqual({ ok: true, url: '' })
    expect(HONEYPOT_FIELD).toBeTruthy()
  })
})
