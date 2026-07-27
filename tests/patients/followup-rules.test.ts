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
  inserted: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: vi.fn(async () => true),
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
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async (rows: Array<Record<string, unknown>>) => {
          h.inserted.push(...rows)
        },
      }),
    },
    schema: { appointment: {}, patient: {}, patientFollowup: { ruleKey: 'ruleKey', organizationId: 'org' } },
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  gte: (...a: unknown[]) => ({ a }),
  lte: (...a: unknown[]) => ({ a }),
  inArray: (...a: unknown[]) => ({ a }),
}))

import { buildRuleCandidates, persistCandidates } from '@/lib/services/followup-rules'
import { recordAction } from '@/lib/services/action-ledger'

const NOW = new Date('2026-06-18T12:00:00.000Z')

beforeEach(() => {
  h.patients = []
  h.appts = []
  h.inserted = []
  vi.mocked(recordAction).mockClear()
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

// ── persistCandidates (the followup_rule ledger writer, EXECUTED) ────────────
describe('persistCandidates — one ledger entry per follow-up the rules opened', () => {
  const DUE = '2026-06-20'
  const candidates = [
    { ruleKey: 'balance:p1:2026-06', patientId: 'p1', title: 'Mia Hayes has a $125 balance', dueDate: DUE },
    { ruleKey: 'recall:p2:2026-06', patientId: 'p2', title: 'Aiden Brooks is overdue for recall', dueDate: DUE },
  ]

  it('creates the rows and records followup_rule per CREATED row, patient-linked', async () => {
    h.appts = [] // the existing-ruleKey select returns nothing
    const created = await persistCandidates('org_1', candidates)
    expect(created).toBe(2)
    expect(h.inserted).toHaveLength(2)
    expect(vi.mocked(recordAction)).toHaveBeenCalledTimes(2)
    const entries = vi.mocked(recordAction).mock.calls.map((c) => c[0])
    expect(entries.map((e) => e.capability)).toEqual(['followup_rule', 'followup_rule'])
    expect(entries.map((e) => e.patientId)).toEqual(['p1', 'p2'])
    expect(entries[0].organizationId).toBe('org_1')
    expect(entries[0].summary).toContain('Mia Hayes')
  })

  it('dedupe: an already-open ruleKey creates nothing and claims nothing (per-CREATED, not per-candidate)', async () => {
    h.appts = [{ ruleKey: 'balance:p1:2026-06' }] // one already exists
    const created = await persistCandidates('org_1', candidates)
    expect(created).toBe(1)
    expect(h.inserted).toHaveLength(1)
    // Exactly ONE ledger entry — a per-candidate loop would double-claim here.
    expect(vi.mocked(recordAction)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordAction).mock.calls[0][0].patientId).toBe('p2')
  })

  it('all candidates already open → zero inserts, zero ledger claims', async () => {
    h.appts = [{ ruleKey: 'balance:p1:2026-06' }, { ruleKey: 'recall:p2:2026-06' }]
    const created = await persistCandidates('org_1', candidates)
    expect(created).toBe(0)
    expect(h.inserted).toHaveLength(0)
    expect(vi.mocked(recordAction)).not.toHaveBeenCalled()
  })
})
