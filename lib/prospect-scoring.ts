import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import type { ProspectScoreBand } from '@/lib/db/schema/prospecting'

/**
 * Deterministic opportunity scoring — pure math over the (AI or heuristic)
 * verdict + Places data. The AI judges the WEBSITE; this function decides
 * the SCORE, so the ranking logic is unit-testable and never drifts with a
 * model change.
 *
 * The ladder mirrors what Dream Create sells (websites + CRM + social):
 *   no website at all   → 90–100 (hot)   — they need everything
 *   bad website (<40)   → 65–89  (warm+) — replace it
 *   decent site, gaps   → 40–64          — booking/social/reviews upsell
 *   dialed-in practice  → <40   (low)
 */

export interface ScoreInput {
  verdict: ProspectAiVerdict
  reviewCount: number | null
  ratingTenths: number | null
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

export function computeOpportunityScore(input: ScoreInput): ScoreResult {
  const { verdict, reviewCount, ratingTenths } = input
  const reasons: string[] = []
  let score: number

  const fewReviews = reviewCount != null && reviewCount < 20
  const weakRating = ratingTenths != null && ratingTenths < 40

  if (!verdict.hasWebsite) {
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

  score = Math.max(0, Math.min(100, score))
  return { score, band: bandForScore(score), reasons: reasons.slice(0, 5) }
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
