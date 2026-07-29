import { describe, it, expect } from 'vitest'
import {
  assessEngine,
  needsAttention,
  summarizeSweep,
  ENGINE_STATE_RANK,
  FAILURE_ALARM_COUNT,
  NEW_CLINIC_GRACE_DAYS,
  STALL_MIN_BASELINE,
  type EngineSignals,
} from '@/lib/guardian'

/**
 * THE GUARDIAN's verdict (Transformation Phase 4 — DESIGN.md primitive #5).
 * Pins the severity ladder that decides which clinics land on the platform
 * owner's list, and the two ways a guardian fails: crying wolf (so the list
 * gets ignored) and staying quiet while a clinic's machine is dead.
 */

const HEALTHY: EngineSignals = {
  ageDays: 200,
  actions7: 40,
  actionsPrev7: 38,
  failures7: 0,
  remindersOn: true,
  reviewRequestsOn: true,
  seated30: 9,
  seatedPrev30: 8,
  openProposals: 1,
}
const sig = (over: Partial<EngineSignals> = {}): EngineSignals => ({ ...HEALTHY, ...over })

describe('assessEngine — severity order', () => {
  it('a running practice is healthy and says what it did', () => {
    const v = assessEngine(sig())
    expect(v.state).toBe('healthy')
    expect(v.recommendation).toBeNull()
    expect(v.headline).toContain('40')
  })

  it('SILENT is the loudest signal: two empty weeks on an established clinic', () => {
    const v = assessEngine(sig({ actions7: 0, actionsPrev7: 0 }))
    expect(v.state).toBe('silent')
    expect(v.recommendation).toBeTruthy()
    // The reason a clinic can't catch this themselves belongs in the why.
    expect(v.why).toMatch(/ledger is empty|14 days/i)
  })

  it('a BRAND-NEW clinic with an empty ledger is starting, not broken', () => {
    const v = assessEngine(sig({ ageDays: 3, actions7: 0, actionsPrev7: 0 }))
    expect(v.state).toBe('quiet')
    expect(needsAttention(v.state)).toBe(false)
    expect(v.headline).toMatch(/getting started/i)
    // Still worth a human touch — but as a welcome, not an alarm.
    expect(v.recommendation).toBeTruthy()
  })

  it('repeated failures outrank switched-off engines — a stale connection is ours to fix', () => {
    const v = assessEngine(
      sig({ failures7: FAILURE_ALARM_COUNT, remindersOn: false, reviewRequestsOn: false }),
    )
    expect(v.state).toBe('blocked')
    expect(v.headline).toMatch(/tried and couldn’t/i)
  })

  it('one or two failures in a week is bad luck, not an alarm', () => {
    expect(assessEngine(sig({ failures7: FAILURE_ALARM_COUNT - 1 })).state).toBe('healthy')
  })

  it('both engines off is BLOCKED, and the recommendation asks WHY rather than scolding', () => {
    const v = assessEngine(sig({ remindersOn: false, reviewRequestsOn: false }))
    expect(v.state).toBe('blocked')
    expect(v.recommendation).toMatch(/ask what made them/i)
  })

  it('one engine off is not blocked — the machine can still act', () => {
    expect(assessEngine(sig({ remindersOn: false })).state).toBe('healthy')
  })
})

describe('assessEngine — the stall, measured against the practice itself', () => {
  it('a halved new-patient month on a live clinic is a STALL, with the numbers in the why', () => {
    const v = assessEngine(sig({ seated30: 3, seatedPrev30: 12 }))
    expect(v.state).toBe('stalled')
    expect(v.headline).toContain('75%')
    expect(v.why).toContain('12')
    expect(v.why).toContain('3')
  })

  it('a small practice is never stalled on noise — 1 from 3 is a Tuesday', () => {
    expect(assessEngine(sig({ seated30: 1, seatedPrev30: STALL_MIN_BASELINE - 1 })).state).toBe(
      'healthy',
    )
  })

  it('a mild dip is not a stall', () => {
    expect(assessEngine(sig({ seated30: 7, seatedPrev30: 10 })).state).toBe('healthy')
  })

  it('a young clinic is never stalled — it has no baseline to fall from', () => {
    expect(
      assessEngine(sig({ ageDays: NEW_CLINIC_GRACE_DAYS - 1, seated30: 0, seatedPrev30: 12 })).state,
    ).toBe('healthy')
  })

  it('silence outranks a stall — a dead machine explains the drop', () => {
    const v = assessEngine(sig({ actions7: 0, actionsPrev7: 0, seated30: 0, seatedPrev30: 12 }))
    expect(v.state).toBe('silent')
  })
})

describe('assessEngine — quiet is not a problem', () => {
  it('one empty week after a normal one reads QUIET and stays off the list', () => {
    const v = assessEngine(sig({ actions7: 0, actionsPrev7: 30 }))
    expect(v.state).toBe('quiet')
    expect(needsAttention(v.state)).toBe(false)
    expect(v.recommendation).toBeNull()
  })

  it('only silent / blocked / stalled reach the owner — crying wolf is how a guardian gets ignored', () => {
    expect(needsAttention('silent')).toBe(true)
    expect(needsAttention('blocked')).toBe(true)
    expect(needsAttention('stalled')).toBe(true)
    expect(needsAttention('quiet')).toBe(false)
    expect(needsAttention('healthy')).toBe(false)
  })

  it('the rank puts the worst first', () => {
    const order = (['healthy', 'silent', 'quiet', 'blocked', 'stalled'] as const)
      .slice()
      .sort((a, b) => ENGINE_STATE_RANK[a] - ENGINE_STATE_RANK[b])
    expect(order).toEqual(['silent', 'blocked', 'stalled', 'quiet', 'healthy'])
  })
})

describe('summarizeSweep — the line above the names', () => {
  it('reports all-clear as good news, not an empty state', () => {
    expect(summarizeSweep(['healthy', 'quiet', 'healthy'])).toBe('All 3 practices are running normally.')
  })

  it('counts only the ones that need a human', () => {
    expect(summarizeSweep(['silent', 'healthy', 'stalled', 'quiet'])).toBe('2 of 4 practices need you.')
  })

  it('reads correctly for a single practice', () => {
    expect(summarizeSweep(['healthy'])).toBe('All 1 practice is running normally.')
    expect(summarizeSweep(['blocked'])).toBe('1 of 1 practice needs you.')
  })

  it('says nothing alarming with no clinics yet', () => {
    expect(summarizeSweep([])).toBe('No clinics to watch yet.')
  })
})

describe('the guardian voice', () => {
  it('never shames and never exclaims', () => {
    const all = [
      assessEngine(sig()),
      assessEngine(sig({ actions7: 0, actionsPrev7: 0 })),
      assessEngine(sig({ ageDays: 2, actions7: 0, actionsPrev7: 0 })),
      assessEngine(sig({ failures7: 5 })),
      assessEngine(sig({ remindersOn: false, reviewRequestsOn: false })),
      assessEngine(sig({ seated30: 2, seatedPrev30: 12 })),
      assessEngine(sig({ actions7: 0, actionsPrev7: 12 })),
    ]
    for (const v of all) {
      const text = `${v.headline} ${v.why} ${v.recommendation ?? ''}`
      expect(text).not.toContain('!')
      // The platform owner reads this about SOMEONE ELSE's practice — the
      // clinic-facing second person would be the wrong voice entirely
      // (the tenant-voice convention).
      expect(text).not.toMatch(/\byour patients\b|\byour practice\b|\byour clinic\b/i)
    }
  })
})
