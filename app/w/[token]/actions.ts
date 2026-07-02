'use server'

import { claimOffer } from '@/lib/services/appointment-waitlist'

/** Public claim action — the token is the auth (no session). */
export async function claimOfferAction(
  token: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'taken' | 'expired' }> {
  if (!token || typeof token !== 'string' || token.length > 200) {
    return { ok: false, reason: 'not_found' }
  }
  return claimOffer(token)
}
