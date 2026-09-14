import { describe, it, expect } from 'vitest'
import {
  netCollectedCents,
  collectedCents,
  isCollectedStatus,
  netCollectedSql,
  sumNetCollectedSql,
  keptFractionSql,
} from '@/lib/net-collected'

/**
 * THE NETTING RULE itself — the part that can be wrong, kept out of every
 * query so it can be tested on its own (the `planRefundWrite` pattern).
 *
 * The SQL builders are asserted on the fragment they assemble, not on a live
 * database: what matters here is that the subtraction, the zero clamp and the
 * bigint cast are all present. The readers that USE them are covered by their
 * own tests, and `tests/guards/net-refunds.test.ts` is what stops a new
 * reader skipping the rule entirely.
 */

/** Flatten a drizzle SQL fragment — nested fragments and all — into text. */
function sqlText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(sqlText).join('')
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (Array.isArray(o.queryChunks)) return sqlText(o.queryChunks)
    if (typeof o.value === 'string') return o.value
    if (Array.isArray(o.value)) return sqlText(o.value)
    if (typeof o.name === 'string') return String(o.name)
  }
  return ''
}

describe('netCollectedCents', () => {
  it('subtracts what came back', () => {
    expect(netCollectedCents(10_000, 0)).toBe(10_000)
    expect(netCollectedCents(10_000, 2_500)).toBe(7_500)
    expect(netCollectedCents(10_000, 10_000)).toBe(0)
  })

  it('treats missing values as no money / nothing refunded, never NaN', () => {
    expect(netCollectedCents(10_000, null)).toBe(10_000)
    expect(netCollectedCents(10_000, undefined)).toBe(10_000)
    expect(netCollectedCents(null, 500)).toBe(0)
    expect(netCollectedCents(undefined, undefined)).toBe(0)
  })

  it('clamps at zero — one bad row cannot pull a whole month negative', () => {
    // Stripe cannot send back more than it took, and `refunded_amount_cents`
    // is monotonic by construction, so this is defence rather than a case we
    // expect. A total that CAN go negative is the problem.
    expect(netCollectedCents(10_000, 12_000)).toBe(0)
    expect(netCollectedCents(10_000, -500)).toBe(10_000)
  })
})

describe('isCollectedStatus / collectedCents', () => {
  it('counts only charges that landed', () => {
    // 'refunded' exists in shop_order's vocabulary only; balance payments and
    // deposits stay 'paid' after a refund on purpose.
    expect(isCollectedStatus('paid')).toBe(true)
    expect(isCollectedStatus('refunded')).toBe(true)
    expect(isCollectedStatus('pending')).toBe(false)
    expect(isCollectedStatus('failed')).toBe(false)
    expect(isCollectedStatus('cancelled')).toBe(false)
    expect(isCollectedStatus(null)).toBe(false)
  })

  it('nets a landed charge and zeroes one that never arrived', () => {
    expect(collectedCents('paid', 10_000, 2_500)).toBe(7_500)
    // A fully refunded shop order: the money landed, then all of it went back.
    expect(collectedCents('refunded', 10_000, 10_000)).toBe(0)
    // A pending order's face value is not money the clinic has.
    expect(collectedCents('pending', 10_000, 0)).toBe(0)
    expect(collectedCents('cancelled', 10_000, 0)).toBe(0)
  })
})

describe('the SQL builders carry the same rule', () => {
  const amount = { name: 'amount_cents' } as never
  const refunded = { name: 'refunded_amount_cents' } as never

  it('nets a single row and clamps it at zero', () => {
    const text = sqlText(netCollectedSql(amount, refunded))
    expect(text).toContain('greatest(')
    expect(text).toContain('- coalesce(')
    expect(text).toContain(', 0)')
  })

  it('sums as bigint — an int4 cast would ERROR above ~$21M, not wrap', () => {
    const text = sqlText(sumNetCollectedSql(amount, refunded))
    expect(text).toContain('sum(')
    expect(text).toContain('greatest(')
    expect(text).toContain('::bigint')
    expect(text).not.toContain('::int`')
  })

  it('bounds the kept fraction to [0, 1] and never divides by zero', () => {
    const text = sqlText(keptFractionSql(amount, refunded))
    expect(text).toContain('least(1')
    expect(text).toContain('greatest(0')
    expect(text).toContain('nullif(')
  })
})
