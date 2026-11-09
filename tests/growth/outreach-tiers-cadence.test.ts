import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE NUMBERS FOLLOW THE PRACTICE (ML-29, G3-14). Three places carried a
 * bare "6 months" / "9 months" / 270 days while the queries behind them
 * already honoured Settings → Practice. Now lib/recall-cadence.ts is the
 * one source, and this pins:
 *  - the pure helpers: a stored 0 or null is "not set" (the default), the
 *    overdue line is recall + grace, the reactivation window is one month
 *    wide starting there;
 *  - the outreach tiers read the practice's numbers into their sentences
 *    while the canonical NAMES (the lookup keys) never move;
 *  - ensureOutreachTierAudiences re-describes an existing row on the
 *    practice's cadence (a changed setting changes the words, not the row);
 *  - the derivation's constants are the same objects (no second mirror).
 */

const cad = vi.hoisted(() => ({ value: { recallMonths: null as number | null, lapsedMonths: null as number | null } }))
vi.mock('@/lib/services/clinic-cadence', () => ({
  getClinicCadence: vi.fn(async () => cad.value),
}))

const dbState = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  selectRows: [] as { id: number; name: string }[],
}))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.then = (resolve: (v: unknown) => void) => resolve(dbState.selectRows)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (vals: Record<string, unknown>) => ({
          returning: async () => {
            dbState.inserts.push(vals)
            return [{ id: 100 + dbState.inserts.length }]
          },
        }),
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            dbState.updates.push(vals)
          },
        }),
      }),
    },
    schema,
  }
})

import {
  RECALL_DEFAULT_MONTHS,
  RECALL_OVERDUE_GRACE_MONTHS,
  clinicRecallMonths,
  clinicLapsedMonths,
  clinicOverdueMonths,
  reactivationWindow,
  recallDueDescription,
  lapsedTierDescription,
  reactivationAudienceDescription,
} from '@/lib/recall-cadence'
import { LAPSED_DEFAULT_MONTHS } from '@/lib/dates'
import { NEXT_VISIT_DEFAULT_MONTHS } from '@/lib/next-visit'
import * as recallStatus from '@/lib/services/recall-status'
import { OUTREACH_TIERS, outreachTiersFor, ensureOutreachTierAudiences } from '@/lib/services/outreach-tiers'

beforeEach(() => {
  cad.value = { recallMonths: null, lapsedMonths: null }
  dbState.inserts.length = 0
  dbState.updates.length = 0
  dbState.selectRows = []
})

describe('lib/recall-cadence — the one source', () => {
  it('the derivation and the next-visit seed read THE SAME constants (no second mirror)', () => {
    expect(recallStatus.RECALL_DEFAULT_MONTHS).toBe(RECALL_DEFAULT_MONTHS)
    expect(recallStatus.RECALL_OVERDUE_GRACE_MONTHS).toBe(RECALL_OVERDUE_GRACE_MONTHS)
    expect(NEXT_VISIT_DEFAULT_MONTHS).toBe(RECALL_DEFAULT_MONTHS)
  })

  it('null and 0 are "not set" → the defaults; a real setting wins', () => {
    expect(clinicRecallMonths({ recallMonths: null, lapsedMonths: null })).toBe(RECALL_DEFAULT_MONTHS)
    expect(clinicRecallMonths({ recallMonths: 0, lapsedMonths: null })).toBe(RECALL_DEFAULT_MONTHS)
    expect(clinicRecallMonths({ recallMonths: 4, lapsedMonths: null })).toBe(4)
    expect(clinicLapsedMonths({ recallMonths: null, lapsedMonths: null })).toBe(LAPSED_DEFAULT_MONTHS)
    expect(clinicLapsedMonths({ recallMonths: null, lapsedMonths: 12 })).toBe(12)
  })

  it('the overdue line is recall + grace; the reactivation window is one month wide from there, in 30-day months', () => {
    expect(clinicOverdueMonths({ recallMonths: null, lapsedMonths: null })).toBe(9)
    expect(reactivationWindow({ recallMonths: null, lapsedMonths: null })).toEqual({
      fromMonths: 9,
      toMonths: 10,
      minDays: 270,
      maxDays: 300,
    })
    expect(reactivationWindow({ recallMonths: 4, lapsedMonths: null })).toEqual({
      fromMonths: 7,
      toMonths: 8,
      minDays: 210,
      maxDays: 240,
    })
  })

  it('the sentences carry the practice’s numbers — and never the word "overdue"', () => {
    const four = { recallMonths: 4, lapsedMonths: 12 }
    expect(recallDueDescription(four)).toBe('Last cleaning over 4 months ago, no future booking')
    expect(lapsedTierDescription(four)).toContain('12+ months')
    expect(reactivationAudienceDescription(four)).toBe(
      'patients whose last visit was 7–8 months ago, with no upcoming visit booked',
    )
    for (const s of [recallDueDescription(four), lapsedTierDescription(four), reactivationAudienceDescription(four)]) {
      expect(s.toLowerCase()).not.toContain('overdue')
    }
  })
})

