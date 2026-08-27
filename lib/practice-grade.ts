import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import { comparableUrl } from '@/lib/gbp-listing'

/**
 * The practice grader's PURE core (docs/marketing-engine.md, slice 2) —
 * turns what the sensors saw (a homepage crawl, a Google Places lookup)
 * into the composite grade a practice owner reads. Client-safe on purpose:
 * the public /g/[token] report renders these shapes directly.
 *
 * Polarity note: this is the MIRROR of lib/prospect-scoring.ts —
 * computeOpportunityScore scores how good a SALES OPPORTUNITY a weak
 * presence is (no website = 92 = hot); this grades the presence ITSELF for
 * its owner. Same inputs, opposite reader.
 *
 * Copy law: findings are anti-shame and concrete (DESIGN.md voice) — they
 * name what a PATIENT experiences, never scold ("Patients searching after
 * hours can't book online", not "No booking widget detected").
 */

export const GRADE_AXES = ['website', 'listing', 'reviews'] as const
export type GradeAxis = (typeof GRADE_AXES)[number]

export const GRADE_AXIS_LABELS: Record<GradeAxis, string> = {
  website: 'Your website',
  listing: 'Your Google listing',
  reviews: 'Your reviews',
}

export interface AxisGrade {
  /** 0–100, or null when the axis genuinely couldn't be checked (the
   *  report says so — an unknown is never scored). */
  score: number | null
  /** What a patient experiences — worst first. Empty = clean bill. */
  findings: string[]
  /** What's already working — the anti-shame half. */
  wins: string[]
}

export interface PracticeGradeResult {
  /** Weighted composite of the AVAILABLE axes, 0–100; null if nothing was
   *  checkable. */
  overall: number | null
  letter: 'A' | 'B' | 'C' | 'D' | 'F' | null
  axes: Record<GradeAxis, AxisGrade>
  /** One-sentence topline in the house voice. */
  headline: string
  computedAt: string
}

/** The subset of a Places result the grader consumes (mirrors PlaceResult
 *  in lib/google-places.ts without importing the server module). */
export interface GraderPlaceFacts {
  placeId: string | null
  displayName: string | null
  formattedAddress: string | null
  websiteUri: string | null
  /** 4.7 stars → 47. */
  ratingTenths: number | null
  reviewCount: number | null
  businessStatus: string | null
  googleMapsUri: string | null
}

/** Name tokens too generic to identify a practice on their own. */
const GENERIC_NAME_TOKENS = new Set([
  'dental', 'dentistry', 'dentist', 'dentists', 'family', 'care', 'clinic',
  'office', 'the', 'of', 'and', 'dr', 'dds', 'dmd', 'pa', 'pc', 'llc',
  'pllc', 'group', 'center', 'centre', 'associates', 'orthodontics',
  'pediatric', 'cosmetic', 'general',
])

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Does this Places result plausibly BELONG to the practice the visitor
 * described? Learned from the first real runs: searchText happily returns
 * a similar-sounding practice three states away, and a grader that adopts
 * a stranger's reviews as "Your reviews" is worse than no grader. Rules,
 * hardest first:
 *  1. A website match (the listing links the site the visitor typed) is
 *     proof — accept.
 *  2. A given STATE must appear in the listing's address; a given CITY
 *     must too. Either missing from the address (or the address being
 *     unreadable while geo was given) = reject.
 *  3. The entered name's salient tokens must overlap the listing's name
 *     (all-generic names fall back to a whole-name containment check).
 *  4. Both sides naming DIFFERENT websites = reject even if the rest
 *     agrees.
 * Pure + exported for tests; the service applies it before trusting a
 * lookup, and rejection grades the Google axes as UNKNOWN, never as the
 * stranger's numbers.
 */
