import { describe, it, expect } from 'vitest'

/**
 * Prospecting config resolver — the safety contract: defaults ship OFF
 * (killSwitch + dryRun true), junk never poisons the config, and partial
 * blobs merge over defaults so new knobs never need a backfill.
 */

import { resolveProspectingConfig, PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

describe('resolveProspectingConfig', () => {
  it('ships OFF: null/absent config → killSwitch + dryRun both true', () => {
    const c = resolveProspectingConfig(null)
    expect(c.killSwitch).toBe(true)
    expect(c.dryRun).toBe(true)
    expect(c.enabledStates).toEqual([])
    expect(c).toEqual(PROSPECTING_DEFAULTS)
  })

  it('merges partial blobs over defaults', () => {
    const c = resolveProspectingConfig({ killSwitch: false, enabledStates: ['GA'] })
    expect(c.killSwitch).toBe(false)
    expect(c.enabledStates).toEqual(['GA'])
    expect(c.dryRun).toBe(true) // untouched default
    expect(c.warmup.startPerDay).toBe(20)
    expect(c.budgets.placesPerMonth).toBe(2000)
  })

  it('rejects junk without throwing: bad states filtered, bad numbers defaulted', () => {
    const c = resolveProspectingConfig({
      enabledStates: ['GA', 'georgia', 42, 'F', 'FL'],
      warmup: { startPerDay: -5, ceilingPerDay: 'lots' },
      sendWindow: { startHour: 99 },
      budgets: { placesPerMonth: Number.NaN },
    })
    expect(c.enabledStates).toEqual(['GA', 'FL'])
    expect(c.warmup.startPerDay).toBe(20)
    expect(c.warmup.ceilingPerDay).toBe(150)
    expect(c.sendWindow.startHour).toBeLessThanOrEqual(23)
    expect(c.budgets.placesPerMonth).toBe(2000)
  })

  it('never returns shared mutable defaults', () => {
    const a = resolveProspectingConfig(null)
    a.warmup.startPerDay = 999
    a.autoEnroll.bands.push('cool')
    expect(resolveProspectingConfig(null).warmup.startPerDay).toBe(20)
    expect(resolveProspectingConfig(null).autoEnroll.bands).toEqual(['hot', 'warm'])
    expect(PROSPECTING_DEFAULTS.warmup.startPerDay).toBe(20)
  })

  it('hunter keys ship safe: autoEnroll off, watchdog on, digest on', () => {
    const c = resolveProspectingConfig(null)
    expect(c.autoEnroll).toEqual({ enabled: false, bands: ['hot', 'warm'], perDay: 50 })
    expect(c.watchdog.enabled).toBe(true)
    expect(c.watchdog.maxComplaintPct).toBe(0.3)
    expect(c.digest.enabled).toBe(true)
  })

  it('preserves fractional watchdog percentages (num() would round them away)', () => {
    const c = resolveProspectingConfig({ watchdog: { maxComplaintPct: 0.25, maxBouncePct: 3.5 } })
    expect(c.watchdog.maxComplaintPct).toBe(0.25)
    expect(c.watchdog.maxBouncePct).toBe(3.5)
  })

  it('filters junk auto-enroll bands, keeps a nonempty set, defaults when emptied', () => {
    expect(resolveProspectingConfig({ autoEnroll: { bands: ['hot', 'nonsense', 'low'] } }).autoEnroll.bands)
      .toEqual(['hot', 'low'])
    // All-junk bands fall back to the default rather than an empty set.
    expect(resolveProspectingConfig({ autoEnroll: { bands: ['nope'] } }).autoEnroll.bands)
      .toEqual(['hot', 'warm'])
  })

  it('merges partial hunter blobs over defaults', () => {
    const c = resolveProspectingConfig({ autoEnroll: { enabled: true }, digest: { enabled: false } })
    expect(c.autoEnroll.enabled).toBe(true)
    expect(c.autoEnroll.perDay).toBe(50) // untouched default
    expect(c.digest.enabled).toBe(false)
  })

  it('brain defaults to empty override + no battle cards', () => {
    expect(resolveProspectingConfig(null).brain).toEqual({ productOverride: '', battleCards: [] })
  })

  it('resolves the brain: keeps a string override, filters + clamps battle cards', () => {
    const c = resolveProspectingConfig({
      brain: {
        productOverride: 'my custom pitch',
        battleCards: [
          { competitor: 'Weave', angle: 'cheaper + dental-only' },
          { competitor: '', angle: 'orphan' }, // dropped (blank competitor)
          { competitor: 'X', angle: '' }, // dropped (blank angle)
          { competitor: 123, angle: 'bad type' }, // dropped (non-string)
        ],
      },
    })
    expect(c.brain.productOverride).toBe('my custom pitch')
    expect(c.brain.battleCards).toEqual([{ competitor: 'Weave', angle: 'cheaper + dental-only' }])
  })

  it('tolerates junk brain shapes', () => {
    expect(resolveProspectingConfig({ brain: 'nope' }).brain).toEqual({
      productOverride: '',
      battleCards: [],
    })
    expect(resolveProspectingConfig({ brain: { battleCards: 'nope' } }).brain.battleCards).toEqual([])
  })

  it('caps battle cards at 20 and clamps field lengths', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      competitor: 'C'.repeat(200),
      angle: `angle ${i} ${'z'.repeat(1000)}`,
    }))
    const c = resolveProspectingConfig({ brain: { battleCards: many } })
    expect(c.brain.battleCards.length).toBe(20)
    expect(c.brain.battleCards[0].competitor.length).toBe(80)
    expect(c.brain.battleCards[0].angle.length).toBe(600)
  })
})
