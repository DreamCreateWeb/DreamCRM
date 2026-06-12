/**
 * The `firstSentence` / `afterFirstSentence` pair powers the About-page
 * de-duplication (hero shows sentence 1, the Story body shows the remainder),
 * so the opening line never prints twice.
 */
import { describe, it, expect } from 'vitest'
import { firstSentence, afterFirstSentence } from '@/lib/clinic-site-helpers'

describe('firstSentence', () => {
  it('returns the first sentence up to its terminator', () => {
    expect(firstSentence('We care. And then more.')).toBe('We care.')
    expect(firstSentence('Open today! Come by.')).toBe('Open today!')
    expect(firstSentence('Why us? Because we listen.')).toBe('Why us?')
  })

  it('returns the whole string when there is no terminator', () => {
    expect(firstSentence('A clinic with no period')).toBe('A clinic with no period')
  })

  it('trims surrounding whitespace', () => {
    expect(firstSentence('   Hi there.  rest')).toBe('Hi there.')
  })
})

describe('afterFirstSentence', () => {
  it('returns everything after the first sentence, trimmed', () => {
    expect(afterFirstSentence('We care. And then more.')).toBe('And then more.')
    expect(afterFirstSentence('One. Two. Three.')).toBe('Two. Three.')
  })

  it('returns empty string for a single-sentence input (no duplication source)', () => {
    expect(afterFirstSentence('Just one sentence.')).toBe('')
    expect(afterFirstSentence('No terminator here')).toBe('')
  })

  it('is the exact complement of firstSentence (concat ≈ original, modulo inner space)', () => {
    const about = 'We started Acme to make going to the dentist feel human. No judgment. Ever.'
    const first = firstSentence(about)
    const rest = afterFirstSentence(about)
    expect(first).toBe('We started Acme to make going to the dentist feel human.')
    expect(rest).toBe('No judgment. Ever.')
    // Re-joining first + ' ' + rest reconstructs the source text.
    expect(`${first} ${rest}`).toBe(about)
  })
})
