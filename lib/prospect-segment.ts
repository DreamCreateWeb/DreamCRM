import { isWebsiteUnread, type OutreachSegment, type ProspectAiVerdict, type ProspectCrawlSignals } from '@/lib/types/prospecting'

/**
 * Segment router — which pitch a prospect gets. Pure + client-safe; the
 * auto-enroll pass and manual enrolls (when no sequence is specified) both
 * route through this so a no-website practice never receives the
 * "rebuild your site" email and a healthy-site practice never gets
 * "patients can't find you".
 *
 * v1 routes on the verdict alone; `signals` is accepted for future
 * refinement (e.g. splitting weak_presence by dead-social vs low-reviews).
 */
export function segmentForProspect(
  verdict: ProspectAiVerdict | null,
  _signals?: ProspectCrawlSignals | null,
): OutreachSegment {
  if (!verdict || !verdict.hasWebsite) return 'no_website'
  // A website nobody read (X1) is never "weak" on a placeholder 0: the
  // generic presence pitch, which claims nothing about the site.
  if (isWebsiteUnread(verdict)) return 'weak_presence'
  if (verdict.websiteQuality < 40) return 'weak_website'
  return 'weak_presence'
}
