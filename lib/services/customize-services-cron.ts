import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { aiConfigured } from '@/lib/ai'
import {
  customizeServiceForClinic,
  type CustomizeClinicContext,
} from '@/lib/services/service-library-ai'
import { getServiceLibrary } from '@/lib/services/service-library'
import { recordAction } from '@/lib/services/action-ledger'
import type { ClinicService } from '@/lib/types/clinic-content'

/**
 * Durable net behind the Welcome Interview's fire-and-forget per-service
 * customization. The interview kicks off `customizeServiceForClinic` for the
 * chosen services WITHOUT awaiting (so the clinic isn't blocked); some of those
 * background calls can fail or get cut off. This cron sweeps every real clinic
 * (NOT demo orgs — they carry hand-written blobs) and fills any service that
 * has a `librarySlug` but no `customized` blob yet, up to a small per-org
 * budget per run so one big clinic can't starve the rest.
 *
 * Triggered hourly by EventBridge → POST /api/cron/customize-services with the
 * Bearer secret (same pattern as the other crons). Idempotent: a service with a
 * blob is skipped, so re-running is safe and converges.
 */

/** How many AI rewrites to do per org per run. A clinic with 8 services gets
 *  fully customized within ~2 runs; the cap keeps any single org from eating
 *  the whole budget. */
export const PER_ORG_CUSTOMIZE_BUDGET = 4

export interface CustomizeServicesResult {
  scanned: number
  customized: number
  orgsTouched: number
  errors: number
}

/**
 * Run the sweep. Pure-ish: all DB + AI access is through the injected modules,
 * so tests mock `@/lib/db` + the AI helpers. Returns batch health for the
 * cron's JSON response.
 */
export async function customizePendingServices(): Promise<CustomizeServicesResult> {
  const result: CustomizeServicesResult = { scanned: 0, customized: 0, orgsTouched: 0, errors: 0 }
  if (!aiConfigured()) return result

  // Real clinics only — exclude demo orgs (their services carry hand-written
  // DEMO_CUSTOMIZED blobs; never spend AI on them).
  const rows = await db
    .select({
      organizationId: clinicProfile.organizationId,
      displayName: clinicProfile.displayName,
      city: clinicProfile.city,
      tagline: clinicProfile.tagline,
      about: clinicProfile.about,
      services: clinicProfile.services,
    })
    .from(clinicProfile)
    .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
    .where(and(eq(organization.type, 'clinic'), eq(organization.isDemo, false)))

  // Load the canonical library once (token substitution happens inside
  // customizeServiceForClinic).
  const library = await getServiceLibrary()
  const bySlug = new Map(library.map((e) => [e.slug, e]))

  for (const row of rows) {
    const services = Array.isArray(row.services) ? (row.services as ClinicService[]) : []
    // Services that link to a library entry but have no customized blob yet.
    const pending = services.filter(
      (s) => s.librarySlug && bySlug.has(s.librarySlug) && !s.customized,
    )
    if (pending.length === 0) continue
    result.scanned += pending.length

    const clinicCtx: CustomizeClinicContext = {
      name: row.displayName ?? '',
      city: row.city,
      tagline: row.tagline,
      about: row.about,
    }

    let didForOrg = 0
    const written: string[] = []
    // Work on this org's own snapshot, then write once at the end so a single
    // run touches the row a single time (avoids N read-modify-writes).
    const next = [...services]
    for (const svc of pending) {
      if (didForOrg >= PER_ORG_CUSTOMIZE_BUDGET) break
      const entry = bySlug.get(svc.librarySlug!)!
      try {
        const res = await customizeServiceForClinic(entry, clinicCtx)
        if (!res.ok) {
          result.errors += 1
          continue
        }
        const idx = next.findIndex((s) => s.id === svc.id)
        if (idx >= 0) {
          next[idx] = { ...next[idx], customized: res.customization }
          didForOrg += 1
          written.push(next[idx].name || entry.name)
        }
      } catch {
        result.errors += 1
      }
    }

    if (didForOrg > 0) {
      // PER-ORG ISOLATION (DREAMCRM-57). The AI call above is wrapped, but the
      // write and the ledger entry below were not — and both can throw (a
      // connection blip, a ledger constraint). Unwrapped, one clinic's failed
      // write abandoned every clinic later in `rows` for the whole run, and
      // the next tick would reach the same clinic and stop in the same place.
      try {
        await writeCustomizedServices(row.organizationId, next, written)
        result.customized += didForOrg
        result.orgsTouched += 1
      } catch {
        result.errors += 1
      }
    }
  }

  return result
}

/**
 * Land this org's new `customized` blobs WITHOUT clobbering whatever the clinic
 * did to its own services while the AI was thinking (DREAMCRM-57).
 *
 * The sweep reads every clinic's `services` array ONCE at the top, then spends
 * up to PER_ORG_CUSTOMIZE_BUDGET AI calls per org — seconds to minutes of
 * wall-clock — before writing. Writing the snapshot back whole made the last
 * writer win over the whole column: a service the clinic added, renamed,
 * re-priced, reordered or DELETED in the Welcome Interview or Settings →
 * Services meanwhile was silently reverted to how it looked when the run
 * started. The clinic sees its own edit undone by a background job with no
 * error anywhere.
 *
 * So: re-read the row inside a transaction under `FOR UPDATE`, and copy across
 * ONLY the field this job owns — `customized`, keyed by service id, and only
 * onto services that (a) still exist and (b) still have no blob. Everything
 * else on the row is the clinic's, and stays theirs.
 */
async function writeCustomizedServices(
  organizationId: string,
  withBlobs: ClinicService[],
  written: string[],
): Promise<void> {
  const blobs = new Map(
    withBlobs.filter((s) => s.customized).map((s) => [s.id, s.customized]),
  )

  await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select({ services: clinicProfile.services })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, organizationId))
      .for('update')
      .limit(1)
    const current = Array.isArray(fresh?.services) ? (fresh.services as ClinicService[]) : []
    const merged = current.map((s) =>
      // Already has a blob → the clinic (or a concurrent run) got there first;
      // never overwrite one. Only fill a hole this run actually filled.
      !s.customized && blobs.has(s.id) ? { ...s, customized: blobs.get(s.id) } : s,
    )
    await tx
      .update(clinicProfile)
      .set({ services: merged, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, organizationId))
  })

  // The machine just wrote public website copy — that's employee work the
  // ledger must report (one entry per sweep, naming the pages).
  await recordAction({
    organizationId,
    capability: 'service_copywriting',
    summary:
      written.length === 1
        ? `Wrote the ${written[0]} page copy for your website`
        : `Wrote website copy for ${written.length} service pages (${written.join(', ')})`,
    detail: { services: written },
  })
}
