import { describe, it, expect } from 'vitest'

/**
 * FIT AND FRESHNESS — the pure rules (P-04). The DSO list and its
 * whole-word match, the official's title, the practice size, the new
 * practice clock, the chain group verdict (and the generic hosts it
 * ignores), the one read that honours the owner's override, the callers'
 * early-refresh predicate, the listing's liveness fields, the registry's
 * dentists-at-address count, and the verification parser carrying every
 * new key.
 */

import { DSO_NAMES } from '@/lib/dso-names'
import {
  CHAIN_SHARED_THRESHOLD,
  EARLY_REFRESH_CLOSED_THRESHOLD,
  EARLY_REFRESH_WINDOW_DAYS,
  GROUP_PRACTICE_DENTISTS,
  NEW_PRACTICE_MONTHS,
  SIZE_RECHECK_DAYS,
  chainFlaggable,
  chainGroupVerdict,
  chainRestoreStatus,
  chainSentence,
  earlyRefreshDue,
  earlyRefreshReason,
  fitVerdict,
  formatMonthYear,
  isGenericWebsiteHost,
  isNewPractice,
  matchDso,
  matchDsoName,
  monthsBetween,
  newPracticeSentence,
  normalizePracticeName,
  officialTitleKind,
  parseNppesDate,
  practiceSize,
  practiceSizeSentence,
  pulledBackStamp,
  signalOlderThan,
  websiteHost,
} from '@/lib/prospect-fit'
import { latestReviewTime, normalizePlace, statesOpeningHours } from '@/lib/google-places'
import { countDentistsAt } from '@/lib/nppes'
import { parseVerification } from '@/lib/types/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

describe('the DSO list', () => {
  it('holds every name the owner listed (Kool Smiles / Benevis as two)', () => {
    for (const n of [
      'Aspen Dental', 'Heartland Dental', 'Pacific Dental Services', 'Smile Brands', 'Western Dental',
      'Affordable Dentures & Implants', 'Great Expressions', 'Dental Care Alliance', 'MB2 Dental', 'Sage Dental',
      'Familia Dental', 'Kool Smiles', 'Benevis', 'Gentle Dental', 'Bright Now!', 'Castle Dental', 'Midwest Dental',
      'InterDent', 'Lone Peak', 'Riccobene', 'Marquee Dental', 'Dentistry for Children', 'Perfect Teeth',
      'Monarch Dental', 'Dental One Partners', 'North American Dental Group', 'Specialized Dental Partners',
      'ClearChoice', '42 North', 'Imagen', 'Elite Dental Partners', 'Community Dental Partners', 'DECA',
      'Smile Doctors', 'Rodeo Dental',
    ]) {
      expect(DSO_NAMES, n).toContain(n)
    }
    expect(new Set(DSO_NAMES).size).toBe(DSO_NAMES.length)
  })

  it('normalizes punctuation, case and the ampersand', () => {
    expect(normalizePracticeName('Affordable Dentures & Implants - Macon, P.C.')).toBe('affordable dentures and implants macon p c')
    expect(normalizePracticeName('  Bright Now!  ')).toBe('bright now')
    expect(normalizePracticeName(null)).toBe('')
  })

  it('matches as a whole-word sequence on any of the three names — never inside another word', () => {
    expect(matchDsoName('Aspen Dental — Atlanta')).toBe('Aspen Dental')
    expect(matchDsoName('ASPEN DENTAL ASSOCIATES OF GEORGIA PC')).toBe('Aspen Dental')
    expect(matchDsoName('Affordable Dentures and Implants of Macon')).toBe('Affordable Dentures & Implants')
    expect(matchDsoName('Bright Now Dental')).toBe('Bright Now!')
    expect(matchDsoName('DECA Dental Group')).toBe('DECA')
    expect(matchDsoName('42 North Dental')).toBe('42 North')
    // Short names never catch a longer word.
    expect(matchDsoName('Imagenation Dental')).toBeNull()
    expect(matchDsoName('Decatur Family Dentistry')).toBeNull()
    expect(matchDsoName('Smile Dental PC')).toBeNull()
    expect(matchDsoName(null)).toBeNull()
    expect(matchDsoName('')).toBeNull()
  })

  it('matchDso reads the practice name, then the NPI organization, then the listing', () => {
    expect(matchDso({ practice: 'Smile Dental', npi: 'HEARTLAND DENTAL LLC', listing: 'Smile Dental' })).toEqual({ name: 'Heartland Dental', matchedOn: 'npi' })
    expect(matchDso({ practice: 'Aspen Dental', npi: 'HEARTLAND DENTAL LLC' })).toEqual({ name: 'Aspen Dental', matchedOn: 'practice' })
    expect(matchDso({ practice: 'Dr. Jane Roe, DDS', npi: 'JANE ROE DDS PC', listing: 'Gentle Dental of Decatur' })).toEqual({ name: 'Gentle Dental', matchedOn: 'listing' })
    expect(matchDso({ practice: 'Smile Dental', npi: null, listing: null })).toBeNull()
  })
})

