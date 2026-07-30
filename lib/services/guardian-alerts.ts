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

async function readMemory(
  organizationId: string,
): Promise<AlertMemory & { missing?: boolean }> {
  try {
    const [row] = await db
      .select({
        state: schema.clinicProfile.guardianState,
        alertedAt: schema.clinicProfile.guardianAlertedAt,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    // NO PROFILE ROW AT ALL (round-2 audit). The memory write is a bare
    // UPDATE, so it matches nothing and the state can never persist — and
    // `shouldAlert` reads an unchanged null state as news, so this clinic
    // would be alerted about EVERY morning, forever, which is precisely the
    // muting behaviour the cadence exists to prevent. Reachable in
    // production: provisioning inserts the org, then makes a Stripe call
    // that can throw, and only then inserts the profile.
    if (!row) return { state: null, alertedAt: null, missing: true }
    return {
      state: (row.state as EngineState | null) ?? null,
      alertedAt: row.alertedAt ?? null,
    }
  } catch (e) {
    // An unreadable memory must never SILENCE an alarm — the whole point is
    // not going blind. No memory reads as "never alerted". Logged, per the
    // round-8 lesson: a swallowed query error is indistinguishable from a
    // path that never ran.
    console.error('[guardian] alert-memory read failed', e)
    return { state: null, alertedAt: null }
  }
}

/** The owner-facing email for one clinic. Plain, specific, and it always
 *  says what I'd do — a guardian that only reports problems makes work. */
function alertBody(report: ClinicEngineReport, memory: AlertMemory, now: Date): string {
  const lines = [report.verdict.headline, '', report.verdict.why]
  // NEW vs STILL (round-1 in-phase gap). Every alert read identically, so
  // the owner could not tell this morning's break from the same one they
  // were told about a week ago and have been chasing since. The cadence
  // already knows which it is; it was just never said out loud.
  if (memory.state === report.verdict.state && memory.alertedAt) {
    const days = Math.max(1, Math.round((now.getTime() - memory.alertedAt.getTime()) / 86_400_000))
    // "LAST told", not "first" (verification round 3). guardianAlertedAt is
    // overwritten on every delivery and the cadence re-alerts weekly, so
    // this number is structurally pinned at or under RE_ALERT_DAYS — a
    // six-week-old break read as a seven-day-old one. Naming a first-seen
    // instant would need its own column; saying what the stored value
    // actually means costs nothing and is true.
    lines.push('', `Still going: I last flagged this ${days} ${days === 1 ? 'day' : 'days'} ago.`)
  }
  // Name the actual breaks instead of leaving the owner with the headline's
  // guess at a cause (round-2 in-phase gap).
  if (report.failureCauses.length > 0) {
    lines.push('', 'What it tried:')
    for (const c of report.failureCauses) lines.push(`• ${c}`)
  }
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
    // `report: true` keeps this out of the WORK counts — see isWorkEntry.
    detail: { guardianState: report.verdict.state, report: true },
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
      if (memory.missing) {
        // Half-provisioned. Report it to ourselves once per run instead of
        // emailing about a clinic whose engine was never set up.
        result.errors.push({
          organizationId: report.organizationId,
          error: 'no clinic_profile row — half-provisioned; alert memory cannot persist',
        })
        continue
      }
      const alerting = shouldAlert(memory, state, now)
      // REVERTED (verification round). Round 3 added a "say it once to the
      // practice" rule gated on `memory.state !== state`, to stop nagging a
      // clinic weekly about a switch it may have turned off deliberately.
      // The intent was right; the gate was wrong, because `guardianState` is
      // stamped on EVERY pass whether or not anything was delivered. Two
      // holes followed. (a) A ledger write that failed still stamped the
      // state, so the next run saw "no change", took the no-op branch, and
      // the note was never retried — despite the comment below promising
      // exactly that retry. (b) Worse: at the moment the owner opens the
      // lock, every clinic already carries its current state from earlier
      // platform-audience runs, so nothing is "new" for any of them — and
      // because the clinic branch also short-circuits the owner email, a
      // blocked practice fell into a hole where NEITHER audience was told,
      // until its state happened to change.
      //
      // Weekly repetition is annoying; silence is broken. So both audiences
      // share the one cadence again. Telling a practice only once needs a
      // per-audience memory of its own — filed as backlog, not faked with a
      // stamp that means something else.

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
      } else if (alerting && recipients.length === 0) {
        // Say it out loud: an alert was due and there was no one to send it
        // to. Previously this path silently attempted nothing.
        result.errors.push({
          organizationId: report.organizationId,
          error: 'no platform admin to email — the alert had nowhere to go',
        })
      } else if (alerting) {
        const sends = await Promise.all(
          recipients.map((to) =>
            sendNotificationEmail({
              to,
              name: null,
              title: `${
                memory.state === report.verdict.state && memory.alertedAt ? 'Still: ' : ''
              }${report.clinicName}: ${report.verdict.headline}`,
              body: alertBody(report, memory, now),
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

      // Record what is true once it has been SAID — that is what makes "the
      // same problem" distinguishable from "a new one" tomorrow. The order
      // is deliberate: a crash between the delivery and the stamp repeats
      // the report tomorrow, which is the survivable side of that trade.
      // WHAT WE MAY REMEMBER (verification round 2). Stamping the state on
      // every pass looked harmless — `guardianAlertedAt` was the delivery
      // half — but `shouldAlert` reads BOTH: once the state stamp has moved,
      // only a null or stale `alertedAt` can still force a retry. So a
      // clinic that went stalled -> blocked while the mail was down had
      // 'blocked' recorded, kept a recent `alertedAt` from the PREVIOUS
      // problem, and went silent for up to a week on the new one. The state
      // may only be recorded once the report about it actually landed —
      // or when there was nothing to report in the first place.
      const nothingToDeliver = !alerting
      // SKIP THE WRITE ENTIRELY when there is nothing to record (verification
      // round 3). The previous shape spread two conditionals into `.set()`,
      // and on the one path that matters — a report was due and did NOT land
      // — both spreads were empty. drizzle throws "No values to set" on an
      // empty set, which the per-clinic catch then swallowed INTO
      // result.errors, replacing the real diagnosis ("smtp down", "there was
      // nobody to email") with an ORM string. The behaviour was right and
      // the watcher went blind about itself, which is the failure this whole
      // phase exists to remove.
      if (delivered || nothingToDeliver) {
        await db
          .update(schema.clinicProfile)
          .set({
            guardianState: state,
            ...(delivered ? { guardianAlertedAt: now } : {}),
          })
          .where(eq(schema.clinicProfile.organizationId, report.organizationId))
      }
    } catch (e) {
      result.errors.push({ organizationId: report.organizationId, error: (e as Error).message })
    }
  }

  return result
}
