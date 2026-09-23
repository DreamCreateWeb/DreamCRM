import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
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
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE SECOND HALF IS THE `WHERE`, AND IT IS RENDERED THROUGH THE REAL DIALECT.
 *
 * The self-heal below issues an `UPDATE` against two MONEY tables, and its
 * entire safety argument is a three-way scope: the demo partner's id, this
 * org, and this org's three deterministic `demo_inv_` ids. Found by Sentinel
 * reviewing #711 — the first version of this file mocked the update chain as
 * `where: async () => …`, taking no argument, so every assertion read `set`
 * and only `set`. **Deleting the org scope, the invoice-id scope and the `ne`
 * left all five tests green**, which is a blind `UPDATE ... SET amountCents`
 * over every commission row in the database with nothing in the repo to say
 * so. That is §2d part 1 exactly: a test that mocks `@/lib/db` physically
 * cannot see a wrong `WHERE`, so when the defect is PREDICATE-shaped the query
 * gets rendered through drizzle's own `PgDialect`.
 *
 * THE BOUNDARY, stated rather than discovered (§2d part 2): **this proves the
 * SQL we RENDER, not the rows Postgres RETURNS.** It cannot tell you an index
 * is used, that a column means what its name says, or that those three ids
 * exist. What it can tell you — and what nothing else here could — is that a
 * clause the safety argument names is still in the statement.
 *
 * Assertions are on the CLAUSE, never on a golden SQL string (§2d part 3): the
 * params are inlined back into the rendered text so a failure reads like SQL,
 * and a harmless reordering of `and()` arguments reddens nothing.
 * ──────────────────────────────────────────────────────────────────────────
 */

