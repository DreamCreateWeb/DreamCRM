'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import {
  getPartnerInviteByToken,
  getPartnerByUserId,
  linkPartnerUser,
  type PartnerInviteDetails,
} from '@/lib/services/referrals'

/**
 * Server actions for the partner accept-invite page. The invite token in the
 * URL is the auth — the visitor may have no session yet (they're creating their
 * partner account here).
 */

export async function getPartnerInviteDetailsAction(token: string): Promise<PartnerInviteDetails | null> {
  if (!token || token.length < 8) return null
  return getPartnerInviteByToken(token)
}

/**
 * Complete acceptance for the signed-in user: verify their session email
 * matches the invite, then link + activate the partner row. Returns an error
 * string when the emails don't match (the account they're signed in as isn't
 * the invited one).
 */
export async function completePartnerAcceptAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const invite = await getPartnerInviteByToken(token)
  if (!invite) return { ok: false, error: 'This invite link is invalid or has already been used.' }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, error: 'Please sign in first.' }

  // Idempotency: if THIS user is already the linked partner, treat as success.
  const existing = await getPartnerByUserId(session.user.id)
  if (existing && existing.id === invite.partnerId) return { ok: true }

  if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invite is for ${invite.email}. Sign in with that email to accept it.`,
    }
  }

  await linkPartnerUser(invite.partnerId, session.user.id)
  return { ok: true }
}
