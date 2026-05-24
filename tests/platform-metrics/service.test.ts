import { describe, it, expect, vi, beforeEach } from 'vitest'

// State the chain mock pulls from. Each select() pulls one row set off
// selectQueue in order, then the chain resolves it via .limit() or .then().
const state: { selectQueue: unknown[][] } = { selectQueue: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.groupBy = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
    },
  }
})

import {
  getClinicGrowth,
  getMrrSnapshot,
  getChurnStats,
  getProjectVelocity,
  getProjectFunnel,
  getPlatformEngagement,
} from '@/lib/services/platform-metrics'

beforeEach(() => {
  state.selectQueue.length = 0
})

describe('getMrrSnapshot', () => {
  it('aggregates plan mix and computes derived values', async () => {
    state.selectQueue.push([
      { planTier: 'basic', count: 4 },
      { planTier: 'pro', count: 6 },
      { planTier: 'premium', count: 2 },
    ])
    const m = await getMrrSnapshot()
    expect(m.activeClinics).toBe(12)
    // 4×9900 + 6×14900 + 2×19900 = 39600 + 89400 + 39800 = 168800
    expect(m.monthlyRecurringCents).toBe(4 * 9900 + 6 * 14900 + 2 * 19900)
    expect(m.annualRunRateCents).toBe(m.monthlyRecurringCents * 12)
    expect(m.arpu).toBe(Math.round(m.monthlyRecurringCents / 12))
  })

  it('zeroes out when no clinics are active', async () => {
    state.selectQueue.push([])
    const m = await getMrrSnapshot()
    expect(m.activeClinics).toBe(0)
    expect(m.monthlyRecurringCents).toBe(0)
    expect(m.arpu).toBe(0)
  })

  it('returns zero state when the table is missing (42P01)', async () => {
    const { db } = await import('@/lib/db')
    const orig = db.select
    ;(db as { select: () => unknown }).select = () => {
      throw Object.assign(new Error('relation "clinic_profile" does not exist'), { code: '42P01' })
    }
    try {
      const m = await getMrrSnapshot()
      expect(m).toEqual({
        activeClinics: 0,
        byTier: { basic: 0, pro: 0, premium: 0 },
        monthlyRecurringCents: 0,
        annualRunRateCents: 0,
        arpu: 0,
      })
    } finally {
      ;(db as { select: unknown }).select = orig
    }
  })
})

describe('getClinicGrowth', () => {
  it('fills in zero-count buckets for weeks with no signups', async () => {
    // Aggregated rows from DB — only the buckets that have data
    state.selectQueue.push([])
    // Total row
    state.selectQueue.push([{ count: 0 }])
    const g = await getClinicGrowth(12)
    expect(g.buckets).toHaveLength(12)
    expect(g.buckets.every((b) => b.value === 0)).toBe(true)
    expect(g.total).toBe(0)
    expect(g.newThisWeek).toBe(0)
    expect(g.pctChange).toBeNull()
  })

  it('matches grouped buckets back to the week-iso keys', async () => {
    // Compute the current week's iso (start of week Mon)
    const now = new Date()
    const dow = now.getDay()
    const offset = dow === 0 ? -6 : 1 - dow
    const thisWeek = new Date(now)
    thisWeek.setHours(0, 0, 0, 0)
    thisWeek.setDate(thisWeek.getDate() + offset)
    const thisWeekIso = thisWeek.toISOString().slice(0, 10)

    state.selectQueue.push([{ bucket: thisWeekIso, count: 3 }])
    state.selectQueue.push([{ count: 5 }])

    const g = await getClinicGrowth(12)
    expect(g.total).toBe(5)
    expect(g.newThisWeek).toBe(3)
    // Last bucket is this week
    expect(g.buckets[g.buckets.length - 1].bucket).toBe(thisWeekIso)
    expect(g.buckets[g.buckets.length - 1].value).toBe(3)
  })

  it('returns null pctChange when prior week was zero but this week is zero', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([{ count: 0 }])
    const g = await getClinicGrowth(4)
    expect(g.pctChange).toBeNull()
  })
})

