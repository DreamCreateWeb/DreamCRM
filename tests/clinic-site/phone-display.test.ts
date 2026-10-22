/**
 * The phone as the public site prints it (lib/phone.ts formatPhoneForSite).
 *
 * `clinic_profile.phone` arrives as bare digits from a PMS or NPPES import
 * ("5019824447") and every template printed the column as-is — the first
 * client's office manager circled it. Bare digits are dashed for display;
 * a number the practice spelled out on purpose is left exactly as typed.
 */
import { describe, it, expect } from 'vitest'
import { formatPhoneForSite } from '@/lib/phone'

describe('formatPhoneForSite', () => {
  it('dashes bare ten digits, with or without a leading 1 / +1', () => {
    expect(formatPhoneForSite('5019824447')).toBe('501-982-4447')
    expect(formatPhoneForSite('15019824447')).toBe('501-982-4447')
    expect(formatPhoneForSite('+15019824447')).toBe('501-982-4447')
    expect(formatPhoneForSite(' 501 982 4447 ')).toBe('501-982-4447')
  })

  it('leaves a deliberately spelled number alone', () => {
    expect(formatPhoneForSite('(501) 982-4447')).toBe('(501) 982-4447')
    expect(formatPhoneForSite('501.982.4447')).toBe('501.982.4447')
    expect(formatPhoneForSite('501-982-4447 ext 2')).toBe('501-982-4447 ext 2')
    expect(formatPhoneForSite('501-982-4447')).toBe('501-982-4447')
  })

  it('passes null, empty and the unparseable through', () => {
    expect(formatPhoneForSite(null)).toBeNull()
    expect(formatPhoneForSite(undefined)).toBeNull()
    expect(formatPhoneForSite('')).toBe('')
    expect(formatPhoneForSite('call the front desk')).toBe('call the front desk')
    expect(formatPhoneForSite('98244')).toBe('98244')
  })
})
