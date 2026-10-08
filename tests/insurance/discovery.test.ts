import { describe, it, expect } from 'vitest'
import {
  INCLUDED_MONTHLY_INSURANCE_DISCOVERIES,
  STEDI_DISCOVERY_PATH,
  DISCOVERY_COPY,
  buildDiscoveryRequest,
  candidateToRequest,
  ledgerSummaryForDiscovery,
  parseDiscoveryResponse,
  rankCandidates,
  sandboxDiscoveryCandidates,
  storableDiscoveryInput,
  validateDiscoveryInput,
  type DiscoveryCandidate,
} from '@/lib/insurance-discovery'

/**
 * INSURANCE DISCOVERY — the pure half. Pins: the validator (names, an ISO
 * date of birth not in the future, two-letter state, ZIP shape, a nine-digit
 * SSN with punctuation tolerated); the stored copy of the ask NEVER carries
 * the SSN; Stedi's request body (YYYYMMDD, dental STC 35, the SSN only
 * when given); the response parser over the documented shape (dependent
 * matches, status codes, dates, confidence); ranking; the chosen card as a
 * check request; the sandbox's determinism and its three reachable states.
 */

const NOW = new Date('2026-10-08T15:00:00Z')
const ASK = { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: 'ar', postalCode: '72554', ssn: '123-45-6789' }

