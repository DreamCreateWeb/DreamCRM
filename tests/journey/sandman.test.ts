import { describe, it, expect } from 'vitest'
import {
  buildSandmanPrompt,
  parseSandmanResponse,
  renderSandmanSnapshot,
  SANDMAN_ACTIONS,
  SANDMAN_ACTION_KINDS,
  type SandmanSnapshot,
} from '@/lib/sandman'

/**
 * SANDMAN's pure contract (docs/ai-operations.md, D5). The three laws under
 * test: aggregates only, never executes, tolerant of whatever the model
 * returns.
 */

function snap(over: Partial<SandmanSnapshot> = {}): SandmanSnapshot {
  return {
    clinicName: 'Acme Dental',
    newPatients: { thisMonth: 9, lastMonth: 17, perWeek12: [4, 5, 3, 6, 5, 4, 2, 3, 2, 1, 2, 1] },
    schedule: { todayBooked: 8, upcomingNext7d: 31, unconfirmedNext48h: 3, openChairsNext7d: null },
    recall: { dueReachable: 62, sentLast30d: 1, openedLast30d: 44, bookedBackLast30d: 2 },
    reviews: { rating: 4.8, total: 61, received30d: 2, needingReply: 1 },
    content: { posts30d: 1, articles30d: 0, queued: 2 },
    inquiries: { new30d: 5, untouched: 2 },
    lastWeek: [{ noun: 'appointment reminders', count: 24 }],
    waiting: 3,
    autoLanes: ['Publish social & Google posts'],
    gaps: [],
    ...over,
  }
}

describe('the Sandman snapshot render', () => {
  it('carries the practice’s numbers — and NOTHING that identifies a patient', () => {
    const text = renderSandmanSnapshot(snap())
    expect(text).toContain('Acme Dental')
    expect(text).toContain('this month so far: 9')
    expect(text).toContain('same point last month: 17')
    expect(text).toContain('due and reachable 62')
    // The privacy line: the snapshot type has no field that could carry a
    // person, so the rendered block cannot leak one. Pin the shape.
    const s = snap()
    const asJson = JSON.stringify(s)
    expect(asJson).not.toMatch(/@/) // no email addresses
    expect(Object.keys(s).sort()).toEqual(
      [
        'autoLanes',
        'clinicName',
        'content',
        'gaps',
        'inquiries',
        'lastWeek',
        'newPatients',
        'recall',
        'reviews',
        'schedule',
        'waiting',
      ].sort(),
    )
  })

  it('says plainly when something is not connected — a gap explains a zero', () => {
    const text = renderSandmanSnapshot(snap({ gaps: ['No social channel is connected, so nothing can post.'] }))
    expect(text).toContain('NOT CONNECTED')
    expect(text).toContain('No social channel is connected')
  })

  it('an unknown number reads "unknown", never a made-up zero', () => {
    const text = renderSandmanSnapshot(snap({ reviews: { rating: null, total: 0, received30d: 0, needingReply: 0 } }))
    expect(text).toContain('rating unknown')
  })
})

describe('the Sandman prompt', () => {
  it('instructs honesty about cause, forbids patient talk, and offers only the closed action menu', () => {
    const { system, messages } = buildSandmanPrompt(snap(), 'why are we down this month?')
    expect(system).toContain('correlation, not a proven cause')
    expect(system).toContain('NEVER discuss an individual patient')
    expect(system).toContain('You do NOT perform actions')
    for (const kind of SANDMAN_ACTION_KINDS) expect(system).toContain(kind)
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'why are we down this month?' })
  })

  it('carries only the last few turns of history — an unbounded transcript never travels', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i}`,
    }))
    const { messages } = buildSandmanPrompt(snap(), 'and now?', history)
    // 6 history turns + the new question.
    expect(messages).toHaveLength(7)
    expect(messages[0].content).toBe('turn 6')
  })

  it('clamps a very long question rather than shipping it whole', () => {
    const { messages } = buildSandmanPrompt(snap(), 'x'.repeat(5000))
    expect(messages.at(-1)!.content.length).toBe(2000)
  })
})

describe('parseSandmanResponse', () => {
  it('keeps a good answer and its known actions', () => {
    const r = parseSandmanResponse({
      answer: 'Nine seated so far against seventeen at this point last month.',
      actions: [{ kind: 'open_outreach', label: 'Start a recall send' }],
    })
    expect(r?.answer).toContain('Nine seated')
    expect(r?.actions).toEqual([{ kind: 'open_outreach', label: 'Start a recall send' }])
  })

  it('DROPS an invented action kind — a model can never mint a new capability', () => {
    const r = parseSandmanResponse({
      answer: 'Here you go.',
      actions: [
        { kind: 'send_everything_now', label: 'Send it all' },
        { kind: 'open_reviews', label: 'Open reviews' },
      ],
    })
    expect(r?.actions.map((a) => a.kind)).toEqual(['open_reviews'])
  })

  it('drops duplicates, clamps to three, and falls back to the registry label', () => {
    const r = parseSandmanResponse({
      answer: 'Ok.',
      actions: [
        { kind: 'open_reviews' },
        { kind: 'open_reviews', label: 'again' },
        { kind: 'open_social', label: '' },
        { kind: 'open_website', label: 'Site' },
        { kind: 'open_analytics', label: 'Numbers' },
      ],
    })
    expect(r?.actions).toHaveLength(3)
    expect(r?.actions[0]).toEqual({ kind: 'open_reviews', label: SANDMAN_ACTIONS.open_reviews.label })
  })

  it('returns null on junk or an empty answer — the caller shows its honest fallback', () => {
    expect(parseSandmanResponse(null)).toBeNull()
    expect(parseSandmanResponse({ answer: '   ' })).toBeNull()
    expect(parseSandmanResponse('nope')).toBeNull()
  })
})

describe('the action registry', () => {
  it('every action is a NAVIGATION — nothing Sandman can suggest mutates anything', () => {
    for (const kind of SANDMAN_ACTION_KINDS) {
      const def = SANDMAN_ACTIONS[kind]
      expect(def.href.startsWith('/'), `${kind} must be an in-app path`).toBe(true)
      expect(def.when.length).toBeGreaterThan(0)
      // No action def carries a mutation flag or a server action — the whole
      // registry is links by construction.
      expect(Object.keys(def).sort()).toEqual(['href', 'kind', 'label', 'when'])
    }
  })
})
