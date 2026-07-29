import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  GRANTABLE_CAPABILITIES,
  getCapability,
  isGrantable,
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
  }))
}

export interface AutonomousWorkView {
  capability: string
  label: string
  count: number
  /** The most recent thing the machine did alone, in its own words. */
  latestSummary: string
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
 * per capability, with the newest line quoted verbatim.
 *
 * Deliberately NOT a page: the North Star says the machine reports, it does
 * not hand over a console to operate. Counts and one sentence, in place.
 */
export async function listAutonomousWork(
  organizationId: string,
  opts: { since?: Date; now?: Date } = {},
): Promise<AutonomousWorkView[]> {
  const now = opts.now ?? new Date()
  const since = opts.since ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const entries = await listRecentActions(organizationId, { since, until: now, limit: 100 })
  const byCapability = new Map<string, AutonomousWorkView>()
  // listRecentActions is newest-first, so the first entry per capability is
  // the newest one — the summary to quote.
  for (const e of entries) {
    const detail = (e.detail ?? {}) as Record<string, unknown>
    if (detail.autonomous !== true) continue
    const found = byCapability.get(e.capability)
    if (found) found.count++
    else
      byCapability.set(e.capability, {
        capability: e.capability,
        label: getCapability(e.capability)?.label ?? e.capability,
        count: 1,
        latestSummary: e.summary,
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

  const stored =
    row.autonomy && typeof row.autonomy === 'object' ? (row.autonomy as Record<string, unknown>) : {}
  await db
    .update(schema.clinicProfile)
    .set({ autonomy: { ...stored, [capability]: level } })
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
