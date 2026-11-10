import { describe, it, expect } from 'vitest'

/**
 * THE DUPLICATE MATCHER (P-03) — pure. Three keys (phone · Google place id
 * · normalized name + ZIP), the matrix the brief names, the chain that
 * makes one group of three, the sweep's EXACT bar, and the survivor rule.
 */

import {
  dedupeKeys,
  exactDuplicatePairs,
  findDuplicateGroups,
  isExactDuplicate,
  normalizePracticeName,
  practiceNameKey,
  pickSurvivor,
  sharedKeys,
  duplicateReasons,
  type DedupeRow,
} from '@/lib/prospect-dedupe'

function row(over: Partial<DedupeRow> & { id: string }): DedupeRow {
  return {
    name: 'Smile Dental PC',
    phone: '4045551212',
    googlePlaceId: null,
    postalCode: '30309',
    qualityScore: null,
    verifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

describe('normalizePracticeName', () => {
  it('drops legal suffixes, credentials and punctuation — "Smile Dental, P.C." is "Smile Dental PC"', () => {
    expect(normalizePracticeName('Smile Dental, P.C.')).toBe('smile dental')
    expect(normalizePracticeName('Smile Dental PC')).toBe('smile dental')
    expect(normalizePracticeName('Dr. Jane Roe, DDS')).toBe('jane roe')
    expect(normalizePracticeName('The Roe Family Dentistry LLC')).toBe('roe family dentistry')
  })
  it('keeps the words that tell two practices apart', () => {
    expect(normalizePracticeName('Bright Orthodontics')).not.toBe(normalizePracticeName('Bright Dental'))
  })
})

describe('practiceNameKey — the name the matcher compares (fix pass)', () => {
  it('needs two meaningful tokens: one generic word is no name', () => {
    expect(practiceNameKey('Smile Dental, P.C.')).toBe('smile dental')
    expect(practiceNameKey('J & J Dental')).toBeNull() // → "dental"
    expect(practiceNameKey('The Dental Co., LLC')).toBeNull() // → "dental"
    expect(practiceNameKey('Dr. Roe, DDS')).toBeNull() // → "roe"
    expect(practiceNameKey('')).toBeNull()
    expect(practiceNameKey(null)).toBeNull()
  })
  it('two practices sharing a building’s desk phone, each one generic word, are NOT an exact pair — and never a name+ZIP pair', () => {
    const a = row({ id: 'a', name: 'J & J Dental', phone: '4045551212' })
    const b = row({ id: 'b', name: 'The Dental Co., LLC', phone: '4045551212' })
    expect(isExactDuplicate(a, b)).toBe(false)
    expect(sharedKeys(a, b)).toEqual(['phone']) // a question for a human, not a match on the name
    expect(dedupeKeys(a).nameZip).toBeNull()
  })
})

describe('dedupeKeys', () => {
  it('a phone key is ten bare digits (a +1 and formatting fall away); a name key needs a ZIP', () => {
    expect(dedupeKeys(row({ id: 'a', phone: '+1 (404) 555-1212' })).phone).toBe('4045551212')
    expect(dedupeKeys(row({ id: 'a', phone: '555-1212' })).phone).toBeNull()
    expect(dedupeKeys(row({ id: 'a', postalCode: '30309-1234' })).nameZip).toBe('smile dental|30309')
    expect(dedupeKeys(row({ id: 'a', postalCode: null })).nameZip).toBeNull()
  })
})

describe('findDuplicateGroups — the matrix', () => {
  it('same phone, different names → one group (a human confirms)', () => {
    const groups = findDuplicateGroups([
      row({ id: 'a', name: 'Smile Dental' }),
      row({ id: 'b', name: 'Jane Roe DDS', postalCode: '30310' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].members.map((m) => m.id)).toEqual(['a', 'b'])
    expect(groups[0].keys).toEqual(['phone'])
  })

  it('same name, different ZIP, different phone → NOT a duplicate (two offices)', () => {
    const groups = findDuplicateGroups([
      row({ id: 'a', phone: '4045551212', postalCode: '30309' }),
      row({ id: 'b', phone: '4045559999', postalCode: '30092' }),
    ])
    expect(groups).toEqual([])
  })

  it('same name at the same ZIP, different phones → one group', () => {
    const groups = findDuplicateGroups([
      row({ id: 'a', name: 'Smile Dental, P.C.', phone: '4045551212' }),
      row({ id: 'b', name: 'Smile Dental PC', phone: '4045559999' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].keys).toEqual(['name_zip'])
  })

  it('a chain — A~B by phone, B~C by place id — is ONE group of three', () => {
    const groups = findDuplicateGroups([
      row({ id: 'a', name: 'A Dental', phone: '4045551212', postalCode: '30001' }),
      row({ id: 'b', name: 'B Dental', phone: '4045551212', googlePlaceId: 'place_1', postalCode: '30002' }),
      row({ id: 'c', name: 'C Dental', phone: '4045550000', googlePlaceId: 'place_1', postalCode: '30003' }),
      row({ id: 'd', name: 'D Dental', phone: '4045557777', postalCode: '30004' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].members.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(groups[0].keys).toEqual(['phone', 'place'])
  })

  it('a row with no key at all is nobody’s duplicate', () => {
    expect(findDuplicateGroups([row({ id: 'a', phone: null, postalCode: null }), row({ id: 'b', phone: null, postalCode: null })])).toEqual([])
  })
})

describe('the sweep’s bar — isExactDuplicate', () => {
  it('same Google listing → exact', () => {
    expect(isExactDuplicate(row({ id: 'a', name: 'X', phone: null, googlePlaceId: 'p' }), row({ id: 'b', name: 'Y', phone: null, googlePlaceId: 'p' }))).toBe(true)
  })
  it('same phone AND same normalized name → exact; same phone, different name → not', () => {
    expect(isExactDuplicate(row({ id: 'a', name: 'Smile Dental, P.C.' }), row({ id: 'b', name: 'Smile Dental PC', postalCode: '30092' }))).toBe(true)
    expect(isExactDuplicate(row({ id: 'a', name: 'Smile Dental' }), row({ id: 'b', name: 'Jane Roe DDS' }))).toBe(false)
  })
  it('same name + ZIP alone is a candidate for a human, never exact', () => {
    expect(isExactDuplicate(row({ id: 'a', phone: '4045551212' }), row({ id: 'b', phone: '4045559999' }))).toBe(false)
  })
  it('exactDuplicatePairs lists only the pairs the sweep may take on its own', () => {
    const pairs = exactDuplicatePairs([
      row({ id: 'a', name: 'Smile Dental' }),
      row({ id: 'b', name: 'Smile Dental, P.C.' }), // exact with a (phone + name)
      row({ id: 'c', name: 'Jane Roe DDS' }), // same phone, other name — not exact
    ])
    expect(pairs.map(([x, y]) => [x.id, y.id])).toEqual([['a', 'b']])
  })
})

describe('pickSurvivor — the rule', () => {
  it('best quality score wins; a never-verified null loses to any number', () => {
    const s = pickSurvivor([
      row({ id: 'a', qualityScore: null }),
      row({ id: 'b', qualityScore: 40 }),
      row({ id: 'c', qualityScore: 85 }),
    ])
    expect(s.id).toBe('c')
  })
  it('then the most recent verification', () => {
    const s = pickSurvivor([
      row({ id: 'a', qualityScore: 80, verifiedAt: new Date('2026-09-01T00:00:00Z') }),
      row({ id: 'b', qualityScore: 80, verifiedAt: new Date('2026-11-01T00:00:00Z') }),
    ])
    expect(s.id).toBe('b')
  })
  it('then the OLDEST record — it carries the history', () => {
    const s = pickSurvivor([
      row({ id: 'new', createdAt: new Date('2026-10-01T00:00:00Z') }),
      row({ id: 'old', createdAt: new Date('2025-01-01T00:00:00Z') }),
    ])
    expect(s.id).toBe('old')
  })
  it('is deterministic on a full tie', () => {
    expect(pickSurvivor([row({ id: 'b' }), row({ id: 'a' })]).id).toBe('a')
  })
})

describe('duplicateReasons', () => {
  it('says why in plain words', () => {
    expect(duplicateReasons(row({ id: 'a', googlePlaceId: 'p' }), row({ id: 'b', googlePlaceId: 'p' }))).toEqual([
      'same phone',
      'same Google listing',
      'same name and ZIP',
    ])
  })
})
