'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  syncGoogleBusinessProfile,
  revertFieldToManual,
  importGooglePhotos,
} from '@/lib/services/gbp-sync'
import type { GbpSyncResult, SyncableField } from '@/lib/types/zernio'

/**
 * Server actions behind the Settings → hours/location "Sync from Google" UI.
 * All three gate to a clinic tenant + owner/admin — on ANY plan. Google Business
 * is free + separate on every tier (Basic included; see
 * lib/types/social-entitlements.ts), so there is NO plan gate. They return the
 * established `{ ok | error }`-shaped results so the client can surface inline
 * feedback.
 */

type Gate =
  | { ok: true; ctx: Awaited<ReturnType<typeof requireTenant>> }
  | { ok: false; error: string }

async function gate(): Promise<Gate> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, error: 'Google Business sync is only available for clinic tenants.' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can sync from Google.' }
  }
  // NO plan gate — Google Business is free on every tier (Basic included).
  return { ok: true, ctx }
}

/** Revalidate every surface that reads the synced fields. */
function revalidateSynced(slug: string) {
  revalidatePath('/settings/clinic')
  revalidatePath('/website')
  revalidatePath('/website/editor')
  revalidatePath(`/site/${slug}`, 'layout')
}

/**
 * Explicit "Sync from Google" — pull the clinic's verified GBP hours/address/
 * phone/photos and apply them (force: MAY overwrite manual fields + flips their
 * source to 'google'). Returns what changed (applied) vs what would have been
 * skipped (always empty under force, but kept for shape parity).
 */
export async function syncFromGoogleAction(): Promise<GbpSyncResult> {
  const g = await gate()
  if (!g.ok) {
    return { ok: false, applied: [], skippedManual: [], photoCount: 0, error: g.error }
  }
  const r = await syncGoogleBusinessProfile(g.ctx.organizationId, { force: true })
  if (r.ok) revalidateSynced(g.ctx.organizationSlug)
  return r
}

/**
 * "Use Google's version" for a SINGLE field — a force sync still re-applies all
 * Google fields, so this is just the explicit sync surfaced per-field; the UI
 * calls it from a field's "use Google's version" control. (Applying one field
 * in isolation would need Google to still match the others, so we keep it
 * simple: re-sync everything from Google, force.)
 */
export async function useGoogleVersionAction(): Promise<GbpSyncResult> {
  return syncFromGoogleAction()
}

/**
 * "Keep my version" / "stop letting Google overwrite this" — flip a field's
 * source back to 'manual' WITHOUT changing its value, so future automatic syncs
 * leave it alone.
 */
export async function revertFieldToManualAction(
  field: SyncableField,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  const r = await revertFieldToManual(g.ctx.organizationId, field)
  if (r.ok) revalidateSynced(g.ctx.organizationSlug)
  return r
}

/**
 * Import selected Google photos into the curated `officePhotos` gallery
 * (append-only; only URLs actually present in google_photos are accepted).
 */
export async function importGooglePhotosAction(
  urls: string[],
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  const r = await importGooglePhotos(g.ctx.organizationId, urls)
  if (r.ok) revalidateSynced(g.ctx.organizationSlug)
  return r
}
