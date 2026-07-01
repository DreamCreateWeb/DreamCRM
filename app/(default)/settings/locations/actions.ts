'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicLocation } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'

async function requireClinicAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can manage locations')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can manage locations')
  }
  return ctx
}

/** Pull the address/contact fields out of a submitted form (shared by add + update).
 *  Empty strings collapse to null so an unfilled field reads as absent, not "". */
function readLocationFields(formData: FormData) {
  return {
    addressLine1: formData.get('addressLine1')?.toString().trim() || null,
    addressLine2: formData.get('addressLine2')?.toString().trim() || null,
    city: formData.get('city')?.toString().trim() || null,
    state: formData.get('state')?.toString().trim() || null,
    postalCode: formData.get('postalCode')?.toString().trim() || null,
    phone: formData.get('phone')?.toString().trim() || null,
  }
}

function revalidateLocation(slug: string) {
  revalidatePath('/settings/locations')
  revalidatePath(`/site/${slug}`)
}

export async function addLocation(formData: FormData) {
  const ctx = await requireClinicAdmin()
  const orgId = ctx.organizationId
  const name = formData.get('name')?.toString().trim()
  if (!name) throw new Error('Name is required')

  const isPrimary = formData.get('isPrimary') === 'on' ? 1 : 0

  if (isPrimary) {
    await db
      .update(clinicLocation)
      .set({ isPrimary: 0 })
      .where(eq(clinicLocation.organizationId, orgId))
  }

  await db.insert(clinicLocation).values({
    id: randomUUID(),
    organizationId: orgId,
    name,
    ...readLocationFields(formData),
    isPrimary,
  })

  revalidateLocation(ctx.organizationSlug)
}

export async function updateLocation(locationId: string, formData: FormData) {
  const ctx = await requireClinicAdmin()
  const orgId = ctx.organizationId
  const name = formData.get('name')?.toString().trim()
  if (!name) throw new Error('Name is required')

  const makePrimary = formData.get('isPrimary') === 'on'

  // Promoting this row to primary demotes every OTHER row first, so the
  // "exactly one primary" invariant the public footer relies on is preserved.
  if (makePrimary) {
    await db
      .update(clinicLocation)
      .set({ isPrimary: 0 })
      .where(and(eq(clinicLocation.organizationId, orgId), ne(clinicLocation.id, locationId)))
  }

  await db
    .update(clinicLocation)
    .set({
      name,
      ...readLocationFields(formData),
      // Only ever SET primary here — clearing the flag happens by promoting
      // another location, never by editing this one (avoids a no-primary state).
      ...(makePrimary ? { isPrimary: 1 } : {}),
    })
    .where(and(eq(clinicLocation.id, locationId), eq(clinicLocation.organizationId, orgId)))

  revalidateLocation(ctx.organizationSlug)
}

export async function deleteLocation(locationId: string) {
  const ctx = await requireClinicAdmin()
  // The public site's address block prefers the flagged primary but falls back
  // to the oldest remaining location, then to the clinic profile — so removing
  // the primary never leaves the footer blank. (Switch primaries first with
  // "Make primary" if you want a specific survivor to take over.)
  await db
    .delete(clinicLocation)
    .where(
      and(eq(clinicLocation.id, locationId), eq(clinicLocation.organizationId, ctx.organizationId)),
    )
  revalidateLocation(ctx.organizationSlug)
}

export async function setPrimaryLocation(locationId: string) {
  const ctx = await requireClinicAdmin()
  const orgId = ctx.organizationId
  await db
    .update(clinicLocation)
    .set({ isPrimary: 0 })
    .where(eq(clinicLocation.organizationId, orgId))
  await db
    .update(clinicLocation)
    .set({ isPrimary: 1 })
    .where(and(eq(clinicLocation.id, locationId), eq(clinicLocation.organizationId, orgId)))
  revalidateLocation(ctx.organizationSlug)
}
