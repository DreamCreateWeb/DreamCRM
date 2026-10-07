import 'server-only'
import { cache } from 'react'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  ALL_ON,
  FEATURE_BY_KEY,
  FEATURE_SWITCHES,
  doorsOpenedBy,
  parseDoorsClosed,
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

/** The doors a person closed, read beside the switches. Never throws (an unreadable memory reads as none closed). */
async function readDoorsClosed(organizationId: string): Promise<Partial<Record<FeatureKey, string>>> {
  try {
    const [row] = await db
      .select({ doorsClosed: schema.clinicProfile.doorsClosed })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    return parseDoorsClosed(row?.doorsClosed)
  } catch (e) {
    console.error('[feature-switches] doors_closed read failed:', e)
    return {}
  }
}

/**
 * Open doors: every named column is set ONLY where it is still null, in one
 * statement (`coalesce`), so an open door's stamp never moves. A CLOSED door
 * is a null column too — so THE MACHINE's openers (the A1 kick, the daily
 * reconcile, the go-live lever) skip every key in `doors_closed`, the memory
 * a person's "Turn off" writes (audit round 2: round 1's "first occurrence
 * only" guards were defeated by the events repeating from a null state —
 * take the site offline and put it back, or stamp A1 from the daily pass).
 * A PERSON's open (`enableFeature`) passes `honorClosed: false` and clears
 * the memory. Returns the keys that were actually opened by this call.
 */
export async function openDoors(
  organizationId: string,
  keys: readonly FeatureKey[],
  now: Date = new Date(),
  opts: { honorClosed?: boolean } = {},
): Promise<FeatureKey[]> {
  if (keys.length === 0) return []
  const honorClosed = opts.honorClosed ?? true
  const [before, closed] = await Promise.all([
    readFeatureSwitchState(organizationId),
    honorClosed ? readDoorsClosed(organizationId) : Promise.resolve({} as Partial<Record<FeatureKey, string>>),
  ])
  const toOpen = keys.filter((k) => !before[k] && !(honorClosed && closed[k]))
  if (toOpen.length === 0) return []
  const iso = now.toISOString()
  const patch: Record<string, unknown> = {}
  for (const k of toOpen) {
    const col = schema.clinicProfile[FEATURE_BY_KEY[k].column]
    patch[FEATURE_BY_KEY[k].column] = sql`coalesce(${col}, ${iso}::timestamp)`
  }
  if (!honorClosed) {
    // A person opened it: the close is forgotten, so the machine may keep it
    // open. The keys go in as ONE Postgres array literal ('{a,b}'): a JS
    // array in a sql template renders as a parenthesised scalar list —
    // `($1, $2)::text[]` — which Postgres rejects as a malformed array
    // literal, and that single statement is also the one that opens the
    // door (audit round 3, critical: every person's "Turn on" failed).
    patch.doorsClosed = sql`coalesce(${schema.clinicProfile.doorsClosed}, '{}'::jsonb) - ${doorsClosedKeysLiteral(toOpen)}::text[]`
  }
  await db.update(schema.clinicProfile).set(patch).where(eq(schema.clinicProfile.organizationId, organizationId))
  return toOpen
}

/** The keys as a Postgres text[] literal — feature keys are closed identifiers (no quotes, commas or braces). */
export function doorsClosedKeysLiteral(keys: readonly FeatureKey[]): string {
  return `{${keys.join(',')}}`
}

/** A person turning a feature on from its intro. Idempotent; forgets an earlier close. */
export async function enableFeature(organizationId: string, key: FeatureKey, now: Date = new Date()): Promise<void> {
  await openDoors(organizationId, [key], now, { honorClosed: false })
}

/**
 * A person turning a feature off. Nothing is deleted; the door closes, and
 * the close is REMEMBERED in `doors_closed` so no activation event reopens
 * it (audit round 2).
 */
export async function disableFeature(organizationId: string, key: FeatureKey, now: Date = new Date()): Promise<void> {
  const column = FEATURE_BY_KEY[key].column
  await db
    .update(schema.clinicProfile)
    .set({
      [column]: null,
      doorsClosed: sql`coalesce(${schema.clinicProfile.doorsClosed}, '{}'::jsonb) || jsonb_build_object(${key}::text, to_jsonb(${now.toISOString()}::text))`,
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

/**
 * A1 — data connected: the doors that only make sense with patients behind
 * them open on their own. Safe to call on EVERY A1 occurrence (a kick, the
 * daily reconcile): a door a person closed stays closed. Never throws: the
 * kick that calls it is itself behind an import.
 */
export async function openDoorsAtA1(organizationId: string, now: Date = new Date()): Promise<FeatureKey[]> {
  try {
    return await openDoors(organizationId, doorsOpenedBy('a1'), now)
  } catch (e) {
    console.error('[feature-switches] A1 doors failed:', e)
    return []
  }
}

/** The site went live: the door that fills from the site opens (a person's close is honored). Never throws. */
export async function openDoorsAtSiteLive(organizationId: string, now: Date = new Date()): Promise<FeatureKey[]> {
  try {
    return await openDoors(organizationId, doorsOpenedBy('site_live'), now)
  } catch (e) {
    console.error('[feature-switches] site-live doors failed:', e)
    return []
  }
}