interface InsertCall {
  table: string
  values: Record<string, unknown>
}
interface UpdateCall {
  table: string
  set: Record<string, unknown>
  /** The `WHERE` expression, UNRENDERED — the thing the first version of this
   *  file threw away, and the entire safety argument for both heals. */
  where: unknown
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
          // `where` TAKES ITS ARGUMENT. The first version of this mock was
          // `where: async () => …`, which discarded the predicate — and a
          // discarded predicate is an ungraded one (Sentinel, #711).
          where: async (pred: unknown) => {
            state.updates.push({ table: tableName(t), set, where: pred })
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

const dialect = new PgDialect()

/** SQL-ish literal for a bound param, so a failure message reads like a query. */
const lit = (v: unknown): string => (typeof v === 'string' ? `'${v}'` : String(v))

/**
 * Render a captured `WHERE` through the REAL dialect and inline its params.
 *
 * Inlining rather than asserting on `(sql, params)` separately is what makes
 * these CLAUSE assertions: `"organization_id" = 'org_demo'` is one string to
 * look for, and it cannot be satisfied by the right value bound to the wrong
 * column — which a bare `params` check can.
 */
const inlineWhere = (where: unknown): string => {
  const q = dialect.sqlToQuery(where as never)
  return q.sql.replace(/\$(\d+)/g, (_m, n: string) => lit(q.params[Number(n) - 1]))
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

    /**
     * THE SCOPE ITSELF, GRADED. The file header says why this is rendered
     * rather than inspected, and what it deliberately cannot see.
     */
    describe('the WHERE that makes it safe', () => {
      const heal = async (table: string) => {
        stageReads({ payoutExists: true })
        await seedDemoReferralPartner('org_demo')
        const u = state.updates.find((x) => x.table === table)
        expect(u, `the seeder issued no UPDATE against ${table}`).toBeDefined()
        return { where: inlineWhere(u!.where), set: u!.set, raw: u!.where }
      }

      it('confines the commission heal to the demo partner, this org, and three known invoice ids', async () => {
        const { where } = await heal('referral_commission')

        // Each clause names the COLUMN as well as the value — a param on its
        // own would be satisfied by the right value against the wrong column.
        expect(where, 'the demo partner scope is gone').toContain(
          `"referral_commission"."partner_id" = 'rp_demo'`,
        )
        expect(where, 'THE TENANT SCOPE IS GONE — this would reach every org').toContain(
          `"referral_commission"."organization_id" = 'org_demo'`,
        )
        for (const n of [1, 2, 3]) {
          expect(where, `demo invoice id ${n} is no longer named`).toContain(
            `'demo_inv_org_demo_${n}'`,
          )
        }
        expect(where, 'the invoice-id scope is no longer an IN list').toMatch(
          /"stripe_invoice_id" in \(/,
        )
      })

      it('gates on EVERY column it writes, so a correct demo is a no-op in every direction', async () => {
        const { where, set } = await heal('referral_commission')

        // Sentinel's note on #711: gating on `invoiceTotalCents` alone left a
        // demo whose total was already right but whose commission or rate had
        // drifted unable to heal, while the comment claimed a correct demo is
        // a no-op. The set and the gate are one list now, asserted both ways.
        const columns: Record<string, string> = {
          invoiceTotalCents: 'invoice_total_cents',
          percentBps: 'percent_bps',
          amountCents: 'amount_cents',
        }
        expect(Object.keys(set).sort()).toEqual(Object.keys(columns).sort())
        for (const [field, column] of Object.entries(columns)) {
          expect(
            where,
            `the heal SETs ${field} but does not gate on it — a demo that drifted ` +
              'only there can never heal, and every correct demo takes a pointless write',
          ).toContain(`"referral_commission"."${column}" <> ${String(set[field])}`)
        }
      })

      it('confines the payout heal to the one row it read', async () => {
        const { where, set } = await heal('referral_payout')
        expect(where).toContain(`"referral_payout"."id" = 42`)
        expect(where, 'the partner scope is gone').toContain(
          `"referral_payout"."partner_id" = 'rp_demo'`,
        )
        expect(where).toContain(`"referral_payout"."amount_cents" <> ${String(set.amountCents)}`)
      })

      it('gates on every column the PAYOUT heal writes too — the same asymmetry, one table over', async () => {
        // Sentinel, #711: the commission heal got its set/gate correspondence
        // asserted in both directions and the payout heal did not. The test
        // above checks the `amount_cents` gate is PRESENT; nothing checked that
        // `amount_cents` is the only thing the `SET` writes, so a fourth column
        // added to the payout `SET` would have landed ungated — exactly the
        // hole that had just been closed on `referral_commission`.
        const { where, set } = await heal('referral_payout')
        const columns: Record<string, string> = { amountCents: 'amount_cents' }
        expect(Object.keys(set).sort()).toEqual(Object.keys(columns).sort())
        for (const [field, column] of Object.entries(columns)) {
          expect(
            where,
            `the payout heal SETs ${field} but does not gate on it — an already-correct ` +
              'payout takes a write, and a drifted one can heal on a column nobody is watching',
          ).toContain(`"referral_payout"."${column}" <> ${String(set[field])}`)
        }
      })

      it('binds exactly the values the scope is made of — nothing added, nothing dropped', async () => {
        // The counterpart to the clause checks above: those prove a named
        // clause is PRESENT, this proves no clause was swapped for something
        // else that happens to mention the same column.
        //
        // SORTED ON BOTH SIDES, and that is the fix rather than a style choice
        // (Sentinel, #711). The first version asserted `toEqual([...])` on
        // eight POSITIONAL params while this file's header promised "a harmless
        // reordering of `and()` arguments reddens nothing". Reorder the
        // predicate innocently and it went red saying "nothing added, nothing
        // dropped" — the one thing that would not have happened. Sorting keeps
        // the swap-detection, which is a question about the MULTISET of bound
        // values, and drops the false alarm; clause ORDER is already graded by
        // the `toContain` assertions above, where it belongs.
        const plan = getQuotedPlan()
        const commission = await heal('referral_commission')
        const bound = dialect.sqlToQuery(commission.raw as never).params
        const expected = [
          'rp_demo',
          'org_demo',
          'demo_inv_org_demo_1',
          'demo_inv_org_demo_2',
          'demo_inv_org_demo_3',
          plan.price * 100,
          DEMO_PERCENT_BPS,
          Math.floor((plan.price * 100 * DEMO_PERCENT_BPS) / 10000),
        ]
        const key = (xs: unknown[]) => xs.map((x) => `${typeof x}:${String(x)}`).sort()
        // Length first: it is the assertion that catches a DROPPED clause, and
        // it fails with a number rather than a diff of eight values.
        expect(bound).toHaveLength(expected.length)
        expect(key(bound)).toEqual(key(expected))
      })

      /**
       * COMPOSITION SAFETY — the note that defends a property rather than
       * tidying one (Sentinel, #711).
       *
       * The commission heal's gate is an `or(...)` nested inside an `and(...)`,
       * and **every other assertion in this file is identical whether that OR
       * is wrapped or not** — the `toContain` strings are all still present and
       * the bound-parameter multiset is unchanged. The safety of the sharpest
       * predicate in the PR was resting on a drizzle property this file neither
       * stated nor checked.
       *
       * `tests/journey/work-law-sql.test.ts:118-152` is the written precedent
       * and the reason it is not hypothetical: drizzle's `and()` wraps the whole
       * list in ONE pair of parens and never parenthesizes the chunks, so an
       * unwrapped fragment escapes its own AND. Unwrapped, this heal reads
       * `(partner AND org AND in AND total<>A) OR percent<>B OR amount<>C` — an
       * UPDATE rewriting three money columns on every commission row in the
       * database, for every partner, in every tenant. It renders as valid SQL.
       *
       * The property is inherited from a library, so it is asserted rather than
       * assumed; the day `or()` stops wrapping itself, this goes red here
       * instead of going quiet in production.
       */
      it('keeps the OR inside the AND chain — a top-level OR would reach every tenant', async () => {
        const { where } = await heal('referral_commission')

        // The premise: there IS an OR to be wrong about. Without this the scan
        // below passes vacuously the moment the disjunction is refactored away.
        expect(where, 'no OR in the predicate — this scan is grading nothing').toContain(' or ')

        // Every ` or ` must sit deeper than the AND chain's own paren level.
        let depth = 0
        for (let i = 0; i < where.length; i++) {
          if (where[i] === '(') depth++
          else if (where[i] === ')') depth--
          else if (where.startsWith(' or ', i) && depth <= 1) {
            throw new Error(
              `TOP-LEVEL OR ESCAPES THE AND CHAIN — the tenant and invoice-id scopes stop ` +
                `applying and this UPDATE reaches every commission row in every org:\n${where}`,
            )
          }
        }
      })
    })
  })
})
