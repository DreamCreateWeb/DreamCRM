/**
 * Snooze (ML-18) at the service boundary: ONE predicate keeps a snoozed row
 * out of every "due" reader, the snooze write is org-scoped and open-only, and
 * the statement renders through drizzle's real dialect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const state = { wheres: [] as unknown[], sets: [] as unknown[], returned: [{ id: 'pfu_1' }] as unknown[] }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    set: (v: unknown) => { state.sets.push(v); return chain },
    where: (c: unknown) => { state.wheres.push(c); return chain },
    orderBy: () => chain,
    returning: async () => state.returned,
    limit: async () => [],
    then: (res: (v: unknown) => void) => res([{ c: 0, openTotal: 0, overdue: 0, dueToday: 0 }]),
  }
  return { db: { select: () => chain, update: () => chain }, schema }
})
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/Chicago') }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn() }))

import {
  snoozeFollowup,
  snoozeTargetYmd,
  listOpenFollowups,
  countFollowupsDue,
  getFollowupSummary,
  countSnoozedFollowups,
} from '@/lib/services/patient-followups'

const dialect = new PgDialect()
const render = (c: unknown) => dialect.sqlToQuery(c as never)

beforeEach(() => {
  state.wheres = []
  state.sets = []
  state.returned = [{ id: 'pfu_1' }]
})

describe('snooze', () => {
  it('resolves presets to a clinic-local day (a Central clinic at 11 PM is still its own today)', async () => {
    // 2026-11-04T04:30Z is 10:30 PM on Nov 3 in Chicago.
    const now = new Date('2026-11-04T04:30:00Z')
    expect(await snoozeTargetYmd('org_a', 'tomorrow', now)).toBe('2026-11-04')
    expect(await snoozeTargetYmd('org_a', 'next_week', now)).toBe('2026-11-10')
  })

  it('writes snoozedUntil + dueDate, scoped to the org and to OPEN rows', async () => {
    const ok = await snoozeFollowup('org_a', 'pfu_1', '2099-01-01')
    expect(ok).toBe(true)
    expect(state.sets[0]).toMatchObject({ snoozedUntil: '2099-01-01', dueDate: '2099-01-01' })
    const q = render(state.wheres[0])
    expect(q.sql).toContain('"organization_id"')
    expect(q.sql).toContain('"status"')
    expect(q.params).toContain('org_a')
    expect(q.params).toContain('open')
  })

  it('refuses a past/malformed day and reports a closed row', async () => {
    await expect(snoozeFollowup('org_a', 'pfu_1', '2000-01-01')).rejects.toThrow()
    await expect(snoozeFollowup('org_a', 'pfu_1', 'tomorrow')).rejects.toThrow()
    state.returned = []
    expect(await snoozeFollowup('org_a', 'pfu_1', '2099-01-01')).toBe(false)
  })
})

describe('the one snoozed predicate', () => {
  it('hides snoozed rows from the board, the huddle, and the badge; the chip reads them', async () => {
    await listOpenFollowups('org_a', {})
    await countFollowupsDue('org_a')
    await getFollowupSummary('org_a')
    for (const w of state.wheres) {
      const q = render(w)
      expect(q.sql).toContain('"snoozed_until" is null or')
      expect(q.sql).toContain('"organization_id"')
    }
    state.wheres = []
    await listOpenFollowups('org_a', { snoozed: true })
    expect(render(state.wheres[0]).sql).toContain('"snoozed_until" is not null and')
    state.wheres = []
    await countSnoozedFollowups('org_a')
    const q = render(state.wheres[0])
    expect(q.sql).toContain('"snoozed_until" > ')
    expect(q.params).toContain('org_a')
  })
})
