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
    // PER-ORG ISOLATION. Only the AI call used to be wrapped; the services
    // write and the ledger entry ran bare in this loop, so one clinic's
    // failing write threw out of the sweep and every clinic behind it was
    // skipped — silently, because the cron reported a 500 rather than a
    // failure count. One org's bad minute is one org's.
    try {
      await customizeOneOrg(row, bySlug, result)
    } catch (err) {
      result.errors += 1
      console.warn('[customize-services] org sweep failed', row.organizationId, err)
    }
  }

  return result
}

type LibraryEntry = Awaited<ReturnType<typeof getServiceLibrary>>[number]

/** One clinic's leg of the sweep. Extracted so the caller can wrap exactly one
 *  org's work — see the isolation note at the call site. */
async function customizeOneOrg(
  row: {
    organizationId: string
    displayName: string | null
    city: string | null
    tagline: string | null
    about: string | null
    services: unknown
  },
  bySlug: Map<string, LibraryEntry>,
  result: CustomizeServicesResult,
): Promise<void> {
  const services = Array.isArray(row.services) ? (row.services as ClinicService[]) : []
  // Services that link to a library entry but have no customized blob yet.
  const pending = services.filter(
    (s) => s.librarySlug && bySlug.has(s.librarySlug) && !s.customized,
  )
  if (pending.length === 0) return
  result.scanned += pending.length

  const clinicCtx: CustomizeClinicContext = {
    name: row.displayName ?? '',
    city: row.city,
    tagline: row.tagline,
    about: row.about,
  }

  // Collect this org's new blobs keyed by service id. Deliberately NOT a
  // patched copy of the snapshot: the snapshot was read at the top of the
  // sweep and is minutes stale by the time the AI calls return.
  const blobs = new Map<string, ClinicService['customized']>()
  const fallbackNames = new Map<string, string>()
  for (const svc of pending) {
    if (blobs.size >= PER_ORG_CUSTOMIZE_BUDGET) break
    const entry = bySlug.get(svc.librarySlug!)!
    try {
      const res = await customizeServiceForClinic(entry, clinicCtx)
      if (!res.ok) {
        result.errors += 1
        continue
      }
      blobs.set(svc.id, res.customization)
      fallbackNames.set(svc.id, svc.name || entry.name)
    } catch {
      result.errors += 1
    }
  }
  if (blobs.size === 0) return

  // NOT A READ-MODIFY-WRITE. Writing the sweep-time snapshot back reverted
  // whatever the clinic changed in Website Studio while the AI calls were in
  // flight — a new service, a rename, a deletion — from a cron they never saw.
  // Re-read the row under a row lock and merge the blobs onto the CURRENT
  // array instead: a service they deleted stays deleted, a service they edited
  // keeps their edit, and a blob that arrived meanwhile wins over ours.
  const written: string[] = []
  await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select({ services: clinicProfile.services })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, row.organizationId))
      .for('update')
      .limit(1)
    const current = Array.isArray(fresh?.services) ? (fresh.services as ClinicService[]) : []
    const merged = current.map((s) => {
      if (!blobs.has(s.id) || s.customized) return s
      written.push(s.name || fallbackNames.get(s.id) || 'a service')
      return { ...s, customized: blobs.get(s.id) }
    })
    if (written.length === 0) return
    await tx
      .update(clinicProfile)
      .set({ services: merged, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, row.organizationId))
  })
  if (written.length === 0) return

  result.customized += written.length
  result.orgsTouched += 1
  // The machine just wrote public website copy — that's employee work the
  // ledger must report (one entry per sweep, naming the pages that LANDED).
  await recordAction({
    organizationId: row.organizationId,
    capability: 'service_copywriting',
    summary:
      written.length === 1
        ? `Wrote the ${written[0]} page copy for your website`
        : `Wrote website copy for ${written.length} service pages (${written.join(', ')})`,
    detail: { services: written },
  })
}
