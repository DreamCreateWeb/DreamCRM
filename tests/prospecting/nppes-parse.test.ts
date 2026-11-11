import { describe, it, expect } from 'vitest'

/**
 * NPPES parsing + geo helpers — the pure discovery layer: result
 * normalization (address/phone/taxonomy/official), the dental-taxonomy
 * filter, dedupe-hash stability, and the state zip3/timezone maps.
 */

import {
  normalizeNppesResult,
  normalizePhone,
  isDentalTaxonomy,
  prospectDedupeHash,
  parseNpiLookup,
} from '@/lib/nppes'
import { stateZip3Prefixes, stateTimeZone, US_STATES } from '@/lib/types/us-geo'

const RAW = {
  number: 1234567890,
  basic: {
    organization_name: 'SMILE DENTAL PC',
    status: 'A',
    authorized_official_first_name: 'JANE',
    authorized_official_last_name: 'DOE',
    authorized_official_title_or_position: 'OWNER',
  },
  addresses: [
    {
      address_purpose: 'MAILING',
      address_1: 'PO BOX 99',
      city: 'ATLANTA',
      state: 'GA',
      postal_code: '30301',
    },
    {
      address_purpose: 'LOCATION',
      address_1: '123 Main St',
      city: 'Atlanta',
      state: 'GA',
      postal_code: '303091234',
      telephone_number: '(404) 555-1212',
    },
  ],
  taxonomies: [{ code: '122300000X', desc: 'Dentist', primary: true }],
}

describe('normalizeNppesResult', () => {
  it('extracts the LOCATION address, digits-only phone, and the authorized official', () => {
    const r = normalizeNppesResult(RAW)
    expect(r).toMatchObject({
      npiNumber: '1234567890',
      name: 'SMILE DENTAL PC',
      addressLine1: '123 Main St',
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30309', // zip9 trimmed to zip5
      phone: '4045551212',
      taxonomyCode: '122300000X',
      authorizedOfficialName: 'JANE DOE',
      authorizedOfficialTitle: 'OWNER',
    })
  })

  it('skips non-dental taxonomies, deactivated NPIs, and malformed records', () => {
    expect(
      normalizeNppesResult({ ...RAW, taxonomies: [{ code: '207Q00000X' }] }),
    ).toBeNull() // family medicine sneaking through the fuzzy text filter
    expect(normalizeNppesResult({ ...RAW, basic: { ...RAW.basic, status: 'D' } })).toBeNull()
    expect(normalizeNppesResult({ ...RAW, basic: {} })).toBeNull() // no org name
    expect(normalizeNppesResult(null)).toBeNull()
    expect(normalizeNppesResult('junk')).toBeNull()
  })

  it('accepts dental SPECIALTY codes (any 1223 family), not just general practice', () => {
    const ortho = normalizeNppesResult({
      ...RAW,
      taxonomies: [{ code: '1223X0400X', desc: 'Orthodontics' }],
    })
    expect(ortho?.taxonomyCode).toBe('1223X0400X')
    expect(isDentalTaxonomy('1223S0112X')).toBe(true)
    expect(isDentalTaxonomy('207Q00000X')).toBe(false)
    expect(isDentalTaxonomy(null)).toBe(false)
  })
})

const RAW_NPI1 = {
  number: 1987654320,
  enumeration_type: 'NPI-1',
  basic: {
    first_name: 'JANE',
    last_name: 'ROE',
    credential: 'DDS',
    status: 'A',
  },
  addresses: [
    {
      address_purpose: 'LOCATION',
      address_1: '9 Elm St',
      city: 'austin',
      state: 'TX',
      postal_code: '78701',
      telephone_number: '(512) 555-9000',
    },
  ],
  taxonomies: [{ code: '1223G0001X', desc: 'General Practice', primary: true }],
}

describe('normalizeNppesResult — NPI-1 solo dentists', () => {
  it('names the individual "Dr. First Last, CRED" and makes them their own official', () => {
    const r = normalizeNppesResult(RAW_NPI1)
    expect(r).toMatchObject({
      npiNumber: '1987654320',
      name: 'Dr. Jane Roe, DDS',
      city: 'austin',
      state: 'TX',
      phone: '5125559000',
      taxonomyCode: '1223G0001X',
      authorizedOfficialName: 'Jane Roe',
      authorizedOfficialTitle: 'DDS',
    })
  })

  it('title-cases names and defaults the title to DDS when no credential', () => {
    const r = normalizeNppesResult({
      ...RAW_NPI1,
      basic: { first_name: 'bob', last_name: 'mcKAY', status: 'A' },
    })
    expect(r?.name).toBe('Dr. Bob Mckay')
    expect(r?.authorizedOfficialTitle).toBe('DDS')
  })

  it('skips an individual with no first or last name', () => {
    expect(
      normalizeNppesResult({ ...RAW_NPI1, basic: { credential: 'DDS', status: 'A' } }),
    ).toBeNull()
  })

  it('still requires a dental taxonomy for individuals', () => {
    expect(
      normalizeNppesResult({ ...RAW_NPI1, taxonomies: [{ code: '207Q00000X' }] }),
    ).toBeNull()
  })

  it('treats a missing enumeration_type as an organization (default NPI-2 path)', () => {
    // RAW has no enumeration_type — the org branch must still resolve org name.
    expect(normalizeNppesResult(RAW)?.name).toBe('SMILE DENTAL PC')
  })
})

