'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { requestEmailDomain, checkEmailDomain, type EmailDomainResult } from '@/lib/services/email-domain'

/** Owner/admin-gated, like the custom-domain actions. Never throws at the clinic. */
async function gate() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false as const, error: 'Only clinic tenants can set this up.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false as const, error: 'Only owners and admins can change where email comes from.' }
  }
  return { ok: true as const, orgId: ctx.organizationId }
}

export async function requestEmailDomainAction(): Promise<EmailDomainResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  const res = await requestEmailDomain(g.orgId)
  revalidatePath('/website/domain')
  return res
}

export async function checkEmailDomainAction(): Promise<EmailDomainResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  try {
    const res = await checkEmailDomain(g.orgId)
    revalidatePath('/website/domain')
    return res
  } catch {
    return { ok: false, error: 'We couldn’t reach our email provider just now. Try again in a minute.' }
  }
}
