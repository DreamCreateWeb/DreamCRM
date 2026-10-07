import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S8 — the ONE stamping mechanism. `reconcileActivation` reads the stamps,
 * reads the rails' own first-times for whatever is still unset, and writes
 * each with the RAIL's instant (never "now"); a key already stamped is never
 * touched; nothing in the future is stamped; a failed read stamps nothing
 * and never throws. `getActivationMetrics` says "unreadable" on a failed
 * read instead of returning a cohort of zeros.
 */

const NOW = new Date('2026-10-12T15:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

const state = {
  /** Rows per table for the raw selects, keyed by the drizzle table object. */
  rows: new Map<unknown, Array<Record<string, unknown>>>(),
  /** Every stamp write: [set-fragment present, where present] — captured by table order. */
  updates: [] as Array<{ table: unknown }>,
  selectThrows: false,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table: unknown = null
    obj.from = (t: unknown) => {
      table = t
      if (state.selectThrows) throw new Error('db down')
      return obj
    }
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.offset = () => obj
    obj.limit = async () => state.rows.get(table) ?? []
    // A select with no .limit (the metrics + reconcile-all reads) resolves on await.
    obj.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      try {
        resolve(state.rows.get(table) ?? [])
      } catch (e) {
        reject(e)
      }
    }
    return obj
  }
  const update = (table: unknown) => {
    const obj: any = {}
    obj.set = () => obj
    obj.where = () => obj
    obj.returning = async () => {
      state.updates.push({ table })
      return [{ organizationId: 'org_a' }]
    }
    return obj
  }
  return { schema, db: { select: () => chain(), update } }
})
vi.mock('@/lib/services/cron-sweep', () => ({
  sweepClinics: async (_job: string, items: unknown[], _id: unknown, each: (i: unknown) => Promise<void>) => {
    for (const i of items) await each(i)
    return { swept: items.length, remaining: 0, completed: true, resumeAt: null }
  },
}))

import { getActivationMetrics, reconcileActivation, reconcileActivationStamps } from '@/lib/services/activation'
import { schema } from '@/lib/db'

beforeEach(() => {
  state.rows.clear()
  state.updates = []
  state.selectThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('reconcileActivation', () => {
  it('stamps only the keys still unset, with the rail’s own first-time', async () => {
    state.rows.set(schema.clinicProfile, [{ activation: { a1: daysAgo(5).toISOString() } }])
    state.rows.set(schema.appointmentReminderLog, [{ at: daysAgo(4) }])
    state.rows.set(schema.formSubmission, [{ at: daysAgo(2) }])
    const stamped = await reconcileActivation('org_a', NOW)
    expect(stamped).toEqual(['a2', 'a5'])
    expect(state.updates).toHaveLength(2)
  })

  it('a staff reply from /messages is a first message too — A2 takes the earliest of reminders, campaigns and outbound messages (audit round 1)', async () => {
    state.rows.set(schema.clinicProfile, [{ activation: { a1: daysAgo(5).toISOString() } }])
    state.rows.set(schema.appointmentReminderLog, [{ at: daysAgo(2) }])
    state.rows.set(schema.patientMessage, [{ at: daysAgo(4) }])
    expect(await reconcileActivation('org_a', NOW)).toEqual(['a2'])
    expect(state.updates).toHaveLength(1)
  })

  it('does nothing when every key is stamped — no rail is read', async () => {
    state.rows.set(schema.clinicProfile, [{ activation: { a1: daysAgo(5).toISOString(), a2: daysAgo(4).toISOString(), a3: daysAgo(3).toISOString(), a4: daysAgo(2).toISOString(), a5: daysAgo(1).toISOString() } }])
    state.rows.set(schema.formSubmission, [{ at: daysAgo(9) }])
    expect(await reconcileActivation('org_a', NOW)).toEqual([])
    expect(state.updates).toHaveLength(0)
  })

  it('never stamps a future instant, and a failed read stamps nothing without throwing', async () => {
    state.rows.set(schema.clinicProfile, [{ activation: null }])
    state.rows.set(schema.formSubmission, [{ at: new Date(NOW.getTime() + 60_000) }])
    expect(await reconcileActivation('org_a', NOW)).toEqual([])
    state.selectThrows = true
    expect(await reconcileActivation('org_a', NOW)).toEqual([])
    expect(state.updates).toHaveLength(0)
  })
})

describe('reconcileActivationStamps', () => {
  it('walks only the clinics with something unstamped and counts what it wrote', async () => {
    state.rows.set(schema.organization, [
      { orgId: 'org_done', activation: { a1: '2026-10-01T00:00:00.000Z', a2: '2026-10-01T00:00:00.000Z', a3: '2026-10-01T00:00:00.000Z', a4: '2026-10-01T00:00:00.000Z', a5: '2026-10-01T00:00:00.000Z' } },
      { orgId: 'org_a', activation: null },
    ])
    state.rows.set(schema.clinicProfile, [{ activation: null }])
    state.rows.set(schema.reviewRequest, [{ at: daysAgo(3) }])
    const r = await reconcileActivationStamps({ now: NOW })
    expect(r.scanned).toBe(1)
    expect(r.stamped).toEqual({ a1: 0, a2: 0, a3: 0, a4: 1, a5: 0 })
    expect(r.errors).toBe(0)
  })
})

describe('getActivationMetrics', () => {
  it('reads the cohort from the stamps and computes the numbers', async () => {
    state.rows.set(schema.organization, [
      { createdAt: daysAgo(10), activation: { a1: daysAgo(9).toISOString() } },
      { createdAt: daysAgo(4), activation: null },
    ])
    const m = await getActivationMetrics({ now: NOW })
    expect(m.unreadable).toBe(false)
    expect(m.clinics).toBe(2)
    expect(m.events[0]).toMatchObject({ key: 'a1', reached: 1, medianHours: 24 })
    expect(m.a1Within).toEqual({ reached: 1, share: 0.5 })
    expect(m.noDataPastDue).toBe(1)
  })

  it('says unreadable on a failed read, never a cohort of zeros', async () => {
    state.selectThrows = true
    const m = await getActivationMetrics({ now: NOW })
    expect(m.unreadable).toBe(true)
    expect(m.clinics).toBe(0)
  })
})
