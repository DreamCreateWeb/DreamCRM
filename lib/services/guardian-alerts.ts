import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  clinicActionable,
  clinicNote,
  shouldAlert,
  type AlertMemory,
  type EngineState,
  type GuardianAudience,
} from '@/lib/guardian'
import { sweepEngineHealth, type ClinicEngineReport } from '@/lib/services/guardian'
import { getGuardianAudience } from '@/lib/services/platform-config'
import { recordAction } from '@/lib/services/action-ledger'
import { sendNotificationEmail } from '@/lib/email'

/**
 * THE GUARDIAN's outbound half (Transformation Phase 4). The sweep decides
 * what is true; this decides who hears it, when it is worth interrupting
 * them, and remembers what it already said.
 *
 * The one design rule: a guardian that reports the same problem every
 * morning gets muted, and a muted guardian is worse than none. So the
 * memory on `clinic_profile.guardian_state` / `guardian_alerted_at` exists
 * to raise a NEW or CHANGED problem immediately and a persisting one only
 * weekly. That memory is the platform's bookkeeping about a clinic — never
 * clinic data, never shown to the clinic.
 *
 * WHO HEARS IT (the audience lock). Ships 'platform': only Dream Create is
 * told, and the clinic hears nothing. When the owner unlocks 'clinic', the
 * findings a practice can actually ACT on go to that practice, in its own
 * ledger, in its own voice — and the owner stops being emailed about those
 * (they keep the panel). Everything else — a silent engine, a stale
 * connection — stays with Dream Create at every setting, because those are
 * ours to fix and telling a clinic would hand them alarm with no lever.
 *
 * ONE MEMORY, BOTH AUDIENCES. The stamp records "this problem has been
 * reported", not "reported to X" — so flipping the lock mid-cadence lets an
 * already-reported problem finish its week before the new audience hears
 * it. That is the correct reading: the problem was raised, once.
 */

export interface GuardianRunResult {
  scanned: number
  flagged: number
  /** Which half the run took. Echoed by the cron so the lock is visible. */
  audience: GuardianAudience
  alerted: number
  /** Clinic names the OWNER was emailed about, for the cron's response body. */
  alertedClinics: string[]
  /** Clinics told directly, in their own ledger. Always empty at 'platform'. */
  notified: number
  notifiedClinics: string[]
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
 * Tell the PRACTICE, in its own ledger. Not an email and not a proposal:
 * there is nothing to approve here, only something to know, so it lands in
 * the one place the clinic already reads the machine's own account of
 * itself. Second person, no percentages, never a number without a next step
 * — the anti-shame law applies hardest when the machine is the one saying
 * "this got slower".
 *
 * Returns whether the note actually landed; only a real write may move the
 * stamp, for the same reason a failed email must not.
 */
async function tellClinic(report: ClinicEngineReport, now: Date): Promise<boolean> {
  const note = clinicNote(report.verdict.state, report.signals)
  // Guarded by clinicActionable at the call site; this is the belt to that
  // brace, so a future state added to one and not the other writes nothing
  // rather than writing an empty line into somebody's story.
  if (!note) return false
  return recordAction({
    organizationId: report.organizationId,
    capability: 'guardian_note',
    summary: note,
    detail: { guardianState: report.verdict.state },
    occurredAt: now,
  })
}

/**
 * Sweep every clinic, report the ones that need a human to whoever the
 * audience lock says, and record what was said. Runs daily.
 */
export async function runGuardianSweep(now: Date = new Date()): Promise<GuardianRunResult> {
  const sweep = await sweepEngineHealth(now)
  // Floored at 'platform' on every failure path (see platform-config): the
  // failure we refuse is the machine starting to talk to customers because
  // a read went wrong.
  const audience = await getGuardianAudience().catch<GuardianAudience>(() => 'platform')
  const result: GuardianRunResult = {
    scanned: sweep.reports.length,
    flagged: sweep.flagged.length,
    audience,
    alerted: 0,
    alertedClinics: [],
    notified: 0,
    notifiedClinics: [],
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

      // WHO hears this one. The lock has to be open AND the finding has to
      // be something the practice can actually do something about; anything
      // else is ours, and goes to the owner at every setting.
      const toClinic = audience === 'clinic' && clinicActionable(state, report.signals)

      // Did the report actually LAND? Only a real delivery may move the
      // stamp — otherwise an outage buys the problem a week of silence,
      // which is the one failure mode a guardian must not have.
      let delivered = false
      if (alerting && toClinic) {
        delivered = await tellClinic(report, now)
        if (delivered) {
          result.notified++
          result.notifiedClinics.push(report.clinicName)
        } else {
          result.errors.push({
            organizationId: report.organizationId,
            error: 'ledger: guardian note not recorded',
          })
        }
      } else if (alerting && recipients.length > 0) {
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

      // ALWAYS record the current state, reported or not: that is what makes
      // "the same problem" distinguishable from "a new one" tomorrow. The
      // stamp moves ONLY on a delivery that landed — email or ledger note —
      // so tomorrow's run retries a report that reached nobody. The order is
      // deliberate: a crash between the delivery and the stamp repeats the
      // report tomorrow, which is the survivable side of that trade.
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
