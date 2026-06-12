import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared schema-table sentinels — referenced by both the db mock (to identify
// which table a query targets) and the vi.mock factory below. Hoisted so the
// hoisted vi.mock can close over them.
const { TABLES } = vi.hoisted(() => ({
  TABLES: {
    referralPartner: { __t: 'referralPartner' },
    referralCommission: { id: 'id', partnerId: 'partnerId', status: 'status' },
    referralPayout: { id: 'id' },
  },
}))

const state = {
  partner: null as Record<string, unknown> | null,
  accruedRows: [] as Array<{ id: number; amountCents: number }>,
  transferShouldThrow: false,
  ledgerShouldThrow: false,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
  txCalls: 0,
  txRollbacks: 0,
  transferCalls: [] as Array<Record<string, unknown>>,
}

function tableName(t: unknown): string {
  if (t === TABLES.referralPartner) return 'referralPartner'
  if (t === TABLES.referralCommission) return 'referralCommission'
  if (t === TABLES.referralPayout) return 'referralPayout'
  return 'unknown'
}

function dbMethods(): any {
  const methods: any = {
    select: () => ({
      from: (t: unknown) => ({
        where: () => {
          // partner lookup uses .limit(1); accrued-rows lookup does not.
          const rowsFor = () => (tableName(t) === 'referralPartner' ? (state.partner ? [state.partner] : []) : state.accruedRows)
          const chain: any = {
            limit: async () => (state.partner ? [state.partner] : []),
            then: (resolve: (v: unknown) => unknown) => resolve(rowsFor()),
          }
          return chain
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const rec = { table: tableName(t), values }
        return {
          returning: async () => {
            state.inserts.push(rec)
            return [{ id: 99 }]
          },
          // bare-await insert (the failed-payout audit row)
          then: (resolve: (v: unknown) => unknown) => {
            state.inserts.push(rec)
            return resolve(undefined)
          },
        }
      },
    }),
    update: (t: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table: String(t), set: s })
        },
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      state.txCalls += 1
      try {
        return await cb(methods)
      } catch (err) {
        state.txRollbacks += 1
        throw err
      }
    },
  }
  return methods
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: dbMethods(),
  schema: TABLES,
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _k: 'and' })),
  eq: vi.fn(() => ({ _k: 'eq' })),
  inArray: vi.fn(() => ({ _k: 'inArray' })),
}))

const mockTransfersCreate = vi.fn()
const mockAccountsRetrieve = vi.fn()
vi.mock('@/lib/stripe', () => ({
  stripe: {
    transfers: { create: (...args: unknown[]) => mockTransfersCreate(...args) },
    accounts: { retrieve: (...args: unknown[]) => mockAccountsRetrieve(...args), create: vi.fn() },
    accountLinks: { create: vi.fn() },
  },
}))

import { payoutPartner } from '@/lib/services/referral-payouts'

beforeEach(() => {
  state.partner = null
  state.accruedRows = []
  state.transferShouldThrow = false
  state.ledgerShouldThrow = false
  state.inserts = []
  state.updates = []
  state.txCalls = 0
  state.txRollbacks = 0
  state.transferCalls = []
  mockTransfersCreate.mockReset()
  mockTransfersCreate.mockImplementation((args: Record<string, unknown>) => {
    state.transferCalls.push(args)
    if (state.transferShouldThrow) throw new Error('insufficient funds')
    return { id: 'tr_test_123' }
  })
})

const activePartner = {
  id: 'p1',
  accountId: 'acct_1',
  payoutsEnabled: 1,
  status: 'active',
}

