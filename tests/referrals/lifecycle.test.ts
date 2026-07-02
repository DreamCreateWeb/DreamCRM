import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Partner lifecycle + live-percent-resolution semantics.
 *
 * Covers: live default resolution at accrual (raise/lower → next accrual uses
 * the new %, an overridden clinic is unaffected); updateClinicReferralTerms
 * NULL-collapse (override == default → NULL); the conditional delete (hard
 * delete only with zero money history, attribution nulled via FK); archive
 * (refused with balance, pay-then-archive, void-then-archive → 'reversed',
 * accrual stops); reactivate (+ email-conflict); recreate-email after a hard
 * delete; the archived-email create error; and the backfill UPDATE logic.
 */

const { TABLES } = vi.hoisted(() => ({
  TABLES: {
    referralPartner: { __t: 'referralPartner', id: 'id', email: 'email', status: 'status' },
    referralCommission: { __t: 'referralCommission', id: 'id', partnerId: 'partnerId', status: 'status', amountCents: 'amountCents', stripeInvoiceId: 'stripeInvoiceId' },
    referralPayout: { __t: 'referralPayout', id: 'id', partnerId: 'partnerId' },
    clinicProfile: { __t: 'clinicProfile', organizationId: 'organizationId', referralPartnerId: 'referralPartnerId' },
    organization: { __t: 'organization', id: 'id' },
  },
}))

function tableName(t: unknown): string {
  for (const [k, v] of Object.entries(TABLES)) if (v === t) return k
  return 'unknown'
}

/**
 * A flexible mock. Per-table FIFO queues for select-then-limit results, plus
 * scalar queues for aggregate (count/sum) selects (the lifecycle helpers use
 * select({...}).from().where() WITHOUT .limit() for sums/counts, and
 * select().from().where().limit(1) for single rows).
 */
const state = {
  // single-row .limit(1) results by table
  limitRows: {} as Record<string, unknown[][]>,
  // non-limit select results by table (sums/counts/accrued-row lists) — FIFO
  scalarRows: {} as Record<string, unknown[][]>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string }>,
}

function nextLimit(table: string): unknown[] {
  return state.limitRows[table]?.shift() ?? []
}
function nextScalar(table: string): unknown[] {
  return state.scalarRows[table]?.shift() ?? []
}

function dbMethods(): any {
  const methods: any = {
    select: () => ({
      from: (t: unknown) => {
        const name = tableName(t)
        const chain: any = {
          where: () => ({
            limit: async () => nextLimit(name),
            // bare-await (no .limit) → aggregate / list result
            then: (resolve: (v: unknown) => unknown) => resolve(nextScalar(name)),
          }),
        }
        return chain
      },
    }),
    insert: (t: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const rec = { table: tableName(t), values }
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              state.inserts.push(rec)
              return [{ id: 1 }]
            },
            then: (resolve: (v: unknown) => unknown) => {
              state.inserts.push(rec)
              return resolve(undefined)
            },
          }),
          returning: async () => {
            state.inserts.push(rec)
            return [{ id: 1 }]
          },
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
          state.updates.push({ table: tableName(t), set: s })
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async () => {
        state.deletes.push({ table: tableName(t) })
      },
    }),
  }
  return methods
}

const mockPayoutPartner = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ deliver: vi.fn(), authEmailShell: vi.fn(() => '<html></html>') }))
vi.mock('@/lib/db', () => ({ db: dbMethods(), schema: TABLES }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...a) => ({ _k: 'and', a })),
  eq: vi.fn(() => ({ _k: 'eq' })),
  ne: vi.fn(() => ({ _k: 'ne' })),
  desc: vi.fn((x) => x),
  inArray: vi.fn(() => ({ _k: 'inArray' })),
  sql: Object.assign(vi.fn(() => ({ _k: 'sql' })), { raw: vi.fn() }),
}))
// archivePartner dynamically imports payoutPartner — mock it.
vi.mock('@/lib/services/referral-payouts', () => ({ payoutPartner: (...a: unknown[]) => mockPayoutPartner(...a) }))