export function placeMatchesPractice(
  input: { practiceName: string; city?: string | null; state?: string | null; enteredUrl?: string | null },
  place: Pick<GraderPlaceFacts, 'displayName' | 'formattedAddress' | 'websiteUri'>,
): boolean {
  // 1. Website agreement is proof of ownership.
  const entered = input.enteredUrl ? comparableUrl(input.enteredUrl) : null
  const listed = place.websiteUri ? comparableUrl(place.websiteUri) : null
  if (entered && listed && (entered === listed || entered.startsWith(listed) || listed.startsWith(entered))) {
    return true
  }

  // 4. Explicit website disagreement is a hard reject.
  if (entered && listed) {
    const enteredHost = entered.split('/')[0]
    const listedHost = listed.split('/')[0]
    if (enteredHost !== listedHost) return false
  }

  // 2. Geography the visitor gave us must hold.
  const address = place.formattedAddress ?? ''
  const state = input.state?.trim().toUpperCase().slice(0, 2)
  if (state) {
    const stateRe = new RegExp(`(^|[\\s,])${state}([\\s,]|$)`)
    if (!stateRe.test(address.toUpperCase())) return false
  }
  const city = input.city?.trim().toLowerCase()
  if (city && !address.toLowerCase().includes(city)) return false

  // 3. The name must actually resemble theirs.
  const display = place.displayName?.toLowerCase() ?? ''
  if (!display) return false
  const salient = nameTokens(input.practiceName).filter((t) => !GENERIC_NAME_TOKENS.has(t))
  if (salient.length === 0) {
    return display.includes(input.practiceName.trim().toLowerCase())
  }
  return salient.some((t) => display.includes(t))
}

export interface GradeInputs {
  /** The URL the visitor typed; null = they say they have no website. */
  enteredUrl: string | null
  /** Homepage crawl signals; null = unreachable or no site. */
  signals: ProspectCrawlSignals | null
  /** Heuristic verdict over the signals (lib/prospect-scoring.ts). */
  verdict: ProspectAiVerdict | null
  /** Places lookup, ALREADY match-verified by the caller
   *  (placeMatchesPractice); null = no confident match. */
  place: GraderPlaceFacts | null
  /** False when GOOGLE_PLACES_API_KEY isn't configured — the listing +
   *  reviews axes then read "couldn't check", never a fake zero. */
  placesChecked: boolean
  /** True when the lookup DID return a candidate but verification rejected
   *  it — the report says so out loud (grading a stranger's listing is the
   *  one sin a grader can't survive; leaving one out silently is the
   *  second). */
  rejectedSimilar?: boolean
  now?: Date
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

export function letterFor(score: number): NonNullable<PracticeGradeResult['letter']> {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 68) return 'C'
  if (score >= 55) return 'D'
  return 'F'
}

function gradeWebsite(input: GradeInputs): AxisGrade {
  const { enteredUrl, signals, verdict } = input
  const findings: string[] = []
  const wins: string[] = []

  if (!enteredUrl && !signals) {
    return {
      score: 8,
      findings: [
        'We couldn’t find a website for your practice. Most patients start with a search — right now they can’t find, read about, or book with you online.',
      ],
      wins: [],
    }
  }
  if (enteredUrl && (!signals || signals.error)) {
    return {
      score: null,
      findings: [
        'We couldn’t reach your website just now, so this part isn’t graded — if the address is right, that itself is worth a look.',
      ],
      wins: [],
    }
  }

  // Signals exist — score from the heuristic verdict, findings from the
  // concrete signals a patient feels.
  let score = clamp(verdict?.websiteQuality ?? 50)
  if (signals) {
    if (!signals.ssl) {
      findings.push('Your site isn’t served over HTTPS — browsers mark it “not secure” before a patient reads a word.')
      score = Math.min(score, 40)
    }
    if (!signals.mobileViewport) {
      findings.push('Your site isn’t set up for phones — and that’s where most patients will open it.')
    } else {
      wins.push('Works on phones.')
    }
    if (!signals.bookingWidget) {
      findings.push('There’s no online booking — patients searching after hours can’t grab a time, so they keep looking.')
    } else {
      wins.push('Patients can book online.')
    }
    if (!signals.titleTag || !signals.metaDescription) {
      findings.push('The page is missing the title/description Google shows in results — your search listing reads thinner than it should.')
    }
    const year = input.now?.getFullYear() ?? new Date().getFullYear()
    if (signals.copyrightYear && signals.copyrightYear < year - 1) {
      findings.push(`The footer still says ${signals.copyrightYear} — small thing, but patients notice a site that looks unattended.`)
    }
    if (signals.pageWeightKb > 4000) {
      findings.push('The homepage is heavy — on a phone connection it keeps patients waiting.')
    }
    if (signals.ssl && findings.length === 0) wins.push('Secure, and the basics are in order.')
    // Honesty law: a report that can't NAME a gap must not imply one. The
    // heuristic verdict is conservative by design (it scores a sales
    // opportunity elsewhere), so a clean-findings page floors at a solid
    // score — "50/100 with three checkmarks" is incoherent to a reader.
    // (Live-run finding, 2026-08-27: the demo clinic's own template graded
    // 50 with zero findings.)
    // ZERO findings only — any named gap (SSL above all) keeps its real
    // weight; the floor exists for the page we couldn't fault, not the one
    // we could.
    if (findings.length === 0) score = Math.max(score, 80)
  }
  return { score, findings, wins }
}