describe('payoutPartner — guards', () => {
  it('rejects when partner not found', async () => {
    state.partner = null
    const r = await payoutPartner('p1', { initiatedBy: 'admin' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not found/i)
  })

  it('rejects a suspended partner on the SELF-SERVE path ("account paused")', async () => {
    state.partner = { ...activePartner, status: 'suspended' }
    const r = await payoutPartner('p1', { initiatedBy: 'partner', selfServe: true })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/paused/i)
    expect(mockTransfersCreate).not.toHaveBeenCalled()
  })

  it('ALLOWS an admin pay-now for a suspended partner (settling up)', async () => {
    state.partner = { ...activePartner, status: 'suspended' }
    state.accruedRows = [{ id: 1, amountCents: 5000 }] // over the minimum
    const r = await payoutPartner('p1', { initiatedBy: 'admin' }) // no selfServe → admin path
    expect(r.ok).toBe(true)
    expect(r.amountCents).toBe(5000)
    expect(mockTransfersCreate).toHaveBeenCalledOnce()
  })

  it('rejects an archived partner on BOTH paths (closed account)', async () => {
    state.partner = { ...activePartner, status: 'archived' }
    state.accruedRows = [{ id: 1, amountCents: 5000 }]
    const admin = await payoutPartner('p1', { initiatedBy: 'admin' })
    expect(admin.ok).toBe(false)
    expect(admin.error).toMatch(/closed/i)
    const portal = await payoutPartner('p1', { initiatedBy: 'partner', selfServe: true })
    expect(portal.ok).toBe(false)
    expect(portal.error).toMatch(/closed/i)
    expect(mockTransfersCreate).not.toHaveBeenCalled()
  })

  it('rejects when payout method not ready (no account / payouts disabled)', async () => {
    state.partner = { ...activePartner, payoutsEnabled: 0 }
    const r = await payoutPartner('p1', { initiatedBy: 'admin' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/payout method not ready/i)
    expect(mockTransfersCreate).not.toHaveBeenCalled()
  })

  it('rejects when balance is under the $25 minimum', async () => {
    state.partner = activePartner
    state.accruedRows = [{ id: 1, amountCents: 1000 }, { id: 2, amountCents: 1400 }] // $24.00
    const r = await payoutPartner('p1', { initiatedBy: 'admin' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/under \$25/i)
    expect(mockTransfersCreate).not.toHaveBeenCalled()
  })
})

describe('payoutPartner — money flow', () => {
  it('happy path: transfers the summed balance, then flips rows + writes payout row', async () => {
    state.partner = activePartner
    state.accruedRows = [{ id: 1, amountCents: 1990 }, { id: 2, amountCents: 1990 }] // $39.80
    const r = await payoutPartner('p1', { initiatedBy: 'admin' })
    expect(r.ok).toBe(true)
    expect(r.amountCents).toBe(3980)
    // Transfer made for the exact summed cents, to the connected account.
    expect(state.transferCalls[0]).toMatchObject({ amount: 3980, currency: 'usd', destination: 'acct_1' })
    // Ledger finalized inside a transaction: payout row inserted + rows updated to paid.
    expect(state.txCalls).toBe(1)
    expect(state.inserts.some((i) => i.table === 'referralPayout' && i.values.status === 'paid')).toBe(true)
    expect(state.updates.some((u) => u.set.status === 'paid')).toBe(true)
  })

  it('uses an idempotency key so a retry over the same rows cannot double-pay', async () => {
    state.partner = activePartner
    state.accruedRows = [{ id: 7, amountCents: 5000 }]
    await payoutPartner('p1', { initiatedBy: 'admin' })
    // The Stripe call's 2nd arg carries the idempotencyKey.
    const opts = mockTransfersCreate.mock.calls[0][1] as { idempotencyKey?: string }
    expect(opts?.idempotencyKey).toBeTruthy()
    expect(opts!.idempotencyKey).toContain('rpo_')
  })

  it('transfer failure → no ledger writes, rows stay accrued, records a failed payout', async () => {
    state.partner = activePartner
    state.accruedRows = [{ id: 1, amountCents: 5000 }]
    state.transferShouldThrow = true
    const r = await payoutPartner('p1', { initiatedBy: 'admin' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/could not be sent/i)
    // No transaction ran; no commission row flipped to paid.
    expect(state.txCalls).toBe(0)
    expect(state.updates.some((u) => u.set.status === 'paid')).toBe(false)
    // A failed payout audit row was written.
    expect(state.inserts.some((i) => i.table === 'referralPayout' && i.values.status === 'failed')).toBe(true)
  })
})
