'use server'

import { recordNpsScore, recordNpsComment } from '@/lib/services/nps'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'

/** Token-is-auth (the /r pattern): record the 0–10 tap. */
export async function submitNpsScoreAction(
  token: string,
  score: number,
): Promise<{ ok: boolean }> {
  if (!(await rateLimitPublicAction('nps', { limit: 20 }))) return { ok: false }
  if (!token || token.length > 200) return { ok: false }
  return { ok: await recordNpsScore(token, Math.round(score)) }
}

/** Attach the optional follow-up comment (only lands after a score). */
export async function submitNpsCommentAction(
  token: string,
  comment: string,
): Promise<{ ok: boolean }> {
  if (!(await rateLimitPublicAction('nps', { limit: 20 }))) return { ok: false }
  if (!token || token.length > 200) return { ok: false }
  return { ok: await recordNpsComment(token, comment) }
}
