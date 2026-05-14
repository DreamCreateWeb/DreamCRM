'use server'

import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { clinicLocation } from '@/lib/db/schema/platform'

async function requireOrgId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Not authenticated')
  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) throw new Error('No active organization')
  return orgId
}

export async function addLocation(formData: FormData) {
  const orgId = await requireOrgId()
  const name = formData.get('name')?.toString().trim()
  if (!name) throw new Error('Name is required')

  const isPrimary = formData.get('isPrimary') === 'on' ? 1 : 0

  if (isPrimary) {
    await db.update(clinicLocation).set({ isPrimary: 0 }).where(eq(clinicLocation.organizationId, orgId))
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
}

export async function deleteLocation(locationId: string) {
  const orgId = await requireOrgId()
  await db.delete(clinicLocation).where(and(eq(clinicLocation.id, locationId), eq(clinicLocation.organizationId, orgId)))
  revalidatePath('/settings/locations')
}

export async function setPrimaryLocation(locationId: string) {
  const orgId = await requireOrgId()
  await db.update(clinicLocation).set({ isPrimary: 0 }).where(eq(clinicLocation.organizationId, orgId))
  await db
    .update(clinicLocation)
    .set({ isPrimary: 1 })
    .where(and(eq(clinicLocation.id, locationId), eq(clinicLocation.organizationId, orgId)))
  revalidatePath('/settings/locations')
}
