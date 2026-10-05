import 'server-only'
import { count, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { A1_PATIENT_FLOOR } from '@/lib/first-week'
import { isClinicShutDown } from '@/lib/services/billing-state'
import { stampActivation } from '@/lib/services/activation'

/**
 * THE DAY-ONE KICK (docs/ACTIVATION.md law 5, slice S2). "The machine fires
 * on day one": the moment a clinic's data arrives — the first PMS import
 * lands, a patient CSV is imported, Google is connected — that clinic's
 * generators run NOW, the same per-org pass the hourly cron runs, so the
 * first card is in the sign-here stack while the owner is still on the
 * setup call instead of up to an hour later.
 *
 * Three laws keep it cheap and honest:
 *  - CLINICS ONLY, never the demo (its seeded cards are the demo), never a
 *    shut-down clinic (the kill ruling: no generated work behind the wall).
 *  - THROTTLED on the Dream Team heartbeat: if a pass stamped `Cycles`
 *    inside the last KICK_COOLDOWN_MS (the hourly tick, or a kick a minute
 *    ago), this one is skipped — a scheduled PMS sync every two hours must
 *    not double every generator's AI spend.
 *  - A1 IS STAMPED HERE, the first time: a connected PMS or Google profile
 *    stamps at once; a CSV stamps once the roster clears A1_PATIENT_FLOOR.
 *    The stamp is write-once and the kick runs whether or not it was the
 *    first — a second data source connected on day 12 still earns its card
 *    now.
 *
 * NEVER THROWS INTO ITS CALLER: a hook site is a sync, an import or an
 * OAuth return, and none of those may fail because the follow-up did.
 */

export type KickReason = 'pms_synced' | 'patients_imported' | 'gbp_connected'

export const KICK_COOLDOWN_MS = 15 * 60 * 1000

export interface KickResult {
  ran: boolean
  reason: KickReason
  why: 'ran' | 'not_a_clinic' | 'demo' | 'shut_down' | 'cooldown' | 'failed'
  stampedA1: boolean
  filed: number
}

export async function kickOffFirstWeek(organizationId: string, reason: KickReason, opts: { now?: Date } = {}): Promise<KickResult> {
  const now = opts.now ?? new Date()
  const base = { ran: false, reason, stampedA1: false, filed: 0 }
  try {
    const [org] = await db
      .select({ id: schema.organization.id, name: schema.organization.name, type: schema.organization.type, isDemo: schema.organization.isDemo })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1)
    if (!org || org.type !== 'clinic') return { ...base, why: 'not_a_clinic' }
    if (org.isDemo) return { ...base, why: 'demo' }
    if (await isClinicShutDown(organizationId, now)) return { ...base, why: 'shut_down' }

    // A1: PMS and Google connect stamp at once; a CSV stamps once the roster is real.
    let eligibleForA1 = true
    if (reason === 'patients_imported') {
      const [{ n } = { n: 0 }] = await db
        .select({ n: count() })
        .from(schema.patient)
        .where(eq(schema.patient.organizationId, organizationId))
        .limit(1)
      eligibleForA1 = Number(n) >= A1_PATIENT_FLOOR
    }
    const stampedA1 = eligibleForA1 ? await stampActivation(organizationId, 'a1', now) : false

    const [profile] = await db
      .select({ cycleAt: schema.clinicProfile.dreamTeamCycleAt })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    if (profile?.cycleAt && now.getTime() - profile.cycleAt.getTime() < KICK_COOLDOWN_MS) {
      return { ...base, stampedA1, why: 'cooldown' }
    }

    const { runOrgGeneratorPass } = await import('@/lib/services/proposal-generators')
    const result = await runOrgGeneratorPass({ id: org.id, name: org.name }, now)
    return { ran: true, reason, why: 'ran', stampedA1, filed: result.filed }
  } catch (e) {
    console.error('[day-one-kick] failed:', e)
    return { ...base, why: 'failed' }
  }
}

/**
 * Fire-and-forget for hook sites: the import/sync/OAuth return finishes on
 * its own clock, the kick runs behind it on the same long-lived server
 * (App Runner, not a function host). Nothing can reject out of it.
 */
export function scheduleKick(organizationId: string, reason: KickReason): void {
  void kickOffFirstWeek(organizationId, reason).catch((e) => console.error('[day-one-kick] unhandled:', e))
}
