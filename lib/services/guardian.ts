import 'server-only'
import { unstable_cache } from 'next/cache'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  assessEngine,
  needsAttention,
  ENGINE_STATE_RANK,
  summarizeSweep,
  clinicNote,
  RE_ALERT_DAYS,
  type EngineSignals,
  type EngineState,
  type EngineVerdict,
} from '@/lib/guardian'
import { readEngineSwitches } from '@/lib/services/engine-switches'
import { getGuardianAudience } from '@/lib/services/platform-config'
import { countSeatedBetween } from '@/lib/services/patient-journey'
import { countOpenProposals } from '@/lib/services/proposals'
import { workOnly, failureOnly } from '@/lib/services/action-ledger'
import { getCapability } from '@/lib/autonomy'
import { resolveTrialState } from '@/lib/trial'

/**
 * THE GUARDIAN (Transformation Phase 4 — DESIGN.md primitive #5), service
 * half. Gathers each clinic's engine signals and hands them to the pure
 * verdict in lib/guardian.ts.
 *
 * The promise this guards: "your practice exploded and you barely did
 * anything." A clinic cannot audit that promise from the inside — a quiet
 * dashboard looks the same whether the machine is idle or dead, which is
 * exactly why the Action Ledger exists. So Dream Create watches, and this
 * is the watching.
 *
 * Scope laws:
 *  - CLINIC orgs only, and never the DEMO org: its engines are excluded
 *    from every cron by design, so it would report as permanently silent
 *    and train the owner to ignore the list.
 *  - Read-only. The Guardian never touches a clinic's data; it reports.
 *  - Best-effort per clinic: one clinic's failed read never blanks the
 *    sweep (the whole point is not going blind).
 */

const DAY_MS = 24 * 60 * 60 * 1000

export interface ClinicEngineReport {
  organizationId: string
  clinicName: string
  verdict: EngineVerdict
  signals: EngineSignals
  /** What broke behind `failures7`, by capability, in the OWNER's voice —
   *  "Reply to Google reviews — 3 days". Never the clinic-addressed
   *  ledger sentence. Empty when nothing failed (or the ledger was
   *  unreadable). */
  failureCauses: string[]
}

export interface GuardianSweep {
  /** Worst first; the owner reads top-down and stops when it stops mattering. */
  reports: ClinicEngineReport[]
  /** Only the ones that need a human. */
  flagged: ClinicEngineReport[]
  /** The one line above the names. */
  summary: string
}

/** The WORK aggregate. Round-1 audit: this used to be a hand-copied second
 *  transcription of the isWorkEntry law, with a comment claiming there was
 *  one home — two copies that had to be edited in lockstep forever, which is
 *  exactly how the `report` marker would have been added to one and not the
 *  other. It now WRAPS action-ledger's `workOnly()`, so there is genuinely
 *  one home. Exported so the boundary test renders the real expression. */
export const workCountExpr = () => sql<number>`count(*) filter (where ${workOnly()})::int`

/**
 * WHAT actually broke, in the machine's own words (round-2 in-phase gap).
 *
 * `blocked` told the owner "the machine tried and couldn't, 3 times this
 * week" and then guessed at a cause — "usually an expired Google token, a
 * disconnected mailbox" — while the ledger held the actual sentences the
 * whole time. The failure vocabulary was written for a reader that did not
 * exist. This is that reader: what actually broke, by capability, so the
 * report names the break instead of speculating about it.
 */
/**
 * OWNER-VOICED names for the capabilities whose registry labels are written
 * in the CLINIC's second person (verification round 3). Round 2 moved the
 * owner's report off the ledger summaries and onto the labels — but the
 * labels are clinic-facing copy too: `proposal_engine` reads "Bring you work
 * that's ready to approve", and it is the likeliest line to appear because
 * ENGINE_DOWN carries it. The owner is not the one being brought work.
 * Anything not listed here already reads neutrally.
 */
const OWNER_CAPABILITY_NAME: Record<string, string> = {
  proposal_engine: 'Finding work to put in front of them',
  guardian_note: 'Flagging things for them to look at',
}

