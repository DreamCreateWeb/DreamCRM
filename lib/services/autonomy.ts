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
import { recordAction } from '@/lib/services/action-ledger'

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
        ? `You switched “${label}” to automatic — I’ll handle these on my own and report here`
        : `You switched “${label}” back to ask-first — I’ll check with you before each one`,
    detail: { autonomyChange: level, changedByUserId: userId },
  })
  return { ok: true, level }
}
