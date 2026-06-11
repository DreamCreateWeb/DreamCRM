import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizePhone, sameEmail, samePhone } from '@/lib/contact-normalize'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jane@Example.COM ')).toBe('jane@example.com')
  })
  it('returns null for empty/whitespace/null', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('strips all non-digits', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567')
  })
  it('strips a leading US 1 on 11-digit numbers', () => {
    expect(normalizePhone('1 (555) 123-4567')).toBe('5551234567')
    expect(normalizePhone('+1-555-123-4567')).toBe('5551234567')
  })
  it('keeps a 10-digit number as-is', () => {
    expect(normalizePhone('5551234567')).toBe('5551234567')
  })
  it('does not strip a leading 1 when it is not an 11-digit number', () => {
    expect(normalizePhone('1234567')).toBe('1234567')
  })
  it('returns null for empty/null', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('sameEmail', () => {
  it('matches across casing/whitespace', () => {
    expect(sameEmail('Jane@X.com', ' jane@x.com ')).toBe(true)
  })
  it('is false when either side is empty', () => {
    expect(sameEmail('a@x.com', null)).toBe(false)
    expect(sameEmail(null, null)).toBe(false)
  })
})

describe('samePhone', () => {
  it('matches across formatting and the US country code', () => {
    expect(samePhone('1 (555) 123-4567', '555.123.4567')).toBe(true)
  })
  it('is false when either side is empty', () => {
    expect(samePhone('5551234567', '')).toBe(false)
  })
})