export async function recentFailureSummaries(
  organizationId: string,
  since: Date,
  limit = 3,
): Promise<string[]> {
  try {
    const rows = await db
      .select({
        capability: schema.actionLedger.capability,
        // DAYS, like the counter (round-6 audit). Round 3 moved the alarm to
        // distinct days and changed this list's WORD from "attempts" to
        // "days" in the same commit — but left the query counting rows. The
        // hand-back is deliberately unthrottled and writes one row per card,
        // so three cards handing back in one instant printed "hit trouble on
        // 1 day this week" directly above "Publish social posts — 3 days".
        // The counter and its explainer disagreeing is the phase's signature
        // defect; they now ask Postgres the same question.
        day: sql<string>`date_trunc('day',
          (${schema.actionLedger.occurredAt} at time zone 'UTC') at time zone coalesce(${schema.clinicProfile.timezone}, 'America/New_York')
        )`,
      })
      .from(schema.actionLedger)
      .leftJoin(
        schema.clinicProfile,
        eq(schema.clinicProfile.organizationId, schema.actionLedger.organizationId),
      )
      .where(
        and(
          eq(schema.actionLedger.organizationId, organizationId),
          gte(schema.actionLedger.occurredAt, since),
          failureOnly(),
        ),
      )
      .orderBy(desc(schema.actionLedger.occurredAt))
      // Generous: we collapse to (capability, day) pairs below, so the cap
      // bounds the read rather than the answer. A burst can no longer push a
      // genuinely different capability's break out of the list.
      .limit(500)
    // COUNT BY CAPABILITY, never the raw summary (verification round 2).
    // Those sentences are written for the CLINIC by construction — "you'd
    // handed this over to me", "it's back with you" — and printing them
    // verbatim in the platform owner's email addressed them to somebody who
    // handed nothing over and has nothing back with them. The tenant-voice
    // convention: any surface serving two tenants branches every
    // reader-addressed string. The capability LABEL is neutral and still
    // names the break.
    // One entry per (capability, day) — a burst on one afternoon is one day.
    const days = new Map<string, Set<string>>()
    for (const r of rows) {
      const set = days.get(r.capability) ?? new Set<string>()
      set.add(String(r.day))
      days.set(r.capability, set)
    }
    const counts = new Map<string, number>(
      Array.from(days.entries()).map(([cap, set]) => [cap, set.size]),
    )
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([cap, n]) => {
        const label = OWNER_CAPABILITY_NAME[cap] ?? getCapability(cap)?.label ?? cap.replace(/_/g, ' ')
        return `${label} — ${n} ${n === 1 ? 'day' : 'days'}`
      })
  } catch {
    // The count still stands on its own; we just cannot name the causes.
    return []
  }
}

/**
 * DAYS on which something broke — not rows (verification round 3).
 *
 * The write-side window throttles a WRITER; it cannot throttle the alarm.
 * The Phase-3 hand-back is deliberately unthrottled — each row names a
 * different card — and the granted-card loop hands back EVERY open card in
 * one tick — so a single two-hour provider outage wrote N rows in
 * the same instant, cleared FAILURE_ALARM_COUNT immediately, and pinned the
 * practice to `blocked` for the whole trailing week after the break had
 * already healed.
 *
 * Counting distinct days makes the alarm mean what its own documentation
 * always claimed: three strikes is three DAYS of a broken thing, whatever
 * shape the rows arrive in and whichever subsystem writes them. It also
 * makes the headline honest — "tried and couldn't on 3 days this week" is
 * true where "3 times" was counting bursts.
 */
export const failureCountExpr = () => sql<number>`count(distinct date_trunc('day',
  (${schema.actionLedger.occurredAt} at time zone 'UTC') at time zone coalesce(${schema.clinicProfile.timezone}, 'America/New_York')
)) filter (where ${failureOnly()})::int`

/**
 * Ledger counts per org for a window, split into WORK and FAILURES in one
 * pass. Grouped rather than per-clinic so the sweep stays one query as the
 * platform grows. Work excludes settings changes, hand-backs and failures
 * (the isWorkEntry law, in SQL) — counting a failure as work would make a
 * broken clinic look busy, which is precisely the confusion the Guardian
 * exists to remove.
 */
