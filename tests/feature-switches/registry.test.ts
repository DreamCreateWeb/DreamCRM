import { describe, it, expect } from 'vitest'
import {
  ALL_OFF,
  ALL_ON,
  FEATURE_BY_KEY,
  FEATURE_INTRO,
  FEATURE_SWITCHES,
  SWITCHED_MODULE_IDS,
  doorsOpenedBy,
  featureForModule,
  splitModulesBySwitch,
} from '@/lib/feature-switches'
import { clinicModules } from '@/lib/modules/clinic'

/**
 * THE FEATURE SWITCHES' REGISTRY (docs/ACTIVATION.md law 1, S3). Pins: the
 * day-one set is never switched; every switch names a real clinic module
 * at its real path; the split is exact and order-preserving; the doors an
 * activation event opens; and the intro copy's shape — three lines each
 * way, honest, and never "coming soon" (law 3 retires the phrase).
 */

const DAY_ONE = ['overview', 'dream_team', 'messages', 'appointments', 'patients', 'settings', 'website', 'integrations']

describe('feature-switch registry', () => {
  it('never switches a day-one module, and every switch names a real module at its own path', () => {
    const byId = new Map(clinicModules.modules.map((m) => [m.id, m]))
    for (const id of DAY_ONE) expect(featureForModule(id), id).toBeNull()
    for (const f of FEATURE_SWITCHES) {
      const m = byId.get(f.moduleId)
      expect(m, `${f.key} → ${f.moduleId}`).toBeTruthy()
      expect(m!.path).toBe(f.path)
      expect(SWITCHED_MODULE_IDS.has(f.moduleId)).toBe(true)
    }
    expect(new Set(FEATURE_SWITCHES.map((f) => f.column)).size).toBe(FEATURE_SWITCHES.length)
  })

  it('splits exactly the switched-off modules into "add", preserving registry order', () => {
    const all = splitModulesBySwitch(clinicModules.modules, ALL_ON)
    expect(all.add).toEqual([])
    expect(all.on.map((m) => m.id)).toEqual(clinicModules.modules.map((m) => m.id))

    const none = splitModulesBySwitch(clinicModules.modules, ALL_OFF)
    expect(none.add.map((m) => m.id)).toEqual(FEATURE_SWITCHES.map((f) => f.moduleId))
    expect(none.on.map((m) => m.id)).toEqual(clinicModules.modules.filter((m) => !SWITCHED_MODULE_IDS.has(m.id)).map((m) => m.id))
    for (const id of DAY_ONE) expect(none.on.some((m) => m.id === id), id).toBe(true)

    const some = splitModulesBySwitch(clinicModules.modules, { ...ALL_OFF, my_day: true, growth: true })
    expect(some.on.some((m) => m.id === 'my_day')).toBe(true)
    expect(some.on.some((m) => m.id === 'growth')).toBe(true)
    expect(some.add.some((m) => m.id === 'followups')).toBe(true)
  })

  it('A1 opens My Day + Follow-ups; the site going live opens Inquiries; nothing else opens itself', () => {
    expect(doorsOpenedBy('a1').sort()).toEqual(['followups', 'my_day'])
    expect(doorsOpenedBy('site_live')).toEqual(['leads'])
    for (const f of FEATURE_SWITCHES) {
      if (!['my_day', 'followups', 'leads'].includes(f.key)) expect(f.autoOpen, f.key).toBeNull()
    }
  })

  it('every generic intro says three things it does and three things to know, and never "coming soon"', () => {
    for (const f of FEATURE_SWITCHES) {
      if (f.ownIntro) continue
      expect(f.does.length, f.key).toBe(3)
      expect(f.know.length, f.key).toBe(3)
      for (const line of [f.lede, ...f.does, ...f.know]) expect(line.toLowerCase(), `${f.key}: ${line}`).not.toContain('coming soon')
    }
    expect(FEATURE_BY_KEY.insurance.ownIntro).toBe(true)
    expect(FEATURE_INTRO.turnOn('My Day')).toBe('Turn on My Day')
    expect(FEATURE_INTRO.turnOffConfirm('Shop')).toMatch(/Nothing is deleted/)
  })
})
