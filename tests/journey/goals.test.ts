import { describe, it, expect } from 'vitest'
import {
  goalPromptLine,
  goalProgressLine,
  validateObjective,
  isGoalStatus,
  MAX_ACTIVE_GOALS,
  OBJECTIVE_MAX,
} from '@/lib/goals'

/**
 * GOALS' pure contract (docs/ai-operations.md, D6). The load-bearing rules:
 * a goal SUGGESTS (never overrides a generator's own laws), the no-goal path
 * is byte-identical to today, and progress is stated as a count SINCE the
 * goal — never as causation.
 */

describe('validateObjective', () => {
  it('trims and collapses whitespace', () => {
    expect(validateObjective('  more   implant patients ')).toEqual({
      ok: true,
      objective: 'more implant patients',
    })
  })

  it('refuses an empty goal in plain English', () => {
    const r = validateObjective('   ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Tell me what you want more of.')
  })

  it('refuses a whole plan pasted into a goal', () => {
    const r = validateObjective('x'.repeat(OBJECTIVE_MAX + 1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('a goal, not a plan')
  })
})

describe('goalPromptLine — the ancestry line', () => {
  it('is EMPTY with no goals — the no-goal path must be exactly today’s behavior', () => {
    expect(goalPromptLine([])).toBe('')
    expect(goalPromptLine([{ objective: '   ', serviceFocus: null }])).toBe('')
  })

  it('names the goal and its service, and SUGGESTS rather than commands', () => {
    const line = goalPromptLine([{ objective: 'more implant patients', serviceFocus: 'dental-implants' }])
    expect(line).toContain('more implant patients')
    expect(line).toContain('dental-implants')
    expect(line).toContain('Where it fits NATURALLY')
    // The guard rails a goal may never override.
    expect(line).toContain('Never invent a service, offer, price, or credential')
    expect(line).toContain('a good general piece beats a strained one')
  })

  it('clamps to the active-goal cap so a prompt can’t be flooded', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ objective: `goal ${i}`, serviceFocus: null }))
    const line = goalPromptLine(many)
    expect(line).toContain('goal 0')
    expect(line).not.toContain(`goal ${MAX_ACTIVE_GOALS}`)
  })
})

describe('goalProgressLine — honest progress', () => {
  const baselineAt = new Date('2026-08-01T12:00:00Z')
  const now = new Date('2026-08-21T12:00:00Z')

  it('counts patients seated SINCE the goal, and never says the goal caused them', () => {
    const line = goalProgressLine({ baselineNewPatients: 0, baselineAt }, 7, now)
    expect(line).toBe('7 new patients seated in the last 20 days since you set this.')
    expect(line).not.toMatch(/because|thanks to|caused/i)
  })

  it('says a plain zero — with a kind word while it is still early', () => {
    const fresh = new Date('2026-08-20T12:00:00Z')
    expect(goalProgressLine({ baselineNewPatients: 0, baselineAt: fresh }, 0, now)).toContain('early days')
    expect(goalProgressLine({ baselineNewPatients: 0, baselineAt }, 0, now)).toContain(
      'No new patients seated in the last 20 days yet',
    )
  })

  it('never goes negative when the baseline is above the current count', () => {
    const line = goalProgressLine({ baselineNewPatients: 12, baselineAt }, 3, now)
    expect(line).toContain('No new patients seated')
    expect(line).not.toContain('-')
  })

  it('singular voice for one patient', () => {
    expect(goalProgressLine({ baselineNewPatients: 0, baselineAt }, 1, now)).toContain('1 new patient seated')
  })
})

describe('isGoalStatus', () => {
  it('accepts only the four real states', () => {
    for (const s of ['active', 'paused', 'achieved', 'retired']) expect(isGoalStatus(s)).toBe(true)
    for (const s of ['deleted', '', 'ACTIVE', null, 7]) expect(isGoalStatus(s)).toBe(false)
  })
})
