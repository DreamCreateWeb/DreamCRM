'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  isDomainBuyingAvailable,
  purchaseDomainForClinic,
  searchDomainOffersForClinic,
  type DomainOffer,
  type PurchaseResult,
} from '@/lib/services/domain-purchase'

/**
 * Buy-a-domain actions (2026-07-21). Owner/admin clinic staff only — the
 * same bar as connecting a domain manually; buying additionally moves money.
 */
async function requireDomainManager() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Domains are a clinic feature.')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only an owner or admin can manage domains.')
  }
  if (ctx.isDemo) throw new Error('Domain buying is disabled in the demo clinic.')
  return ctx
}

export async function searchDomainsAction(
  query: string,
): Promise<{ ok: true; offers: DomainOffer[]; freeSlotOpen: boolean } | { ok: false; error: string }> {
  try {
    const ctx = await requireDomainManager()
    if (!isDomainBuyingAvailable()) return { ok: false, error: 'Domain buying is not enabled yet.' }
    const { offers, freeSlotOpen } = await searchDomainOffersForClinic(ctx.organizationId, query)
    return { ok: true, offers, freeSlotOpen }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Search failed. Try again.' }
  }
}

export async function purchaseDomainAction(
  domainName: string,
  expectedPriceCents: number,
): Promise<PurchaseResult> {
  try {
    const ctx = await requireDomainManager()
    if (!isDomainBuyingAvailable()) return { ok: false, error: 'Domain buying is not enabled yet.' }
    const result = await purchaseDomainForClinic(ctx.organizationId, ctx.userId, domainName, expectedPriceCents)
    if (result.ok) revalidatePath('/website/domain')
    return result
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Purchase failed. Try again.' }
  }
}
