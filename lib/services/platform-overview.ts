import 'server-only'
import { and, eq, inArray, max, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { listClinics } from '@/lib/services/clinics'
import { readMergedActivation } from '@/lib/services/first-week'
import {
  STUCK_TRIAL_DAYS_LEFT,
  clinicIsStuck,
  clinicStanding,
  stuckReason,
  type ClinicStanding,
} from '@/lib/platform-clinic-status'

/**
 * The Overview's "Needs a hand" band — who is stuck, asked of ONE predicate
 * (`clinicIsStuck`, lib/platform-clinic-status.ts) over THE standing read.
 *
 * Windows are UTC-honest: "no sign-in in 7 days" is 7 x 24h before `now`,
 * not a clinic-local day. Read-time, best-effort: a failed sign-in read
 * returns an empty band flagged `unreadable` (never a confident all-clear),
 * and a failed activation read counts the clinic as activated (never accuse
 * on a read we could not make).
 */
export interface StuckClinic {
  orgId: string
  name: string
  standing: ClinicStanding
  reason: string
  lastSeenAt: Date | null
}

export interface NeedsAHand {
  rows: StuckClinic[]
  /** The sign-in read failed: the band cannot say "nobody is stuck". */
  unreadable: boolean
}

/** Newest non-patient session per clinic — one grouped read over the given orgs. */
async function lastSeenByOrg(orgIds: string[]): Promise<Map<string, Date>> {
  if (orgIds.length === 0) return new Map()
  const rows = await db
    .select({ orgId: schema.member.organizationId, at: max(schema.session.updatedAt) })
    .from(schema.session)
    .innerJoin(schema.member, eq(schema.member.userId, schema.session.userId))
    .where(and(inArray(schema.member.organizationId, orgIds), ne(schema.member.role, 'patient')))
    .groupBy(schema.member.organizationId)
  const out = new Map<string, Date>()
  for (const r of rows) if (r.at) out.set(r.orgId, new Date(r.at))
  return out
}

export async function getNeedsAHand(now: Date = new Date()): Promise<NeedsAHand> {
  const clinics = (await listClinics()).filter((c) => !c.isDemo)
  const standings = clinics.map((c) => ({ c, standing: clinicStanding(c) }))
  // Only the clinics the predicate can say anything about need a sign-in read.
  const candidates = standings.filter((s) => ['walled', 'past_due', 'trial'].includes(s.standing.kind))
  let seen = new Map<string, Date>()
  let unreadable = false
  try {
    seen = await lastSeenByOrg(candidates.map((s) => s.c.orgId))
  } catch (e) {
    console.error('[platform-overview] last sign-in read failed', e)
    unreadable = true
  }
  const rows: StuckClinic[] = []
  for (const { c, standing } of candidates) {
    const lastSeenAt = seen.get(c.orgId) ?? null
    // Activation is read only for the trials inside the window where it matters, one explicit org each.
    let activated = true
    if (standing.kind === 'trial' && standing.daysLeft != null && standing.daysLeft <= STUCK_TRIAL_DAYS_LEFT) {
      activated = await readMergedActivation(c.orgId)
        .then((a) => a.a1 != null)
        .catch(() => true)
    }
    const opts = { activated, createdAt: c.createdAt }
    if (unreadable && standing.kind === 'trial') continue // cannot judge "no sign-in" blind
    if (!clinicIsStuck(standing, lastSeenAt, now, opts)) continue
    rows.push({ orgId: c.orgId, name: c.displayName ?? c.name, standing, lastSeenAt, reason: stuckReason(standing, lastSeenAt, now, opts) ?? '' })
  }
  const rank = { past_due: 0, walled: 1, trial: 2, live: 3, churned: 4, invite_pending: 5 } as const
  rows.sort((a, b) => rank[a.standing.kind] - rank[b.standing.kind] || a.name.localeCompare(b.name))
  return { rows, unreadable }
}
