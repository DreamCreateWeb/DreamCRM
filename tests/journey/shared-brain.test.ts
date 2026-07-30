import { describe, it, expect } from 'vitest'
import {
  learnBestSendHour,
  resolveSharedBrain,
  DEFAULT_SEND_HOUR,
  LEARNABLE_HOUR_MIN,
  LEARNABLE_HOUR_MAX,
  MIN_SENDS_PER_HOUR,
  MIN_CLINICS_PER_HOUR,
  MIN_LIFT,
  brainStale,
  BRAIN_STALE_DAYS,
  type HourStat,
} from '@/lib/shared-brain'

/**
 * THE SHARED BRAIN (Transformation Phase 4 — DESIGN.md primitive #5).
 *
 * "No individual clinic has to be smart, because the platform already
 * knows." The danger in that promise is a learned default that is WORSE
 * than the guess it replaced — learned from four sends, or from one big
 * clinic's habit, or oscillating week to week. These pin the three floors
 * that stop each of those, and the flooring that keeps a malformed stored
 * value from ever reaching a scheduler.
 */

const stat = (over: Partial<HourStat> = {}): HourStat => ({
  hour: 10,
  sent: MIN_SENDS_PER_HOUR,
  opened: Math.round(MIN_SENDS_PER_HOUR * 0.3),
  clinics: MIN_CLINICS_PER_HOUR,
  ...over,
})

/** An hour bucket at a given open rate, comfortably over both floors. */
const at = (hour: number, openRate: number, clinics = MIN_CLINICS_PER_HOUR): HourStat => ({
  hour,
  sent: 1000,
  opened: Math.round(1000 * openRate),
  clinics,
})

describe('learnBestSendHour — it refuses to learn from too little', () => {
  it('with no data at all the shipped default stands, and says why', () => {
    const f = learnBestSendHour([])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
    expect(f.learned).toBe(false)
    expect(f.why).toMatch(/not enough/i)
  })

  it('a perfect open rate on a handful of sends is not a finding', () => {
    const f = learnBestSendHour([stat({ hour: 14, sent: MIN_SENDS_PER_HOUR - 1, opened: 9 })])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
    expect(f.learned).toBe(false)
  })

  it('ONE clinic’s habit is not a platform pattern — that is the whole word "shared"', () => {
    const f = learnBestSendHour([at(14, 0.9, MIN_CLINICS_PER_HOUR - 1)])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
    expect(f.learned).toBe(false)
  })

  it('clears both floors and it learns — given something to compare against', () => {
    // TWO arms, deliberately (round-11 audit). One qualifying bucket is not
    // a comparison, and the version of this test with a single arm was
    // pinning the defect: "2 PM really is the best hour" asserted a
    // contest that never happened.
    const f = learnBestSendHour([at(14, 0.5), at(DEFAULT_SEND_HOUR, 0.2)])
    expect(f.hour).toBe(14)
    expect(f.learned).toBe(true)
    expect(f.why).toContain('2 PM')
  })

  it('ONE qualifying hour is not a comparison, so nothing is learned from it', () => {
    // Every automated send aims at the hour in force, so that bucket fills
    // and no other one does — `[incumbent]` alone is the LIKELIEST shape
    // for a long time, and calling it a finding is the shipped guess
    // re-badged. `learned` is then carried forward forever, so the badge
    // could never honestly return to "still learning".
    const f = learnBestSendHour([at(14, 0.9)])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
    expect(f.learned).toBe(false)
    expect(f.why).toMatch(/nothing to compare/i)
  })
})

