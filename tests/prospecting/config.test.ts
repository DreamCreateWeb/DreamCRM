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
    expect(resolveProspectingConfig(null).warmup.startPerDay).toBe(20)
    expect(PROSPECTING_DEFAULTS.warmup.startPerDay).toBe(20)
  })
})
