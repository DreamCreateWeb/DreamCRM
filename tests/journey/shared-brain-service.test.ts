import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE LEARNING PASS (Phase 4 slice 5). Pins the one behaviour that is not
 * in the pure half: a pass that cannot READ must not overwrite what the
 * platform already knew. "We lost the database for an hour" must never read
 * as "we un-learned the best send hour".
 */

const state = vi.hoisted(() => ({
  stats: [] as Array<Record<string, unknown>>,
  readThrows: false,
  stored: {} as Record<string, unknown>,
  writes: [] as Array<Record<string, unknown>>,
  writeThrows: false,
}))

vi.mock('@/lib/db', () => ({
  db: {
    execute: async () => {
      if (state.readThrows) throw new Error('aggregate down')
      return { rows: state.stats }
    },
  },
  schema: {
    campaignEvents: { __name: 'campaign_events' },
    campaigns: { __name: 'campaigns' },
    clinicProfile: { __name: 'clinic_profile' },
  },
}))
vi.mock('drizzle-orm', () => ({ sql: () => ({ op: 'sql' }) }))
vi.mock('@/lib/services/platform-config', () => ({
  readPlatformConfig: vi.fn(async () => state.stored),
  writePlatformConfig: vi.fn(async (patch: Record<string, unknown>) => {
    if (state.writeThrows) throw new Error('write down')
    state.writes.push(patch)
    Object.assign(state.stored, patch)
  }),
}))

import { runSharedBrainLearning, getSharedBrain } from '@/lib/services/shared-brain'
import { DEFAULT_SEND_HOUR, MIN_CLINICS_PER_HOUR } from '@/lib/shared-brain'

const NOW = new Date('2026-07-29T15:00:00Z')

beforeEach(() => {
  state.stats = []
  state.readThrows = false
  state.stored = {}
  state.writes = []
  state.writeThrows = false
})

const bucket = (hour: number, sent: number, opened: number, clinics = MIN_CLINICS_PER_HOUR) => ({
  hour,
  sent,
  opened,
  clinics,
})

describe('runSharedBrainLearning', () => {
  it('stores what it learned, stamped', async () => {
    state.stats = [bucket(15, 1000, 500), bucket(DEFAULT_SEND_HOUR, 1000, 200)]
    const r = await runSharedBrainLearning(NOW)

    expect(r.ok).toBe(true)
    expect(r.finding.hour).toBe(15)
    expect(r.finding.learned).toBe(true)
    const written = state.writes[0].sharedBrain as Record<string, unknown>
    expect(written.sendHour).toBe(15)
    expect(written.sendHourLearned).toBe(true)
    expect(written.learnedAt).toBe(NOW.toISOString())
  })

  it('writes only its OWN key — a shallow merge must not clobber the audience lock', async () => {
    state.stored = { guardianAudience: 'clinic' }
    await runSharedBrainLearning(NOW)
    expect(Object.keys(state.writes[0])).toEqual(['sharedBrain'])
    expect(state.stored.guardianAudience).toBe('clinic')
  })

  it('records an honest "not enough yet" rather than nothing at all', async () => {
    state.stats = [bucket(15, 4, 4, 1)]
    const r = await runSharedBrainLearning(NOW)
    expect(r.ok).toBe(true)
    expect(r.finding.learned).toBe(false)
    expect(r.finding.hour).toBe(DEFAULT_SEND_HOUR)
    // It still stamps: "we looked and there wasn't enough" is a real result.
    expect(state.writes).toHaveLength(1)
  })

  it('a FAILED read never un-learns — the stored value survives untouched', async () => {
    state.stored = {
      sharedBrain: { sendHour: 15, sendHourLearned: true, sendHourWhy: 'because', learnedAt: 'x' },
    }
    state.readThrows = true

    const r = await runSharedBrainLearning(NOW)
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
    // Nothing written, and the pass reports back what still stands.
    expect(state.writes).toHaveLength(0)
    expect(r.finding.hour).toBe(15)
    expect(r.finding.learned).toBe(true)
  })

  it('a failed read on a platform that never learned reports the shipped default', async () => {
    state.readThrows = true
    const r = await runSharedBrainLearning(NOW)
    expect(r.ok).toBe(false)
    expect(r.finding.hour).toBe(DEFAULT_SEND_HOUR)
    expect(r.finding.learned).toBe(false)
  })

  it('coerces whatever the driver hands back — string counts are still counts', async () => {
    // node-postgres returns bigint aggregates as strings often enough that
    // a raw compare would silently disqualify every bucket.
    state.stats = [{ hour: '15', sent: '1000', opened: '500', clinics: '4' }]
    const r = await runSharedBrainLearning(NOW)
    expect(r.finding.hour).toBe(15)
    expect(r.finding.learned).toBe(true)
  })

  it('tolerates a driver that returns a bare array instead of {rows}', async () => {
    state.stats = [bucket(15, 1000, 500)]
    const r = await runSharedBrainLearning(NOW)
    expect(r.ok).toBe(true)
  })
})

describe('getSharedBrain', () => {
  it('reads the stored brain back', async () => {
    state.stored = { sharedBrain: { sendHour: 16, sendHourLearned: true, sendHourWhy: 'w', learnedAt: 'x' } }
    expect((await getSharedBrain()).sendHour).toBe(16)
  })

  it('floors an empty platform at the shipped default', async () => {
    expect((await getSharedBrain()).sendHour).toBe(DEFAULT_SEND_HOUR)
  })
})
