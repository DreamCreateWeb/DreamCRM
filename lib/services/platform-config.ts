import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveGuardianAudience, type GuardianAudience } from '@/lib/guardian'

/**
 * PLATFORM-GLOBAL CONFIG (Phase 4). One row, id 'default' — Dream Create's
 * own switches, none of which belong to a clinic.
 *
 * Today it holds one: the Guardian's audience lock. It ships 'platform'
 * (the owner hears everything, clinics hear nothing) and only a human can
 * widen it. Every read floors at 'platform', so a missing row, an
 * unreachable database, or a malformed value all resolve to the safe side —
 * the failure mode we refuse is the machine starting to talk to customers
 * because something was undefined.
 */

const CONFIG_ID = 'default'

/**
 * STRICT read — throws on a real failure.
 *
 * Round-7 audit: `readPlatformConfig` swallows every error and returns `{}`,
 * which is right for callers that must never lose a scheduler. But it made
 * the shared brain's "a failed config read aborts the pass" branch DEAD
 * CODE: getSharedBrain could not reject, so a transient DB error silently
 * substituted the shipped default as the learning incumbent and the pass
 * carried on and overwrote what was known. A caller that needs to tell
 * "we know it is 10" from "we could not find out" needs a read that can say
 * so.
 */
export async function readPlatformConfigStrict(): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ config: schema.platformConfig.config })
    .from(schema.platformConfig)
    .where(eq(schema.platformConfig.id, CONFIG_ID))
    .limit(1)
  return (row?.config ?? {}) as Record<string, unknown>
}

export async function readPlatformConfig(): Promise<Record<string, unknown>> {
  try {
    const [row] = await db
      .select({ config: schema.platformConfig.config })
      .from(schema.platformConfig)
      .where(eq(schema.platformConfig.id, CONFIG_ID))
      .limit(1)
    return (row?.config ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** The Guardian's audience, floored at 'platform' on every failure path. */
export async function getGuardianAudience(): Promise<GuardianAudience> {
  return resolveGuardianAudience(await readPlatformConfig())
}

/**
 * Merge a patch into the platform config. Merged in SQL against the row's
 * own current value so a concurrent write to another key cannot be lost —
 * the Phase-3 lesson about read-modify-write, applied on the way in rather
 * than after an audit finds it. Top-level keys REPLACE (jsonb `||` is a
 * shallow merge), so every writer owns its own key and passes it whole.
 */
export async function writePlatformConfig(patch: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(patch)
  await db
    .insert(schema.platformConfig)
    .values({ id: CONFIG_ID, config: sql`${json}::jsonb` })
    .onConflictDoUpdate({
      target: schema.platformConfig.id,
      set: {
        config: sql`coalesce(${schema.platformConfig.config}, '{}'::jsonb) || ${json}::jsonb`,
        updatedAt: new Date(),
      },
    })
}

/** Widen (or narrow) the Guardian's audience. */
export async function setGuardianAudience(audience: GuardianAudience): Promise<void> {
  await writePlatformConfig({ guardianAudience: audience })
}
