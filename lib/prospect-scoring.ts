import type { ProspectAiVerdict, ProspectCrawlSignals, PracticeSize } from '@/lib/types/prospecting'
import { BUILDER_LABELS, DIY_BUILDERS, TEMPLATE_VENDOR_BUILDERS } from '@/lib/types/prospecting'
import type { ProspectScoreBand } from '@/lib/db/schema/prospecting'
import { newPracticeSentence, formatMonthYear } from '@/lib/prospect-fit'

/**
 * Deterministic opportunity scoring — pure math over the (AI or heuristic)
 * verdict + Places data + what the crawl and the registry already told us.
 * The AI judges the WEBSITE; this function decides the SCORE, so the
 * ranking logic is unit-testable and never drifts with a model change.
 *
 * The ladder mirrors what Dream Create sells (websites + CRM + social):
 *   no website at all   → 92–100 (hot)   — they need everything
 *   bad website (<40)   → 65–89  (warm+) — replace it
 *   decent site, gaps   → 30–89          — booking/social/reviews upsell
 *   dialed-in practice  → <40   (low)
 *
 * THE P-04 WEIGHTS ("needs us" gets what we already fetch — never a new
 * request), applied after the ladder, website branches capped at 89 so a
 * practice with no website is always the hottest kind:
 *
 *   new practice (NPPES enumerated < 18 months)   +8   (+4 with no website)
 *   no booking widget and no review engine on
 *     the site AND the verdict says no booking    +6   "a phone number is
 *                                                       their only door"
 *   each competitor stack tool fingerprinted      −5   floor −15
 *   DIY builder (Wix / Squarespace / GoDaddy /
 *     Weebly)                                     +5
 *   dental template vendor (ProSites / PBHS /
 *     Officite / TNT Dental)                      +4
 *   a group practice (≥5 dentists, registry)     −10   deprioritised, never
 *                                                       excluded (owner ruling)
 *
 * The stack is only judged when the crawl LOOKED (`stack` is an array);
 * an older crawl without it moves nothing.
 */

export const OPPORTUNITY_WEIGHTS = {
  newPractice: 8,
  newPracticeNoSite: 4,
  noStack: 6,
  stackTool: -5,
  stackFloor: -15,
  diyBuilder: 5,
  templateVendor: 4,
  groupPractice: -10,
  /** A practice with a website never beats one without. */
  websiteCap: 89,
} as const

export interface ScoreInput {
  verdict: ProspectAiVerdict
  reviewCount: number | null
  ratingTenths: number | null
  /** The competitor stack the crawl fingerprinted (P-04); undefined /
   *  null = the crawl did not look. */
  stack?: string[] | null
  /** The site builder the crawl fingerprinted (a BUILDER_LABELS key). */
  builder?: string | null
  /** The NPPES enumeration date when the registry says the practice is
   *  NEW (< 18 months); null / undefined otherwise. */
  openedAt?: string | null
  /** The registry's read of the practice size. */
  practiceSize?: PracticeSize | null
}

export interface ScoreResult {
  score: number
  band: ProspectScoreBand
  reasons: string[]
}

export function bandForScore(score: number): ProspectScoreBand {
  if (score >= 80) return 'hot'
  if (score >= 60) return 'warm'
  if (score >= 40) return 'cool'
  return 'low'
}

/** "Already on NexHealth + Birdeye" — at most three named. */
export function stackSentence(stack: string[]): string {
  const named = stack.slice(0, 3).join(' + ')
  const more = stack.length > 3 ? ` + ${stack.length - 3} more` : ''
  return `Already on ${named}${more}`
}

