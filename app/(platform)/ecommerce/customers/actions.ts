'use server'

import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { organization } from '@/lib/db/schema/auth'

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

export async function invitePatientToPortal(patientId: string) {
  const reqHeaders = await headers()
  const session = await auth.api.getSession({ headers: reqHeaders })
  if (!session) throw new Error('Not authenticated')
  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) throw new Error('No active organization')

  const [patientRow] = await db
    .select()
    .from(patient)
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, orgId)))
    .limit(1)

  if (!patientRow) throw new Error('Patient not found')
  if (!patientRow.email) throw new Error('Patient has no email address — add one first.')
  if (patientRow.userId) throw new Error('This patient is already linked to a portal account.')

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) throw new Error('Organization not found')

  // 'patient' is our custom role; cast to satisfy Better Auth's union type.
  // The DB stores it as text so any string works at runtime.
  await auth.api.createInvitation({
    headers: reqHeaders,
    body: {
      email: patientRow.email,
      role: 'patient' as 'member',
      organizationId: orgId,
    },
  })
}
