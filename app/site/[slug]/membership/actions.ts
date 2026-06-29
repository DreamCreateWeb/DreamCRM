'use server'

import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { createMembershipCheckout } from '@/lib/services/membership'
import { HONEYPOT_FIELD, TIMETRAP_FIELD, looksLikeBot } from '@/lib/form-trust'

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
): Promise<{ url: string }> {
  // Silent spam drop — a filled honeypot / instant submit returns a benign
  // empty URL the client treats as a no-op (it guards on a falsy url). No
  // Stripe session is created and the bot gets no signal.
  if (looksLikeBot({ [HONEYPOT_FIELD]: input.hp ?? '', [TIMETRAP_FIELD]: input.ts ?? '' })) {
    return { url: '' }
  }
  const site = await getClinicSiteBySlug(slug)
  if (!site) throw new Error('We couldn’t find this clinic. Please refresh and try again.')
  return createMembershipCheckout(site.orgId, publicSiteUrl(site), input)
}
