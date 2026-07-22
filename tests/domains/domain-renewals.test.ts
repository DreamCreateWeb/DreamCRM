import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The domain-renewals engine (session 2): churned clinic → released (never
 * renewed on the platform's dime), included domain → platform renews with
 * no charge, paid domain → clinic's card first then registrar, registrar
 * failure after charge → refund, decline → renewalError recorded for the
 * daily retry.
 */

const h = vi.hoisted(() => ({
  dueRows: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  piCreate: vi.fn(),
  refundCreate: vi.fn(),
  renewDomain: vi.fn(),
}))

vi.mock('@/lib/name-com', () => ({
  isNameComConfigured: () => true,
  isLivePurchasesEnabled: () => true,
  checkAvailability: vi.fn(),
  searchDomains: vi.fn(),
  createDomain: vi.fn(),
  createRecord: vi.fn(),
  disableAutorenew: vi.fn(async () => {}),
  renewDomain: h.renewDomain,
}))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { create: h.piCreate },
    refunds: { create: h.refundCreate },
  },
}))
vi.mock('@/lib/services/custom-domain', () => ({
  resolveCustomDomain: vi.fn(),
  requestCustomDomain: vi.fn(),
}))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const selectChain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => h.dueRows
    obj.then = (resolve: (v: unknown) => void) => resolve(h.dueRows)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({ values: async () => {} }),
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

import { runDomainRenewals } from '@/lib/services/domain-purchase'

const NOW = new Date('2026-08-01T12:00:00.000Z')

function dueRow(over: Record<string, unknown> = {}) {
  const { row: rowOver, ...rest } = over
  return {
    row: {
      id: 'p1',
      organizationId: 'org_a',
      domain: 'brightsmiles.com',
      status: 'active',
      dryRun: 0,
      includedInPlan: 0,
      renewalPriceCents: 1699,
      renewsAt: new Date('2026-08-20T00:00:00.000Z'),
      ...((rowOver as Record<string, unknown>) ?? {}),
    },
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_1',
    ...rest,
  }
}

beforeEach(() => {
  h.dueRows = []
  h.updates.length = 0
  h.piCreate.mockReset().mockResolvedValue({ id: 'pi_renew' })
  h.refundCreate.mockReset().mockResolvedValue({ id: 're_1' })
  h.renewDomain.mockReset().mockResolvedValue({ expireDate: '2027-08-20' })
})

describe('runDomainRenewals', () => {
  it('paid domain + active clinic: charges the card, renews, advances a year', async () => {
    h.dueRows = [dueRow()]
    const res = await runDomainRenewals({ now: NOW })
    expect(res.renewed).toBe(1)
    expect(h.piCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1', amount: 1699 }))
    expect(h.renewDomain).toHaveBeenCalledWith('brightsmiles.com', 1699)
    const upd = h.updates.find((u) => u.renewsAt)
    expect((upd!.renewsAt as Date).getUTCFullYear()).toBe(2027)
    expect(upd!.renewalError).toBeNull()
  })

  it('included domain: renews with NO charge (the platform absorbs it)', async () => {
    h.dueRows = [dueRow({ row: { includedInPlan: 1 } })]
    const res = await runDomainRenewals({ now: NOW })
    expect(res.renewed).toBe(1)
    expect(h.piCreate).not.toHaveBeenCalled()
    expect(h.renewDomain).toHaveBeenCalled()
  })

  it('churned clinic: releases instead of renewing — nothing charged, nothing renewed', async () => {
    h.dueRows = [dueRow({ subscriptionStatus: 'canceled' })]
    const res = await runDomainRenewals({ now: NOW })
    expect(res.released).toBe(1)
    expect(h.piCreate).not.toHaveBeenCalled()
    expect(h.renewDomain).not.toHaveBeenCalled()
    expect(h.updates.some((u) => u.status === 'released')).toBe(true)
  })

  it('card decline: records renewalError and leaves the row for the daily retry', async () => {
    h.dueRows = [dueRow()]
    h.piCreate.mockRejectedValue(new Error('Your card was declined.'))
    const res = await runDomainRenewals({ now: NOW })
    expect(res.failed).toBe(1)
    expect(h.renewDomain).not.toHaveBeenCalled()
    expect(h.updates.some((u) => typeof u.renewalError === 'string' && /declined/i.test(u.renewalError as string))).toBe(true)
  })

  it('registrar failure after a successful charge: refunds so the retry starts clean', async () => {
    h.dueRows = [dueRow()]
    h.renewDomain.mockRejectedValue(new Error('registry timeout'))
    const res = await runDomainRenewals({ now: NOW })
    expect(res.failed).toBe(1)
    expect(h.refundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_renew' })
    expect(h.updates.some((u) => typeof u.renewalError === 'string' && /refunded/.test(u.renewalError as string))).toBe(true)
  })

  it('a missing renewal price fails safe with a human instruction, touching nothing', async () => {
    h.dueRows = [dueRow({ row: { renewalPriceCents: null } })]
    const res = await runDomainRenewals({ now: NOW })
    expect(res.failed).toBe(1)
    expect(h.piCreate).not.toHaveBeenCalled()
    expect(h.renewDomain).not.toHaveBeenCalled()
  })
})