function noConfidentMatchFindings(input: GradeInputs): string[] {
  const findings = [
    'We couldn’t confidently find a Google Business listing for your practice — so this part isn’t graded. If you have one, it may be listed under a different name or address; if you don’t, claiming it is the single biggest fix on this list (when someone searches “dentist near me”, that listing IS the front door).',
  ]
  if (input.rejectedSimilar) {
    findings.push(
      'We did find a similar-sounding practice somewhere else and left it out — grading a stranger’s listing wouldn’t tell you anything about yours.',
    )
  }
  return findings
}

function gradeListing(input: GradeInputs): AxisGrade {
  if (!input.placesChecked) {
    return { score: null, findings: ['We couldn’t check your Google listing right now — this part isn’t graded.'], wins: [] }
  }
  const place = input.place
  if (!place) {
    // UNKNOWN, not a fake low score: a one-result text search can't prove a
    // listing doesn't exist, and the first real runs proved it can't be
    // trusted to have found the right one either.
    return { score: null, findings: noConfidentMatchFindings(input), wins: [] }
  }
  const findings: string[] = []
  const wins: string[] = []
  let score = 75
  // Transparency is the last guard: NAME the listing we matched, so a wrong
  // match is visible to its owner in one glance.
  wins.push(
    place.displayName && place.formattedAddress
      ? `Matched your listing: ${place.displayName} — ${place.formattedAddress}.`
      : 'Your practice shows up on Google.',
  )
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
    findings.push('Google currently shows your practice as closed — patients will take that at face value.')
    score -= 45
  }
  const entered = input.enteredUrl ? comparableUrl(input.enteredUrl) : null
  const listed = place.websiteUri ? comparableUrl(place.websiteUri) : null
  if (!listed) {
    findings.push('Your Google listing has no website link — patients who find you on the map have nowhere to click.')
    score -= 30
  } else if (entered && listed !== entered && !listed.startsWith(entered) && !entered.startsWith(listed)) {
    findings.push('Your Google listing links to a different site than the one you gave us — patients may be landing somewhere you’ve moved on from.')
    score -= 20
  } else {
    wins.push('The listing links to your website.')
    score += 20
  }
  return { score: clamp(score), findings, wins }
}

