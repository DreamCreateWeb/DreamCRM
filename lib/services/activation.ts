import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { parseActivation, type Activation, type ActivationKey } from '@/lib/activation'

/**
 * Activation stamps (docs/ACTIVATION.md Part 3). ONE write per key per
 * clinic, ever: `stampActivation` sets `activation->key` only where it is
 * still missing, and the RETURNING row is the atomic answer to "did this
 * call stamp it" — which is exactly the question the day-one kick asks
 * ("is this the first time?"), with no read-then-write race between two
 * imports landing at once.
 */

/** The jsonb merge fragment — exported so the boundary test can render it through drizzle's own dialect. */
export function stampFragment(key: ActivationKey, at: Date) {
  return sql`coalesce(${schema.clinicProfile.activation}, '{}'::jsonb) || jsonb_build_object(${key}::text, to_jsonb(${at.toISOString()}::text))`
}

/** The write-once guard: the key is still unset. */
export function unstampedGuard(key: ActivationKey) {
  return sql`(${schema.clinicProfile.activation} is null or ${schema.clinicProfile.activation}->>${key}::text is null)`
}

/** True iff THIS call stamped the key (it was unset); false when already stamped or the org has no profile row. Never throws. */
export async function stampActivation(organizationId: string, key: ActivationKey, at: Date = new Date()): Promise<boolean> {
  try {
    const rows = await db
      .update(schema.clinicProfile)
      .set({ activation: stampFragment(key, at) })
      .where(and(eq(schema.clinicProfile.organizationId, organizationId), unstampedGuard(key)))
      .returning({ organizationId: schema.clinicProfile.organizationId })
    return rows.length > 0
  } catch (e) {
    console.error('[activation] stamp failed:', e)
    return false
  }
}

export async function getActivationStamps(organizationId: string): Promise<Activation> {
  try {
    const [row] = await db
      .select({ activation: schema.clinicProfile.activation })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    return parseActivation(row?.activation)
  } catch {
    return parseActivation(null)
  }
}