describe('normalizePhone', () => {
  it('strips formatting and a leading country 1; rejects short numbers', () => {
    expect(normalizePhone('(404) 555-1212')).toBe('4045551212')
    expect(normalizePhone('1-404-555-1212')).toBe('4045551212')
    expect(normalizePhone('555-1212')).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })
})

describe('prospectDedupeHash', () => {
  it('is stable across formatting differences of the same practice', () => {
    const a = prospectDedupeHash('4045551212', '123 Main St', '30309')
    const b = prospectDedupeHash('4045551212', '123 MAIN ST.', '303091234')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs across practices and is null with nothing identifying', () => {
    const a = prospectDedupeHash('4045551212', '123 Main St', '30309')
    const c = prospectDedupeHash('7705551212', '456 Oak Ave', '30309')
    expect(a).not.toBe(c)
    expect(prospectDedupeHash(null, null, '30309')).toBeNull()
  })
})

describe('us-geo maps', () => {
  it('every state has zip3 prefixes and a timezone', () => {
    for (const s of US_STATES) {
      expect(stateZip3Prefixes(s).length, s).toBeGreaterThan(0)
      expect(stateTimeZone(s), s).toMatch(/\//)
    }
  })

  it('prefixes are zero-padded and state-correct', () => {
    expect(stateZip3Prefixes('CT')).toContain('060')
    expect(stateZip3Prefixes('GA')).toContain('303')
    expect(stateZip3Prefixes('GA')).toContain('398')
    expect(stateZip3Prefixes('ZZ')).toEqual([])
  })

  it('timezones map sensibly (unknown → Eastern)', () => {
    expect(stateTimeZone('GA')).toBe('America/New_York')
    expect(stateTimeZone('TX')).toBe('America/Chicago')
    expect(stateTimeZone('CA')).toBe('America/Los_Angeles')
    expect(stateTimeZone(null)).toBe('America/New_York')
  })
})

describe('parseNpiLookup (P-01 — NPI liveness)', () => {
  it('an active NPI with its current practice location', () => {
    const r = parseNpiLookup({ result_count: 1, results: [RAW] })
    expect(r).toEqual({
      found: true,
      status: 'active',
      deactivationDate: null,
      // Fit (P-04): the entity type, the enumeration date and the org name
      // ride the same lookup — the fixture states none of the first two.
      enumerationType: null,
      enumerationDate: null,
      organizationName: 'SMILE DENTAL PC',
      location: { addressLine1: '123 Main St', city: 'Atlanta', state: 'GA', postalCode: '30309', phone: '4045551212' },
    })
  })
  it('carries the entity type and the enumeration date for the fit read (P-04)', () => {
    const r = parseNpiLookup({ results: [{ ...RAW, enumeration_type: 'NPI-2', basic: { ...RAW.basic, enumeration_date: '2025-06-15' } }] })
    expect(r).toMatchObject({ enumerationType: 'NPI-2', enumerationDate: '2025-06-15', organizationName: 'SMILE DENTAL PC' })
    expect(parseNpiLookup({ results: [{ ...RAW, enumeration_type: 'NPI-1' }] }).enumerationType).toBe('NPI-1')
    expect(parseNpiLookup({ results: [{ ...RAW, enumeration_type: 'weird' }] }).enumerationType).toBeNull()
  })
  it('a deactivated NPI carries its deactivation date', () => {
    const r = parseNpiLookup({
      result_count: 1,
      results: [{ ...RAW, basic: { ...RAW.basic, status: 'D', deactivation_date: '2024-03-01' } }],
    })
    expect(r).toMatchObject({ found: true, status: 'deactivated', deactivationDate: '2024-03-01' })
  })
  it('a deactivation date with no later reactivation reads as deactivated even without the status letter', () => {
    const r = parseNpiLookup({ results: [{ ...RAW, basic: { organization_name: 'X', deactivation_date: '2023-01-01' } }] })
    expect(r.status).toBe('deactivated')
    const back = parseNpiLookup({
      results: [{ ...RAW, basic: { organization_name: 'X', deactivation_date: '2023-01-01', reactivation_date: '2023-06-01' } }],
    })
    expect(back.status).toBe('active')
  })
  it('an empty or junk body is "not found", never a throw', () => {
    expect(parseNpiLookup({ result_count: 0, results: [] })).toEqual({
      found: false,
      status: null,
      deactivationDate: null,
      enumerationType: null,
      enumerationDate: null,
      organizationName: null,
      location: null,
    })
    expect(parseNpiLookup(null).found).toBe(false)
    expect(parseNpiLookup('nope').found).toBe(false)
  })
})
