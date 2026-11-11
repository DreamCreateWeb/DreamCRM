/**
 * THE QUALITY SCORE — pure (P-01, rebalanced P-04).
 *
 * 0–100: can we actually reach this practice? Built from the stored
 * verification signals, so it can be recomputed from the row anywhere (the
 * enrich pass, the re-verify sweep, a logged call outcome).
 *
 *   hard zero  disqualified · phone invalid/disconnected/wrong number ·
 *              NPI retired · business closed
 *   parked     Google says temporarily closed · website dead or parked
 *              (until re-verified)
 *   otherwise  a weighted sum:
 *     Google listing matched + operational   35
 *     phone — the two-source rule (P-04):
 *       carrier says in service, line known  25
 *       the registry and the listing agree
 *         (corroborated, line not checked)   20
 *       one source only, not carrier-checked 12  (well-formed, as before —
 *                                                 the card says to turn the
 *                                                 line check on)
 *     NPI active                             15
 *     website alive, or honestly none        10
 *     Google reviews — recency-aware (P-04):
 *       latest review ≤ 6 months             10
 *       latest review ≤ 18 months             6
 *       older, or none                        0
 *       (no dates returned: 5+ reviews = 10, the P-01 rule)
 *     a human reached them on a call          5
 *
 *   no sign of life (P-04): no review in 18 months AND no opening hours on
 *   the listing → "Google shows no sign of life since <date>", band at most
 *   WEAK whatever the sum.
 *
 * Bands: best ≥ 80 · good ≥ 60 · weak ≥ 40 · parked otherwise. The
 * OPPORTUNITY score (how much they need us) is a different number and is
 * never blended in — the queues sort by opportunity WITHIN the floor. No
 * first-dial bucket (owner ruling 2026-11-11): what matters is that the
 * number is ACTIVE and IS THAT CLINIC'S number.
 */

import type { ProspectQualityBand, ProspectPhoneStatus, ProspectPhoneLineType } from '@/lib/db/schema/prospecting'
import type { ProspectVerification } from '@/lib/types/prospecting'
import { formatMonthYear } from '@/lib/prospect-fit'

export interface QualityInput {
  status: string
  verification: ProspectVerification
  phoneStatus: ProspectPhoneStatus | string | null
  phoneLineType: ProspectPhoneLineType | string | null
  businessStatus: string | null
  reviewCount: number | null
  websiteUrl: string | null
  /** The live parked clock (config.hygiene.parkedRecheckDays); the stored
   *  sentence names it. REQUIRED: every writer that rescores a row builds
   *  its input through {@link qualityInput} from the resolved config, so
   *  the sentence and the sweep's clock can never disagree (P-03). */
  parkedRecheckDays: number
}

/** The stored signals a writer rescores from — everything but the clocks. */
export type QualitySignals = Omit<QualityInput, 'parkedRecheckDays'>

/**
 * THE ONE BUILDER of a QualityInput: the row's stored signals plus the live
 * clocks from the resolved config (`config.hygiene`, or a verify run's
 * context, which carries the same number). The verify pass, a logged call
 * outcome, a hand-typed number and the drawer's actions all score through
 * this, never `computeQualityScore` with a bare literal.
 */
export function qualityInput(signals: QualitySignals, clocks: { parkedRecheckDays: number }): QualityInput {
  return { ...signals, parkedRecheckDays: clocks.parkedRecheckDays }
}

export interface QualityResult {
  score: number
  band: ProspectQualityBand
  reasons: string[]
}

export const QUALITY_WEIGHTS = {
  placesMatched: 35,
  phoneValid: 25,
  /** The registry and the matched listing agree on the number (P-04). */
  phoneCorroborated: 20,
  phoneWellFormed: 12,
  npiActive: 15,
  website: 10,
  reviews: 10,
  /** The latest review is 6–18 months old (P-04). */
  reviewsQuiet: 6,
  reach: 5,
} as const

/** The highest score a listing with no sign of life can carry (band weak). */
export const NO_LIFE_CEILING = 59