function gradeReviews(input: GradeInputs): AxisGrade {
  if (!input.placesChecked) {
    return { score: null, findings: ['We couldn’t check your reviews right now — this part isn’t graded.'], wins: [] }
  }
  const place = input.place
  if (!place) {
    return {
      score: null,
      findings: ['Without a confidently-matched Google listing, we can’t grade your reviews — they live on that listing.'],
      wins: [],
    }
  }
  const rating = place.ratingTenths != null ? place.ratingTenths / 10 : null
  const count = place.reviewCount ?? 0
  const findings: string[] = []
  const wins: string[] = []
  if (rating == null || count === 0) {
    return {
      score: 15,
      findings: [
        'Your listing has no reviews yet — and patients choosing between two practices almost always pick the one with the stars.',
      ],
      wins: [],
    }
  }
  // Rating carries most of the weight; volume is the credibility multiplier.
  // Curves anchored so a genuinely excellent practice (4.8★ × 150+) clears
  // an A — a grader that can't hand a clean A to a great practice reads as
  // rigged, and the anti-shame law applies to scores too.
  const ratingScore = clamp(((rating - 3.4) / 1.5) * 70, 0, 70)
  const countScore = clamp((count / 120) * 30, 0, 30)
  const score = clamp(ratingScore + countScore)
  if (rating >= 4.7) wins.push(`A ${rating.toFixed(1)}-star rating — patients trust that.`)
  else if (rating < 4.3) findings.push(`Your rating sits at ${rating.toFixed(1)} — under the 4.5 bar many patients filter by.`)
  if (count < 50) {
    findings.push(`${count} review${count === 1 ? '' : 's'} so far — the practices winning the map pack usually carry 100+. Every happy patient you don’t ask is a review you don’t get.`)
  } else if (count >= 100) {
    wins.push(`${count} reviews — real social proof.`)
  }
  return { score, findings, wins }
}

const AXIS_WEIGHTS: Record<GradeAxis, number> = { website: 0.4, listing: 0.3, reviews: 0.3 }

/** Compute the whole report. Total + deterministic; unknown axes stay null
 *  and the composite re-weights over what WAS checkable. */
export function gradeOnlinePresence(input: GradeInputs): PracticeGradeResult {
  const axes: Record<GradeAxis, AxisGrade> = {
    website: gradeWebsite(input),
    listing: gradeListing(input),
    reviews: gradeReviews(input),
  }
  let weightSum = 0
  let acc = 0
  for (const axis of GRADE_AXES) {
    const s = axes[axis].score
    if (s == null) continue
    weightSum += AXIS_WEIGHTS[axis]
    acc += s * AXIS_WEIGHTS[axis]
  }
  const overall = weightSum > 0 ? clamp(acc / weightSum) : null
  const letter = overall != null ? letterFor(overall) : null
  const headline =
    overall == null
      ? 'We couldn’t check enough to grade this one — try again in a minute.'
      : overall >= 85
        ? 'Your online front door is in good shape — the wins below are worth protecting.'
        : overall >= 68
          ? 'Solid bones, with a few gaps patients feel — each one below is fixable.'
          : 'Patients are hitting real friction before they ever call — the list below is where they’re getting lost.'
  return {
    overall,
    letter,
    axes,
    headline,
    computedAt: (input.now ?? new Date()).toISOString(),
  }
}

/** Validate a stored result jsonb back into a typed report — the row is
 *  written by us but read on a public page, so parse defensively; malformed
 *  → null (the page 404s rather than rendering garbage). */
export function parsePracticeGradeResult(raw: unknown): PracticeGradeResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const axesRaw = r.axes
  if (typeof axesRaw !== 'object' || axesRaw === null) return null
  const axes = {} as Record<GradeAxis, AxisGrade>
  for (const axis of GRADE_AXES) {
    const a = (axesRaw as Record<string, unknown>)[axis]
    if (typeof a !== 'object' || a === null) return null
    const ar = a as Record<string, unknown>
    const score = typeof ar.score === 'number' && Number.isFinite(ar.score) ? clamp(ar.score) : null
    const strs = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 12) : []
    axes[axis] = { score, findings: strs(ar.findings), wins: strs(ar.wins) }
  }
  const overall = typeof r.overall === 'number' && Number.isFinite(r.overall) ? clamp(r.overall) : null
  const letter = overall != null ? letterFor(overall) : null
  const headline = typeof r.headline === 'string' ? r.headline : ''
  const computedAt = typeof r.computedAt === 'string' ? r.computedAt : new Date(0).toISOString()
  return { overall, letter, axes, headline, computedAt }
}
