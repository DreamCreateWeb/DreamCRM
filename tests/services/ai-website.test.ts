import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/service-library-ai', () => ({ CORE_VOICE_RULES: 'VOICE RULES' }))

const runClaudeJson = vi.fn()
const aiConfigured = vi.fn(() => true)
vi.mock('@/lib/ai', () => ({
  runClaudeJson: (...a: unknown[]) => runClaudeJson(...a),
  aiConfigured: () => aiConfigured(),
}))

let selectResult: Array<{ count: number }> = []
const insertCalls: unknown[] = []
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: async (c: unknown) => {
          insertCalls.push({ v, c })
        },
      }),
    }),
  },
}))

import {
  generateSectionCopy,
  getAiUsage,
  incrementAiUsage,
  currentPeriod,
} from '@/lib/services/ai-website'

beforeEach(() => {
  runClaudeJson.mockReset()
  aiConfigured.mockReturnValue(true)
  selectResult = []
  insertCalls.length = 0
})

const ctx = { name: 'Acme Dental', city: 'Austin', services: ['Cleanings'], insuranceCarriers: ['Cigna'] }

describe('currentPeriod', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(currentPeriod(new Date('2026-06-03T00:00:00Z'))).toBe('2026-06')
    expect(currentPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12')
  })
})

describe('getAiUsage', () => {
  it('computes remaining from the stored count + plan limit', async () => {
    selectResult = [{ count: 12 }]
    const u = await getAiUsage('org_1', 'premium')
    expect(u).toMatchObject({ used: 12, limit: 200, remaining: 188 })
  })
  it('treats a missing row as zero usage', async () => {
    selectResult = []
    const u = await getAiUsage('org_1', 'pro')
    expect(u).toMatchObject({ used: 0, limit: 50, remaining: 50 })
  })
  it('never returns negative remaining (over-limit clamps to 0)', async () => {
    selectResult = [{ count: 99 }]
    const u = await getAiUsage('org_1', 'basic') // limit 15
    expect(u.remaining).toBe(0)
  })
})

describe('incrementAiUsage', () => {
  it('issues an upsert (insert … on conflict do update)', async () => {
    await incrementAiUsage('org_1')
    expect(insertCalls).toHaveLength(1)
  })
})

describe('generateSectionCopy', () => {
  it('returns ok:false when AI is not configured', async () => {
    aiConfigured.mockReturnValue(false)
    const r = await generateSectionCopy('hero', ctx)
    expect(r.ok).toBe(false)
  })

  it('hero — wraps a valid tagline', async () => {
    runClaudeJson.mockResolvedValue({ tagline: 'Gentle, judgment-free dentistry' })
    const r = await generateSectionCopy('hero', ctx)
    expect(r).toEqual({ ok: true, content: { section: 'hero', tagline: 'Gentle, judgment-free dentistry' } })
  })

  it('hero — rejects an empty tagline (validation)', async () => {
    runClaudeJson.mockResolvedValue({ tagline: '' })
    const r = await generateSectionCopy('hero', ctx)
    expect(r.ok).toBe(false)
  })

  it('stats — requires exactly 3 qualitative pairs', async () => {
    runClaudeJson.mockResolvedValue({
      stats: [
        { value: 'Same-week', label: 'appointments' },
        { value: 'Most', label: 'PPO insurance accepted' },
        { value: 'Judgment-free', label: 'every visit' },
      ],
    })
    const r = await generateSectionCopy('stats', ctx)
    expect(r.ok).toBe(true)
    if (r.ok && r.content.section === 'stats') expect(r.content.stats).toHaveLength(3)
  })

  it('stats — rejects the wrong count', async () => {
    runClaudeJson.mockResolvedValue({ stats: [{ value: 'a', label: 'b' }] })
    const r = await generateSectionCopy('stats', ctx)
    expect(r.ok).toBe(false)
  })

  it('faq — wraps a valid set', async () => {
    runClaudeJson.mockResolvedValue({
      faq: [
        { category: 'Booking', question: 'How do I book?', answer: 'Online or call.' },
        { category: 'Insurance', question: 'Do you take Cigna?', answer: 'Yes, and most PPO plans.' },
        { category: 'Your Visit', question: 'Nervous?', answer: 'We go slow, no judgment.' },
        { category: 'Billing', question: 'Cost?', answer: 'We give an itemized estimate first.' },
      ],
    })
    const r = await generateSectionCopy('faq', ctx)
    expect(r.ok).toBe(true)
    if (r.ok && r.content.section === 'faq') expect(r.content.faq.length).toBeGreaterThanOrEqual(4)
  })

  it('returns ok:false when the model returns null', async () => {
    runClaudeJson.mockResolvedValue(null)
    const r = await generateSectionCopy('about', ctx)
    expect(r.ok).toBe(false)
  })

  it('never throws — degrades when the call rejects', async () => {
    runClaudeJson.mockRejectedValue(new Error('network'))
    const r = await generateSectionCopy('about', ctx)
    expect(r.ok).toBe(false)
  })
})
