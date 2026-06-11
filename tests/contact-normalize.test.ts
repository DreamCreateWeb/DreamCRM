import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizePhone, sameEmail, samePhone } from '@/lib/contact-normalize'

/**
 * Canonical contact-matching helpers used to link guest shop orders /
 * memberships back to an existing patient. Match must survive case +
 * formatting differences but never collapse two genuinely different contacts.
 */

describe('normalizeEmail', () => {
  it('trims + lowercases', () => {
    expect(normalizeEmail('  Bob@Example.COM ')).toBe('bob@example.com')
  })
  it('returns null for empty / whitespace / nullish', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('(512) 555-0100')).toBe('5125550100')
  })
  it('drops a leading US 1 on 11-digit numbers', () => {
    expect(normalizePhone('1-512-555-0100')).toBe('5125550100')
    expect(normalizePhone('+1 (512) 555-0100')).toBe('5125550100')
  })
  it('keeps a 10-digit number as-is and leaves non-US lengths alone', () => {
    expect(normalizePhone('5125550100')).toBe('5125550100')
    // 11 digits NOT starting with 1 stay intact.
    expect(normalizePhone('25125550100')).toBe('25125550100')
  })
  it('returns null when there are no digits', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('n/a')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('sameEmail', () => {
  it('matches across case/whitespace', () => {
    expect(sameEmail('Bob@X.com', ' bob@x.com ')).toBe(true)
  })
  it('is false when either side is missing or different', () => {
    expect(sameEmail('bob@x.com', 'sue@x.com')).toBe(false)
    expect(sameEmail('bob@x.com', null)).toBe(false)
    expect(sameEmail(null, null)).toBe(false)
  })
})

describe('samePhone', () => {
  it('matches across formatting + leading US 1', () => {
    expect(samePhone('(512) 555-0100', '1-512-555-0100')).toBe(true)
    expect(samePhone('512.555.0100', '5125550100')).toBe(true)
  })
  it('is false for different numbers or a missing side', () => {
    expect(samePhone('5125550100', '5125550101')).toBe(false)
    expect(samePhone('5125550100', null)).toBe(false)
    expect(samePhone(null, null)).toBe(false)
  })
})
