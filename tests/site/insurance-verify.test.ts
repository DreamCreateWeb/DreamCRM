import { describe, it, expect } from 'vitest'
import { matchCarrier, carrierFromLeadMessage } from '@/lib/types/lead-forms'

const ACCEPTED = ['Delta Dental', 'Cigna', 'MetLife', 'Blue Cross Blue Shield']

describe('matchCarrier — a fact about the accepted list, never about the plan', () => {
  it('matches the practice’s own entry through case, punctuation and noise words', () => {
    expect(matchCarrier('delta dental', ACCEPTED)).toBe('Delta Dental')
    expect(matchCarrier('Delta Dental Insurance', ACCEPTED)).toBe('Delta Dental')
    expect(matchCarrier('CIGNA', ACCEPTED)).toBe('Cigna')
    expect(matchCarrier('Delta Dental of California', ACCEPTED)).toBe('Delta Dental')
    expect(matchCarrier('Blue Cross Blue Shield of Texas', ACCEPTED)).toBe('Blue Cross Blue Shield')
  })
  it('does not match a different carrier or a substring of one', () => {
    expect(matchCarrier('Aetna', ACCEPTED)).toBeNull()
    expect(matchCarrier('Signa', ACCEPTED)).toBeNull()
    expect(matchCarrier('Blue Cross', ['Blue Shield'])).toBeNull()
  })
  it('says nothing for an empty, other or list-less ask', () => {
    expect(matchCarrier('', ACCEPTED)).toBeNull()
    expect(matchCarrier('__other__', ACCEPTED)).toBeNull()
    expect(matchCarrier('Cigna', [])).toBeNull()
    expect(matchCarrier('Cigna', null)).toBeNull()
  })
})

describe('carrierFromLeadMessage — the parseable first line', () => {
  it('reads "Carrier: X" off the first line only', () => {
    expect(carrierFromLeadMessage('Carrier: Delta Dental\nInsurance verification request.')).toBe('Delta Dental')
    expect(carrierFromLeadMessage('Insurance verification request.\nCarrier: Cigna')).toBeNull()
    expect(carrierFromLeadMessage('Carrier:   \nx')).toBeNull()
    expect(carrierFromLeadMessage(null)).toBeNull()
  })
})
