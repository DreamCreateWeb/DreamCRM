import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveFollowupRules,
  anyFollowupRuleEnabled,
  DEFAULT_FOLLOWUP_RULES,
} from '@/lib/types/followup-rules'

describe('resolveFollowupRules', () => {
  it('defaults everything off for null/garbage', () => {
    expect(resolveFollowupRules(null)).toEqual(DEFAULT_FOLLOWUP_RULES)
    expect(resolveFollowupRules('nope')).toEqual(DEFAULT_FOLLOWUP_RULES)
    expect(resolveFollowupRules({})).toEqual({ balance: false, recall: false, unconfirmed: false })
  })
  it('reads only strict-true flags', () => {
    expect(resolveFollowupRules({ balance: true, recall: 1, unconfirmed: 'yes' })).toEqual({
      balance: true,
      recall: false,
      unconfirmed: false,
    })
  })
  it('anyFollowupRuleEnabled', () => {
    expect(anyFollowupRuleEnabled({ balance: false, recall: false, unconfirmed: false })).toBe(false)
    expect(anyFollowupRuleEnabled({ balance: false, recall: true, unconfirmed: false })).toBe(true)
  })
})

// ── buildRuleCandidates (engine) ──────────────────────────────────────────────
const h = vi.hoisted(() => ({
  patients: [] as Array<Record<string, unknown>>,
  appts: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/services/patients', () => ({
  listPatients: vi.fn(async () => h.patients),
}))
vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.innerJoin = () => o
    o.where = () => Promise.resolve(h.appts)
    return o
  }
  return { db: { select: () => chain() }, schema: { appointment: {}, patient: {} } }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  gte: (...a: unknown[]) => ({ a }),
  lte: (...a: unknown[]) => ({ a }),
  inArray: (...a: unknown[]) => ({ a }),
}))

import { buildRuleCandidates } from '@/lib/services/followup-rules'

const NOW = new Date('2026-06-18T12:00:00.000Z')

beforeEach(() => {
  h.patients = []
  h.appts = []
})

describe('buildRuleCandidates', () => {
  it('creates a balance candidate keyed by patient + month', async () => {
    h.patients = [
      { id: 'p1', fullName: 'Mia Hayes', outstandingBalanceCents: 12500, recallStatus: 'na' },
      { id: 'p2', fullName: 'No Balance', outstandingBalanceCents: 0, recallStatus: 'na' },
    ]
    const c = await buildRuleCandidates('org_1', { balance: true, recall: false, unconfirmed: false }, NOW)
    expect(c).toHaveLength(1)
    expect(c[0].ruleKey).toMatch(/^balance:p1:2026-06$/)
    expect(c[0].title).toContain('$125')
    expect(c[0].title).toContain('Mia Hayes')
  })

  it('creates a recall candidate only for overdue patients', async () => {
    h.patients = [
      { id: 'p1', fullName: 'Overdue One', outstandingBalanceCents: 0, recallStatus: 'overdue' },
      { id: 'p2', fullName: 'Just Due', outstandingBalanceCents: 0, recallStatus: 'due' },
    ]
    const c = await buildRuleCandidates('org_1', { balance: false, recall: true, unconfirmed: false }, NOW)
    expect(c.map((x) => x.ruleKey)).toEqual(['recall:p1:2026-06'])
    expect(c[0].title).toContain('overdue')
  })

  it('creates an unconfirmed candidate per scheduled appointment in the window', async () => {
    h.appts = [
      { id: 'a1', patientId: 'p1', firstName: 'Mia', lastName: 'Hayes', type: 'cleaning', startTime: new Date('2026-06-19T15:00:00Z') },
    ]
    const c = await buildRuleCandidates('org_1', { balance: false, recall: false, unconfirmed: true }, NOW)
    expect(c).toHaveLength(1)
    expect(c[0].ruleKey).toBe('confirm:a1')
    expect(c[0].title).toContain('Confirm Mia Hayes')
  })

  it('skips the patient query entirely when only the unconfirmed rule is on', async () => {
    const { listPatients } = await import('@/lib/services/patients')
    await buildRuleCandidates('org_1', { balance: false, recall: false, unconfirmed: true }, NOW)
    expect(listPatients).not.toHaveBeenCalled()
  })
})
