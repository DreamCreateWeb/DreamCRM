import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CONTENT CALENDAR (Phase 5, limb 1), service half.
 *
 * Pins the two things the pure module cannot see:
 *  - the horizon is read across BOTH rails and merged in publish order —
 *    from the practice's side a queued blog post and a queued social post
 *    are the same fact ("something is coming");
 *  - a FAILED read never reads as "nothing there". countHorizon returns null
 *    so the generator treats the horizon as full and stays quiet; the report
 *    degrades to empty rather than breaking the page it sits on. Those two
 *    differ on purpose, and both are the erring-toward-silence side.
 */

const store = vi.hoisted(() => ({
  social: [] as Array<Record<string, unknown>>,
  blog: [] as Array<Record<string, unknown>>,
  throwOn: null as string | null,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.where = () => api
    const rows = () => {
      if (store.throwOn === table) throw new Error(`${table} read down`)
      const src = table === 'social_post' ? store.social : table === 'blog_post' ? store.blog : []
      return cols ? src.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, r[k]]))) : src
    }
    api.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      try { resolve(rows()) } catch (e) { reject(e) }
    }
    return api
  }
  const t = (name: string, ...cs: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(cs.map((c) => [c, col(c)])))
  return {
    db: { select },
    schema: {
      socialPost: t('social_post', 'id', 'organizationId', 'summary', 'status', 'scheduledAt'),
      blogPost: t('blog_post', 'id', 'organizationId', 'title', 'status', 'scheduledFor'),
    },
  }
})

vi.mock('drizzle-orm', () => {
  const p = () => ({ op: 'x' })
  return { and: p, eq: p, gte: p, lt: p }
})

import {
  readHorizon,
  countHorizon,
  getUpcomingContent,
  planSchedule,
  clinicLocalDow,
} from '@/lib/services/content-calendar'
import { PUBLISH_HOUR } from '@/lib/content-calendar'

const ORG = 'org_1'
const TZ = 'America/Chicago'
const NOW = new Date('2026-07-27T15:00:00Z') // Monday
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  store.social = []
  store.blog = []
  store.throwOn = null
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the horizon', () => {
  it('merges both rails in publish order, with clinic-local day headers', async () => {
    store.blog = [
      { id: 'b1', title: 'Your first visit', status: 'scheduled', scheduledFor: new Date(NOW.getTime() + 9 * DAY) },
    ]
    store.social = [
      { id: 's1', summary: 'A post about flossing.', status: 'scheduled', scheduledAt: new Date(NOW.getTime() + 2 * DAY) },
      { id: 's2', summary: 'A post about cleanings.', status: 'scheduled', scheduledAt: new Date(NOW.getTime() + 16 * DAY) },
    ]
    const pieces = await readHorizon(ORG, TZ, NOW)
    expect(pieces.map((p) => p.kind)).toEqual(['social', 'blog', 'social'])
    expect(pieces[1].title).toBe('Your first visit')
    expect(pieces[0].title).toBe('A post about flossing.')
    // Clinic-local, not the server's — Wednesday July 29 in Chicago.
    expect(pieces[0].when).toContain('July 29')
  })

  it('trims a long post to a readable snippet — the report is a glance, not the post', async () => {
    store.social = [
      { id: 's1', summary: 'x'.repeat(300), status: 'scheduled', scheduledAt: new Date(NOW.getTime() + DAY) },
    ]
    const [piece] = await readHorizon(ORG, TZ, NOW)
    expect(piece.title.length).toBeLessThanOrEqual(70)
    expect(piece.title.endsWith('…')).toBe(true)
  })

  it('names an untitled article rather than rendering a blank row', async () => {
    store.blog = [{ id: 'b1', title: '   ', status: 'scheduled', scheduledFor: new Date(NOW.getTime() + DAY) }]
    expect((await readHorizon(ORG, TZ, NOW))[0].title).toBe('Untitled post')
  })

  it('skips rows with no scheduled time instead of inventing one', async () => {
    store.social = [{ id: 's1', summary: 'No time.', status: 'scheduled', scheduledAt: null }]
    expect(await readHorizon(ORG, TZ, NOW)).toEqual([])
  })
})

describe('a failed read never reads as "nothing there"', () => {
  it('countHorizon returns null when a rail is down — the generator treats that as FULL and stays quiet', async () => {
    store.throwOn = 'blog_post'
    expect(await countHorizon(ORG, NOW)).toBeNull()
  })

  it('countHorizon counts BOTH rails when both are readable', async () => {
    store.social = [{ id: 's1', summary: 'One.', status: 'scheduled', scheduledAt: new Date(NOW.getTime() + DAY) }]
    store.blog = [{ id: 'b1', title: 'Two', status: 'scheduled', scheduledFor: new Date(NOW.getTime() + 2 * DAY) }]
    expect(await countHorizon(ORG, NOW)).toBe(2)
  })

  it('the REPORT degrades to empty rather than breaking the page it sits on', async () => {
    store.throwOn = 'social_post'
    expect(await getUpcomingContent(ORG, TZ, NOW)).toEqual([])
  })
})

describe('the schedule', () => {
  it('lands on clinic-local publish hour, not the server’s', async () => {
    const { dates } = planSchedule(NOW, TZ, 4)
    // 10 AM Chicago in July is 15:00 UTC.
    for (const d of dates) expect(d.getUTCHours()).toBe(PUBLISH_HOUR + 5)
  })

  it('reads the day-of-week in the CLINIC’s calendar, not the server’s', () => {
    // 2026-08-01T02:00Z is Saturday in UTC but still Friday evening in Chicago.
    const boundary = new Date('2026-08-01T02:00:00Z')
    expect(clinicLocalDow(boundary, 'UTC')).toBe(6)
    expect(clinicLocalDow(boundary, TZ)).toBe(5)
  })

  it('offsets and dates come from ONE computation — the card’s days and its dates can never disagree', () => {
    const { offsets, dates } = planSchedule(NOW, TZ, 4)
    expect(offsets).toHaveLength(dates.length)
    for (let i = 0; i < offsets.length; i++) {
      const days = Math.round((dates[i].getTime() - dates[0].getTime()) / DAY)
      expect(days).toBe(offsets[i] - offsets[0])
    }
  })
})
