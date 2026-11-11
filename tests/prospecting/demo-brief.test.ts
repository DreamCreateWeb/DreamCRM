import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The AI pre-demo brief — cache-hit skips the AI, force regenerates,
 * invalid output writes nothing, invented beat ids are filtered, the
 * ai_brief counter bumps, the prompt builder grounds itself in real beat
 * ids + verified signals only, and the stored-blob parser is junk-tolerant.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
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
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
          },
        }),
      }),
    },
    schema: { prospect: { _n: 'prospect', id: 'id', demoBrief: 'brief' } },
  }
})
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})) }))

const { aiMock, bumpMock } = vi.hoisted(() => ({
  aiMock: vi.fn(),
  bumpMock: vi.fn(async () => {}),
}))
vi.mock('@/lib/ai', () => ({ runClaudeJson: aiMock, aiConfigured: () => true }))
vi.mock('@/lib/services/prospecting', () => ({
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
  getProspectingConfig: () =>
    Promise.resolve({ brain: { productOverride: '', battleCards: [] } }),
}))

import { generateDemoBrief, getDemoBrief } from '@/lib/services/demo-brief'
import { buildDemoBriefPrompt } from '@/lib/demo-brief-prompt'
import { parseDemoBrief } from '@/lib/types/demo-brief'
import { DEMO_BEATS } from '@/lib/types/demo-script'

const GOOD_OUTPUT = {
  openingLine: 'Maria, I looked at Lone Star Dental online before this call.',
  walkUpStory: 'Their site works hard but has not had help since 2019 — no online booking, no mobile viewport.',
  beatEmphasis: [
    { beatId: 'website', weight: 'lead', why: 'The site is the visible gap.' },
    { beatId: 'appointments', weight: 'standard', why: 'No online booking today.' },
    { beatId: 'analytics', weight: 'skim', why: 'Proof comes later.' },
    { beatId: 'imaginary_beat', weight: 'standard', why: 'Model invention — must be dropped.' },
  ],
  objections: [{ objection: 'We already have a website.', response: 'It works against you on mobile — let me show you.' }],
  ammunition: [
    { beatId: 'appointments', point: 'No online booking today' },
    { beatId: 'not_a_beat', point: 'invented — dropped' },
  ],
  closingAsk: 'Two weeks, your colors, no commitment — can I set it up?',
}

const PROSPECT = {
  id: 'pros_1', name: 'Lone Star Dental', city: 'Dallas', state: 'TX',
  authorizedOfficialName: 'DR. MARIA GARZA', websiteUrl: 'https://lonestardental.com',
  googleRatingTenths: 38, reviewCount: 12, scoreReasons: ['Weak website (25/100)'],
  enrichment: null, aiVerdict: null, demoBrief: null,
}

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
})