describe('the official’s title and the practice size', () => {
  it('owner / dentist / DDS / DMD → clinician; CEO / VP / director / manager → executive', () => {
    for (const t of ['OWNER', 'Owner/Dentist', 'DDS', 'D.M.D.', 'Dr.', 'Doctor', 'Orthodontist']) expect(officialTitleKind(t), t).toBe('clinician')
    for (const t of ['CEO', 'Chief Executive Officer', 'Vice President', 'VP Operations', 'Regional Director', 'Office Manager', 'Administrator']) {
      expect(officialTitleKind(t), t).toBe('executive')
    }
    expect(officialTitleKind('Partner')).toBe('unknown')
    expect(officialTitleKind(null)).toBe('unknown')
    expect(officialTitleKind('')).toBe('unknown')
  })

  it('≥5 dentists at the address is a group; 2–4 small; 1 solo; none counted is unknown', () => {
    expect(GROUP_PRACTICE_DENTISTS).toBe(5)
    expect(practiceSize(null)).toBe('unknown')
    expect(practiceSize(0)).toBe('unknown')
    expect(practiceSize(1)).toBe('solo')
    expect(practiceSize(2)).toBe('small')
    expect(practiceSize(4)).toBe('small')
    expect(practiceSize(5)).toBe('group')
    expect(practiceSize(12)).toBe('group')
  })

  it('the size sentence names the count and an executive official', () => {
    expect(practiceSizeSentence('group', 6, 'executive')).toBe('A group practice — 6 dentists at this address in the registry — the registry official is an executive, not a dentist')
    expect(practiceSizeSentence('solo', 1, 'clinician')).toBe('One dentist at this address in the registry')
    expect(practiceSizeSentence('unknown', null, 'unknown')).toMatch(/No individual dentists listed/)
  })
})

describe('the new-practice clock', () => {
  it('reads both NPPES date spellings', () => {
    expect(parseNppesDate('2025-06-15')?.toISOString()).toBe('2025-06-15T00:00:00.000Z')
    expect(parseNppesDate('06/15/2025')?.toISOString()).toBe('2025-06-15T00:00:00.000Z')
    expect(parseNppesDate('junk')).toBeNull()
    expect(parseNppesDate(null)).toBeNull()
  })
  it('whole months, floored', () => {
    expect(monthsBetween(new Date('2025-06-15T00:00:00Z'), NOW)).toBe(16)
    expect(monthsBetween(new Date('2025-05-10T00:00:00Z'), NOW)).toBe(18)
    expect(monthsBetween(NOW, NOW)).toBe(0)
    expect(monthsBetween(new Date('2027-01-01T00:00:00Z'), NOW)).toBe(0)
  })
  it('enumerated inside 18 months is new; exactly 18 is not; a future date is the registry’s clock', () => {
    expect(NEW_PRACTICE_MONTHS).toBe(18)
    expect(isNewPractice('2025-06-15', NOW)).toBe(true)
    expect(isNewPractice('2025-05-10', NOW)).toBe(false)
    expect(isNewPractice('2024-01-01', NOW)).toBe(false)
    expect(isNewPractice('2027-01-01', NOW)).toBe(true)
    expect(isNewPractice(null, NOW)).toBe(false)
  })
  it('"Opened Jun 2025 — no website yet is normal; now is the moment"', () => {
    expect(formatMonthYear('2025-06-15')).toBe('Jun 2025')
    expect(formatMonthYear('2025-06-15T10:00:00.000Z')).toBe('Jun 2025')
    expect(formatMonthYear('junk')).toBeNull()
    expect(newPracticeSentence('2025-06-15')).toBe('Opened Jun 2025 — no website yet is normal; now is the moment')
    expect(newPracticeSentence(null)).toBe('Opened recently — no website yet is normal; now is the moment')
  })
})

