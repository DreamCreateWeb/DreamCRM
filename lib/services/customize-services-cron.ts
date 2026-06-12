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
        }
      } catch {
        result.errors += 1
      }
    }

    if (didForOrg > 0) {
      await db
        .update(clinicProfile)
        .set({ services: next, updatedAt: new Date() })
        .where(eq(clinicProfile.organizationId, row.organizationId))
      result.customized += didForOrg
      result.orgsTouched += 1
    }
  }

  return result
}
