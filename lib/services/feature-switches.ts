import 'server-only'
import { cache } from 'react'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  ALL_ON,
  FEATURE_BY_KEY,
  FEATURE_SWITCHES,
  doorsOpenedBy,
  type FeatureKey,
  type FeatureSwitchState,
} from '@/lib/feature-switches'

/**
 * The feature switches' server half (docs/ACTIVATION.md law 1, S3). One
 * read for the sidebar and every gate, one idempotent writer per
 * direction, and the two "the machine opens a door" entry points the
 * activation events call.
 *
 * A switch is a SETTING, like the insurance switch and the email-automation
 * toggles: it is not work and not a report, so nothing here narrates in the
 * Action Ledger (the marker law keeps `report` to the Guardian).
 *
 * FAIL-OPEN on the read: this runs on every authenticated page load, and a
 * transient read failure must not blank half the sidebar on a clinic that
 * turned those pages on. "Everything on" is the world before the switches
 * existed; the next load self-heals. (The bundle derive next door fails
 * CLOSED — hiding a derived link is the safe default there; hiding a page
 * a person chose is not.)
 */

async function readFeatureSwitchState(organizationId: string): Promise<FeatureSwitchState> {
  const [row] = await db
    .select({
      myDayEnabledAt: schema.clinicProfile.myDayEnabledAt,
      followupsEnabledAt: schema.clinicProfile.followupsEnabledAt,
      leadsEnabledAt: schema.clinicProfile.leadsEnabledAt,
      intakeFormsEnabledAt: schema.clinicProfile.intakeFormsEnabledAt,
      growthEnabledAt: schema.clinicProfile.growthEnabledAt,
      paymentsEnabledAt: schema.clinicProfile.paymentsEnabledAt,
      shopEnabledAt: schema.clinicProfile.shopEnabledAt,
      insuranceEnabledAt: schema.clinicProfile.insuranceEnabledAt,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  // No profile row yet (a clinic mid-creation) reads as every door closed —
  // the honest state for a practice that has chosen nothing.
  return Object.fromEntries(FEATURE_SWITCHES.map((f) => [f.key, Boolean(row?.[f.column])])) as FeatureSwitchState
}

/**
 * Per-request memoised (React `cache`): the shell reads it for the sidebar
 * and each gated layout reads it again for its door — one query, not two.
 */
export const getFeatureSwitchState = cache(async (organizationId: string): Promise<FeatureSwitchState> => {
  try {
    return await readFeatureSwitchState(organizationId)
  } catch (e) {
    console.error('[feature-switches] read failed, failing open:', e)
    return ALL_ON
  }
})

/**
 * Open doors: every named column is set ONLY where it is still null, in one
 * statement (`coalesce`), so an open door's stamp never moves. A CLOSED door
 * is a null column too, so this WILL reopen one — which is why the callers
 * that act on an activation event (the A1 kick, the go-live lever) call it
 * on the FIRST occurrence of that event only (audit round 1): a door a
 * clinic closed on purpose is never reopened by a repeat of the same event.
 * Returns the keys that were actually opened by this call.
 */
export async function openDoors(organizationId: string, keys: readonly FeatureKey[], now: Date = new Date()): Promise<FeatureKey[]> {
  if (keys.length === 0) return []
  const before = await readFeatureSwitchState(organizationId)
  const toOpen = keys.filter((k) => !before[k])
  if (toOpen.length === 0) return []
  const iso = now.toISOString()
  const patch: Record<string, unknown> = {}
  for (const k of toOpen) {
    const col = schema.clinicProfile[FEATURE_BY_KEY[k].column]
    patch[FEATURE_BY_KEY[k].column] = sql`coalesce(${col}, ${iso}::timestamp)`
  }
  await db.update(schema.clinicProfile).set(patch).where(eq(schema.clinicProfile.organizationId, organizationId))
  return toOpen
}

/** A person turning a feature on from its intro. Idempotent. */
export async function enableFeature(organizationId: string, key: FeatureKey, now: Date = new Date()): Promise<void> {
  await openDoors(organizationId, [key], now)
}

/** A person turning a feature off. Nothing is deleted; the door closes. */
export async function disableFeature(organizationId: string, key: FeatureKey): Promise<void> {
  const column = FEATURE_BY_KEY[key].column
  await db
    .update(schema.clinicProfile)
    .set({ [column]: null })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

/**
 * A1 — data connected (the day-one kick's first stamp): the doors that
 * only make sense with patients behind them open on their own. Never
 * throws: the kick that calls it is itself behind an import.
 */
export async function openDoorsAtA1(organizationId: string, now: Date = new Date()): Promise<FeatureKey[]> {
  try {
    return await openDoors(organizationId, doorsOpenedBy('a1'), now)
  } catch (e) {
    console.error('[feature-switches] A1 doors failed:', e)
    return []
  }
}

/** The site went live: the door that fills from the site opens. Never throws. */
export async function openDoorsAtSiteLive(organizationId: string, now: Date = new Date()): Promise<FeatureKey[]> {
  try {
    return await openDoors(organizationId, doorsOpenedBy('site_live'), now)
  } catch (e) {
    console.error('[feature-switches] site-live doors failed:', e)
    return []
  }
}
