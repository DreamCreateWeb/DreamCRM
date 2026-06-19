/**
 * Form-field validators — return a message or null. Used for inline,
 * pre-submit validation on the data-entry forms.
 */
import { describe, it, expect } from 'vitest'
import { validateRequired, validateEmail, validatePhone, collectErrors } from '@/lib/validation'

describe('validateRequired', () => {
  it('errors on blank / whitespace, passes on content', () => {
    expect(validateRequired('', 'First name')).toBe('First name is required.')
    expect(validateRequired('   ')).toBe('This field is required.')
    expect(validateRequired('Mia')).toBeNull()
  })
})

describe('validateEmail', () => {
  it('is optional by default but rejects bad formats', () => {
    expect(validateEmail('')).toBeNull()
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address.')
    expect(validateEmail('mia@example.com')).toBeNull()
  })
  it('can be required', () => {
    expect(validateEmail('', { required: true })).toBe('Email is required.')
  })
})

describe('validatePhone', () => {
  it('optional, but needs ≥10 digits when present (any formatting)', () => {
    expect(validatePhone('')).toBeNull()
    expect(validatePhone('555-123')).toBe('Enter a valid phone number.')
    expect(validatePhone('(555) 123-4567')).toBeNull()
    expect(validatePhone('555.123.4567')).toBeNull()
  })
})

describe('collectErrors', () => {
  it('keeps only the errored fields', () => {
    expect(
      collectErrors({ firstName: 'First name is required.', email: null, phone: 'Enter a valid phone number.' }),
    ).toEqual({ firstName: 'First name is required.', phone: 'Enter a valid phone number.' })
  })
})
