'use server'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { createActivationCheckout } from '@/lib/services/clinic-provisioning'

/** Owner/admin of a managed clinic → Stripe checkout for the reserved plan. */
export async function startActivationCheckout() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    throw new Error('Only the clinic owner or an admin can activate billing.')
  }
  const { url } = await createActivationCheckout({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    email: ctx.userEmail,
  })
  if (!url) redirect('/')
  redirect(url)
}
