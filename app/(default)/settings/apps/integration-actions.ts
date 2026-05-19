'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { disconnectAccount } from '@/lib/services/mailbox'

/**
 * Disconnect a connected Gmail account. Scoped to the caller's org so a user
 * can't unhook a mailbox belonging to a different tenant.
 */
export async function disconnectMailbox(accountId: string) {
  const ctx = await requireTenant()
  await disconnectAccount(accountId, ctx.organizationId)
  revalidatePath('/settings/apps')
  revalidatePath('/inbox')
  revalidatePath('/inbox/settings')
}