import {
  accrueCommissionForInvoice,
  updateClinicReferralTerms,
  getPartnerLifecycleInfo,
  deletePartner,
  archivePartner,
  reactivatePartner,
  voidAccruedCommission,
  createPartner,
} from '@/lib/services/referrals'

beforeEach(() => {
  state.limitRows = {}
  state.scalarRows = {}
  state.inserts = []
  state.updates = []
  state.deletes = []
  mockPayoutPartner.mockReset()
  mockPayoutPartner.mockResolvedValue({ ok: true, amountCents: 5000 })
})

// ── Live percent resolution at accrual ──────────────────────────────────────

describe('live percent resolution — default change flows to non-overridden clinics', () => {
  const base = { organizationId: 'org1', stripeInvoiceId: 'in_1', amountPaidCents: 19900 }

  it('raise default: a NULL-override clinic accrues at the NEW default', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1', percentBps: null, termMonths: null, startedAt: new Date() }]]
    state.limitRows.referralPartner = [[{ status: 'active', defaultPercentBps: 1500, defaultTermMonths: null }]] // raised to 15%
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(true)
    expect(r.amountCents).toBe(2985) // 15% of 19900 — the new default
    expect(state.inserts[0].values.percentBps).toBe(1500)
  })

  it('lower default: a NULL-override clinic accrues at the LOWER default', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1', percentBps: null, termMonths: null, startedAt: new Date() }]]
    state.limitRows.referralPartner = [[{ status: 'active', defaultPercentBps: 500, defaultTermMonths: null }]] // lowered to 5%
    const r = await accrueCommissionForInvoice(base)
    expect(r.amountCents).toBe(995) // 5% of 19900
  })

  it('an OVERRIDDEN clinic is unaffected by a default change', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1', percentBps: 2000, termMonths: null, startedAt: new Date() }]] // 20% override
    state.limitRows.referralPartner = [[{ status: 'active', defaultPercentBps: 500, defaultTermMonths: null }]] // default moved to 5%
    const r = await accrueCommissionForInvoice(base)
    expect(r.amountCents).toBe(3980) // 20% of 19900 — the override holds
    expect(state.inserts[0].values.percentBps).toBe(2000)
  })

  it('archived partner → accrual no-ops (closed account stops earning)', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1', percentBps: null, termMonths: null, startedAt: new Date() }]]
    state.limitRows.referralPartner = [[{ status: 'archived', defaultPercentBps: 1000, defaultTermMonths: null }]]
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(false)
    expect(r.reason).toBe('archived')
    expect(state.inserts).toHaveLength(0)
  })

  it('suspended partner → accrual no-ops (verified)', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1', percentBps: null, termMonths: null, startedAt: new Date() }]]
    state.limitRows.referralPartner = [[{ status: 'suspended', defaultPercentBps: 1000, defaultTermMonths: null }]]
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(false)
    expect(r.reason).toBe('suspended')
  })
})

// ── updateClinicReferralTerms — NULL-collapse ───────────────────────────────

describe('updateClinicReferralTerms — equal-to-default collapses to NULL', () => {
  it('a value EQUAL to the partner default persists NULL (use-default)', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1' }]]
    state.limitRows.referralPartner = [[{ defaultPercentBps: 1000, defaultTermMonths: 12 }]]
    await updateClinicReferralTerms('org1', 1000, 12) // both == default
    const upd = state.updates.find((u) => u.table === 'clinicProfile')!
    expect(upd.set.referralPercentBps).toBeNull()
    expect(upd.set.referralTermMonths).toBeNull()
  })

  it('a value DIFFERING from the default persists as a real override', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1' }]]
    state.limitRows.referralPartner = [[{ defaultPercentBps: 1000, defaultTermMonths: 12 }]]
    await updateClinicReferralTerms('org1', 1750, 6)
    const upd = state.updates.find((u) => u.table === 'clinicProfile')!
    expect(upd.set.referralPercentBps).toBe(1750)
    expect(upd.set.referralTermMonths).toBe(6)
  })

  it('NULL inputs stay NULL (clearing an override → back to default)', async () => {
    state.limitRows.clinicProfile = [[{ partnerId: 'p1' }]]
    state.limitRows.referralPartner = [[{ defaultPercentBps: 1000, defaultTermMonths: 12 }]]
    await updateClinicReferralTerms('org1', null, null)
    const upd = state.updates.find((u) => u.table === 'clinicProfile')!
    expect(upd.set.referralPercentBps).toBeNull()
    expect(upd.set.referralTermMonths).toBeNull()
  })
})

