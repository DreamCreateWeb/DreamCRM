import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { shouldAlert, type AlertMemory, type EngineState } from '@/lib/guardian'
import { sweepEngineHealth, type ClinicEngineReport } from '@/lib/services/guardian'
import { sendNotificationEmail } from '@/lib/email'

/**
 * THE GUARDIAN's outbound half (Transformation Phase 4). The sweep decides
 * what is true; this decides when it is worth interrupting the owner, and
 * remembers what it already said.
 *
 * The one design rule: a guardian that emails the same problem every
 * morning gets muted, and a muted guardian is worse than none. So the
 * memory on `clinic_profile.guardian_state` / `guardian_alerted_at` exists
 * to raise a NEW or CHANGED problem immediately and a persisting one only
 * weekly. That memory is the platform's bookkeeping about a clinic — never
 * clinic data, never shown to the clinic.
 */

export interface GuardianRunResult {
  scanned: number
  flagged: number
  alerted: number
  /** Clinic names emailed about, for the cron's response body. */
  alertedClinics: string[]
  errors: Array<{ organizationId: string; error: string }>
}

async function readMemory(organizationId: string): Promise<AlertMemory> {
  try {
    const [row] = await db
      .select({
        state: schema.clinicProfile.guardianState,
        alertedAt: schema.clinicProfile.guardianAlertedAt,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    return {
      state: (row?.state as EngineState | null) ?? null,
      alertedAt: row?.alertedAt ?? null,
    }
  } catch {
    // An unreadable memory must never SILENCE an alarm — the whole point is
    // not going blind. No memory reads as "never alerted".
    return { state: null, alertedAt: null }
  }
}

/** The owner-facing email for one clinic. Plain, specific, and it always
 *  says what I'd do — a guardian that only reports problems makes work. */
function alertBody(report: ClinicEngineReport): string {
  const lines = [
    report.verdict.headline,
    '',
    report.verdict.why,
  ]
  if (report.verdict.recommendation) {
    lines.push('', `What I'd do: ${report.verdict.recommendation}`)
  }
  return lines.join('\n')
}

/**
 * Sweep every clinic, alert the platform owner about the ones that need a
 * human, and record what was said. Runs daily.
 */
export async function runGuardianSweep(now: Date = new Date()): Promise<GuardianRunResult> {
  const sweep = await sweepEngineHealth(now)
  const result: GuardianRunResult = {
    scanned: sweep.reports.length,
    flagged: sweep.flagged.length,
    alerted: 0,
    alertedClinics: [],
    errors: [],
  }

  // Platform admins are the audience — this is Dream Create's own watch,
  // and the clinic never sees any of it.
  let recipients: string[] = []
  try {
    const rows = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.platformAdmin, true))
      .limit(10)
    recipients = rows.map((r) => r.email).filter((e): e is string => !!e)
  } catch (e) {
    result.errors.push({ organizationId: '-', error: `recipients: ${(e as Error).message}` })
  }

  for (const report of sweep.reports) {
    try {
      const memory = await readMemory(report.organizationId)
      const state = report.verdict.state
      const alerting = shouldAlert(memory, state, now)

      // Did an email actually LAND? Only a real send may move the stamp —
      // otherwise a mail outage buys the problem a week of silence, which
      // is the one failure mode a guardian must not have.
      let delivered = false
      if (alerting && recipients.length > 0) {
        const sends = await Promise.all(
          recipients.map((to) =>
            sendNotificationEmail({
              to,
              name: null,
              title: `${report.clinicName}: ${report.verdict.headline}`,
              body: alertBody(report),
              linkPath: '/dashboard',
              linkLabel: 'Open the platform overview →',
            })
              .then(() => true)
              .catch((e) => {
                result.errors.push({
                  organizationId: report.organizationId,
                  error: `email: ${(e as Error).message}`,
                })
                return false
              }),
          ),
        )
        delivered = sends.some(Boolean)
        if (delivered) {
          result.alerted++
          result.alertedClinics.push(report.clinicName)
        }
      }

      // ALWAYS record the current state, alerted or not: that is what makes
      // "the same problem" distinguishable from "a new one" tomorrow. The
      // alerted stamp moves ONLY on a delivered email, so tomorrow's run
      // retries an alert that never reached anyone.
      await db
        .update(schema.clinicProfile)
        .set({
          guardianState: state,
          ...(delivered ? { guardianAlertedAt: now } : {}),
        })
        .where(eq(schema.clinicProfile.organizationId, report.organizationId))
    } catch (e) {
      result.errors.push({ organizationId: report.organizationId, error: (e as Error).message })
    }
  }

  return result
}