describe('generateDemoBrief', () => {
  it('generates, filters invented beat ids, writes, and meters', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue(GOOD_OUTPUT)

    const brief = await generateDemoBrief('pros_1')
    expect(brief).not.toBeNull()
    expect(brief!.openingLine).toContain('Maria')
    expect(brief!.beatEmphasis.map((e) => e.beatId)).toEqual(['website', 'appointments', 'analytics'])
    expect(brief!.ammunition.map((a) => a.beatId)).toEqual(['appointments'])
    expect(state.updates.at(-1)!.values.demoBrief).toMatchObject({ version: 1, model: 'sonnet' })
    expect(bumpMock).toHaveBeenCalledWith('2026-07', 'ai_brief')
  })

  it('CLAMPS an over-long / oversized model output instead of nulling (regression)', async () => {
    // The model ignoring the length hints must never silently fail the brief:
    // walk-up story way over 800, 7 objections, a 900-char response.
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({
      ...GOOD_OUTPUT,
      openingLine: 'x'.repeat(500),
      walkUpStory: 'y'.repeat(1400),
      objections: Array.from({ length: 7 }, (_, i) => ({ objection: `o${i}`, response: 'z'.repeat(900) })),
    })
    const brief = await generateDemoBrief('pros_1')
    expect(brief).not.toBeNull()
    expect(brief!.openingLine.length).toBeLessThanOrEqual(300)
    expect(brief!.walkUpStory.length).toBeLessThanOrEqual(800)
    expect(brief!.objections.length).toBeLessThanOrEqual(5)
    expect(brief!.objections[0].response.length).toBeLessThanOrEqual(400)
  })

  it('cache hit returns the stored brief WITHOUT touching the AI', async () => {
    const cached = { ...GOOD_OUTPUT, version: 1, generatedAt: '2026-07-01T00:00:00Z', model: 'sonnet' }
    state.selectQueue.push([{ ...PROSPECT, demoBrief: cached }])
    const brief = await generateDemoBrief('pros_1')
    expect(brief!.openingLine).toBe(GOOD_OUTPUT.openingLine)
    expect(aiMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('force regenerates over a cached brief', async () => {
    const cached = { ...GOOD_OUTPUT, version: 1, generatedAt: '2026-07-01T00:00:00Z', model: 'sonnet' }
    state.selectQueue.push([{ ...PROSPECT, demoBrief: cached }])
    aiMock.mockResolvedValue({ ...GOOD_OUTPUT, openingLine: 'A fresh opening line for the rewrite.' })
    const brief = await generateDemoBrief('pros_1', { force: true })
    expect(brief!.openingLine).toBe('A fresh opening line for the rewrite.')
    expect(state.updates).toHaveLength(1)
  })

  it('invalid AI output → null + ZERO writes', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockResolvedValue({ openingLine: 'too short only' }) // missing everything
    expect(await generateDemoBrief('pros_1')).toBeNull()
    expect(state.updates).toHaveLength(0)
    expect(bumpMock).not.toHaveBeenCalled()
  })

  it('AI transport failure → null + zero writes', async () => {
    state.selectQueue.push([PROSPECT])
    aiMock.mockRejectedValue(new Error('api down'))
    expect(await generateDemoBrief('pros_1')).toBeNull()
    expect(state.updates).toHaveLength(0)
  })
})

describe('getDemoBrief + parseDemoBrief', () => {
  it('reads a stored brief', async () => {
    const cached = { ...GOOD_OUTPUT, version: 1, generatedAt: '2026-07-01T00:00:00Z', model: 'sonnet' }
    state.selectQueue.push([{ demoBrief: cached }])
    expect((await getDemoBrief('pros_1'))!.closingAsk).toBe(GOOD_OUTPUT.closingAsk)
  })

  it('parser is junk-tolerant', () => {
    expect(parseDemoBrief(null)).toBeNull()
    expect(parseDemoBrief('string')).toBeNull()
    expect(parseDemoBrief({ openingLine: 'x' })).toBeNull() // missing required
    const partial = parseDemoBrief({
      openingLine: 'A good opening line.',
      walkUpStory: 'A sufficiently long walk-up story for the demo.',
      closingAsk: 'The ask.',
      beatEmphasis: [{ beatId: 'website', weight: 'nonsense', why: 'x' }, 'junk'],
      objections: 'junk',
      ammunition: [{ beatId: 'reviews', point: 'Only 12 reviews' }],
    })
    expect(partial).not.toBeNull()
    expect(partial!.beatEmphasis).toHaveLength(0) // bad weight filtered
    expect(partial!.objections).toHaveLength(0)
    expect(partial!.ammunition).toHaveLength(1)
  })
})

describe('buildDemoBriefPrompt', () => {
  it('grounds the prompt in verified signals + real beat ids only', () => {
    const { system, user } = buildDemoBriefPrompt({
      name: 'Lone Star Dental',
      city: 'Dallas',
      state: 'TX',
      authorizedOfficialName: 'DR. MARIA GARZA',
      websiteUrl: null,
      ratingTenths: 38,
      reviewCount: 12,
      scoreReasons: ['No website at all'],
      signals: null,
      verdict: null,
    })
    expect(user).toContain('Lone Star Dental')
    expect(user).toContain('NONE FOUND') // honest no-website line
    expect(user).toContain('3.8★')
    expect(user).toContain('~4.5★') // benchmark
    for (const beat of DEMO_BEATS) expect(user).toContain(beat.id)
    expect(system).toContain('MIRROR')
    expect(system).toContain('never invent facts')
  })

  it('W4: an UNREAD crawl says "site not read (<why>)" — never "mobile viewport false" about a page nobody read; a read page states its facts', () => {
    const base = {
      name: 'Lone Star Dental',
      city: 'Dallas',
      state: 'TX',
      authorizedOfficialName: 'DR. MARIA GARZA',
      websiteUrl: 'https://lonestardental.com',
      ratingTenths: 38,
      reviewCount: 12,
      scoreReasons: [],
      verdict: null,
    }
    const unread = {
      ssl: true,
      mobileViewport: false,
      copyrightYear: null,
      titleTag: null,
      metaDescription: null,
      bookingWidget: false,
      socialLinks: {},
      builder: null,
      stack: null,
      pageWeightKb: 0,
      emails: [],
      fetchedAt: '2026-11-10T00:00:00Z',
      error: 'fetch_failed',
    }
    const failed = buildDemoBriefPrompt({ ...base, signals: unread }).user
    expect(failed).toContain('Site signals: site not read (the site could not be read).')
    expect(failed).not.toMatch(/mobile viewport/)
    expect(failed).not.toMatch(/online-booking markers/)
    expect(failed).not.toMatch(/socials linked/)
    const robots = buildDemoBriefPrompt({ ...base, signals: { ...unread, error: 'robots_disallow' } }).user
    expect(robots).toContain('Site signals: site not read (robots.txt refused crawlers).')
    expect(buildDemoBriefPrompt({ ...base, signals: null }).user).toContain('Site signals: not crawled yet.')
    const read = buildDemoBriefPrompt({ ...base, signals: { ...unread, error: undefined, stack: [] } }).user
    expect(read).toContain('mobile viewport false')
    expect(read).toContain('online-booking markers false')
    // X1: the UNREAD verdict's placeholder 0 is never "Website quality 0/100".
    const unreadVerdict = { hasWebsite: true, websiteRead: false, websiteQuality: 0, websiteReasons: [], socialPresence: 0, onlineBooking: false, weaknesses: [], summary: 'Website not read.' }
    const judged = buildDemoBriefPrompt({ ...base, signals: unread, verdict: unreadVerdict }).user
    expect(judged).toContain('Website not read — quality unknown; do not describe or judge their site.')
    expect(judged).not.toMatch(/Website quality 0\/100/)
    expect(buildDemoBriefPrompt({ ...base, signals: null, verdict: { ...unreadVerdict, websiteRead: undefined, websiteQuality: 25 } }).user).toContain('Website quality 25/100')
  })
})
