import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The AI post-demo follow-up drafter — unconfigured AI bails, a missing
 * prospect bails, a good draft returns + meters, a too-short/invalid draft
 * fails cleanly, and the owner's "how it went" note reaches the model.
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
    schema: { prospect: { _n: 'prospect', id: 'id', aiVerdict: 'v', demoBrief: 'b' } },
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
  getProspectingConfig: () => Promise.resolve({ brain: { productOverride: '', battleCards: [] } }),
}))

import { generateDemoFollowup } from '@/lib/services/demo-followup'

const PROSPECT = {
  id: 'pros_1',
  name: 'Lone Star Dental',
  city: 'Dallas',
  state: 'TX',
  authorizedOfficialName: 'Dr. Maria Garza',
  websiteUrl: 'https://lonestardental.com',
  reviewCount: 12,
  aiVerdict: { weaknesses: ['No online booking', 'Not mobile-friendly'] },
  demoBrief: {
    openingLine: 'Maria, I looked at your practice online before this.',
    walkUpStory: 'Your site works hard but has had no help in years.',
    closingAsk: 'Two weeks, your colors, no commitment — shall I set it up?',
    objections: [{ objection: 'We already have a vendor', response: 'We consolidate it into one bill.' }],
  },
}

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
  configuredMock.mockReturnValue(true)
})

describe('generateDemoFollowup', () => {
  it('bails when AI is not configured', async () => {
    configuredMock.mockReturnValue(false)
    const res = await generateDemoFollowup('pros_1')
    expect(res).toEqual({ ok: false, error: 'ai_unavailable' })
    expect(aiMock).not.toHaveBeenCalled()
  })

  it('bails when the prospect is missing', async () => {
    state.selectQueue.push([]) // no row
    const res = await generateDemoFollowup('nope')
    expect(res).toEqual({ ok: false, error: 'not_found' })
  })

  it('returns the draft and meters on success (undecided by default)', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ draft: 'Hi Dr. Garza — thanks for the time today. Here is what we can do…' })
    const res = await generateDemoFollowup('pros_1')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.draft).toContain('Dr. Garza')
      expect(res.outcome).toBe('undecided')
      expect(res.lostReason).toBeNull()
    }
    expect(bumpMock).toHaveBeenCalledWith('2026-07', 'ai_demo_followup')
  })

  it('reads a win from the note (no lost reason)', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ draft: 'Thanks for signing on today — welcome aboard, here is what happens next.', outcome: 'won', lostReason: 'price' })
    const res = await generateDemoFollowup('pros_1', { note: 'signing up next week' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.outcome).toBe('won')
      expect(res.lostReason).toBeNull() // lostReason ignored unless outcome is lost
    }
  })

  it('reads a pass + reason from the note', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ draft: 'Thanks for the time today — the door stays open whenever things change.', outcome: 'lost', lostReason: 'using_competitor' })
    const res = await generateDemoFollowup('pros_1', { note: 'happy with their current vendor' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.outcome).toBe('lost')
      expect(res.lostReason).toBe('using_competitor')
    }
  })

  it('defaults a reasonless pass to "other"', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ draft: 'Thanks for the time today — reach out anytime you want to revisit this.', outcome: 'lost' })
    const res = await generateDemoFollowup('pros_1', { note: 'passed' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.lostReason).toBe('other')
  })

  it('fails cleanly (and does NOT meter) on a too-short draft', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ draft: 'too short' })
    const res = await generateDemoFollowup('pros_1')
    expect(res).toEqual({ ok: false, error: 'failed' })
    expect(bumpMock).not.toHaveBeenCalled()
  })

  it("passes the owner's note through to the model", async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ draft: 'A sufficiently long and valid follow-up draft body here.' })
    await generateDemoFollowup('pros_1', { note: 'worried about switching vendors' })
    const call = aiMock.mock.calls[0][0]
    const userMsg = call.messages[0].content as string
    expect(userMsg).toContain('worried about switching vendors')
    // and the anticipated objection from the brief is fed in too
    expect(userMsg).toContain('We already have a vendor')
  })
})
