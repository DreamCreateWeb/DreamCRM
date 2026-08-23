import 'server-only'

/**
 * PUTTING THE TEAM TO WORK (docs/ai-operations.md, D8) — the server half of
 * Sandman's requests.
 *
 * THE WHOLE DESIGN IS ONE SENTENCE: a request runs an EXISTING generator
 * now. There is no new drafting path, no new prompt, no new write. Whatever
 * the hourly cycle would have produced later, the person gets a few hours
 * early — and it still lands as a draft in the sign-here stack needing a
 * human yes.
 *
 * That is also why every guard already holds. Each generator carries its
 * own stand-downs, its own `sourceKey` dedupe, and its own skip-when-AI-is-
 * off, so a second tap cannot mint a second card and a tap at a bad moment
 * mints none. "Nothing to draft right now" is therefore a NORMAL outcome,
 * not a failure — and the copy says which, because a person who taps a
 * button and sees nothing happen will assume the button is broken.
 */

import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import type { SandmanRequestKind } from '@/lib/sandman'

export interface SandmanRequestResult {
  ok: boolean
  message: string
}

/**
 * Why a generator that ran fine produced nothing — said in the practice's
 * own terms, per request. Deliberately not one shared line: "nothing to do"
 * means something different for a post (they already have one waiting) than
 * for next week's gaps (the week is full, which is good news).
 */
const NOTHING_TO_DRAFT: Record<SandmanRequestKind, string> = {
  draft_social:
    'Nothing new to draft right now — there’s already one waiting on you, or a month plan covering it.',
  plan_month: 'Your next four weeks are already spoken for — nothing to plan on top of it.',
  recall_campaign:
    'No recall to send right now — either nobody’s due, or an invitation already went out recently.',
  fill_week: 'Next week looks well booked — no quiet days worth writing about.',
}

const DRAFTED: Record<SandmanRequestKind, string> = {
  draft_social: 'Done — a post is drafted and waiting on your yes.',
  plan_month: 'Done — four weeks are planned and waiting on your yes.',
  recall_campaign: 'Done — a recall invitation is drafted and waiting on your yes.',
  fill_week: 'Done — an invitation about next week’s quiet days is waiting on your yes.',
}

/**
 * Run one request. Never throws: a broken generator is reported as a plain
 * apology, because this is a conversation surface and an error object is not
 * an answer.
 */
export async function runSandmanRequest(
  organizationId: string,
  clinicName: string,
  kind: SandmanRequestKind,
  now: Date = new Date(),
): Promise<SandmanRequestResult> {
  try {
    const tz = await getClinicTimeZone(organizationId).catch(() => 'America/New_York')
    const gen = await import('@/lib/services/proposal-generators')
    let filed = 0
    switch (kind) {
      case 'draft_social':
        filed = await gen.generateSocialPostProposals(organizationId, clinicName, now, tz)
        break
      case 'plan_month':
        filed = await gen.generateContentPlanProposals(organizationId, clinicName, now, tz)
        break
      case 'recall_campaign':
        filed = await gen.generateOutreachCampaignProposals(organizationId, now, tz)
        break
      case 'fill_week':
        filed = await gen.generateScheduleGapProposals(organizationId, now, tz)
        break
    }
    return filed > 0
      ? { ok: true, message: DRAFTED[kind] }
      : // Not an error, and it must not read as one: the generator did its
        // job and correctly decided there was nothing to add.
        { ok: true, message: NOTHING_TO_DRAFT[kind] }
  } catch {
    return { ok: false, message: 'That didn’t go through — try asking me again in a moment.' }
  }
}
