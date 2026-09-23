import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getQuotedPlan } from '@/lib/stripe-config'
import { formatBps } from '@/lib/types/referrals'

/**
 * THE DEMO PARTNER IS PAID OUT OF THE PLAN WE ACTUALLY SELL (DREAMCRM-122).
 *
 * `lib/services/demo-clinic/seed-partners.ts` seeded its three commission rows
 * off `const invoiceCents = 50000` — the struck-through $500 LIST price for a
 * plan that costs $200 — so the demo showed **$50 per practice per month**
 * while `/partner-program` published **$20**, computed from `getQuotedPlan()`
 * at the same 10% rate. Both surfaces are public and a prospect can have them
 * open at once.
 *
 * These assertions are BEHAVIOURAL rather than a source scan: they drive the
 * seeder and read what it would write. A source scan would have gone green the
 * moment somebody wrote `50000` a different way, and the rule that DOES grade
 * the spelling (`tests/marketing/pricing-price-source.test.tsx`, the cents
 * spelling) grades the tree rather than this arithmetic.
 */

interface InsertCall {
  table: string
  values: Record<string, unknown>
}
interface UpdateCall {
  table: string
  set: Record<string, unknown>
}

const state: {
  selectQueue: unknown[][]
  inserts: InsertCall[]
  updates: UpdateCall[]
} = { selectQueue: [], inserts: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const tableName = (t: unknown) => {
    if (t === schema.referralPartner) return 'referral_partner'
    if (t === schema.referralCommission) return 'referral_commission'
    if (t === schema.referralPayout) return 'referral_payout'
    if (t === schema.clinicProfile) return 'clinic_profile'
    if (t === schema.patient) return 'patient'
    return 'unknown'
  }
  const chain = (): any => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: (vals: Record<string, unknown>) => {
          state.inserts.push({ table: tableName(t), values: vals })
          return {
            returning: async () => [{ id: 77, ...vals }],
            onConflictDoNothing: () => ({ then: (r: (v: unknown) => void) => r(undefined) }),
            then: (r: (v: unknown) => void) => r(undefined),
          }
        },
      }),
      update: (t: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: tableName(t), set })
          },
        }),
      }),
    },
    schema,
  }
})

// `vi.mock` above is hoisted, so a static import here still gets the mock.
import { seedDemoReferralPartner } from '@/lib/services/demo-clinic/seed-partners'

/** The demo's published rate, declared in the seeder and on `/partner-program`. */
const DEMO_PERCENT_BPS = 1000

/**
 * Stage the four `.limit()` reads `seedDemoReferralPartner` makes before it
 * writes: a patient (so it does not bail on a half-seeded org), the partner,
 * the clinic profile, and the payout row.
 */
function stageReads({ payoutExists = false }: { payoutExists?: boolean } = {}) {
  state.selectQueue.push([{ id: 'pat_1' }])
  state.selectQueue.push([{ id: 'rp_demo' }])
  state.selectQueue.push([{ referralPartnerId: 'rp_demo', referralPercentBps: null }])
  state.selectQueue.push(payoutExists ? [{ id: 42 }] : [])
}

const commissions = () => state.inserts.filter((c) => c.table === 'referral_commission')

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.updates.length = 0
})

describe('the demo partner’s commissions resolve the plan price', () => {
  it('invoices the referred clinic at the QUOTED plan, in cents', async () => {
    stageReads()
    await seedDemoReferralPartner('org_demo')

    const plan = getQuotedPlan()
    expect(commissions()).toHaveLength(3)
    for (const row of commissions()) {
      expect(
        row.values.invoiceTotalCents,
        'The demo invoice is the subscription a referred clinic actually pays. A literal here ' +
          'agrees with the config on the day it is typed and drifts at the next reprice — which ' +
          'is exactly what DREAMCRM-122 found, at the LIST price.',
      ).toBe(plan.price * 100)
      expect(row.values.percentBps).toBe(DEMO_PERCENT_BPS)
    }
  })

  it('pays the same per-practice figure `/partner-program` publishes', async () => {
    stageReads()
    await seedDemoReferralPartner('org_demo')

    // The page computes `Math.floor((PLAN.price * STANDARD_RATE_BPS) / 10000)`
    // in DOLLARS from `getQuotedPlan()`; the seeder does it in CENTS. This is
    // the claim a prospect can check with two tabs open.
    const published = Math.floor((getQuotedPlan().price * DEMO_PERCENT_BPS) / 10000)
    expect(published).toBe(20)
    expect(formatBps(DEMO_PERCENT_BPS)).toBe('10%')
    for (const row of commissions()) {
      expect(row.values.amountCents).toBe(published * 100)
    }
  })

  it('pays the payout row the same amount as the commission it covers', async () => {
    stageReads()
    await seedDemoReferralPartner('org_demo')

    const payout = state.inserts.find((c) => c.table === 'referral_payout')
    expect(payout?.values.amountCents).toBe(commissions()[0]!.values.amountCents)
  })

  /**
   * The rows upsert by their deterministic `demo_inv_` ids under
   * `onConflictDoNothing`, so without this a demo org seeded before the fix
   * would quote $50 forever — and the showcase is the one place somebody reads
   * this number beside the marketing page.
   */
  describe('the self-heal for a demo seeded before the fix', () => {
    it('re-points an existing commission row at the resolved plan', async () => {
      stageReads({ payoutExists: true })
      await seedDemoReferralPartner('org_demo')

      const plan = getQuotedPlan()
      const healed = state.updates.find((u) => u.table === 'referral_commission')
      expect(healed?.set).toMatchObject({
        invoiceTotalCents: plan.price * 100,
        amountCents: Math.floor((plan.price * 100 * DEMO_PERCENT_BPS) / 10000),
      })
    })

    it('moves the payout with it, so the partner detail page adds up', async () => {
      stageReads({ payoutExists: true })
      await seedDemoReferralPartner('org_demo')

      const payout = state.updates.find((u) => u.table === 'referral_payout')
      expect(payout?.set).toMatchObject({
        amountCents: Math.floor((getQuotedPlan().price * 100 * DEMO_PERCENT_BPS) / 10000),
      })
    })
  })
})
