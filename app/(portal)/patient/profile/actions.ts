'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { requireTenant } from '@/lib/auth/context'
import { upsertPatientInsurance } from '@/lib/services/insurance-eligibility/plans'

export type ProfileActionResult = { ok: true } | { ok: false; error: string }

export async function updateMyProfileAction(formData: FormData): Promise<ProfileActionResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient' || !ctx.patientId) {
    return { ok: false, error: 'Only patients can edit their profile here.' }
  }

  const firstName = formData.get('firstName')?.toString().trim()
  const lastName = formData.get('lastName')?.toString().trim()
  if (!firstName || !lastName) return { ok: false, error: 'Name is required.' }

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
      updatedAt: new Date(),
    })
    .where(and(eq(patient.id, ctx.patientId), eq(patient.organizationId, ctx.organizationId)))

  // ML-50b: the card is the primary slot, authoritative in patient_insurance
  // (upsertPatientInsurance also writes the flat mirror). The form's
  // insuranceProvider / insurancePolicyNumber / insuranceGroupNumber fields.
  await upsertPatientInsurance(ctx.organizationId, ctx.patientId, 'primary', {
    provider: formData.get('insuranceProvider')?.toString().trim() || null,
    policyNumber: formData.get('insurancePolicyNumber')?.toString().trim() || null,
    groupNumber: formData.get('insuranceGroupNumber')?.toString().trim() || null,
  })

  revalidatePath('/patient/profile')
  revalidatePath('/patient/dashboard')
  revalidatePath('/patient/records')
  return { ok: true }
}

/**
 * Marketing-email preference, patient-controlled. Mirrors the unsub-link
 * behavior (timestamps + source audit); appointment-related email (the
 * transactional kind) is unaffected — that distinction is spelled out in
 * the UI copy.
 */
export async function setMarketingEmailOptInAction(optIn: boolean): Promise<ProfileActionResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient' || !ctx.patientId) {
    return { ok: false, error: 'Only patients can change their preferences here.' }
  }

  await db
    .update(patient)
    .set(
      optIn
        ? { marketingEmailOptIn: 1, marketingEmailOptInAt: new Date(), marketingOptInSource: 'portal', updatedAt: new Date() }
        : { marketingEmailOptIn: 0, marketingEmailOptOutAt: new Date(), updatedAt: new Date() },
    )
    .where(and(eq(patient.id, ctx.patientId), eq(patient.organizationId, ctx.organizationId)))

  revalidatePath('/patient/profile')
  return { ok: true }
}
