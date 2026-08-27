import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import type { DeepSiteSignals } from '@/lib/practice-scan'
import { comparableUrl } from '@/lib/gbp-listing'

/**
 * The practice grader's PURE core (docs/marketing-engine.md, slice 2; v2
 * added the Before/After story) — turns what the sensors saw (a homepage
 * crawl + deep scan, a verified Google Places match, an optional search-
 * rank check) into the composite grade a practice owner reads. Client-safe
 * on purpose: the public /g/[token] report renders these shapes directly.
 *
 * Polarity note: this is the MIRROR of lib/prospect-scoring.ts —
 * computeOpportunityScore scores how good a SALES OPPORTUNITY a weak
 * presence is (no website = 92 = hot); this grades the presence ITSELF for
 * its owner. Same inputs, opposite reader.
 *
 * Copy laws:
 *  - Findings are anti-shame and concrete (DESIGN.md voice) — they name
 *    what a PATIENT experiences, never scold.
 *  - v2: every finding may carry an AFTER — what the same check looks like
 *    with DreamCRM running. Afters map to SHIPPED features only; a check
 *    the product can't deterministically pass (a review rating, a search
 *    rank) gets after: null, never a promise.
 *  - Unknown is never scored, and a projection is never invented.
 */

export const GRADE_AXES = ['website', 'listing', 'reviews', 'search'] as const
export type GradeAxis = (typeof GRADE_AXES)[number]

export const GRADE_AXIS_LABELS: Record<GradeAxis, string> = {
  website: 'Your website',
  listing: 'Your Google listing',
  reviews: 'Your reviews',
  search: 'Your search visibility',
}

export interface AxisFinding {
  /** What a patient experiences today. */
  text: string
  /** What the same check reads with DreamCRM running — SHIPPED features
   *  only; null when the product can't deterministically fix it. */
  after: string | null
}

