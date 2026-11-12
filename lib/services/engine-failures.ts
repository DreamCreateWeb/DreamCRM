import 'server-only'
import { listRecentActions, recordEngineFailure } from '@/lib/services/action-ledger'

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
  // The custom-domain sweep (2026-10-26): the 15-minute check that attaches
  // the certificate and flips a pending domain live after the tab is closed.
  custom_domain: {
    capability: 'custom_domain',
    summary: 'Couldn’t check on your web address just now — I’ll keep trying.',
  },
  // The notification re-drive (ML-32): the 15-minute sweep that re-attempts
  // a staff alert email the dispatch could not land. One strike per clinic
  // per day when a re-attempt itself fails — the bell row is already there;
  // what broke is the copy to their inbox.
  staff_alert: {
    capability: 'staff_alert',
    summary: 'Couldn’t get an alert email to your inbox just now — I’ll keep trying.',
  },
  // The Gmail mailbox sync (ML-59): the 5-minute sweep that keeps /inbox fresh
  // behind the page. One strike per clinic per day when a mailbox's sync throws.
  inbox_sync: {
    capability: 'inbox_sync',
    summary: 'Couldn’t pull in your latest email just now — I’ll keep trying.',
  },
  // THE PROSPECTING ENGINE (P-01): keyed on the PLATFORM org (Dream Create
  // is the only reader), one strike a day PER FAILURE CLASS — see
  // reportProspectingFailure below, which carries the class in the sentence.
  prospecting: {
    capability: 'prospecting',
    summary: 'Couldn’t verify a batch of prospects just now — I’ll keep trying.',
  },
  // The metrics snapshot (ML-38b): the hourly pass that records each clinic's
  // yesterday for the tiles' sparks. One strike per clinic per day when its
  // pass throws; the walk always continues.
  metric_snapshot: {
    capability: 'metric_snapshot',
    summary: 'Couldn’t update the trend lines on your tiles just now — I’ll keep trying.',
  },
} as const satisfies Record<string, { capability: string; summary: string }>

/**
 * The prospecting engine's failure classes (P-01). Each is a distinct
 * plumbing fault with a distinct fix, so each gets its own daily strike and
 * its own sentence — the owner reads WHICH key or permission is wrong.
 */
export const PROSPECTING_FAILURE_CLASSES = {
  places_auth: 'Couldn’t reach Google Places just now (the key was refused) — I’ll keep trying.',
  phone_validate_auth:
    'Couldn’t validate prospect phone numbers just now (AWS refused mobiletargeting:PhoneNumberValidate) — I’ll keep trying.',
  nppes_down: 'Couldn’t reach the NPI registry just now — I’ll keep trying.',
  crawl_blocked: 'Couldn’t reach prospect websites just now (every check failed) — I’ll keep trying.',
  // The hygiene pass (P-03): merges, resting rows, the territory refresh —
  // and a merge's restore that failed after the merge committed (P-04 fix
  // pass III, W8: the context names the row; the hygiene pass keeps merging).
  hygiene: 'Couldn’t tidy the prospect list just now (duplicates, resting rows, a territory refresh) — I’ll keep trying.',
} as const satisfies Record<string, string>

export type ProspectingFailureClass = keyof typeof PROSPECTING_FAILURE_CLASSES

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

/**
 * ONE STRIKE A DAY PER CLASS, on the platform org (P-01).
 *
 * `recordEngineFailure`'s window dedupes per (org, capability); the
 * prospecting engine wants per CLASS, because "the Places key is wrong" and
 * "AWS refused the phone check" are two faults with two fixes, and the
 * second must not hide behind the first. So the dedupe reads today's
 * `prospecting` entries and looks at `detail.class`. Best-effort: an
 * unreadable ledger records anyway (a duplicate row beats going blind).
 *
 * Returns false when there is no platform org, when suppressed, or when
 * the write failed — the caller has nothing different to do in any case.
 */
export async function reportProspectingFailure(
  cls: ProspectingFailureClass,
  occurredAt: Date = new Date(),
  /** One line of context beside the class — which step, which row, what
   *  it said (the merge's restore, fix pass III W8). Never a secret. */
  context: Record<string, unknown> | null = null,
): Promise<boolean> {
  let orgId: string | null = null
  try {
    const { getPlatformOrgId } = await import('@/lib/services/gsc')
    orgId = await getPlatformOrgId()
  } catch (e) {
    console.error('[engine-failures] platform org read failed', e)
    return false
  }
  if (!orgId) return false
  try {
    const today = await listRecentActions(orgId, {
      since: new Date(occurredAt.getTime() - DAY_MS),
      capabilities: [AUTOMATION_FAILURE.prospecting.capability],
      limit: 50,
    })
    const already = today.some((e) => {
      const d = e.detail as { class?: unknown; failure?: unknown } | null
      return d?.failure === true && d.class === cls
    })
    if (already) return false
  } catch (e) {
    console.error('[engine-failures] prospecting de-dup read failed, recording anyway:', e)
  }
  return recordEngineFailure({
    organizationId: orgId,
    capability: AUTOMATION_FAILURE.prospecting.capability,
    summary: PROSPECTING_FAILURE_CLASSES[cls],
    detail: { class: cls, ...(context ?? {}) },
    occurredAt,
    kind: 'engine',
  })
}

/** The last week's prospecting strikes, newest first — for the Engine view
 *  and the settings panel's status pills. */
export async function listProspectingFailures(
  days = 7,
  now: Date = new Date(),
): Promise<Array<{ class: ProspectingFailureClass | null; summary: string; occurredAt: Date }>> {
  try {
    const { getPlatformOrgId } = await import('@/lib/services/gsc')
    const orgId = await getPlatformOrgId()
    if (!orgId) return []
    const rows = await listRecentActions(orgId, {
      since: new Date(now.getTime() - days * DAY_MS),
      capabilities: [AUTOMATION_FAILURE.prospecting.capability],
      limit: 50,
    })
    return rows
      .filter((e) => (e.detail as { failure?: unknown } | null)?.failure === true)
      .map((e) => {
        const c = (e.detail as { class?: unknown } | null)?.class
        return {
          class:
            typeof c === 'string' && c in PROSPECTING_FAILURE_CLASSES ? (c as ProspectingFailureClass) : null,
          summary: e.summary,
          occurredAt: e.occurredAt,
        }
      })
  } catch (e) {
    console.error('[engine-failures] prospecting failure read failed', e)
    return []
  }
}
