import 'server-only'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  assessEngine,
  needsAttention,
  ENGINE_STATE_RANK,
  summarizeSweep,
  RE_ALERT_DAYS,
  type EngineSignals,
  type EngineState,
  type EngineVerdict,
} from '@/lib/guardian'
import { readEngineSwitches } from '@/lib/services/engine-switches'
import { countSeatedBetween } from '@/lib/services/patient-journey'
import { countOpenProposals } from '@/lib/services/proposals'

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
}

export interface GuardianSweep {
  /** Worst first; the owner reads top-down and stops when it stops mattering. */
  reports: ClinicEngineReport[]
  /** Only the ones that need a human. */
  flagged: ClinicEngineReport[]
  /** The one line above the names. */
  summary: string
}

/** The WORK aggregate — the isWorkEntry law expressed as a FILTER. Exported
 *  so the boundary test renders THESE expressions through the real dialect
 *  rather than a copy that can drift (the Phase-3 standing lesson: a
 *  database modelled in JavaScript is not a database). */
export const workCountExpr = () => sql<number>`count(*) filter (
  where (${schema.actionLedger.detail} ->> 'autonomyChange') is null
    and (${schema.actionLedger.detail} ->> 'autoFailure') is distinct from 'true'
    and (${schema.actionLedger.detail} ->> 'failure') is distinct from 'true'
)::int`

/** Its complement: every "I tried and couldn't", of either shape. */
export const failureCountExpr = () => sql<number>`count(*) filter (
  where (${schema.actionLedger.detail} ->> 'failure') = 'true'
     or (${schema.actionLedger.detail} ->> 'autoFailure') = 'true'
)::int`

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

/** Assess one clinic. Exported for the per-clinic drill-in and the tests. */
export async function assessClinic(
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
    countSeatedBetween(org.id, windows.monthStart, windows.now).catch(() => 0),
    countSeatedBetween(org.id, windows.prevMonthStart, windows.monthStart).catch(() => 0),
    countOpenProposals(org.id).catch(() => 0),
  ])
  const here = ledger.this7.get(org.id) ?? { work: 0, failures: 0 }
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
    seated30,
    seatedPrev30,
    openProposals,
  }
  return { organizationId: org.id, clinicName: org.name, verdict: assessEngine(signals), signals }
}

/**
 * Every live clinic's engine health, worst first. The platform Overview's
 * Guardian section and the daily guardian cron both read this.
 */
export async function sweepEngineHealth(now: Date = new Date()): Promise<GuardianSweep> {
  const weekStart = new Date(now.getTime() - 7 * DAY_MS)
  const prevWeekStart = new Date(now.getTime() - 14 * DAY_MS)
  const monthStart = new Date(now.getTime() - 30 * DAY_MS)
  const prevMonthStart = new Date(now.getTime() - 60 * DAY_MS)

  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      createdAt: schema.organization.createdAt,
    })
    .from(schema.organization)
    .where(and(eq(schema.organization.type, 'clinic'), eq(schema.organization.isDemo, false)))

  if (orgs.length === 0) return { reports: [], flagged: [], summary: summarizeSweep([]) }

  const [this7, prev7] = await Promise.all([
    ledgerCountsByOrg(weekStart, now).catch(() => new Map()),
    ledgerCountsByOrg(prevWeekStart, weekStart).catch(() => new Map()),
  ])

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
 * Without this reader the clinic-facing half would be a write nobody reads:
 * a guardian_note lands in the ledger, and the ledger's only clinic surfaces
 * are the weekly standup's COUNT chips ("1 heads up") and the autonomous
 * strip — neither of which shows the sentence. A report that does not reach
 * the reader is not a report.
 *
 * Two properties make it safe to render:
 *
 *  - It EXPIRES on its own. Only notes inside the re-alert window count, so
 *    a problem the guardian stops writing about fades without anything
 *    having to remember to clear it.
 *  - It is RE-VERIFIED against live state, never trusted from the ledger.
 *    A switch flipped back on ten minutes after the nightly sweep would
 *    otherwise leave the machine insisting for days that it can't send —
 *    telling a practice something untrue about their own settings is worse
 *    than saying nothing at all. The stall note has no such live check by
 *    design: it describes a closed 30-day window, which cannot become false
 *    inside a week.
 */
export interface ActiveGuardianNote {
  summary: string
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
    }
    return { summary: row.summary, state, occurredAt: row.occurredAt }
  } catch {
    // A note the machine can't read is a note it doesn't show. Never a
    // half-rendered warning.
    return null
  }
}
