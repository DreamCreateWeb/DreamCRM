import { describe, it, expect } from 'vitest'
import {
  assessEngine,
  clinicActionable,
  clinicNote,
  needsAttention,
  resolveGuardianAudience,
  summarizeSweep,
  shouldAlert,
  shouldStandDown,
  standDownGoesToOwner,
  clinicRecoveryNote,
  ownerWasTold,
  clinicWasTold,
  STAND_DOWN_DWELL_DAYS,
  problemKey,
  baseState,
  resolveGuardianHeartbeat,
  guardianHeartbeatStale,
  GUARDIAN_STALE_DAYS,
  ENGINE_STATE_RANK,
  NOTE_VISIBLE_DAYS,
  FAILURE_ALARM_COUNT,
  NEW_CLINIC_GRACE_DAYS,
  PILEUP_COUNT,
  RE_ALERT_DAYS,
  STALL_MIN_BASELINE,
  STALE_CYCLE_HOURS,
  type AlertMemory,
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
  engineFailures7: 0,
  remindersOn: true,
  reviewRequestsOn: true,
  seated30: 9,
  seatedPrev30: 8,
  openProposals: 1,
  // A HEALTHY baseline is one the pass is reaching. Explicit rather than
  // null so the heartbeat rule is exercised by the fixtures that mean to.
  hoursSinceCycle: 1
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
    // NULL like every other non-flagged verdict: quiet never reaches the
    // panel or the inbox, so a recommendation here would be copy written
    // for a reader that does not exist (verification round 2).
    expect(v.recommendation).toBeNull()
  })

  it('repeated failures outrank switched-off engines — a stale connection is ours to fix', () => {
    const v = assessEngine(
      sig({ failures7: FAILURE_ALARM_COUNT, remindersOn: false, reviewRequestsOn: false }),
    )
    expect(v.state).toBe('blocked')
    expect(v.headline).toMatch(/hit trouble on \d+ days?/i)
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

describe('a silence the machine can already explain (round-9 audit)', () => {
  it('both engines off + an empty ledger is BLOCKED, not an unexplained blackout', () => {
    // The switches sit in the very same signals, and the silence rule ran
    // first: the owner was told "nothing has run, check their integrations
    // and patient data" while the cause was in hand. Worse, `silent` is not
    // clinicActionable, so the one finding the practice could have fixed in
    // two clicks was withheld from them at every audience setting.
    const v = assessEngine(
      sig({ actions7: 0, actionsPrev7: 0, remindersOn: false, reviewRequestsOn: false }),
    )
    expect(v.state).toBe('blocked')
    expect(v.headline).toContain('switched off')
    expect(clinicActionable(v.state, sig({ remindersOn: false, reviewRequestsOn: false }))).toBe(true)
  })

  it('ONE switch off does not explain two empty weeks — still silent, but it says what it knows', () => {
    const v = assessEngine(sig({ actions7: 0, actionsPrev7: 0, remindersOn: false }))
    expect(v.state).toBe('silent')
    expect(v.why).toContain('reminders are also switched off')
    // …and honest about the limits of that fact: flipping it back on would
    // not fix this, so it stays with Dream Create.
    expect(v.why).toContain('would not explain this')
    expect(clinicActionable(v.state, sig({ actions7: 0, actionsPrev7: 0, remindersOn: false }))).toBe(
      false,
    )
  })

  it('a brand-new practice still gets the gentler reading, switches or not', () => {
    const v = assessEngine(
      sig({ ageDays: 2, actions7: 0, actionsPrev7: 0, remindersOn: false, reviewRequestsOn: false }),
    )
    expect(v.state).toBe('quiet')
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
    // DAYS, not rows — a burst of hand-backs in one instant is one bad day.
    expect(v.headline).toMatch(/hit trouble on \d+ days?/i)
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


describe('shouldStandDown — the other half of an interrupt (round-9 gap)', () => {
  // The dwell clock is round-11's: a recovery must HOLD before it is
  // announced, or a practice on the stall threshold alerts and stands down
  // on alternating days forever.
  const NOW_S = new Date('2026-07-29T14:00:00Z')
  const back = (n: number) => new Date(NOW_S.getTime() - n * 24 * 60 * 60 * 1000)
  const held = (over: Partial<AlertMemory> = {}): AlertMemory => ({
    state: 'blocked',
    alertedAt: back(3),
    clearSince: back(STAND_DOWN_DWELL_DAYS + 1),
    ...over,
  })

  it('closes a problem the owner was told about, once the quiet has held', () => {
    expect(shouldStandDown(held(), 'healthy', NOW_S)).toBe(true)
    expect(shouldStandDown(held({ state: 'silent' }), 'quiet', NOW_S)).toBe(true)
  })

  it('a recovery that has NOT held yet says nothing (round-11 audit)', () => {
    // The oscillation the stand-down introduced: the stall is a strict
    // inequality over two daily-sliding windows, so one seated patient
    // moving across a boundary flipped a practice attention → fine →
    // attention on alternating days, and every flip was a state CHANGE —
    // an alert one morning and an all-clear the next, forever. That is the
    // crying-wolf failure this whole primitive is built to avoid.
    expect(shouldStandDown(held({ clearSince: back(0) }), 'healthy', NOW_S)).toBe(false)
    expect(shouldStandDown(held({ clearSince: null }), 'healthy', NOW_S)).toBe(false)
  })

  it('never announces an all-clear for an alarm that never sounded', () => {
    expect(shouldStandDown(held({ state: null }), 'healthy', NOW_S)).toBe(false)
    expect(shouldStandDown(held({ state: 'healthy' }), 'healthy', NOW_S)).toBe(false)
    expect(shouldStandDown(held({ state: 'quiet' }), 'healthy', NOW_S)).toBe(false)
  })

  it('one problem becoming another is not a recovery — that is shouldAlert’s job', () => {
    expect(shouldStandDown(held({ state: 'silent' }), 'blocked', NOW_S)).toBe(false)
  })

  it('the two are mutually exclusive — no state both alerts and stands down', () => {
    const states: EngineState[] = ['silent', 'blocked', 'stalled', 'quiet', 'healthy']
    for (const was of states) {
      for (const now of states) {
        const memory: AlertMemory = {
          state: was,
          alertedAt: new Date('2026-01-01T00:00:00Z'),
          clearSince: new Date('2026-01-01T00:00:00Z'),
        }
        const both =
          shouldAlert(memory, now, new Date('2026-06-01T00:00:00Z')) &&
          shouldStandDown(memory, now, new Date('2026-06-01T00:00:00Z'))
        expect(both).toBe(false)
      }
    }
  })
})

describe('the note visibility window outlasts the re-write cadence', () => {
  it('overlaps by design, so cron jitter cannot black out a live warning', () => {
    expect(NOTE_VISIBLE_DAYS).toBeGreaterThan(RE_ALERT_DAYS)
  })
})

describe('resolveGuardianHeartbeat — a dead cron must not look healthy', () => {
  it('carries the run’s REASONS back, capped and string-only (round-14 gap)', () => {
    // These were written in seven places and read by nobody: the cron hands
    // them to EventBridge, which discards them. A count with no reason left
    // the owner unable to tell a mail outage from having nobody to email.
    const h = resolveGuardianHeartbeat({
      guardian: { ranAt: 'x', problems: ['email (3 practices)', 'ledger', 42, ''], skipped: 2 },
    })
    expect(h.problems).toEqual(['email (3 practices)', 'ledger'])
    expect(h.skipped).toBe(2)
    // A heartbeat is not a log.
    expect(
      resolveGuardianHeartbeat({ guardian: { ranAt: 'x', problems: Array(20).fill('a') } }).problems,
    ).toHaveLength(5)
    // Junk shapes floor to empty rather than reaching the panel.
    expect(resolveGuardianHeartbeat({ guardian: { ranAt: 'x', problems: 'nope' } }).problems).toEqual([])
  })

  it('carries the RECEIPT back — who the run actually reached (round-16 gap)', () => {
    const h = resolveGuardianHeartbeat({
      guardian: { ranAt: 'x', audience: 'clinic', told: ['Ash', 42, ''], emailed: ['Birch'] },
    })
    expect(h.audience).toBe('clinic')
    expect(h.told).toEqual(['Ash'])
    expect(h.emailed).toEqual(['Birch'])
    // Floors to the closed side and to empty lists on junk.
    const j = resolveGuardianHeartbeat({ guardian: { ranAt: 'x', audience: 'nope', told: 'Ash' } })
    expect(j.audience).toBe('platform')
    expect(j.told).toEqual([])
  })

  it('carries the blind flag back, because the writer writes it', () => {
    // Storing a field nobody reads is the exact defect slice 4 was pulled
    // up for; re-introducing it here would be worse than not storing it.
    expect(resolveGuardianHeartbeat({ guardian: { ranAt: 'x', blind: true } }).blind).toBe(true)
    expect(resolveGuardianHeartbeat({ guardian: { ranAt: 'x', blind: 'yes' } }).blind).toBe(false)
  })

  it('nothing stored reads as never run', () => {
    for (const bad of [null, undefined, {}, 'x', 42, { guardian: null }, { guardian: 'x' }]) {
      expect(resolveGuardianHeartbeat(bad).ranAt).toBeNull()
    }
  })

  it('reads back a real run', () => {
    const h = resolveGuardianHeartbeat({
      guardian: { ranAt: '2026-07-29T14:00:00.000Z', scanned: 4, flagged: 1, undelivered: 2 },
    })
    expect(h).toEqual({
      ranAt: '2026-07-29T14:00:00.000Z',
      scanned: 4,
      flagged: 1,
      undelivered: 2,
      blind: false,
      problems: [],
      skipped: 0,
      eligible: 0,
      unreadable: 0,
      audience: 'platform',
      told: [],
      emailed: [],
    })
  })

  it('floors junk counts at zero rather than rendering them', () => {
    const h = resolveGuardianHeartbeat({
      guardian: { ranAt: '', scanned: -3, flagged: 'two', undelivered: NaN },
    })
    expect(h).toEqual({
      ranAt: null,
      scanned: 0,
      flagged: 0,
      undelivered: 0,
      blind: false,
      problems: [],
      skipped: 0,
      eligible: 0,
      unreadable: 0,
      audience: 'platform',
      told: [],
      emailed: [],
    })
  })
})


describe('no calm verdict ignores a failure to stay calm (round-9 sibling sweep)', () => {
  // One or two failures never reach FAILURE_ALARM_COUNT, so every "calm"
  // verdict is reachable with the machine's own "I couldn't" rows in the
  // same week. Round 7 taught the stall to hedge and round 8 the clinic
  // note; these were the siblings nobody swept.
  it('healthy says so out loud', () => {
    const v = assessEngine(sig({ failures7: 2 }))
    expect(v.state).toBe('healthy')
    expect(v.why).toContain('hit trouble')
  })

  it('quiet says so out loud', () => {
    const v = assessEngine(sig({ actions7: 0, failures7: 1 }))
    expect(v.state).toBe('quiet')
    expect(v.why).toContain('hit trouble')
  })

  it('and stays silent about it when nothing failed', () => {
    expect(assessEngine(sig()).why).not.toContain('hit trouble')
    expect(assessEngine(sig({ actions7: 0 })).why).not.toContain('hit trouble')
  })

  it('EVERY verdict reachable with 1–2 failures acknowledges them', () => {
    // The structural version, so a sixth state added later cannot quietly
    // reintroduce the same silence.
    const cases: Array<Partial<EngineSignals>> = [
      {},                                             // healthy
      { actions7: 0 },                                // quiet
      { seated30: 1, seatedPrev30: 20 },              // stalled
      { actions7: 0, actionsPrev7: 0 },               // silent
      { remindersOn: false, reviewRequestsOn: false },// blocked (switches)
    ]
    for (const over of cases) {
      const v = assessEngine(sig({ ...over, failures7: 2 }))
      expect(
        /trouble|failed|couldn/i.test(v.why),
        `${v.state} said nothing about 2 failures: ${v.why}`,
      ).toBe(true)
    }
  })
})


describe('standDownGoesToOwner — may the OWNER hear this all-clear? (round-10 audit)', () => {
  it('at platform, every recovery is theirs — every finding went to them', () => {
    for (const was of ['silent', 'blocked', 'stalled'] as EngineState[]) {
      expect(standDownGoesToOwner('platform', was)).toBe(true)
    }
  })

  it('at clinic, a switch recovery is NOT theirs to hear', () => {
    // The round-9 guard asked `clinicActionable` against TODAY's signals,
    // and that is inverted in the principal case: the only clinic-actionable
    // `blocked` shape is both-switches-off, and it recovers BY the switches
    // going back on — so today's signals always said "not theirs" and the
    // owner was emailed an all-clear for an alarm only the practice got.
    expect(standDownGoesToOwner('clinic', 'blocked')).toBe(false)
    expect(standDownGoesToOwner('clinic', 'stalled')).toBe(false)
  })

  it('at clinic, a SILENT recovery is still theirs — silence never reaches a practice', () => {
    expect(standDownGoesToOwner('clinic', 'silent')).toBe(true)
  })

  it('never contradicts clinicActionable for the states where it is signal-free', () => {
    // `stalled` is unconditionally the practice's and `silent` never is;
    // only `blocked` is ambiguous, and that is the one we withhold.
    const anySignals = sig()
    expect(clinicActionable('stalled', anySignals)).toBe(true)
    expect(standDownGoesToOwner('clinic', 'stalled')).toBe(false)
    expect(clinicActionable('silent', anySignals)).toBe(false)
    expect(standDownGoesToOwner('clinic', 'silent')).toBe(true)
  })
})

describe('guardianHeartbeatStale — a job that STOPPED, not one that never started', () => {
  const NOW_T = new Date('2026-07-29T14:00:00Z')
  const ago = (d: number) => new Date(NOW_T.getTime() - d * 24 * 60 * 60 * 1000).toISOString()
  const beat = (ranAt: string | null) => ({
    ranAt,
    scanned: 1,
    flagged: 0,
    undelivered: 0,
    blind: false,
    problems: [],
    skipped: 0,
    eligible: 0,
    unreadable: 0,
    audience: 'platform' as const,
    told: [],
    emailed: [],
  })

  it('a run today is not stale', () => {
    expect(guardianHeartbeatStale(beat(ago(0)), NOW_T)).toBe(false)
    expect(guardianHeartbeatStale(beat(ago(1)), NOW_T)).toBe(false)
  })

  it('past the window it is stale — the failure this repo has actually had', () => {
    // A daily cron that silently stops looks EXACTLY like a healthy one on
    // a live-rendered panel, which is the drift CLAUDE.md records (five jobs
    // dead until the deploy started re-running the schedule script).
    expect(guardianHeartbeatStale(beat(ago(GUARDIAN_STALE_DAYS + 1)), NOW_T)).toBe(true)
    expect(guardianHeartbeatStale(beat(ago(60)), NOW_T)).toBe(true)
  })

  it('never-ran and unparseable are NOT stale — they are their own, louder states', () => {
    expect(guardianHeartbeatStale(beat(null), NOW_T)).toBe(false)
    expect(guardianHeartbeatStale(beat('not a date'), NOW_T)).toBe(false)
  })
})


describe('problemKey — what "the same problem" means to the cadence (round-11 audit)', () => {
  it('separates the two BLOCKED shapes, which have different owners', () => {
    // `classify` emits blocked from two rules: failures (ours to fix, never
    // clinic-actionable) and switches (theirs, and it IS clinic-actionable).
    // The memory stored the bare word, so moving between them was "the same
    // problem" and nobody was told for up to RE_ALERT_DAYS — while the last
    // thing said about that practice was the wrong half of the truth.
    const byFailures = assessEngine(sig({ failures7: FAILURE_ALARM_COUNT }))
    const bySwitches = assessEngine(sig({ remindersOn: false, reviewRequestsOn: false }))
    expect(byFailures.state).toBe('blocked')
    expect(bySwitches.state).toBe('blocked')
    expect(problemKey(byFailures)).not.toBe(problemKey(bySwitches))
  })

  it('the cadence treats that move as NEWS', () => {
    const memory = { state: 'blocked:switches', alertedAt: new Date('2026-07-28T14:00:00Z') }
    expect(shouldAlert(memory, 'blocked:failures', new Date('2026-07-29T14:00:00Z'))).toBe(true)
    // …and the same one still waits out its week.
    expect(shouldAlert(memory, 'blocked:switches', new Date('2026-07-29T14:00:00Z'))).toBe(false)
  })

  it('states with one whole answer keep their bare key, so nothing else changed', () => {
    for (const over of [{ actions7: 0, actionsPrev7: 0 }, { seated30: 1, seatedPrev30: 20 }, {}]) {
      const v = assessEngine(sig(over))
      if (v.state !== 'blocked') expect(problemKey(v)).toBe(v.state)
    }
  })

  it('baseState reads a key back, and refuses one it does not understand', () => {
    expect(baseState('blocked:switches')).toBe('blocked')
    expect(baseState('silent')).toBe('silent')
    expect(baseState(null)).toBeNull()
    expect(baseState('nonsense')).toBeNull()
    // A legacy bare 'blocked' still parses — and differs from every new key,
    // so rollout alerts once rather than going quiet.
    expect(baseState('blocked')).toBe('blocked')
    expect(shouldAlert({ state: 'blocked', alertedAt: new Date('2026-07-28T14:00:00Z') }, 'blocked:switches', new Date('2026-07-29T14:00:00Z'))).toBe(true)
  })
})


describe('the clinic-voiced hedge counts ENGINE breaks only (round-15 audit)', () => {
  it('promises to fix things only when something of OURS is actually broken', () => {
    const s1 = sig({ seated30: 3, seatedPrev30: 20, failures7: 2, engineFailures7: 2 })
    expect(clinicNote('stalled', s1)).toContain('let me get those working')
  })

  it('a week of pure HAND-BACKS gets no such promise', () => {
    // A hand-back is the machine deliberately STOPPING after two tries and
    // putting the card back in front of them — it is in their Approval Inbox
    // right now. Promising to "get those working" contradicts the machine's
    // own ledger sentence about that same card. Round 11 made this split in
    // the standup; the Guardian's own sentence was never swept.
    const s2 = sig({ seated30: 3, seatedPrev30: 20, failures7: 2, engineFailures7: 0 })
    const note = clinicNote('stalled', s2)
    expect(note).not.toContain('let me get those working')
    expect(note).toContain('Nothing is broken on my side')
  })

  it('the OWNER’s verdict still counts both — a card handing back daily IS evidence', () => {
    // The split is about the sentence, not the signal: repeated hand-backs
    // really do mean something is wired wrong, and that is the owner's call.
    const v = assessEngine(sig({ failures7: FAILURE_ALARM_COUNT, engineFailures7: 0 }))
    expect(v.state).toBe('blocked')
  })
})


describe('the all-clear line admits a calm-but-not-clean week (round-15 audit)', () => {
  // Round 9 taught the `quiet` and `healthy` verdicts to admit 1-2 failure
  // days — and BOTH of those `why` strings are discarded (the panel renders
  // only flagged rows; shouldAlert refuses non-attention states; the
  // stand-down body prints the headline). The clause was generated and
  // dropped, and the ONE line those clinics reach the owner through said
  // everything was running normally.
  it('names how many otherwise-fine practices had something break', () => {
    expect(summarizeSweep(['healthy', 'healthy', 'quiet'], 2)).toContain('2 had jobs of ours hit trouble')
    expect(summarizeSweep(['healthy'], 1)).toContain('1 had a job of ours hit trouble')
  })

  it('stays a plain all-clear when the week really was clean', () => {
    expect(summarizeSweep(['healthy', 'quiet'], 0)).toBe('All 2 practices are running normally.')
  })

  it('survives a BUSY morning too (round-16 gap)', () => {
    // The round-15 fix landed in the all-clear branch only, so these — Dream
    // Create's OWN breaks — vanished from the summary on precisely the days
    // the owner is reading the panel.
    const s = summarizeSweep(['silent', 'healthy'], 1)
    expect(s).toContain('1 of 2 practices need you.')
    expect(s).toContain('ours to fix')
    expect(summarizeSweep(['silent', 'healthy'], 0)).toBe('1 of 2 practices need you.')
  })
})


describe('who was told — a lookup, not an inference (Phase 4 open item #3)', () => {
  it('reads each audience from its OWN stamp', () => {
    expect(ownerWasTold({ state: 'blocked:switches', alertedAt: new Date() })).toBe(true)
    expect(ownerWasTold({ state: null, alertedAt: null })).toBe(false)
    expect(ownerWasTold({ state: 'healthy', alertedAt: new Date() })).toBe(false)

    expect(clinicWasTold({ state: null, alertedAt: null, clinicState: 'stalled' })).toBe(true)
    expect(clinicWasTold({ state: 'silent', alertedAt: new Date() })).toBe(false)
  })

  it('the two are independent — a note to one says nothing about the other', () => {
    // Round 12 found the signals-based guess inverted in its principal case
    // precisely because there was only one stamp to read.
    const m = { state: null, alertedAt: null, clinicState: 'blocked:switches', clinicAlertedAt: new Date() }
    expect(ownerWasTold(m)).toBe(false)
    expect(clinicWasTold(m)).toBe(true)
  })
})

describe('clinicRecoveryNote — the practice hears the close too (open item #4)', () => {
  it('closes the two findings a practice can be told about', () => {
    expect(clinicRecoveryNote('blocked:switches')).toContain('back on')
    expect(clinicRecoveryNote('stalled')).toContain('back where they were')
  })

  it('has nothing to close for a finding that never reached them', () => {
    // `silent` and repeated failures stay with Dream Create at every
    // setting, so there is no all-clear owed to a practice for them.
    expect(clinicRecoveryNote('silent')).toBeNull()
    expect(clinicRecoveryNote('healthy')).toBeNull()
    expect(clinicRecoveryNote('nonsense')).toBeNull()
  })

  it('is a receipt, not a report: no number, no next step, no request', () => {
    for (const was of ['blocked:switches', 'stalled']) {
      const note = clinicRecoveryNote(was)!
      expect(note).not.toMatch(/\d/)
      expect(note).not.toMatch(/\b(should|need to|please|make sure)\b/i)
    }
  })
})

describe('THE HEARTBEAT STOPPED (D16) — the engine not reaching a clinic at all', () => {
  it('a stamp older than a day is SILENT, with its own cause', () => {
    const v = assessEngine(sig({ hoursSinceCycle: 30 }))
    expect(v.state).toBe('silent')
    expect(v.cause).toBe('no_cycle')
    expect(v.headline).toMatch(/has not run for them in 1 day/)
  })

  it('reads FIRST — it explains the silence and the stale failures, not the other way round', () => {
    // Every other alarm is lit at once. The verdict must still name the pass
    // that never arrived, because that is the fact upstream of all of them.
    const v = assessEngine(
      sig({
        hoursSinceCycle: 72,
        failures7: 5,
        actions7: 0,
        actionsPrev7: 0,
        remindersOn: false,
        reviewRequestsOn: false,
      }),
    )
    expect(v.cause).toBe('no_cycle')
    expect(v.recommendation).toMatch(/generate-proposals schedule/)
  })

  it('a FRESH stamp changes nothing — the other rules still decide', () => {
    expect(assessEngine(sig({ hoursSinceCycle: 1 })).state).toBe('healthy')
    expect(assessEngine(sig({ hoursSinceCycle: 23, failures7: 4 })).cause).toBe('failures')
  })

  it('NULL says nothing at all — an unstamped clinic is not a dead engine', () => {
    // The column shipped in 0152; every clinic read null until their first
    // pass after that deploy. Reading absence as death would have alarmed on
    // the whole platform that morning.
    expect(assessEngine(sig({ hoursSinceCycle: null })).state).toBe('healthy')
    const quiet = assessEngine(sig({ hoursSinceCycle: null, actions7: 0, actionsPrev7: 0 }))
    expect(quiet.state).toBe('silent')
    // …and it is the FOURTEEN-DAYS silence, not the heartbeat one.
    expect(quiet.cause).toBeNull()
  })

  it('the threshold is a full day, so one missed hourly tick is never news', () => {
    expect(assessEngine(sig({ hoursSinceCycle: STALE_CYCLE_HOURS - 1 })).cause).toBeNull()
    expect(assessEngine(sig({ hoursSinceCycle: STALE_CYCLE_HOURS })).cause).toBe('no_cycle')
  })

  it('says hours while it is still under a day past the line, and days after', () => {
    expect(assessEngine(sig({ hoursSinceCycle: 26 })).headline).toMatch(/1 day/)
    expect(assessEngine(sig({ hoursSinceCycle: 100 })).headline).toMatch(/4 days/)
  })

  it('stays with Dream Create — a cron that is not running is never the practice’s to fix', () => {
    const s = sig({ hoursSinceCycle: 40 })
    expect(clinicActionable(assessEngine(s).state, s)).toBe(false)
    expect(clinicNote(assessEngine(s).state, s)).toBeNull()
  })

  it('is a DIFFERENT problem from ordinary silence, so a clinic moving between them is news', () => {
    const stopped = assessEngine(sig({ hoursSinceCycle: 40 }))
    const empty = assessEngine(sig({ hoursSinceCycle: null, actions7: 0, actionsPrev7: 0 }))
    expect(problemKey(stopped)).not.toBe(problemKey(empty))
    expect(baseState(problemKey(stopped))).toBe('silent')
  })

  it('names it as OURS rather than sending anyone hunting clinic-side', () => {
    const v = assessEngine(sig({ hoursSinceCycle: 40 }))
    expect(v.why).toMatch(/not reaching them|not the machine failing/i)
    expect(v.recommendation).toMatch(/it is the job, not them/)
  })
})