describe('chains from our own data', () => {
  it('the website host, without www', () => {
    expect(websiteHost('https://www.smile.com/about')).toBe('smile.com')
    expect(websiteHost('smile.com')).toBe('smile.com')
    expect(websiteHost('http://Dr-Jane.COM/')).toBe('dr-jane.com')
    expect(websiteHost('not a url')).toBeNull()
    expect(websiteHost(null)).toBeNull()
  })
  it('a Facebook page, a Google site, a builder subdomain or a directory is never a chain', () => {
    expect(isGenericWebsiteHost('facebook.com')).toBe(true)
    expect(isGenericWebsiteHost('www.facebook.com')).toBe(true)
    expect(isGenericWebsiteHost('smile.wixsite.com')).toBe(true)
    expect(isGenericWebsiteHost('smile-dental.business.site')).toBe(true)
    expect(isGenericWebsiteHost('smiledental.com')).toBe(false)
    expect(isGenericWebsiteHost(null)).toBe(true)
  })
  it('≥3 distinct addresses on one key; a shared host only when it is the practice’s own; a phone only as ten digits', () => {
    expect(CHAIN_SHARED_THRESHOLD).toBe(3)
    expect(chainGroupVerdict({ kind: 'shared_host', key: 'aspen.com', addresses: 3 })).toBe(true)
    expect(chainGroupVerdict({ kind: 'shared_host', key: 'aspen.com', addresses: 2 })).toBe(false)
    expect(chainGroupVerdict({ kind: 'shared_host', key: 'facebook.com', addresses: 40 })).toBe(false)
    expect(chainGroupVerdict({ kind: 'shared_phone', key: '4045551212', addresses: 3 })).toBe(true)
    expect(chainGroupVerdict({ kind: 'shared_phone', key: '', addresses: 9 })).toBe(false)
  })
  it('the plain sentence', () => {
    expect(chainSentence({ dso: 'Aspen Dental' })).toBe("Part of Aspen Dental — a chain; we'll target chains later")
    expect(chainSentence({ chain: { kind: 'shared_host', count: 4 } })).toBe("Shares its website with 3 other practices at different addresses — a chain; we'll target chains later")
    expect(chainSentence({ chain: { kind: 'shared_phone', count: 2 } })).toBe("Shares its phone number with 1 other practice at different addresses — a chain; we'll target chains later")
    expect(chainSentence({})).toBe("A chain; we'll target chains later")
  })
  it('fitVerdict: a DSO hit or a shared-key group is a chain — unless the owner said "Not a chain"', () => {
    const at = NOW.toISOString()
    expect(fitVerdict(undefined)).toEqual({ chain: false })
    expect(fitVerdict({ dso: { status: 'none', detail: null, checkedAt: at, source: 'dso_list' } })).toEqual({ chain: false })
    expect(fitVerdict({ dso: { status: 'match', detail: 'Part of Aspen Dental — a chain; we\'ll target chains later', checkedAt: at, source: 'dso_list', name: 'Aspen Dental' } })).toEqual({
      chain: true,
      via: 'dso',
      reason: "Part of Aspen Dental — a chain; we'll target chains later",
    })
    expect(fitVerdict({ chain: { status: 'shared_host', detail: null, checkedAt: at, source: 'our_data', count: 3 } })).toMatchObject({ chain: true, via: 'chain' })
    expect(
      fitVerdict({
        dso: { status: 'match', detail: null, checkedAt: at, source: 'dso_list', name: 'Aspen Dental' },
        chainOverride: { status: 'not_a_chain', detail: null, checkedAt: at, source: 'owner' },
      }),
    ).toEqual({ chain: false })
  })
  it('a lifted flag returns to where it was, else to enriched; only a live row is ever disqualified', () => {
    expect(chainRestoreStatus('contacted')).toBe('contacted')
    expect(chainRestoreStatus('call_list')).toBe('call_list')
    expect(chainRestoreStatus('disqualified')).toBe('enriched')
    expect(chainRestoreStatus(null)).toBe('enriched')
    expect(chainFlaggable('enriched')).toBe(true)
    expect(chainFlaggable('discovered')).toBe(true)
    for (const s of ['converted', 'merged', 'suppressed', 'not_interested', 'disqualified', 'dormant', null]) expect(chainFlaggable(s), String(s)).toBe(false)
  })
})

