import { describe, it, expect, vi, beforeEach } from 'vitest'

interface InsertCall {
  table: string
  values: unknown
}
interface UpdateCall {
  table: string
  set: Record<string, unknown>
}

const state: {
  selectQueue: unknown[][]
  inserts: InsertCall[]
  updates: UpdateCall[]
} = { selectQueue: [], inserts: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const nameOf = (t: unknown) => {
    if (t === schema.sitePageview) return 'site_pageview'
    if (t === schema.clinicProfile) return 'clinic_profile'
    return 'other'
  }
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: (t: unknown) => {
        const call: InsertCall = { table: nameOf(t), values: undefined }
        const obj: any = {}
        obj.values = (v: unknown) => {
          call.values = v
          return obj
        }
        obj.onConflictDoNothing = () => {
          state.inserts.push(call)
          return Promise.resolve()
        }
        obj.onConflictDoUpdate = () => {
          state.inserts.push(call)
          return Promise.resolve()
        }
        obj.then = (resolve: (v: unknown) => void) => {
          state.inserts.push(call)
          return resolve(undefined)
        }
        return obj
      },
      update: (t: unknown) => ({
        set: (s: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: nameOf(t), set: s })
          },
        }),
      }),
    },
    schema,
  }
})

import { seedDemoSiteAnalytics } from '@/lib/services/demo-clinic'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.updates.length = 0
})

describe('seedDemoSiteAnalytics', () => {
  it('seeds ~3 weeks of home-heavy pageviews + seo_meta when empty/null', async () => {
    state.selectQueue.push([]) // no existing site_pageview rows
    state.selectQueue.push([{ seoMeta: null }]) // profile with null seo_meta

    await seedDemoSiteAnalytics('org_demo')

    const pvInsert = state.inserts.find((i) => i.table === 'site_pageview')
    expect(pvInsert).toBeTruthy()
    const rows = pvInsert!.values as Array<{ organizationId: string; day: string; path: string; views: number }>
    expect(Array.isArray(rows)).toBe(true)
    // All rows scoped to the org + positive views.
    expect(rows.every((r) => r.organizationId === 'org_demo' && r.views > 0)).toBe(true)
    // Covers home + /book + /services (mission: home-heavy with some book/services).
    const paths = new Set(rows.map((r) => r.path))
    expect(paths.has('/')).toBe(true)
    expect(paths.has('/book')).toBe(true)
    expect(paths.has('/services')).toBe(true)
    // ~21 distinct days.
    const days = new Set(rows.map((r) => r.day))
    expect(days.size).toBeGreaterThanOrEqual(20)
    expect(days.size).toBeLessThanOrEqual(21)
    // Home is the most-viewed page in total (home-heavy).
    const total = (p: string) => rows.filter((r) => r.path === p).reduce((s, r) => s + r.views, 0)
    expect(total('/')).toBeGreaterThan(total('/services'))
    expect(total('/')).toBeGreaterThan(total('/book'))

    // seo_meta override written (home + book) when null.
    const seoUpdate = state.updates.find((u) => u.table === 'clinic_profile')
    expect(seoUpdate).toBeTruthy()
    const meta = (seoUpdate!.set.seoMeta ?? {}) as Record<string, { title?: string; description?: string }>
    expect(meta.home?.title).toBeTruthy()
    expect(meta.book?.description).toBeTruthy()
  })

  it('does not double-seed pageviews when rows already exist', async () => {
    state.selectQueue.push([{ id: 1 }]) // existing site_pageview rows
    state.selectQueue.push([{ seoMeta: { home: { title: 'Hand edited' } } }]) // already-set seo_meta

    await seedDemoSiteAnalytics('org_demo')

    expect(state.inserts.find((i) => i.table === 'site_pageview')).toBeUndefined()
    // seo_meta already set → no overwrite.
    expect(state.updates.find((u) => u.table === 'clinic_profile')).toBeUndefined()
  })

  it('backfills seo_meta on a legacy demo that already has pageviews but null seo_meta', async () => {
    state.selectQueue.push([{ id: 1 }]) // existing pageviews → skip pageview seed
    state.selectQueue.push([{ seoMeta: null }]) // but seo_meta still null

    await seedDemoSiteAnalytics('org_demo')

    expect(state.inserts.find((i) => i.table === 'site_pageview')).toBeUndefined()
    expect(state.updates.find((u) => u.table === 'clinic_profile')).toBeTruthy()
  })
})
