import { describe, it, expect } from 'vitest'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'

describe('sanitizeBlogHtml', () => {
  it('strips <script> and inline event handlers', () => {
    const out = sanitizeBlogHtml('<p onclick="evil()">hi</p><script>alert(1)</script>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('onclick')
    expect(out).toContain('<p>hi</p>')
  })

  it('keeps the semantic tags Tiptap produces', () => {
    const out = sanitizeBlogHtml(
      '<h2>Title</h2><p><strong>bold</strong> <em>it</em></p><ul><li>a</li></ul><blockquote>q</blockquote>',
    )
    expect(out).toContain('<h2>Title</h2>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<li>a</li>')
    expect(out).toContain('<blockquote>q</blockquote>')
  })

  it('keeps link href but forces rel="noopener noreferrer"', () => {
    const out = sanitizeBlogHtml('<a href="https://example.com">x</a>')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('drops inline styles and class attributes (prose handles styling)', () => {
    const out = sanitizeBlogHtml('<p style="color:red" class="foo" id="bar">x</p>')
    expect(out).not.toContain('style')
    expect(out).not.toContain('class')
    expect(out).not.toContain('id=')
  })

  it('strips javascript: URLs', () => {
    const out = sanitizeBlogHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
  })

  it('allows http(s) images but not data: URIs', () => {
    const out = sanitizeBlogHtml(
      '<img src="data:image/png;base64,AAAA" alt="x"><img src="https://cdn.example.com/a.jpg" alt="a">',
    )
    expect(out).not.toContain('data:image')
    expect(out).toContain('https://cdn.example.com/a.jpg')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeBlogHtml('')).toBe('')
  })
})
