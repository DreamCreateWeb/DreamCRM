'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { normalizeEmail } from '@/lib/contact-normalize'
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
 * string (mapped to human copy) when something blocks the link:
 *  - invalid / expired token,
 *  - no session,
 *  - signed in as a DIFFERENT email than the invite (with the right next step).
 * Idempotent: re-running for the already-linked user is a success.
 */
export async function completePartnerAcceptAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const invite = await getPartnerInviteByToken(token)
  if (!invite) return { ok: false, error: 'This invite link is invalid or has already been used.' }
  if (invite.expired) {
    return { ok: false, error: 'This invite has expired. Ask your Dream Create contact to send a fresh one.' }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, error: 'Please sign in first.' }

  // Idempotency: if THIS user is already the linked partner, treat as success.
  const existing = await getPartnerByUserId(session.user.id)
  if (existing && existing.id === invite.partnerId) return { ok: true }

  // One email = one user across personas: compare normalized (lowercased +
  // trimmed). referral_partner.email is stored lowercased; the session email
  // may carry stray casing.
  if (normalizeEmail(session.user.email) !== normalizeEmail(invite.email)) {
    return {
      ok: false,
      error: `You're signed in as ${session.user.email}, but this invite is for ${invite.email}. Sign out and continue as ${invite.email} to accept it.`,
    }
  }

  await linkPartnerUser(invite.partnerId, session.user.id)
  return { ok: true }
}