describe('callers steer freshness', () => {
  it('≥3 closed / disconnected practices inside 30 days', () => {
    expect(EARLY_REFRESH_CLOSED_THRESHOLD).toBe(3)
    expect(EARLY_REFRESH_WINDOW_DAYS).toBe(30)
    expect(earlyRefreshDue(2)).toBe(false)
    expect(earlyRefreshDue(3)).toBe(true)
    expect(earlyRefreshDue(Number.NaN)).toBe(false)
  })
  it('the reason and the stamp that makes the territory due now', () => {
    expect(earlyRefreshReason(3)).toBe('3 closed practices this month')
    expect(earlyRefreshReason(1)).toBe('1 closed practice this month')
    expect(pulledBackStamp(NOW, 30)).toEqual(new Date(NOW.getTime() - 31 * DAY))
  })
  it('a stored signal’s age', () => {
    expect(SIZE_RECHECK_DAYS).toBe(180)
    expect(signalOlderThan(null, NOW, 180)).toBe(true)
    expect(signalOlderThan(new Date(NOW.getTime() - 10 * DAY).toISOString(), NOW, 180)).toBe(false)
    expect(signalOlderThan(new Date(NOW.getTime() - 200 * DAY).toISOString(), NOW, 180)).toBe(true)
    expect(signalOlderThan('junk', NOW, 180)).toBe(true)
  })
})

describe('liveness from the listing (Places)', () => {
  it('the newest review time, tolerant of junk', () => {
    expect(latestReviewTime([{ publishTime: '2025-01-05T10:00:00Z' }, { publishTime: '2026-03-01T08:00:00Z' }, { publishTime: 'junk' }, null])).toBe('2026-03-01T08:00:00.000Z')
    expect(latestReviewTime([])).toBeNull()
    expect(latestReviewTime('nope')).toBeNull()
  })
  it('opening hours are stated by periods or weekday lines', () => {
    expect(statesOpeningHours({ periods: [{ open: {} }] })).toBe(true)
    expect(statesOpeningHours({ weekdayDescriptions: ['Monday: 8–5'] })).toBe(true)
    expect(statesOpeningHours({})).toBe(false)
    expect(statesOpeningHours(undefined)).toBe(false)
  })
  it('normalizePlace carries both', () => {
    const p = normalizePlace({ id: 'x', displayName: { text: 'Smile' }, reviews: [{ publishTime: '2026-03-01T08:00:00Z' }], regularOpeningHours: { periods: [{}] } })
    expect(p).toMatchObject({ latestReviewAt: '2026-03-01T08:00:00.000Z', hasOpeningHours: true })
    expect(normalizePlace({ id: 'y' })).toMatchObject({ latestReviewAt: null, hasOpeningHours: false })
  })
})

