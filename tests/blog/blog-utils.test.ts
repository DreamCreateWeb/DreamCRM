import { describe, it, expect } from 'vitest'
import { excerptFromHtml, readingTimeMinutes } from '@/lib/utils'

describe('excerptFromHtml', () => {
  it('strips tags and collapses whitespace', () => {
    expect(excerptFromHtml('<p>Hello   <strong>there</strong></p>')).toBe('Hello there')
  })

  it('truncates long text at a word boundary with an ellipsis', () => {
    const long = `<p>${'word '.repeat(80)}</p>`
    const out = excerptFromHtml(long, 50)
    expect(out.length).toBeLessThanOrEqual(51)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toContain('wor…') // cut on a space, not mid-word
  })

  it('returns empty string for empty input', () => {
    expect(excerptFromHtml('')).toBe('')
  })
})

describe('readingTimeMinutes', () => {
  it('is at least 1 minute', () => {
    expect(readingTimeMinutes('<p>short</p>')).toBe(1)
  })

  it('scales with word count (~200 wpm)', () => {
    const words = `<p>${'word '.repeat(600)}</p>`
    expect(readingTimeMinutes(words)).toBe(3)
  })
})
