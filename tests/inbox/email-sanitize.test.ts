import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from '@/lib/email-sanitize'

describe('sanitizeEmailHtml', () => {
  it('strips <script> tags entirely', () => {
    const html = '<p>Hi</p><script>alert(1)</script><p>Bye</p>'
    const out = sanitizeEmailHtml(html)
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('<p>Hi</p>')
    expect(out).toContain('<p>Bye</p>')
  })

  it('removes on* event handlers', () => {
    const html = '<img src="x" onerror="alert(1)" /><a href="#" onclick="bad()">click</a>'
    const out = sanitizeEmailHtml(html)
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('alert(1)')
    expect(out).not.toContain('bad()')
  })

  it('blocks javascript: and vbscript: URLs', () => {
    const html = '<a href="javascript:alert(1)">x</a><a href="vbscript:msgbox">y</a>'
    const out = sanitizeEmailHtml(html)
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('vbscript:')
  })

  it('keeps safe links and forces target=_blank + rel=noopener', () => {
    const html = '<a href="https://example.com">click</a>'
    const out = sanitizeEmailHtml(html)
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('allows safe inline styles', () => {
    const html = '<p style="color: red; font-weight: bold;">Hi</p>'
    const out = sanitizeEmailHtml(html)
    expect(out).toContain('color')
    expect(out).toContain('font-weight')
  })

  it('strips display: none (often used for tracking/cloaking)', () => {
    const html = '<div style="display: none">hidden</div>'
    const out = sanitizeEmailHtml(html)
    expect(out).not.toContain('display: none')
  })

  it('keeps tables (email layouts depend on them)', () => {
    const html = '<table><tr><td>cell</td></tr></table>'
    const out = sanitizeEmailHtml(html)
    expect(out).toContain('<table')
    expect(out).toContain('<td')
    expect(out).toContain('cell')
  })

  it('keeps images from http/https/data schemes', () => {
    const html = '<img src="https://example.com/pixel.gif" /><img src="data:image/png;base64,iVBOR" />'
    const out = sanitizeEmailHtml(html)
    expect(out).toContain('https://example.com')
    expect(out).toContain('data:image/png')
  })

  it('blocks <iframe>', () => {
    const html = '<iframe src="https://evil.com"></iframe>'
    const out = sanitizeEmailHtml(html)
    expect(out).not.toContain('<iframe')
  })

  it('strips <style> blocks so newsletter CSS cannot leak into the page', () => {
    // Real newsletter emails ship CSS like this. Without stripping, the
    // global `body` rule would resize the entire DreamCRM page.
    const html = '<style>body { font-size: 32px; } a { color: red }</style><p>hi</p>'
    const out = sanitizeEmailHtml(html)
    expect(out).not.toContain('<style')
    expect(out).not.toContain('font-size: 32px')
    expect(out).toContain('<p>hi</p>')
  })
})
