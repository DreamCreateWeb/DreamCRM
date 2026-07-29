import 'server-only'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  GRANTABLE_CAPABILITIES,
  GRANTED_AT_KEY,
  REVOKED_AT_KEY,
  getCapability,
  isGrantable,
  resolveGrantedAt,
  resolveRevokedAt,
  resolveTrust,
  type TrustLevel,
} from '@/lib/autonomy'
import { recordAction, listRecentActions } from '@/lib/services/action-ledger'

/**
 * THE AUTONOMY LADDER, LIVE (Transformation Phase 3 — DESIGN.md primitive
 * #3). Trust is granted by humans from an approval card ("always do this
 * for me"), stored per capability in clinic_profile.autonomy, reversible
 * always, and NARRATED: a grant or revoke is a real event in the clinic's
 * story, so it writes a ledger entry under the capability it changes —
 * the diary must be able to explain why the asking stopped.
 *
 * Laws:
 *  - Only the GRANTABLE (proposal-backed, ask-by-default) capabilities move
 *    through this service. The auto-by-default automations keep their own
 *    feature switches; the ladder never touches them.
 *  - Nothing ever grants itself autonomy — every write here carries the
 *    human's userId, and the machine's auto-execution path only READS.
 */

export interface TrustGrantView {
  capability: string
  label: string
  level: TrustLevel
  /** When this capability was handed over — the boundary of "from now on"
   *  (null for an older grant made before the stamp existed). */
  grantedAt: Date | null
  /** When the clinic last took it back — the floor on the earned-trust run,
   *  so the machine never re-cites approvals a revoke has overruled. */
  revokedAt: Date | null
}

/** The four grantable capabilities with their resolved levels — the
 *  Overview strip and the card checkboxes read this. */
export async function listTrustGrants(organizationId: string): Promise<TrustGrantView[]> {
  const [row] = await db
    .select({ autonomy: schema.clinicProfile.autonomy })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const stored = row?.autonomy ?? null
  return GRANTABLE_CAPABILITIES.map((key) => ({
    capability: key,
    label: getCapability(key)?.label ?? key,
    level: resolveTrust(stored, key),
    grantedAt: resolveGrantedAt(stored, key),
    revokedAt: resolveRevokedAt(stored, key),
  }))
}

export interface AutonomousWorkView {
  capability: string
  label: string
  count: number
  /** The most recent thing the machine did alone, in its own words. */
  latestSummary: string
  /** EVERY one of them, newest first — the consent line promises "I'll list
   *  each one", and a count plus one example is not a list (verification
   *  round 1). The strip renders these and says so when it has to clamp. */
  summaries: string[]
}

/**
 * WHAT I HANDLED ON MY OWN (round-1 Phase-3 audit, the depth ruling). "Do
 * and tell" is the rung this phase shipped, and the DO had no TELL: granted
 * capabilities are deliberately absent from every daily signal (they are
 * not waiting on a human), and the weekly standup narrates the PRIOR week
 * in aggregate without ever marking which work was the machine's own — so
 * a clinic that handed something over could go up to 13 days without seeing
 * a single thing it did. This is the read behind the Overview strip: the
 * last 7 days of ledger entries the executors stamped `autonomous: true`,
 * grouped per capability, carrying EVERY entry's summary (newest first) —
 * the consent line promises "I'll list each one", and a count plus one
 * example is not a list (verification round 1).
 *
 * Deliberately NOT a page: the North Star says the machine reports, it does
 * not hand over a console to operate. The strip names the work in place and
 * says so when it clamps.
 */
export async function listAutonomousWork(
  organizationId: string,
  opts: { since?: Date; now?: Date } = {},
): Promise<AutonomousWorkView[]> {
  const now = opts.now ?? new Date()
  const since = opts.since ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  // autonomousOnly filters in SQL. Without it the limit capped the newest
  // rows of EVERYTHING and the JS filter threw most away — on a clinic that
  // writes a row per reminder, a whole week of the machine's own work fell
  // off the end and this strip said "nothing on my own yet" (round-2 audit).
  const entries = await listRecentActions(organizationId, {
    since,
    until: now,
    limit: 200,
    autonomousOnly: true,
  })
  const byCapability = new Map<string, AutonomousWorkView>()
  // listRecentActions is newest-first, so the first entry per capability is
  // the newest one — the summary to quote.
  for (const e of entries) {
    const detail = (e.detail ?? {}) as Record<string, unknown>
    if (detail.autonomous !== true) continue
    const found = byCapability.get(e.capability)
    if (found) {
      found.count++
      found.summaries.push(e.summary)
    } else
      byCapability.set(e.capability, {
        capability: e.capability,
        label: getCapability(e.capability)?.label ?? e.capability,
        count: 1,
        latestSummary: e.summary,
        summaries: [e.summary],
      })
  }
  return Array.from(byCapability.values()).sort((a, b) => b.count - a.count)
}

