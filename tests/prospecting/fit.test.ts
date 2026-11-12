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

import { DSO_DOMAIN_CLASS, DSO_ENTRIES, DSO_NAMES } from '@/lib/dso-names'
import {
  ADDRESS_WORDS,
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
  addressKey,
  earlyRefreshDue,
  earlyRefreshReason,
  fitVerdict,
  formatMonthYear,
  hostMatchesDomains,
  isDomainClassDso,
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
  signalOlderThan,
  territoryPullDue,
  websiteHost,
} from '@/lib/prospect-fit'
import { latestReviewTime, normalizePlace, statesOpeningHours } from '@/lib/google-places'
import { countDentistsAt, sizeAddressKey } from '@/lib/nppes'
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

  it('every common-phrase brand carries its own web domains — the fix-pass rule; a distinct brand carries none', () => {
    const domains = (name: string) => DSO_ENTRIES.find((e) => e.name === name)?.domains ?? null
    // Both DSOs that wear the name (V1): 42 North's New England brand at
    // gentledental.com, InterDent's West-coast one at interdent.com / gentle1.com.
    expect(domains('Gentle Dental')).toEqual(['gentledental.com', 'interdent.com', 'gentle1.com'])
    expect(domains('Perfect Teeth')).toEqual(['perfectteeth.com'])
    expect(domains('Dentistry for Children')).toEqual(['dentistryforchildrenus.com'])
    expect(domains('Sage Dental')).toEqual(['mysagedental.com'])
    expect(domains('Midwest Dental')).toEqual(['midwest-dental.com'])
    expect(domains('Monarch Dental')).toEqual(['monarchdental.com'])
    expect(domains('Familia Dental')).toEqual(['familiadental.com'])
    expect(domains('Lone Peak')).toEqual(['lonepeakdentalgroup.com'])
    expect(domains('Smile Doctors')).toEqual(['smiledoctors.com'])
    expect(domains('Castle Dental')).toEqual(['castledental.com'])
    expect(DSO_DOMAIN_CLASS).toEqual([
      'Sage Dental', 'Familia Dental', 'Gentle Dental', 'Castle Dental', 'Midwest Dental', 'Lone Peak',
      'Dentistry for Children', 'Perfect Teeth', 'Monarch Dental', 'Smile Doctors',
    ])
    for (const n of ['Aspen Dental', 'Heartland Dental', 'Pacific Dental Services', 'Smile Brands', 'DECA']) {
      expect(domains(n), n).toBeNull()
      expect(isDomainClassDso(n), n).toBe(false)
    }
    expect(isDomainClassDso('Gentle Dental')).toBe(true)
    expect(isDomainClassDso(null)).toBe(false)
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
    // A common-phrase brand on the listing is a chain ONLY with the brand's own host.
    expect(matchDso({ practice: 'Dr. Jane Roe, DDS', npi: 'JANE ROE DDS PC', listing: 'Gentle Dental of Decatur', hosts: ['gentledental.interdent.com'] })).toEqual({ name: 'Gentle Dental', matchedOn: 'listing' })
    expect(matchDso({ practice: 'Dr. Jane Roe, DDS', npi: 'JANE ROE DDS PC', listing: 'Gentle Dental of Decatur' })).toBeNull()
    expect(matchDso({ practice: 'Dr. Jane Roe, DDS', npi: 'JANE ROE DDS PC', listing: 'Gentle Dental of Decatur', hosts: ['decaturdental.com', null] })).toBeNull()
    expect(matchDso({ practice: 'Smile Dental', npi: null, listing: null })).toBeNull()
  })

  it('a common phrase needs the brand’s own domain — a name hit alone is NOT a match, not even a weaker one', () => {
    // Independents that carry the words.
    expect(matchDsoName('Gentle Dental Care of Smithville', ['smithvilledental.com'])).toBeNull()
    expect(matchDsoName('Gentle Dental Care of Smithville')).toBeNull()
    expect(matchDsoName('Pediatric Dentistry for Children')).toBeNull()
    expect(matchDsoName('Pediatric Dentistry for Children', ['childrensdent.com'])).toBeNull()
    expect(matchDsoName('Perfect Teeth Family Dentistry')).toBeNull()
    expect(matchDsoName('Mi Familia Dental')).toBeNull()
    expect(matchDsoName('Mi Familia Dental', ['mifamiliadental.com'])).toBeNull()
    expect(matchDsoName('Sage Dental Care')).toBeNull()
    expect(matchDsoName('Midwest Dental Center')).toBeNull()
    expect(matchDsoName('Monarch Dental Group')).toBeNull()
    expect(matchDsoName('Lone Peak Family Dentistry')).toBeNull()
    expect(matchDsoName('Smile Doctors Orthodontics')).toBeNull()
    expect(matchDsoName('Castle Dental Associates', ['castledentalassociates.com'])).toBeNull()
    // The brands themselves: the host equals or sits under a brand domain.
    expect(matchDsoName('Gentle Dental of Decatur', ['gentledental.interdent.com'])).toBe('Gentle Dental')
    expect(matchDsoName('Gentle Dental of Decatur', ['www.gentle1.com'])).toBe('Gentle Dental')
    // V1: 42 North Dental's New England brand — a listing at gentledental.com
    // (NPI org "GENTLE DENTAL OF NEW ENGLAND") is a DSO office, set aside.
    expect(matchDso({ practice: 'Gentle Dental Attleboro', npi: 'GENTLE DENTAL OF NEW ENGLAND', listing: 'Gentle Dental Attleboro', hosts: ['www.gentledental.com'] })).toEqual({ name: 'Gentle Dental', matchedOn: 'practice' })
    expect(matchDsoName('Gentle Dental Attleboro', ['gentledental.com'])).toBe('Gentle Dental')
    expect(matchDsoName('Perfect Teeth Family Dentistry', ['perfectteeth.com'])).toBe('Perfect Teeth')
    expect(matchDsoName('Dentistry for Children of Lodi', ['dentistryforchildrenus.com'])).toBe('Dentistry for Children')
    expect(matchDsoName('Sage Dental of Kennesaw', ['mysagedental.com'])).toBe('Sage Dental')
    expect(matchDsoName('Midwest Dental Center', ['www.midwest-dental.com'])).toBe('Midwest Dental')
    expect(matchDsoName('Monarch Dental Group', ['monarchdental.com'])).toBe('Monarch Dental')
    expect(matchDsoName('Familia Dental Addison', ['familiadental.com'])).toBe('Familia Dental')
    expect(matchDsoName('Lone Peak Dental Group', ['lonepeakdentalgroup.com'])).toBe('Lone Peak')
    expect(matchDsoName('Smile Doctors Orthodontics', ['smiledoctors.com'])).toBe('Smile Doctors')
    expect(matchDsoName('Castle Dental Buda', ['castledental.com'])).toBe('Castle Dental')
    // A distinct brand never needed a host.
    expect(matchDsoName('Aspen Dental of Austin', ['austinsmiles.com'])).toBe('Aspen Dental')
    // The host rule itself: equal or under, never a look-alike.
    expect(hostMatchesDomains('castledental.com', ['castledental.com'])).toBe(true)
    expect(hostMatchesDomains('book.castledental.com', ['castledental.com'])).toBe(true)
    expect(hostMatchesDomains('notcastledental.com', ['castledental.com'])).toBe(false)
    expect(hostMatchesDomains(null, ['castledental.com'])).toBe(false)
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
  it('a lifted flag returns to where it was, else to enriched; a live OR RESTING row is set aside (a resting one returns to resting)', () => {
    expect(chainRestoreStatus('contacted')).toBe('contacted')
    expect(chainRestoreStatus('call_list')).toBe('call_list')
    expect(chainRestoreStatus('dormant')).toBe('dormant')
    expect(chainRestoreStatus('disqualified')).toBe('enriched')
    expect(chainRestoreStatus(null)).toBe('enriched')
    expect(chainFlaggable('enriched')).toBe(true)
    expect(chainFlaggable('discovered')).toBe(true)
    expect(chainFlaggable('dormant')).toBe(true)
    for (const s of ['converted', 'merged', 'suppressed', 'not_interested', 'disqualified', null]) expect(chainFlaggable(s), String(s)).toBe(false)
  })
  it('a cleared chain signal (the sweep restored the row) is not a chain', () => {
    const at = NOW.toISOString()
    expect(fitVerdict({ chain: { status: 'cleared', detail: null, checkedAt: at, source: 'our_data', kind: 'shared_phone', count: 3, clearedAt: at } })).toEqual({ chain: false })
  })
})