describe('learnBestSendHour — it never learns a bad hour', () => {
  it('refuses hours outside the daylight window, however well they perform', () => {
    // The 3 AM trap: insomniacs opening hours later would otherwise teach
    // the platform to mail every patient in the middle of the night.
    const f = learnBestSendHour([at(3, 0.95), at(23, 0.95), at(10, 0.3)])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
  })

  it('the window edges are inclusive and usable', () => {
    const beaten = at(DEFAULT_SEND_HOUR, 0.2)
    expect(learnBestSendHour([at(LEARNABLE_HOUR_MIN, 0.6), beaten]).hour).toBe(LEARNABLE_HOUR_MIN)
    expect(learnBestSendHour([at(LEARNABLE_HOUR_MAX, 0.6), beaten]).hour).toBe(LEARNABLE_HOUR_MAX)
  })

  it('an hour just outside the window is not learnable', () => {
    expect(learnBestSendHour([at(LEARNABLE_HOUR_MIN - 1, 0.9)]).hour).toBe(DEFAULT_SEND_HOUR)
    expect(learnBestSendHour([at(LEARNABLE_HOUR_MAX + 1, 0.9)]).hour).toBe(DEFAULT_SEND_HOUR)
  })

  it('a zero-send bucket never divides by zero into a winning rate', () => {
    const f = learnBestSendHour([{ hour: 15, sent: 0, opened: 0, clinics: 9 }, at(10, 0.4)])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
  })
})

describe('learnBestSendHour — stability beats chasing noise', () => {
  it('a marginal winner does NOT move the platform off the default', () => {
    const f = learnBestSendHour([at(DEFAULT_SEND_HOUR, 0.4), at(15, 0.4 + MIN_LIFT / 2)])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
    expect(f.learned).toBe(false)
    expect(f.why).toMatch(/not by enough/i)
  })

  it('a decisive winner does', () => {
    const f = learnBestSendHour([at(DEFAULT_SEND_HOUR, 0.4), at(15, 0.4 + MIN_LIFT + 0.01)])
    expect(f.hour).toBe(15)
    expect(f.learned).toBe(true)
  })

  it('when the hour IN FORCE has no qualifying data, nothing moves (round-11 audit)', () => {
    // This used to say "the winner stands on its own", and skipping MIN_LIFT
    // was the defect: the platform-wide send hour could swap on the strength
    // of ONE arm while the copy claimed it "beats every other hour" — a
    // comparison that had not happened. The stability floor exists precisely
    // so this value cannot wobble; a missing incumbent is a reason to wait.
    const f = learnBestSendHour([
      at(15, 0.35),
      at(16, 0.3),
      stat({ hour: DEFAULT_SEND_HOUR, sent: 3, clinics: 1 }),
    ])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
    expect(f.learned).toBe(false)
    expect(f.why).toMatch(/something to compare/i)
  })

  it('confirming the default IS a finding, and is reported as one', () => {
    const f = learnBestSendHour([at(DEFAULT_SEND_HOUR, 0.6), at(15, 0.2)])
    expect(f.hour).toBe(DEFAULT_SEND_HOUR)
    expect(f.learned).toBe(true)
    expect(f.why).toMatch(/really is the best/i)
  })

  it('ties resolve the same way every run — a coin flip must not oscillate weekly', () => {
    const inForce = at(DEFAULT_SEND_HOUR, 0.2)
    const a = learnBestSendHour([at(11, 0.5), at(16, 0.5), inForce])
    const b = learnBestSendHour([at(16, 0.5), at(11, 0.5), inForce])
    expect(a.hour).toBe(b.hour)
    expect(a.hour).toBe(11)
  })

  it('reports the sample it worked from, including the buckets it rejected', () => {
    const f = learnBestSendHour([at(14, 0.5), at(3, 0.9)])
    expect(f.sampleSends).toBe(2000)
  })
})

describe('the platform’s voice about its own learning', () => {
  it('never exclaims, and always explains rather than asserting', () => {
    for (const stats of [[], [at(14, 0.5)], [at(DEFAULT_SEND_HOUR, 0.4), at(15, 0.41)], [at(DEFAULT_SEND_HOUR, 0.6)]]) {
      const f = learnBestSendHour(stats)
      expect(f.why).not.toContain('!')
      expect(f.why.length).toBeGreaterThan(20)
    }
  })

  it('says hours the way a person does, not as 24-hour integers', () => {
    expect(learnBestSendHour([at(9, 0.6)]).why).toContain('9 AM')
    expect(learnBestSendHour([at(13, 0.6)]).why).toContain('1 PM')
    expect(learnBestSendHour([at(12, 0.6)]).why).toContain('12 PM')
  })
})

/**
 * The stored value reaches a SCHEDULER. Anything it cannot vouch for has to
 * become the shipped default, never an undefined hour.
 */
