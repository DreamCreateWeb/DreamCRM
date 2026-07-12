'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant, type TenantContext } from '@/lib/auth/context'
import {
  getLibraryEntryBySlug,
  submitNewLibraryEntry,
} from '@/lib/services/service-library'
import { customizeServiceForClinic } from '@/lib/services/service-library-ai'
import { mergeWebsiteDraft } from '@/lib/website-draft'
import { stageWebsiteValues } from '@/lib/services/website-draft'
import type {
  ClinicService,
  ClinicServiceCustomization,
  EditableServiceContent,
} from '@/lib/types/clinic-content'
import { sanitizeServiceContent } from '@/lib/types/clinic-content'
import { newId } from '@/lib/utils'

/**
 * Server actions for the Tend-clone services picker in /settings/clinic.
 * Each action: gates to a clinic owner/admin (and to the picker's source of
 * truth — `clinic_profile.services`), mutates the jsonb array, then
 * revalidates the settings page + the public clinic site so the customer-
 * facing copy refreshes on the next request.
 *
 * Every action returns a discriminated `{ ok: true; ... } | { ok: false; error }`
 * shape so the picker UI can render polite errors without try/catch noise.
 */

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }

async function loadOwnerCtxAndProfile(): Promise<
  | {
      ok: true
      ctx: TenantContext
      profile: typeof clinicProfile.$inferSelect
      services: ClinicService[]
    }
  | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, error: 'Only clinic tenants can edit services' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can edit services' }
  }
  const [liveProfile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  if (!liveProfile) {
    return { ok: false, error: 'Clinic profile not found' }
  }
  // The picker edits what the owner SEES — the draft-merged view. Basing the
  // mutation on the live column would silently drop services staged earlier.
  const profile = mergeWebsiteDraft(liveProfile, liveProfile.websiteDraft)
  const services = Array.isArray(profile.services)
    ? (profile.services as ClinicService[])
    : []
  return { ok: true, ctx, profile, services }
}

async function writeServices(ctx: TenantContext, services: ClinicService[]) {
  // Services are website content → they STAGE to the draft (Publish makes
  // them live), same routing as every Studio section save.
  await stageWebsiteValues(ctx.organizationId, { services })
  revalidatePath('/settings/clinic')
  revalidatePath('/website')
  revalidatePath('/website/content')
  // 'layout' cascades to the services index AND every /services/[serviceSlug]
  // detail page — editing/regenerating a service left those detail pages stale.
  revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
}