// ── getPartnerLifecycleInfo + delete disposition ────────────────────────────

describe('getPartnerLifecycleInfo — delete disposition', () => {
  it('no commission + no payouts → clean (hard delete)', async () => {
    state.scalarRows.referralCommission = [[{ n: 0 }], [{ total: 0 }]] // count, then accrued-sum
    state.scalarRows.referralPayout = [[{ n: 0 }]]
    const info = await getPartnerLifecycleInfo('p1')
    expect(info).toMatchObject({ hasMoneyHistory: false, accruedCents: 0, disposition: 'clean' })
  })

  it('money history + zero balance → archive', async () => {
    state.scalarRows.referralCommission = [[{ n: 3 }], [{ total: 0 }]]
    state.scalarRows.referralPayout = [[{ n: 1 }]]
    const info = await getPartnerLifecycleInfo('p1')
    expect(info.disposition).toBe('archive')
    expect(info.hasMoneyHistory).toBe(true)
  })

  it('money history + outstanding balance → resolve', async () => {
    state.scalarRows.referralCommission = [[{ n: 2 }], [{ total: 4000 }]]
    state.scalarRows.referralPayout = [[{ n: 0 }]]
    const info = await getPartnerLifecycleInfo('p1')
    expect(info.disposition).toBe('resolve')
    expect(info.accruedCents).toBe(4000)
  })
})

// ── deletePartner ───────────────────────────────────────────────────────────

describe('deletePartner — hard delete only with no money history', () => {
  it('hard-deletes when there is no commission/payout history', async () => {
    state.scalarRows.referralCommission = [[{ n: 0 }], [{ total: 0 }]]
    state.scalarRows.referralPayout = [[{ n: 0 }]]
    const r = await deletePartner('p1')
    expect(r.outcome).toBe('deleted')
    expect(state.deletes.some((d) => d.table === 'referralPartner')).toBe(true)
    // (Clinic attributions are nulled by the FK ON DELETE set null — verified by
    // migration 0059's constraint, not an app-side UPDATE.)
  })

  it('REFUSES (no delete) when money history exists', async () => {
    state.scalarRows.referralCommission = [[{ n: 5 }], [{ total: 0 }]]
    state.scalarRows.referralPayout = [[{ n: 0 }]]
    const r = await deletePartner('p1')
    expect(r.outcome).toBe('refused')
    expect(r.reason).toBe('has_history')
    expect(state.deletes).toHaveLength(0) // nothing deleted — audit trail safe
  })
})

// ── archivePartner ──────────────────────────────────────────────────────────

