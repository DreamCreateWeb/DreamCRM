import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  sanitizeAttachments,
  isImageAttachment,
  MAX_MESSAGE_ATTACHMENTS,
  type MessageAttachment,
} from '@/lib/types/messaging'
import { MessageAttachments } from '@/app/(double-sidebar)/messages/message-attachments'

/**
 * Image attachments on patient messages. The sanitizer is the trust boundary —
 * `meta.attachments` is untrusted (DB blob + client-supplied list), so it must
 * drop anything malformed, require an http(s) URL (no `javascript:` / `data:`),
 * cap the count, and bound field lengths. Plus the render component's image vs
 * link branch + empty guard.
 */

describe('sanitizeAttachments', () => {
  it('keeps a well-formed image attachment', () => {
    const out = sanitizeAttachments([
      { url: 'https://cdn.example.com/a.jpg', name: 'a.jpg', contentType: 'image/jpeg' },
    ])
    expect(out).toEqual([{ url: 'https://cdn.example.com/a.jpg', name: 'a.jpg', contentType: 'image/jpeg' }])
  })

  it('returns [] for non-array input', () => {
    expect(sanitizeAttachments(null)).toEqual([])
    expect(sanitizeAttachments(undefined)).toEqual([])
    expect(sanitizeAttachments('nope')).toEqual([])
    expect(sanitizeAttachments({ url: 'https://x/y.jpg' })).toEqual([])
  })

  it('drops entries without an http(s) URL (no javascript:/data:/relative)', () => {
    const out = sanitizeAttachments([
      { url: 'javascript:alert(1)', name: 'x', contentType: 'image/png' },
      { url: 'data:image/png;base64,AAAA', name: 'x', contentType: 'image/png' },
      { url: '/relative/path.png', name: 'x', contentType: 'image/png' },
      { url: 'https://ok.example/z.png', name: 'z', contentType: 'image/png' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://ok.example/z.png')
  })

  it('accepts http and https, case-insensitively', () => {
    const out = sanitizeAttachments([
      { url: 'HTTP://ok.example/a.png', name: 'a', contentType: 'image/png' },
      { url: 'https://ok.example/b.png', name: 'b', contentType: 'image/png' },
    ])
    expect(out).toHaveLength(2)
  })

  it('drops malformed members but keeps the valid ones', () => {
    const out = sanitizeAttachments([
      null,
      'string',
      42,
      { url: 'https://ok.example/a.png', name: 'a', contentType: 'image/png' },
      { name: 'no-url' },
    ])
    expect(out).toHaveLength(1)
  })

  it('caps the count at MAX_MESSAGE_ATTACHMENTS', () => {
    const many = Array.from({ length: MAX_MESSAGE_ATTACHMENTS + 4 }).map((_, i) => ({
      url: `https://ok.example/${i}.png`,
      name: `${i}`,
      contentType: 'image/png',
    }))
    expect(sanitizeAttachments(many)).toHaveLength(MAX_MESSAGE_ATTACHMENTS)
  })

  it('trims + bounds name and contentType lengths', () => {
    const out = sanitizeAttachments([
      { url: 'https://ok.example/a.png', name: 'x'.repeat(500), contentType: 'y'.repeat(300) },
    ])
    expect(out[0].name.length).toBe(200)
    expect(out[0].contentType.length).toBe(100)
  })

  it('coerces a missing name/contentType to empty strings', () => {
    const out = sanitizeAttachments([{ url: 'https://ok.example/a.png' }])
    expect(out[0]).toMatchObject({ name: '', contentType: '' })
  })
})

describe('isImageAttachment', () => {
  it('is true only for image/* content types', () => {
    expect(isImageAttachment({ contentType: 'image/jpeg' })).toBe(true)
    expect(isImageAttachment({ contentType: 'image/png' })).toBe(true)
    expect(isImageAttachment({ contentType: 'application/pdf' })).toBe(false)
    expect(isImageAttachment({ contentType: '' })).toBe(false)
    expect(isImageAttachment({ contentType: null })).toBe(false)
    expect(isImageAttachment({})).toBe(false)
  })
})

describe('<MessageAttachments />', () => {
  const img: MessageAttachment = { url: 'https://cdn.example/x.jpg', name: 'x.jpg', contentType: 'image/jpeg' }

  it('renders nothing when empty/undefined', () => {
    const { container } = render(<MessageAttachments attachments={[]} />)
    expect(container.firstChild).toBeNull()
    const { container: c2 } = render(<MessageAttachments attachments={undefined} />)
    expect(c2.firstChild).toBeNull()
  })

  it('renders an image thumbnail linking to the full-size URL in a new tab', () => {
    render(<MessageAttachments attachments={[img]} />)
    const link = screen.getByTitle('x.jpg')
    expect(link).toHaveAttribute('href', img.url)
    expect(link).toHaveAttribute('target', '_blank')
    const el = link.querySelector('img')!
    expect(el).toHaveAttribute('src', img.url)
    expect(el).toHaveAttribute('alt', 'x.jpg')
  })

  it('falls back to a download link for a non-image attachment', () => {
    const pdf: MessageAttachment = { url: 'https://cdn.example/f.pdf', name: 'form.pdf', contentType: 'application/pdf' }
    render(<MessageAttachments attachments={[pdf]} />)
    const link = screen.getByText(/form\.pdf/)
    expect(link.closest('a')).toHaveAttribute('href', pdf.url)
    expect(link.closest('a')?.querySelector('img')).toBeNull()
  })
})
