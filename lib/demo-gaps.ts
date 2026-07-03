import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'

/**
 * Beat ↔ gap mapping — pure + client-safe. Turns a prospect's verified
 * weaknesses into DEMO AMMUNITION: which beat of the live-demo script each
 * gap should land on ("no online booking → hammer the Appointments beat").
 *
 * Two sources, deterministic first: hard crawl/Places signals produce exact
 * labels; AI-verdict weaknesses (free text) route through a keyword table.
 * The presenter panel calls groupGapsByBeat on the plain cookie strings, so
 * the cookie stays small (strings only, no structure).
 */

export interface DemoGap {
  beatId: string
  label: string
  source: 'signal' | 'ai'
}

// First match wins, top-down. Fallback: website (it's what we sell first).
const BEAT_KEYWORDS: Array<[RegExp, string]> = [
  [/book|booking|schedul|appointment request/i, 'appointments'],
  // NOTE: no 'slow' here — "slow site" falls through to the website
  // fallback anyway, while "slow to respond" must reach the messages row.
  [
    /mobile|responsive|outdated|stale|copyright|design|https|ssl|wix|godaddy|squarespace|weebly|wordpress|website/i,
    'website',
  ],
  [/review|rating|reputation|google|social|facebook|instagram/i, 'reviews'],
  [/seo|search|meta description|title tag|visibility|analytics/i, 'analytics'],
  [/respond|reply|contact|inbox|email|message|communicat/i, 'messages'],
]

export function mapWeaknessToBeat(weakness: string): string {
  for (const [pattern, beatId] of BEAT_KEYWORDS) {
    if (pattern.test(weakness)) return beatId
  }
  return 'website'
}

/** Cookie strings → { beatId: labels[] } for the panel's ⚠ callouts. */
export function groupGapsByBeat(weaknesses: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const w of weaknesses) {
    const beat = mapWeaknessToBeat(w)
    ;(out[beat] ??= []).push(w)
  }
  return out
}

const DIY_BUILDERS = new Set(['wix', 'godaddy', 'squarespace', 'weebly'])

/**
 * The full ammunition list for a prospect — deterministic signal gaps first
 * (exact, provable), then AI weaknesses that don't duplicate them. Deduped
 * by beat+lowercased label, labels ≤80 chars.
 */
export function deriveDemoGaps(
  signals: ProspectCrawlSignals | null,
  verdict: ProspectAiVerdict | null,
  places?: { ratingTenths?: number | null; reviewCount?: number | null },
  currentYear = new Date().getFullYear(),
): DemoGap[] {
  const gaps: DemoGap[] = []
  const push = (beatId: string, label: string, source: 'signal' | 'ai') => {
    const trimmed = label.trim().slice(0, 80)
    if (!trimmed) return
    const key = `${beatId}|${trimmed.toLowerCase()}`
    if (gaps.some((g) => `${g.beatId}|${g.label.toLowerCase()}` === key)) return
    gaps.push({ beatId, label: trimmed, source })
  }

  if (verdict && !verdict.hasWebsite) {
    push('website', 'No website at all', 'signal')
  }
  if (signals) {
    if (!signals.bookingWidget) push('appointments', 'No online booking today', 'signal')
    if (!signals.mobileViewport) push('website', "Site isn't mobile-friendly", 'signal')
    if (signals.copyrightYear != null && signals.copyrightYear < currentYear - 1) {
      push('website', `Footer says ${signals.copyrightYear}`, 'signal')
    }
    if (!signals.ssl) push('website', 'No HTTPS', 'signal')
    if (signals.builder && DIY_BUILDERS.has(signals.builder)) {
      push('website', `DIY ${signals.builder} site`, 'signal')
    }
    if (Object.values(signals.socialLinks).filter(Boolean).length === 0) {
      push('reviews', 'No social presence linked', 'signal')
    }
  }
  if (places) {
    if (places.ratingTenths != null && places.ratingTenths < 42) {
      push('reviews', `Google rating ${(places.ratingTenths / 10).toFixed(1)}★`, 'signal')
    }
    if (places.reviewCount != null && places.reviewCount < 50) {
      push('reviews', `Only ${places.reviewCount} Google reviews`, 'signal')
    }
  }
  for (const w of verdict?.weaknesses ?? []) {
    push(mapWeaknessToBeat(w), w, 'ai')
  }
  return gaps
}
