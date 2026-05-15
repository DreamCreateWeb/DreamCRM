'use server'

import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { eq } from 'drizzle-orm'
import { getTenantContext } from '@/lib/auth/context'

export async function updatePatientProfile(formData: FormData) {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'patient' || !ctx.patientId) {
    throw new Error('Not authorized')
  }

  const str = (key: string) => (formData.get(key) as string | null) || null

  await db
    .update(patient)
    .set({
      firstName: (formData.get('firstName') as string).trim(),
      lastName: (formData.get('lastName') as string).trim(),
      email: str('email'),
      phone: str('phone'),
      dateOfBirth: str('dateOfBirth'),
      addressLine1: str('addressLine1'),
      city: str('city'),
      state: str('state'),
      postalCode: str('postalCode'),
      insuranceProvider: str('insuranceProvider'),
      insurancePolicyNumber: str('insurancePolicyNumber'),
      insuranceGroupNumber: str('insuranceGroupNumber'),
      updatedAt: new Date(),
    })
    .where(eq(patient.id, ctx.patientId))
}
