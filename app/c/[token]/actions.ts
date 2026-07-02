'use server'

import { confirmVisitByToken, type ConfirmContext } from '@/lib/services/appointment-confirm'

/** Token-is-auth confirm (the /c/[token] landing's one button). */
export async function confirmVisitAction(
  token: string,
): Promise<{ ok: boolean; state: ConfirmContext['state'] }> {
  if (typeof token !== 'string' || token.length < 8 || token.length > 200) {
    return { ok: false, state: 'past' }
  }
  return confirmVisitByToken(token)
}