async function ledgerCountsByOrg(
  since: Date,
  until: Date,
): Promise<Map<string, { work: number; failures: number }>> {
  const rows = await db
    .select({
      organizationId: schema.actionLedger.organizationId,
      work: workCountExpr(),
      failures: failureCountExpr(),
    })
    .from(schema.actionLedger)
    // CLINIC-LOCAL DAYS, IN THE RIGHT DIRECTION (round-7 audit fixed round
    // 6's fix). `occurred_at` is timestamp WITHOUT zone holding a UTC wall
    // clock. In Postgres, `naive AT TIME ZONE z` ASSUMES the value is
    // already local in z and converts it TO timestamptz — it ADDS the
    // offset. Round 6 wrote the single-cast form, copied from the shared
    // brain where the column genuinely IS timestamptz, and so shifted the
    // boundary the WRONG WAY BY DOUBLE: 16:00 clinic-local for an EDT
    // practice. Two rows on one New York afternoon still landed in two
    // "days". The round trip — naive → UTC → clinic zone — is what actually
    // buckets a clinic's day. Original defect: date_trunc buckets on UTC
    // midnight — 8 PM the previous day in
    // EDT, 5 PM in PDT. A Pacific practice whose cards hand back at 4 PM and
    // 6 PM on one afternoon recorded TWO distinct "days", and two such
    // afternoons trip the alarm — precisely the "not one bad afternoon" the
    // constant's own doc promises. CLAUDE.md's day-bucketing rule is binding.
    .leftJoin(
      schema.clinicProfile,
      eq(schema.clinicProfile.organizationId, schema.actionLedger.organizationId),
    )
    .where(
      and(
        gte(schema.actionLedger.occurredAt, since),
        lt(schema.actionLedger.occurredAt, until),
      ),
    )
    .groupBy(schema.actionLedger.organizationId)
  const out = new Map<string, { work: number; failures: number }>()
  for (const r of rows) {
    out.set(r.organizationId, { work: Number(r.work ?? 0), failures: Number(r.failures ?? 0) })
  }
  return out
}

/** Assess one clinic. Not exported: the per-clinic drill-in the old comment
 *  promised was never built, and an export with no caller is a claim the
 *  code does not keep (round-2 audit). */
async function assessClinic(
  org: { id: string; name: string; createdAt: Date | null },
  windows: {
    weekStart: Date
    prevWeekStart: Date
    monthStart: Date
    prevMonthStart: Date
    now: Date
  },
  ledger: { this7: Map<string, { work: number; failures: number }>; prev7: Map<string, { work: number; failures: number }> },
): Promise<ClinicEngineReport> {
  const [switches, seated30, seatedPrev30, openProposals] = await Promise.all([
    readEngineSwitches(org.id),
    // NULL on failure, never 0 (round-2 audit). `.catch(() => 0)` turned an
    // unreadable current month into a confident "new patients are down 100%
    // on their own last month — 12 the month before, 0 this past month",
    // fabricated numbers and all, and emailed it to the owner. A number we
    // could not read is not a number we may report.
    countSeatedBetween(org.id, windows.monthStart, windows.now).catch(() => null),
    countSeatedBetween(org.id, windows.prevMonthStart, windows.monthStart).catch(() => null),
    countOpenProposals(org.id).catch(() => 0),
  ])
  const here = ledger.this7.get(org.id) ?? { work: 0, failures: 0 }
  // Only when there is something to explain — no query on a healthy clinic.
  const failureCauses =
    here.failures > 0 ? await recentFailureSummaries(org.id, windows.weekStart) : []
  const prev = ledger.prev7.get(org.id) ?? { work: 0, failures: 0 }
  const signals: EngineSignals = {
    ageDays: org.createdAt
      ? Math.max(0, Math.floor((windows.now.getTime() - org.createdAt.getTime()) / DAY_MS))
      : // No creation date recorded — treat as long-established rather than
        // brand new, so a missing column can never suppress a real alarm.
        9999,
    actions7: here.work,
    actionsPrev7: prev.work,
    failures7: here.failures,
    remindersOn: switches.remindersOn,
    reviewRequestsOn: switches.reviewRequestsOn,
    // A stall needs BOTH months. Unknown either side → present them as
    // equal, which is the one shape assessEngine cannot read as a drop.
    seated30: seated30 ?? 0,
    seatedPrev30: seated30 === null || seatedPrev30 === null ? 0 : seatedPrev30,
    openProposals,
  }
  return {
    organizationId: org.id,
    clinicName: org.name,
    verdict: assessEngine(signals),
    signals,
    failureCauses,
  }
}

/**
 * The Overview's read of the sweep, CACHED (round-1 audit).
 *
 * `sweepEngineHealth` is a full ledger scan plus a per-clinic fan-out —
 * switches, two seated-patient counts, an open-proposal count, each their
 * own query. The platform Overview is `force-dynamic`, so every render of
 * the owner's home page paid all of it, N times over, into a 10-connection
 * pool. At one clinic that is invisible; at fifty it is the owner's home
 * page timing out because they refreshed it.
 *
 * The data is a DAILY judgement — the cron that acts on it runs once a day —
 * so a few minutes of staleness costs nothing and the page gets cheap.
 * The cron calls `sweepEngineHealth` directly and is never served a cached
 * verdict, because it decides whether to interrupt a human.
 */