describe('dentists at an address (the registry)', () => {
  const dentist = (n: number, address_1: string, purpose = 'LOCATION') => ({
    number: String(1000000000 + n),
    enumeration_type: 'NPI-1',
    basic: { first_name: 'JANE', last_name: `ROE${n}`, status: 'A', credential: 'DDS' },
    addresses: [{ address_purpose: purpose, address_1, city: 'Atlanta', state: 'GA', postal_code: '30309' }],
    taxonomies: [{ code: '122300000X', desc: 'Dentist' }],
  })
  it('counts the NPI-1 dentists whose LOCATION street matches, ignoring formatting', () => {
    const body = {
      result_count: 4,
      results: [dentist(1, '123 Main St'), dentist(2, '123 MAIN ST.'), dentist(3, '500 Other Rd'), { ...dentist(4, '123 Main St'), taxonomies: [{ code: '207Q00000X' }] }],
    }
    expect(countDentistsAt(body, '123 Main St')).toEqual({ dentists: 2, scanned: 4, capped: false })
    expect(countDentistsAt(body, null)).toEqual({ dentists: 0, scanned: 4, capped: false })
    expect(countDentistsAt(null, '123 Main St')).toEqual({ dentists: 0, scanned: 0, capped: false })
  })
  it('a full page is capped — more may exist past it', () => {
    expect(countDentistsAt({ result_count: 200, results: [] }, '123 Main St').capped).toBe(true)
  })
})

describe('parseVerification carries the P-04 keys', () => {
  const at = NOW.toISOString()
  it('the phone’s sources, standing and line check; the reviews’ date and hours; every fit signal', () => {
    const v = parseVerification({
      phone: { status: 'well_formed', detail: null, checkedAt: at, source: 'nanp', sources: ['nppes', 'places', 'bogus'], standing: 'corroborated', lineCheck: 'off' },
      reviews: { status: 'stale', detail: null, checkedAt: at, source: 'places', latestAt: '2024-01-01T00:00:00.000Z', hours: false },
      fit: {
        dso: { status: 'match', detail: 'x', checkedAt: at, source: 'dso_list', name: 'Aspen Dental', matchedOn: 'listing', priorStatus: 'enriched' },
        chain: { status: 'shared_phone', detail: null, checkedAt: at, source: 'our_data', kind: 'shared_phone', count: 3, key: '4045551212' },
        size: { status: 'group', detail: null, checkedAt: at, source: 'nppes', dentists: 6, official: 'executive' },
        newPractice: { status: 'new', detail: null, checkedAt: at, source: 'nppes', enumeratedAt: '2025-06-15' },
        chainOverride: { status: 'not_a_chain', detail: null, checkedAt: at, source: 'owner' },
        junk: { status: 'x' },
      },
    })
    expect(v.phone).toMatchObject({ sources: ['nppes', 'places'], standing: 'corroborated', lineCheck: 'off' })
    expect(v.reviews).toMatchObject({ status: 'stale', latestAt: '2024-01-01T00:00:00.000Z', hours: false })
    expect(v.fit?.dso).toMatchObject({ name: 'Aspen Dental', matchedOn: 'listing', priorStatus: 'enriched' })
    expect(v.fit?.chain).toMatchObject({ kind: 'shared_phone', count: 3, key: '4045551212' })
    expect(v.fit?.size).toMatchObject({ dentists: 6, official: 'executive' })
    expect(v.fit?.newPractice).toMatchObject({ enumeratedAt: '2025-06-15' })
    expect(v.fit?.chainOverride?.status).toBe('not_a_chain')
    expect(v.fit).not.toHaveProperty('junk')
  })
  it('junk is dropped, legacy rows read as before', () => {
    expect(parseVerification({ fit: { dso: { status: 'match' } } }).fit).toBeUndefined()
    expect(parseVerification({ phone: { status: 'well_formed', checkedAt: at, source: 'nanp' } }).phone).toEqual({ status: 'well_formed', detail: null, checkedAt: at, source: 'nanp' })
    expect(parseVerification({ phone: { status: 'well_formed', checkedAt: at, source: 'nanp', standing: 'odd' } }).phone).not.toHaveProperty('standing')
  })
})