/** The sentence the single-source rule puts on the card when the line check is off. */
export const SINGLE_SOURCE_TURN_ON = 'Only one source lists this number — turn on the line check to confirm it'

export function qualityBandForScore(score: number): ProspectQualityBand {
  if (score >= 80) return 'best'
  if (score >= 60) return 'good'
  if (score >= 40) return 'weak'
  return 'parked'
}

function phoneWord(lineType: string | null): string {
  switch (lineType) {
    case 'landline':
      return 'landline'
    case 'mobile':
      return 'mobile'
    case 'voip':
      return 'VoIP'
    default:
      return 'line type unknown'
  }
}

export function computeQualityScore(input: QualityInput): QualityResult {
  const v = input.verification
  const reasons: string[] = []

  // ── Hard zeros: a record that is not a practice we can reach ──────────
  if (input.status === 'disqualified') {
    return { score: 0, band: 'parked', reasons: ['Disqualified'] }
  }
  if (input.phoneStatus === 'disconnected' || input.phoneStatus === 'wrong_number') {
    return {
      score: 0,
      band: 'parked',
      reasons: [v.phone?.detail ?? (input.phoneStatus === 'disconnected' ? 'Number disconnected' : 'Wrong number')],
    }
  }
  if (input.phoneStatus === 'invalid') {
    return { score: 0, band: 'parked', reasons: [v.phone?.detail ?? 'Phone number is not a real US number'] }
  }
  if (v.npi?.status === 'retired') {
    return { score: 0, band: 'parked', reasons: [v.npi.detail ?? 'NPI is deactivated — the practice has retired'] }
  }
  if (input.businessStatus === 'CLOSED_PERMANENTLY' || v.business?.status === 'closed') {
    return { score: 0, band: 'parked', reasons: ['Google lists it as permanently closed'] }
  }

  // ── Parked: wait, then look again ─────────────────────────────────────
  if (input.businessStatus === 'CLOSED_TEMPORARILY' || v.business?.status === 'temporarily_closed') {
    return {
      score: 0,
      band: 'parked',
      reasons: [`Google lists it as temporarily closed — checking again in ${input.parkedRecheckDays} days`],
    }
  }
  if (v.website?.status === 'dead') {
    return { score: 0, band: 'parked', reasons: [v.website.detail ?? 'Website is down — a retired-practice signal'] }
  }
  if (v.website?.status === 'parked') {
    return { score: 0, band: 'parked', reasons: [v.website.detail ?? 'Website is a parking page — a retired-practice signal'] }
  }

  // ── The weighted sum ──────────────────────────────────────────────────
  let score = 0

  if (v.places?.status === 'matched' && (input.businessStatus == null || input.businessStatus === 'OPERATIONAL')) {
    score += QUALITY_WEIGHTS.placesMatched
    reasons.push('Google listing matched and open')
  } else if (v.places?.status === 'no_match') {
    reasons.push('No Google listing matched this practice')
  } else if (v.places?.status === 'not_found') {
    reasons.push('Google has no listing for this practice')
  } else {
    reasons.push('Google listing not checked yet')
  }

  if (input.phoneStatus === 'valid') {
    if (input.phoneLineType) {
      score += QUALITY_WEIGHTS.phoneValid
      reasons.push(`Phone validated: ${phoneWord(input.phoneLineType)}`)
    } else {
      score += QUALITY_WEIGHTS.phoneWellFormed
      reasons.push('Phone validated, line type unknown')
    }
  } else if (v.phone?.status === 'well_formed') {
    // The two-source rule (P-04): agreement earns more than one voice.
    if (v.phone.standing === 'corroborated') {
      score += QUALITY_WEIGHTS.phoneCorroborated
      reasons.push('Registry and Google agree on this number — line not checked')
    } else if (v.phone.standing === 'single_source') {
      score += QUALITY_WEIGHTS.phoneWellFormed
      reasons.push(v.phone.lineCheck === 'off' ? SINGLE_SOURCE_TURN_ON : 'Only one source lists this number — line not checked')
    } else {
      score += QUALITY_WEIGHTS.phoneWellFormed
      reasons.push('Phone is well-formed — line not checked')
    }
  } else if (v.phone?.status === 'missing') {
    reasons.push('No phone number on record')
  } else {
    reasons.push('Phone not checked yet')
  }

  if (v.npi?.status === 'active') {
    score += QUALITY_WEIGHTS.npiActive
    reasons.push('NPI active')
  } else if (v.npi?.status === 'not_found') {
    reasons.push('NPI not found in the registry')
  } else if (v.npi?.status === 'none') {
    reasons.push('No NPI on record (added by hand)')
  }

  if (v.website?.status === 'alive') {
    score += QUALITY_WEIGHTS.website
    reasons.push('Website is up')
  } else if (v.website?.status === 'none') {
    score += QUALITY_WEIGHTS.website
    reasons.push('No website — the opportunity')
  } else if (v.website?.status === 'redirected') {
    // Lands somewhere else — recorded, not guessed; no credit either way.
    reasons.push(v.website.detail ?? 'Website redirects elsewhere')
  } else if (input.websiteUrl) {
    reasons.push('Website not checked yet')
  }

  // Reviews — recency-aware when the listing gave us dates (P-04), the
  // P-01 count rule when it did not. A listing with no review in 18 months
  // and no opening hours shows no sign of life: band at most weak.
  let noLife: string | null = null
  const rv = v.reviews
  if (v.places?.status === 'matched' && rv && rv.status !== 'unknown') {
    const when = formatMonthYear(rv.latestAt)
    if (rv.status === 'recent') {
      score += QUALITY_WEIGHTS.reviews
      reasons.push(`Google reviews are current — latest ${when ?? 'recently'}`)
    } else if (rv.status === 'quiet') {
      score += QUALITY_WEIGHTS.reviewsQuiet
      reasons.push(`Last Google review ${when ?? 'over 6 months ago'}`)
    } else if (rv.status === 'stale') {
      if (rv.hours === false) noLife = `Google shows no sign of life since ${when ?? 'the last review'}`
      else reasons.push(`No Google review since ${when ?? 'over 18 months ago'}`)
    } else if (rv.status === 'none') {
      if (rv.hours === false) noLife = 'Google shows no sign of life — no reviews and no hours on the listing'
      else reasons.push('No Google reviews')
    }
  } else if (input.reviewCount != null && v.places?.status === 'matched') {
    if (input.reviewCount >= 5) {
      score += QUALITY_WEIGHTS.reviews
      reasons.push(`${input.reviewCount} Google reviews`)
    } else if (input.reviewCount === 0) {
      reasons.push('No Google reviews')
    } else {
      reasons.push(`Only ${input.reviewCount} Google review${input.reviewCount === 1 ? '' : 's'}`)
    }
  }

  if (v.reach?.status === 'reached') {
    score += QUALITY_WEIGHTS.reach
    reasons.push(v.reach.detail ?? 'Someone picked up on a call')
  }

  score = Math.max(0, Math.min(100, score))
  if (noLife) {
    score = Math.min(score, NO_LIFE_CEILING)
    reasons.unshift(noLife)
  }
  return { score, band: qualityBandForScore(score), reasons: reasons.slice(0, 8) }
}

/** "Verified" = every core signal checked inside the window. The `reach`
 *  signal is a bonus that only a call produces, so it is not required. */
export function isFullyVerified(
  verification: ProspectVerification,
  now: Date,
  staleDays = 60,
): boolean {
  const cutoff = now.getTime() - staleDays * 24 * 60 * 60 * 1000
  for (const id of ['places', 'business', 'npi', 'website', 'phone'] as const) {
    const sig = verification[id]
    if (!sig) return false
    const t = new Date(sig.checkedAt).getTime()
    if (Number.isNaN(t) || t < cutoff) return false
  }
  return true
}
