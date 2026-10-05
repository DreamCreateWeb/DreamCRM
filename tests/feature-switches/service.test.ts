import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE SWITCHES' SERVER HALF (docs/ACTIVATION.md S3). Pins: the read maps
 * every column to its key and FAILS OPEN; a missing profile row reads as
 * every door closed; `openDoors` touches only the columns still null,
 * through `coalesce`, and reports which it opened; disable clears one
 * column; the two event entry points never throw.
 */

const state = {
  rows: [] as Array<Record<string, unknown>>,
  throwOnRead: false,
  updates: [] as Array<Record<string, unknown>>,
  throwOnUpdate: false,
}
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const select = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => {
      if (state.throwOnRead) throw new Error('db down')
      return state.rows
    }
    return obj
  }
  const update = () => ({
    set: (patch: Record<string, unknown>) => ({
      where: async () => {
        if (state.throwOnUpdate) throw new Error('db down')
        state.updates.push(patch)
      },
    }),
  })
  return { schema, db: { select, update } }
})

import { disableFeature, enableFeature, getFeatureSwitchState, openDoors, openDoorsAtA1, openDoorsAtSiteLive } from '@/lib/services/feature-switches'
import { ALL_OFF, ALL_ON } from '@/lib/feature-switches'

const NOW = new Date('2026-10-12T15:00:00Z')

beforeEach(() => {
  state.rows = []
  state.throwOnRead = false
  state.updates = []
  state.throwOnUpdate = false
})

describe('getFeatureSwitchState', () => {
  it('maps each column to its key; a missing row is every door closed', async () => {
    // `cache()` memoises per key inside one request scope; distinct org ids keep the cases apart.
    state.rows = [{ myDayEnabledAt: NOW, growthEnabledAt: NOW, insuranceEnabledAt: null }]
    const on = await getFeatureSwitchState('org_mapped')
    expect(on).toEqual({ ...ALL_OFF, my_day: true, growth: true })
    state.rows = []
    expect(await getFeatureSwitchState('org_missing')).toEqual(ALL_OFF)
  })

  it('fails OPEN when the read breaks — a transient error must not hide pages a clinic chose', async () => {
    state.throwOnRead = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getFeatureSwitchState('org_broken')).toEqual(ALL_ON)
    spy.mockRestore()
  })
})

describe('openDoors', () => {
  it('sets only the columns still null, via coalesce, and returns the keys it opened', async () => {
    state.rows = [{ myDayEnabledAt: NOW }]
    const opened = await openDoors('org_a', ['my_day', 'followups', 'leads'], NOW)
    expect(opened.sort()).toEqual(['followups', 'leads'])
    expect(state.updates).toHaveLength(1)
    const patch = state.updates[0]
    expect(Object.keys(patch).sort()).toEqual(['followupsEnabledAt', 'leadsEnabledAt'])
    // Each value is a drizzle `sql` fragment whose string chunks carry the coalesce.
    for (const v of Object.values(patch)) {
      const chunks = (v as { queryChunks: Array<{ value?: string[] }> }).queryChunks
      const text = chunks.flatMap((c) => c.value ?? []).join('')
      expect(text).toMatch(/coalesce\(/)
      expect(text).toContain('::timestamp')
    }
  })

  it('is a no-op when every named door is already open, and with no keys', async () => {
    state.rows = [{ myDayEnabledAt: NOW, followupsEnabledAt: NOW }]
    expect(await openDoors('org_a', ['my_day', 'followups'], NOW)).toEqual([])
    expect(await openDoors('org_a', [], NOW)).toEqual([])
    expect(state.updates).toEqual([])
  })

  it('enableFeature opens one door; disableFeature clears exactly one column', async () => {
    state.rows = [{}]
    await enableFeature('org_a', 'shop', NOW)
    expect(Object.keys(state.updates[0])).toEqual(['shopEnabledAt'])
    await disableFeature('org_a', 'shop')
    expect(state.updates[1]).toEqual({ shopEnabledAt: null })
  })

  it('the A1 and site-live entry points open their own doors and never throw', async () => {
    state.rows = [{}]
    expect((await openDoorsAtA1('org_a', NOW)).sort()).toEqual(['followups', 'my_day'])
    expect(await openDoorsAtSiteLive('org_a', NOW)).toEqual(['leads'])
    state.throwOnUpdate = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await openDoorsAtA1('org_a', NOW)).toEqual([])
    expect(await openDoorsAtSiteLive('org_a', NOW)).toEqual([])
    spy.mockRestore()
  })
})