describe('archivePartner — balance must be resolved first', () => {
  it('refuses when there is an outstanding balance and no resolve choice', async () => {
    state.scalarRows.referralCommission = [[{ n: 2 }], [{ total: 4000 }]]
    state.scalarRows.referralPayout = [[{ n: 0 }]]
    const r = await archivePartner('p1', { initiatedBy: 'admin' })
    expect(r.outcome).toBe('refused')
    expect(r.reason).toBe('outstanding_balance')
    expect(r.accruedCents).toBe(4000)
    expect(state.updates.some((u) => u.table === 'referralPartner' && u.set.status === 'archived')).toBe(false)
  })

  it('pay-then-archive: runs the payout, then archives', async () => {
    state.scalarRows.referralCommission = [[{ n: 2 }], [{ total: 4000 }]]
    state.scalarRows.referralPayout = [[{ n: 0 }]]
    const r = await archivePartner('p1', { resolve: 'pay', initiatedBy: 'admin' })
    expect(mockPayoutPartner).toHaveBeenCalledWith('p1', { initiatedBy: 'admin' })
    expect(r.outcome).toBe('archived')
    expect(state.updates.some((u) => u.table === 'referralPartner' && u.set.status === 'archived')).toBe(true)
  })

  it('pay-then-archive: a FAILED payout does NOT archive (no silent loss)', async () => {
    state.scalarRows.referralCommission = [[{ n: 2 }], [{ total: 4000 }]]
    state.scalarRows.referralPayout = [[{ n: 0 }]]
    mockPayoutPartner.mockResolvedValue({ ok: false, error: 'no payout method' })
    const r = await archivePartner('p1', { resolve: 'pay', initiatedBy: 'admin' })
    expect(r.outcome).toBe('refused')
    expect(state.updates.some((u) => u.set.status === 'archived')).toBe(false)
  })

  it('void-then-archive: flips accrued rows to reversed, then archives', async () => {
    state.scalarRows.referralCommission = [[{ n: 2 }], [{ total: 4000 }]] // lifecycle info
    // voidAccruedCommission re-reads the accrued rows (a list select)
    state.scalarRows.referralCommission.push([{ amountCents: 4000 }])
    const r = await archivePartner('p1', { resolve: 'void', initiatedBy: 'admin' })
    expect(r.outcome).toBe('archived')
    // a commission UPDATE set status='reversed'
    expect(state.updates.some((u) => u.table === 'referralCommission' && u.set.status === 'reversed')).toBe(true)
    expect(state.updates.some((u) => u.table === 'referralPartner' && u.set.status === 'archived')).toBe(true)
    expect(mockPayoutPartner).not.toHaveBeenCalled()
  })

  it('archives directly when there is money history but no balance', async () => {
    state.scalarRows.referralCommission = [[{ n: 3 }], [{ total: 0 }]]
    state.scalarRows.referralPayout = [[{ n: 1 }]]
    const r = await archivePartner('p1', { initiatedBy: 'admin' })
    expect(r.outcome).toBe('archived')
    expect(state.updates.some((u) => u.set.status === 'archived')).toBe(true)
  })
})

describe('voidAccruedCommission', () => {
  it('flips accrued → reversed and returns the cents voided', async () => {
    state.scalarRows.referralCommission = [[{ amountCents: 1990 }, { amountCents: 1990 }]]
    const r = await voidAccruedCommission('p1', 'test void')
    expect(r.voidedCents).toBe(3980)
    expect(state.updates.some((u) => u.table === 'referralCommission' && u.set.status === 'reversed')).toBe(true)
  })

  it('no accrued rows → nothing voided, no update', async () => {
    state.scalarRows.referralCommission = [[]]
    const r = await voidAccruedCommission('p1', 'noop')
    expect(r.voidedCents).toBe(0)
    expect(state.updates.some((u) => u.table === 'referralCommission' && u.set.status === 'reversed')).toBe(false)
  })
})

// ── reactivatePartner ───────────────────────────────────────────────────────

describe('reactivatePartner', () => {
  it('reactivates an archived partner when the email is free', async () => {
    // FIFO: 1st .limit(1) = the partner row; 2nd .limit(1) = the conflict check.
    state.limitRows.referralPartner = [
      [{ id: 'p1', email: 'a@x.com', status: 'archived' }], // the partner
      [], // no live conflict on the email
    ]
    const r = await reactivatePartner('p1')
    expect(r.outcome).toBe('reactivated')
    expect(state.updates.some((u) => u.table === 'referralPartner' && u.set.status === 'active')).toBe(true)
  })

  it('refuses when a live partner now holds the same email', async () => {
    state.limitRows.referralPartner = [
      [{ id: 'p1', email: 'a@x.com', status: 'archived' }], // the partner
      [{ id: 'p2' }], // a live partner has this email (conflict)
    ]
    const r = await reactivatePartner('p1')
    expect(r.outcome).toBe('refused')
    expect(r.reason).toBe('email_taken')
    expect(state.updates.some((u) => u.set.status === 'active')).toBe(false)
  })

  it('refuses when the partner is not archived', async () => {
    state.limitRows.referralPartner = [[{ id: 'p1', email: 'a@x.com', status: 'active' }]]
    const r = await reactivatePartner('p1')
    expect(r.outcome).toBe('refused')
    expect(r.reason).toBe('not_archived')
  })
})

