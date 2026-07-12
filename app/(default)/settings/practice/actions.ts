'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import { publishRealtime } from '@/lib/services/realtime'
import {
  listProviders,
  createProvider,
  updateProvider,
  deactivateProvider,
} from '@/lib/services/providers'
import { normalizeChairCount } from '@/lib/services/booking'
import { canTakeBookingDeposits } from '@/lib/services/booking-deposits'
import { resolveVisitTypes, type VisitType } from '@/lib/types/visit-types'

/** owner/admin gate, clinic tenant only — mirrors updateClinicProfile.
 *  Every MUTATION goes through this. */
async function requirePracticeAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can edit practice settings')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can edit practice settings')
  }
  return ctx
}

/** VIEW gate — any staff member of the clinic may VIEW practice settings (it's
 *  a clinic-wide surface); only owners/admins can change them (above). */
async function requirePracticeView() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can view practice settings')
  return ctx
}

type Result = { ok: true } | { ok: false; error: string }

// ----- Providers --------------------------------------------------------

/** Loose email sanity check — mirrors the browser's type="email" (a single @,
 *  non-empty local + domain, a dot in the domain). We only VALIDATE when a value
 *  is present; email stays optional on a provider. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function validateEmail(email: string | null | undefined): string | null {
  const e = (email ?? '').trim()
  if (!e) return null // empty is allowed (optional field)
  return EMAIL_RE.test(e) ? null : 'Enter a valid email address (or leave it blank).'
}

/** True when `name` collides (case-insensitively) with an existing ACTIVE
 *  provider other than `exceptId`. Deactivated providers don't count — you can
 *  re-add a name that only exists on an inactive/departed row. */
async function nameCollides(organizationId: string, name: string, exceptId?: string): Promise<boolean> {
  const key = name.trim().toLowerCase()
  if (!key) return false
  const existing = await listProviders(organizationId)
  return existing.some(
    (p) => p.isActive && p.id !== exceptId && p.displayName.trim().toLowerCase() === key,
  )
}

export async function createProviderAction(input: {
  displayName: string
  role?: string
  email?: string | null
}): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  const displayName = (input.displayName ?? '').trim()
  if (!displayName) return { ok: false, error: 'Enter a provider name.' }
  const emailError = validateEmail(input.email)
  if (emailError) return { ok: false, error: emailError }
  try {
    if (await nameCollides(ctx.organizationId, displayName)) {
      return { ok: false, error: `A provider named “${displayName}” already exists.` }
    }
    await createProvider({ organizationId: ctx.organizationId, displayName, role: input.role, email: input.email })
    revalidatePath('/settings/practice')
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
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
  if (patch.displayName !== undefined && !patch.displayName.trim()) {
    return { ok: false, error: 'Enter a provider name.' }
  }
  if (patch.email !== undefined) {
    const emailError = validateEmail(patch.email)
    if (emailError) return { ok: false, error: emailError }
  }
  try {
    if (patch.displayName !== undefined && (await nameCollides(ctx.organizationId, patch.displayName, providerId))) {
      return { ok: false, error: `A provider named “${patch.displayName.trim()}” already exists.` }
    }
    await updateProvider({ organizationId: ctx.organizationId, providerId, patch })
    revalidatePath('/settings/practice')
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
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
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
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
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save visit types' }
  }
}

// ----- Chairs + recall default ------------------------------------------

/**
 * Toggle public-website online self-scheduling. When off, the clinic's
 * "Book a Visit" button shows a request-only form (lands as an inbox message)
 * instead of the live slot picker. Revalidates the practice settings page; the
 * public /book page is server-rendered fresh on each request so it picks up the
 * change immediately.
 */
export async function saveSelfBookingAction(enabled: boolean): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  try {
    await db
      .update(clinicProfile)
      .set({ selfBookingEnabled: Boolean(enabled), updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
    revalidatePath('/settings/practice')
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save booking setting' }
  }
}

/** Toggle the public-site "Message us" chat bubble. Default ON; a visitor's
 *  message lands as an inbound thread in /messages (reply goes out by email). */
export async function saveChatWidgetAction(enabled: boolean): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  try {
    await db
      .update(clinicProfile)
      .set({ chatWidgetEnabled: Boolean(enabled), updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
    revalidatePath('/settings/practice')
    revalidatePath('/website/forms')
    // The bubble renders on every public page — repaint the whole site subtree.
    revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save chat setting' }
  }
}

export async function savePracticeOpsAction(input: {
  chairCount: number
  recallDefaultMonths: number
  lapsedAfterMonths: number
}): Promise<Result> {
  const ctx = await requirePracticeAdmin()
  const chairCount = normalizeChairCount(input.chairCount)
  const months = Number(input.recallDefaultMonths)
  const recallDefaultMonths = Number.isFinite(months) ? Math.min(36, Math.max(1, Math.round(months))) : 6
  const lapsedMonths = Number(input.lapsedAfterMonths)
  const lapsedAfterMonths = Number.isFinite(lapsedMonths) ? Math.min(60, Math.max(6, Math.round(lapsedMonths))) : 18
  try {
    await db
      .update(clinicProfile)
      .set({ chairCount, recallDefaultMonths, lapsedAfterMonths, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
    revalidatePath('/settings/practice')
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
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
  /** Months without a visit before a patient is flagged lapsed (💤). */
  lapsedAfterMonths: number
  /** Public-website online self-scheduling (the live slot picker on /book). */
  selfBookingEnabled: boolean
  /** Whether the current user can change these (owner/admin). Members can view. */
  canEdit: boolean
  /** Clinic's Stripe Connect can charge — deposits only collect when true. */
  depositsAvailable: boolean
  /** The public-site "Message us" chat bubble (default ON). */
  chatWidgetEnabled: boolean
}

export async function getPracticeSettings(): Promise<PracticeSettingsData> {
  const ctx = await requirePracticeView()
  const [providers, [profile], depositsAvailable] = await Promise.all([
    listProviders(ctx.organizationId),
    db
      .select({
        chairCount: clinicProfile.chairCount,
        recallDefaultMonths: clinicProfile.recallDefaultMonths,
        lapsedAfterMonths: clinicProfile.lapsedAfterMonths,
        visitTypeSettings: clinicProfile.visitTypeSettings,
        selfBookingEnabled: clinicProfile.selfBookingEnabled,
        chatWidgetEnabled: clinicProfile.chatWidgetEnabled,
      })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1),
    canTakeBookingDeposits(ctx.organizationId),
  ])
  return {
    providers,
    visitTypes: resolveVisitTypes(profile?.visitTypeSettings ?? null),
    chairCount: normalizeChairCount(profile?.chairCount),
    recallDefaultMonths: profile?.recallDefaultMonths ?? 6,
    lapsedAfterMonths: profile?.lapsedAfterMonths ?? 18,
    // null/undefined → enabled, matching the not-null default(true) column.
    selfBookingEnabled: profile?.selfBookingEnabled !== false,
    canEdit: ctx.role === 'owner' || ctx.role === 'admin',
    depositsAvailable,
    chatWidgetEnabled: profile?.chatWidgetEnabled !== false,
  }
}
