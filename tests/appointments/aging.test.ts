import { describe, it, expect } from 'vitest'
import { computeAging } from '@/lib/services/appointments'

const HOUR = 60 * 60 * 1000

describe('computeAging — left-border tint on unconfirmed rows', () => {
  const now = new Date('2026-05-21T12:00:00Z')

  it('returns "none" for confirmed / completed / cancelled / no_show rows', () => {
    const startIn4h = new Date(now.getTime() + 4 * HOUR)
    expect(computeAging(startIn4h, 'confirmed', now)).toBe('none')
    expect(computeAging(startIn4h, 'completed', now)).toBe('none')
    expect(computeAging(startIn4h, 'cancelled', now)).toBe('none')
    expect(computeAging(startIn4h, 'no_show', now)).toBe('none')
  })

  it('returns "red" for past-time + still scheduled (overdue)', () => {
    const past = new Date(now.getTime() - 3 * HOUR)
    expect(computeAging(past, 'scheduled', now)).toBe('red')
  })

  it('returns "red" when start is ≤ 12 hours out', () => {
    expect(computeAging(new Date(now.getTime() + 1 * HOUR), 'scheduled', now)).toBe('red')
    expect(computeAging(new Date(now.getTime() + 11 * HOUR), 'scheduled', now)).toBe('red')
    expect(computeAging(new Date(now.getTime() + 12 * HOUR), 'scheduled', now)).toBe('red')
  })

  it('returns "darkAmber" between 12h and 24h out', () => {
    expect(computeAging(new Date(now.getTime() + 13 * HOUR), 'scheduled', now)).toBe('darkAmber')
    expect(computeAging(new Date(now.getTime() + 24 * HOUR), 'scheduled', now)).toBe('darkAmber')
  })

  it('returns "amber" between 24h and 48h out', () => {
    expect(computeAging(new Date(now.getTime() + 30 * HOUR), 'scheduled', now)).toBe('amber')
    expect(computeAging(new Date(now.getTime() + 48 * HOUR), 'scheduled', now)).toBe('amber')
  })

  it('returns "neutral" between 48h and 72h out', () => {
    expect(computeAging(new Date(now.getTime() + 60 * HOUR), 'scheduled', now)).toBe('neutral')
    expect(computeAging(new Date(now.getTime() + 72 * HOUR), 'scheduled', now)).toBe('neutral')
  })

  it('returns "none" beyond 72h out (no aging tint applied yet)', () => {
    expect(computeAging(new Date(now.getTime() + 73 * HOUR), 'scheduled', now)).toBe('none')
    expect(computeAging(new Date(now.getTime() + 7 * 24 * HOUR), 'scheduled', now)).toBe('none')
  })

  it('transitions monotonically as time passes — same row gets warmer', () => {
    const start = new Date(now.getTime() + 60 * HOUR) // 60h out → neutral
    const t0 = computeAging(start, 'scheduled', now)
    const t12 = computeAging(start, 'scheduled', new Date(now.getTime() + 12 * HOUR)) // 48h out → amber
    const t36 = computeAging(start, 'scheduled', new Date(now.getTime() + 36 * HOUR)) // 24h out → darkAmber
    const t48 = computeAging(start, 'scheduled', new Date(now.getTime() + 48 * HOUR)) // 12h out → red
    const order = ['none', 'neutral', 'amber', 'darkAmber', 'red']
    expect(order.indexOf(t0)).toBeLessThan(order.indexOf(t12))
    expect(order.indexOf(t12)).toBeLessThanOrEqual(order.indexOf(t36))
    expect(order.indexOf(t36)).toBeLessThanOrEqual(order.indexOf(t48))
  })
})
