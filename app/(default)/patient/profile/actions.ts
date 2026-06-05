'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { requireTenant } from '@/lib/auth/context'

export async function updateMyProfile(formData: FormData) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') throw new Error('Only patients can edit their profile here')
  if (!ctx.patientId) throw new Error('No patient record found for your account')

  const firstName = formData.get('firstName')?.toString().trim()
  const lastName = formData.get('lastName')?.toString().trim()
  if (!firstName || !lastName) throw new Error('Name is required')

  await db
    .update(patient)
    .set({
      firstName,
      lastName,
      email: formData.get('email')?.toString().trim() || null,
      phone: formData.get('phone')?.toString().trim() || null,
      dateOfBirth: formData.get('dateOfBirth')?.toString().trim() || null,
      addressLine1: formData.get('addressLine1')?.toString().trim() || null,
      city: formData.get('city')?.toString().trim() || null,
      state: formData.get('state')?.toString().trim() || null,
      postalCode: formData.get('postalCode')?.toString().trim() || null,
      insuranceProvider: formData.get('insuranceProvider')?.toString().trim() || null,
      insurancePolicyNumber: formData.get('insurancePolicyNumber')?.toString().trim() || null,
      insuranceGroupNumber: formData.get('insuranceGroupNumber')?.toString().trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(patient.id, ctx.patientId), eq(patient.organizationId, ctx.organizationId)))

  revalidatePath('/patient/profile')
  revalidatePath('/patient/dashboard')
}
