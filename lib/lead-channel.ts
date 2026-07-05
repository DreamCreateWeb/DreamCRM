// Pure lead-channel classifier — buckets a website lead's captured attribution
// (utm_source / utm_medium / document.referrer, all optional) into the six
// channels a clinic owner actually thinks in. Client-safe, no imports; used by
// the analytics service and unit-tested directly.

export type LeadChannel = 'search' | 'paid' | 'social' | 'email' | 'referral' | 'direct'

/** Owner-facing labels, in the order channels are worth talking about. */
export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  search: 'Search (Google & others)',
  paid: 'Paid ads',
  social: 'Social media',
  email: 'Email',
  referral: 'Other websites',
  direct: 'Direct / typed in',
}

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave)\.[a-z.]+$/i
const SOCIAL_HOSTS =
  /(^|\.)(facebook|instagram|fb|tiktok|linkedin|twitter|x|t|youtube|pinterest|nextdoor|reddit|threads)\.(com|me|co|net|org)$/i
const PAID_MEDIUM = /^(cpc|ppc|paid|paid[-_]?social|paid[-_]?search|display|ads?)$/i
const PAID_SOURCE = /(ads|adwords)$/i
const SOCIAL_SOURCE = /^(facebook|instagram|fb|ig|tiktok|linkedin|twitter|x|youtube|pinterest|nextdoor|reddit|threads|social)$/i
const SEARCH_SOURCE = /^(google|bing|duckduckgo|yahoo|ecosia|brave)$/i
const EMAIL_HINT = /^(email|e-mail|newsletter)$/i

function refHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname.replace(/^www\./i, '')
  } catch {
    return null
  }
}

/**
 * Classify one lead's attribution. Precedence: paid beats everything (a
 * Facebook ad is "paid", not "social"), then email, then social, then search,
 * then any other referring site, then direct. Junk-tolerant — malformed
 * referrers and unknown UTM values degrade gracefully.
 */
export function classifyLeadChannel(a: {
  utmSource?: string | null
  utmMedium?: string | null
  referrer?: string | null
}): LeadChannel {
  const source = (a.utmSource ?? '').trim().toLowerCase()
  const medium = (a.utmMedium ?? '').trim().toLowerCase()
  const host = refHost(a.referrer)

  if (PAID_MEDIUM.test(medium) || PAID_SOURCE.test(source)) return 'paid'
  if (EMAIL_HINT.test(medium) || EMAIL_HINT.test(source)) return 'email'
  if (SOCIAL_SOURCE.test(source) || (host && SOCIAL_HOSTS.test(host))) return 'social'
  if (SEARCH_SOURCE.test(source) || (host && SEARCH_HOSTS.test(host))) return 'search'
  if (host) return 'referral'
  if (source) return 'referral' // some unknown tagged source — still not typed-in
  return 'direct'
}

/** Aggregate a window of leads into ranked channel counts (zero rows omitted). */
export function countLeadChannels(
  leads: Array<{ utmSource?: string | null; utmMedium?: string | null; referrer?: string | null }>,
): Array<{ channel: LeadChannel; count: number }> {
  const counts = new Map<LeadChannel, number>()
  for (const l of leads) {
    const c = classifyLeadChannel(l)
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count)
}
