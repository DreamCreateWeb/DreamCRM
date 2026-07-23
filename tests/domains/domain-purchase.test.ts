import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Buy-a-domain service (2026-07-21): the money-safety rails are the tests —
 * premium/over-cap domains never surface, a moved price aborts before any
 * charge, dry-run never touches Stripe or the registrar, a live registration
 * failure refunds, and every row is org-stamped.
 */

const h = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  searchDomains: vi.fn(),
  createDomain: vi.fn(),
  createRecord: vi.fn(),
  livePurchases: false,
  piCreate: vi.fn(),
  refundCreate: vi.fn(),
  requestCustomDomain: vi.fn(),
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  profileRows: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/name-com', () => ({
  isNameComConfigured: () => true,
  isLivePurchasesEnabled: () => h.livePurchases,
  checkAvailability: h.checkAvailability,
  searchDomains: h.searchDomains,
  createDomain: h.createDomain,
  createRecord: h.createRecord,
  disableAutorenew: vi.fn(async () => {}),
  renewDomain: vi.fn(async () => ({ expireDate: null })),
}))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { create: h.piCreate },
    refunds: { create: h.refundCreate },
  },
}))
const { platformOrgMock, notifyMock } = vi.hoisted(() => ({
  platformOrgMock: vi.fn(async () => 'org_platform'),
  notifyMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/gsc', () => ({ getPlatformOrgId: platformOrgMock }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyMock }))
vi.mock('@/lib/services/custom-domain', () => ({
  resolveCustomDomain: (raw: string) =>
    /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(raw)
      ? { ok: true, plan: { associateHost: raw, enableWww: true, canonical: `www.${raw}`, servedHosts: [raw, `www.${raw}`] } }
      : { ok: false, error: 'bad domain' },
  requestCustomDomain: h.requestCustomDomain,
}))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const selectChain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => h.profileRows
    obj.then = (resolve: (v: unknown) => void) => resolve(h.profileRows)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: async (vals: Record<string, unknown>) => {
          h.inserts.push(vals)
        },
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            h.updates.push(vals)
          },
        }),
      }),
    },
    schema,
  }
})

import {
  filterOffers,
  searchDomainOffers,
  purchaseDomainForClinic,
  PRICE_CAP_CENTS,
} from '@/lib/services/domain-purchase'

const OK = { domainName: 'brightsmiles.com', purchasable: true, premium: false, purchasePriceCents: 1499, renewalPriceCents: 1699 }

beforeEach(() => {
  h.checkAvailability.mockReset().mockResolvedValue([OK])
  h.searchDomains.mockReset().mockResolvedValue([])
  h.createDomain.mockReset().mockResolvedValue({ domainName: OK.domainName, totalPaidCents: 1499 })
  h.createRecord.mockReset().mockResolvedValue(undefined)
  h.piCreate.mockReset().mockResolvedValue({ id: 'pi_1' })
  h.refundCreate.mockReset().mockResolvedValue({ id: 're_1' })
  platformOrgMock.mockClear()
  notifyMock.mockClear()
  h.requestCustomDomain.mockReset().mockResolvedValue({
    ok: true,
    status: { dnsRecords: [
      { name: 'brightsmiles.com', host: '@', type: 'CNAME', value: 'x.awsapprunner.com', purpose: 'routing' },
      { name: '_abc.brightsmiles.com', host: '_abc', type: 'CNAME', value: '_v.acm.aws.', purpose: 'certificate' },
    ] },
  })
  h.livePurchases = false
  h.inserts.length = 0
  h.updates.length = 0
  h.profileRows = [{ stripeCustomerId: 'cus_1' }]
})

describe('filterOffers — the fat-finger guards', () => {
  it('drops premium, over-cap, and unpurchasable results', () => {
    const offers = filterOffers([
      OK,
      { ...OK, domainName: 'premium.com', premium: true },
      { ...OK, domainName: 'yacht.com', purchasePriceCents: PRICE_CAP_CENTS + 1 },
      { ...OK, domainName: 'taken.com', purchasable: false },
      { ...OK, domainName: 'nul.com', purchasePriceCents: null },
    ])
    expect(offers.map((o) => o.domainName)).toEqual(['brightsmiles.com'])
  })
})

describe('searchDomainOffers', () => {
  it('merges exact-name availability with keyword suggestions, deduped', async () => {
    h.searchDomains.mockResolvedValue([OK, { ...OK, domainName: 'brightsmiles.dental', purchasePriceCents: 2999 }])
    const offers = await searchDomainOffers('brightsmiles.com')
    expect(h.checkAvailability).toHaveBeenCalledWith(['brightsmiles.com'])
    expect(offers.map((o) => o.domainName)).toEqual(['brightsmiles.com', 'brightsmiles.dental'])
  })

  it('returns nothing for a too-short query without calling the API', async () => {
    const offers = await searchDomainOffers('ab')
    expect(offers).toEqual([])
    expect(h.searchDomains).not.toHaveBeenCalled()
  })
})

