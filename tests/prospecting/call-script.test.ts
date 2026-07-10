import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The AI cold-call script — the stored-blob parser is junk-tolerant, the
 * cache-hit skips the AI, force regenerates, invalid output writes nothing
 * and doesn't meter, and success writes + meters on ai_call_script.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ values: Record<string, unknown> }>,
}

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
    db: {
      select: () => selectChain(),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ values })
          },
        }),
      }),
    },
    schema: { prospect: { _n: 'prospect', id: 'id', callScript: 'cs' } },
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

import { getOrGenerateCallScript } from '@/lib/services/call-script'
import { parseCallScript } from '@/lib/types/call-script'

const GOOD_OUTPUT = {
  opener: 'Is this Lone Star Dental? This is Dustin with Dream Create — I was on your site this morning.',
  whyThem: "You've got a 3.8 with only 12 reviews and no way for a patient to book online.",
  valuePoints: ['We build the site and run booking on it', 'Reviews go on autopilot after every visit'],
  objections: [
    { objection: "We're busy", response: 'Totally — twenty minutes, you pick the day, and I do all the setup.' },
    { objection: 'We have a website guy', response: 'Keep him if you love him — we replace the five other tools around the site.' },
  ],
  ask: 'Can I show you a twenty-minute demo this week — your site, your colors, live?',
  voicemail:
    'Hi, this is Dustin at Dream Create. I was on the Lone Star Dental website this morning and noticed patients can’t book online. We fix that plus reviews and reminders in one system. Nothing needed from you — I’ll try you again in a couple of days.',
}

const PROSPECT = {
  id: 'pros_1',
  name: 'Lone Star Dental',
  city: 'Dallas',
  state: 'TX',
  authorizedOfficialName: 'Dr. Maria Garza',
  websiteUrl: 'https://lonestardental.com',
  googleRatingTenths: 38,
  reviewCount: 12,
  enrichment: null,
  aiVerdict: { hasWebsite: true, websiteQuality: 30, weaknesses: ['No online booking'], summary: 'Dated site.' },
  intentSummary: null,
  callScript: null,
}

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
  configuredMock.mockReturnValue(true)
})

describe('parseCallScript', () => {
  it('round-trips a valid blob and clamps arrays', () => {
    const parsed = parseCallScript({
      ...GOOD_OUTPUT,
      generatedAt: '2026-07-10T00:00:00.000Z',
      valuePoints: [...GOOD_OUTPUT.valuePoints, 'extra 1', 'extra 2'], // 4 → clamp 3
    })
    expect(parsed).not.toBeNull()
    expect(parsed!.valuePoints).toHaveLength(3)
    expect(parsed!.opener).toContain('Dustin')
  })
  it('rejects blobs missing a required field', () => {
    const { voicemail: _v, ...rest } = GOOD_OUTPUT
    expect(parseCallScript(rest)).toBeNull()
    expect(parseCallScript(null)).toBeNull()
    expect(parseCallScript('junk')).toBeNull()
  })
  it('drops malformed objection rows instead of failing', () => {
    const parsed = parseCallScript({
      ...GOOD_OUTPUT,
      objections: [GOOD_OUTPUT.objections[0], { objection: 'no response key' }],
    })
    expect(parsed!.objections).toHaveLength(1)
  })
})

describe('getOrGenerateCallScript', () => {
  it('returns the cached script without calling the AI', async () => {
    state.selectQueue.push([{ ...PROSPECT, callScript: { ...GOOD_OUTPUT, generatedAt: 'x' } }])
    const script = await getOrGenerateCallScript('pros_1')
    expect(script).not.toBeNull()
    expect(aiMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('force regenerates past a cache hit', async () => {
    state.selectQueue.push([{ ...PROSPECT, callScript: { ...GOOD_OUTPUT, generatedAt: 'x' } }])
    aiMock.mockResolvedValue(GOOD_OUTPUT)
    await getOrGenerateCallScript('pros_1', { force: true })
    expect(aiMock).toHaveBeenCalledTimes(1)
    expect(state.updates).toHaveLength(1)
  })

  it('returns null when AI is unconfigured (cache miss)', async () => {
    configuredMock.mockReturnValue(false)
    state.selectQueue.push([PROSPECT])
    expect(await getOrGenerateCallScript('pros_1')).toBeNull()
    expect(aiMock).not.toHaveBeenCalled()
  })

  it('returns null for a missing prospect', async () => {
    state.selectQueue.push([])
    expect(await getOrGenerateCallScript('nope')).toBeNull()
  })

  it('generates, writes, and meters on success', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue(GOOD_OUTPUT)
    const script = await getOrGenerateCallScript('pros_1')
    expect(script).not.toBeNull()
    expect(script!.voicemail).toContain('Dustin')
    expect(state.updates).toHaveLength(1)
    expect((state.updates[0].values.callScript as { version: number }).version).toBe(1)
    expect(bumpMock).toHaveBeenCalledWith('2026-07', 'ai_call_script')
  })

  it('invalid AI output → null, no write, no meter', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ opener: 'too short only' }) // missing fields
    expect(await getOrGenerateCallScript('pros_1')).toBeNull()
    expect(state.updates).toHaveLength(0)
    expect(bumpMock).not.toHaveBeenCalled()
  })
})
