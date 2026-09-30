'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { canUseInsuranceTool, type EligibilityRequest } from '@/lib/insurance-eligibility'
import {
  attachInsuranceCheckToPatient,
  runEligibilityCheck,
  type RunEligibilityCheckResult,
} from '@/lib/services/insurance-eligibility'
import { createPatient, updatePatient } from '@/lib/services/patients'

/**
 * Server actions for the Insurance tool. Every action takes the org from the
 * session — never from the client — and returns a typed result rather than
 * throwing, so the form can show the reason inline.
 */

async function clinicCtx() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return null
  // PREVIEW: the actions refuse for anyone the page would 404 for.
  if (!canUseInsuranceTool(ctx)) return null
  return ctx
}

export async function checkInsuranceAction(
  input: unknown,
  patientId: string | null,
): Promise<RunEligibilityCheckResult> {
  const ctx = await clinicCtx()
  if (!ctx) return { ok: false, errors: { _form: 'Insurance checks are a clinic feature.' } }
  const r = await runEligibilityCheck(ctx.organizationId, {
    input,
    patientId,
    userId: ctx.userId,
  })
  if (r.ok) {
    revalidatePath('/insurance')
    if (r.check.patientId) revalidatePath(`/patients/${r.check.patientId}`)
  }
  return r
}

/** Write the checked card details onto an existing patient's on-file columns. */
export async function saveInsuranceToPatientAction(
  patientId: string,
  fields: { carrierName: string; memberId: string; groupNumber: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await clinicCtx()
  if (!ctx) return { ok: false, error: 'Insurance checks are a clinic feature.' }
  const carrier = fields.carrierName.trim()
  const memberId = fields.memberId.trim()
  if (!carrier || !memberId) return { ok: false, error: 'Carrier and member ID are required.' }
  try {
    await updatePatient({
      organizationId: ctx.organizationId,
      patientId,
      patch: {
        insuranceProvider: carrier,
        insurancePolicyNumber: memberId,
        insuranceGroupNumber: fields.groupNumber?.trim() || null,
      },
    })
    revalidatePath(`/patients/${patientId}`)
    revalidatePath('/patients')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save to the patient.' }
  }
}

/**
 * "Add as new patient" from a check that was run before a record existed.
 * Rides the same dedupe as the Add-patient modal (email/phone are unknown
 * here, so the match is by whatever the form carried — usually nothing —
 * and `forceNew` is the same Add-anyway escape hatch).
 */
export async function createPatientFromCheckAction(args: {
  checkId: string
  request: EligibilityRequest
  forceNew?: boolean
}): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { ok: false; duplicateOf: { id: string; name: string } }
> {
  const ctx = await clinicCtx()
  if (!ctx) return { ok: false, error: 'Insurance checks are a clinic feature.' }
  const req = args.request
  const firstName = req.patient.firstName.trim()
  const lastName = req.patient.lastName.trim()
  if (!firstName || !lastName) return { ok: false, error: 'First and last name are required.' }
  try {
    const result = await createPatient({
      organizationId: ctx.organizationId,
      firstName,
      lastName,
      dateOfBirth: req.patient.dateOfBirth || null,
      insuranceProvider: req.carrierName.trim() || null,
      insurancePolicyNumber: req.memberId.trim() || null,
      insuranceGroupNumber: req.groupNumber?.trim() || null,
      source: 'manual',
      lifecycle: 'new',
      forceNew: !!args.forceNew,
    })
    if ('duplicateOf' in result) return { ok: false, duplicateOf: result.duplicateOf }
    await attachInsuranceCheckToPatient(ctx.organizationId, args.checkId, result.id)
    revalidatePath('/patients')
    revalidatePath('/insurance')
    return { ok: true, id: result.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create the patient.' }
  }
}
