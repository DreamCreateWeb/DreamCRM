import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The cross-campaign frequency cap (phase 4): max 2 marketing 'sent' events
 * per rolling 7 days per patient email, counted across manual campaigns AND
 * automations (one campaign_events query, org-scoped via the campaigns join).
 */

const state = { eventRows: [] as { email: string }[] }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.then = (resolve: (v: unknown) => void) => resolve(state.eventRows)
    return obj
  }
  return { db: { select: () => chain() }, schema }
})

import { partitionByFrequencyCap, FREQUENCY_MAX_SENDS } from '@/lib/services/marketing-frequency'

const r = (email: string | null) => ({ email })

beforeEach(() => {
  state.eventRows = []
})

describe('partitionByFrequencyCap', () => {
  it('lets everyone through when nobody has recent sends', async () => {
    const { allowed, suppressed } = await partitionByFrequencyCap('org_a', [r('a@x.com'), r('b@x.com')])
    expect(allowed).toHaveLength(2)
    expect(suppressed).toHaveLength(0)
  })

  it('suppresses a recipient at the cap and keeps the rest', async () => {
    // a@x.com already got 2 marketing emails this week; b got 1.
    state.eventRows = [{ email: 'a@x.com' }, { email: 'a@x.com' }, { email: 'b@x.com' }]
    const { allowed, suppressed } = await partitionByFrequencyCap('org_a', [r('a@x.com'), r('b@x.com')])
    expect(suppressed.map((s) => s.email)).toEqual(['a@x.com'])
    expect(allowed.map((a) => a.email)).toEqual(['b@x.com'])
  })

  it('never suppresses recipients without an email (SMS-only rows pass through)', async () => {
    const { allowed, suppressed } = await partitionByFrequencyCap('org_a', [r(null)])
    expect(allowed).toHaveLength(1)
    expect(suppressed).toHaveLength(0)
  })

  it('the cap is 2 — one prior send is still under it', async () => {
    state.eventRows = Array.from({ length: FREQUENCY_MAX_SENDS - 1 }, () => ({ email: 'a@x.com' }))
    const { allowed } = await partitionByFrequencyCap('org_a', [r('a@x.com')])
    expect(allowed).toHaveLength(1)
  })
})
