import { describe, it, expect } from 'vitest'
import {
  scorePlaceMatch,
  pickMatchingPlace,
  nameOverlap,
  nameTokens,
  streetNumber,
  zip5,
  MATCH_THRESHOLD,
} from '@/lib/prospect-match'

/**
 * Places match verification (P-01) — the bug behind "retired practice rows
 * wearing a live business's data" was `places[0]` taken blind. A candidate
 * is accepted only when the registry record and the listing agree on the
 * phone, the street + ZIP, or the name with a location anchor.
 */

const PROSPECT = {
  name: 'SMILE DENTAL PC',
  addressLine1: '123 Main St',
  city: 'Atlanta',
  state: 'GA',
  postalCode: '30309',
  phone: '4045551212',
}

describe('tokens + anchors', () => {
  it('drops the words every dental practice shares', () => {
    expect(nameTokens('Smile Family Dental PC')).toEqual([])
    expect(nameTokens('Peachtree Smile Dental')).toEqual(['peachtree'])
    expect(nameTokens('Dr. Jane Roe, DDS')).toEqual(['jane', 'roe'])
  })
  it('reads the street number and zip5', () => {
    expect(streetNumber('123 Main St')).toBe('123')
    expect(streetNumber('Suite 4, 123 Main St')).toBeNull()
    expect(zip5('30309-1234')).toBe('30309')
    expect(zip5(null)).toBeNull()
  })
  it('overlap is the share of the prospect’s significant tokens', () => {
    expect(nameOverlap('Peachtree Smile Dental', 'Peachtree Dental Care')).toBe(1)
    expect(nameOverlap('Jane Roe DDS', 'Roe Family Dentistry')).toBe(0.5)
    expect(nameOverlap('Smile Dental', 'Bright Orthodontics')).toBe(0)
  })
  it('a name made only of the common words falls back to its plain words', () => {
    expect(nameOverlap('Smile Dental PC', 'Smile Dental')).toBe(1)
    expect(nameOverlap('Smile Dental PC', 'Bright Orthodontics')).toBe(0)
    expect(nameOverlap('Family Dental Care', 'Family Dental Care of Atlanta')).toBe(1)
  })
})

describe('scorePlaceMatch', () => {
  it('phone agreement alone is a match', () => {
    const m = scorePlaceMatch(PROSPECT, {
      displayName: 'Bright Smiles of Midtown',
      formattedAddress: '999 Other Rd, Atlanta, GA 30305, USA',
      nationalPhoneNumber: '4045551212',
    })
    expect(m.matched).toBe(true)
    expect(m.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD)
    expect(m.reasons).toContain('phone matches')
    expect(m.phoneDiffers).toBeNull()
  })

  it('street + ZIP + city with no name agreement is NOT a match (a different practice in the same suite)', () => {
    const m = scorePlaceMatch(PROSPECT, {
      displayName: 'Bright Orthodontics',
      formattedAddress: '123 Main St, Atlanta, GA 30309, USA',
      nationalPhoneNumber: '4045559999',
    })
    expect(m.matched).toBe(false)
    expect(m.score).toBe(45)
  })

  it('the same common-word name at the same address IS a match', () => {
    const m = scorePlaceMatch(PROSPECT, {
      displayName: 'Smile Dental',
      formattedAddress: '123 Main St, Atlanta, GA 30309, USA',
      nationalPhoneNumber: null,
    })
    expect(m.matched).toBe(true)
    expect(m.reasons).toEqual(['street number and ZIP match', 'name matches'])
  })

  it('street + ZIP + a partial name is a match, and a differing phone is reported', () => {
    const m = scorePlaceMatch(
      { ...PROSPECT, name: 'Dr. Jane Roe, DDS' },
      {
        displayName: 'Roe Family Dentistry',
        formattedAddress: '123 Main St, Atlanta, GA 30309, USA',
        nationalPhoneNumber: '4045559999',
      },
    )
    expect(m.matched).toBe(true)
    expect(m.phoneDiffers).toBe('4045559999')
  })

  it('a strong name three states away is NOT a match', () => {
    const m = scorePlaceMatch(
      { ...PROSPECT, name: 'Peachtree Smile Dental' },
      {
        displayName: 'Peachtree Dental',
        formattedAddress: '77 Peachtree Ave, Tulsa, OK 74103, USA',
        nationalPhoneNumber: null,
      },
    )
    expect(m.matched).toBe(false)
  })

  it('a strong name in the same city and ZIP is a match (the practice moved down the road)', () => {
    const m = scorePlaceMatch(
      { ...PROSPECT, name: 'Peachtree Smile Dental' },
      {
        displayName: 'Peachtree Dental',
        formattedAddress: '500 Other St, Atlanta, GA 30309, USA',
        nationalPhoneNumber: null,
      },
    )
    expect(m.matched).toBe(true)
  })

  it('nothing in common is nothing', () => {
    const m = scorePlaceMatch(PROSPECT, {
      displayName: 'Lakeside Vision',
      formattedAddress: '1 Lake Dr, Macon, GA 31201, USA',
      nationalPhoneNumber: '4785550000',
    })
    expect(m.matched).toBe(false)
    expect(m.score).toBe(0)
  })
})

describe('pickMatchingPlace', () => {
  it('takes the best-scoring candidate that clears the threshold, never the first', () => {
    const picked = pickMatchingPlace(PROSPECT, [
      { id: 'a', displayName: 'Bright Orthodontics', formattedAddress: '123 Main St, Atlanta, GA 30309', nationalPhoneNumber: null },
      { id: 'b', displayName: 'Smile Dental', formattedAddress: '123 Main St, Atlanta, GA 30309', nationalPhoneNumber: '4045551212' },
    ])
    expect(picked?.place.id).toBe('b')
  })
  it('returns null when no candidate is this practice', () => {
    expect(
      pickMatchingPlace(PROSPECT, [
        { displayName: 'Bright Orthodontics', formattedAddress: '9 Elsewhere, Macon, GA 31201', nationalPhoneNumber: null },
      ]),
    ).toBeNull()
  })
})
