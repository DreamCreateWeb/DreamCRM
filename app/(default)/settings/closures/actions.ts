'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import { addClosure, clinicDayKeyFor, removeClosure } from '@/lib/services/closures'
import { holidayPresets } from '@/lib/closures'

/** Closures change what patients can book and what the site says: owners and
 *  admins only (any staff member may VIEW). Clinic tenants only. */
async function requireClosureAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can edit closures')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new Error('Only owners and admins can edit closures')
  return ctx
}

type Result = { ok: true } | { ok: false; error: string }

function refresh(orgSlug: string | null | undefined) {
  revalidatePath('/settings/closures')
  revalidatePath('/appointments')
  // The public pages render the open-now line, the hours block and the JSON-LD
  // from the closures; the clinic's own site must not keep yesterday's answer.
  if (orgSlug) revalidatePath(`/site/${orgSlug}`, 'layout')
}

export async function addClosureAction(input: { startsOn: string; endsOn?: string | null; label: string }): Promise<Result> {
  const ctx = await requireClosureAdmin()
  const res = await addClosure(ctx.organizationId, input)
  if (!res.ok) return res
  refresh(ctx.organizationSlug)
  return { ok: true }
}

/** One tap on one or more presets. The server recomputes the preset list and
 *  takes only KEYS from the client — a tampered date never reaches the table. */
export async function addPresetClosuresAction(keys: string[]): Promise<Result> {
  const ctx = await requireClosureAdmin()
  const [profile] = await db
    .select({ timezone: clinicProfile.timezone })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const wanted = new Set(keys)
  const chosen = holidayPresets(clinicDayKeyFor(new Date(), profile?.timezone)).filter((p) => wanted.has(p.key))
  if (chosen.length === 0) return { ok: false, error: 'Those holidays are not on the list anymore — refresh the page.' }
  for (const p of chosen) {
    const res = await addClosure(ctx.organizationId, { startsOn: p.startsOn, endsOn: p.endsOn, label: p.label })
    if (!res.ok) return res
  }
  refresh(ctx.organizationSlug)
  return { ok: true }
}

export async function removeClosureAction(id: string): Promise<Result> {
  const ctx = await requireClosureAdmin()
  if (typeof id !== 'string' || !id) return { ok: false, error: 'Pick a closure to remove.' }
  const removed = await removeClosure(ctx.organizationId, id)
  if (!removed) return { ok: false, error: 'That closure was already removed.' }
  refresh(ctx.organizationSlug)
  return { ok: true }
}
