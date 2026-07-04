import { describe, it, expect } from 'vitest'
import { chooseNextAction, type BriefingSignals } from '@/lib/prospecting-briefing'

/**
 * The daily briefing's priority ladder — the single "do this now" the owner
 * sees each morning. A booked demo beats a warm hand-raiser beats a cold call
 * beats housekeeping; it always returns something actionable.
 */

const base: BriefingSignals = {
  demosToday: 0,
  firstDemoName: null,
  firstDemoWhen: null,
  callFirstCount: 0,
  topCallName: null,
  phoneQueueCount: 0,
  overnightHotCount: 0,
  killSwitch: false,
  dryRun: false,
  senderReady: true,
}

describe('chooseNextAction', () => {
  it('kill switch trumps everything', () => {
    const a = chooseNextAction({ ...base, killSwitch: true, demosToday: 3, callFirstCount: 9 })
    expect(a.headline).toMatch(/switched off/i)
    expect(a.href).toContain('/settings')
  })

  it("today's demo is the top priority when the engine is on", () => {
    const a = chooseNextAction({ ...base, demosToday: 2, firstDemoName: 'Bright Smiles', firstDemoWhen: '2:00 PM', callFirstCount: 5 })
    expect(a.headline).toMatch(/demo today/i)
    expect(a.sub).toContain('Bright Smiles')
    expect(a.sub).toContain('2:00 PM')
  })

  it('warm hand-raisers beat cold calls', () => {
    const a = chooseNextAction({ ...base, callFirstCount: 4, topCallName: 'Dr. Roe', phoneQueueCount: 20 })
    expect(a.headline).toMatch(/raised a hand/i)
    expect(a.sub).toContain('Dr. Roe')
  })

  it('phone-first queue when there are no warm replies', () => {
    const a = chooseNextAction({ ...base, phoneQueueCount: 12 })
    expect(a.headline).toMatch(/no email/i)
    expect(a.icon).toBe('📵')
  })

  it('nudges to go live when idle + dry-run', () => {
    const a = chooseNextAction({ ...base, dryRun: true })
    expect(a.headline).toMatch(/dry-run/i)
  })

  it('falls back to "hunting" when live + idle, surfacing overnight arrivals', () => {
    const a = chooseNextAction({ ...base, overnightHotCount: 7 })
    expect(a.headline).toMatch(/hunting/i)
    expect(a.sub).toContain('7')
  })
})
