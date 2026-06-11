'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import {
  listProviders,
  createProvider,
  updateProvider,
  deactivateProvider,
} from '@/lib/services/providers'
import { normalizeChairCount } from '@/lib/services/booking'
import { resolveVisitTypes, type VisitType } from '@/lib/types/visit-types'

/** owner/admin gate, clinic tenant only — mirrors updateClinicProfile. */
async function requirePracticeAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can edit practice settings')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can edit practice settings')
  }
  return ctx
}

type Result = { ok: true } | { ok: false; error: string }

// ----- Providers --------------------------------------------------------

export async function createProviderAction(input: {
  displayName: string
  role?: string
  email?: string | null
}): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  try {
    await createProvider({ organizationId: ctx.organizationId, ...input })
    revalidatePath('/settings/practice')
    revalidatePath('/appointments')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not add provider' }
  }
}

export async function updateProviderAction(input: {
  providerId: string
  displayName?: string
  role?: string
  email?: string | null
  isActive?: boolean
}): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  const { providerId, ...patch } = input
  try {
    await updateProvider({ organizationId: ctx.organizationId, providerId, patch })
    revalidatePath('/settings/practice')
    revalidatePath('/appointments')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update provider' }
  }
}

export async function deactivateProviderAction(providerId: string): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  try {
    await deactivateProvider(ctx.organizationId, providerId)
    revalidatePath('/settings/practice')
    revalidatePath('/appointments')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not deactivate provider' }
  }
}

// ----- Visit types ------------------------------------------------------

/**
 * Replace the clinic's visit-type catalog. The client sends the full edited
 * list; we sanitize through resolveVisitTypes (slugs ids, clamps durations,
 * guarantees an "Other" fallback) before persisting.
 */
export async function saveVisitTypesAction(visitTypes: VisitType[]): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  const cleaned = resolveVisitTypes(visitTypes)
  // Guard: never persist a list with no bookable channels at all — that would
  // silently break online booking. The "Other" fallback is always present so
  // this only fires when every entry has both flags off.
  if (!cleaned.some((t) => t.bookablePublic || t.bookablePortal)) {
    return { ok: false, error: 'At least one visit type must be bookable online (public or portal).' }
  }
  try {
    await db
      .update(clinicProfile)
      .set({ visitTypeSettings: cleaned, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
    revalidatePath('/settings/practice')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save visit types' }
  }
}

// ----- Chairs + recall default ------------------------------------------

export async function savePracticeOpsAction(input: {
  chairCount: number
  recallDefaultMonths: number
}): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  const chairCount = normalizeChairCount(input.chairCount)
  const months = Number(input.recallDefaultMonths)
  const recallDefaultMonths = Number.isFinite(months) ? Math.min(36, Math.max(1, Math.round(months))) : 6
  try {
    await db
      .update(clinicProfile)
      .set({ chairCount, recallDefaultMonths, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
    revalidatePath('/settings/practice')
    revalidatePath('/appointments')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save settings' }
  }
}

// ----- Loader -----------------------------------------------------------

export interface PracticeSettingsData {
  providers: Awaited<ReturnType<typeof listProviders>>
  visitTypes: VisitType[]
  chairCount: number
  recallDefaultMonths: number
}

export async function getPracticeSettings(): Promise<PracticeSettingsData> {
  const ctx = await requirePracticeAdmin()
  const [providers, [profile]] = await Promise.all([
    listProviders(ctx.organizationId),
    db
      .select({
        chairCount: clinicProfile.chairCount,
        recallDefaultMonths: clinicProfile.recallDefaultMonths,
        visitTypeSettings: clinicProfile.visitTypeSettings,
      })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1),
  ])
  return {
    providers,
    visitTypes: resolveVisitTypes(profile?.visitTypeSettings ?? null),
    chairCount: normalizeChairCount(profile?.chairCount),
    recallDefaultMonths: profile?.recallDefaultMonths ?? 6,
  }
}
