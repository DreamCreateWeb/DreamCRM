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

import { draftBlogPost, draftSocialCaption } from '@/lib/services/ai-blog'

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
