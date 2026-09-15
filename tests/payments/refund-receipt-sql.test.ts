import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as realSchema from '@/lib/db/schema'

/**
 * THE REFUND RECEIPT'S UPSERT, RENDERED FOR REAL.
 *
 * `recordRefundReceipt` writes raw SQL into an `ON CONFLICT DO UPDATE` on a
 * uniquely-indexed table — which is precisely the shape the Phase-3 audit made
 * a rule about: the database is modelled in JavaScript in this suite, so a
 * sibling test that mocks `drizzle-orm` asserts the RESULT and is completely
 * blind to how Postgres will parse the statement. That is how a statement went
 * out that failed with 42P18 on every write.
 *
 * So this file builds the REAL drizzle query pipeline over a client that only
 * records, and pins the properties that make this statement both correct and
 * parseable. No database required.
 *
 * Load-bearing and asserted below:
 *
 *  · the conflict target is the (org, payment intent) unique index — the claim
 *    key that makes a redelivered webhook update its own row rather than mint
 *    a second receipt for the same charge;
 *  · both amounts go through `greatest`, so an out-of-order delivery cannot
 *    walk a receipt backwards;
 *  · `attached_to` only ever moves UP, never from a real attachment back to
 *    'none' (the finalizer can stamp the PaymentIntent between two
 *    deliveries);
 *  · `refunded_at` is NOT in the update set, so the receipt keeps its first
 *    sighting instead of restamping on every redelivery;
 *  · every bound value is a plain parameter — nothing interpolated into a
 *    variadic-`any` function, which is what 42P18 actually means.
 *
 * The statement is rendered from the SERVICE, never hand-copied here. A test
 * that rewrites the statement proves only that the test's copy parses.
 */

const captured: Array<{ text: string; values?: unknown[] }> = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  // A client that answers every read with no rows and records every write.
  const client = {
    query: async (q: { text: string; values?: unknown[] }) => {
      captured.push(q)
      return { rows: [] }
    },
  }
  return { schema, db: drizzle(client as never) }
})
vi.mock('@/lib/services/loyalty', () => ({
  reverseLoyaltyForRefundedPayment: vi.fn(async () => false),
}))

import { recordConnectRefund } from '@/lib/services/refunds'

/** The one INSERT among the statements the call produced. */
function receiptStatement(): string {
  const insert = captured.find((q) => /insert into "connect_refund"/i.test(q.text))
  expect(insert, 'recordConnectRefund wrote no receipt at all').toBeDefined()
  return insert!.text
}

beforeEach(() => {
  captured.length = 0
})

describe('the connect_refund receipt, as Postgres will receive it', () => {
  beforeEach(async () => {
    // No money record of ours owns this charge — the membership case, and the
    // one that made this table necessary.
    await recordConnectRefund({
      organizationId: 'org_a',
      paymentIntentId: 'pi_123',
      amountRefundedCents: 5_000,
      chargeAmountCents: 5_000,
    })
  })

  it('claims on the (org, payment intent) unique index', () => {
    const text = receiptStatement()
    expect(text).toContain('on conflict ("organization_id","stripe_payment_intent_id") do update set')
  })

  it('raises both amounts rather than overwriting them', () => {
    const text = receiptStatement()
    expect(text).toContain(
      '"refunded_amount_cents" = greatest("connect_refund"."refunded_amount_cents", excluded.refunded_amount_cents)',
    )
    expect(text).toContain(
      '"charge_amount_cents" = greatest("connect_refund"."charge_amount_cents", excluded.charge_amount_cents)',
    )
  })

  it('never downgrades an attachment a later delivery could not make', () => {
    expect(receiptStatement()).toContain(
      `"attached_to" = case when excluded.attached_to = 'none' then "connect_refund"."attached_to" else excluded.attached_to end`,
    )
  })

  it('keeps the FIRST sighting — refunded_at is not restamped on redelivery', () => {
    const setClause = receiptStatement().split('do update set')[1]
    expect(setClause).toBeDefined()
    expect(setClause).not.toContain('"refunded_at"')
    // ...while the INSERT half still supplies it for a brand-new receipt.
    expect(receiptStatement().split('do update set')[0]).toContain('"refunded_at"')
  })

  it('binds every value as a plain parameter — no untyped interpolation', () => {
    // 42P18 ("could not determine data type of parameter") is what happens when
    // a bound parameter lands inside a variadic-`any` function. Every `$n` here
    // must sit in a value list or a simple assignment, never inside greatest().
    const text = receiptStatement()
    expect(text).toMatch(/values \((\$\d+, )*\$\d+\)/)
    // Slice the two SQL expressions out and check inside them, rather than
    // trusting a regex to stop at the right place — `[^)]*` happily runs past
    // `end` and into the next assignment.
    const greatests = Array.from(text.matchAll(/greatest\([^)]*\)/g)).map((m) => m[0])
    expect(greatests.length, 'both amounts should be monotonic').toBe(2)
    for (const g of greatests) expect(g).not.toMatch(/\$\d+/)
    const caseExpr = text.slice(text.indexOf('case when'), text.indexOf(' end,'))
    expect(caseExpr).toContain('excluded.attached_to')
    expect(caseExpr).not.toMatch(/\$\d+/)
  })

  it('the table name is the real one, so a rename cannot leave this passing', () => {
    expect(realSchema.connectRefund).toBeDefined()
    expect(receiptStatement()).toContain('insert into "connect_refund"')
  })
})