export function computeOpportunityScore(input: ScoreInput): ScoreResult {
  const { verdict, reviewCount, ratingTenths } = input
  const reasons: string[] = []
  let score: number

  const fewReviews = reviewCount != null && reviewCount < 20
  const weakRating = ratingTenths != null && ratingTenths < 40
  const hasWebsite = verdict.hasWebsite

  if (!hasWebsite) {
    score = 92
    reasons.push('No website at all — needs everything we sell')
    if (fewReviews) {
      score += 4
      reasons.push(`Barely visible on Google (${reviewCount} reviews)`)
    }
    if (weakRating || ratingTenths == null) {
      score += 4
      if (weakRating) reasons.push(`Google rating ${(ratingTenths! / 10).toFixed(1)}★`)
    }
  } else if (verdict.websiteQuality < 40) {
    // 65 at quality 39 … 85 at quality 0.
    score = 65 + Math.round((40 - verdict.websiteQuality) * 0.5)
    reasons.push(`Weak website (${verdict.websiteQuality}/100)`)
    reasons.push(...verdict.websiteReasons.slice(0, 2))
    if (!verdict.onlineBooking) {
      score += 5
      reasons.push('No online booking')
    }
    if (verdict.socialPresence < 30) {
      score += 4
      reasons.push('Social media unmanaged')
    }
    score = Math.min(89, score)
  } else {
    score = 30
    if (verdict.websiteQuality < 60) {
      score += 4
      reasons.push(`Website is just okay (${verdict.websiteQuality}/100)`)
    }
    if (!verdict.onlineBooking) {
      score += 14
      reasons.push('No online booking')
    }
    if (verdict.socialPresence < 30) {
      score += 10
      reasons.push('Social media unmanaged')
    }
    if (reviewCount != null && reviewCount < 30) {
      score += 6
      reasons.push(`Only ${reviewCount} Google reviews`)
    }
  }

  // ── P-04: what the crawl and the registry already told us ─────────────
  if (input.openedAt) {
    if (hasWebsite) {
      score += OPPORTUNITY_WEIGHTS.newPractice
      reasons.push(`Opened ${formatMonthYear(input.openedAt) ?? 'recently'} — a new practice still setting up`)
    } else {
      score += OPPORTUNITY_WEIGHTS.newPracticeNoSite
      reasons.push(newPracticeSentence(input.openedAt))
    }
  }
  if (hasWebsite && Array.isArray(input.stack)) {
    if (input.stack.length > 0) {
      score += Math.max(OPPORTUNITY_WEIGHTS.stackFloor, OPPORTUNITY_WEIGHTS.stackTool * input.stack.length)
      reasons.push(stackSentence(input.stack))
    } else if (!verdict.onlineBooking) {
      score += OPPORTUNITY_WEIGHTS.noStack
      reasons.push('No booking widget, no review engine — a phone number is their only door')
    }
  }
  if (hasWebsite && input.builder) {
    const label = BUILDER_LABELS[input.builder] ?? input.builder
    if ((DIY_BUILDERS as readonly string[]).includes(input.builder)) {
      score += OPPORTUNITY_WEIGHTS.diyBuilder
      reasons.push(`Built on ${label} — a DIY site`)
    } else if ((TEMPLATE_VENDOR_BUILDERS as readonly string[]).includes(input.builder)) {
      score += OPPORTUNITY_WEIGHTS.templateVendor
      reasons.push(`A ${label} template site`)
    }
  }
  if (input.practiceSize === 'group') {
    score += OPPORTUNITY_WEIGHTS.groupPractice
    reasons.push('A group practice — lower priority, not a chain')
  }
  if (hasWebsite) score = Math.min(OPPORTUNITY_WEIGHTS.websiteCap, score)

  score = Math.max(0, Math.min(100, score))
  return { score, band: bandForScore(score), reasons: reasons.slice(0, 6) }
}

/**
 * Heuristic verdict when the AI is unavailable/over budget — coarse but
 * honest, derived purely from crawl signals so scoring still ranks the
 * backlog. quality starts at 50 and moves on the classic tells.
 */
export function heuristicVerdict(
  signals: ProspectCrawlSignals | null,
  hasWebsite: boolean,
): ProspectAiVerdict {
  if (!hasWebsite || !signals) {
    return {
      hasWebsite: false,
      websiteQuality: 0,
      websiteReasons: [],
      socialPresence: 0,
      onlineBooking: false,
      weaknesses: hasWebsite ? [] : ['no website'],
      summary: hasWebsite ? 'Website not yet crawled.' : 'No website found.',
    }
  }
  let quality = 50
  const reasons: string[] = []
  if (!signals.ssl) {
    quality -= 20
    reasons.push('No HTTPS')
  }
  if (!signals.mobileViewport) {
    quality -= 20
    reasons.push('Not mobile-friendly')
  }
  const currentYear = new Date().getFullYear()
  if (signals.copyrightYear != null && signals.copyrightYear < currentYear - 2) {
    quality -= 15
    reasons.push(`Footer says ${signals.copyrightYear}`)
  }
  if (!signals.metaDescription) {
    quality -= 10
    reasons.push('No meta description')
  }
  if (signals.builder === 'godaddy' || signals.builder === 'weebly') quality -= 10
  else if (signals.builder && (TEMPLATE_VENDOR_BUILDERS as readonly string[]).includes(signals.builder)) quality -= 5

  const socialCount = Object.values(signals.socialLinks).filter(Boolean).length
  const socialPresence = Math.min(100, socialCount * 30)

  return {
    hasWebsite: true,
    websiteQuality: Math.max(0, Math.min(100, quality)),
    websiteReasons: reasons,
    socialPresence,
    onlineBooking: signals.bookingWidget,
    weaknesses: reasons.map((r) => r.toLowerCase()),
    summary: 'Heuristic verdict (AI unavailable).',
  }
}