describe('purchaseDomainForClinic — dry-run (the shipped default)', () => {
  it('records the purchase without touching Stripe or the registrar', async () => {
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res).toMatchObject({ ok: true, dryRun: true })
    expect(h.piCreate).not.toHaveBeenCalled()
    expect(h.createDomain).not.toHaveBeenCalled()
    expect(h.createRecord).not.toHaveBeenCalled() // no zone exists in dry-run
    expect(h.inserts[0]).toMatchObject({ organizationId: 'org_a', domain: 'brightsmiles.com', dryRun: 1 })
    // Attach is still exercised (App Runner association is idempotent + free).
    expect(h.requestCustomDomain).toHaveBeenCalledWith('org_a', 'brightsmiles.com')
  })

  it('aborts when the price moved since the quote', async () => {
    h.checkAvailability.mockResolvedValue([{ ...OK, purchasePriceCents: 1999 }])
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/price changed/i)
    expect(h.inserts).toHaveLength(0)
  })

  it('aborts when the domain is no longer purchasable', async () => {
    h.checkAvailability.mockResolvedValue([{ ...OK, purchasable: false }])
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res.ok).toBe(false)
    expect(h.inserts).toHaveLength(0)
  })
})

describe('purchaseDomainForClinic — live mode', () => {
  beforeEach(() => {
    h.livePurchases = true
  })

  it('charges, registers, writes the DNS records, and stamps the org', async () => {
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res).toMatchObject({ ok: true, dryRun: false })
    expect(h.piCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', amount: 1499, off_session: true, confirm: true }),
    )
    expect(h.createDomain).toHaveBeenCalledWith('brightsmiles.com', 1499)
    // Routing apex becomes ANAME (a bare apex can't CNAME); cert record kept as-is.
    expect(h.createRecord).toHaveBeenCalledWith('brightsmiles.com', expect.objectContaining({ host: '@', type: 'ANAME' }))
    expect(h.createRecord).toHaveBeenCalledWith('brightsmiles.com', expect.objectContaining({ host: '_abc', type: 'CNAME' }))
    expect(h.inserts[0]).toMatchObject({ organizationId: 'org_a', dryRun: 0, stripePaymentIntentId: 'pi_1' })
  })

  it('pages the platform when the auto-attach degrades to manual (no cert is coming)', async () => {
    // requestCustomDomain returns ok:true with error:'manual' when App Runner's
    // AssociateCustomDomain failed (e.g. the 5-domain quota) — DNS points at
    // the service but no certificate will ever bind. The purchase must still
    // succeed AND the platform must get a forced-email alert.
    h.requestCustomDomain.mockResolvedValue({
      ok: true,
      status: {
        error: 'manual',
        dnsRecords: [
          { name: 'brightsmiles.com', host: '@', type: 'CNAME', value: 'x.awsapprunner.com', purpose: 'routing' },
        ],
      },
    })
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res.ok).toBe(true)
    expect(notifyMock).toHaveBeenCalledWith(
      'org_platform',
      expect.objectContaining({
        type: 'domain_attach_manual',
        forceEmail: true,
        title: expect.stringContaining('brightsmiles.com'),
      }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('refunds the charge when registration fails after payment', async () => {
    h.createDomain.mockRejectedValue(new Error('TLD not supported'))
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/refunded/i)
    expect(h.refundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_1' })
    expect(h.updates.some((u) => u.status === 'failed')).toBe(true)
  })

  it('stops with a clear message when no payment method exists', async () => {
    h.profileRows = [{ stripeCustomerId: null }]
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/payment method/i)
    expect(h.piCreate).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  })
})

describe('the plan-included tier (session 2)', () => {
  it('both prices must fit the free caps — teaser renewals never qualify', async () => {
    const { isIncludedEligible, FREE_PURCHASE_CAP_CENTS, FREE_RENEWAL_CAP_CENTS } = await import(
      '@/lib/services/domain-purchase'
    )
    expect(isIncludedEligible({ purchasePriceCents: 1299, renewalPriceCents: 1999 })).toBe(true)
    // The .live trap: $3.99 first year, $43.99 renewal — NOT free.
    expect(isIncludedEligible({ purchasePriceCents: 399, renewalPriceCents: 4399 })).toBe(false)
    expect(isIncludedEligible({ purchasePriceCents: FREE_PURCHASE_CAP_CENTS + 1, renewalPriceCents: 1000 })).toBe(false)
    // Unknown renewal price never qualifies.
    expect(isIncludedEligible({ purchasePriceCents: 999, renewalPriceCents: null })).toBe(false)
    expect(isIncludedEligible({ purchasePriceCents: 1999, renewalPriceCents: FREE_RENEWAL_CAP_CENTS })).toBe(true)
  })

  it('an included-eligible live purchase skips Stripe entirely and marks the row', async () => {
    h.livePurchases = true
    h.profileRows = [] // free slot check: no prior included purchase rows
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res.ok).toBe(true)
    expect(h.piCreate).not.toHaveBeenCalled()
    expect(h.createDomain).toHaveBeenCalledWith('brightsmiles.com', 1499)
    expect(h.inserts[0]).toMatchObject({ includedInPlan: 1, stripePaymentIntentId: null })
  })

  it('with the free slot already used, the same domain charges the card', async () => {
    h.livePurchases = true
    // The shared select mock serves both queries: a non-empty result closes
    // the slot check, and the same row carries the Stripe customer.
    h.profileRows = [{ id: 'prior', stripeCustomerId: 'cus_1' }]
    const res = await purchaseDomainForClinic('org_a', 'user_1', 'brightsmiles.com', 1499)
    expect(res.ok).toBe(true)
    expect(h.piCreate).toHaveBeenCalled()
    expect(h.inserts[0]).toMatchObject({ includedInPlan: 0, stripePaymentIntentId: 'pi_1' })
  })
})
