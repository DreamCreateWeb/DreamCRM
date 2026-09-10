'use server'

import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { createMembershipCheckout } from '@/lib/services/membership'
import { HONEYPOT_FIELD, TIMETRAP_FIELD, looksLikeBot } from '@/lib/form-trust'
import { checkoutFailure, type CheckoutStart } from '@/lib/services/checkout-error'

export async function startMembershipCheckout(
  slug: string,
  input: {
    planSlug: string
    email: string
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    /** Spam-trust fields — honeypot value + form-mount timestamp. */
    hp?: string | null
    ts?: string | null
  },
): Promise<CheckoutStart> {
  // Silent spam drop — a filled honeypot / instant submit returns a benign
  // empty URL the client treats as a no-op (it guards on a falsy url). No
  // Stripe session is created and the bot gets no signal.
  if (looksLikeBot({ [HONEYPOT_FIELD]: input.hp ?? '', [TIMETRAP_FIELD]: input.ts ?? '' })) {
    return { ok: true, url: '' }
  }
  // Never THROW out of here — see the note in the shop's startCheckout.
  const site = await getClinicSiteBySlug(slug)
  if (!site) return { ok: false, error: 'We couldn’t find this clinic. Please refresh and try again.' }
  try {
    const { url } = await createMembershipCheckout(site.orgId, publicSiteUrl(site), input)
    return { ok: true, url }
  } catch (err) {
    return checkoutFailure('membership', err)
  }
}
