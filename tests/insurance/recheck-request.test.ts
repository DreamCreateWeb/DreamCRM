import { describe, it, expect } from 'vitest'
import { recheckRequest, requestFromOnFile, type EligibilityRequest } from '@/lib/insurance-eligibility'

/**
 * THE ONE RULE for what a re-check sends — shared by the tool page and the
 * record's rail card. The rail card used to send the last check's input
 * unconditionally, so correcting a mistyped member id and pressing "Check
 * again" billed a live 270 against the OLD card and showed a verdict for a
 * number no longer on file. Each wrong re-check is a billed check; this pins
 * which card goes out.
 */

const row = {
  firstName: 'Mia',
  lastName: 'Hayes',
  dateOfBirth: '1990-04-15',
  insuranceProvider: 'Delta Dental',
  insurancePolicyNumber: 'POL-NEW-999',
  insuranceGroupNumber: 'GRP-1',
  insuranceDetail: null,
}

const storedInput: EligibilityRequest = {
  patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1990-04-15' },
  carrierName: 'Delta Dental',
  memberId: 'POL-OLD-123',
  groupNumber: 'GRP-1',
  relationship: 'child',
  subscriber: { firstName: 'Ana', lastName: 'Hayes', dateOfBirth: '1965-01-02' },
  payerId: 'DDCA',
  payerName: 'Delta Dental of California',
} as EligibilityRequest

describe('recheckRequest', () => {
  it('sends the ON-FILE card when the policy number changed since the last check — never the stored typo', () => {
    const r = recheckRequest(row, { input: storedInput })
    expect(r.cardChanged).toBe(true)
    expect(r.request.memberId).toBe('POL-NEW-999')
    expect(r.request).toEqual(requestFromOnFile(row))
  })

  it('sends the stored check’s input while its member id is still the card on file (it knows the policyholder)', () => {
    const r = recheckRequest({ ...row, insurancePolicyNumber: 'POL-OLD-123' }, { input: storedInput })
    expect(r.cardChanged).toBe(false)
    expect(r.request).toBe(storedInput)
    expect(r.request.subscriber?.firstName).toBe('Ana')
  })

  it('treats surrounding whitespace on the policy number as the same card', () => {
    const r = recheckRequest({ ...row, insurancePolicyNumber: '  POL-OLD-123 ' }, { input: { ...storedInput, memberId: 'POL-OLD-123 ' } })
    expect(r.cardChanged).toBe(false)
  })

  it('an empty policy number on file defers to the stored check (nothing to disagree with)', () => {
    const r = recheckRequest({ ...row, insurancePolicyNumber: null }, { input: storedInput })
    expect(r.cardChanged).toBe(false)
    expect(r.request.memberId).toBe('POL-OLD-123')
  })

  it('with no check yet, it is simply the on-file card', () => {
    const r = recheckRequest(row, null)
    expect(r.cardChanged).toBe(false)
    expect(r.request).toEqual(requestFromOnFile(row))
  })
})