describe('getChurnStats', () => {
  it('computes approx churn rate as canceled / (canceled + active)', async () => {
    // canceled (last 30d)
    state.selectQueue.push([{ count: 2 }])
    // past due
    state.selectQueue.push([{ count: 1 }])
    // active
    state.selectQueue.push([{ count: 8 }])

    const c = await getChurnStats()
    expect(c.canceled30d).toBe(2)
    expect(c.pastDue).toBe(1)
    // 2 / (8 + 2) = 20%
    expect(c.approxChurnRate30d).toBeCloseTo(20)
  })

  it('handles no clinics at all', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([])
    const c = await getChurnStats()
    expect(c.canceled30d).toBe(0)
    expect(c.approxChurnRate30d).toBe(0)
  })
})

describe('getProjectVelocity', () => {
  it('computes completed-per-month and avg duration', async () => {
    // Compute the start-of-this-month iso
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const thisIso = thisMonth.toISOString().slice(0, 10)
    const lastIso = lastMonth.toISOString().slice(0, 10)

    state.selectQueue.push([
      { bucket: thisIso, count: 4 },
      { bucket: lastIso, count: 2 },
    ])
    state.selectQueue.push([{ avg: 14.6 }])

    const v = await getProjectVelocity(6)
    expect(v.completedThisMonth).toBe(4)
    expect(v.completedLastMonth).toBe(2)
    expect(v.pctChange).toBeCloseTo(100, 0) // doubled
    expect(v.avgDurationDays).toBe(15) // rounded
  })

  it('returns null avgDurationDays when no completed projects exist', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([{ avg: 0 }])
    const v = await getProjectVelocity(3)
    expect(v.avgDurationDays).toBeNull()
  })
})

describe('getProjectFunnel', () => {
  it('returns cumulative funnel counts and overall rates', async () => {
    state.selectQueue.push([
      {
        total: 10,
        completed: 4,
        cancelled: 1,
        atDiscovery: 9, // 9 ever made it to discovery or beyond
        atInProgress: 7,
        atReview: 5,
      },
    ])
    const f = await getProjectFunnel()
    expect(f.totalCreated).toBe(10)
    expect(f.reachedDiscovery).toBe(9)
    expect(f.reachedInProgress).toBe(7)
    expect(f.reachedReview).toBe(5)
    expect(f.reachedCompleted).toBe(4)
    expect(f.overallCompletionRate).toBeCloseTo(40)
    expect(f.lossRate).toBeCloseTo(10)
  })

  it('returns zeros for empty table', async () => {
    state.selectQueue.push([])
    const f = await getProjectFunnel()
    expect(f.totalCreated).toBe(0)
    expect(f.overallCompletionRate).toBe(0)
  })
})

describe('getPlatformEngagement', () => {
  it('returns all 4 aggregates', async () => {
    state.selectQueue.push([{ count: 1200 }])
    state.selectQueue.push([{ count: 80 }])
    state.selectQueue.push([{ count: 150 }])
    state.selectQueue.push([{ count: 35 }])
    const e = await getPlatformEngagement()
    expect(e.totalPatients).toBe(1200)
    expect(e.newPatients30d).toBe(80)
    expect(e.appointmentsBooked30d).toBe(150)
    expect(e.appointmentsBooked7d).toBe(35)
  })

  it('returns zero state when patient table is missing', async () => {
    const { db } = await import('@/lib/db')
    const orig = db.select
    ;(db as { select: () => unknown }).select = () => {
      throw Object.assign(new Error('relation "patient" does not exist'), { code: '42P01' })
    }
    try {
      const e = await getPlatformEngagement()
      expect(e).toEqual({
        totalPatients: 0,
        newPatients30d: 0,
        appointmentsBooked30d: 0,
        appointmentsBooked7d: 0,
      })
    } finally {
      ;(db as { select: unknown }).select = orig
    }
  })
})