describe('validateDiscoveryInput', () => {
  it('accepts a full ask, upper-casing the state and stripping SSN punctuation', () => {
    const v = validateDiscoveryInput(ASK, NOW)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value).toEqual({ firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: 'AR', postalCode: '72554', hasSsn: true, ssn: '123456789' })
  })

  it('names each missing or malformed field', () => {
    const v = validateDiscoveryInput({ firstName: '', lastName: ' ', dateOfBirth: '03/12/1988', state: 'Ark', postalCode: '1234', ssn: '12345' }, NOW)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(Object.keys(v.errors).sort()).toEqual(['dateOfBirth', 'firstName', 'lastName', 'postalCode', 'ssn', 'state'])
  })

  it('refuses a date of birth in the future and treats blanks as optional', () => {
    const future = validateDiscoveryInput({ ...ASK, dateOfBirth: '2027-01-01' }, NOW)
    expect(future.ok).toBe(false)
    const bare = validateDiscoveryInput({ firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' }, NOW)
    expect(bare.ok).toBe(true)
    if (bare.ok) expect(bare.value).toMatchObject({ state: null, postalCode: null, hasSsn: false, ssn: null })
  })

  it('tolerates junk input', () => {
    expect(validateDiscoveryInput(null, NOW).ok).toBe(false)
    expect(validateDiscoveryInput('x', NOW).ok).toBe(false)
  })
})

describe('storableDiscoveryInput', () => {
  it('drops the SSN and keeps only that one was given', () => {
    const v = validateDiscoveryInput(ASK, NOW)
    if (!v.ok) throw new Error('expected ok')
    const stored = storableDiscoveryInput(v.value)
    expect(stored).toEqual({ firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: 'AR', postalCode: '72554', hasSsn: true })
    expect(JSON.stringify(stored)).not.toContain('123456789')
  })
})

describe('buildDiscoveryRequest', () => {
  it('builds Stedi’s body: YYYYMMDD dates, dental, the SSN and address only when given', () => {
    const v = validateDiscoveryInput(ASK, NOW)
    if (!v.ok) throw new Error('expected ok')
    expect(buildDiscoveryRequest(v.value, { npi: '1999999984', now: NOW })).toEqual({
      provider: { npi: '1999999984' },
      subscriber: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '19880312', ssn: '123456789', address: { state: 'AR', postalCode: '72554' } },
      encounter: { serviceTypeCodes: ['35'], dateOfService: '20261008' },
    })
    const bare = validateDiscoveryInput({ firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' }, NOW)
    if (!bare.ok) throw new Error('expected ok')
    const body = buildDiscoveryRequest(bare.value, { npi: '1999999984', now: NOW })
    expect(body.subscriber).toEqual({ firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '19880312' })
    expect(STEDI_DISCOVERY_PATH).toBe('/2024-04-01/insurance-discovery/check/v1')
  })
})

const STEDI_ITEMS = {
  discoveryId: 'disc-abc',
  status: 'COMPLETE',
  coveragesFound: 2,
  items: [
    {
      payerId: '77777',
      payer: { name: { organization: 'Delta Dental of California' }, payorIdentification: '77777' },
      subscriber: { memberId: 'DD-100', groupNumber: 'G-1', firstName: 'MIA', lastName: 'HAYES', dateOfBirth: '19880312' },
      planInformation: { planDescription: 'Delta Dental PPO' },
      planDateInformation: { planBegin: '20260101' },
      benefitsInformation: [{ code: '1', serviceTypeCodes: ['35'] }],
      confidence: { level: 'REVIEW_NEEDED' },
    },
    {
      payer: { name: 'Cigna', payorIdentification: '62308' },
      subscriber: { memberId: 'CG-9', firstName: 'JOHN', lastName: 'HAYES', dateOfBirth: '19850101' },
      dependent: { firstName: 'MIA', lastName: 'HAYES', dateOfBirth: '19880312' },
      planInformation: { groupNumber: 'G-2' },
      planDateInformation: { eligibilityBegin: '20240101', eligibilityEnd: '20251231' },
      benefitsInformation: [{ code: '6', serviceTypeCodes: ['30'] }],
    },
    // No member id: not a card anyone could check — dropped.
    { payerId: '00000', payer: { name: 'Nobody' }, subscriber: { firstName: 'X', lastName: 'Y' } },
  ],
}

describe('parseDiscoveryResponse', () => {
  it('reads Stedi’s complete answer into candidate cards, dependents included', () => {
    const p = parseDiscoveryResponse(STEDI_ITEMS)
    expect(p.status).toBe('complete')
    expect(p.discoveryId).toBe('disc-abc')
    expect(p.coveragesFound).toBe(2)
    expect(p.candidates).toHaveLength(2)
    expect(p.candidates[0]).toEqual({
      payerName: 'Delta Dental of California',
      payerId: '77777',
      payorIdentification: '77777',
      memberId: 'DD-100',
      groupNumber: 'G-1',
      planName: 'Delta Dental PPO',
      planBegin: '2026-01-01',
      planEnd: null,
      status: 'active',
      dental: true,
      relationship: 'self',
      subscriber: null,
      matchedName: 'MIA HAYES',
      matchedDateOfBirth: '1988-03-12',
      confidence: 'REVIEW_NEEDED',
    })
    expect(p.candidates[1]).toMatchObject({
      payerName: 'Cigna',
      payerId: '62308',
      memberId: 'CG-9',
      groupNumber: 'G-2',
      planBegin: '2024-01-01',
      planEnd: '2025-12-31',
      status: 'inactive',
      dental: false,
      relationship: 'dependent',
      subscriber: { firstName: 'JOHN', lastName: 'HAYES', dateOfBirth: '1985-01-01' },
      matchedName: 'MIA HAYES',
      confidence: null,
    })
  })

  it('a dental status row beats a plan-wide one', () => {
    const p = parseDiscoveryResponse({
      status: 'COMPLETE',
      items: [{ payerId: '1', payer: { name: 'P' }, subscriber: { memberId: 'M' }, benefitsInformation: [{ code: '1', serviceTypeCodes: ['30'] }, { code: '6', serviceTypeCodes: ['35'] }] }],
    })
    expect(p.candidates[0]).toMatchObject({ status: 'inactive', dental: true })
  })

  it('reads PENDING and ERROR, and treats a bare error list as an error', () => {
    expect(parseDiscoveryResponse({ status: 'PENDING', discoveryId: 'd1' })).toMatchObject({ status: 'pending', discoveryId: 'd1', candidates: [] })
    const err = parseDiscoveryResponse({ status: 'ERROR', errors: [{ code: '42', description: 'Unable to respond' }] })
    expect(err).toMatchObject({ status: 'error', errors: ['Unable to respond (42)'] })
    expect(parseDiscoveryResponse({ errors: [{ description: 'bad' }] }).status).toBe('error')
    expect(parseDiscoveryResponse(null)).toMatchObject({ status: 'complete', candidates: [], coveragesFound: 0 })
  })
})

function card(over: Partial<DiscoveryCandidate>): DiscoveryCandidate {
  return {
    payerName: 'P',
    payerId: '1',
    payorIdentification: null,
    memberId: 'M',
    groupNumber: null,
    planName: null,
    planBegin: null,
    planEnd: null,
    status: 'unknown',
    dental: false,
    relationship: 'self',
    subscriber: null,
    matchedName: '',
    matchedDateOfBirth: null,
    confidence: null,
    ...over,
  }
}

describe('rankCandidates', () => {
  it('puts active dental matches first, then active, then a matching birthday, keeping payer order otherwise', () => {
    const ranked = rankCandidates(
      [card({ memberId: 'a', status: 'inactive', dental: true }), card({ memberId: 'b', status: 'active' }), card({ memberId: 'c', status: 'active', dental: true }), card({ memberId: 'd', status: 'unknown', matchedDateOfBirth: '1988-03-12' }), card({ memberId: 'e', status: 'unknown' })],
      { dateOfBirth: '1988-03-12' },
    )
    expect(ranked.map((c) => c.memberId)).toEqual(['c', 'b', 'd', 'e', 'a'])
  })
})

describe('candidateToRequest', () => {
  const ask = { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' }
  it('fills the check form from the chosen card with the patient as themselves', () => {
    expect(candidateToRequest(card({ payerName: 'Delta', payerId: '77777', memberId: 'DD-1', groupNumber: 'G' }), ask)).toEqual({
      patient: ask,
      carrierName: 'Delta',
      payerId: '77777',
      payerName: 'Delta',
      memberId: 'DD-1',
      groupNumber: 'G',
      relationship: 'self',
      subscriber: null,
    })
  })
  it('a dependent match carries the policyholder; one without a full policyholder falls back to self', () => {
    const dep = candidateToRequest(card({ relationship: 'dependent', subscriber: { firstName: 'John', lastName: 'Hayes', dateOfBirth: '1985-01-01' } }), ask)
    expect(dep.relationship).toBe('other')
    expect(dep.subscriber).toEqual({ firstName: 'John', lastName: 'Hayes', dateOfBirth: '1985-01-01' })
    const half = candidateToRequest(card({ relationship: 'dependent', subscriber: { firstName: 'John', lastName: 'Hayes', dateOfBirth: null } }), ask)
    expect(half.relationship).toBe('self')
    expect(half.subscriber).toBeNull()
  })
})

describe('sandboxDiscoveryCandidates', () => {
  const base = { state: null, postalCode: null, hasSsn: false }
  it('is deterministic per name + date of birth and never names a real member', () => {
    const a = sandboxDiscoveryCandidates({ ...base, firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' }, NOW)
    const b = sandboxDiscoveryCandidates({ ...base, firstName: 'mia', lastName: 'HAYES', dateOfBirth: '1988-03-12' }, NOW)
    expect(a).toEqual(b)
    for (const c of a) {
      expect(c.confidence).toBe('REVIEW_NEEDED')
      expect(c.matchedDateOfBirth).toBe('1988-03-12')
    }
  })
  it('reaches all three states across names: one card, two with an ended one, and nothing', () => {
    const seen = { one: 0, two: 0, none: 0 }
    for (let i = 0; i < 60; i++) {
      const list = sandboxDiscoveryCandidates({ ...base, firstName: `Name${i}`, lastName: 'Test', dateOfBirth: '1990-01-01' }, NOW)
      if (list.length === 0) seen.none++
      else if (list.length === 1) seen.one++
      else {
        seen.two++
        expect(list[0].status).toBe('active')
        expect(list[1].status).toBe('inactive')
        expect(list[1].planEnd).toBe('2025-12-31')
      }
    }
    expect(seen.one).toBeGreaterThan(0)
    expect(seen.two).toBeGreaterThan(0)
    expect(seen.none).toBeGreaterThan(0)
  })
})

describe('copy + ledger', () => {
  it('the confirm names the cost under a billed driver and the practice answer otherwise', () => {
    expect(DISCOVERY_COPY.confirmBody({ used: 3, included: 20, unreadable: false }, true)).toContain('3 of 20')
    expect(DISCOVERY_COPY.confirmBody({ used: 3, included: 20, unreadable: true }, true)).not.toContain('3 of 20')
    expect(DISCOVERY_COPY.confirmBody(null, false)).toContain('practice answer')
    expect(INCLUDED_MONTHLY_INSURANCE_DISCOVERIES).toBe(20)
  })
  it('narrates each outcome in the patient’s name', () => {
    const base = { input: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: null, postalCode: null, hasSsn: false }, driver: 'stedi' as const }
    expect(ledgerSummaryForDiscovery({ ...base, status: 'found', coveragesFound: 2 }, 'Mia Hayes')).toBe('Searched for Mia Hayes’ insurance — 2 possible plans')
    expect(ledgerSummaryForDiscovery({ ...base, status: 'found', coveragesFound: 1 }, '')).toBe('Searched for Mia Hayes’ insurance — 1 possible plan')
    expect(ledgerSummaryForDiscovery({ ...base, driver: 'sandbox', status: 'none', coveragesFound: 0 }, 'Dana')).toBe('Searched for Dana’s insurance — nothing found (practice answer)')
    expect(ledgerSummaryForDiscovery({ ...base, status: 'pending', coveragesFound: 0 }, 'Dana')).toContain('still answering')
    expect(ledgerSummaryForDiscovery({ ...base, status: 'error', coveragesFound: 0 }, 'Dana')).toContain('couldn’t')
  })
})
