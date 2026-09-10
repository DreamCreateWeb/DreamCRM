'use server'

import { requireTenant } from '@/lib/auth/context'
import { getPortalSettings } from '@/lib/services/portal-settings'
import { getMyPatientRecord } from '@/lib/services/patient-portal'
import { createBalancePaymentSession } from '@/lib/services/balance-payments'
import { appBaseUrl } from '@/lib/services/clinic-site'
import { checkoutFailure } from '@/lib/services/checkout-error'

export type StartPaymentResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Kick off a Stripe Checkout for an account-balance payment. The clinic
 * must have the payments feature ON and an active connected account; both
 * are re-checked here, not just in the UI.
 */
export async function startBalancePaymentAction(amountCents: number): Promise<StartPaymentResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient' || !ctx.patientId) {
    return { ok: false, error: 'Only patients can pay a balance here.' }
  }
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.billing || !settings.features.payments) {
    return { ok: false, error: 'Online payment isn’t available — give us a call and we’ll take it over the phone.' }
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'Enter an amount to pay.' }
  }

  const me = await getMyPatientRecord(ctx.patientId, ctx.organizationId)

  try {
    const { url } = await createBalancePaymentSession({
      organizationId: ctx.organizationId,
      patientId: ctx.patientId,
      amountCents: Math.round(amountCents),
      patientEmail: me?.email ?? ctx.userEmail ?? null,
      clinicName: ctx.organizationName,
      baseUrl: appBaseUrl(),
    })
    return { ok: true, url }
  } catch (err) {
    // Anything we didn't write for the patient (a Stripe outage, a DB blip)
    // becomes one written sentence rather than the SDK's own text.
    return checkoutFailure('balance-payments', err)
  }
}
