'use server'

import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'

async function requireOrgId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Not authenticated')
  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) throw new Error('No active organization')
  return orgId
}

export async function addPatient(formData: FormData) {
  const orgId = await requireOrgId()
  const firstName = formData.get('firstName')?.toString().trim()
  const lastName = formData.get('lastName')?.toString().trim()
  if (!firstName || !lastName) throw new Error('First and last name are required')

  await db.insert(patient).values({
    id: randomUUID(),
    organizationId: orgId,
    firstName,
    lastName,
    dateOfBirth: formData.get('dateOfBirth')?.toString().trim() || null,
    email: formData.get('email')?.toString().trim() || null,
    phone: formData.get('phone')?.toString().trim() || null,
    addressLine1: formData.get('addressLine1')?.toString().trim() || null,
    city: formData.get('city')?.toString().trim() || null,
    state: formData.get('state')?.toString().trim() || null,
    postalCode: formData.get('postalCode')?.toString().trim() || null,
    insuranceProvider: formData.get('insuranceProvider')?.toString().trim() || null,
    insurancePolicyNumber: formData.get('insurancePolicyNumber')?.toString().trim() || null,
    notes: formData.get('notes')?.toString().trim() || null,
  })

  revalidatePath('/ecommerce/customers')
}

export async function deactivatePatient(patientId: string) {
  const orgId = await requireOrgId()
  await db
    .update(patient)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, orgId)))
  revalidatePath('/ecommerce/customers')
}

export async function reactivatePatient(patientId: string) {
  const orgId = await requireOrgId()
  await db
    .update(patient)
    .set({ isActive: 1, updatedAt: new Date() })
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, orgId)))
  revalidatePath('/ecommerce/customers')
}
