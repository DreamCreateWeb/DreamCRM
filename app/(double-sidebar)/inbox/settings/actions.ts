'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { emailAccount } from '@/lib/db/schema/email'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'

/**
 * Designate a connected Gmail account as the clinic's PATIENT-FACING sender
 * (Tier 2 — patient emails send as this address instead of the platform
 * identity). Surfaced right after a Gmail connect so the capability isn't
 * buried in Settings → Clinic. Owner/admin only; account must belong to the org.
 */
export async function useAsPatientSenderAction(
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can set a patient sender.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change the patient email sender.' }
  }
  const [acct] = await db
    .select({ id: emailAccount.id })
    .from(emailAccount)
    .where(and(eq(emailAccount.id, accountId), eq(emailAccount.organizationId, ctx.organizationId)))
    .limit(1)
  if (!acct) return { ok: false, error: 'That account isn’t connected to this clinic.' }

  await db
    .update(clinicProfile)
    .set({ emailSendingAccountId: accountId, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
  revalidatePath('/inbox/settings')
  return { ok: true }
}