export const cachedEngineHealth = unstable_cache(
  async () => sweepEngineHealth(),
  ['guardian-sweep'],
  { revalidate: 300, tags: ['guardian-sweep'] },
)

/**
 * Every live clinic's engine health, worst first. The platform Overview's
 * Guardian section and the daily guardian cron both read this.
 */
export async function sweepEngineHealth(now: Date = new Date()): Promise<GuardianSweep> {
  const weekStart = new Date(now.getTime() - 7 * DAY_MS)
  const prevWeekStart = new Date(now.getTime() - 14 * DAY_MS)
  const monthStart = new Date(now.getTime() - 30 * DAY_MS)
  const prevMonthStart = new Date(now.getTime() - 60 * DAY_MS)

  const allOrgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      createdAt: schema.organization.createdAt,
      trialEndsAt: schema.clinicProfile.trialEndsAt,
      subscriptionStatus: schema.clinicProfile.subscriptionStatus,
      stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
    })
    .from(schema.organization)
    .leftJoin(
      schema.clinicProfile,
      eq(schema.clinicProfile.organizationId, schema.organization.id),
    )
    .where(and(eq(schema.organization.type, 'clinic'), eq(schema.organization.isDemo, false)))

  // LIFECYCLE (round-1 audit). A churned practice, or a trial that lapsed
  // without ever activating, has no engine to watch: nothing can run for
  // them because they are behind the billing wall. Without this filter they
  // reported `silent` forever and re-alerted the owner every week — the
  // crying-wolf failure this primitive is supposed to prevent, aimed at the
  // one group where the answer is never "go fix their integrations". Same
  // access law countOpenProposals uses, so the two agree about who is live.
  const orgs = allOrgs.filter((o) => !resolveTrialState(o, now).expired)

  if (orgs.length === 0) return { reports: [], flagged: [], summary: summarizeSweep([]) }

  // LEDGER UNAVAILABLE IS NOT SILENCE (round-2 audit). `.catch(() => new
  // Map())` made one timed-out aggregate report EVERY practice on the
  // platform as `silent` — the loudest verdict there is — email the owner
  // about all of them, and write 'silent' into every alert memory, so the
  // real recovery next day then read as a state CHANGE and alerted again.
  // A watcher that cannot see must say so, not invent the worst reading.
  let ledgerReadable = true
  const [this7, prev7] = await Promise.all([
    ledgerCountsByOrg(weekStart, now).catch((e) => {
      console.error('[guardian] ledger read failed', e)
      ledgerReadable = false
      return new Map()
    }),
    ledgerCountsByOrg(prevWeekStart, weekStart).catch((e) => {
      console.error('[guardian] prior-week ledger read failed', e)
      ledgerReadable = false
      return new Map()
    }),
  ])
  if (!ledgerReadable) {
    return { reports: [], flagged: [], summary: 'I could not read the activity log just now.' }
  }

  const settled = await Promise.all(
    orgs.map((o) =>
      assessClinic(o, { weekStart, prevWeekStart, monthStart, prevMonthStart, now }, { this7, prev7 }).catch(
        (e) => {
          // One unreadable clinic must never blank the sweep — going blind
          // is the failure this whole primitive exists to prevent.
          console.error('[guardian] assess failed for', o.id, e)
          return null
        },
      ),
    ),
  )
  const reports = settled
    .filter((r): r is ClinicEngineReport => r !== null)
    .sort(
      (a, b) =>
        ENGINE_STATE_RANK[a.verdict.state] - ENGINE_STATE_RANK[b.verdict.state] ||
        a.clinicName.localeCompare(b.clinicName),
    )
  return {
    reports,
    flagged: reports.filter((r) => needsAttention(r.verdict.state)),
    summary: summarizeSweep(reports.map((r) => r.verdict.state)),
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * THE CLINIC-FACING NOTE (Phase 4 slice 3)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The heads-up a practice is currently carrying, for its own Overview.
 *
 * Without this reader the clinic-facing half would be a write nobody reads.
 * A guardian_note is deliberately NOT work (it carries `detail.report`, so
 * `isWorkEntry` and `workOnly()` both exclude it), which keeps the Guardian
 * from satisfying its own liveness alarm — and also means it appears in no
 * standup count and no story. THIS CARD IS ITS ONLY CLINIC SURFACE. A report
 * that does not reach the reader is not a report.
 *
 * Three properties make it safe to render:
 *
 *  - It RESPECTS THE LOCK, on the way out as well as on the way in. The
 *    owner's control says "Keep it to me instead", and without this check
 *    that button would be a lie for a week: notes written while the lock was
 *    open would keep appearing on clinic Overviews after it closed. A switch
 *    that does not stop the thing it names is worse than no switch.
 *  - It EXPIRES on its own. Only notes inside the re-alert window count, so
 *    a problem the guardian stops writing about fades without anything
 *    having to remember to clear it. The window is RE_ALERT_DAYS on purpose:
 *    it is the same constant the alert cadence re-writes on, so a still-live
 *    problem gets a fresh note exactly as the old one ages out and the card
 *    never goes dark underneath it. (Verification round: a round-3 change
 *    that wrote the note only on a state CHANGE broke that pairing — the
 *    card vanished on day 8 while reminders were still off.)
 *  - It is RE-VERIFIED against live state, never trusted from the ledger.
 *    A switch flipped back on ten minutes after the nightly sweep would
 *    otherwise leave the machine insisting for days that it can't send —
 *    telling a practice something untrue about their own settings is worse
 *    than saying nothing at all. The stall note has no such live check by
 *    design: it describes a closed 30-day window, which cannot become false
 *    inside a week.
 */
/** Signal defaults for the live re-derive: only the switches matter to the
 *  blocked branch, and giving the rest healthy values keeps
 *  `clinicActionable`'s failure guard from vetoing a genuine switch note. */
const EMPTY_SIGNALS: EngineSignals = {
  ageDays: 9999,
  actions7: 1,
  actionsPrev7: 1,
  failures7: 0,
  remindersOn: true,
  reviewRequestsOn: true,
  seated30: 0,
  seatedPrev30: 0,
  openProposals: 0,
}

export interface ActiveGuardianNote {
  summary: string
  /** Which switches are off RIGHT NOW, so the card can link to the one that
   *  actually needs turning back on. Absent for non-switch notes. */
  remindersOn?: boolean
  reviewRequestsOn?: boolean
  /** What the note is about, so the surface can offer the right next step:
   *  a switch note points at the automation settings, a stall note points at
   *  where new patients come from. */
  state: EngineState
  occurredAt: Date
}

export async function getActiveGuardianNote(
  organizationId: string,
  now: Date = new Date(),
): Promise<ActiveGuardianNote | null> {
  try {
    // The lock governs the READ too, not only the write.
    if ((await getGuardianAudience()) !== 'clinic') return null
    const since = new Date(now.getTime() - RE_ALERT_DAYS * DAY_MS)
    const [row] = await db
      .select({
        summary: schema.actionLedger.summary,
        detail: schema.actionLedger.detail,
        occurredAt: schema.actionLedger.occurredAt,
      })
      .from(schema.actionLedger)
      .where(
        and(
          eq(schema.actionLedger.organizationId, organizationId),
          eq(schema.actionLedger.capability, 'guardian_note'),
          gte(schema.actionLedger.occurredAt, since),
        ),
      )
      .orderBy(desc(schema.actionLedger.occurredAt))
      .limit(1)
    if (!row) return null

    const state = (row.detail as { guardianState?: unknown } | null)?.guardianState
    // Only the two states the clinic-facing half ever writes. Anything else
    // is an entry this reader doesn't understand, and showing a warning it
    // can't characterize would be worse than staying quiet.
    if (state !== 'blocked' && state !== 'stalled') return null
    if (state === 'blocked') {
      const switches = await readEngineSwitches(organizationId)
      // Both back on — the note is spent, whatever the ledger still says.
      if (switches.remindersOn && switches.reviewRequestsOn) return null
      // RE-DERIVE, don't replay (round-1 audit). The stored sentence was
      // true when it was written; if the practice has since turned ONE of
      // the two back on, replaying it keeps insisting both are off — the
      // machine telling somebody something untrue about their own settings,
      // which is the exact failure the live check exists to prevent. The
      // note is regenerated from the switches as they stand right now.
      const live = clinicNote('blocked', {
        ...EMPTY_SIGNALS,
        remindersOn: switches.remindersOn,
        reviewRequestsOn: switches.reviewRequestsOn,
      })
      if (!live) return null
      return {
        summary: live,
        state,
        occurredAt: row.occurredAt,
        remindersOn: switches.remindersOn,
        reviewRequestsOn: switches.reviewRequestsOn,
      }
    }
    return { summary: row.summary, state, occurredAt: row.occurredAt }
  } catch {
    // A note the machine can't read is a note it doesn't show. Never a
    // half-rendered warning.
    return null
  }
}
