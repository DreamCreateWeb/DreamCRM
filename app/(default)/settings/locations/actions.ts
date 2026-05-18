'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
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
    addressLine1: formData.get('addressLine1')?.toString().trim() || null,
    addressLine2: formData.get('addressLine2')?.toString().trim() || null,
    city: formData.get('city')?.toString().trim() || null,
    state: formData.get('state')?.toString().trim() || null,
    postalCode: formData.get('postalCode')?.toString().trim() || null,
    phone: formData.get('phone')?.toString().trim() || null,
    isPrimary,
  })

  revalidatePath('/settings/locations')
  revalidatePath(`/site/${ctx.organizationSlug}`)
}

export async function deleteLocation(locationId: string) {
  const ctx = await requireClinicAdmin()
  await db
    .delete(clinicLocation)
    .where(
      and(eq(clinicLocation.id, locationId), eq(clinicLocation.organizationId, ctx.organizationId)),
    )
  revalidatePath('/settings/locations')
  revalidatePath(`/site/${ctx.organizationSlug}`)
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
  revalidatePath('/settings/locations')
  revalidatePath(`/site/${ctx.organizationSlug}`)
}
