'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  approveLibraryEntry,
  rejectLibraryEntry,
} from '@/lib/services/service-library'

/**
 * Platform admin actions on the shared service library. Gated to
 * `tenantType === 'platform' && role in [owner, admin]`. Each action mutates
 * the library row, then revalidates both the review surface and every
 * surface that reads from `service_library` (clinic settings picker; public
 * site detail pages for the affected entry).
 */

async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    throw new Error('Forbidden: platform admin only')
  }
  return ctx
}

function revalidate() {
  revalidatePath('/platform/service-library')
  // Picker is rendered server-side in settings; revalidate so a newly
  // approved entry appears on the next clinic's load.
  revalidatePath('/settings/clinic')
}

export async function approveLibraryEntryAction(
  slug: string,
  reviewNote?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin()
  const result = await approveLibraryEntry(slug, reviewNote)
  if (result.ok) revalidate()
  return result
}

export async function rejectLibraryEntryAction(
  slug: string,
  reviewNote: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin()
  const result = await rejectLibraryEntry(slug, reviewNote)
  if (result.ok) revalidate()
  return result
}

/** Archive an active entry — handy for cleaning up a previously-approved
 *  entry that turned out to be wrong. Same underlying transition as reject. */
export async function archiveLibraryEntryAction(
  slug: string,
  reviewNote: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin()
  const result = await rejectLibraryEntry(slug, reviewNote)
  if (result.ok) revalidate()
  return result
}
