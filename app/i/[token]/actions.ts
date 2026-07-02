'use server'

import { createPlanSetupCheckout } from '@/lib/services/payment-plans'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'

/** Token-is-auth (the /b pattern): start the card-saving Stripe Checkout for
 *  a proposed payment plan. */
export async function startPlanSetupAction(
  token: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(await rateLimitPublicAction('plan-setup', { limit: 10 }))) {
    return { ok: false, error: 'Too many attempts — please wait a minute and try again.' }
  }
  if (!token || token.length > 200) return { ok: false, error: 'This link isn’t valid.' }
  return createPlanSetupCheckout(token)
}