export type SetTrustResult = { ok: true; level: TrustLevel } | { ok: false; error: string }

/**
 * Grant ("always do this for me") or revoke ("back to asking") a
 * capability's autonomy. Idempotent: re-setting the current level changes
 * nothing and writes no ledger entry (no event happened).
 */
export async function setCapabilityTrust(
  organizationId: string,
  capability: string,
  level: TrustLevel,
  userId: string,
): Promise<SetTrustResult> {
  if (!isGrantable(capability)) {
    return { ok: false, error: 'This isn’t something I hand over from a card.' }
  }
  if (level !== 'ask' && level !== 'auto') {
    return { ok: false, error: 'That trust level doesn’t exist.' }
  }

  const [row] = await db
    .select({ autonomy: schema.clinicProfile.autonomy })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!row) return { ok: false, error: 'I couldn’t find this clinic’s settings.' }

  const current = resolveTrust(row.autonomy, capability)
  if (current === level) return { ok: true, level } // nothing changed — no entry

  // MERGE IN SQL, never read-modify-write (round-2 audit): two staff on the
  // Overview at the same instant — one revoking, one granting something
  // else — both wrote the whole object, and the loser could be the REVOKE.
  // "Trust is reversible always" is the one write in this phase that must
  // never be silently lost. `||` is a shallow jsonb merge, so each patch
  // below replaces exactly the keys it names.
  //
  // A grant is DATED so it can mean "from now on"; taking it back clears the
  // stamp so a later re-grant starts its own clock. The nested map is merged
  // against the row's own current value inside the statement, so a sibling
  // capability's stamp can't be clobbered either.
  // EVERY bound parameter below carries an explicit ::text / ::jsonb cast.
  // Drizzle binds interpolated values as untyped parameters, and Postgres
  // cannot resolve an untyped one inside jsonb_build_object (VARIADIC "any")
  // or against the overloaded jsonb `-` operator: without the casts this
  // statement fails with 42P18 and NO clinic can grant or revoke anything
  // (round-3 audit — the round-2 fix's own regression, invisible to a test
  // suite that mocks `sql` away).
  const levelPatch = JSON.stringify({ [capability]: level })
  const col = schema.clinicProfile.autonomy
  const stamp = JSON.stringify({ [capability]: new Date().toISOString() })
  const grantedAt =
    level === 'auto'
      ? sql`coalesce(${col} -> ${GRANTED_AT_KEY}::text, '{}'::jsonb) || ${stamp}::jsonb`
      : sql`coalesce(${col} -> ${GRANTED_AT_KEY}::text, '{}'::jsonb) - ${capability}::text`
  // The mirror stamp: a revoke is dated so the earned-trust run can refuse
  // to cite decisions the clinic has since overruled; a fresh grant clears
  // it, because the clinic just said yes again.
  const revokedAt =
    level === 'ask'
      ? sql`coalesce(${col} -> ${REVOKED_AT_KEY}::text, '{}'::jsonb) || ${stamp}::jsonb`
      : sql`coalesce(${col} -> ${REVOKED_AT_KEY}::text, '{}'::jsonb) - ${capability}::text`
  await db
    .update(schema.clinicProfile)
    .set({
      autonomy: sql`coalesce(${col}, '{}'::jsonb) || ${levelPatch}::jsonb || jsonb_build_object(${GRANTED_AT_KEY}::text, ${grantedAt}) || jsonb_build_object(${REVOKED_AT_KEY}::text, ${revokedAt})`,
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))

  // The diary explains the change in the machine's own voice — this is how
  // the standup can later say WHY the asking stopped (or resumed).
  const label = getCapability(capability)?.label ?? capability
  await recordAction({
    organizationId,
    capability,
    summary:
      level === 'auto'
        ? `You switched “${label}” to automatic — I’ll handle these on my own and list them on your Overview`
        : `You switched “${label}” back to ask-first — I’ll check with you before each one`,
    detail: { autonomyChange: level, changedByUserId: userId },
  })
  return { ok: true, level }
}
