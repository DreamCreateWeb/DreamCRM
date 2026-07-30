import { describe, it, expect } from 'vitest'
import {
  assessEngine,
  clinicActionable,
  clinicNote,
  needsAttention,
  resolveGuardianAudience,
  summarizeSweep,
  shouldAlert,
  ENGINE_STATE_RANK,
  FAILURE_ALARM_COUNT,
  NEW_CLINIC_GRACE_DAYS,
  PILEUP_COUNT,
  RE_ALERT_DAYS,
  STALL_MIN_BASELINE,
  type EngineSignals,
  type EngineState,
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

/**
 * WHEN TO INTERRUPT. A guardian that emails the same problem every morning
 * gets muted, and a muted guardian is worse than none.
 */
describe('shouldAlert', () => {
  const NOW = new Date('2026-07-29T12:00:00Z')
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

  it('never interrupts for a state that does not need a human', () => {
    expect(shouldAlert({ state: null, alertedAt: null }, 'healthy', NOW)).toBe(false)
    expect(shouldAlert({ state: null, alertedAt: null }, 'quiet', NOW)).toBe(false)
  })

  it('raises a NEW problem immediately', () => {
    expect(shouldAlert({ state: null, alertedAt: null }, 'silent', NOW)).toBe(true)
    expect(shouldAlert({ state: 'healthy', alertedAt: null }, 'blocked', NOW)).toBe(true)
  })

  it('raises a CHANGED problem — silent becoming blocked is news even though both were bad', () => {
    expect(shouldAlert({ state: 'silent', alertedAt: daysAgo(1) }, 'blocked', NOW)).toBe(true)
  })

  it('stays quiet about the SAME problem until the re-alert cadence', () => {
    expect(shouldAlert({ state: 'silent', alertedAt: daysAgo(1) }, 'silent', NOW)).toBe(false)
    expect(shouldAlert({ state: 'silent', alertedAt: daysAgo(RE_ALERT_DAYS - 1) }, 'silent', NOW)).toBe(
      false,
    )
    expect(shouldAlert({ state: 'silent', alertedAt: daysAgo(RE_ALERT_DAYS) }, 'silent', NOW)).toBe(true)
  })

  it('a missing stamp never silences a real alarm', () => {
    expect(shouldAlert({ state: 'silent', alertedAt: null }, 'silent', NOW)).toBe(true)
  })

  it('a recovered clinic that breaks again is a new problem, not a repeat', () => {
    // silent → healthy (memory now 'healthy') → silent again
    expect(shouldAlert({ state: 'healthy', alertedAt: daysAgo(2) }, 'silent', NOW)).toBe(true)
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * THE AUDIENCE LOCK (Phase 4 slice 3)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The Guardian ships talking only to Dream Create. Everything here defends
 * one property: nothing that is merely absent, malformed, or half-written
 * may ever widen it to customers.
 */
describe('resolveGuardianAudience — closed unless a human opened it', () => {
  it('defaults to platform-only', () => {
    expect(resolveGuardianAudience(undefined)).toBe('platform')
    expect(resolveGuardianAudience(null)).toBe('platform')
    expect(resolveGuardianAudience({})).toBe('platform')
  })

  it('opens ONLY on the exact literal — anything else floors closed', () => {
    expect(resolveGuardianAudience({ guardianAudience: 'clinic' })).toBe('clinic')
    for (const bad of ['Clinic', 'clinics', 'CLINIC', true, 1, ['clinic'], { v: 'clinic' }, '']) {
      expect(resolveGuardianAudience({ guardianAudience: bad })).toBe('platform')
    }
  })

  it('a non-object config never opens it', () => {
    for (const bad of ['clinic', 42, true, []]) {
      expect(resolveGuardianAudience(bad)).toBe('platform')
    }
  })
})

describe('clinicActionable — what is theirs to fix, and what is ours', () => {
  it('a switch THEY turned off is theirs', () => {
    expect(clinicActionable('blocked', sig({ remindersOn: false }))).toBe(true)
    expect(clinicActionable('blocked', sig({ reviewRequestsOn: false }))).toBe(true)
    expect(clinicActionable('blocked', sig({ remindersOn: false, reviewRequestsOn: false }))).toBe(
      true,
    )
  })

  it('a machine that keeps failing is OURS — a stale token has no front-desk lever', () => {
    expect(clinicActionable('blocked', sig({ failures7: 9 }))).toBe(false)
  })

  it('SILENCE is ours at every setting — telling a practice their machine is dead is alarm without a lever', () => {
    expect(clinicActionable('silent', sig({ actions7: 0, actionsPrev7: 0 }))).toBe(false)
  })

  it('a stall is a conversation worth having with them', () => {
    expect(clinicActionable('stalled', sig({ seated30: 3, seatedPrev30: 12 }))).toBe(true)
  })

  it('nothing that is not a problem is ever sent anywhere', () => {
    expect(clinicActionable('healthy', sig())).toBe(false)
    expect(clinicActionable('quiet', sig())).toBe(false)
  })
})

describe('clinicNote — the same finding, said TO the practice', () => {
  const states: EngineState[] = ['healthy', 'quiet', 'silent', 'blocked', 'stalled']

  it('says nothing at all when the finding is not theirs', () => {
    expect(clinicNote('silent', sig({ actions7: 0, actionsPrev7: 0 }))).toBeNull()
    expect(clinicNote('blocked', sig({ failures7: 9 }))).toBeNull()
    expect(clinicNote('healthy', sig())).toBeNull()
    expect(clinicNote('quiet', sig())).toBeNull()
  })

  it('names the exact switch that is off, not a vague "something is off"', () => {
    expect(clinicNote('blocked', sig({ remindersOn: false }))).toMatch(/appointment reminders/i)
    expect(clinicNote('blocked', sig({ reviewRequestsOn: false }))).toMatch(/review requests/i)
    const both = clinicNote('blocked', sig({ remindersOn: false, reviewRequestsOn: false }))!
    expect(both).toMatch(/reminders/i)
    expect(both).toMatch(/review requests/i)
  })

  it('the stall note gives the two numbers and a next step, never a percentage', () => {
    const note = clinicNote('stalled', sig({ seated30: 3, seatedPrev30: 12 }))!
    expect(note).toContain('3')
    expect(note).toContain('12')
    expect(note).not.toContain('%')
    expect(note).toMatch(/worth a look/i)
    // It must say the machine is fine, or the clinic reads a slow month as
    // the product failing them.
    expect(note).toMatch(/nothing is broken|still running/i)
  })

  it('is written in the CLINIC voice — never the platform talking about them', () => {
    for (const state of states) {
      const note = clinicNote(state, sig({ remindersOn: false, seated30: 3, seatedPrev30: 12 }))
      if (!note) continue
      expect(note).not.toContain('!')
      // "they", "the practice", "the clinic" are how the owner's report
      // reads; a practice reading that about itself is the tenant-voice bug.
      expect(note).not.toMatch(/\bthey\b|\btheir\b|\bthe practice\b|\bthe clinic\b/i)
      // Anti-shame: no should, no failing to, no neglect.
      expect(note).not.toMatch(/\bshould\b|\bfailed to\b|\bneglect/i)
    }
  })

  it('every clinic-actionable state HAS a note — a routed finding must never arrive empty', () => {
    for (const state of states) {
      const s = sig({ remindersOn: false, seated30: 3, seatedPrev30: 12 })
      if (clinicActionable(state, s)) expect(clinicNote(state, s)).toBeTruthy()
    }
  })
})

/**
 * THE PILE-UP (Phase 4 slice 4). `openProposals` was collected per clinic
 * from slice 1 and read by nothing, while its own comment claimed it
 * coloured the recommendation — a query paid for on every sweep that bought
 * nothing. It now does what it always said it did.
 */
describe('assessEngine — a pile-up colours the advice, never the verdict', () => {
  const piled = { openProposals: PILEUP_COUNT }

  it('never changes the state — the machine is fine; the person went quiet', () => {
    expect(assessEngine(sig({ ...piled })).state).toBe('healthy')
    expect(assessEngine(sig({ ...piled, actions7: 0, actionsPrev7: 30 })).state).toBe('quiet')
    expect(assessEngine(sig({ ...piled, seated30: 3, seatedPrev30: 12 })).state).toBe('stalled')
  })

  it('adds the clause to a finding the owner will actually read', () => {
    const v = assessEngine(sig({ ...piled, seated30: 3, seatedPrev30: 12 }))
    expect(v.recommendation).toContain(String(PILEUP_COUNT))
    expect(v.recommendation).toMatch(/sitting unanswered/i)
  })

  it('says nothing on a healthy or quiet clinic — that sentence would never be read', () => {
    expect(assessEngine(sig({ ...piled })).recommendation).toBeNull()
    expect(assessEngine(sig({ ...piled, actions7: 0, actionsPrev7: 30 })).recommendation).toBeNull()
  })

  it('a normal handful of open cards is a working inbox, not a warning', () => {
    const v = assessEngine(sig({ openProposals: PILEUP_COUNT - 1, seated30: 3, seatedPrev30: 12 }))
    expect(v.recommendation).not.toMatch(/sitting unanswered/i)
  })

  it('reaches every state that lands on the list', () => {
    for (const over of [
      { actions7: 0, actionsPrev7: 0 }, // silent
      { remindersOn: false, reviewRequestsOn: false }, // blocked
      { failures7: 9 }, // blocked by failures
      { seated30: 3, seatedPrev30: 12 }, // stalled
    ]) {
      const v = assessEngine(sig({ ...over, ...piled }))
      expect(needsAttention(v.state)).toBe(true)
      expect(v.recommendation).toMatch(/sitting unanswered/i)
    }
  })

  it('keeps the guardian voice — no exclaiming, no blaming the practice', () => {
    const v = assessEngine(sig({ ...piled, seated30: 3, seatedPrev30: 12 }))
    const text = `${v.headline} ${v.why} ${v.recommendation}`
    expect(text).not.toContain('!')
    expect(text).not.toMatch(/\bignoring\b|\bneglect|\blazy\b|\bshould have\b/i)
  })
})

/**
 * ROUND-1 AUDIT FIXES. Each of these pins a routing or severity rule that
 * shipped wrong, where the wrongness was invisible because the two halves
 * of the rule lived in different functions and agreed in the common case.
 */
describe('failures outrank silence', () => {
  it('a clinic failing at everything is BLOCKED, not silent', () => {
    // Failures are not work, so a clinic whose every attempt fails has an
    // empty WORK ledger. The silence rule would fire and report "nothing has
    // run" — less true and less useful than "it tried and couldn't", and it
    // sends Dream Create hunting for a cause already in hand.
    const v = assessEngine(sig({ actions7: 0, actionsPrev7: 0, failures7: FAILURE_ALARM_COUNT }))
    expect(v.state).toBe('blocked')
    expect(v.headline).toMatch(/tried and couldn’t/i)
  })

  it('silence still wins when nothing is failing', () => {
    expect(assessEngine(sig({ actions7: 0, actionsPrev7: 0, failures7: 0 })).state).toBe('silent')
  })

  it('a brand-new clinic that is failing is still told the truth about it', () => {
    const v = assessEngine(sig({ ageDays: 2, actions7: 0, actionsPrev7: 0, failures7: 5 }))
    expect(v.state).toBe('blocked')
  })
})

describe('clinicActionable — a failure never reaches the practice as a switch note', () => {
  it('blocked BY FAILURES is ours even when a switch also happens to be off', () => {
    // THE BUG: classify() only emits switch-blocked when BOTH are off, but
    // clinicActionable ORed them. The only case the OR added was
    // blocked-by-failures with one switch off — common, since a practice
    // that turned reminders off can also have a stale token. It routed to
    // the clinic as "reminders are switched off" (hiding the real break)
    // and the owner was never emailed at all.
    for (const switches of [
      { remindersOn: false, reviewRequestsOn: true },
      { remindersOn: true, reviewRequestsOn: false },
      { remindersOn: false, reviewRequestsOn: false },
    ]) {
      const s = sig({ ...switches, failures7: FAILURE_ALARM_COUNT })
      expect(assessEngine(s).state).toBe('blocked')
      expect(clinicActionable('blocked', s)).toBe(false)
      expect(clinicNote('blocked', s)).toBeNull()
    }
  })

  it('a genuine switch-off with no failures is still theirs', () => {
    const s = sig({ remindersOn: false, reviewRequestsOn: false, failures7: 0 })
    expect(clinicActionable('blocked', s)).toBe(true)
    expect(clinicNote('blocked', s)).toBeTruthy()
  })

  it('one failure short of the alarm is still a conversation they can have', () => {
    const s = sig({ remindersOn: false, reviewRequestsOn: false, failures7: FAILURE_ALARM_COUNT - 1 })
    expect(clinicActionable('blocked', s)).toBe(true)
  })
})