describe('the address key — one spelling per address (E.2)', () => {
  it('the same office spelled two ways is ONE key; two streets are two; the word table drives it', () => {
    const pairs: Array<[[string, string], [string, string], boolean]> = [
      [['123 MAIN ST STE 200', '787011234'], ['123 Main Street Suite 200', '78701'], true],
      [['100 MAIN ST', '787011234'], ['100 Main Street', '78701'], true],
      [['100 MAIN ST STE 200', '78701'], ['100 MAIN ST', '78701'], true],
      [['55 N Peachtree Avenue, Unit #4', '30309'], ['55 North Peachtree Ave.', '30309-1234'], true],
      [['9 Oak Blvd Fl 2', '30309'], ['9 Oak Boulevard Floor 2', '30309'], true],
      [['12 Lake Road Bldg B', '30309'], ['12 Lake Rd', '30309'], true],
      [['100 Main St', '78701'], ['200 Main St', '78701'], false],
      [['100 Main St', '78701'], ['100 Main St', '78702'], false],
      [['100 United Way Dr', '78701'], ['100 United Way Dr', '78701'], true],
    ]
    for (const [a, b, same] of pairs) {
      const ka = addressKey(a[0], a[1])
      const kb = addressKey(b[0], b[1])
      expect(ka === kb, `${a.join(' / ')} vs ${b.join(' / ')}`).toBe(same)
      expect(ka).toMatch(/^[a-z0-9]+$/)
    }
    expect(addressKey('123 MAIN ST STE 200', '787011234')).toBe('123mainst78701')
    expect(addressKey('100 United Way Dr', '78701')).toBe('100unitedwaydr78701') // "United" is not a unit token
    // V8: no street is NO key — a phone-only stub with a ZIP is not an address.
    expect(addressKey(null, null)).toBeNull()
    expect(addressKey('', '78701')).toBeNull()
    expect(addressKey('  ', '78701')).toBeNull()
    expect(addressKey('STE 200', '78701')).toBeNull() // a suite line alone is no street either
    expect(addressKey('#', '78701')).toBeNull()
    expect(ADDRESS_WORDS.map(([w]) => w)).toEqual([
      'street', 'avenue', 'road', 'drive', 'boulevard', 'lane', 'court', 'parkway', 'highway', 'place', 'circle', 'north', 'south', 'east', 'west',
      'suite', 'floor', 'building', 'apartment', 'room',
    ])
  })
  it('with the suite KEPT (the size count), the suite tells two practices apart', () => {
    expect(addressKey('100 Medical Plaza Dr STE 101', null, { keepSuite: true })).not.toBe(addressKey('100 Medical Plaza Dr STE 102', null, { keepSuite: true }))
    expect(addressKey('100 Medical Plaza Drive Suite 101', null, { keepSuite: true })).toBe(addressKey('100 MEDICAL PLAZA DR STE 101', null, { keepSuite: true }))
  })
  it('V4: a KEPT suite folds every unit-like token to one spelling, so the suite VALUE compares — #300, STE 300, Suite 300, Unit 300, Apt 300 are one; STE 300 and STE 301 are two', () => {
    const keep = (line: string) => addressKey(line, null, { keepSuite: true })
    const one = keep('100 Medical Plaza Dr STE 300')
    expect(one).toBe('100medicalplazadrste300')
    for (const spelling of ['#300', '# 300', 'STE 300', 'Ste. 300', 'STE #300', 'Suite 300', 'Unit 300', 'Apt 300', 'Apartment 300', 'Rm 300', 'Room 300']) {
      expect(keep(`100 Medical Plaza Dr ${spelling}`), spelling).toBe(one)
    }
    expect(keep('100 Medical Plaza Dr STE 301')).not.toBe(one)
    expect(keep('100 Medical Plaza Dr #301')).not.toBe(one)
    // A floor or a building is its own kind of line: kept, never folded into a suite.
    expect(keep('100 Medical Plaza Dr FL 3')).toBe('100medicalplazadrfl3')
    expect(keep('100 Medical Plaza Dr Floor 3')).toBe('100medicalplazadrfl3')
    expect(keep('100 Medical Plaza Dr FL 3')).not.toBe(keep('100 Medical Plaza Dr STE 3'))
    // The dropped-suite key (the chain rule) is untouched by the fold.
    expect(addressKey('100 Medical Plaza Dr #300', '78701')).toBe('100medicalplazadr78701')
    expect(addressKey('100 Medical Plaza Dr Unit 300', '78701')).toBe('100medicalplazadr78701')
  })
  it('V8: two real offices + a phone-only hand-added stub on one desk line are NOT a chain — the stub has no address key, so it never counts as a third address', () => {
    const rows = [
      { addressLine1: '123 Main St', postalCode: '78701' },
      { addressLine1: null, postalCode: '78701' }, // the hand-added stub: phone + ZIP, no street
      { addressLine1: '200 Oak Ave', postalCode: '78701' },
    ]
    const keys = rows.map((r) => addressKey(r.addressLine1, r.postalCode))
    expect(keys).toEqual(['123mainst78701', null, '200oakave78701'])
    // What count(distinct …) counts: the non-null keys.
    const addresses = new Set(keys.filter((k): k is string => k != null)).size
    expect(addresses).toBe(2)
    expect(chainGroupVerdict({ kind: 'shared_phone', key: '4045551212', addresses })).toBe(false)
    // A third REAL office makes it one.
    const third = addressKey('300 Pine Rd', '78701')
    expect(new Set([...keys, third].filter((k): k is string => k != null)).size).toBe(3)
    expect(chainGroupVerdict({ kind: 'shared_phone', key: '4045551212', addresses: 3 })).toBe(true)
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
  it('the reason tells the truth about the mix — never "closed practices" for a disconnected count (C27)', () => {
    expect(earlyRefreshReason({ closed: 3, disconnected: 0 })).toBe('3 closed practices this month')
    expect(earlyRefreshReason({ closed: 1, disconnected: 0 })).toBe('1 closed practice this month')
    expect(earlyRefreshReason({ closed: 0, disconnected: 3 })).toBe('3 disconnected numbers this month')
    expect(earlyRefreshReason({ closed: 0, disconnected: 1 })).toBe('1 disconnected number this month')
    expect(earlyRefreshReason({ closed: 2, disconnected: 1 })).toBe('2 closed, 1 disconnected this month')
  })
  it('ONE pull per new closed call (D): tick 1 pulls, the refresh stamps the sweep, tick 2 pulls nothing on the same calls, a 4th closed call later pulls once more; a disabled state never', () => {
    const t0 = new Date('2026-11-01T10:00:00Z') // the newest of three closed calls
    const firstSweep = new Date('2026-10-01T00:00:00Z')
    // Tick 1: the calls are newer than the last sweep → due.
    expect(territoryPullDue({ sweptAt: firstSweep, refreshPulledAt: null, newestClosedCall: t0 }, true)).toBe(true)
    // …pulled, not yet refreshed → never pulled twice.
    const tick1 = new Date('2026-11-01T12:00:00Z')
    expect(territoryPullDue({ sweptAt: firstSweep, refreshPulledAt: tick1, newestClosedCall: t0 }, true)).toBe(false)
    // The refresh ran and stamped the sweep; the pull cleared. Tick 2, the same three calls: nothing.
    expect(territoryPullDue({ sweptAt: tick1, refreshPulledAt: null, newestClosedCall: t0 }, true)).toBe(false)
    // A 4th closed call later → pulled once more.
    const t4 = new Date('2026-11-05T09:00:00Z')
    expect(territoryPullDue({ sweptAt: tick1, refreshPulledAt: null, newestClosedCall: t4 }, true)).toBe(true)
    // A disabled state (C13), or no call at all: never.
    expect(territoryPullDue({ sweptAt: tick1, refreshPulledAt: null, newestClosedCall: t4 }, false)).toBe(false)
    expect(territoryPullDue({ sweptAt: tick1, refreshPulledAt: null, newestClosedCall: null }, true)).toBe(false)
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
      results: [dentist(1, '123 Main St'), dentist(2, '123 MAIN STREET'), dentist(3, '500 Other Rd'), { ...dentist(4, '123 Main St'), taxonomies: [{ code: '207Q00000X' }] }],
    }
    expect(countDentistsAt(body, '123 Main St')).toEqual({ dentists: 2, scanned: 4, capped: false })
    expect(countDentistsAt(body, null)).toEqual({ dentists: 0, scanned: 4, capped: false })
    expect(countDentistsAt(null, '123 Main St')).toEqual({ dentists: 0, scanned: 0, capped: false })
  })
  it('keys on street + SUITE (address_1 + address_2): six solo dentists in suites 101–106 of one building are each solo (H.2)', () => {
    const suite = (n: number, line2: string) => {
      const d = dentist(n, '100 Medical Plaza Dr')
      return { ...d, addresses: [{ ...d.addresses[0], address_2: line2 }] }
    }
    const body = { result_count: 6, results: [101, 102, 103, 104, 105, 106].map((n) => suite(n, `STE ${n}`)) }
    for (const n of [101, 102, 103, 104, 105, 106]) {
      expect(countDentistsAt(body, '100 Medical Plaza Dr', `Suite ${n}`).dentists, String(n)).toBe(1)
    }
    // An org at the same street with no suite of its own matches nobody's suite; a real group in one suite counts in full.
    expect(countDentistsAt(body, '100 Medical Plaza Dr').dentists).toBe(0)
    const group = { result_count: 6, results: [1, 2, 3, 4, 5].map((n) => suite(n, 'STE 300')).concat([suite(9, 'STE 301')]) }
    expect(countDentistsAt(group, '100 Medical Plaza Drive', 'Ste 300').dentists).toBe(5)
  })
  it('V4: eight dentists in one suite, four registered "STE 300" and four "#300", count as eight — a group; "STE 301" next door still does not', () => {
    const suite = (n: number, line2: string) => {
      const d = dentist(n, '100 Medical Plaza Dr')
      return { ...d, addresses: [{ ...d.addresses[0], address_2: line2 }] }
    }
    const body = {
      result_count: 9,
      results: [1, 2, 3, 4].map((n) => suite(n, 'STE 300')).concat([5, 6, 7, 8].map((n) => suite(n, '#300'))).concat([suite(9, 'STE 301')]),
    }
    const org = countDentistsAt(body, '100 Medical Plaza Dr', 'STE 300')
    expect(org).toEqual({ dentists: 8, scanned: 9, capped: false })
    expect(practiceSize(org.dentists)).toBe('group')
    // The org's own spelling does not matter either.
    expect(countDentistsAt(body, '100 Medical Plaza Drive', 'Suite 300').dentists).toBe(8)
    expect(countDentistsAt(body, '100 Medical Plaza Dr', '#300').dentists).toBe(8)
    expect(countDentistsAt(body, '100 Medical Plaza Dr', 'Unit 300').dentists).toBe(8)
    expect(countDentistsAt(body, '100 Medical Plaza Dr', 'STE 301').dentists).toBe(1)
    // The exported key agrees, and a record with no street has none.
    expect(sizeAddressKey('100 Medical Plaza Dr', '#300')).toBe(sizeAddressKey('100 Medical Plaza Drive', 'Suite 300'))
    expect(sizeAddressKey(null, 'STE 300')).toBeNull()
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
