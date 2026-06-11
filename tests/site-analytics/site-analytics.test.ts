import { describe, it, expect, vi, beforeEach } from 'vitest'

interface InsertCall {
  values: unknown
  conflict?: unknown
}

const state: {
  selectQueue: unknown[][]
  inserts: InsertCall[]
} = { selectQueue: [], inserts: [] }

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  const insertChain = () => {
    const call: InsertCall = { values: undefined }
    const obj: any = {}
    obj.values = (v: unknown) => {
      call.values = v
      return obj
    }
    obj.onConflictDoUpdate = (c: unknown) => {
      call.conflict = c
      state.inserts.push(call)
      return Promise.resolve()
    }
    obj.onConflictDoNothing = () => {
      state.inserts.push(call)
      return Promise.resolve()
    }
    obj.then = (resolve: (v: unknown) => void) => {
      state.inserts.push(call)
      return resolve(undefined)
    }
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => insertChain(),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
  }
})

import {
  normalizeSitePath,
  dayKey,
  recordSiteView,
  getSiteTraffic,
} from '@/lib/services/site-analytics'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
})

describe('normalizeSitePath', () => {
  it('defaults empty/null to /', () => {
    expect(normalizeSitePath(null)).toBe('/')
    expect(normalizeSitePath(undefined)).toBe('/')
    expect(normalizeSitePath('')).toBe('/')
  })
  it('strips query + fragment', () => {
    expect(normalizeSitePath('/book?foo=1&edit=1')).toBe('/book')
    expect(normalizeSitePath('/about#team')).toBe('/about')
  })
  it('trims a trailing slash but keeps root', () => {
    expect(normalizeSitePath('/about/')).toBe('/about')
    expect(normalizeSitePath('/')).toBe('/')
  })
  it('ensures a leading slash + collapses duplicates', () => {
    expect(normalizeSitePath('about')).toBe('/about')
    expect(normalizeSitePath('//services///x')).toBe('/services/x')
  })
  it('caps very long paths', () => {
    const long = '/' + 'a'.repeat(1000)
    expect(normalizeSitePath(long).length).toBeLessThanOrEqual(256)
  })
})

describe('dayKey', () => {
  it('returns YYYY-MM-DD in UTC', () => {
    expect(dayKey(new Date('2026-06-11T23:30:00Z'))).toBe('2026-06-11')
    expect(dayKey(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02')
  })
})

describe('recordSiteView', () => {
  it('upserts a normalized path with views=1 and +1 increment', async () => {
    await recordSiteView('org1', '/book?x=1', new Date('2026-06-11T10:00:00Z'))
    expect(state.inserts).toHaveLength(1)
    const v = state.inserts[0].values as { organizationId: string; day: string; path: string; views: number }
    expect(v.organizationId).toBe('org1')
    expect(v.path).toBe('/book')
    expect(v.day).toBe('2026-06-11')
    expect(v.views).toBe(1)
    // The conflict clause must increment, not replace.
    expect(state.inserts[0].conflict).toBeTruthy()
  })
})

describe('getSiteTraffic', () => {
  it('zero-fills every day in the window + computes total, delta, top pages', async () => {
    const today = new Date()
    const d = (offset: number) => {
      const x = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      x.setUTCDate(x.getUTCDate() - offset)
      return x.toISOString().slice(0, 10)
    }
    // Rows: in-window (offsets 0,1) + prior-window (offset 40).
    state.selectQueue.push([
      { day: d(0), path: '/', views: 10 },
      { day: d(0), path: '/book', views: 4 },
      { day: d(1), path: '/', views: 6 },
      { day: d(40), path: '/', views: 99 }, // prior window
    ])

    const t = await getSiteTraffic('org1', 30)
    expect(t.windowDays).toBe(30)
    expect(t.total).toBe(20) // 10 + 4 + 6
    expect(t.totalPrev).toBe(99)
    expect(t.daily).toHaveLength(30) // zero-filled
    // Newest day last, holds 14 views (10 + 4).
    expect(t.daily[t.daily.length - 1]).toEqual({ day: d(0), views: 14 })
    // Top pages sorted by views desc.
    expect(t.topPages[0]).toEqual({ path: '/', views: 16 })
    expect(t.topPages[1]).toEqual({ path: '/book', views: 4 })
  })

  it('honors the 90-day window', async () => {
    state.selectQueue.push([])
    const t = await getSiteTraffic('org1', 90)
    expect(t.windowDays).toBe(90)
    expect(t.daily).toHaveLength(90)
    expect(t.total).toBe(0)
    expect(t.topPages).toEqual([])
  })

  it('defaults a junk window to 30', async () => {
    state.selectQueue.push([])
    const t = await getSiteTraffic('org1', 12345 as unknown as number)
    expect(t.windowDays).toBe(30)
  })
})
