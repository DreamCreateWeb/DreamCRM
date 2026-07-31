import 'server-only'
import { recordEngineFailure } from '@/lib/services/action-ledger'

/**
 * THE AUTOMATION FAILURE REGISTRY (Phase 4 open item #1, 2026-07-31).
 *
 * The Guardian's `blocked` verdict counts "the machine tried and couldn't"
 * days — and until now only TWO things could produce one: the proposal
 * engine and the autonomy hand-back. So the send and sync automations, which
 * are most of what a clinic actually experiences, could fail every hour of
 * every day and the Guardian would report that practice `healthy`, because
 * an idle ledger with no failures reads as calm. That was named as the first
 * open item on the Phase 4 certificate.
 *
 * WHY A REGISTRY RATHER THAN FIVE CALL SITES. This phase's signature defect,
 * found over and over, is one concept encoded in two places that drift. Five
 * hand-written `recordEngineFailure` calls would each carry their own
 * capability, their own sentence and their own throttle, and the sixth
 * producer added next year would carry a seventh variation. One table, one
 * helper, one throttle.
 *
 * THE SENTENCES ARE CLINIC-FACING. They land in that practice's own ledger
 * and can be read by them, so they are written from their side of the glass:
 * plain, owning it, and never blaming them for our plumbing. The Guardian's
 * OWNER-facing report re-voices them through the capability labels — it
 * never replays these.
 */

/** Every automation that can tell the Guardian it is broken. The key is the
 *  producer; `capability` is the registered vocabulary entry the entry is
 *  filed under (lib/autonomy.ts). */
export const AUTOMATION_FAILURE = {
  reminders: {
    capability: 'appointment_reminder',
    summary: 'Couldn’t send an appointment reminder just now — I’ll keep trying.',
  },
  campaigns: {
    capability: 'campaign_send',
    summary: 'Couldn’t send a scheduled campaign just now — I’ll keep trying.',
  },
  retention: {
    capability: 'retention_automation',
    summary: 'Couldn’t line up a recall or win-back nudge just now — I’ll keep trying.',
  },
  review_sync: {
    capability: 'review_feature',
    summary: 'Couldn’t pull your new reviews in just now — I’ll keep trying.',
  },
  gbp_sync: {
    capability: 'listing_sync',
    summary: 'Couldn’t check your Google listing just now — I’ll keep trying.',
  },
  pms_sync: {
    capability: 'pms_sync',
    summary: 'Couldn’t sync with your practice software just now — I’ll keep trying.',
  },
} as const satisfies Record<string, { capability: string; summary: string }>

export type AutomationFailureKey = keyof typeof AUTOMATION_FAILURE

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * ONE FAILURE PER PRODUCER PER DAY, per clinic.
 *
 * The same window `recordEngineFailure`'s own doc argues for, for the same
 * reason: these run on 15-minute and hourly crons, so an undeduped writer
 * would put dozens of identical rows a day into a clinic's own story and
 * trip the three-strike alarm before lunch on day one. With the window, a
 * strike means a DAY of a broken thing — which is what
 * `FAILURE_ALARM_COUNT` is documented to mean.
 *
 * Deliberately NOT `dedupeAcrossOrg`: unlike the proposal engine's five
 * steps, these are genuinely independent subsystems. Reminders failing and
 * Google sync failing on the same morning are two facts, and the owner's
 * "what it tried" list should name both.
 *
 * Best-effort by construction — `recordEngineFailure` never throws, and a
 * run that cannot do its bookkeeping must still finish its work.
 */
export async function reportAutomationFailure(
  organizationId: string,
  key: AutomationFailureKey,
  occurredAt?: Date,
): Promise<boolean> {
  const def = AUTOMATION_FAILURE[key]
  return recordEngineFailure({
    organizationId,
    capability: def.capability,
    summary: def.summary,
    occurredAt,
    onceWithin: DAY_MS,
    kind: 'engine',
  })
}
