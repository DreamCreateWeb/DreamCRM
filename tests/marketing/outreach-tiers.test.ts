import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The outreach-tier audience guarantee (campaigns phase 1, 2026-07-21):
 * ensureOutreachTierAudiences find-or-creates the four tier audiences so
 * the queue's "Send" CTA always carries a real audience id — the old
 * name-based lookup silently degraded when a seeded audience was missing
 * or renamed. Canonical names match the demo seeder so existing orgs
 * adopt their rows instead of duplicating.
 */

const inserts: Record<string, unknown>[] = []
let selectRows: { id: number; name: string }[] = []

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.then = (resolve: (v: unknown) => void) => resolve(selectRows)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (vals: Record<string, unknown>) => ({
          returning: async () => {
            inserts.push(vals)
            return [{ id: 100 + inserts.length }]
          },
        }),
      }),
    },
    schema,
  }
})

import { OUTREACH_TIERS, ensureOutreachTierAudiences } from '@/lib/services/outreach-tiers'

beforeEach(() => {
  inserts.length = 0
  selectRows = []
})

describe('ensureOutreachTierAudiences', () => {
  it('reuses every existing audience without inserting (the common case)', async () => {
    selectRows = OUTREACH_TIERS.map((t, i) => ({ id: i + 1, name: t.audienceName }))
    const map = await ensureOutreachTierAudiences('org_a')
    expect(inserts).toHaveLength(0)
    expect(map.get('recall_due')).toBe(1)
    expect(map.size).toBe(4)
  })

  it('creates the missing tiers org-scoped with canonical names + patient filters', async () => {
    selectRows = [{ id: 5, name: OUTREACH_TIERS[0].audienceName }] // only recall_due exists
    const map = await ensureOutreachTierAudiences('org_a')
    expect(map.get('recall_due')).toBe(5)
    expect(inserts).toHaveLength(3)
    for (const ins of inserts) {
      expect(ins.organizationId).toBe('org_a')
      expect(ins.recipientSource).toBe('patients')
      expect(ins.patientFilter).toBeTruthy()
    }
    const names = inserts.map((i) => i.name)
    expect(names).toContain('Lapsed (lifecycle = lapsed)')
    expect(names).toContain('Birthday this month')
  })

  it('tier names stay in lockstep with the demo seeder (canonical-name contract)', () => {
    expect(OUTREACH_TIERS.map((t) => t.audienceName)).toEqual([
      'Recall due (6+ months)',
      'Lapsed (lifecycle = lapsed)',
      'New patients (past 60 days)',
      'Birthday this month',
    ])
  })

  it('every tier filter requires email opt-in (marketing sends only)', () => {
    for (const t of OUTREACH_TIERS) expect(t.filter.requireEmailOptIn).toBe(true)
  })
})
