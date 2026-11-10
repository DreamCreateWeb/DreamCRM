/**
 * Places match verification — pure (P-01).
 *
 * Google's searchText happily returns a similar-sounding practice three
 * states away, or the live dentist who took over a retired one's suite.
 * Enrichment used to take `places[0]` blind and copy its rating, website
 * and OPERATIONAL status onto the prospect — which is how a retired
 * practice came to wear a live business's data on the call list.
 *
 * This scores a candidate listing against what NPPES told us about the
 * prospect — name tokens, street number + ZIP, phone digits — and only a
 * REAL match is accepted. A miss is recorded as `places: no_match` and
 * nothing of the candidate is copied.
 */

import { nanpDigits } from './phone-nanp'

export interface MatchProspect {
  name: string
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  phone: string | null
}

export interface MatchCandidate {
  displayName: string | null
  formattedAddress: string | null
  nationalPhoneNumber: string | null
}

export interface PlaceMatch {
  matched: boolean
  score: number
  /** Plain, short, for the verification detail ("phone and street match"). */
  reasons: string[]
  /** The candidate's phone digits when they DIFFER from the prospect's (a
   *  matched listing's number replaces the registry's). */
  phoneDiffers: string | null
}

/** Threshold a candidate must reach to be taken as the prospect's listing. */
export const MATCH_THRESHOLD = 50

const NAME_STOPWORDS = new Set([
  'dental', 'dentistry', 'dentist', 'dentists', 'dds', 'dmd', 'pc', 'pa', 'llc', 'inc', 'pllc',
  'llp', 'ltd', 'co', 'the', 'of', 'and', 'for', 'at', 'in', 'a', 'an', 'dr', 'doctor', 'family',
  'group', 'associates', 'center', 'centre', 'care', 'clinic', 'office', 'offices', 'practice',
  'general', 'cosmetic', 'orthodontics', 'orthodontic', 'pediatric', 'oral', 'surgery', 'smile',
  'smiles', 'health', 'md', 'ms', 'professional', 'corporation', 'corp',
])

export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return []
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t))
}

/** Only the legal suffixes and articles — for a name made entirely of the
 *  common words ("Smile Dental PC"), where the common words ARE the name. */
const LEGAL_SUFFIXES = new Set(['pc', 'pa', 'llc', 'inc', 'pllc', 'llp', 'ltd', 'co', 'corp', 'corporation', 'the', 'of', 'and', 'a', 'an', 'dr', 'doctor'])

function looseTokens(name: string | null | undefined): string[] {
  if (!name) return []
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !LEGAL_SUFFIXES.has(t))
}

/** Share of the prospect's significant tokens that appear in the listing.
 *  A name with no distinctive token at all falls back to its plain words,
 *  so "Smile Dental PC" can still meet "Smile Dental" — and still not
 *  "Bright Orthodontics". */
export function nameOverlap(prospectName: string, candidateName: string | null): number {
  let mine = nameTokens(prospectName)
  let theirsList = nameTokens(candidateName)
  if (mine.length === 0) {
    mine = looseTokens(prospectName)
    theirsList = looseTokens(candidateName)
    if (mine.length === 0) return 0
  }
  const theirs = new Set(theirsList)
  const hit = mine.filter((t) => theirs.has(t)).length
  return hit / mine.length
}

export function streetNumber(addressLine1: string | null | undefined): string | null {
  const m = (addressLine1 ?? '').trim().match(/^(\d+[a-z]?)\b/i)
  return m ? m[1].toLowerCase() : null
}

export function zip5(postalCode: string | null | undefined): string | null {
  const m = (postalCode ?? '').match(/\d{5}/)
  return m ? m[0] : null
}

export function scorePlaceMatch(prospect: MatchProspect, candidate: MatchCandidate): PlaceMatch {
  let score = 0
  const reasons: string[] = []

  const myPhone = nanpDigits(prospect.phone)
  const theirPhone = nanpDigits(candidate.nationalPhoneNumber)
  const phoneMatch = myPhone.length === 10 && myPhone === theirPhone
  if (phoneMatch) {
    score += 50
    reasons.push('phone matches')
  }

  const addr = (candidate.formattedAddress ?? '').toLowerCase()
  const myStreet = streetNumber(prospect.addressLine1)
  const myZip = zip5(prospect.postalCode)
  const streetHit = Boolean(myStreet) && new RegExp(`(^|[\\s,])${myStreet}\\b`).test(addr)
  const zipHit = Boolean(myZip) && addr.includes(myZip as string)
  const cityHit = Boolean(prospect.city) && addr.includes((prospect.city as string).toLowerCase())
  if (streetHit && zipHit) {
    score += 40
    reasons.push('street number and ZIP match')
  } else if (streetHit) {
    score += 20
    reasons.push('street number matches')
  } else if (zipHit) {
    score += 10
    reasons.push('ZIP matches')
  }
  // The city alone is weak evidence — enough to tip a strong name with a
  // ZIP over the line, never enough to make a same-building stranger match.
  if (cityHit) score += 5

  const overlap = nameOverlap(prospect.name, candidate.displayName)
  if (overlap >= 0.6) {
    score += 35
    reasons.push('name matches')
  } else if (overlap >= 0.34) {
    score += 20
    reasons.push('name partly matches')
  } else if (overlap > 0) {
    score += 10
  }

  const matched = score >= MATCH_THRESHOLD
  return {
    matched,
    score,
    reasons,
    phoneDiffers: matched && theirPhone.length === 10 && theirPhone !== myPhone ? theirPhone : null,
  }
}

/** The best-scoring candidate that clears the threshold, or null. */
export function pickMatchingPlace<T extends MatchCandidate>(
  prospect: MatchProspect,
  candidates: T[],
): { place: T; match: PlaceMatch } | null {
  let best: { place: T; match: PlaceMatch } | null = null
  for (const place of candidates) {
    const match = scorePlaceMatch(prospect, place)
    if (!match.matched) continue
    if (!best || match.score > best.match.score) best = { place, match }
  }
  return best
}
