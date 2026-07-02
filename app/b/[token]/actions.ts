'use server'

import { createCheckoutForPayToken } from '@/lib/services/balance-outreach'

/** Token-is-auth checkout start for the /b/[token] pay landing. */
export async function startBalanceCheckoutAction(
  token: string,
  amountCents: number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (typeof token !== 'string' || token.length < 8 || token.length > 200) {
    return { ok: false, error: 'This link isn’t valid anymore.' }
  }
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 5_000_000) {
    return { ok: false, error: 'Enter an amount of at least $1.' }
  }
  return createCheckoutForPayToken(token, amountCents)
}