describe('resolveSharedBrain — floored on every failure path', () => {
  it('missing, empty, and non-object configs all resolve to the shipped default', () => {
    for (const bad of [undefined, null, {}, 'brain', 42, [], { sharedBrain: null }, { sharedBrain: 'x' }]) {
      const b = resolveSharedBrain(bad)
      expect(b.sendHour).toBe(DEFAULT_SEND_HOUR)
      expect(b.sendHourLearned).toBe(false)
      expect(b.learnedAt).toBeNull()
    }
  })

  it('reads a well-formed brain back', () => {
    const b = resolveSharedBrain({
      sharedBrain: { sendHour: 15, sendHourLearned: true, sendHourWhy: 'because', learnedAt: '2026-07-29T00:00:00Z' },
    })
    expect(b.sendHour).toBe(15)
    expect(b.sendHourLearned).toBe(true)
    expect(b.sendHourWhy).toBe('because')
  })

  it('an out-of-range or non-integer hour never reaches a scheduler', () => {
    for (const bad of [25, -1, 0, 3, 23, 10.5, '10', null, undefined, NaN, Infinity]) {
      const b = resolveSharedBrain({ sharedBrain: { sendHour: bad, sendHourLearned: true } })
      expect(b.sendHour).toBe(DEFAULT_SEND_HOUR)
      // ...and a rejected hour is never reported as learned, whatever the
      // stored flag claims — the panel must not say "Learned" about a value
      // that was thrown away.
      expect(b.sendHourLearned).toBe(false)
    }
  })

  it('a stored default hour is honoured as learned when the flag says so', () => {
    const b = resolveSharedBrain({ sharedBrain: { sendHour: DEFAULT_SEND_HOUR, sendHourLearned: true } })
    expect(b.sendHour).toBe(DEFAULT_SEND_HOUR)
    expect(b.sendHourLearned).toBe(true)
  })

  it('a non-boolean learned flag is not truthy-coerced', () => {
    for (const bad of ['true', 1, {}]) {
      expect(resolveSharedBrain({ sharedBrain: { sendHour: 15, sendHourLearned: bad } }).sendHourLearned).toBe(false)
    }
  })

  it('ignores other platform-config keys entirely', () => {
    const b = resolveSharedBrain({ guardianAudience: 'clinic', sharedBrain: { sendHour: 16, sendHourLearned: true } })
    expect(b.sendHour).toBe(16)
  })
})


describe('the sample the owner is shown (round-10 in-phase gap)', () => {
  it('resolves sampleSends back out of storage, floored at zero', () => {
    expect(resolveSharedBrain({ sharedBrain: { sampleSends: 4210 } }).sampleSends).toBe(4210)
    for (const bad of [undefined, null, -5, 'lots', NaN, Infinity]) {
      expect(resolveSharedBrain({ sharedBrain: { sampleSends: bad } }).sampleSends).toBe(0)
    }
  })

  it('a learning pass records what it looked at, so "Still learning" can say how close', () => {
    // The brain ships INERT on purpose, so for months this is slice 5's
    // only owner-visible output — and a floor with no reading against it is
    // the magic number the card exists to replace.
    const finding = learnBestSendHour(
      [{ hour: 10, sent: 46, opened: 20, clinics: 1 }],
      DEFAULT_SEND_HOUR,
      false,
    )
    expect(finding.learned).toBe(false)
    expect(finding.sampleSends).toBe(46)
  })
})

describe('brainStale — a weekly pass that STOPPED', () => {
  const NOW_B = new Date('2026-07-29T14:00:00Z')
  const ago = (d: number) => new Date(NOW_B.getTime() - d * 86_400_000).toISOString()
  const brain = (learnedAt: string | null) => resolveSharedBrain({ sharedBrain: { learnedAt } })

  it('a recent pass is fine, an old one is not', () => {
    expect(brainStale(brain(ago(3)), NOW_B)).toBe(false)
    expect(brainStale(brain(ago(BRAIN_STALE_DAYS + 1)), NOW_B)).toBe(true)
  })

  it('never-run and unparseable are their own states, not stale', () => {
    expect(brainStale(brain(null), NOW_B)).toBe(false)
    expect(brainStale(brain('nope'), NOW_B)).toBe(false)
  })
})