describe('the outreach tiers on a practice’s cadence', () => {
  it('OUTREACH_TIERS is the default rendering; a 4-month practice reads 4 in the same tier under the same NAME', () => {
    const recallDefault = OUTREACH_TIERS.find((t) => t.key === 'recall_due')!
    expect(recallDefault.description).toBe('Last cleaning over 6 months ago, no future booking')
    expect(recallDefault.audienceDescription).toContain('over 6 months ago')

    const four = outreachTiersFor({ recallMonths: 4, lapsedMonths: 12 })
    const recallFour = four.find((t) => t.key === 'recall_due')!
    expect(recallFour.description).toBe('Last cleaning over 4 months ago, no future booking')
    expect(recallFour.audienceDescription).toContain('over 4 months ago')
    // The canonical name is the lookup key — it never follows the setting.
    expect(recallFour.audienceName).toBe(recallDefault.audienceName)
    expect(recallFour.audienceName).toBe('Recall due (6+ months)')
    // The QUERY is the cadence-aware recall status, same on every cadence.
    expect(recallFour.filter).toEqual(recallDefault.filter)

    const lapsedFour = four.find((t) => t.key === 'lapsed')!
    expect(lapsedFour.description).toContain('12+ months')
    expect(lapsedFour.audienceDescription).toContain('12 months')
    expect(lapsedFour.audienceName).toBe('Lapsed (lifecycle = lapsed)')
  })

  it('the keys, filters, names and categories are identical across cadences — only the words move', () => {
    const a = outreachTiersFor({ recallMonths: null, lapsedMonths: null })
    const b = outreachTiersFor({ recallMonths: 3, lapsedMonths: 24 })
    expect(a.map((t) => t.key)).toEqual(b.map((t) => t.key))
    expect(a.map((t) => t.audienceName)).toEqual(b.map((t) => t.audienceName))
    expect(a.map((t) => t.filter)).toEqual(b.map((t) => t.filter))
    expect(a.map((t) => t.templateCategory)).toEqual(b.map((t) => t.templateCategory))
  })
})

describe('ensureOutreachTierAudiences re-describes rows on the practice’s cadence', () => {
  it('an existing row keeps its id and name but its description now reads the practice’s number', async () => {
    cad.value = { recallMonths: 4, lapsedMonths: 12 }
    dbState.selectRows = OUTREACH_TIERS.map((t, i) => ({ id: i + 1, name: t.audienceName }))
    const map = await ensureOutreachTierAudiences('org_a')
    expect(map.get('recall_due')).toBe(1)
    expect(dbState.inserts).toHaveLength(0)
    expect(dbState.updates).toHaveLength(4)
    expect(dbState.updates[0].description).toContain('over 4 months ago')
    expect(dbState.updates[1].description).toContain('12 months')
  })

  it('a missing row is inserted with the practice’s words under the canonical name', async () => {
    cad.value = { recallMonths: 4, lapsedMonths: null }
    const map = await ensureOutreachTierAudiences('org_a')
    expect(map.size).toBe(4)
    const recall = dbState.inserts.find((i) => i.name === 'Recall due (6+ months)')!
    expect(recall.organizationId).toBe('org_a')
    expect(recall.description).toContain('over 4 months ago')
  })
})
