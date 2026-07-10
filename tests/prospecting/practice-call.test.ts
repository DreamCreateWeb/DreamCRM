import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 🎭 Practice mode — unconfigured AI bails, missing prospect bails, an empty
 * transcript makes the AI answer the phone, replies meter on ai_practice,
 * an oversized transcript is rejected, and feedback needs a real transcript.
 */

const state = { selectQueue: [] as unknown[][] }

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: { select: () => selectChain() },
    schema: { prospect: { _n: 'prospect', id: 'id' } },
  }
})
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})) }))

const { aiMock, bumpMock, configuredMock } = vi.hoisted(() => ({
  aiMock: vi.fn(),
  bumpMock: vi.fn(async () => {}),
  configuredMock: vi.fn(() => true),
}))
vi.mock('@/lib/ai', () => ({ runClaudeJson: aiMock, aiConfigured: configuredMock }))
vi.mock('@/lib/services/prospecting', () => ({
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
}))

import { practiceReply, practiceFeedback } from '@/lib/services/practice-call'

const PROSPECT = {
  id: 'pros_1',
  name: 'Cedar Grove Family Dental',
  city: 'Fayetteville',
  state: 'AR',
  authorizedOfficialName: 'Dr. James Whitfield',
  websiteUrl: 'https://cedargrove.example',
  aiVerdict: { weaknesses: ['No online booking'] },
  callScript: null,
}

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
  configuredMock.mockReturnValue(true)
})

describe('practiceReply', () => {
  it('bails when AI is unconfigured', async () => {
    configuredMock.mockReturnValue(false)
    expect(await practiceReply('pros_1', [])).toEqual({ ok: false, error: 'ai_unavailable' })
    expect(aiMock).not.toHaveBeenCalled()
  })

  it('bails on a missing prospect', async () => {
    state.selectQueue.push([])
    expect(await practiceReply('nope', [])).toEqual({ ok: false, error: 'not_found' })
  })

  it('answers the phone on an empty transcript and meters', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ reply: 'Cedar Grove Family Dental, this is Amber.' })
    const res = await practiceReply('pros_1', [])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reply).toContain('Cedar Grove')
    // The empty-transcript prompt asks the model to answer the phone.
    expect((aiMock.mock.calls[0][0].messages[0].content as string)).toContain('Answer it')
    expect(bumpMock).toHaveBeenCalledWith('2026-07', 'ai_practice')
  })

  it('feeds the running transcript back in', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ reply: "We're pretty slammed — what's this about?" })
    const res = await practiceReply('pros_1', [
      { role: 'them', text: 'Cedar Grove, this is Amber.' },
      { role: 'you', text: 'Hi Amber, this is Dustin with Dream Create.' },
    ])
    expect(res.ok).toBe(true)
    const prompt = aiMock.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('CALLER: Hi Amber')
    expect(prompt).toContain('PRACTICE: Cedar Grove')
  })

  it('rejects an oversized transcript without calling the AI', async () => {
    const big = Array.from({ length: 25 }, (_, i) => ({ role: 'you' as const, text: `line ${i}` }))
    expect(await practiceReply('pros_1', big)).toEqual({ ok: false, error: 'failed' })
    expect(aiMock).not.toHaveBeenCalled()
  })
})

describe('practiceFeedback', () => {
  it('requires a non-empty transcript', async () => {
    expect(await practiceFeedback('pros_1', [])).toEqual({ ok: false, error: 'failed' })
  })

  it('returns coaching and meters', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({
      verdict: 'Solid rehearsal — your opener was specific and calm.',
      wins: ['You name-checked the practice in the first sentence.'],
      fixes: ['Make the demo ask one sentence shorter.'],
    })
    const res = await practiceFeedback('pros_1', [
      { role: 'them', text: 'Cedar Grove, this is Amber.' },
      { role: 'you', text: 'Hi Amber — Dustin with Dream Create, quick question about your website.' },
    ])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.feedback.wins).toHaveLength(1)
      expect(res.feedback.fixes[0]).toContain('demo ask')
    }
    expect(bumpMock).toHaveBeenCalledWith('2026-07', 'ai_practice')
  })
})
