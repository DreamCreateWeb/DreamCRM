import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { configured: boolean; toolInput: unknown; text: string | null } = {
  configured: true,
  toolInput: null,
  text: '',
}

vi.mock('@/lib/ai', () => ({
  aiConfigured: () => state.configured,
  runClaudeJson: async () => state.toolInput,
  runClaudeText: async () => state.text,
}))

import { draftBlogPost, draftSocialCaption, suggestBlogTopics, suggestFaqs } from '@/lib/services/ai-blog'

beforeEach(() => {
  state.configured = true
  state.toolInput = null
  state.text = ''
})

describe('draftBlogPost', () => {
  const full = {
    title: 'Why flossing matters',
    excerpt: 'A short, friendly guide.',
    bodyHtml: '<p>Floss daily.</p><script>alert(1)</script>',
    category: 'Oral Health',
    seoTitle: 'Why flossing matters | Clinic',
    seoDescription: 'A friendly guide to flossing.',
  }

  it('returns null when AI is not configured', async () => {
    state.configured = false
    state.toolInput = full
    expect(await draftBlogPost('topic')).toBeNull()
  })

  it('returns null on an empty topic', async () => {
    expect(await draftBlogPost('   ')).toBeNull()
  })

  it('returns the structured draft and sanitizes the body', async () => {
    state.toolInput = full
    const out = await draftBlogPost('flossing')
    expect(out?.title).toBe('Why flossing matters')
    expect(out?.category).toBe('Oral Health')
    expect(out?.bodyHtml).toContain('<p>Floss daily.</p>')
    expect(out?.bodyHtml).not.toContain('script')
  })

  it('handles bodyHtml with quotes — tool-use object needs no JSON parsing', async () => {
    state.toolInput = {
      ...full,
      bodyHtml: '<p>Pick the <a href="https://x.com">"right"</a> brush.</p>',
    }
    const out = await draftBlogPost('topic')
    expect(out?.bodyHtml).toContain('href="https://x.com"')
  })

  it('returns null when the model returns no tool input', async () => {
    state.toolInput = null
    expect(await draftBlogPost('topic')).toBeNull()
  })

  it('returns null when the tool input is missing required fields', async () => {
    state.toolInput = { title: 'only a title' }
    expect(await draftBlogPost('topic')).toBeNull()
  })
})

describe('draftSocialCaption', () => {
  it('returns the trimmed caption text', async () => {
    state.text = '  Read our new post on gum health.  '
    expect(await draftSocialCaption('Gum health', 'About gums')).toBe(
      'Read our new post on gum health.',
    )
  })

  it('returns null when AI is not configured', async () => {
    state.configured = false
    expect(await draftSocialCaption('T', 'E')).toBeNull()
  })

  it('returns null on an empty title', async () => {
    expect(await draftSocialCaption('', 'E')).toBeNull()
  })
})

describe('suggestBlogTopics', () => {
  it('returns the parsed list of ideas', async () => {
    state.toolInput = {
      ideas: [
        { title: 'Why crowns last', angle: 'How crowns protect a tooth.', category: 'Treatments', targetQuery: 'how long do crowns last' },
        { title: 'Flossing 101', angle: 'The easy way to floss.', category: 'Oral Health' },
      ],
    }
    const out = await suggestBlogTopics({ services: ['Cleanings', 'Crowns'], city: 'Austin', state: 'TX' })
    expect(out?.length).toBe(2)
    expect(out?.[0].title).toBe('Why crowns last')
  })

  it('works with no services configured', async () => {
    state.toolInput = { ideas: [{ title: 'A', angle: 'b', category: 'Oral Health' }] }
    const out = await suggestBlogTopics({ services: [] })
    expect(out?.length).toBe(1)
  })

  it('returns null when AI is not configured', async () => {
    state.configured = false
    state.toolInput = { ideas: [{ title: 'A', angle: 'b', category: 'c' }] }
    expect(await suggestBlogTopics({ services: ['X'] })).toBeNull()
  })

  it('returns null when the model returns no tool input', async () => {
    state.toolInput = null
    expect(await suggestBlogTopics({ services: ['X'] })).toBeNull()
  })
})

describe('suggestFaqs', () => {
  it('returns the parsed FAQ list', async () => {
    state.toolInput = {
      faqs: [
        { q: 'Does it hurt?', a: 'No — we keep it comfortable.' },
        { q: 'How long does it take?', a: 'About an hour.' },
      ],
    }
    const out = await suggestFaqs('Root canals', '<p>About root canals.</p>')
    expect(out?.length).toBe(2)
    expect(out?.[0].q).toBe('Does it hurt?')
  })

  it('returns null when AI is not configured', async () => {
    state.configured = false
    state.toolInput = { faqs: [{ q: 'a', a: 'b' }] }
    expect(await suggestFaqs('T', '<p>x</p>')).toBeNull()
  })

  it('returns null with no title or body', async () => {
    expect(await suggestFaqs('', '')).toBeNull()
  })
})
