'use server'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { createActivationCheckout } from '@/lib/services/clinic-provisioning'
import { billingActionFailure, type BillingActionState } from '@/lib/services/billing-action-error'

/**
 * Owner/admin of a managed clinic → Stripe checkout for the reserved plan.
 *
 * RETURNS its refusal rather than throwing, for the reason
 * `lib/services/billing-action-error.ts` sets out: both of this action's call
 * sites are a plain `<form action={…}>` (the trial-ended wall's managed arm and
 * `/billing/activate`), so a thrown message reached nobody at all and the
 * button did nothing. The success paths redirect and never return, so both
 * `redirect()` calls sit OUTSIDE the try.
 */
export async function startActivationCheckout(): Promise<BillingActionState> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    return { error: 'Only the clinic owner or an admin can add billing.' }
  }
  let url: string | null
  try {
    ;({ url } = await createActivationCheckout({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      email: ctx.userEmail,
    }))
  } catch (err) {
    return billingActionFailure('billing.activate', err)
  }
  if (!url) redirect('/')
  redirect(url)
}

/** The `useActionState` adapter — see `components/ui/billing-action-form.tsx`. */
export async function startActivationCheckoutFormAction(
  _prevState: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  return startActivationCheckout()
}
