'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { normalizeEmail } from '@/lib/contact-normalize'
import {
  getCallerInviteByToken,
  getCallerByUserId,
  linkCallerUser,
  type CallerInviteDetails,
} from '@/lib/services/prospect-callers'

/**
 * Server actions for the caller accept-invite page (P-02) — the partner
 * accept flow, mirrored exactly. The invite token in the URL is the auth;
 * the visitor may have no session yet (they create their account here).
 */

export async function getCallerInviteDetailsAction(token: string): Promise<CallerInviteDetails | null> {
  if (!token || token.length < 8) return null
  return getCallerInviteByToken(token)
}

/**
 * Complete acceptance for the signed-in user: verify their session email
 * matches the invite, then link + activate the caller row. Returns an error
 * string (human copy) when something blocks the link: invalid / expired
 * token, no session, or signed in as a DIFFERENT email than the invite.
 * Idempotent: re-running for the already-linked user is a success.
 */
export async function completeCallerAcceptAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const invite = await getCallerInviteByToken(token)
  if (!invite) return { ok: false, error: 'This invite link is invalid or has already been used.' }
  if (invite.expired) {
    return { ok: false, error: 'This invite has expired. Ask your Dream Create contact to send a fresh one.' }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, error: 'Please sign in first.' }

  const existing = await getCallerByUserId(session.user.id)
  if (existing && existing.id === invite.callerId) return { ok: true }

  if (normalizeEmail(session.user.email) !== normalizeEmail(invite.email)) {
    return {
      ok: false,
      error: `You're signed in as ${session.user.email}, but this invite is for ${invite.email}. Sign out and continue as ${invite.email} to accept it.`,
    }
  }

  // The link re-checks the token, the status and the clock inside its own
  // UPDATE: an archive or a resend that landed since the page's read makes
  // this a miss, never a re-activation of a revoked row.
  const linked = await linkCallerUser(invite.callerId, session.user.id, token)
  if (!linked) {
    return { ok: false, error: 'This invite link is no longer valid. Ask your Dream Create contact to send a fresh one.' }
  }
  return { ok: true }
}
