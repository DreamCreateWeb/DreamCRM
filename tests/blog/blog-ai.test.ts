import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { configured: boolean; text: string | null } = { configured: true, text: '' }

vi.mock('@/lib/ai', () => ({
  aiConfigured: () => state.configured,
  runClaudeText: async () => state.text,
}))

import { draftBlogPost, draftSocialCaption } from '@/lib/services/ai-blog'

beforeEach(() => {
  state.configured = true
  state.text = ''
})

describe('draftBlogPost', () => {
  it('returns null when AI is not configured', async () => {
    state.configured = false
    state.text = JSON.stringify({ title: 'T', excerpt: 'E', bodyHtml: '<p>x</p>' })
    expect(await draftBlogPost('topic')).toBeNull()
  })

  it('returns null on an empty topic', async () => {
    expect(await draftBlogPost('   ')).toBeNull()
  })

  it('parses the JSON draft and sanitizes the body', async () => {
    state.text = JSON.stringify({
      title: 'Why flossing matters',
      excerpt: 'A short, friendly guide.',
      bodyHtml: '<p>Floss daily.</p><script>alert(1)</script>',
      category: 'Oral Health',
      seoTitle: 'Why flossing matters | Clinic',
      seoDescription: 'A friendly guide to flossing.',
    })
    const out = await draftBlogPost('flossing')
    expect(out?.title).toBe('Why flossing matters')
    expect(out?.category).toBe('Oral Health')
    expect(out?.bodyHtml).toContain('<p>Floss daily.</p>')
    expect(out?.bodyHtml).not.toContain('script')
  })

  it('tolerates JSON wrapped in surrounding prose', async () => {
    state.text = 'Sure!\n{"title":"T","excerpt":"E","bodyHtml":"<p>x</p>"}\nLet me know.'
    const out = await draftBlogPost('topic')
    expect(out?.title).toBe('T')
  })

  it('returns null when the model output has no JSON object', async () => {
    state.text = 'I cannot do that.'
    expect(await draftBlogPost('topic')).toBeNull()
  })

  it('returns null when the model returns nothing', async () => {
    state.text = null
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