function buildClinicContextFromProfile(
  ctx: TenantContext,
  profile: typeof clinicProfile.$inferSelect,
) {
  return {
    name: profile.displayName ?? ctx.organizationName,
    city: profile.city ?? null,
    tagline: profile.tagline ?? null,
    about: profile.about ?? null,
    brandVoice: 'warm' as const,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add a service from the library — appends the picker entry AND runs the AI
// customization in the same action, so the clinic lands on a fully-rewritten
// service immediately.
// ─────────────────────────────────────────────────────────────────────────────

export async function addServiceFromLibrary(slug: string): Promise<ActionResult> {
  const trimmed = typeof slug === 'string' ? slug.trim() : ''
  if (!trimmed) return { ok: false, error: 'Service slug is required' }

  const loaded = await loadOwnerCtxAndProfile()
  if (!loaded.ok) return loaded
  const { ctx, profile, services } = loaded

  // No double-add of the same library entry.
  if (services.some((s) => s.librarySlug === trimmed)) {
    return { ok: false, error: 'Your site already offers this service' }
  }
  const entry = await getLibraryEntryBySlug(trimmed, ctx.organizationId)
  if (!entry) return { ok: false, error: 'Service is not available' }

  const newRow: ClinicService = {
    id: newId('svc'),
    librarySlug: entry.slug,
    name: entry.name,
    category: entry.category,
    icon: entry.icon ?? null,
  }
  // Try to customize right away; if AI is down, we still keep the row (the
  // 1A token-substitution path renders it fine). The "customizing…" UI is
  // best-effort, not a hard block.
  const clinic = buildClinicContextFromProfile(ctx, profile)
  const customize = await customizeServiceForClinic(entry, clinic)
  if (customize.ok) {
    newRow.customized = customize.customization
  }

  const next = [...services, newRow]
  await writeServices(ctx, next)
  return {
    ok: true,
    data: {
      serviceId: newRow.id,
      customized: customize.ok,
      customizeError: customize.ok ? undefined : customize.error,
    },
  }
}

export async function removeService(serviceId: string): Promise<ActionResult> {
  const loaded = await loadOwnerCtxAndProfile()
  if (!loaded.ok) return loaded
  const { ctx, services } = loaded

  const next = services.filter((s) => s.id !== serviceId)
  if (next.length === services.length) {
    return { ok: false, error: 'Service not found' }
  }
  await writeServices(ctx, next)
  return { ok: true }
}

export async function reorderService(
  serviceId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  if (direction !== 'up' && direction !== 'down') {
    return { ok: false, error: 'Invalid direction' }
  }
  const loaded = await loadOwnerCtxAndProfile()
  if (!loaded.ok) return loaded
  const { ctx, services } = loaded

  const idx = services.findIndex((s) => s.id === serviceId)
  if (idx < 0) return { ok: false, error: 'Service not found' }
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= services.length) {
    return { ok: false, error: 'Already at the edge' }
  }
  const next = [...services]
  ;[next[idx], next[swap]] = [next[swap], next[idx]]
  await writeServices(ctx, next)
  return { ok: true }
}

export async function updateServiceOverrides(
  serviceId: string,
  overrides: { photoUrl?: string | null; offer?: string | null },
): Promise<ActionResult> {
  const loaded = await loadOwnerCtxAndProfile()
  if (!loaded.ok) return loaded
  const { ctx, services } = loaded

  const idx = services.findIndex((s) => s.id === serviceId)
  if (idx < 0) return { ok: false, error: 'Service not found' }

  const photoUrl =
    typeof overrides.photoUrl === 'string' && overrides.photoUrl.trim()
      ? overrides.photoUrl.trim()
      : null
  const offer =
    typeof overrides.offer === 'string' && overrides.offer.trim()
      ? overrides.offer.trim()
      : null

  const next = services.map((s, i) => (i === idx ? { ...s, photoUrl, offer } : s))
  await writeServices(ctx, next)
  return { ok: true }
}

export async function regenerateCustomization(
  serviceId: string,
): Promise<ActionResult<{ generatedAt: string; customization: ClinicServiceCustomization }>> {
  const loaded = await loadOwnerCtxAndProfile()
  if (!loaded.ok) return loaded
  const { ctx, profile, services } = loaded

  const idx = services.findIndex((s) => s.id === serviceId)
  if (idx < 0) return { ok: false, error: 'Service not found' }
  const service = services[idx]
  if (!service.librarySlug) {
    return { ok: false, error: 'Only library-linked services can be customized' }
  }
  const entry = await getLibraryEntryBySlug(service.librarySlug, ctx.organizationId)
  if (!entry) return { ok: false, error: 'Library entry not found' }

  const clinic = buildClinicContextFromProfile(ctx, profile)
  const customize = await customizeServiceForClinic(entry, clinic)
  if (!customize.ok) return { ok: false, error: customize.error }

  const next = services.map((s, i) =>
    i === idx ? { ...s, customized: customize.customization } : s,
  )
  await writeServices(ctx, next)
  // Return the full customization so the editor can re-seed every section
  // field after a generate (the user keeps editing in place).
  return {
    ok: true,
    data: {
      generatedAt: customize.customization.generatedAt,
      customization: customize.customization,
    },
  }
}

/**
 * Persist hand-edited service content — the WHOLE detail page now, not just the
 * body: Highlights (hero bullets) · Description (body) · What to expect (process
 * steps) · Common questions (FAQ). The editor seeds from the AI draft (or the
 * library default) so a clinic always starts from real content; saving creates
 * or overwrites the per-clinic `customized` blob. `Regenerate with AI` remains
 * the deliberate "redraft everything" escape hatch.
 */
export async function updateServiceContent(
  serviceId: string,
  content: EditableServiceContent,
): Promise<ActionResult> {
  const loaded = await loadOwnerCtxAndProfile()
  if (!loaded.ok) return loaded
  const { ctx, services } = loaded

  const idx = services.findIndex((s) => s.id === serviceId)
  if (idx < 0) return { ok: false, error: 'Service not found' }
  const service = services[idx]
  if (!service.librarySlug) {
    return { ok: false, error: 'Only library-linked services have an editable detail page' }
  }

  const clean = sanitizeServiceContent(content)
  if (!clean.body) return { ok: false, error: 'The description can’t be empty' }

  // Hand-edit overwrites the prior blob (AI or manual). `modelId: 'manual'`
  // records that the latest copy was human-authored; a later Regenerate flips
  // it back to the model id.
  const updated: ClinicServiceCustomization = {
    ...clean,
    generatedAt: new Date().toISOString(),
    modelId: 'manual',
  }
  const next = services.map((s, i) => (i === idx ? { ...s, customized: updated } : s))
  await writeServices(ctx, next)
  return { ok: true }
}

/**
 * Submit a new service the library doesn't have. AI vet + clean → land in
 * `service_library` as `status='pending'`. On success the picker should
 * immediately auto-add the new entry to the clinic's services + customize it.
 */
export async function submitNewService(submission: {
  name: string
  description?: string
}): Promise<
  | { ok: true; kind: 'added'; serviceId: string; slug: string; customized: boolean }
  | { ok: true; kind: 'duplicate'; existingSlug: string; note?: string }
  | { ok: false; error: string }
> {
  const loaded = await loadOwnerCtxAndProfile()
  if (!loaded.ok) return loaded
  const { ctx, profile, services } = loaded

  const result = await submitNewLibraryEntry(ctx.organizationId, submission)
  if (!result.ok) return { ok: false, error: result.error }
  if (result.kind === 'duplicate') {
    return { ok: true, kind: 'duplicate', existingSlug: result.existingSlug, note: result.note }
  }

  // kind === 'created' — auto-add to this clinic's services + customize.
  const entry = result.entry
  const newRow: ClinicService = {
    id: newId('svc'),
    librarySlug: entry.slug,
    name: entry.name,
    category: entry.category,
    icon: entry.icon ?? null,
  }
  const clinic = buildClinicContextFromProfile(ctx, profile)
  const customize = await customizeServiceForClinic(entry, clinic)
  if (customize.ok) newRow.customized = customize.customization

  const next = [...services, newRow]
  await writeServices(ctx, next)
  return {
    ok: true,
    kind: 'added',
    serviceId: newRow.id,
    slug: entry.slug,
    customized: customize.ok,
  }
}
