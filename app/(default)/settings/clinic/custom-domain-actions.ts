'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  requestCustomDomain,
  checkCustomDomainStatus,
  removeCustomDomain,
  type CustomDomainResult,
} from '@/lib/services/custom-domain'
import { detectDnsProvider, type DnsDetection } from '@/lib/services/dns-provider'

/**
 * Custom-domain settings actions. Owner/admin-gated like the rest of the clinic
 * profile editor. The underlying service degrades gracefully — these never
 * throw at the clinic; they return the `{ ok }` result shape the card renders.
 */

async function gate() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false as const, error: 'Only clinic tenants can manage a custom domain.' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false as const, error: 'Only owners and admins can manage the custom domain.' }
  }
  return { ok: true as const, orgId: ctx.organizationId }
}

export async function requestCustomDomainAction(domain: string): Promise<CustomDomainResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  const res = await requestCustomDomain(g.orgId, domain)
  revalidatePath('/settings/clinic')
  return res
}

export async function checkCustomDomainStatusAction(): Promise<CustomDomainResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  const res = await checkCustomDomainStatus(g.orgId)
  revalidatePath('/settings/clinic')
  return res
}

export async function detectDnsProviderAction(
  domain: string,
): Promise<{ ok: true; detection: DnsDetection } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  const detection = await detectDnsProvider(domain)
  return { ok: true, detection }
}

export async function removeCustomDomainAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  const res = await removeCustomDomain(g.orgId)
  revalidatePath('/settings/clinic')
  return res
}
