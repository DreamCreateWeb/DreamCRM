/**
 * ML-40 — the Guardian carries the site-traffic drop to the OWNER, through
 * the clinic's own rule (lib/website-health.ts) and never a second threshold.
 */
import { describe, it, expect } from 'vitest'
import {
  assessEngine,
  clinicActionable,
  clinicNote,
  detectTrafficDrop,
  guardianTrafficLines,
  resolveGuardianAudience,
  trafficDropLine,
  type EngineSignals,
} from '@/lib/guardian'
import { TRAFFIC_DROP_MIN_PRIOR, websiteHealthNotice } from '@/lib/website-health'
import { buildProspectingDigestContent } from '@/lib/services/prospecting-digest'

const HEALTHY: EngineSignals = {
  ageDays: 400,
  actions7: 20,
  actionsPrev7: 20,
  failures7: 0,
  engineFailures7: 0,
  remindersOn: true,
  reviewRequestsOn: true,
  seated30: 10,
  seatedPrev30: 10,
  openProposals: 0,
  hoursSinceCycle: 1,
  pmsWriteOpsParked: 0,
  pmsWriteOpParkedDays: null,
}

describe('detectTrafficDrop — the clinic rule, imported', () => {
  it('agrees with websiteHealthNotice at every boundary (no second threshold)', () => {
    const cases: Array<[number, number]> = [
      [15, 30], // exactly half of the floor week — a drop
      [16, 30], // just above half
      [0, TRAFFIC_DROP_MIN_PRIOR], // dead site
      [3, TRAFFIC_DROP_MIN_PRIOR - 1], // prior week below the floor — noise
      [100, 400],
      [200, 400],
      [201, 400],
    ]
    for (const [total, prev] of cases) {
      const clinicSays = websiteHealthNotice({ total, totalPrev: prev, leads14d: null })?.kind === 'traffic_drop'
      expect(detectTrafficDrop(total, prev) !== null).toBe(clinicSays)
    }
  })
})

describe('trafficDropLine — the owner\'s sentence', () => {
  it('halved reads "halved", a deeper fall says the percent, units and window named', () => {
    const halved = trafficDropLine('Dream Dental', { trafficDrop: { total: 200, totalPrev: 400 } })
    expect(halved).toMatch(/^Dream Dental’s site traffic halved this week/)
    expect(halved).toMatch(/400 → 200 visits, last 7 days vs the 7 before, UTC/)
    expect(trafficDropLine('Dream Dental', { trafficDrop: { total: 40, totalPrev: 400 } })).toMatch(/fell 90%/)
  })

  it('says nothing when there is no drop, or the read was absent', () => {
    expect(trafficDropLine('Dream Dental', { trafficDrop: null })).toBeNull()
    expect(trafficDropLine('Dream Dental', {})).toBeNull()
  })

  it('never says "your" — it is the platform owner\'s line', () => {
    expect(trafficDropLine('Dream Dental', { trafficDrop: { total: 1, totalPrev: 100 } })).not.toMatch(/\byour\b/i)
  })
})

describe('guardianTrafficLines', () => {
  const reports = [
    { clinicName: 'A', signals: { ...HEALTHY, trafficDrop: { total: 10, totalPrev: 100 } } },
    { clinicName: 'B', signals: HEALTHY },
  ]
  it('one line per clinic with a drop', () => {
    expect(guardianTrafficLines({ blind: false, reports })).toHaveLength(1)
  })
  it('a blind sweep adds nothing — never a fabricated all-clear or a stale alarm', () => {
    expect(guardianTrafficLines({ blind: true, reports })).toEqual([])
  })
})

describe('the AUDIENCE LOCK is untouched', () => {
  const dropping: EngineSignals = { ...HEALTHY, trafficDrop: { total: 1, totalPrev: 500 } }

  it('a traffic drop moves no state and gives the clinic no note', () => {
    expect(assessEngine(dropping).state).toBe(assessEngine(HEALTHY).state)
    expect(clinicActionable(assessEngine(dropping).state, dropping)).toBe(false)
    expect(clinicNote(assessEngine(dropping).state, dropping)).toBeNull()
  })

  it('the audience still floors at platform', () => {
    expect(resolveGuardianAudience({})).toBe('platform')
  })
})

describe('the owner digest carries the line', () => {
  const stats = (guardianLines?: string[]) => ({
    hunt: { sent24h: 0, dryRun24h: 0, opens24h: 0, clicks24h: 0, replies24h: 0, newCallList24h: 0, autoEnrolledToday: 0, watchdogTripped: false } as never,
    funnel: { discovered: 0, enriched: 0, contacted: 0, engaged: 0, callList: 0, converted: 0 } as never,
    watchdogTripped: false,
    callList: [],
    guardianLines,
  })

  it('a quiet hunt day with a traffic drop still sends, and says it', () => {
    const c = buildProspectingDigestContent(stats(['Dream Dental’s site traffic halved this week.']))
    expect(c.hasContent).toBe(true)
    expect(c.body).toContain('The Guardian')
    expect(c.body).toContain('site traffic halved')
  })

  it('a quiet day with nothing to say stays silent', () => {
    expect(buildProspectingDigestContent(stats([])).hasContent).toBe(false)
  })
})
