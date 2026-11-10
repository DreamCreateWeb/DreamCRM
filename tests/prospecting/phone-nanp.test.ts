import { describe, it, expect } from 'vitest'
import { validateNanp, nanpDigits, NANP_FAILURE_LABELS } from '@/lib/phone-nanp'

/**
 * The NANP syntax matrix (P-01) — the free filter in front of the metered
 * line check. A number that fails here cannot ring anywhere; one that
 * passes is only well-formed, never "live".
 */

describe('nanpDigits', () => {
  it('strips formatting and a leading country code', () => {
    expect(nanpDigits('(404) 555-1212')).toBe('4045551212')
    expect(nanpDigits('+1 404 555 1212')).toBe('4045551212')
    expect(nanpDigits('14045551212')).toBe('4045551212')
    expect(nanpDigits(null)).toBe('')
  })
})

describe('validateNanp — the matrix', () => {
  const VALID = ['4045551212', '2125550200' /* 555-01xx is the only fictional block */, '9075552222', '(770) 262-9000', '+1 501 982 4447']
  const INVALID: Array<[string, keyof typeof NANP_FAILURE_LABELS]> = [
    ['404555121', 'not_ten_digits'],
    ['40455512123', 'not_ten_digits'],
    ['', 'not_ten_digits'],
    ['0045551212', 'area_code_leading_digit'],
    ['1045551212', 'area_code_leading_digit'],
    ['4040551212', 'exchange_leading_digit'],
    ['4041551212', 'exchange_leading_digit'],
    ['4115551212', 'n11_area_code'],
    ['9115551212', 'n11_area_code'],
    ['4044111212', 'n11_exchange'],
    ['4049111212', 'n11_exchange'],
    ['4045550100', 'fictional_555'],
    ['4045550199', 'fictional_555'],
  ]

  for (const n of VALID) {
    it(`${n} is well-formed`, () => {
      expect(validateNanp(n)).toEqual({ valid: true })
    })
  }
  for (const [n, reason] of INVALID) {
    it(`${n || '(empty)'} fails: ${reason}`, () => {
      const v = validateNanp(n)
      expect(v.valid).toBe(false)
      if (!v.valid) expect(v.reason).toBe(reason)
    })
  }

  it('555-02xx and up are ordinary numbers (only 555-01xx is reserved)', () => {
    expect(validateNanp('4045550200')).toEqual({ valid: true })
  })

  it('every failure has plain words for the drawer', () => {
    for (const label of Object.values(NANP_FAILURE_LABELS)) {
      expect(label.length).toBeGreaterThan(10)
      expect(label).not.toMatch(/_/)
    }
  })
})