export interface AxisGrade {
  /** 0–100, or null when the axis genuinely couldn't be checked (the
   *  report says so — an unknown is never scored). */
  score: number | null
  /** What a patient experiences — worst first. Empty = clean bill. */
  findings: AxisFinding[]
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

/** The search-rank check's outcome (v2 — driven by the inert SERP driver). */
export interface SearchCheck {
  /** The query we ran, e.g. 'dentist in Ward, AR'. */
  query: string
  /** 1-based organic position of the practice's site; null = not in the
   *  results we saw. */
  position: number | null
}

export interface GradeInputs {
  /** The URL the visitor typed; null = they say they have no website. */
  enteredUrl: string | null
  /** Homepage crawl signals; null = unreachable or no site. */
  signals: ProspectCrawlSignals | null
  /** Heuristic verdict over the signals (lib/prospect-scoring.ts). */
  verdict: ProspectAiVerdict | null
  /** Deep scan signals (v2); null = site not crawled. */
  deep?: DeepSiteSignals | null
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
  /** Search-rank check (v2); null/undefined = not run (driver inert or no
   *  city) — the axis then HIDES rather than nagging "not graded". */
  search?: SearchCheck | null
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

// ── The After registry: shipped features only ────────────────────────────
const AFTER = {
  siteBuilt: 'DreamCRM builds your whole site — live in your first week, online booking included.',
  ssl: 'Your DreamCRM site ships secure (HTTPS) out of the box.',
  mobile: 'Every DreamCRM template is phone-first — it’s designed on a phone screen before a desktop one.',
  booking: 'Your DreamCRM site books patients 24/7 — real open times, straight onto your schedule.',
  meta: 'Search titles and descriptions are written for every page, automatically.',
  fresh: 'Your site stays alive — hours, posts, and content the AI keeps current.',
  fast: 'DreamCRM sites are built lean, so phones on parking-lot signal still load them fast.',
  structured: 'Your site ships dentist structured data, so Google knows exactly who and where you are.',
  phone: 'Your number is tap-to-call on every page.',
  crawl: 'A sitemap and clean crawl rules ship with every site — Google indexes all of it.',
  listing: 'DreamCRM helps you claim your listing, links it to your site, and then WATCHES it — mismatches get caught and fixed.',
  listingLink: 'The listing’s website link is monitored — if it drifts, DreamCRM catches it and proposes the fix.',
  reviews: 'Review asks send themselves after every completed visit — Google-first, automatically.',
  reviewsRating: 'Unhappy patients get caught privately before they post — escalations route to you, not to Google.',
  search: 'A fast, structured, locally-tuned site is how you climb this list — DreamCRM ships all of it, and your listing + reviews feed the map pack.',
} as const

const f = (text: string, after: string | null): AxisFinding => ({ text, after })

function gradeWebsite(input: GradeInputs): AxisGrade {
  const { enteredUrl, signals, verdict, deep } = input
  const findings: AxisFinding[] = []
  const wins: string[] = []

  if (!enteredUrl && !signals) {
    return {
      score: 8,
      findings: [
        f(
          'We couldn’t find a website for your practice. Most patients start with a search — right now they can’t find, read about, or book with you online.',
          AFTER.siteBuilt,
        ),
      ],
      wins: [],
    }
  }
  if (enteredUrl && (!signals || signals.error)) {
    return {
      score: null,
      findings: [
        f(
          'We couldn’t reach your website just now, so this part isn’t graded — if the address is right, that itself is worth a look.',
          null,
        ),
      ],
      wins: [],
    }
  }

  // Signals exist — score from the heuristic verdict, findings from the
  // concrete signals a patient feels.
  let score = clamp(verdict?.websiteQuality ?? 50)
  if (signals) {
    if (!signals.ssl) {
      findings.push(f('Your site isn’t served over HTTPS — browsers mark it “not secure” before a patient reads a word.', AFTER.ssl))
      score = Math.min(score, 40)
    }
    if (!signals.mobileViewport) {
      findings.push(f('Your site isn’t set up for phones — and that’s where most patients will open it.', AFTER.mobile))
    } else {
      wins.push('Works on phones.')
    }
    if (!signals.bookingWidget) {
      findings.push(f('There’s no online booking — patients searching after hours can’t grab a time, so they keep looking.', AFTER.booking))
    } else {
      wins.push('Patients can book online.')
    }
    if (!signals.titleTag || !signals.metaDescription) {
      findings.push(f('The page is missing the title/description Google shows in results — your search listing reads thinner than it should.', AFTER.meta))
    }
    const year = input.now?.getFullYear() ?? new Date().getFullYear()
    if (signals.copyrightYear && signals.copyrightYear < year - 1) {
      findings.push(f(`The footer still says ${signals.copyrightYear} — small thing, but patients notice a site that looks unattended.`, AFTER.fresh))
    }
    if (signals.pageWeightKb > 4000) {
      findings.push(f('The homepage is heavy — on a phone connection it keeps patients waiting.', AFTER.fast))
      score -= 5
    }
    // v2 deep scan — the checks a patient never names but always feels.
    if (deep) {
      if (!deep.phoneVisible) {
        findings.push(f('We couldn’t find a phone number a patient can tap — the fastest patients still book by calling.', AFTER.phone))
        score -= 6
      } else {
        wins.push('Your phone number is right there.')
      }
      if (!deep.jsonLdDentist) {
        findings.push(f('Your site doesn’t tell Google it’s a dental practice (no structured data) — search engines have to guess who you are.', AFTER.structured))
        score -= 5
      } else {
        wins.push('Google can read exactly what your practice is (structured data present).')
      }
      if (!deep.h1 && signals.titleTag) {
        findings.push(f('The page has no main headline — search engines anchor on it, and yours is blank.', AFTER.meta))
        score -= 3
      }
      if (deep.robotsTxt === false || deep.sitemap === false) {
        findings.push(f('Your site is missing a sitemap or crawl rules — Google may not be finding every page.', AFTER.crawl))
        score -= 3
      }
      if (deep.fetchMs != null && deep.fetchMs > 3500) {
        findings.push(f('Your homepage took several seconds to answer — patients on phones give up fast.', AFTER.fast))
        score -= 5
      }
    }
    score = clamp(score)
    if (signals.ssl && findings.length === 0) wins.push('Secure, and the basics are in order.')
    // Honesty law: a report that can't NAME a gap must not imply one. The
    // heuristic verdict is conservative by design (it scores a sales
    // opportunity elsewhere), so a clean-findings page floors at a solid
    // score — "50/100 with three checkmarks" is incoherent to a reader.
    // ZERO findings only — any named gap (SSL above all) keeps its real
    // weight; the floor exists for the page we couldn't fault, not the one
    // we could.
    if (findings.length === 0) score = Math.max(score, 80)
  }
  return { score, findings, wins }
}

function noConfidentMatchFindings(input: GradeInputs): AxisFinding[] {
  const findings = [
    f(
      'We couldn’t confidently find a Google Business listing for your practice — so this part isn’t graded. If you have one, it may be listed under a different name or address; if you don’t, claiming it is the single biggest fix on this list (when someone searches “dentist near me”, that listing IS the front door).',
      AFTER.listing,
    ),
  ]
  if (input.rejectedSimilar) {
    findings.push(
      f(
        'We did find a similar-sounding practice somewhere else and left it out — grading a stranger’s listing wouldn’t tell you anything about yours.',
        null,
      ),
    )
  }
  return findings
}

function gradeListing(input: GradeInputs): AxisGrade {
  if (!input.placesChecked) {
    return { score: null, findings: [f('We couldn’t check your Google listing right now — this part isn’t graded.', null)], wins: [] }
  }
  const place = input.place
  if (!place) {
    // UNKNOWN, not a fake low score: a one-result text search can't prove a
    // listing doesn't exist, and the first real runs proved it can't be
    // trusted to have found the right one either.
    return { score: null, findings: noConfidentMatchFindings(input), wins: [] }
  }
  const findings: AxisFinding[] = []
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
    findings.push(f('Google currently shows your practice as closed — patients will take that at face value.', AFTER.listing))
    score -= 45
  }
  const entered = input.enteredUrl ? comparableUrl(input.enteredUrl) : null
  const listed = place.websiteUri ? comparableUrl(place.websiteUri) : null
  if (!listed) {
    findings.push(f('Your Google listing has no website link — patients who find you on the map have nowhere to click.', AFTER.listingLink))
    score -= 30
  } else if (entered && listed !== entered && !listed.startsWith(entered) && !entered.startsWith(listed)) {
    findings.push(f('Your Google listing links to a different site than the one you gave us — patients may be landing somewhere you’ve moved on from.', AFTER.listingLink))
    score -= 20
  } else {
    wins.push('The listing links to your website.')
    score += 20
  }
  return { score: clamp(score), findings, wins }
}

function gradeReviews(input: GradeInputs): AxisGrade {
  if (!input.placesChecked) {
    return { score: null, findings: [f('We couldn’t check your reviews right now — this part isn’t graded.', null)], wins: [] }
  }
  const place = input.place
  if (!place) {
    return {
      score: null,
      findings: [f('Without a confidently-matched Google listing, we can’t grade your reviews — they live on that listing.', AFTER.reviews)],
      wins: [],
    }
  }
  const rating = place.ratingTenths != null ? place.ratingTenths / 10 : null
  const count = place.reviewCount ?? 0
  const findings: AxisFinding[] = []
  const wins: string[] = []
  if (rating == null || count === 0) {
    return {
      score: 15,
      findings: [
        f('Your listing has no reviews yet — and patients choosing between two practices almost always pick the one with the stars.', AFTER.reviews),
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
  else if (rating < 4.3) findings.push(f(`Your rating sits at ${rating.toFixed(1)} — under the 4.5 bar many patients filter by.`, AFTER.reviewsRating))
  if (count < 50) {
    findings.push(
      f(`${count} review${count === 1 ? '' : 's'} so far — the practices winning the map pack usually carry 100+. Every happy patient you don’t ask is a review you don’t get.`, AFTER.reviews),
    )
  } else if (count >= 100) {
    wins.push(`${count} reviews — real social proof.`)
  }
  return { score, findings, wins }
}

function gradeSearch(input: GradeInputs): AxisGrade {
  const check = input.search
  // Not run (driver inert, no city given) → the axis HIDES entirely; a
  // permanently "not graded" fourth card would be noise, not honesty.
  if (!check) return { score: null, findings: [], wins: [] }
  const q = check.query
  if (check.position == null) {
    return {
      score: 20,
      findings: [
        f(`Your site isn’t on page one when someone searches “${q}” — and that search is where new patients start.`, AFTER.search),
      ],
      wins: [],
    }
  }
  const p = check.position
  if (p <= 3) {
    return { score: clamp(97 - (p - 1) * 4), findings: [], wins: [`You’re #${p} on Google for “${q}” — that’s the spot everyone else is paying for.`] }
  }
  if (p <= 5) {
    return { score: clamp(84 - (p - 4) * 6), findings: [], wins: [`You’re #${p} on Google for “${q}”.`] }
  }
  return {
    score: clamp(70 - (p - 6) * 8, 25, 60),
    findings: [f(`You’re #${p} for “${q}” — on the page, but below where most patients stop scrolling.`, AFTER.search)],
    wins: [],
  }
}

const AXIS_WEIGHTS: Record<GradeAxis, number> = { website: 0.35, listing: 0.25, reviews: 0.2, search: 0.2 }

/** An axis with nothing to say (unchecked search) — the report skips it. */
export function isAxisHidden(a: AxisGrade): boolean {
  return a.score == null && a.findings.length === 0 && a.wins.length === 0
}

/** Compute the whole report. Total + deterministic; unknown axes stay null
 *  and the composite re-weights over what WAS checkable. */
export function gradeOnlinePresence(input: GradeInputs): PracticeGradeResult {
  const axes: Record<GradeAxis, AxisGrade> = {
    website: gradeWebsite(input),
    listing: gradeListing(input),
    reviews: gradeReviews(input),
    search: gradeSearch(input),
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

/**
 * The "with DreamCRM" projection per axis (v2) — HONEST BY CONSTRUCTION:
 * only checks the product deterministically passes are projected. A
 * DreamCRM site ships secure, phone-first, bookable, structured, and
 * crawlable, so the website checks WOULD score ~95; a claimed + linked +
 * watched listing scores ~95. A review RATING and a search RANK cannot be
 * promised — those project null and the report says what happens instead
 * ("asks send themselves", "climbs as the fixes land").
 */
export function projectedWithDreamCrm(result: PracticeGradeResult): Record<GradeAxis, number | null> {
  const listingNow = result.axes.listing.score
  return {
    website: 95,
    listing: listingNow != null && listingNow >= 90 ? listingNow : 95,
    reviews: null,
    search: null,
  }
}

function parseFinding(v: unknown): AxisFinding | null {
  // v1 rows stored bare strings; v2 stores {text, after}.
  if (typeof v === 'string') return v ? { text: v, after: null } : null
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string' && o.text) {
      return { text: o.text, after: typeof o.after === 'string' && o.after ? o.after : null }
    }
  }
  return null
}

/** Validate a stored result jsonb back into a typed report — the row is
 *  written by us but read on a public page, so parse defensively; malformed
 *  → null (the page 404s rather than rendering garbage). v1 rows (3 axes,
 *  string findings) parse cleanly: the search axis defaults to hidden. */
export function parsePracticeGradeResult(raw: unknown): PracticeGradeResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const axesRaw = r.axes
  if (typeof axesRaw !== 'object' || axesRaw === null) return null
  const axes = {} as Record<GradeAxis, AxisGrade>
  for (const axis of GRADE_AXES) {
    const a = (axesRaw as Record<string, unknown>)[axis]
    if (typeof a !== 'object' || a === null) {
      // A v1 row has no 'search' axis — default it to hidden. A MISSING
      // core axis is still malformed.
      if (axis === 'search') {
        axes[axis] = { score: null, findings: [], wins: [] }
        continue
      }
      return null
    }
    const ar = a as Record<string, unknown>
    const score = typeof ar.score === 'number' && Number.isFinite(ar.score) ? clamp(ar.score) : null
    const findings = Array.isArray(ar.findings)
      ? ar.findings.map(parseFinding).filter((x): x is AxisFinding => x !== null).slice(0, 12)
      : []
    const wins = Array.isArray(ar.wins)
      ? ar.wins.filter((s): s is string => typeof s === 'string').slice(0, 12)
      : []
    axes[axis] = { score, findings, wins }
  }
  const overall = typeof r.overall === 'number' && Number.isFinite(r.overall) ? clamp(r.overall) : null
  const letter = overall != null ? letterFor(overall) : null
  const headline = typeof r.headline === 'string' ? r.headline : ''
  const computedAt = typeof r.computedAt === 'string' ? r.computedAt : new Date(0).toISOString()
  return { overall, letter, axes, headline, computedAt }
}