// ── createPartner email reuse vs archived ───────────────────────────────────

describe('createPartner — email reuse rules', () => {
  it('succeeds with an email freed by a hard delete (no existing row)', async () => {
    state.limitRows.referralPartner = [[]] // no dupe — the deleted partner's row is gone
    const r = await createPartner({ name: 'New', email: 'reuse@x.com', defaultPercentBps: 1000 })
    expect(r.email).toBe('reuse@x.com')
    expect(state.inserts.some((i) => i.table === 'referralPartner')).toBe(true)
  })

  it('gives a specific error when the email belongs to an ARCHIVED partner', async () => {
    state.limitRows.referralPartner = [[{ id: 'old', status: 'archived' }]]
    await expect(
      createPartner({ name: 'X', email: 'archived@x.com', defaultPercentBps: 1000 }),
    ).rejects.toThrow(/archived partner/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('gives the generic error for a live duplicate', async () => {
    state.limitRows.referralPartner = [[{ id: 'live', status: 'active' }]]
    await expect(
      createPartner({ name: 'X', email: 'live@x.com', defaultPercentBps: 1000 }),
    ).rejects.toThrow(/already exists/i)
  })
})

// ── Backfill UPDATE logic (migration 0061) — simulated ──────────────────────

describe('backfill 0061 — collapse copied-default overrides to NULL', () => {
  // The migration is two UPDATE ... FROM statements. We simulate the predicate
  // here against in-memory rows so the rule is regression-locked even though the
  // SQL runs in Postgres on deploy.
  type Clinic = { orgId: string; partnerId: string | null; percent: number | null; term: number | null }
  type Partner = { id: string; defaultPercent: number; defaultTerm: number | null }

  function applyBackfill(clinics: Clinic[], partners: Partner[]): Clinic[] {
    const byId = new Map(partners.map((p) => [p.id, p]))
    return clinics.map((c) => {
      const p = c.partnerId ? byId.get(c.partnerId) : undefined
      if (!p) return c
      const next = { ...c }
      if (next.percent !== null && next.percent === p.defaultPercent) next.percent = null
      if (next.term !== null && next.term === p.defaultTerm) next.term = null
      return next
    })
  }

  it('NULLs a percent that equals the partner default; keeps a differing one', () => {
    const partners: Partner[] = [{ id: 'p1', defaultPercent: 1000, defaultTerm: null }]
    const out = applyBackfill(
      [
        { orgId: 'a', partnerId: 'p1', percent: 1000, term: null }, // copied default → NULL
        { orgId: 'b', partnerId: 'p1', percent: 1500, term: null }, // real override → kept
        { orgId: 'c', partnerId: 'p1', percent: null, term: null }, // already NULL → stays
      ],
      partners,
    )
    expect(out[0].percent).toBeNull()
    expect(out[1].percent).toBe(1500)
    expect(out[2].percent).toBeNull()
  })

  it('NULLs a term that equals the partner default term', () => {
    const partners: Partner[] = [{ id: 'p1', defaultPercent: 1000, defaultTerm: 12 }]
    const out = applyBackfill(
      [
        { orgId: 'a', partnerId: 'p1', percent: null, term: 12 }, // == default term → NULL
        { orgId: 'b', partnerId: 'p1', percent: null, term: 6 }, // differs → kept
      ],
      partners,
    )
    expect(out[0].term).toBeNull()
    expect(out[1].term).toBe(6)
  })

  it('leaves clinics with no partner untouched', () => {
    const out = applyBackfill([{ orgId: 'a', partnerId: null, percent: 1000, term: 12 }], [])
    expect(out[0].percent).toBe(1000)
    expect(out[0].term).toBe(12)
  })
})
